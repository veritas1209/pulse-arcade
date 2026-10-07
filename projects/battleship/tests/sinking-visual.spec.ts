import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('sinking follows impact once; historical wrecks stay hidden and damage controls extinguish fire',async({page},testInfo)=>{
 test.setTimeout(90000);await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 const result=await page.evaluate(async()=>{
  const scenePath='/src/scene.ts', {createNavalScene}=await import(/* @vite-ignore */ scenePath);
  const canvas=document.createElement('canvas');canvas.style.cssText='width:640px;height:400px';document.body.append(canvas);
  let sinkAudio=0;const scene=createNavalScene(canvas,()=>{},undefined,undefined,undefined,()=>sinkAudio++);let time=0;
  let ship={id:'test-ship',kind:'battleship',team:0,x:4,z:4,heading:0,hp:800,maxHp:800,ap:4,maxAp:4,attacked:false,moved:false,sunk:false};
  const state={you:0,turn:0,own:[],revealed:[],islands:[],visibleCells:[],recon:[]};
  const set=(ships:any[])=>scene.setState({...state,own:ships});
  const tick=(amount:number)=>{time+=amount;scene.update(amount,time);};
  // Give the real geometry worker event loop time without advancing flight time.
  const prepared=async()=>{let stable=0;for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,20));const p=scene.diagnostics().damagePreparation;if(p.status==='failed')throw new Error(p.error);if(p.status==='ready'&&p.pending===0){tick(0);if(++stable>=2)return;}else stable=0;}throw new Error('Geometry preparation timed out');};
  set([{...ship,hp:0,sunk:true}]);tick(.01);const historical=scene.diagnostics();
  set([]);set([{...ship,hp:0,sunk:true}]);tick(.01);const rereveal=scene.diagnostics();
  scene.clearEffects();set([{...ship,hp:700}]);tick(.05);const light=scene.diagnostics();
  set([{...ship,hp:80}]);tick(.05);const critical=scene.diagnostics();scene.focus(ship);for(let i=0;i<90;i++)tick(.05);scene.render();const fireImage=canvas.toDataURL();
  set([{...ship,hp:80,damageControl:true}]);tick(.05);const repaired=scene.diagnostics();
  set([{...ship,hp:80}]);
  let sunk={...ship,hp:0,sunk:true};scene.impact({x:4,z:4,by:1,sequence:77,hit:true,damage:80,blocked:false,halved:false,source:{x:8,z:8},shipId:ship.id,sunk:true,targetBefore:{...ship,hp:80}},sunk);set([sunk]);await prepared();
  tick(.05);const airborne=scene.diagnostics();
  for(let i=0;i<27;i++)tick(.05);const impact=scene.diagnostics();scene.render();const explosionImage=canvas.toDataURL();
  tick(8);const complete=scene.diagnostics();
  set([]);set([sunk]);await prepared();tick(.05);const finalReveal=scene.diagnostics();
  set([]);scene.clearEffects();ship={...ship,id:'torpedo-victim'};sunk={...ship,hp:0,sunk:true};set([{...ship,hp:80}]);scene.impact({x:4,z:4,by:1,sequence:78,kind:'torpedo',hit:true,damage:80,blocked:false,halved:false,shipId:ship.id,sunk:true,targetBefore:{...ship,hp:80}},sunk);set([sunk]);await prepared();tick(.01);const torpedo=scene.diagnostics();
  set([]);scene.clearEffects();ship={...ship,id:'approaching-victim'};sunk={...ship,hp:0,sunk:true};set([{...ship,hp:80}]);scene.setState({...state,own:[{...ship,hp:80}],torpedoes:[{id:'moving-torpedo',team:1,x:8,z:4,heading:-Math.PI/2}]});tick(.05);
  scene.impact({x:4,z:4,by:1,sequence:79,kind:'torpedo',projectileId:'moving-torpedo',hit:true,damage:80,blocked:false,halved:false,source:{x:29,z:29},shipId:ship.id,sunk:true,targetBefore:{...ship,hp:80}},sunk);set([sunk]);await prepared();tick(.05);const approaching=scene.diagnostics();for(let i=0;i<10;i++)tick(.05);const approachingLater=scene.diagnostics();for(let i=0;i<40;i++)tick(.05);const approachImpact=scene.diagnostics();
  scene.clearEffects();set([]);scene.impact({x:20,z:20,by:1,sequence:80,kind:'missile',hit:true,damage:200,blocked:false,halved:false,sunk:true});const unseenQueued=scene.diagnostics();tick(.05);const unseenImpact=scene.diagnostics();tick(7);const unseenHolding=scene.diagnostics();tick(.3);const unseenComplete=scene.diagnostics();
  scene.dispose();canvas.remove();return{unseenQueued,unseenImpact,unseenHolding,unseenComplete,approaching,approachingLater,approachImpact,historical,rereveal,light,critical,repaired,airborne,impact,complete,finalReveal,torpedo,sinkAudio,fireImage,explosionImage};
 });
 await mkdir('artifacts/sinking-worker',{recursive:true});const {fireImage,explosionImage,...metrics}=result;await writeFile('artifacts/sinking-worker/report.json',JSON.stringify(metrics,null,2));
 expect(result.historical.presentationBusy).toBe(false);expect(result.historical.sinkingShips).toEqual([]);expect(result.historical.sinkExplosionCount).toBe(0);
 expect(result.rereveal.sinkExplosionCount).toBe(0);expect(result.rereveal.sinkingShips).toEqual([]);
 expect(result.critical.fireEmitters[0].scale).toBeGreaterThan(result.light.fireEmitters[0].scale*2);expect(result.repaired.fireEmitters).toEqual([]);
 expect(result.airborne.presentationBusy).toBe(true);expect(result.airborne.sinkExplosionCount).toBe(0);
 expect(result.impact.sinkExplosionCount).toBe(1);expect(result.impact.sinkingShips).toEqual(['test-ship']);expect(result.impact.presentationBusy).toBe(true);expect(result.impact.sinkExplosions[0].size).toBeGreaterThan(2);
 expect(result.complete.presentationBusy).toBe(false);expect(result.complete.sinkingShips).toEqual([]);
 expect(result.finalReveal.sinkExplosionCount).toBe(1);expect(result.finalReveal.sinkingShips).toEqual([]);
 expect(result.sinkAudio).toBe(3);expect(result.unseenQueued.presentationBusy).toBe(true);expect(result.unseenImpact.unseenSinks[0].phase).toBe('sinking');expect(result.unseenImpact.projectiles).toEqual([]);expect(result.unseenImpact.visibleShips).toEqual([]);expect(result.unseenImpact.sinkExplosionCount).toBe(0);expect(result.unseenHolding.presentationBusy).toBe(true);expect(result.unseenComplete.presentationBusy).toBe(false);expect(result.unseenComplete.unseenSinks).toEqual([]);
 await mkdir('artifacts/shared-map',{recursive:true});for(const [name,data] of [['critical-fire',result.fireImage],['sinking-explosion',result.explosionImage]])await writeFile(`artifacts/shared-map/${testInfo.project.name}-${name}.png`,Buffer.from(data.split(',')[1],'base64'));
 expect(result.approaching.projectiles).toHaveLength(1);expect(result.approaching.projectiles[0].delivery).toBe('torpedo');expect(result.approaching.projectiles[0].duration).toBeGreaterThan(1.7);expect(result.approaching.projectiles[0].duration).toBeLessThan(2.2);expect(result.approaching.projectiles[0].position[1]).toBe(.12);expect(result.approachingLater.projectiles[0].position[1]).toBe(.12);expect(result.approachingLater.projectiles[0].position[0]).toBeLessThan(result.approaching.projectiles[0].position[0]);expect(result.approaching.sinkExplosionCount).toBe(0);expect(result.approaching.presentationBusy).toBe(true);expect(result.approachImpact.sinkExplosionCount).toBe(1);expect(result.approachImpact.projectiles).toEqual([]);
 expect(result.torpedo.projectiles).toEqual([]);expect(result.torpedo.sinkExplosionCount).toBe(1);
});
