import * as THREE from 'three';
import type {ShipKind,ShipView} from '../contract';
import type {DetachedFleetPart,FleetAsset} from './fleet';
import type {HullChunk} from './fracture';
import {geometryTransfers,hydrateGeometry,serializeFleetAsset,type FleetAssetWire} from './geometry-wire';
import type {DamageMetrics,DamageRequest,DamageResponse,DamageWire} from './damage-worker';

export interface PreparedDamage {high:THREE.BufferGeometry;low:THREE.BufferGeometry;detached:DetachedFleetPart[];chunks?:HullChunk[];metrics:DamageMetrics}
export function hydrateDamage(result:DamageWire):PreparedDamage {
 return {high:hydrateGeometry(result.high),low:hydrateGeometry(result.low),detached:result.detached.map(part=>({geometry:hydrateGeometry(part.geometry),center:new THREE.Vector3(...part.center)})),
  chunks:result.chunks?.map(chunk=>({geometry:hydrateGeometry(chunk.geometry),lowGeometry:hydrateGeometry(chunk.lowGeometry),center:new THREE.Vector3(...chunk.center),side:chunk.side,cutEdges:chunk.cutEdges,interiorVertices:chunk.interiorVertices})),metrics:result.metrics};
}
/** Dispose only unused results. Once committed, their hull cache/effects own the geometries. */
export function disposePreparedDamage(result:PreparedDamage){result.high.dispose();result.low.dispose();for(const part of result.detached)part.geometry.dispose();for(const chunk of result.chunks??[]){chunk.geometry.dispose();chunk.lowGeometry.dispose();}}
export interface DamagePreparer {
 ready:Promise<void>;
 prepare(before:ShipView,after:ShipView):Promise<PreparedDamage>;
 cancelPending():void;
 dispose():void;
 diagnostics():{status:'starting'|'ready'|'failed'|'disposed';pending:number;completed:number;cancelled:number;last:DamageMetrics|null;error:string|null};
}
/** Initialize each asset once. Jobs carry only ship state; main-thread source buffers stay attached. */
export function createDamagePreparer(assets:Record<ShipKind,FleetAsset>):DamagePreparer {
 let status:'starting'|'ready'|'failed'|'disposed'='starting',worker:Worker|undefined,nextId=1,generation=0,completed=0,cancelled=0,last:DamageMetrics|null=null,error:string|null=null;
 const pending=new Map<number,{resolve:(result:PreparedDamage)=>void;reject:(error:Error)=>void}>();
 let resolveReady!:()=>void,rejectReady!:(error:Error)=>void;
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 // Keep a rejected readiness promise observable to callers without a global unhandled rejection.
 void ready.catch(()=>{});
 function fail(message:string){if(status==='disposed')return;status='failed';error=message;const failure=new Error(message);rejectReady(failure);for(const job of pending.values())job.reject(failure);pending.clear();worker?.terminate();worker=undefined;}
 try {
  worker=new Worker(new URL('./damage-worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<DamageResponse>)=>{
   const response=event.data;if(status==='disposed')return;
   if(response.type==='ready'){status='ready';resolveReady();return;}
   if(response.type==='error'){if(response.id===undefined){fail(response.message);return;}const job=pending.get(response.id);if(job){pending.delete(response.id);job.reject(new Error(response.message));}error=response.message;return;}
   const job=pending.get(response.id);if(!job)return; // A cancelled result remains raw transferable arrays for GC.
   pending.delete(response.id);try {const start=performance.now(),result=hydrateDamage(response.result);result.metrics.hydrateMs=performance.now()-start;completed++;last=result.metrics;job.resolve(result);}catch(reason){job.reject(reason instanceof Error?reason:new Error(String(reason)));}
  };
  worker.onerror=event=>{event.preventDefault();fail(`Damage worker failed: ${event.message}`);};
  worker.onmessageerror=()=>fail('Damage worker response could not be decoded');
  const wire=Object.fromEntries(Object.entries(assets).map(([kind,asset])=>[kind,serializeFleetAsset(asset)])) as Record<ShipKind,FleetAssetWire>;
  const request:DamageRequest={type:'init',assets:wire};
  const transfers=Object.values(request.assets).flatMap(asset=>asset.sectors.flatMap(sector=>[...geometryTransfers(sector.intact),...geometryTransfers(sector.low)]));
  worker.postMessage(request,[...new Set(transfers)]);
 }catch(reason){fail(`Damage worker unavailable: ${reason instanceof Error?reason.message:String(reason)}`);}
 return {ready,
  async prepare(before,after){const requestedGeneration=generation,requestBefore=structuredClone(before),requestAfter=structuredClone(after);await ready;if(status==='disposed'||requestedGeneration!==generation)throw new Error('Damage preparation cancelled');if(status!=='ready'||!worker)throw new Error(error??'Damage worker unavailable');
   const id=nextId++;return new Promise<PreparedDamage>((resolve,reject)=>{pending.set(id,{resolve,reject});try {const request:DamageRequest={type:'prepare',id,before:requestBefore,after:requestAfter};worker!.postMessage(request);}catch(reason){pending.delete(id);reject(reason instanceof Error?reason:new Error(String(reason)));}});
  },
  cancelPending(){generation++;cancelled+=pending.size;for(const job of pending.values())job.reject(new Error('Damage preparation cancelled'));pending.clear();},
  dispose(){if(status==='disposed')return;generation++;cancelled+=pending.size;const failure=new Error('Damage preparation disposed');for(const job of pending.values())job.reject(failure);pending.clear();rejectReady(failure);worker?.terminate();worker=undefined;status='disposed';},
  diagnostics(){return {status,pending:pending.size,completed,cancelled,last,error};}
 };
}
