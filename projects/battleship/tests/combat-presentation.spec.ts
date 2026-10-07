import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createCombatCamera} from '../src/naval/combat-camera';
import {createEffects} from '../src/naval/effects';
import {impactBlastProfile} from '../src/naval/weapon-vfx';
import {createImpactVolumes} from '../src/naval/impact-volume';

test('launch stays on ship, blends continuously into live projectile and restores once',()=>{
 const camera=new THREE.PerspectiveCamera(46,1.8,.01,1000),controls={target:new THREE.Vector3(),enabled:true};camera.position.set(40,20,40);camera.lookAt(controls.target);const original=camera.position.clone();
 const from=new THREE.Vector3(0,.5,0),to=new THREE.Vector3(70,.5,0),pose={position:from.clone(),direction:new THREE.Vector3(1,0,0),progress:0};
 const c=createCombatCamera(camera,controls,{projectilePose:()=>pose});c.begin(from,to,3);for(let i=0;i<120;i++)c.update(1/60,i/60);
 const launch=camera.position.clone(),cuts=c.diagnostics().combatCameraCuts;c.launched(from,to,4);expect(camera.position.distanceTo(launch)).toBe(0);
 const stages=new Set<string>();for(let i=1;i<=168;i++){pose.progress=i/240;pose.position.copy(from).lerp(to,pose.progress);const previous=camera.position.clone();c.update(1/60,i/60);stages.add(c.diagnostics().combatCameraStage);expect(camera.position.distanceTo(previous)).toBeLessThan(1.6);if(i===24){expect(c.diagnostics().combatCameraStage).toBe('launch');expect(camera.position.distanceTo(launch)).toBeLessThan(.2);}if(i===120)expect(camera.position.distanceTo(pose.position)).toBeLessThan(.7);}
 expect([...stages]).toEqual(['launch','handoff','flight']);expect(c.diagnostics().combatCameraCuts).toBe(cuts);c.impact(to);for(let i=0;i<120;i++)c.update(1/60,3+i/60);expect(c.readyToEnd()).toBe(true);c.finishShot();c.endBatch();for(let i=0;i<120;i++)c.update(1/60,5+i/60);expect(c.isActive()).toBe(false);expect(camera.position.distanceTo(original)).toBeLessThan(.01);expect(controls.enabled).toBe(true);
});

test('cancel during handoff preserves visible camera and releases controls',()=>{
 const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(),enabled:true},p={position:new THREE.Vector3(),direction:new THREE.Vector3(1,0,0),progress:.3};camera.position.set(5,3,5);const c=createCombatCamera(camera,controls,{projectilePose:()=>p});c.begin(p.position,new THREE.Vector3(40,0,0),3);c.launched(p.position,new THREE.Vector3(40,0,0),4);for(let i=0;i<50;i++)c.update(1/60,i/60);expect(c.diagnostics().combatCameraStage).toBe('handoff');const at=camera.position.clone();c.cancel();c.update(.1,2);expect(camera.position.equals(at)).toBe(true);expect(controls.enabled).toBe(true);expect(c.diagnostics().combatCameraBatchSaved).toBe(false);
});

function effectsFixture(){
 Object.assign(globalThis,{matchMedia:()=>({matches:false})});const scene=new THREE.Scene(),events:{phase:string;at:number}[]=[],camera=new THREE.PerspectiveCamera();camera.position.set(2,2,2);let time=0;
 const effects=createEffects(scene,camera,new THREE.MeshStandardMaterial(),()=>720,(phase)=>events.push({phase,at:time}));
 return {effects,events,tick(){time+=1/60;effects.update(1/60,time);},shot:{x:3,z:3,by:0,sequence:1,hit:false,damage:0,blocked:true,halved:false,kind:'missile' as const},fragment:new THREE.BoxGeometry(.1,.1,.1)};
}
test('CIWS tracer reaches missile contact before airburst and no tracers continue after it',()=>{
 const f=effectsFixture();f.effects.impact(f.shot,f.fragment,new THREE.Vector3(10,.5,0),'destroyer',new THREE.Vector3(0,.5,0),false,new THREE.Vector3(10,.5,1));let seenFlight=false;
 for(let i=0;i<420&&!f.events.some(e=>e.phase==='impact');i++){f.tick();const d=f.effects.diagnostics(),c=d.ciwsContacts[0];if(d.ciwsTracers>0&&!c?.exploded){seenFlight=true;expect(d.interceptSmokeCount).toBe(0);}if(c?.exploded){expect(c.travel).toBe(c.distance);expect(c.distance).toBeGreaterThan(0);expect(d.ciwsTracers).toBe(0);expect(d.interceptSmokeCount).toBe(1);}}
 expect(seenFlight).toBe(true);expect(f.events.map(e=>e.phase)).toEqual(['launch','impact']);f.effects.clear();f.effects.dispose();f.fragment.dispose();
});
test('torpedo contact renders before explosion and damage callback',()=>{
 const f=effectsFixture();f.effects.impact({...f.shot,kind:'torpedo',blocked:false,hit:true},f.fragment,new THREE.Vector3(1,.2,0),'destroyer',new THREE.Vector3(0,.2,0));let contact=false;
 for(let i=0;i<200&&!f.events.some(e=>e.phase==='impact');i++){f.tick();const d=f.effects.diagnostics();if(d.projectiles.some(p=>p.contacted)){contact=true;expect(f.events.some(e=>e.phase==='impact')).toBe(false);expect(d.impactBlasts).toEqual([]);}}
 expect(contact).toBe(true);expect(f.events.map(e=>e.phase)).toEqual(['launch','impact']);expect(f.effects.diagnostics().impactBlasts[0].name).toBe('torpedo-contact');expect(f.effects.diagnostics().impactVolume.active).toBe(0);expect(f.effects.diagnostics().sinkingWater.emitted).toBeGreaterThan(60);f.effects.clear();f.effects.dispose();f.fragment.dispose();
});
test('missile impact envelope is larger and outlives shell flash with bounded lobes',()=>{
 const m=impactBlastProfile('destroyer'),s=impactBlastProfile('battleship');expect(m.radius).toBeGreaterThan(s.radius*1.5);expect(m.flashSeconds).toBeGreaterThan(s.flashSeconds);expect(m.flameCount+m.smokeCount).toBeLessThanOrEqual(54);
});

 test('non-CIWS blocked shells finish without waiting for a missile tracer',()=>{
 const f=effectsFixture();f.effects.impact({...f.shot,kind:'shell'},f.fragment,new THREE.Vector3(10,.5,0),'battleship',new THREE.Vector3(0,.5,0));for(let i=0;i<400&&!f.events.some(e=>e.phase==='impact');i++)f.tick();expect(f.events.map(e=>e.phase)).toEqual(['launch','impact']);f.effects.clear();f.effects.dispose();f.fragment.dispose();
 });

test('impact volume pool is bounded, expires, and does not dispose borrowed noise',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),noise=new THREE.Data3DTexture(new Uint8Array(8),2,2,2);let disposed=0;noise.addEventListener('dispose',()=>disposed++);
 const pyro=createImpactVolumes(scene,camera,noise);for(let i=0;i<20;i++)pyro.begin(new THREE.Vector3(i,.4,0),.95,1,i,new THREE.Vector3(1,0,0));pyro.update(1.4);
 expect(pyro.diagnostics().impactVolume.active).toBe(8);expect(pyro.diagnostics().impactVolume.calls).toBe(1);expect(pyro.diagnostics().impactVolume.triangles).toBe(96);
 pyro.clear();expect(pyro.diagnostics().impactVolume.active).toBe(0);pyro.begin(new THREE.Vector3(),.6,2,1,new THREE.Vector3(1,0,0));pyro.update(3.49);expect(pyro.diagnostics().impactVolume.active).toBe(1);expect(pyro.diagnostics().impactVolume.origins[0]).toEqual([0,-.048,0]);pyro.update(3.51);expect(pyro.diagnostics().impactVolume.active).toBe(0);pyro.dispose();expect(disposed).toBe(0);noise.dispose();expect(disposed).toBe(1);
});


test('aircraft missile camera stays with the projectile through contact, then reveals the hull',()=>{
 const camera=new THREE.PerspectiveCamera(46,1.8,.01,1000),controls={target:new THREE.Vector3(),enabled:true};camera.position.set(6,3,6);
 const from=new THREE.Vector3(0,2,0),to=new THREE.Vector3(60,.4,0),pose={position:from.clone(),direction:to.clone().sub(from).normalize(),progress:0};
 const c=createCombatCamera(camera,controls,{projectilePose:()=>pose});c.begin(from,to,3);for(let i=0;i<120;i++)c.update(1/60,i/60);c.launched(from,to,4,'airstrike');
 for(let i=1;i<=240;i++){pose.progress=i/240;pose.position.copy(from).lerp(to,pose.progress);c.update(1/60,2+i/60);if(i>=210){expect(c.diagnostics().combatCameraStage).toBe('flight');expect(camera.position.distanceTo(pose.position)).toBeLessThan(.8);}}
 const contact=camera.position.clone();c.impact(to);expect(c.diagnostics().combatCameraStage).toBe('impact');expect(camera.position.distanceTo(contact)).toBe(0);for(let i=0;i<120;i++)c.update(1/60,6+i/60);expect(camera.position.distanceTo(to)).toBeGreaterThan(3);expect(c.readyToEnd()).toBe(true);
});

test('successful and missed missiles receive multi-battery CIWS fire without changing outcomes',()=>{
 for(const hit of [true,false]){const f=effectsFixture(),origins=[new THREE.Vector3(10,.5,1),new THREE.Vector3(8,.7,2),new THREE.Vector3(12,.6,-2)];f.effects.impact({...f.shot,blocked:false,halved:false,hit},f.fragment,new THREE.Vector3(10,.5,0),'destroyer',new THREE.Vector3(0,.5,0),false,origins[0],{getDefenseBatteries:()=>origins.map((muzzle,i)=>({id:`battery-${i}`,muzzle}))});let firing=false;
  for(let i=0;i<420&&!f.events.some(e=>e.phase==='impact');i++){f.tick();const d=f.effects.diagnostics();if(d.ciwsTracers>0){firing=true;expect(d.ciwsBatteries).toHaveLength(3);expect(d.ciwsBatteries.map(b=>b.origin)).toEqual(origins.map(v=>v.toArray()));}expect(d.interceptSmokeCount).toBe(0);}
  expect(firing).toBe(true);expect(f.effects.diagnostics().ciwsBursts).toBe(3);expect(f.effects.diagnostics().impactBlasts.length).toBe(hit?1:0);expect(f.events.map(e=>e.phase)).toEqual(['launch','impact']);f.effects.dispose();f.fragment.dispose();
 }
});
