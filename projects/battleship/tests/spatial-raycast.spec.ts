import {test,expect} from '@playwright/test';
test('spatial raycasts preserve nearest rendered surface and side filtering',async({page})=>{
 await page.route('**/spatial-raycast-qa',r=>r.fulfill({contentType:'text/html',body:`<script type="module">
 import * as T from '/node_modules/three/build/three.module.js';import{buildFleetAssets,fleetGeometry}from'/src/naval/fleet.ts';import{installSpatialRaycast}from'/src/naval/spatial-raycast.ts';
 const assets=buildFleetAssets(),errors=[],metrics=[];let rays=0;const original=T.Mesh.prototype.raycast;
 for(const kind of ['carrier','battleship','destroyer'])for(const damaged of [false,true])for(const low of [false,true]){
 const g=fleetGeometry(assets[kind],damaged?[{x:.23,z:-.2,seed:17},{x:-.1,z:.3,seed:29}]:[],low),m=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));m.position.set(5,2,-7);m.rotation.set(.1,.7,-.05);m.scale.set(1.2,.9,1.3);m.updateMatrixWorld();
 const queries=[];for(let i=0;i<120;i++){const a=i*2.399,b=(i%23)/22*Math.PI,origin=new T.Vector3(Math.cos(a)*Math.sin(b)*6,Math.cos(b)*6,Math.sin(a)*Math.sin(b)*6).add(m.position),target=new T.Vector3(Math.sin(i)*.3,Math.cos(i*.4)*.3,Math.sin(i*.7)).add(m.position);queries.push(new T.Raycaster(origin,target.sub(origin).normalize(),0,20));}
 const before=performance.now(),reference=queries.map(ray=>ray.intersectObject(m,false)[0]);const standard=performance.now()-before;installSpatialRaycast(m);const fastStart=performance.now(),actual=queries.map(ray=>ray.intersectObject(m,false)[0]);const accelerated=performance.now()-fastStart;metrics.push({kind,damaged,low,standard,accelerated});
 for(let i=0;i<queries.length;i++){rays++;if(!!reference[i]!==!!actual[i]||reference[i]&&Math.abs(reference[i].distance-actual[i].distance)>1e-5)errors.push({kind,damaged,low,i,reference:reference[i]?.distance,actual:actual[i]?.distance});}
 // Front-side culling, finite far distance, and inside-origin queries.
 m.material.side=T.FrontSide;for(const ray of queries.slice(0,10)){m.raycast=original;const a=ray.intersectObject(m,false)[0];installSpatialRaycast(m);const b=ray.intersectObject(m,false)[0];if(!!a!==!!b||a&&Math.abs(a.distance-b.distance)>1e-5)errors.push('side');}
 g.dispose();m.material.dispose();}
 window.result={rays,errors,metrics};</script>`}));
 await page.goto('/spatial-raycast-qa');await page.waitForFunction(()=>(window as any).result);const result=await page.evaluate(()=>(window as any).result);expect(result.errors).toEqual([]);expect(result.rays).toBe(1440);await test.info().attach('spatial-raycast-parity',{body:JSON.stringify(result,null,2),contentType:'application/json'});console.log(JSON.stringify(result));
});
