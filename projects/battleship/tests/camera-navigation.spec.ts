import {test,expect} from '@playwright/test';

test('continuous probe prevents fast hull tunneling and preserves sea-level view direction',async({page})=>{
 await page.route('**/camera-probe',r=>r.fulfill({contentType:'text/html',body:`<canvas style="width:360px;height:600px"></canvas><script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {OrbitControls} from '/node_modules/three/examples/jsm/controls/OrbitControls.js';import {guardNavalCamera} from '/src/naval/camera.ts';
 const camera=new T.PerspectiveCamera(46,.6,.03,2000),controls=new OrbitControls(camera,document.querySelector('canvas'));controls.enableDamping=false;camera.position.set(0,3,20);controls.target.set(0,3,0);controls.update();
 const hull=new T.Mesh(new T.BoxGeometry(8,8,.2),new T.MeshBasicMaterial());hull.position.set(0,3,0);hull.updateMatrixWorld();let sea=.6;const guard=guardNavalCamera(camera,controls,()=>[hull],{seaAt:()=>sea});
 const pose=()=>({p:camera.position.toArray(),t:controls.target.toArray(),direction:camera.getWorldDirection(new T.Vector3()).toArray(),...guard.diagnostics()});
 const before=pose();camera.position.z-=40;controls.target.z-=40;guard.update();const swept=pose();
 camera.position.set(10,3,20);controls.target.set(10,2.9,0);guard.rebase();camera.lookAt(controls.target);const direction=pose().direction;camera.position.y=-10;controls.target.y-=13;guard.update();const slid=pose();sea=1.1;guard.update();const wave=pose();window.result={before,swept,direction,slid,wave};window.ready=true;
 </script>`}));await page.goto('/camera-probe');await page.waitForFunction(()=>(window as any).ready);
 const r=await page.evaluate(()=>(window as any).result);
 expect(r.swept.p[2]).toBeGreaterThanOrEqual(.31);expect(r.swept.p[2]).toBeLessThan(.34);expect(r.swept.collisions).toBeGreaterThan(0);
 expect(r.slid.p[1]).toBeGreaterThanOrEqual(.6);expect(r.wave.p[1]).toBeGreaterThanOrEqual(1.1);expect(r.wave.seaClearance).toBeGreaterThanOrEqual(0);
 for(let i=0;i<3;i++)expect(r.slid.direction[i]).toBeCloseTo(r.direction[i],5);
 expect([...r.wave.p,...r.wave.t].every(Number.isFinite)).toBe(true);
 await test.info().attach('camera-probe-poses',{body:JSON.stringify(r,null,2),contentType:'application/json'});
});
