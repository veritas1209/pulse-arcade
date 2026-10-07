import * as THREE from 'three';
import type {FleetAsset,FleetPart} from './fleet';
import {restoreSpatialRaycast,serializeSpatialRaycast,type SerializedSpatialTree} from './spatial-raycast';

export type Vec3Tuple=[number,number,number];
export interface GeometryWire {
 attributes:Record<string,{array:Float32Array;itemSize:number;normalized:boolean}>;
 index?:Uint16Array|Uint32Array;
 box?:{min:Vec3Tuple;max:Vec3Tuple};
 sphere?:{center:Vec3Tuple;radius:number};
 groups:{start:number;count:number;materialIndex?:number}[];
 drawRange:{start:number;count:number};
 spatial?:SerializedSpatialTree;
}
export interface FleetAssetWire extends Omit<FleetAsset,'parts'|'sectors'> {
 parts:(Omit<FleetPart,'bounds'>&{bounds:{min:Vec3Tuple;max:Vec3Tuple}})[];
 sectors:{intact:GeometryWire;low:GeometryWire}[];
}

/** Clone source arrays for initialization; transfer only arrays owned by this job on return. */
export function serializeGeometry(geometry:THREE.BufferGeometry,clone=false,spatial=false):GeometryWire {
 const attributes:GeometryWire['attributes']={};
 for(const [name,attribute] of Object.entries(geometry.attributes)){
  let array:Float32Array;
  if(attribute instanceof THREE.BufferAttribute&&attribute.array instanceof Float32Array)array=clone?attribute.array.slice():attribute.array;
  else {array=new Float32Array(attribute.count*attribute.itemSize);for(let i=0;i<attribute.count;i++)for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute.getComponent(i,j);}
  attributes[name]={array,itemSize:attribute.itemSize,normalized:attribute.normalized};
 }
 if(!geometry.boundingBox)geometry.computeBoundingBox();
 if(!geometry.boundingSphere)geometry.computeBoundingSphere();
 const index=geometry.index?geometry.index.array instanceof Uint16Array?geometry.index.array:Uint32Array.from(geometry.index.array):undefined;
 return {attributes,index:index&&clone?index.slice():index,box:geometry.boundingBox?{min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray()}:undefined,
  sphere:geometry.boundingSphere?{center:geometry.boundingSphere.center.toArray(),radius:geometry.boundingSphere.radius}:undefined,
  groups:geometry.groups.map(group=>({...group})),drawRange:{...geometry.drawRange},spatial:spatial?serializeSpatialRaycast(geometry):undefined};
}
export function hydrateGeometry(wire:GeometryWire):THREE.BufferGeometry {
 const geometry=new THREE.BufferGeometry();
 for(const [name,attribute] of Object.entries(wire.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized));
 if(wire.index)geometry.setIndex(new THREE.BufferAttribute(wire.index,1));
 if(wire.box)geometry.boundingBox=new THREE.Box3(new THREE.Vector3(...wire.box.min),new THREE.Vector3(...wire.box.max));
 if(wire.sphere)geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(...wire.sphere.center),wire.sphere.radius);
 for(const group of wire.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
 geometry.setDrawRange(wire.drawRange.start,wire.drawRange.count);
 if(wire.spatial)restoreSpatialRaycast(geometry,wire.spatial);
 return geometry;
}
export function geometryTransfers(wire:GeometryWire):ArrayBuffer[] {
 const buffers=new Set<ArrayBuffer>();
 for(const attribute of Object.values(wire.attributes))buffers.add(attribute.array.buffer as ArrayBuffer);
 if(wire.index)buffers.add(wire.index.buffer as ArrayBuffer);
 if(wire.spatial)for(const array of [wire.spatial.order,wire.spatial.bounds,wire.spatial.ranges,wire.spatial.children])buffers.add(array.buffer as ArrayBuffer);
 return [...buffers];
}
export function serializeFleetAsset(asset:FleetAsset):FleetAssetWire {
 const {parts,sectors,...metadata}=asset;
 return {...metadata,parts:parts.map(part=>({...part,bounds:{min:part.bounds.min.toArray(),max:part.bounds.max.toArray()}})),
  sectors:sectors.map(sector=>({intact:serializeGeometry(sector.intact,true),low:serializeGeometry(sector.low,true)}))};
}
export function hydrateFleetAsset(wire:FleetAssetWire):FleetAsset {
 const {parts,sectors,...metadata}=wire;
 return {...metadata,parts:parts.map(part=>({...part,bounds:new THREE.Box3(new THREE.Vector3(...part.bounds.min),new THREE.Vector3(...part.bounds.max))})),
  sectors:sectors.map(sector=>({intact:hydrateGeometry(sector.intact),low:hydrateGeometry(sector.low),wreck:new THREE.BufferGeometry(),fragment:new THREE.BufferGeometry()}))};
}
