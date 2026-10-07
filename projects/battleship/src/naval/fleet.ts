import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildInteriorLayout,type InteriorDiagnostics} from './interior-layout';
import {buildSuperHornet} from './aviation';
import {fleetSourceGlsl,type SourceFleetTextures} from './source-material';
import {externalFleet} from './generated/fleet-external';
import type {Cell,ShipKind} from '../contract';
export const CELL=4, HALF=60, BOARD=30;
export const key=(c:Cell)=>`${c.x},${c.z}`;
export const cellPosition=(c:Cell)=>new THREE.Vector3((c.x+.5)*CELL-HALF,0,(c.z+.5)*CELL-HALF);
export const merged=(geos:THREE.BufferGeometry[])=>geos.length?mergeGeometries(geos,false):null;
type Vertex={p:THREE.Vector3;n:THREE.Vector3;c:THREE.Color;interior?:boolean;part?:number;surface?:number;uv?:THREE.Vector2;sourceTile?:number};
export interface Sector {intact:THREE.BufferGeometry;low:THREE.BufferGeometry;wreck:THREE.BufferGeometry;fragment:THREE.BufferGeometry}
export type FleetPartState=Partial<Record<'engine'|'weapon'|'radar'|'flightDeck'|'airDefense'|'bridge',{disabled:boolean;hp?:number}>>;
export interface FleetPart {index:number;id:string;bounds:THREE.Box3;system?:keyof FleetPartState;detachable:boolean}
export interface DetachedFleetPart {geometry:THREE.BufferGeometry;center:THREE.Vector3}
export interface FleetAsset {interiorDiagnostics:InteriorDiagnostics;parts:FleetPart[];kind:ShipKind;sectors:Sector[];triangles:number;lowTriangles:number;canonicalExteriorTriangles:number;runtimeExteriorTriangles:number;sourceMeshes:number;uniformScale:number;sourceSize:number[];fittedSize:number[]}
function clip(poly:Vertex[],edge:number,positive:boolean){const out:Vertex[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p.z-edge)*(positive?1:-1),db=(b.p.z-edge)*(positive?1:-1);if(da>=-1e-7)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),c:a.c.clone().lerp(b.c,t),interior:a.interior&&b.interior,part:a.part,surface:a.surface,uv:a.uv&&b.uv?a.uv.clone().lerp(b.uv,t):undefined,sourceTile:a.sourceTile});}}return out;}
/** Continuous per-face projection; atlas wrapping happens per fragment to avoid stretching large triangles. */
function geometry(vertices:Vertex[],tile=0){const pos:number[]=[],norm:number[]=[],col:number[]=[],uv:number[]=[],interior:number[]=[],parts:number[]=[],surfaces:number[]=[],sourceTiles:number[]=[];for(const v of vertices){parts.push(v.part??-1);interior.push(v.interior?1:0);surfaces.push(v.surface??tile);sourceTiles.push(v.sourceTile??-1);pos.push(...v.p.toArray());norm.push(...v.n.toArray());col.push(v.c.r,v.c.g,v.c.b);const top=Math.abs(v.n.y)>.65,side=Math.abs(v.n.x)>Math.abs(v.n.z),u=top?v.p.x:side?v.p.z:v.p.x,w=top?v.p.z:v.p.y;uv.push(v.uv?.x??u*12,v.uv?.y??w*12);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aInterior',new THREE.Float32BufferAttribute(interior,1));g.setAttribute('aPart',new THREE.Float32BufferAttribute(parts,1));g.setAttribute('aSurface',new THREE.Float32BufferAttribute(surfaces,1));g.setAttribute('aSourceTile',new THREE.Float32BufferAttribute(sourceTiles,1));g.computeBoundingSphere();return g;}
/** One draw-call material, with distinct paint, deck, timber, machinery and glass response. */
export function configureFleetMaterial(material:THREE.MeshStandardMaterial,sources?:SourceFleetTextures){
 material.roughness=1;material.metalness=.25;material.normalScale.set(.42,.42);
 material.onBeforeCompile=shader=>{
  if(sources)for(const [kind,label] of [['carrier','Carrier'],['battleship','Battleship'],['destroyer','Destroyer'],['fighter','Fighter']] as const){const source=sources[kind];shader.uniforms[`u${label}Color`]={value:source.color};shader.uniforms[`u${label}Pbr`]={value:source.pbr};shader.uniforms[`u${label}Normal`]={value:source.normal};shader.uniforms[`u${label}Layout`]={value:source.layout};}
  shader.vertexShader='attribute float aSourceTile; varying float vSourceTile; attribute float aSurface; varying float vFleetSurface; varying vec2 vFleetUv; varying vec3 vFleetLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vSourceTile=aSourceTile; vFleetSurface=aSurface; vFleetUv=uv; vFleetLocal=position;');
  shader.fragmentShader=`varying float vFleetSurface; varying vec2 vFleetUv; varying vec3 vFleetLocal;
float fleetGrain(){vec3 q=vFleetLocal*140.;vec3 p=floor(q);float grain=fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);float footprint=max(length(dFdx(q)),length(dFdy(q)));return mix(grain,.5,smoothstep(.35,1.,footprint));}
vec2 fleetAtlasUv(){float tile=floor(vFleetSurface+.5);return vec2(mod(tile,4.)*.25,(1.-floor(tile/4.))*.5)+vec2(12./2048.,12./1024.)+fract(vFleetUv)*vec2(488./2048.,488./1024.);}
vec4 fleetSample(sampler2D tex){return textureGrad(tex,fleetAtlasUv(),dFdx(vFleetUv)*vec2(488./2048.,488./1024.),dFdy(vFleetUv)*vec2(488./2048.,488./1024.));}
`+(sources?fleetSourceGlsl:'vec4 fleetSourceNormal(){return vec4(.5,.5,1.,1.); } vec4 fleetSourceColor(){return vec4(1.); } vec4 fleetSourcePbr(){return vec4(1.,.65,.05,1.); }\n')+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','(vFleetSurface < -.5 ? fleetSourceColor() : vFleetSurface > 6.5 ? vec4(1.) : fleetSample( map ))'))
   // Source Iowa has bright linear paint factors. Grade only its display
   // response; packed source colours, UVs and all other ships stay untouched.
   .replace('#include <color_fragment>',THREE.ShaderChunk.color_fragment+`
    if(vFleetSurface> -2.5 && vFleetSurface< -1.5){
     if(abs(vSourceTile-8.)>.25){float hi=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));float lo=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));float paint=(1.-smoothstep(.09,.23,(hi-lo)/max(hi,.001)))*smoothstep(.10,.26,hi);diffuseColor.rgb*=mix(vec3(1.),vec3(.075,.095,.105),paint);}
     if(abs(vSourceTile-8.)<.25){float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(luma)*vec3(1.08,1.,.90),.30)*.70;}
    }
   `)
   .replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n if(vFleetSurface < -1.5 && vFleetSurface > -2.5 && diffuseColor.a < .35)discard;')
   .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )','(vFleetSurface < -.5 ? fleetSourceNormal() : vFleetSurface > 6.5 ? vec4(.5,.5,1.,1.) : fleetSample( normalMap ))'))
   .replace('#include <roughnessmap_fragment>',THREE.ShaderChunk.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )','(vFleetSurface < -.5 ? fleetSourcePbr() : fleetSample( roughnessMap ))')+'\n roughnessFactor=max(roughnessFactor,1.-smoothstep(.01,.06,max(vColor.r,max(vColor.g,vColor.b)))); if(vFleetSurface>6.5)roughnessFactor=.96; if(vFleetSurface<-.5)roughnessFactor=max(roughnessFactor,.76+fleetGrain()*.055);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=(vFleetSurface>6.5?.02:vFleetSurface<-.5?min(fleetSourcePbr().b,.035):vFleetSurface>2.5&&vFleetSurface<3.5?.72:.13)*smoothstep(.01,.06,max(vColor.r,max(vColor.g,vColor.b)));');
 };material.customProgramCacheKey=()=> sources?'naval-source-matte-iowa-v12':'naval-role-solid-interior-v4';material.needsUpdate=true;
}
/** Imported source hulls share a physical scale (304.5 metres = 3.6 game units).
 * Packed source normals and albedo are retained. All geometry remains one merged draw.
 * Detailed below-deck rooms are uniformly fitted inside the imported hull, never stretched. */
export function buildFleetAssets(options:{carrierAircraft?:'baked'|'animated'}={}):Record<ShipKind,FleetAsset>{
 const out={} as Record<ShipKind,FleetAsset>;
 for(const kind of ['carrier','battleship','destroyer'] as ShipKind[]){
  const source=externalFleet[kind],length=source.span,bins=Array.from({length:4},()=>({high:[] as Vertex[],low:[] as Vertex[]}));
  const parts:FleetPart[]=source.parts.map((p,index)=>({index,id:p.id,bounds:new THREE.Box3(new THREE.Vector3(...p.bounds[0]),new THREE.Vector3(...p.bounds[1])),system:p.system as keyof FleetPartState|undefined,detachable:p.detachable}));
  const add=(tri:Vertex[],variant:'high'|'low')=>{const a=Math.max(0,Math.min(3,Math.floor((Math.min(...tri.map(v=>v.p.z))+length/2)/length*4))),b=Math.max(0,Math.min(3,Math.floor((Math.max(...tri.map(v=>v.p.z))+length/2)/length*4)));if(a===b){bins[a][variant].push(...tri);return;}for(let sector=a;sector<=b;sector++){let poly=clip(tri,-length/2+sector*length/4,true);if(poly.length)poly=clip(poly,-length/2+(sector+1)*length/4,false);for(let j=1;j+1<poly.length;j++)bins[sector][variant].push(poly[0],poly[j],poly[j+1]);}};
  for(const variant of ['high','low'] as const){const raw=atob(variant==='high'?(source.medium??source.high):source.low),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),stride=(source as typeof source&{stride?:number}).stride??14;for(let i=0;i<bytes.length;i+=stride*3){const tri:Vertex[]=[];for(let j=0;j<3;j++){const at=i+j*stride;tri.push({p:new THREE.Vector3(view.getInt16(at,true)/8192,view.getInt16(at+2,true)/8192,view.getInt16(at+4,true)/8192),n:new THREE.Vector3(view.getInt8(at+6)/127,view.getInt8(at+7)/127,view.getInt8(at+8)/127).normalize(),c:new THREE.Color(view.getUint8(at+9)/255,view.getUint8(at+10)/255,view.getUint8(at+11)/255),part:view.getUint16(at+12,true),surface:{carrier:-1,battleship:-2,destroyer:-3}[kind],uv:stride>=24?new THREE.Vector2(view.getFloat32(at+14,true),view.getFloat32(at+18,true)):undefined,sourceTile:stride>=24&&view.getUint16(at+22,true)!==65535?view.getUint16(at+22,true):-1});}add(tri,variant);}}
  const interiorLayout=buildInteriorLayout(kind,source);
  for(const room of interiorLayout.parts){
   const index=parts.length;parts.push({index,id:room.id,bounds:room.bounds.clone(),detachable:false});
   for(const variant of ['high','low'] as const){const g=room[variant],p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i+=3){const tri:Vertex[]=[];for(let j=0;j<3;j++)tri.push({p:new THREE.Vector3().fromBufferAttribute(p,i+j),n:new THREE.Vector3().fromBufferAttribute(n,i+j),c:new THREE.Color(c.getX(i+j),c.getY(i+j),c.getZ(i+j)),uv:new THREE.Vector2(uv.getX(i+j),uv.getY(i+j)),part:index,surface:7,interior:true,sourceTile:-1});add(tri,variant);}g.dispose();}
  }
  if(kind==='carrier')for(const [index,x,z] of [[0,-.32,.75],[1,-.32,1.08],[2,-.32,.42]]){
   const part=parts.length;
   for(const variant of ['high','low'] as const){
    const g=buildSuperHornet({length:18.9/304.5*3.6,parked:true,low:variant==='low'});g.computeBoundingBox();g.translate(x,.19625-g.boundingBox!.min.y,z);g.computeBoundingBox();
    if(variant==='high')parts.push({index:part,id:`cv-aircraft-${index}`,bounds:g.boundingBox!.clone(),detachable:true});
    // Animated deck actors replace only these triangles; stable part indices and
    // original source geometry remain available to worker/attachment consumers.
    if(options.carrierAircraft==='animated'){g.dispose();continue;}
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color'),uv=g.getAttribute('uv'),tile=g.getAttribute('aSourceTile');
    for(let i=0;i<p.count;i+=3){const tri:Vertex[]=[];for(let j=0;j<3;j++)tri.push({p:new THREE.Vector3(p.getX(i+j),p.getY(i+j),p.getZ(i+j)),n:new THREE.Vector3(n.getX(i+j),n.getY(i+j),n.getZ(i+j)),c:new THREE.Color(c.getX(i+j),c.getY(i+j),c.getZ(i+j)),part,surface:-4,uv:new THREE.Vector2(uv.getX(i+j),uv.getY(i+j)),sourceTile:tile.getX(i+j)});add(tri,variant);}g.dispose();
   }
  }
  if(kind==='carrier'){
   // Source Ford deck already includes its lane markings. Fit added hardware to
   // actual source faces so windows and safety rails cannot hover off the hull.
   const deck=.19625,faces=bins.flatMap(bin=>bin.high).filter(v=>!v.interior&&v.sourceTile!==undefined),edges=new Map<string,{a:THREE.Vector3;b:THREE.Vector3;count:number}>();
   const detail=(g:THREE.BufferGeometry,id:string,color:THREE.Color,system?:keyof FleetPartState)=>{g.computeBoundingBox();const part=parts.length;parts.push({index:part,id,bounds:g.boundingBox!.clone(),detachable:true,system});const raw=g.index?g.toNonIndexed():g,p=raw.getAttribute('position'),n=raw.getAttribute('normal');for(let i=0;i<p.count;i+=3){const tri:Vertex[]=[];for(let j=0;j<3;j++)tri.push({p:new THREE.Vector3().fromBufferAttribute(p,i+j),n:new THREE.Vector3().fromBufferAttribute(n,i+j),c:color,part,surface:-1});add(tri,'high');add(tri,'low');}if(raw!==g)raw.dispose();g.dispose();};
   const beam=(a:THREE.Vector3,b:THREE.Vector3,width:number,id:string,color:THREE.Color)=>{const delta=b.clone().sub(a),g=new THREE.BoxGeometry(width,delta.length(),width);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());detail(g,id,color);};
   let windows=0;
   for(let i=0;i<faces.length;i+=3){const tri=faces.slice(i,i+3);if(tri.length!==3)continue;const [a,b,c]=tri.map(v=>v.p),center=a.clone().add(b).add(c).multiplyScalar(1/3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if(center.y>.25&&center.y<.49&&Math.abs(normal.y)<.12){const radius=Math.min(...[[a,b],[b,c],[c,a]].map(([v,w])=>new THREE.Line3(v,w).closestPointToPoint(center,true,new THREE.Vector3()).distanceTo(center)));if(radius>.009){const width=Math.min(radius*1.3,.042),g=new THREE.BoxGeometry(width,.009,.001);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal));g.translate(...center.clone().addScaledVector(normal,.0007).toArray());detail(g,`cv-ford-bridge-window-${windows++}`,new THREE.Color(.035,.065,.075),'bridge');}}
    if(tri.every(v=>Math.abs(v.p.y-deck)<.002))for(const [v,w]of [[a,b],[b,c],[c,a]]){const key=[v.toArray().map(n=>Math.round(n*8192)).join(','),w.toArray().map(n=>Math.round(n*8192)).join(',')].sort().join('|'),old=edges.get(key);if(old)old.count++;else edges.set(key,{a:v.clone(),b:w.clone(),count:1});}
   }
   const deckContains=(x:number,z:number)=>{for(let i=0;i<faces.length;i+=3){const [a,b,c]=faces.slice(i,i+3).map(v=>v.p);if(!a||!b||!c||[a,b,c].some(p=>Math.abs(p.y-deck)>.002))continue;const d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(d)<1e-10)continue;const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/d,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/d;if(u>=0&&v>=0&&u+v<=1)return true;}return false;};
   for(const [mount,x,z]of [[0,-.31,1.53],[1,.31,-1.45]]){if(!deckContains(x,z))continue;const paint=new THREE.Color(.42,.46,.47),base=new THREE.CylinderGeometry(.018,.021,.018,12);base.translate(x,deck+.009,z);detail(base,`cv-ford-ciws-base-${mount}`,paint,'airDefense');const turret=new THREE.BoxGeometry(.027,.025,.029);turret.translate(x,deck+.028,z);detail(turret,`cv-ford-ciws-turret-${mount}`,paint,'airDefense');const radar=new THREE.SphereGeometry(.012,10,6);radar.scale(1,1.15,.8);radar.translate(x,deck+.05,z);detail(radar,`cv-ford-ciws-radar-${mount}`,new THREE.Color(.64,.66,.65),'airDefense');for(let j=0;j<6;j++){const barrel=new THREE.CylinderGeometry(.001,.001,.04,6);barrel.rotateX(Math.PI/2);barrel.translate(x+Math.cos(j/3*Math.PI)*.0027,deck+.03+Math.sin(j/3*Math.PI)*.0027,z-.029);detail(barrel,`cv-ford-ciws-barrel-${mount}-${j}`,new THREE.Color(.09,.1,.11),'airDefense');}}
   let rails=0;const metal=new THREE.Color(.35,.39,.4);
   for(const edge of edges.values()){const {a,b}=edge;if(edge.count!==1||Math.abs((a.x+b.x)/2)<.27||a.distanceTo(b)<.035)continue;const count=Math.ceil(a.distanceTo(b)/.06);for(let j=0;j<count;j++){const p=a.clone().lerp(b,j/count),q=a.clone().lerp(b,(j+1)/count);beam(p,p.clone().add(new THREE.Vector3(0,.013,0)),.0015,`cv-ford-rail-post-${rails}`,metal);beam(p.clone().add(new THREE.Vector3(0,.012,0)),q.clone().add(new THREE.Vector3(0,.012,0)),.0015,`cv-ford-rail-${rails++}`,metal);}}
  }
  let triangles=0,lowTriangles=0;const sectors:Sector[]=bins.map(({high,low})=>{const wreck:Vertex[]=[];for(let i=0;i<high.length;i+=3)if(high[i].p.y<0&&high[i+1].p.y<0&&high[i+2].p.y<0)for(const v of high.slice(i,i+3))wreck.push({...v,c:new THREE.Color(.06,.07,.065)});triangles+=high.length/3;lowTriangles+=low.length/3;return {intact:geometry(high),low:geometry(low),wreck:geometry(wreck),fragment:geometry(high.filter((_,i)=>Math.floor(i/3)<48).map(v=>({...v,p:v.p.clone().sub(new THREE.Vector3(0,0,-length/2+(Math.floor((v.p.z+length/2)/length*4)+.5)*length/4)),c:v.c.clone().multiplyScalar(.7)})))};});
  const fitted=new THREE.Box3();for(const sector of sectors){sector.intact.computeBoundingBox();fitted.union(sector.intact.boundingBox!);}out[kind]={interiorDiagnostics:interiorLayout.diagnostics,parts,kind,sectors,triangles,lowTriangles,canonicalExteriorTriangles:source.sourceTriangles,runtimeExteriorTriangles:atob(source.medium??source.high).length/((source.stride??14)*3),sourceMeshes:source.sourceMeshes,uniformScale:source.scale,sourceSize:source.sourceSize,fittedSize:fitted.getSize(new THREE.Vector3()).toArray()};
 }return out;
}
export type DamageMark={x:number;z:number;seed:number;y?:number;normal?:[number,number,number]};
const systemDestroyed=(part:{disabled:boolean;hp?:number}|undefined)=>part?.disabled===true||part?.hp!==undefined&&part.hp<=0;
const noise=(n:number)=>{const x=Math.sin(n*127.1+17.7)*43758.5453;return x-Math.floor(x);};
/** Interpolate the actual upper surface at the normalized local impact coordinate. */
export function damagePoint(asset:FleetAsset,mark:{x:number;z:number;y?:number},surface?:THREE.BufferGeometry){const x=THREE.MathUtils.clamp(mark.x,-.98,.98)*asset.fittedSize[0]/2,z=THREE.MathUtils.clamp(mark.z,-.98,.98)*asset.fittedSize[2]/2;if(mark.y!==undefined)return new THREE.Vector3(mark.x*asset.fittedSize[0]/2,mark.y,mark.z*asset.fittedSize[2]/2);let y=-Infinity,found=false,closest=Infinity,nearest=new THREE.Vector3(x,.23,z);for(const mesh of surface?[surface]:asset.sectors.map(s=>s.intact)){const p=mesh.getAttribute('position');for(let i=0;i<p.count;i+=3){const ax=p.getX(i),az=p.getZ(i),bx=p.getX(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cz=p.getZ(i+2),d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);for(let j=0;j<3;j++){const dist=(p.getX(i+j)-x)**2+(p.getZ(i+j)-z)**2;if(dist<closest){closest=dist;nearest.set(p.getX(i+j),p.getY(i+j),p.getZ(i+j));}}if(Math.abs(d)<1e-9)continue;const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d;if(u>=0&&v>=0&&u+v<=1){found=true;y=Math.max(y,u*p.getY(i)+v*p.getY(i+1)+(1-u-v)*p.getY(i+2));}}}return found?new THREE.Vector3(x,y+.008,z):nearest.add(new THREE.Vector3(0,.008,0));}
function cutPlane(poly:Vertex[],value:(p:THREE.Vector3)=>number){const inside:Vertex[]=[],outside:Vertex[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=value(a.p),db=value(b.p);(da>=0?inside:outside).push(a);if((da>=0)!==(db>=0)){const t=da/(da-db),v={p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),c:a.c.clone().lerp(b.c,t),interior:a.interior&&b.interior,part:a.part,surface:a.surface,uv:a.uv&&b.uv?a.uv.clone().lerp(b.uv,t):undefined,sourceTile:a.sourceTile};inside.push(v);outside.push(v);}}return {inside,outside};}
const triangles=(poly:Vertex[])=>{const out:Vertex[]=[];for(let i=1;i+1<poly.length;i++)out.push(poly[0],poly[i],poly[i+1]);return out;};
/** Cut the exterior and internal solids through the same crater volume.
 * Retain deeper compartments and add thickness only on real exterior cut edges. */
export function fleetGeometry(asset:FleetAsset,marks:DamageMark[],low:boolean,systems:FleetPartState={}){const base=merged(asset.sectors.map(s=>low?s.low:s.intact))!;if(!marks.length&&!Object.values(systems).some(systemDestroyed))return base;const detached=detachedPartIndices(asset,marks,systems);let vertices:Vertex[]=[];const p=base.getAttribute('position'),n=base.getAttribute('normal'),c=base.getAttribute('color'),interior=base.getAttribute('aInterior'),part=base.getAttribute('aPart'),surface=base.getAttribute('aSurface'),uv=base.getAttribute('uv'),sourceTile=base.getAttribute('aSourceTile');for(let i=0;i<p.count;i++)if(!detached.has(part.getX(i)))vertices.push({p:new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)),n:new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),c:new THREE.Color(c.getX(i),c.getY(i),c.getZ(i)),interior:interior.getX(i)>.5,part:part.getX(i),surface:surface.getX(i),uv:new THREE.Vector2(uv.getX(i),uv.getY(i)),sourceTile:sourceTile?.getX(i)??-1});base.dispose();
 for(const mark of marks.slice(-12)){const center=damagePoint(asset,mark),rx=Math.min(asset.fittedSize[0]*.20,.10)*(1+noise(mark.seed)*.20),rz=.10+noise(mark.seed+1)*.035,depth=.075+noise(mark.seed+2)*.025;
  // Side contacts use a crater in the hull's tangent plane, not a top-down deck cut.
  const axis=mark.normal?new THREE.Vector3(...mark.normal).normalize():new THREE.Vector3(0,1,0),u=mark.normal?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),v=mark.normal?axis.clone().cross(u).normalize():new THREE.Vector3(0,0,1);
  const cu=center.dot(u),cv=center.dot(v),cw=center.dot(axis),px=(p:THREE.Vector3)=>p.dot(u)-cu,pz=(p:THREE.Vector3)=>p.dot(v)-cv,py=(p:THREE.Vector3)=>p.dot(axis)-cw;
  const rim=Array.from({length:11},(_,i)=>{const a=i/11*Math.PI*2,r=(i%2?.59:.96)+noise(mark.seed+i+3)*.26;return center.clone().addScaledVector(u,Math.cos(a)*rx*r).addScaledVector(v,Math.sin(a)*rz*r);});const result:Vertex[]=[];
  for(let i=0;i<vertices.length;i+=3){const tri=vertices.slice(i,i+3);const system=asset.parts[tri[0]?.part??-1]?.system;const intactSystem=system&&system!=='flightDeck'&&systems[system]&&!systemDestroyed(systems[system]);if(intactSystem||tri.every(v=>py(v.p)<-depth)||Math.min(...tri.map(v=>px(v.p)))>rx*1.6||Math.max(...tri.map(v=>px(v.p)))<-rx*1.6||Math.min(...tri.map(v=>pz(v.p)))>rz*1.6||Math.max(...tri.map(v=>pz(v.p)))<-rz*1.6){result.push(...tri);continue;}const cut=cutPlane(tri,p=>py(p)+depth);result.push(...triangles(cut.outside));let pieces=cut.inside.length?[cut.inside]:[];for(let j=0;j<rim.length&&pieces.length;j++){const wedge=[center,rim[j],rim[(j+1)%rim.length]],next:Vertex[][]=[];for(const piece of pieces){let remaining=piece;for(let edge=0;edge<3&&remaining.length;edge++){const a=wedge[edge],b=wedge[(edge+1)%3],split=cutPlane(remaining,p=>(px(b)-px(a))*(pz(p)-pz(a))-(pz(b)-pz(a))*(px(p)-px(a)));if(split.outside.length)next.push(split.outside);remaining=split.inside;}}pieces=next;}for(const poly of pieces){
   result.push(...triangles(poly));
   if(tri[0].interior)continue;
   // Anchor the exposed plate edge to the actual clipped source polygon.
   // A boundary must lie on a crater rim segment, never on a sampled top plane.
   for(let edge=0;edge<poly.length;edge++){
    const a=poly[edge],b=poly[(edge+1)%poly.length];if(a.p.distanceToSquared(b.p)<1e-12)continue;
    const onRim=rim.some((r,j)=>{const q=rim[(j+1)%rim.length],dx=px(q)-px(r),dz=pz(q)-pz(r),l2=dx*dx+dz*dz;return [a,b].every(v=>{const t=((px(v.p)-px(r))*dx+(pz(v.p)-pz(r))*dz)/l2;return t>=-1e-6&&t<=1.000001&&Math.abs(dx*(pz(v.p)-pz(r))-dz*(px(v.p)-px(r)))<1e-7;});});
    if(!onRim)continue;
    const faceNormal=tri[1].p.clone().sub(tri[0].p).cross(tri[2].p.clone().sub(tri[0].p)).normalize(),authoredNormal=a.n.clone().add(b.n).normalize();
    if(faceNormal.dot(authoredNormal)<0)faceNormal.negate();
    const thickness=Math.max(.0022,Math.min(.004,asset.fittedSize[0]*.012)),offset=faceNormal.multiplyScalar(-thickness);
    const edgeNormal=b.p.clone().sub(a.p).cross(offset).normalize(),metal=new THREE.Color(.17,.19,.20);
    const edgeVertex=(v:Vertex,back:boolean):Vertex=>({...v,p:v.p.clone().addScaledVector(offset,back?1:0),n:edgeNormal,c:metal,interior:true,surface:7,sourceTile:-1,uv:undefined});
    const aa=edgeVertex(a,false),bb=edgeVertex(b,false),cc=edgeVertex(b,true),dd=edgeVertex(a,true);result.push(aa,bb,cc,aa,cc,dd);
   }
  }}
  for(const v of result){const d=Math.hypot(px(v.p)/rx,pz(v.p)/rz);if(d<2&&py(v.p)>-depth-.035&&py(v.p)<.035){const scorch=(1-THREE.MathUtils.smoothstep(d,.95,2))*.9;v.c=v.c.clone().lerp(new THREE.Color(.045,.038,.03),scorch);}}
  // A cut edge is retained only from the original connected surface. Never fabricate
  // floating rim triangles at a sampled top height; separated authored parts become physics debris.
  // Repeated polygon/wedge clipping can produce collinear fan triangles.
  // Discard those zero-area fragments rather than feeding unstable normals
  // and depth interpolation into the material. Canonical source stays intact.
  vertices=[];for(let i=0;i<result.length;i+=3){const a=result[i].p,b=result[i+1].p,c=result[i+2].p;if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>4e-24)vertices.push(result[i],result[i+1],result[i+2]);}
 }return geometry(vertices,asset.kind==='carrier'?7:1);}

/** Whole source-authored attachments lose support as a unit, preventing hanging caps/barrels. */
export function detachedPartIndices(asset:FleetAsset,marks:DamageMark[],systems:FleetPartState={}){const detached=new Set<number>();const impacts=marks.slice(-12).map(mark=>({center:damagePoint(asset,mark),rx:Math.min(asset.fittedSize[0]*.20,.10)*(1+noise(mark.seed)*.20),rz:.10+noise(mark.seed+1)*.035,depth:.075+noise(mark.seed+2)*.025}));for(const part of asset.parts){if(systemDestroyed(systems.bridge)&&(!part.system||part.system==='airDefense')&&part.bounds.min.y>{carrier:.221,battleship:.105,destroyer:.105}[asset.kind]){detached.add(part.index);continue;}if((part.system==='radar'&&systemDestroyed(systems.bridge))||(part.system&&part.system!=='flightDeck'&&systemDestroyed(systems[part.system]))){detached.add(part.index);continue;}if(part.system&&part.system!=='flightDeck'&&systems[part.system])continue;if(!part.detachable)continue;const bounds=part.bounds,size=bounds.getSize(new THREE.Vector3());if(size.x>.7||size.z>.75)continue;for(const hit of impacts){const closest=bounds.clampPoint(hit.center,new THREE.Vector3()),d=Math.hypot((closest.x-hit.center.x)/hit.rx,(closest.z-hit.center.z)/hit.rz);if(d<.95&&bounds.max.y>hit.center.y-hit.depth&&bounds.min.y>-.015){detached.add(part.index);break;}}}
 // Upper bridge tiers and fitted equipment cannot survive after their lower supporting tier is gone.
 for(const prefix of ['cv-island-','bb-superstructure-super-','dd-bridge-super-']){const lost=asset.parts.filter(p=>p.id.startsWith(prefix)&&detached.has(p.index)).map(p=>Number(p.id.slice(prefix.length)));if(!lost.length)continue;const level=Math.min(...lost);for(const part of asset.parts){if(part.id.startsWith(prefix)&&Number(part.id.slice(prefix.length))>level)detached.add(part.index);if((prefix==='cv-island-'&&/^cv-(forward-mast|aft-mast|radome)$/.test(part.id))||(prefix==='bb-superstructure-super-'&&/^bb-(command-bridge|foremast|tripod)$/.test(part.id))||(prefix==='dd-bridge-super-'&&/^dd-(integrated-mast|mast-antenna)$/.test(part.id)))detached.add(part.index);}}
 return detached;}
/** Caller owns each returned centered geometry; all vertices retain original uniform scale. */
export function fleetDetachedGeometry(asset:FleetAsset,beforeMarks:DamageMark[],afterMarks:DamageMark[],beforeParts:FleetPartState={},afterParts:FleetPartState={}):DetachedFleetPart[]{
 const before=detachedPartIndices(asset,beforeMarks,beforeParts),after=detachedPartIndices(asset,afterMarks,afterParts),buckets=new Map<number,Vertex[]>();
 for(const index of after)if(!before.has(index))buckets.set(index,[]);
 if(!buckets.size)return[];
 // One source traversal per hit, instead of rebuilding a traversal for each falling attachment.
 for(const sector of asset.sectors){const g=sector.intact,part=g.getAttribute('aPart'),p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color'),surface=g.getAttribute('aSurface'),uv=g.getAttribute('uv'),sourceTile=g.getAttribute('aSourceTile');for(let i=0;i<p.count;i++){const vertices=buckets.get(part.getX(i));if(vertices)vertices.push({p:new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)),n:new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),c:new THREE.Color(c.getX(i),c.getY(i),c.getZ(i)).multiplyScalar(.58),surface:surface.getX(i),uv:new THREE.Vector2(uv.getX(i),uv.getY(i)),sourceTile:sourceTile?.getX(i)??-1});}}
 const out:DetachedFleetPart[]=[];for(const [index,vertices] of buckets){if(!vertices.length)continue;const center=asset.parts[index].bounds.getCenter(new THREE.Vector3());for(const v of vertices)v.p.sub(center);out.push({geometry:geometry(vertices,asset.kind==='carrier'?7:1),center});}return out;
}
