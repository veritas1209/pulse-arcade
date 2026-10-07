import * as THREE from 'three';
import {externalTorpedo} from './generated/torpedo-external';

export const TORPEDO_METRES=5.8;
export const TORPEDO_WORLD_LENGTH=TORPEDO_METRES/84.58;
export const TORPEDO_MAX_READABILITY_SCALE=2.5;
const bases:Partial<Record<'high'|'low',THREE.BufferGeometry>>={};

/** External CC0 3DAssets.dev asset36497. Nose -Z, up +Y, centred pivot.
 * Source body/fins/propeller only; loading cradle and straps are excluded.
 * Single material with vertexColors:true; no runtime fetch or texture required.
 * Returns an owned clone, suitable for a shared InstancedMesh geometry.
 * Default is physical 5.8m length. Optional uniform readability scale is capped
 * at2.5 (14.5m apparent length), never changes the collision/gameplay footprint. */
export function buildTorpedo(options:{low?:boolean;readabilityScale?:number}={}){
 const variant=options.low?'low':'high';let base=bases[variant];
 if(!base){
  const bytes=Uint8Array.from(atob(externalTorpedo[variant]),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),count=bytes.length/externalTorpedo.stride;
  const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3);
  for(let i=0;i<count;i++)for(let j=0;j<3;j++){const at=i*externalTorpedo.stride;position[i*3+j]=view.getFloat32(at+j*4,true);normal[i*3+j]=view.getInt8(at+12+j)/127;color[i*3+j]=view.getUint8(at+15+j)/255;}
  base=new THREE.BufferGeometry();base.setAttribute('position',new THREE.BufferAttribute(position,3));base.setAttribute('normal',new THREE.BufferAttribute(normal,3));base.setAttribute('color',new THREE.BufferAttribute(color,3));base.normalizeNormals();base.computeBoundingBox();base.computeBoundingSphere();
  base.userData={source:'3DAssets.dev / Torpedo on Loading Cradle / CC0-1.0',sourceUrl:'https://3dassets.dev/assets/submarine-interior-and-control-room-torpedo-on-loading-f40aecaa',publisherDisclosesAI:true,variant};bases[variant]=base;
 }
 const requested=options.readabilityScale??1,readability=THREE.MathUtils.clamp(Number.isFinite(requested)?requested:1,1,TORPEDO_MAX_READABILITY_SCALE),geometry=base.clone();
 geometry.scale(TORPEDO_WORLD_LENGTH*readability,TORPEDO_WORLD_LENGTH*readability,TORPEDO_WORLD_LENGTH*readability);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData={...base.userData,physicalLengthMetres:TORPEDO_METRES,readabilityScale:readability,triangles:geometry.getAttribute('position').count/3};return geometry;
}
