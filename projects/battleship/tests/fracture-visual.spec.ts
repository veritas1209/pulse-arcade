import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('fatal impact fractures the actual hull once and waits for the independent chunks to sink',async({page},testInfo)=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/fire-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="fire"></canvas></body></html>'}));await page.goto('/fire-fixture');
 const result=await page.evaluate(async()=>{
  const path='/src/scene.ts',{createNavalScene}=await import(/* @vite-ignore */path);const canvas=document.querySelector('canvas')!;const scene=createNavalScene(canvas,()=>{});for(let i=0;i<200&&!scene.diagnostics().texturesReady;i++)await new Promise(resolve=>setTimeout(resolve,50));if(!scene.diagnostics().texturesReady)throw new Error('Fleet material textures did not finish loading');await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));let time=1;const tick=(dt=.05)=>{time+=dt;scene.update(dt,time);};
  const carrier={id:'fire-carrier',kind:'carrier',team:0,x:14,z:14,heading:0,hp:140,maxHp:1000,ap:4,maxAp:4,attacked:false,moved:false,sunk:false,damageMarks:[{x:-.25,z:-.45,seed:23},{x:.18,z:.04,seed:51},{x:-.18,z:.5,seed:102}]};const state={you:0,turn:0,own:[carrier],revealed:[],islands:[],visibleCells:[],recon:[]};
  const waitForPreparation=async()=>{const deadline=performance.now()+30000;while((scene.diagnostics().damagePreparation as any).queued.length){if(performance.now()>deadline)throw new Error('Hull worker did not finish preparing geometry');await new Promise(resolve=>setTimeout(resolve,20));}const status=scene.diagnostics().damagePreparation as any;if(status.status!=='ready'||status.error)throw new Error(status.error??'Hull worker did not become ready');};
  scene.setState(state);await waitForPreparation();scene.focus(carrier);for(let i=0;i<90;i++)tick();const box=canvas.getBoundingClientRect();for(let i=0;i<14;i++){canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:box.width*.5,clientY:box.height*.5,bubbles:true,cancelable:true}));tick();}
  const sunk={...carrier,hp:0,sunk:true,damageMarks:[...carrier.damageMarks,{x:.1,z:.1,seed:67}]};scene.impact({x:carrier.x,z:carrier.z,sequence:88,by:1,hit:true,damage:140,blocked:false,halved:false,kind:'shell',sunk:true,localHit:{x:.1,z:.1},source:{x:15,z:15},targetBefore:carrier},sunk);scene.setState({...state,own:[sunk]});tick();const before=scene.diagnostics();for(let i=0;i<25;i++)tick();await waitForPreparation();const atImpact=scene.diagnostics();for(let i=0;i<21;i++)tick();scene.render();const early=scene.diagnostics(),firstImage=canvas.toDataURL();for(let i=0;i<25;i++)tick();scene.render();const later=scene.diagnostics(),laterImage=canvas.toDataURL();for(let i=0;i<120;i++)tick();scene.render();const done=scene.diagnostics(),doneImage=canvas.toDataURL();scene.setState({...state,own:[]});scene.setState({...state,own:[sunk]});tick();const revealed=scene.diagnostics();scene.clearEffects();tick();const reset=scene.diagnostics();scene.dispose();return{before,atImpact,early,later,done,revealed,reset,firstImage,laterImage,doneImage};
 });
 expect(errors).toEqual([]);expect(result.before.fractureChunks).toEqual([]);expect(result.before.presentationBusy).toBe(true);expect(result.atImpact.fractureChunks).toHaveLength(2);expect(result.early.fractureChunks).toHaveLength(2);expect(result.early.fractureChunks.every((c:any)=>c.cutEdges>10&&c.interiorVertices>100&&c.scale.every((s:number)=>s===1))).toBe(true);expect(result.later.fractureChunks[0].rotation).not.toEqual(result.early.fractureChunks[0].rotation);expect(result.later.fractureChunks[0].position[1]).toBeLessThan(result.early.fractureChunks[0].position[1]);expect(result.later.presentationBusy).toBe(true);expect(result.done.fractureChunks).toEqual([]);expect(result.done.presentationBusy).toBe(false);expect(result.revealed.fracturedShips).toBe(1);expect(result.revealed.fractureChunks).toEqual([]);expect(result.reset.fracturedShips).toBe(0);
 const preparation=result.atImpact.damagePreparation as any;expect(preparation.status).toBe('ready');expect(preparation.pending).toBe(0);expect(preparation.completed).toBeGreaterThanOrEqual(2);expect(preparation.last.workerMs).toBeGreaterThan(0);expect(preparation.last.bvhNodes).toBeGreaterThan(0);expect(preparation.last.hydrateMs).toBeGreaterThanOrEqual(0);expect(preparation.last.commitMs).toBeGreaterThanOrEqual(0);
 await mkdir('artifacts/fracture',{recursive:true});for(const [name,data] of [['carrier-breaking',result.firstImage],['carrier-sinking',result.laterImage],['carrier-submerged',result.doneImage]])await writeFile(`artifacts/fracture/${testInfo.project.name}-${name}.png`,Buffer.from(data.split(',')[1],'base64'));await writeFile(`artifacts/fracture/${testInfo.project.name}-diagnostics.json`,JSON.stringify({early:result.early,later:result.later,done:result.done},null,2));
});


test('newly revealed damaged contacts never replay detached debris',async({page})=>{
 test.setTimeout(60000);
 await page.route('**/contact-fixture',r=>r.fulfill({contentType:'text/html',body:'<canvas style="width:100vw;height:100vh"></canvas>'}));await page.goto('/contact-fixture');
 const result=await page.evaluate(async()=>{
  const scenePath='/src/scene.ts',partsPath='/src/parts.ts';const {createNavalScene}=await import(/* @vite-ignore */scenePath),{createParts}=await import(/* @vite-ignore */partsPath);const scene=createNavalScene(document.querySelector('canvas'),()=>{});let time=1;
  const enemy={id:'contact-ddg',kind:'destroyer',team:1,x:14,z:14,heading:0,hp:300,maxHp:500,ap:4,maxAp:4,attacked:false,moved:false,sunk:false,parts:createParts('destroyer'),damageMarks:[{x:.1,z:.15,seed:38}]};const base={you:0,turn:0,own:[],revealed:[],islands:[],visibleCells:[],recon:[]};
  const reveal=async()=>{scene.setState({...base,revealed:[enemy],visibleCells:[enemy]});for(let i=0;i<500&&scene.diagnostics().damagePreparation.pending+scene.diagnostics().damagePreparation.queued.length>0;i++){await new Promise(r=>setTimeout(r,30));scene.update(.03,time+=.03);}return scene.diagnostics();};
  const first=await reveal();scene.setState(base);const second=await reveal();scene.dispose();return{first,second};
 });
 for(const d of [result.first,result.second]){expect(d.damagePreparation.pending).toBe(0);expect(d.damagePreparation.error).toBeNull();expect(d.damageMarks['contact-ddg']).toHaveLength(1);expect(d.detachedParts).toEqual([]);expect(d.sinkExplosionCount).toBe(0);}
});


test('extinguished scars stay cold in the world and contact model after a new hit or reveal',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/repaired-fire-fixture',r=>r.fulfill({contentType:'text/html',body:'<canvas id="world" style="width:800px;height:600px"></canvas><canvas id="contact" style="width:320px;height:320px"></canvas>'}));await page.goto('/repaired-fire-fixture');
 const stages=await page.evaluate(async()=>{
  const a='/src/scene.ts',b='/src/enemy-preview.ts';const {createNavalScene}=await import(/* @vite-ignore */a),{createEnemyPreview}=await import(/* @vite-ignore */b);
  const scene=createNavalScene(document.querySelector('#world'),()=>{}),panel=createEnemyPreview(document.querySelector('#contact'),scene.getFleetAssets(),scene.getFleetGeometry);let time=1;
  const old=[{x:.05,z:-.2,seed:81},{x:-.1,z:.31,seed:82}],latest={x:.1,z:0,seed:83};
  const victim={id:'repair-contact',kind:'destroyer',team:1,x:14,z:14,heading:0,hp:300,maxHp:500,ap:4,maxAp:4,attacked:false,moved:false,sunk:false,damageMarks:old};
  const base={you:0,turn:0,own:[],revealed:[],islands:[],visibleCells:[victim],recon:[]};
  const show=async(ship:typeof victim & {damageControl?:boolean;extinguishedMarkCount?:number})=>{scene.setState({...base,revealed:[ship]});const deadline=performance.now()+30000;while(scene.diagnostics().damagePreparation.pending+scene.diagnostics().damagePreparation.queued.length){if(performance.now()>deadline)throw Error('Preparation timeout');await new Promise(r=>setTimeout(r,20));scene.update(.02,time+=.02);}panel.setShip(ship);scene.update(.05,time+=.05);panel.update(.05,time);return {world:scene.diagnostics(),panel:panel.diagnostics()};};
  const burning=await show(victim),cold=await show({...victim,hp:350,damageControl:true,extinguishedMarkCount:2}),hit={...victim,hp:150,damageControl:false,extinguishedMarkCount:2,damageMarks:[...old,latest]},reHit=await show(hit);
  scene.setState(base);panel.setShip(undefined);const revealed=await show(JSON.parse(JSON.stringify(hit)));
  // A repair at full HP can change only the fire state; the panel must still refresh.
  const repaired=await show({...hit,damageControl:true,extinguishedMarkCount:3});
  panel.dispose();scene.dispose();return{burning,cold,reHit,revealed,repaired};
 });
 expect(errors).toEqual([]);
 for(const view of [stages.burning.world,stages.burning.panel])expect(view.persistentEmitters).toBe(2);
 for(const stage of [stages.cold,stages.repaired])for(const view of [stage.world,stage.panel]){expect(view.persistentEmitters).toBe(0);expect(view.fireBodies).toBe(0);}
 for(const stage of [stages.reHit,stages.revealed])for(const view of [stage.world,stage.panel]){expect(view.persistentEmitters).toBe(1);expect(view.activeFireMarks instanceof Array?view.activeFireMarks:view.activeFireMarks['repair-contact']).toEqual([{x:.1,z:0,seed:83}]);}
 expect(stages.reHit.world.damageMarks['repair-contact']).toHaveLength(3);expect(stages.reHit.panel.damageMarks).toBe(3);
 await mkdir('artifacts/fire-control',{recursive:true});await writeFile('artifacts/fire-control/repair-rehit.json',JSON.stringify(stages,null,2));
});
