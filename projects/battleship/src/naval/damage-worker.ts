import type {ShipKind,ShipView} from '../contract';
import {fleetGeometry,fleetDetachedGeometry,type FleetAsset,type DamageMark} from './fleet';
import {fractureHull} from './fracture';
import {geometryTransfers,hydrateFleetAsset,serializeGeometry,type FleetAssetWire,type GeometryWire,type Vec3Tuple} from './geometry-wire';

export interface DamageMetrics {workerMs:number;hydrateMs?:number;commitMs?:number;highTriangles:number;lowTriangles:number;detached:number;chunks:number;bvhNodes:number}
export interface DamageWire {
 high:GeometryWire;low:GeometryWire;
 detached:{geometry:GeometryWire;center:Vec3Tuple}[];
 chunks?:{geometry:GeometryWire;lowGeometry:GeometryWire;center:Vec3Tuple;side:number;cutEdges:number;interiorVertices:number}[];
 metrics:DamageMetrics;
}
export type DamageRequest={type:'init';assets:Record<ShipKind,FleetAssetWire>}|{type:'prepare';id:number;before:ShipView;after:ShipView};
export type DamageResponse={type:'ready'}|{type:'prepared';id:number;result:DamageWire}|{type:'error';id?:number;message:string};
const marksFor=(ship:ShipView):DamageMark[]=>ship.damageMarks?.length?ship.damageMarks:ship.hp<ship.maxHp?[{x:.12,z:-.12,seed:91}]:[];

/** Runs only in the worker in production; exported for CPU correspondence checks. */
export function prepareDamageData(asset:FleetAsset,before:ShipView,after:ShipView):DamageWire {
 const start=performance.now(),marks=marksFor(after),high=fleetGeometry(asset,marks,false,after.parts),low=fleetGeometry(asset,marks,true,after.parts);
 const allDetached=fleetDetachedGeometry(asset,marksFor(before),marks, before.parts,after.parts),detached=allDetached.slice(0,27);
 for(const part of allDetached.slice(27))part.geometry.dispose();
 const lastMark=marks.at(-1)??{x:0,z:0,seed:1},chunks=after.sunk?fractureHull(high,lastMark.z*asset.fittedSize[2]/2,lastMark.seed):undefined;
 try {
  const result:DamageWire={high:serializeGeometry(high,false,true),low:serializeGeometry(low,false,true),
   detached:detached.map(part=>({geometry:serializeGeometry(part.geometry,false,true),center:part.center.toArray()})),
   chunks:chunks?.map(chunk=>({geometry:serializeGeometry(chunk.geometry,false,true),lowGeometry:serializeGeometry(chunk.lowGeometry,false,true),center:chunk.center.toArray(),side:chunk.side,cutEdges:chunk.cutEdges,interiorVertices:chunk.interiorVertices})),
   metrics:{workerMs:0,highTriangles:high.getAttribute('position').count/3,lowTriangles:low.getAttribute('position').count/3,detached:detached.length,chunks:chunks?.length??0,bvhNodes:0}};
  result.metrics.bvhNodes=damageGeometries(result).reduce((count,geometry)=>count+(geometry.spatial?.ranges.length??0)/2,0);
  result.metrics.workerMs=performance.now()-start;return result;
 } finally {
  high.dispose();low.dispose();for(const part of detached)part.geometry.dispose();for(const chunk of chunks??[]){chunk.geometry.dispose();chunk.lowGeometry.dispose();}
 }
}
export function damageGeometries(result:DamageWire):GeometryWire[]{return [result.high,result.low,...result.detached.map(part=>part.geometry),...(result.chunks??[]).flatMap(chunk=>[chunk.geometry,chunk.lowGeometry])];}
export function damageTransfers(result:DamageWire):ArrayBuffer[]{return [...new Set(damageGeometries(result).flatMap(geometryTransfers))];}

// A small structural port avoids pulling DOM/WebWorker conflicting global declarations into the app.
const port=globalThis as unknown as {document?:unknown;postMessage?:(message:DamageResponse,transfer?:ArrayBuffer[])=>void;onmessage:((event:MessageEvent<DamageRequest>)=>void)|null};
if(typeof port.document==='undefined'&&typeof port.postMessage==='function'){
 let assets:Record<ShipKind,FleetAsset>|undefined;
 port.onmessage=event=>{const request=event.data;try {
  if(request.type==='init'){if(assets)throw new Error('Damage worker assets already initialized');assets=Object.fromEntries(Object.entries(request.assets).map(([kind,asset])=>[kind,hydrateFleetAsset(asset)])) as Record<ShipKind,FleetAsset>;port.postMessage!({type:'ready'});}
  else {if(!assets)throw new Error('Damage worker is not initialized');const result=prepareDamageData(assets[request.after.kind],request.before,request.after);port.postMessage!({type:'prepared',id:request.id,result},damageTransfers(result));}
 }catch(error){port.postMessage!({type:'error',id:request.type==='prepare'?request.id:undefined,message:error instanceof Error?error.message:String(error)});}};
}
