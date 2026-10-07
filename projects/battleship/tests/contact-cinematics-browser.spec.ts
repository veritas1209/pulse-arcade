import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('CIWS contact precedes detonation; close torpedo contact precedes hull fracture and sinking',async({page})=>{
 test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/contact-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>'}));await page.goto('/contact-fixture');
 const result=await page.evaluate(async()=>{
  const path='/src/scene.ts',{createNavalScene}=await import(/* @vite-ignore */path),canvas=document.querySelector('canvas')!,events:any[]=[];let time=0;
  const scene=createNavalScene(canvas,()=>{},undefined,(phase:any,shot:any)=>events.push({phase,sequence:shot.sequence,time}));
  for(let i=0;i<600&&!scene.diagnostics().texturesReady;i++)await new Promise(r=>setTimeout(r,25));
  const source={id:'source',kind:'destroyer',team:0,x:14,z:14,heading:0,hp:500,maxHp:500,ap:4,maxAp:4,sunk:false},victim={id:'victim',kind:'carrier',team:0,x:16,z:14,heading:0,hp:100,maxHp:1000,ap:4,maxAp:4,sunk:false};
  const base={you:0,turn:0,own:[source,victim],revealed:[],islands:[],visibleCells:[],recon:[]},tick=()=>{time+=.05;scene.update(.05,time);};scene.setState(base);scene.focus(source);for(let i=0;i<160;i++)tick();
  scene.impact({x:16,z:14,by:1,sequence:901,kind:'missile',source:{x:14,z:14},interceptedBy:{x:16,z:14},hit:true,damage:0,blocked:true,halved:false},victim);
  const defense:any[]=[];let tracerImage='',interceptImage='';for(let i=0;i<180;i++){tick();const d=scene.diagnostics();defense.push(d);if(!tracerImage&&d.ciwsTracers>0&&!d.interceptSmokeCount){scene.render();tracerImage=canvas.toDataURL();}if(d.interceptSmokeCount){scene.render();interceptImage=canvas.toDataURL();break;}}
  scene.clearEffects();scene.setState({...base,torpedoes:[{id:'approach',team:1,x:15,z:14,heading:Math.PI/2}]});scene.focus(source);for(let i=0;i<160;i++)tick();
  const sunk={...victim,hp:0,sunk:true};scene.impact({x:16,z:14,by:1,sequence:902,kind:'torpedo',projectileId:'approach',source:{x:15,z:14},hit:true,damage:100,blocked:false,halved:false,sunk:true,shipId:'victim',targetBefore:victim},sunk);scene.setState({...base,own:[source,sunk]});
  for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,20));const p=scene.diagnostics().damagePreparation;if(p.status==='ready'&&p.pending===0)break;}
  const approach:any[]=[];let closeImage='',contactImage='',impactImage='';for(let i=0;i<180;i++){tick();const d=scene.diagnostics();approach.push(d);if(!closeImage&&d.combatCameraStage==='flight'&&d.projectiles[0]?.remaining<.7){scene.render();closeImage=canvas.toDataURL();}if(!contactImage&&d.projectiles[0]?.contacted){scene.render();contactImage=canvas.toDataURL();}if(d.sinkExplosionCount&&d.combatCameraStageAge>.15){scene.render();impactImage=canvas.toDataURL();break;}}
  const sinking:any[]=[];for(let i=0;i<240;i++){tick();const d=scene.diagnostics();sinking.push({time,busy:d.actionBusy,stage:d.combatCameraStage,hull:d.visibleSinkingHull,chunks:d.fractureChunks.length,water:d.sinkingWater,camera:d.camera.target});if(!d.actionBusy)break;}
  const held=sinking.at(-1)!.camera;for(let i=0;i<12;i++)tick();const betweenAttacks=scene.diagnostics().camera.target;
  scene.dispose();return {held,betweenAttacks,defense,approach,sinking,events,tracerImage,interceptImage,closeImage,contactImage,impactImage};
 });
 expect(errors).toEqual([]);expect(result.tracerImage).toBeTruthy();expect(result.interceptImage).toBeTruthy();
 const burst=result.defense.find(d=>d.interceptSmokeCount);expect(burst.ciwsContacts[0].travel).toBe(burst.ciwsContacts[0].distance);expect(burst.ciwsContacts[0].distance).toBeGreaterThan(0);expect(burst.ciwsTracers).toBe(0);
 const contact=result.approach.find(d=>d.projectiles[0]?.contacted);expect(contact).toBeTruthy();expect(contact.sinkExplosionCount).toBe(0);expect(contact.sinkingShips).toEqual([]);expect(contact.shipDetail.victim.projectedPixels).toBeGreaterThan(400);
 expect(Math.hypot(result.held[0]-result.betweenAttacks[0],result.held[2]-result.betweenAttacks[2])).toBeLessThan(.01);
 const released=result.sinking.at(-1)!;expect(released.busy).toBe(false);expect(released.hull).toBe(false);expect(released.water.sources).toBeGreaterThan(0);expect(released.chunks).toBeGreaterThan(0);expect(released.stage).toBe('idle');
 expect(result.approach.filter(d=>d.projectiles.length).every(d=>d.sinkExplosionCount===0)).toBe(true);expect(result.approach.at(-1).sinkExplosionCount).toBe(1);expect(result.approach.at(-1).impactBlasts[0].name).toBe('torpedo-contact');
 await mkdir('artifacts/contact-cinematics',{recursive:true});for(const name of ['tracer','intercept','close','contact','impact']){const data=(result as any)[`${name}Image`];expect(data).toBeTruthy();await writeFile(`artifacts/contact-cinematics/${name}.png`,Buffer.from(data.split(',')[1],'base64'));}await writeFile('artifacts/contact-cinematics/report.json',JSON.stringify({errors,defense:result.defense,approach:result.approach,sinking:result.sinking,events:result.events},null,2));
});


test('hidden hit targets appear only at contact; airstrike follows missile until contact and smoke becomes a thin column',async({page})=>{
 test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/hidden-contact-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>'}));await page.goto('/hidden-contact-fixture');
 const result=await page.evaluate(async()=>{
  const path='/src/scene.ts',{createNavalScene}=await import(/* @vite-ignore */path),canvas=document.querySelector('canvas')!;let time=0;
  const scene=createNavalScene(canvas,()=>{});for(let i=0;i<600&&!scene.diagnostics().texturesReady;i++)await new Promise(r=>setTimeout(r,25));
  const source={id:'source',kind:'destroyer',team:0,x:14,z:14,heading:0,hp:500,maxHp:500,ap:4,maxAp:4,sunk:false},victim={id:'hidden-victim',kind:'battleship',team:1,x:16,z:14,heading:0,hp:800,maxHp:800,ap:4,maxAp:4,sunk:false};
  const base={you:0,turn:0,own:[source],revealed:[],islands:[],visibleCells:[],recon:[]},tick=()=>{time+=.025;scene.update(.025,time);},cases:any[]=[];
  for(const kind of ['airstrike','torpedo','missile','shell']){
   scene.clearEffects();scene.setState(base);tick();
   const before=structuredClone(victim),after={...victim,hp:600,damageControl:false,damageMarks:[{x:.8,z:.1,seed:31}]};
   scene.impact({x:16,z:14,by:0,sequence:1200+cases.length,kind,source:kind==='airstrike'?undefined:{x:14,z:14},hit:true,damage:200,blocked:false,halved:false,targetBefore:before,targetAfter:after,localHit:{x:.8,z:.1}},after);
   for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,15));const p=scene.diagnostics().damagePreparation;if(p.status==='ready'&&p.pending===0)break;}
   const approach:any[]=[],captures:any[]=[];let contactAt=-1;
   for(let i=0;i<800;i++){tick();const d=scene.diagnostics();if(contactAt<0&&d.combatCameraStage==='impact')contactAt=time;if(contactAt<0){const p=d.projectiles[0];approach.push({visible:d.visibleShips.includes(victim.id),stage:d.combatCameraStage,progress:p?1-p.remaining/p.duration:0,projectile:p?.position,camera:d.camera.position,healthBars:d.healthBars});}else if(captures.length<3&&time-contactAt>=[.2,.7,1.65][captures.length]!){scene.render();captures.push({age:time-contactAt,image:canvas.toDataURL(),diagnostics:scene.diagnostics()});if(captures.length===3)break;}}
   scene.finishAttackPresentation();scene.setState(base);cases.push({kind,approach,captures,removed:!scene.diagnostics().visibleShips.includes(victim.id)});
  }
  scene.dispose();return cases;
 });
 expect(errors).toEqual([]);await mkdir('artifacts/hidden-contact',{recursive:true});await writeFile('artifacts/hidden-contact/report.json',JSON.stringify({errors,cases:result.map(c=>({...c,captures:c.captures.map(({image,...v}:any)=>v)}))},null,2));
 for(const c of result){expect(c.approach.length).toBeGreaterThan(20);expect(c.approach.every((d:any)=>!d.visible)).toBe(true);expect(c.captures).toHaveLength(3);expect(c.captures.every((v:any)=>v.diagnostics.visibleShips.includes('hidden-victim'))).toBe(true);expect(c.removed).toBe(true);if(c.kind==='torpedo'){expect(c.captures[0].diagnostics.impactVolume.active).toBe(0);expect(c.captures[1].diagnostics.sinkingWater.spray).toBeGreaterThan(0);const at=c.captures[0].diagnostics.impactBlasts[0].position;expect(c.captures[0].diagnostics.sinkingWater.contacts[0]).toEqual(at);expect(Math.hypot(at[0]-6,at[2]+2)).toBeGreaterThan(.1);expect(Math.hypot(at[0]-6,at[2]+2)).toBeLessThan(2);const fire=c.captures[2].diagnostics.fireEmitters.find((f:any)=>f.position[0]>5);expect(Math.abs(at[2]-fire.position[2])).toBeLessThan(.1);}expect(c.captures[2].diagnostics.impactVolume.active).toBe(0);expect(c.captures[2].diagnostics.impactSmokeParticles).toBe(0);expect(c.captures[2].diagnostics.fireEmitters.length).toBeGreaterThan(0);for(const f of c.captures[2].diagnostics.fireEmitters)expect(f.smokeHeight/f.smokeWidth).toBeGreaterThan(5);
  if(c.kind==='airstrike')for(const d of c.approach.filter((d:any)=>d.progress>.85)){expect(d.stage).toBe('flight');expect(Math.hypot(...d.camera.map((v:number,i:number)=>v-d.projectile[i]))).toBeLessThan(1.2);}
  for(const v of c.captures)await writeFile(`artifacts/hidden-contact/${c.kind}-${v.age.toFixed(2)}.png`,Buffer.from(v.image.split(',')[1],'base64'));
 }
 await writeFile('artifacts/hidden-contact/report.json',JSON.stringify({errors,cases:result.map(c=>({...c,captures:c.captures.map(({image,...v}:any)=>v)}))},null,2));
});


test('target and nearby ships fire model-mounted CIWS on successful missiles and misses',async({page})=>{
 test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/fleet-ciws-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>'}));await page.goto('/fleet-ciws-fixture');
 const result=await page.evaluate(async()=>{const path='/src/scene.ts',{createNavalScene}=await import(/* @vite-ignore */path),canvas=document.querySelector('canvas')!,scene=createNavalScene(canvas,()=>{});for(let i=0;i<600&&!scene.diagnostics().texturesReady;i++)await new Promise(r=>setTimeout(r,25));let time=0;const tick=()=>{time+=.025;scene.update(.025,time);},ship=(id:string,team:number,x:number,z:number)=>({id,kind:'destroyer',team,x,z,heading:0,hp:500,maxHp:500,ap:4,maxAp:4,sunk:false}),source=ship('attacker',0,14,14),victim=ship('target',1,16,14),escort=ship('escort',1,16,16),far=ship('distant',1,25,14),base={you:0,turn:0,own:[source],revealed:[victim,escort,far],islands:[],visibleCells:[],recon:[]},cases=[];
  for(const hit of [true,false]){scene.clearEffects();scene.setState(base);for(let i=0;i<20;i++)tick();const after=hit?{...victim,hp:300,damageMarks:[{x:.3,z:.1,seed:41}]}:victim;scene.impact({x:16,z:14,by:0,sequence:1500+cases.length,kind:'missile',source:{x:14,z:14},hit,damage:hit?200:0,blocked:false,halved:false,targetBefore:victim,targetAfter:after,localHit:{x:.3,z:.1}},after);
   let firing:any;for(let i=0;i<500;i++){tick();const d=scene.diagnostics();if(d.ciwsTracers>6&&d.ciwsBatteries.some((b:any)=>b.id.startsWith('escort:'))){scene.render();firing={diagnostics:d,image:canvas.toDataURL()};break;}}
   for(let i=0;i<160;i++)tick();cases.push({hit,firing,after:scene.diagnostics()});
  }scene.dispose();return cases;
 });
 expect(errors).toEqual([]);await mkdir('artifacts/fleet-ciws',{recursive:true});for(const c of result){expect(c.firing).toBeTruthy();const d=c.firing.diagnostics;expect(d.ciwsBatteries.some((b:any)=>b.id.startsWith('target:'))).toBe(true);expect(d.ciwsBatteries.some((b:any)=>b.id.startsWith('escort:'))).toBe(true);expect(d.ciwsBatteries.some((b:any)=>b.id.startsWith('attacker:')||b.id.startsWith('distant:'))).toBe(false);for(const b of d.ciwsBatteries){const [id,mount]=b.id.split(':'),m=d.weaponMounts.vessels.find((v:any)=>v.id===id).mounts.find((m:any)=>m.id===mount);expect(Math.hypot(...b.origin.map((v:number,i:number)=>v-m.muzzle[i]))).toBeLessThan(.001);}expect(c.after.interceptSmokeCount).toBe(0);await writeFile(`artifacts/fleet-ciws/${c.hit?'hit':'miss'}.png`,Buffer.from(c.firing.image.split(',')[1],'base64'));}
 await writeFile('artifacts/fleet-ciws/report.json',JSON.stringify({errors,cases:result.map(c=>({...c,firing:{diagnostics:c.firing.diagnostics}}))},null,2));
});
