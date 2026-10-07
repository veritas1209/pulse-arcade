import * as THREE from 'three';
import {WAKE_PHYSICS,type WakeBody} from './wake-physics';
import type {WakeRequest,WakeResponse} from './wake-worker';
/** Worker-owned waves persist in world space. Triple-buffered height/slopes/foam
 * reach the ocean with one transfer, without a synchronous fluid solve or decal. */
export function createShipWakes(_scene:THREE.Scene){
 const size=WAKE_PHYSICS.resolution,pixels=new Uint8Array(size*size*4);for(let i=0;i<pixels.length;i+=4)pixels[i]=pixels[i+1]=pixels[i+2]=128;
 const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);texture.name='persistent-ship-pressure-waves';texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const worker=new Worker(new URL('./wake-worker.ts',import.meta.url),{type:'module'});let busy=false,epoch=0,delta=0,reset=false,disposed=false,recycle:ArrayBuffer|undefined,terrain:{x:number;z:number}[]|undefined,terrainKey='',error:string|null=null;
 let metrics:Partial<WakeResponse['diagnostics']>={movingShipWakes:0,wakeFoamMass:0,wakeEnergy:0,wakeSteps:0,shipWakeDrawCalls:0,shipWakeTriangles:0};const bodies:WakeBody[]=[];
 worker.onmessage=(event:MessageEvent<WakeResponse>)=>{busy=false;if(disposed)return;const response=event.data;if(response.epoch!==epoch){if(response.pixels)recycle=response.pixels.buffer as ArrayBuffer;return;}if(response.pixels){recycle=texture.image.data!.buffer as ArrayBuffer;texture.image.data=response.pixels;texture.needsUpdate=true;}metrics=response.diagnostics;};
 worker.onerror=event=>{event.preventDefault();error=event.message;busy=false;console.error('Wake worker:',error);};
 return{texture,begin(_time:number){bodies.length=0;},add(id:string,position:THREE.Vector3,heading:number,width:number,length:number,speed:number){bodies.push({id,x:position.x,z:position.z,heading,width,length,speed});},setTerrain(cells:readonly {x:number;z:number}[]){const key=cells.map(c=>c.x+','+c.z).join(';');if(key!==terrainKey){terrainKey=key;terrain=cells.map(c=>({...c}));}},end(dt:number){delta=Math.min(.1,delta+dt);const active=bodies.some(b=>b.speed>.025)||(metrics.wakeEnergy??0)>1e-10||(metrics.wakeFoamMass??0)>.001||reset||!!terrain;if(busy||error||disposed||delta<(active?WAKE_PHYSICS.step:.1))return;busy=true;const request:WakeRequest={epoch,bodies:bodies.map(b=>({...b})),delta,terrain,reset,recycle};worker.postMessage(request,recycle?[recycle]:[]);delta=0;terrain=undefined;reset=false;recycle=undefined;},clear(){epoch++;reset=true;delta=0;metrics={movingShipWakes:0,wakeFoamMass:0,wakeEnergy:0};const neutral=new Uint8Array(size*size*4);for(let i=0;i<neutral.length;i+=4)neutral[i]=neutral[i+1]=neutral[i+2]=128;texture.image.data=neutral;texture.needsUpdate=true;},diagnostics(){return{...metrics,wakeWorker:true,wakeWorkerBusy:busy,wakeWorkerError:error};},dispose(){disposed=true;worker.terminate();texture.dispose();}};
}

