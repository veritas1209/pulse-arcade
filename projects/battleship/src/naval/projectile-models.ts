import * as THREE from 'three';
import {externalProjectiles} from './generated/projectiles-external';
export const PROJECTILE_METRES_PER_WORLD=84.583;
export const ARTILLERY_SHELL_METRES=1.62;
export const CRUISE_MISSILE_METRES=5.56;
export type ProjectileModelOptions={readabilityScale?:number};
type ProjectileKind='shell'|'missile';
const bases:Partial<Record<ProjectileKind,THREE.BufferGeometry>>={};
function build(kind:ProjectileKind,options:ProjectileModelOptions){let base=bases[kind];if(!base){
 const bytes=Uint8Array.from(atob(externalProjectiles[kind]),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),count=bytes.length/externalProjectiles.stride,position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3);
 for(let i=0;i<count;i++)for(let j=0;j<3;j++){const at=i*externalProjectiles.stride;position[i*3+j]=view.getFloat32(at+j*4,true);normal[i*3+j]=view.getInt8(at+12+j)/127;color[i*3+j]=view.getUint8(at+15+j)/255;}
 base=new THREE.BufferGeometry();base.setAttribute('position',new THREE.BufferAttribute(position,3));base.setAttribute('normal',new THREE.BufferAttribute(normal,3));base.setAttribute('color',new THREE.BufferAttribute(color,3));base.normalizeNormals();base.computeBoundingBox();base.computeBoundingSphere();bases[kind]=base;
 }
 const requested=options.readabilityScale??1,readability=THREE.MathUtils.clamp(Number.isFinite(requested)?requested:1,1,kind==='shell'?4:2.5),physicalLength=kind==='shell'?ARTILLERY_SHELL_METRES:CRUISE_MISSILE_METRES,geometry=base.clone();geometry.scale(physicalLength/PROJECTILE_METRES_PER_WORLD*readability,physicalLength/PROJECTILE_METRES_PER_WORLD*readability,physicalLength/PROJECTILE_METRES_PER_WORLD*readability);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData={source:kind==='shell'?'Polyfork / Lucas Martinic':'Abbott Animation',sourceUrl:kind==='shell'?'https://polyfork.dev/asset/artillery-shell-0870bc':'https://www.abbottanimation.com/AABlog/free-tomahawk-missile-for-download/',externalAsset:true,license:kind==='shell'?'Polyfork free commercial game-use license':'Abbott free digital military use permission',publisherDisclosesAI:kind==='shell',nose:'+Z',up:'+Y',physicalLengthMetres:physicalLength,readabilityScale:readability,triangles:geometry.getAttribute('position').count/3};return geometry;
}
/** Owned, centered geometry. Source projectile only: the brass case is excluded.
 * +Z nose, +Y up. Use a shared vertexColors material / InstancedMesh.
 * Physical 1.62m length, optional uniform readability scale capped at 4. */
export function buildArtilleryShell(options:ProjectileModelOptions={}){return build('shell',options);}
/** Owned, centered external Tomahawk geometry, preserving wings/intake/tail.
 * +Z nose, +Y up. Physical 5.56m length; readability capped at 2.5.
 * Engine glow/trail belongs to effects.ts and is not baked into the mesh. */
export function buildCruiseMissile(options:ProjectileModelOptions={}){return build('missile',options);}
