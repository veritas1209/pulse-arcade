import * as THREE from 'three';
import {damagePoint,type DamageMark,type FleetAsset} from './fleet';

const cache=new WeakMap<THREE.BufferGeometry,Map<string,ReturnType<typeof resolveOrigin>>>();
export function damageFireOrigin(asset:FleetAsset,mark:DamageMark,damaged:THREE.BufferGeometry){
 const key=`${asset.kind}:${mark.x}:${mark.z}:${mark.seed}`;let records=cache.get(damaged);if(!records){records=new Map();cache.set(damaged,records);}let result=records.get(key);if(!result){result=resolveOrigin(asset,mark,damaged);records.set(key,result);}return result;
}

/** Find surviving structure BELOW the original impact lip, never an intact roof
 * adjacent to the opening. The returned position is in the ship's local frame. */
function resolveOrigin(asset:FleetAsset,mark:DamageMark,damaged:THREE.BufferGeometry){
 const lip=damagePoint(asset,mark),width=Math.min(asset.fittedSize[0]*.24,.12);
 if(mark.normal){
  const normal=new THREE.Vector3(...mark.normal).normalize();
  // A waterline entry wall has no floor directly beneath its exterior lip.
  // Root fire on a surviving compartment just inside that same breach.
  for(const distance of [.2,.4,.65,.9]){const inside=lip.clone().addScaledVector(normal,-width*distance);inside.y+=width*.8;const candidate=supportedOrigin(inside,damaged,width);if(candidate.verified&&candidate.position.y>lip.y-width)return candidate;}
 }
 return supportedOrigin(lip,damaged,width);
}
function supportedOrigin(lip:THREE.Vector3,damaged:THREE.BufferGeometry,width:number){
 const p=damaged.getAttribute('position');let floor=-Infinity;
 for(let i=0;i<p.count;i+=3){
  const ax=p.getX(i),az=p.getZ(i),bx=p.getX(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cz=p.getZ(i+2);
  const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-12)continue;
  const u=((bz-cz)*(lip.x-cx)+(cx-bx)*(lip.z-cz))/d,v=((cz-az)*(lip.x-cx)+(ax-cx)*(lip.z-cz))/d;
  if(u<0||v<0||u+v>1)continue;
  const y=u*p.getY(i)+v*p.getY(i+1)+(1-u-v)*p.getY(i+2);
  if(y<lip.y-.012)floor=Math.max(floor,y);
 }
 const verified=Number.isFinite(floor),position=lip.clone();
 // Unsupported through-hull openings have no persistent emitter. Retain a
 // finite fallback for diagnostics, but callers should skip unverified origins.
 position.y=verified?floor+.0015:lip.y-.035;
 return {position,verified,lipY:lip.y-.008,depth:lip.y-.008-position.y,opening:{width,depth:.13}};
}

const clusterCache=new WeakMap<THREE.BufferGeometry,Map<string,ReturnType<typeof makeCluster>>>();
/** One dominant breach fire plus six smaller, independently rooted fires. All
 * origins are projected onto surviving structure inside the same damage scar. */
export function damageFireCluster(asset:FleetAsset,mark:DamageMark,damaged:THREE.BufferGeometry){
 const key=`${asset.kind}:${mark.x}:${mark.z}:${mark.seed}`;let records=clusterCache.get(damaged);if(!records){records=new Map();clusterCache.set(damaged,records);}let result=records.get(key);if(!result){result=makeCluster(asset,mark,damaged);records.set(key,result);}return result;
}
function makeCluster(asset:FleetAsset,mark:DamageMark,damaged:THREE.BufferGeometry){
 const root=damageFireOrigin(asset,mark,damaged);if(!root.verified)return [];
 const hash=(n:number)=>{const h=Math.sin(n*127.1+311.7)*43758.5453;return h-Math.floor(h);},lip=mark.normal?root.position.clone().setY(root.lipY+.008):damagePoint(asset,mark),out=[{...root,flameScale:1.25,satellite:0}],phase=hash(mark.seed)*Math.PI*2;
 for(let i=0;i<6;i++){
  const angle=phase+i*Math.PI/3+(hash(mark.seed+i+13)-.5)*.18;let support:ReturnType<typeof supportedOrigin>|undefined;
  // Search inward only when a missing floor leaves the first candidate unsupported.
  for(const radius of [.78,.60,.42,.24,.10]){const point=lip.clone();point.x+=Math.cos(angle)*root.opening.width*.58*radius;point.z+=Math.sin(angle)*root.opening.depth*.65*radius;const candidate=supportedOrigin(point,damaged,root.opening.width);if(candidate.verified){support=candidate;break;}}
  if(support)out.push({...support,flameScale:.36+hash(mark.seed+i+37)*.23,satellite:i+1});
 }
 return out;
}
