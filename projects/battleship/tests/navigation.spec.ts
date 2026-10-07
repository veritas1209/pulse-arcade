import {test,expect} from '@playwright/test';
// The obsolete pivot regression must still hold with the world travel boundary.
test('current-view dolly and pan stay responsive near hulls and stop at world bounds',async({page})=>{
 await page.route('**/navigation-regression',r=>r.fulfill({contentType:'text/html',body:`<canvas id="c" style="width:360px;height:600px;touch-action:none"></canvas><script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {OrbitControls} from '/node_modules/three/examples/jsm/controls/OrbitControls.js';import {installModelNavigation} from '/src/naval/navigation.ts';import {guardNavalCamera} from '/src/naval/camera.ts';
 const element=document.querySelector('#c'),camera=new T.PerspectiveCamera(40,360/600,.01,10000),controls=new OrbitControls(camera,element);controls.enableDamping=false;controls.screenSpacePanning=true;
 const model=new T.Mesh(new T.BoxGeometry(4,4,2),new T.MeshBasicMaterial());model.updateMatrixWorld();camera.position.set(0,0,20);controls.target.set(0,0,18);controls.update();
 const guard=guardNavalCamera(camera,controls,()=>[model],{sea:-Infinity,surfaceClearance:false});const nav=installModelNavigation(camera,controls,element,2.5,(o,d)=>new T.Raycaster(o,d).intersectObject(model)[0]?.distance,{center:new T.Vector3(),maxDistance:90});
 window.pose=()=>({p:camera.position.toArray(),t:controls.target.toArray(),...nav.diagnostics(),...guard.diagnostics()});window.reset=(radius)=>{nav.stop();camera.position.set(0,0,20);controls.target.set(0,0,20-radius);guard.rebase();controls.update();};
 const loop=()=>{nav.update(1/60);controls.update();guard.update();requestAnimationFrame(loop);};loop();window.ready=true;
 </script>`}));
 await page.goto('/navigation-regression');await page.waitForFunction(()=>(window as any).ready);
 const box=(await page.locator('#c').boundingBox())!;await page.mouse.move(box.x+180,box.y+300);
 const pose=()=>page.evaluate(()=>(window as any).pose());
 const start=await pose();for(let i=0;i<12;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(16);}await page.waitForTimeout(200);const near=await pose();expect(near.p[2]).toBeLessThan(10);expect(near.p[2]).toBeGreaterThan(1.2);
 for(let i=0;i<50;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(16);}await page.waitForTimeout(200);const contact=await pose();expect(contact.collisions).toBeGreaterThan(0);expect(contact.p[2]).toBeGreaterThanOrEqual(1.21);
 const pans=[];for(const radius of [2,40]){await page.evaluate(r=>(window as any).reset(r),radius);await page.mouse.move(box.x+180,box.y+300);await page.mouse.down({button:'right'});await page.mouse.move(box.x+210,box.y+300,{steps:5});await page.mouse.up({button:'right'});pans.push((await pose()).p[0]);}expect(Math.abs(pans[0]-pans[1])).toBeLessThan(.02);expect(Math.abs(pans[0])).toBeGreaterThan(.5);
 await page.evaluate(()=>(window as any).reset(2));
 const cdp=await page.context().newCDPSession(page);const center={x:box.x+180,y:box.y+300};
 const touch=(half:number)=>[{x:center.x-half,y:center.y,id:1},{x:center.x+half,y:center.y,id:2}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(20)});
 for(const half of [25,30,35,40]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(half)});await page.waitForTimeout(16);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);const pinched=await pose();expect(pinched.p[2]).toBeLessThan(12);await cdp.detach();
 await page.evaluate(()=>(window as any).reset(2));await page.mouse.move(box.x+180,box.y+300);for(let i=0;i<90;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(8);}await page.waitForTimeout(200);const far=await pose();expect(Math.hypot(...far.p)).toBeLessThanOrEqual(90.00001);expect(Math.hypot(...far.p)).toBeGreaterThan(89);expect(far.zoomMode).toBe('bounded-free-dolly');
 for(let i=0;i<8;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(16);}await page.waitForTimeout(200);const returned=await pose();expect(returned.p[2]).toBeLessThan(far.p[2]-15);
 expect([...returned.p,...returned.t].every(Number.isFinite)).toBe(true);
 await test.info().attach('navigation-poses',{body:JSON.stringify({start,near,contact,pans,pinched,far,returned},null,2),contentType:'application/json'});
});

test('map framing has a small margin across wide and portrait cameras',async({page})=>{
 await page.route('**/camera-framing',r=>r.fulfill({contentType:'text/html',body:`<script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {frameNavalBounds} from '/src/naval/navigation.ts';
 const bounds=new T.Box3(new T.Vector3(-60,0,-60),new T.Vector3(60,8,60)),direction=new T.Vector3(.46,.91,.72);
 window.frames=[.4,.6,1,16/9,2.5].map(aspect=>{const camera=new T.PerspectiveCamera(46,aspect,.03,2000),pose=frameNavalBounds(camera,bounds,direction,1.08);camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();const corners=[];for(const x of [-60,60])for(const y of [0,8])for(const z of [-60,60])corners.push(new T.Vector3(x,y,z).project(camera).toArray());return{aspect,distance:pose.distance,corners};});window.ready=true;
 </script>`}));await page.goto('/camera-framing');await page.waitForFunction(()=>(window as any).ready);
 const frames=await page.evaluate(()=>(window as any).frames) as {aspect:number;distance:number;corners:number[][]}[];
 for(const frame of frames){const extent=Math.max(...frame.corners.flatMap(p=>[Math.abs(p[0]),Math.abs(p[1])]));expect(extent).toBeLessThan(.927);expect(extent).toBeGreaterThan(.925);expect(frame.distance).toBeLessThan(600);}
 await test.info().attach('map-framing',{body:JSON.stringify(frames,null,2),contentType:'application/json'});
});

test('a short canvas click preserves camera target and pending motion cancels at boundaries',async({page})=>{
 await page.route('**/navigation-click',r=>r.fulfill({contentType:'text/html',body:`<canvas style="width:360px;height:600px;touch-action:none"></canvas><script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {OrbitControls} from '/node_modules/three/examples/jsm/controls/OrbitControls.js';import {installModelNavigation} from '/src/naval/navigation.ts';
 const camera=new T.PerspectiveCamera(46,.6,.03,2000),element=document.querySelector('canvas'),controls=new OrbitControls(camera,element);camera.position.set(0,5,20);controls.target.set(0,4,18);controls.update();const nav=installModelNavigation(camera,controls,element,2.5,()=>100000,{center:new T.Vector3(),maxDistance:90});window.pose=()=>({p:camera.position.toArray(),t:controls.target.toArray(),...nav.diagnostics()});window.advance=()=>{for(let i=0;i<180;i++){nav.update(1/60);controls.update();}};window.ready=true;
 </script>`}));await page.goto('/navigation-click');await page.waitForFunction(()=>(window as any).ready);
 const before=await page.evaluate(()=>(window as any).pose());const box=(await page.locator('canvas').boundingBox())!;
 await page.mouse.click(box.x+180,box.y+300,{button:'right'});const clicked=await page.evaluate(()=>(window as any).pose());expect(clicked.t).toEqual(before.t);expect(clicked.p).toEqual(before.p);expect(clicked.effectivePanDistance).toBeLessThanOrEqual(49.50001);
 for(let i=0;i<40;i++){await page.mouse.wheel(0,1000);await page.evaluate(()=>(window as any).advance());}const far=await page.evaluate(()=>(window as any).pose());expect(Math.hypot(...far.p)).toBeLessThanOrEqual(90.00001);
 await page.evaluate(()=>(window as any).advance());const settled=await page.evaluate(()=>(window as any).pose());expect(settled.p).toEqual(far.p);
});

