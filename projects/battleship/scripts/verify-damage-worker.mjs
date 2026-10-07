import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Worker as Thread} from 'node:worker_threads';
import * as THREE from 'three';
import {transpileQaModule} from './transpile-qa-modules.mjs';

const output='artifacts/damage-worker-qa';fs.mkdirSync(output,{recursive:true});
transpileQaModule('src/naval/damage-preparer.ts',`${output}/damage-preparer.mjs`);
transpileQaModule('src/naval/damage-worker.ts',`${output}/damage-worker.mjs`);
fs.writeFileSync(`${output}/bootstrap.mjs`,"import {parentPort} from 'node:worker_threads';globalThis.postMessage=(message,transfers)=>parentPort.postMessage(message,transfers);await import('./damage-worker.mjs');parentPort.on('message',data=>globalThis.onmessage({data}));");
let initCount=0,jobCount=0,outputBytes=0;
class BrowserWorker {
 constructor(url){assert.equal(url.pathname.split('/').at(-1),'damage-worker.ts');this.thread=new Thread(new URL(`../${output}/bootstrap.mjs`,import.meta.url));this.thread.on('message',data=>{if(data.type==='prepared')for(const geometry of [data.result.high,data.result.low,...data.result.detached.map(part=>part.geometry),...(data.result.chunks??[]).flatMap(chunk=>[chunk.geometry,chunk.lowGeometry])])for(const attribute of Object.values(geometry.attributes))outputBytes+=attribute.array.byteLength;this.onmessage?.({data});});this.thread.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}));}
 postMessage(message,transfers){if(message.type==='init')initCount++;else jobCount++;this.thread.postMessage(message,transfers);}
 terminate(){return this.thread.terminate();}
}
globalThis.Worker=BrowserWorker;
const {createDamagePreparer,disposePreparedDamage}=await import(`../${output}/damage-preparer.mjs`);
const {buildFleetAssets,fleetGeometry,fleetDetachedGeometry}=await import(`../${output}/fleet.mjs`);
const {fractureHull}=await import(`../${output}/fracture.mjs`);
const {installSpatialRaycast,prepareSpatialRaycast}=await import(`../${output}/spatial-raycast.mjs`);
const assets=buildFleetAssets(),sourceArrays=Object.values(assets).flatMap(asset=>asset.sectors.flatMap(sector=>[sector.intact,sector.low])).flatMap(geometry=>Object.values(geometry.attributes).map(attribute=>({array:attribute.array,copy:attribute.array.slice()})));
const preparer=createDamagePreparer(assets);await preparer.ready;assert.equal(initCount,1);
const reports=[];let rayCount=0,ticks=0;const heartbeat=setInterval(()=>ticks++,5);
function equalGeometry(actual,reference){assert.deepEqual(Object.keys(actual.attributes),Object.keys(reference.attributes));for(const name of Object.keys(reference.attributes)){const actualAttribute=actual.getAttribute(name),expected=reference.getAttribute(name);assert.equal(actualAttribute.itemSize,expected.itemSize);assert.deepEqual(actualAttribute.array,expected.array,`${name} preserves source attributes`);}assert.deepEqual(actual.index?.array,reference.index?.array);assert.ok(prepareSpatialRaycast(actual).serialized,'Transferred BVH already cached before mesh install');}
function rayParity(geometry){const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(2,1,-3);mesh.rotation.set(.14,.6,-.07);mesh.scale.set(1.2,.9,1.4);mesh.updateMatrixWorld();const standard=mesh.raycast,rays=[];for(let i=0;i<70;i++){const azimuth=i*2.399,elevation=(i%17)/16*Math.PI,origin=new THREE.Vector3(Math.cos(azimuth)*Math.sin(elevation)*5,Math.cos(elevation)*5,Math.sin(azimuth)*Math.sin(elevation)*5).add(mesh.position),target=new THREE.Vector3(Math.sin(i)*.1,Math.cos(i*.4)*.2,Math.sin(i*.7)*.7).add(mesh.position);rays.push(new THREE.Raycaster(origin,target.sub(origin).normalize(),0,20));}for(const side of [THREE.DoubleSide,THREE.FrontSide,THREE.BackSide]){mesh.material.side=side;mesh.raycast=standard;const reference=rays.map(ray=>ray.intersectObject(mesh,false)[0]);installSpatialRaycast(mesh);const actual=rays.map(ray=>ray.intersectObject(mesh,false)[0]);for(let i=0;i<rays.length;i++){rayCount++;assert.equal(!!actual[i],!!reference[i]);if(reference[i]){assert.ok(Math.abs(actual[i].distance-reference[i].distance)<1e-5);assert.ok(actual[i].point.distanceTo(reference[i].point)<1e-5);}}}mesh.material.dispose();}
for(const kind of ['carrier','battleship','destroyer'])for(const fatal of [false,true]){
 const before={id:`qa-${kind}`,kind,x:4,z:8,team:0,heading:0,hp:100,maxHp:100,ap:3,maxAp:3,attacked:false,moved:false,sunk:false,damageMarks:[]},after={...before,hp:fatal?0:55,sunk:fatal,damageMarks:[{x:.23,z:-.2,seed:17}],parts:fatal?{bridge:{disabled:true,hp:0,maxHp:200}}:undefined};
 const initialTicks=ticks,start=performance.now(),prepared=await preparer.prepare(before,after),serviceMs=performance.now()-start;assert.ok(ticks>initialTicks,'Main event loop runs during worker CPU preparation');
 const expectedHigh=fleetGeometry(assets[kind],after.damageMarks,false,after.parts),expectedLow=fleetGeometry(assets[kind],after.damageMarks,true,after.parts);equalGeometry(prepared.high,expectedHigh);equalGeometry(prepared.low,expectedLow);rayParity(prepared.high);rayParity(prepared.low);
 const expectedDetached=fleetDetachedGeometry(assets[kind],[],after.damageMarks,undefined,after.parts);assert.equal(prepared.detached.length,Math.min(27,expectedDetached.length));for(let i=0;i<prepared.detached.length;i++){equalGeometry(prepared.detached[i].geometry,expectedDetached[i].geometry);assert.deepEqual(prepared.detached[i].center.toArray(),expectedDetached[i].center.toArray());}
 if(fatal){const expectedChunks=fractureHull(expectedHigh,after.damageMarks[0].z*assets[kind].fittedSize[2]/2,17);assert.equal(prepared.chunks.length,2);for(let i=0;i<2;i++){equalGeometry(prepared.chunks[i].geometry,expectedChunks[i].geometry);equalGeometry(prepared.chunks[i].lowGeometry,expectedChunks[i].lowGeometry);assert.deepEqual(prepared.chunks[i].center.toArray(),expectedChunks[i].center.toArray());rayParity(prepared.chunks[i].geometry);expectedChunks[i].geometry.dispose();expectedChunks[i].lowGeometry.dispose();}}else assert.equal(prepared.chunks,undefined);
 reports.push({kind,fatal,...prepared.metrics,serviceMs,mainThreadTicks:ticks-initialTicks});disposePreparedDamage(prepared);expectedHigh.dispose();expectedLow.dispose();for(const part of expectedDetached)part.geometry.dispose();
}
for(const source of sourceArrays)assert.deepEqual(source.array,source.copy,'Source buffers remain attached and unmodified');
const before={id:'cancel',kind:'destroyer',hp:100,maxHp:100},after={...before,hp:0,sunk:true,damageMarks:[{x:0,z:0,seed:12}]};
const cancelled=preparer.prepare(before,after);await Promise.resolve();preparer.cancelPending();await assert.rejects(cancelled,/cancelled/);assert.equal(preparer.diagnostics().pending,0);
const disposed=preparer.prepare(before,after);await Promise.resolve();preparer.dispose();await assert.rejects(disposed,/disposed|cancelled/);assert.equal(preparer.diagnostics().status,'disposed');await assert.rejects(preparer.prepare(before,after),/cancelled/);
globalThis.Worker=class{constructor(){throw new Error('unavailable for QA');}};const unavailable=createDamagePreparer(assets);await assert.rejects(unavailable.ready,/unavailable/);await assert.rejects(unavailable.prepare(before,after),/unavailable/);assert.equal(unavailable.diagnostics().status,'failed');unavailable.dispose();
clearInterval(heartbeat);const result={initCount,jobCount,cases:reports.length,rayCount,sourceBuffersPreserved:true,mainThreadResponsive:true,cancellation:true,dispose:true,explicitFailure:true,outputBytes,reports};fs.writeFileSync(`${output}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
for(const asset of Object.values(assets))for(const sector of asset.sectors)for(const geometry of Object.values(sector))geometry.dispose();
