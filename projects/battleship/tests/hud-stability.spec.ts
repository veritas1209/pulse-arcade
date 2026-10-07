import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';

test('hover preserves banner geometry; depth swaps preserve atlas ownership and paint complete near banners last',async({page})=>{
 await page.route('**/hud-stability',r=>r.fulfill({contentType:'text/html',body:`<script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {createShipOverlays} from '/src/naval/ship-overlays.ts';
 const scene=new T.Scene(),overlays=createShipOverlays(scene),camera=new T.PerspectiveCamera(46,16/9,.03,2000);camera.position.set(0,1,20);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 const frame=(hover=false,swap=false)=>{overlays.begin(1,1280,720,{showAll:true});for(const [id,z,friendly] of [['near',swap?-8:0,true],['far',swap?0:-8,false]]){overlays.addHealth(new T.Vector3(0,0,z),1,.5,friendly,true,{label:{id,kind:'battleship',name:'전함1',hp:400,maxHp:800,friendly,length:10,hovered:hover}});}overlays.end();overlays.prepare(camera);return overlays.diagnostics();};
 const before=frame(),hover=frame(true),swap=frame(false,true);window.result={before,hover,swap};overlays.dispose();window.ready=true;
 </script>`}));await page.goto('/hud-stability');await page.waitForFunction(()=>(window as any).ready);
 const {before,hover,swap}=await page.evaluate(()=>(window as any).result);const label=(s:any,id:string)=>s.fleetLabels.find((l:any)=>l.id===id);
 expect(label(before,'near').drawOrder).toBeGreaterThan(label(before,'far').drawOrder);
 expect(label(swap,'far').drawOrder).toBeGreaterThan(label(swap,'near').drawOrder);
 for(const id of ['near','far']){expect(label(hover,id)).toEqual(label(before,id));expect(label(swap,id).atlasSlot).toBe(label(before,id).atlasSlot);}
 expect(hover.healthAtlas.uploads).toBe(before.healthAtlas.uploads);expect(before.healthOverlayPriority.depthTest).toBe(false);
});

test('overlapping red and blue banners composite as whole units with the closest on top',async({page})=>{
 await page.route('**/hud-depth-pixels',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0;background:#182936"><canvas></canvas><script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {createShipOverlays} from '/src/naval/ship-overlays.ts';
 const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,450);renderer.setClearColor(0x182936);const scene=new T.Scene(),overlays=createShipOverlays(scene),camera=new T.PerspectiveCamera(46,800/450,.03,2000);camera.position.set(0,1,20);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 window.renderCase=(swap=false)=>{overlays.begin(1,800,450,{showAll:true});for(const [id,z,friendly] of [['blue',swap?-8:0,true],['red',swap?0:-8,false]])overlays.addHealth(new T.Vector3(0,0,z),1,.5,friendly,true,{label:{id,kind:'battleship',name:'전함1',hp:400,maxHp:800,friendly,length:20}});overlays.end();overlays.prepare(camera);renderer.render(scene,camera);};window.renderCase();window.ready=true;
 </script>`}));await page.goto('/hud-depth-pixels');await page.waitForFunction(()=>(window as any).ready);
 const count=(buffer:Buffer)=>{const p=PNG.sync.read(buffer);let blue=0,red=0;for(let i=0;i<p.data.length;i+=4){const [r,g,b]=p.data.subarray(i,i+3);if(b>240&&r<120&&g>150)blue++;if(r>240&&g<120&&b<130)red++;}return{blue,red};};
 const nearBlue=count(await page.locator('canvas').screenshot({path:'artifacts/lag-profile/overlap-blue-front.png'}));expect(nearBlue.blue).toBeGreaterThan(250);expect(nearBlue.red).toBeLessThan(5);
 await page.evaluate(()=>(window as any).renderCase(true));const nearRed=count(await page.locator('canvas').screenshot({path:'artifacts/lag-profile/overlap-red-front.png'}));expect(nearRed.red).toBeGreaterThan(250);expect(nearRed.blue).toBeLessThan(5);
});


test('distant icons reuse their raster while waves change projected size and hidden HP',async({page})=>{
 await page.route('**/hud-icon-cache',r=>r.fulfill({contentType:'text/html',body:`<script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import {createShipOverlays} from '/src/naval/ship-overlays.ts';
 const scene=new T.Scene(),overlays=createShipOverlays(scene),camera=new T.PerspectiveCamera(46,16/9,.03,2000);camera.position.set(0,1,20);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 const frame=(n)=>{overlays.begin(1,1280,720,{showAll:true});overlays.addHealth(new T.Vector3(0,0,-n*.01),1,.5,true,true,{label:{id:'ship',kind:'destroyer',name:'구축함1',hp:500-n,maxHp:500,friendly:true,length:1}});overlays.end();overlays.prepare(camera);return overlays.diagnostics();};
 const before=frame(0);let after;for(let n=1;n<=180;n++)after=frame(n);window.result={before,after};overlays.dispose();window.ready=true;
 </script>`}));await page.goto('/hud-icon-cache');await page.waitForFunction(()=>(window as any).ready);
 const {before,after}=await page.evaluate(()=>(window as any).result);
 expect(before.fleetLabels[0].compact).toBe(true);expect(after.fleetLabels[0].width).not.toBe(before.fleetLabels[0].width);
 expect(after.healthAtlas.paints).toBe(before.healthAtlas.paints);expect(after.healthAtlas.uploads).toBe(before.healthAtlas.uploads);
});
