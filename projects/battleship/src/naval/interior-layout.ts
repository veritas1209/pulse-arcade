import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {ShipKind} from '../contract';
import type {ImportedShip} from './generated/fleet-external';

export interface InteriorPart {
 id:string;
 bounds:THREE.Box3;
 /** Source hull coordinates; caller assigns the fleet-wide aPart index. */
 high:THREE.BufferGeometry;
 low:THREE.BufferGeometry;
}
export interface InteriorDiagnostics {
 highTriangles:number;lowTriangles:number;parts:number;deckHeight:number;
 hullPart:string;acceptedSolids:number;rejectedSolids:number;sourceIntersectionChecks:number;
 longitudinalCoverage:number;averageDeckCoverage:number;occupiedBays:number;bayCount:number;
 bridgePanels:number;wallThickness:number;decks:number;ceilingPanels:number;sideLiners:number;engineBlocks:number;fuelTanks:number;
}
type Face={triangle:THREE.Triangle;bounds:THREE.Box3;part:number};
const paint={floor:0x596267,wall:0x7c8588,trim:0x454f51,engine:0x596568,tank:0x747e80,crew:0x737f82,crate:0x657074};
const finiteGeometry=(g:THREE.BufferGeometry)=>{g.computeBoundingBox();return g.boundingBox!;};

/** Exact source HIGH shell queries, independent of rendering and fleet damage code.
 * All added volumes must fit BETWEEN the outer port/starboard shell intersections
 * and must not intersect a source triangle. A global source box is never a fit test. */
export function inspectInteriorHull(source:ImportedShip){
 const bytes=Uint8Array.from(atob(source.high),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),stride=source.stride??14;
 const hullIndex=source.parts.reduce((best,part,i)=>part.id.includes('-hull-')&&part.bounds[1][2]-part.bounds[0][2]>(source.parts[best]?.bounds[1][2]??-Infinity)-(source.parts[best]?.bounds[0][2]??0)?i:best,-1);
 if(hullIndex<0)throw new Error('Imported source has no structural hull');
 const shell:Face[]=[],attachments:Face[]=[],histogram=new Map<number,number>();
 const allBounds=new THREE.Box3(),point=(at:number)=>new THREE.Vector3(view.getInt16(at,true)/8192,view.getInt16(at+2,true)/8192,view.getInt16(at+4,true)/8192);
 for(let at=0;at<bytes.length;at+=stride*3){
  const triangle=new THREE.Triangle(point(at),point(at+stride),point(at+stride*2)),bounds=new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]),part=view.getUint16(at+12,true),face={triangle,bounds,part};
  if(part===hullIndex){shell.push(face);allBounds.union(bounds);const normal=triangle.getNormal(new THREE.Vector3()),center=triangle.getMidpoint(new THREE.Vector3());if(center.y>.015&&Math.abs(normal.y)>.9){const y=Math.round(center.y*1000)/1000;histogram.set(y,(histogram.get(y)??0)+triangle.getArea());}}
  else attachments.push(face);
 }
 // A carrier's separately tagged flight deck is the roof of its occupied hull.
 // Otherwise take the dominant broad horizontal hull sheet, excluding the DD's
 // much smaller connected superstructure roofs and aerial fittings.
 const taggedDeck=source.parts.filter(part=>part.system==='flightDeck'&&part.bounds[1][2]-part.bounds[0][2]>source.span*.5);
 const deckHeight=taggedDeck.length?Math.min(...taggedDeck.map(part=>part.bounds[0][1])):[...histogram].sort((a,b)=>b[1]-a[1])[0]?.[0]??allBounds.max.y;
 const bins=Array.from({length:96},()=>({shell:[] as Face[],attachments:[] as Face[]})),length=allBounds.max.z-allBounds.min.z;
 const bin=(z:number)=>Math.max(0,Math.min(bins.length-1,Math.floor((z-allBounds.min.z)/length*bins.length)));
 for(const [faces,key] of [[shell,'shell'],[attachments,'attachments']] as const)for(const face of faces)for(let i=bin(face.bounds.min.z);i<=bin(face.bounds.max.z);i++)bins[i][key].push(face);
 const sectionCache=new Map<string,[number,number]|null>();
 function section(y:number,z:number):[number,number]|null{
  const key=`${y.toFixed(7)}:${z.toFixed(7)}`;if(sectionCache.has(key))return sectionCache.get(key)!;
  const hits:number[]=[];
  for(const {triangle:t,bounds} of bins[bin(z)].shell){
   if(y<bounds.min.y-1e-8||y>bounds.max.y+1e-8||z<bounds.min.z-1e-8||z>bounds.max.z+1e-8)continue;
   const d=(t.b.z-t.c.z)*(t.a.y-t.c.y)+(t.c.y-t.b.y)*(t.a.z-t.c.z);if(Math.abs(d)<1e-12)continue;
   const u=((t.b.z-t.c.z)*(y-t.c.y)+(t.c.y-t.b.y)*(z-t.c.z))/d,v=((t.c.z-t.a.z)*(y-t.c.y)+(t.a.y-t.c.y)*(z-t.c.z))/d;
   if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)hits.push(u*t.a.x+v*t.b.x+(1-u-v)*t.c.x);
  }
  hits.sort((a,b)=>a-b);const result=hits.length>=2&&hits.at(-1)!-hits[0]>.008?[hits[0],hits.at(-1)!] as [number,number]:null;sectionCache.set(key,result);return result;
 }
 let intersectionChecks=0;
 function sourceIntersection(bounds:THREE.Box3,includeAttachments=true){
  const visited=new Set<Face>();for(let i=bin(bounds.min.z);i<=bin(bounds.max.z);i++)for(const key of includeAttachments?['shell','attachments'] as const:['shell'] as const)for(const face of bins[i][key]){
   if(visited.has(face)||!bounds.intersectsBox(face.bounds))continue;visited.add(face);intersectionChecks++;if(bounds.intersectsTriangle(face.triangle))return true;
  }return false;
 }
 function contains(bounds:THREE.Box3,margin=.0015){
  if(bounds.min.y<=allBounds.min.y+margin||bounds.max.y>=deckHeight-.005||bounds.min.z<=allBounds.min.z||bounds.max.z>=allBounds.max.z)return false;
  for(const y of [bounds.min.y,(bounds.min.y+bounds.max.y)/2,bounds.max.y])for(const z of [bounds.min.z,(bounds.min.z+bounds.max.z)/2,bounds.max.z]){const s=section(y,z);if(!s||bounds.min.x<s[0]+margin||bounds.max.x>s[1]-margin)return false;}
  return !sourceIntersection(bounds);
 }
 function width(y0:number,y1:number,z0:number,z1:number,margin=.004):[number,number]|null{
  let left=-Infinity,right=Infinity;for(const y of [y0,(y0+y1)/2,y1])for(const z of [z0,(z0+z1)/2,z1]){const s=section(y,z);if(!s)return null;left=Math.max(left,s[0]+margin);right=Math.min(right,s[1]-margin);}return right-left>.014?[left,right]:null;
 }
 // Above-deck rooms use paired intersections of the actual structural shell.
 const structural=[...shell,...attachments.filter(f=>source.parts[f.part]?.system==='bridge'||/-(?:hull|structure|superstructure)-/.test(source.parts[f.part]?.id??''))];
 const bridgeBounds=new THREE.Box3();for(const f of structural)if(f.bounds.max.y>deckHeight+.02&&source.parts[f.part]?.system==='bridge')bridgeBounds.union(f.bounds);
 const structureBins=Array.from({length:96},()=>[] as Face[]),superCache=new Map<string,[number,number][]>();
 for(const f of structural)for(let i=bin(f.bounds.min.z);i<=bin(f.bounds.max.z);i++)structureBins[i].push(f);
 function superSection(y:number,z:number){
  const cacheKey=`${y.toFixed(9)}:${z.toFixed(9)}`;if(superCache.has(cacheKey))return superCache.get(cacheKey)!;
  const hits:number[]=[];for(const {triangle:t,bounds:b} of structureBins[bin(z)]){if(y<b.min.y||y>b.max.y||z<b.min.z||z>b.max.z)continue;
   const d=(t.b.z-t.c.z)*(t.a.y-t.c.y)+(t.c.y-t.b.y)*(t.a.z-t.c.z);if(Math.abs(d)<1e-12)continue;
   const u=((t.b.z-t.c.z)*(y-t.c.y)+(t.c.y-t.b.y)*(z-t.c.z))/d,v=((t.c.z-t.a.z)*(y-t.c.y)+(t.a.y-t.c.y)*(z-t.c.z))/d;
   if(u>=-1e-8&&v>=-1e-8&&u+v<=1.00000001)hits.push(u*t.a.x+v*t.b.x+(1-u-v)*t.c.x);
  }hits.sort((a,b)=>a-b);const unique=hits.filter((x,i)=>!i||x-hits[i-1]>.0001),pairs:[number,number][]=[];
  if(unique.length%2){superCache.set(cacheKey,pairs);return pairs;}for(let i=0;i<unique.length;i+=2)if(unique[i+1]-unique[i]>.012)pairs.push([unique[i],unique[i+1]]);superCache.set(cacheKey,pairs);return pairs;
 }
 function containsStructure(b:THREE.Box3){
  if(b.min.y<=deckHeight+.004||b.max.y>=bridgeBounds.max.y-.002)return false;
  for(const y of [b.min.y,(b.min.y+b.max.y)/2,b.max.y])for(const z of [b.min.z,(b.min.z+b.max.z)/2,b.max.z])if(!superSection(y,z).some(([a,c])=>b.min.x>a+.0015&&b.max.x<c-.0015))return false;
  return !sourceIntersection(b);
 }
 return {bridgeBounds,superSection,containsStructure,bounds:allBounds,deckHeight,hullPart:source.parts[hullIndex].id,section,contains,width,sourceIntersection,get intersectionChecks(){return intersectionChecks;}};
}

/** Ship-wide rooms and structural floors for damage reveal. Small solid panels are
 * chosen instead of a second detailed ship: HIGH and LOW share physical layout.
 * Parts are non-detachable so losing tactical propulsion cannot remove the floor. */
export function buildInteriorLayout(kind:ShipKind,source:ImportedShip):{parts:InteriorPart[];diagnostics:InteriorDiagnostics}{
 const hull=inspectInteriorHull(source),span=hull.bounds.max.z-hull.bounds.min.z,beam=hull.bounds.max.x-hull.bounds.min.x;
 const panel=Math.max(.0022,Math.min(.004,beam*.012)),gap=panel*1.8,roof=hull.deckHeight-.009;
 const lower=Math.max(hull.bounds.min.y+.025,-.066),height=roof-lower;
 const deckCount=kind==='carrier'?4:3,deckStep=height/deckCount;
 const floors=Array.from({length:deckCount},(_,i)=>lower+i*deckStep),bayCount=kind==='carrier'?16:kind==='battleship'?14:10;
 const z0=hull.bounds.min.z+span*.045,z1=hull.bounds.max.z-span*.045,bayStep=(z1-z0)/bayCount;
 const parts:InteriorPart[]=[],occupied=new Set<number>(),occupiedLengths:number[]=[],floorRanges:[number,number][]=[];
 let bridgePanels=0,accepted=0,rejected=0,ceilingPanels=0,sideLiners=0,engineBlocks=0,fuelTanks=0;
 type Bucket={high:THREE.BufferGeometry[];low:THREE.BufferGeometry[]};
 const buckets=new Map<string,Bucket>();let writingLow=false,writingBridge=false;
 function add(g:THREE.BufferGeometry,id:string,color:number){
  const bounds=finiteGeometry(g);let bridgeFits=true;
  if(writingBridge){const pos=g.getAttribute('position'),ix=g.index;for(let i=0;i<(ix?.count??pos.count);i+=3){const vertices=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(pos,ix?ix.getX(i+j):i+j));for(const v of [...vertices,vertices[0].clone().add(vertices[1]).add(vertices[2]).multiplyScalar(1/3)])if(!hull.superSection(v.y,v.z).some(([a,b])=>v.x>a+.001&&v.x<b-.001)){bridgeFits=false;break;}if(!bridgeFits)break;}}
  if(!bridgeFits||!(writingBridge?hull.containsStructure(bounds):hull.contains(bounds))){g.dispose();rejected++;return false;}accepted++;
  const raw=g.index?g.toNonIndexed():g;if(raw!==g)g.dispose();const p=raw.getAttribute('position'),c=new THREE.Color(color),colors:number[]=[];
  for(let i=0;i<p.count;i++)colors.push(c.r,c.g,c.b);raw.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const interior=new Float32Array(p.count).fill(1),surface=new Float32Array(p.count).fill(7),sourceTiles=new Float32Array(p.count).fill(-1);
  raw.setAttribute('aInterior',new THREE.BufferAttribute(interior,1));raw.setAttribute('aSurface',new THREE.BufferAttribute(surface,1));raw.setAttribute('aSourceTile',new THREE.BufferAttribute(sourceTiles,1));
  // Fleet's procedural atlas uses physical, continuous per-face UV coordinates.
  const normals=raw.getAttribute('normal'),uv:number[]=[];for(let i=0;i<p.count;i++){const top=Math.abs(normals.getY(i))>.65,side=Math.abs(normals.getX(i))>Math.abs(normals.getZ(i));uv.push((top?p.getX(i):side?p.getZ(i):p.getX(i))*12,(top?p.getZ(i):p.getY(i))*12);}raw.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const bucket=buckets.get(id)??{high:[],low:[]};if(writingLow)bucket.low.push(raw);else bucket.high.push(raw);buckets.set(id,bucket);return true;
 }
 const box=(id:string,x:number,y:number,z:number,w:number,h:number,l:number,color:number)=>w>=panel*.9&&h>panel*.5&&l>=panel*.9?add(new THREE.BoxGeometry(w,h,l).translate(x,y,z),id,color):false;
 const tank=(id:string,x:number,floor:number,z:number,r:number,h:number)=>{const g=new THREE.CylinderGeometry(r,r,h,10,1);g.translate(x,floor+panel/2+h/2,z);if(add(g,id,paint.tank)&&!writingLow)fuelTanks++;};
 for(let bay=0;bay<bayCount;bay++){
  const a=z0+bay*bayStep,b=a+bayStep,mid=(a+b)/2,id=`${kind}-interior-bay-${bay}`;
   // Solid floor edges are retained in both LODs: destruction must expose a
   // thickness-bearing grid of compartments, not disconnected top sheets.
  for(let deck=0;deck<deckCount;deck++){
   const floor=floors[deck],top=deck===deckCount-1?roof-panel*.55:floor+deckStep-gap;
   const strips=kind==='carrier'?5:4;
   for(let strip=0;strip<strips;strip++){
    const seam=panel*.06,sa=a+strip/strips*bayStep+seam,sb=a+(strip+1)/strips*bayStep-seam,w=hull.width(floor-panel/2,floor+panel/2,sa,sb);
    if(w&&box(id,(w[0]+w[1])/2,floor,(sa+sb)/2,w[1]-w[0],panel,sb-sa,paint.floor)){occupied.add(bay);occupiedLengths.push(sb-sa);floorRanges.push([sa,sb]);}
    // The upper ceiling closes authored open deck/turret wells from inside.
    // Intermediate floor slabs are also the ceiling of the compartment below.
    if(deck===deckCount-1){
     const ceiling=hull.width(roof-panel/2,roof+panel/2,sa,sb);
     if(ceiling&&box(id,(ceiling[0]+ceiling[1])/2,roof,(sa+sb)/2,ceiling[1]-ceiling[0],panel,sb-sa,paint.floor))ceilingPanels++;
    }
    // Conservative source-section widths create inset, solid side backing.
    // Each strip is fitted independently so neither bow nor stern is box-wrapped.
    const lining=hull.width(floor+panel/2,top,sa,sb);
    if(lining)for(const side of [-1,1]){
     const x=side<0?lining[0]+panel/2:lining[1]-panel/2;
     if(box(id,x,(floor+panel/2+top)/2,(sa+sb)/2,panel*1.01,top-floor-panel/2,sb-sa,paint.wall))sideLiners++;
    }
   }
   const wallY=(floor+panel/2+top)/2,wallH=top-floor-panel/2,wallSection=hull.width(floor+panel/2,top,a+gap,a+panel*2+gap);
   if(wallSection){
    const [left,right]=wallSection,center=(left+right)/2,door=Math.min((right-left)*.22,.04),doorH=wallH*.72;
    // Two full-height side panels and a lintel leave an actual doorway.
    const sideW=(right-left-door)/2-panel*1.6;
    box(id,left+panel*1.6+sideW/2,wallY,a+gap+panel,sideW,wallH,panel,paint.wall);
    box(id,right-panel*1.6-sideW/2,wallY,a+gap+panel,sideW,wallH,panel,paint.wall);
    box(id,center,top-(wallH-doorH)/2,a+gap+panel,door,wallH-doorH,panel,paint.trim);
   }
   const space=hull.width(floor+panel/2,top,a+gap*2,b-gap*2);if(!space)continue;
   const [left,right]=space,width=right-left,center=(left+right)/2,corridor=Math.min(.044,width*.24);
   if(width<.045||wallH<.016)continue;
   // Short port/starboard room partitions keep a walkable central longitudinal
   // passage. Gaps at either end connect it to each bulkhead doorway.
   const roomLength=bayStep*.67,partitionHeight=wallH*.86;
   for(const side of [-1,1])box(id,center+side*(corridor/2+panel),floor+panel/2+partitionHeight/2,mid,panel,partitionHeight,roomLength,paint.wall);
   const roomWidth=(width-corridor)/2-gap*4,roomHeight=wallH*.63;
   if(roomWidth<.012)continue;
   for(const side of [-1,1]){
    const roomX=center+side*(corridor/2+gap*2+roomWidth/2),roomZ=mid;
    if(bay>=bayCount*.48&&bay<bayCount*.78&&deck===0){
     // Engine/generator skid, block, top manifold: three connected low-poly
     // masses with a contrasting support frame, rather than one central cube.
     const w=roomWidth*.82,l=roomLength*.7;
     box(id,roomX,floor+panel/2+roomHeight*.15,roomZ,w,roomHeight*.3,l,paint.trim);
     if(box(id,roomX,floor+panel/2+roomHeight*.47,roomZ,w*.72,roomHeight*.35,l*.82,paint.engine))engineBlocks++;
     box(id,roomX,floor+panel/2+roomHeight*.70,roomZ,w*.4,roomHeight*.12,l*.7,paint.tank);
    }else if(bay<bayCount*.18||bay>bayCount*.8){
     box(id,roomX,floor+panel/2+roomHeight*.35,roomZ,roomWidth*.82,roomHeight*.7,roomLength*.62,paint.crate);
     if(deck===0)tank(id,roomX,floor,roomZ-roomLength*.3,Math.min(roomWidth*.25,roomLength*.12),roomHeight*.65);
    }else{
     // Two low berths/lockers with a clear room aisle; tertiary cushions only HIGH.
     const w=roomWidth*.84,l=roomLength*.26;
     if(deck===0&&bay%2===0)tank(id,roomX,floor,roomZ,Math.min(roomWidth*.17,roomLength*.07),roomHeight*.55);
     for(const offset of [-.23,.23]){
      box(id,roomX,floor+panel/2+roomHeight*.13,roomZ+roomLength*offset,w,roomHeight*.26,l,paint.trim);
      box(id,roomX,floor+panel/2+roomHeight*.29,roomZ+roomLength*offset,w*.92,roomHeight*.06,l*.9,paint.crew);
     }
    }
   }
  }
 }

 // LOW keeps two complete, solid deck levels and wide room blocks. It uses
 // conservative bay-wide source sections rather than deleting slab edge faces.
 // The smaller room count preserves thickness within the existing 3000-face cap.
 writingLow=true;
 for(let bay=0;bay<bayCount;bay++){
  const a=z0+bay*bayStep+gap,b=z0+(bay+1)*bayStep-gap,mid=(a+b)/2,id=`${kind}-interior-bay-${bay}`;
  const lowFloors=[floors[0],floors[deckCount-1]];
  for(let deck=0;deck<2;deck++){
   const floor=lowFloors[deck],top=Math.min(roof-panel*.55,floor+deckStep-gap);
   const slab=hull.width(floor-panel/2,floor+panel/2,a,b);
   if(slab)box(id,(slab[0]+slab[1])/2,floor,mid,slab[1]-slab[0],panel,b-a,paint.floor);
   if(deck===1){const ceiling=hull.width(roof-panel/2,roof+panel/2,a,b);if(ceiling)box(id,(ceiling[0]+ceiling[1])/2,roof,mid,ceiling[1]-ceiling[0],panel,b-a,paint.floor);}
   const section=hull.width(floor+panel/2,top,a,b);if(!section)continue;
   const [left,right]=section,width=right-left,center=(left+right)/2,wallH=top-floor-panel/2,wallY=(top+floor+panel/2)/2;
   if(wallH<panel||width<.03)continue;
   for(const x of [left+panel/2,right-panel/2])box(id,x,wallY,mid,panel,wallH,b-a,paint.wall);
   const doorway=Math.min(.04,width*.24),sideWidth=(width-doorway)/2-panel*1.6;
   for(const x of [left+panel*1.6+sideWidth/2,right-panel*1.6-sideWidth/2])box(id,x,wallY,a+panel,sideWidth,wallH,panel,paint.wall);
   if(deck===1)box(id,center,wallY,mid,panel,wallH,(b-a)*.6,paint.wall);
   if(deck===0&&bay>=bayCount*.48&&bay<bayCount*.78){
    for(const sign of [-1,1])box(id,center+sign*width*.25,floor+panel/2+wallH*.22,mid,width*.29,wallH*.44,(b-a)*.58,paint.engine);
   }else if(deck===0&&(bay===1||bay===bayCount-2)){
    for(const sign of [-1,1])tank(id,center+sign*width*.25,floor,mid,Math.min(width*.13,(b-a)*.2),wallH*.58);
   }
  }
 }
 // Small bridge floor tiles and transverse partitions fit nine sampled source
 // sections, and are rejected if any original source triangle touches the solid.
 // Both LODs retain this inexpensive structure; source paint/UVs stay untouched.
 writingBridge=true;
 const bb=hull.bridgeBounds,bridgeStep=.035,bridgeHeight=.034;
 if(!bb.isEmpty())for(let y=hull.deckHeight+.012;y<bb.max.y-.016;y+=bridgeHeight){
  const levelStart=bridgePanels;
  for(let z=bb.min.z+.006;z<bb.max.z-.02;z+=bridgeStep){
   const end=Math.min(z+bridgeStep-.003,bb.max.z-.005),mid=(z+end)/2;
   const sections=hull.superSection(y,mid);
   for(const [a,b]of sections){
    if(bridgePanels>=66||bridgePanels-levelStart>=12)break;let left=a+.0045,right=b-.0045;for(const yy of [y-panel/2,y+.021])for(const zz of [z,end]){const pair=hull.superSection(yy,zz).find(([l,r])=>(a+b)/2>l&&(a+b)/2<r);if(!pair){right=left;break;}left=Math.max(left,pair[0]+.0045);right=Math.min(right,pair[1]-.0045);}const x=(left+right)/2,w=Math.min(right-left,.30);if(w<.016)continue;
    // A second structural section above the floor proves this is an enclosed
    // storey, rather than an open catwalk or a narrow mast.
    if(!hull.superSection(y+.015,mid).some(([l,r])=>x>l+.003&&x<r-.003))continue;
    const id=`${kind}-interior-bridge-${Math.round(y*1000)}`;writingLow=false;
    if(box(id,x,y,mid,w,panel,end-z,paint.floor)){
     bridgePanels++;writingLow=true;box(id,x,y,mid,w,panel,end-z,paint.floor);writingLow=false;
     if(box(id,x,y+.022,mid,w,panel,end-z,paint.floor)){bridgePanels++;writingLow=true;box(id,x,y+.022,mid,w,panel,end-z,paint.floor);writingLow=false;}
     // Inset wall segments stop short of neighbouring floor slabs.
     for(const xx of [x-w/2+panel*.7,x+w/2-panel*.7])if(box(id,xx,y+.011,mid,panel,.016,end-z,paint.wall)){bridgePanels++;writingLow=true;box(id,xx,y+.011,mid,panel,.016,end-z,paint.wall);writingLow=false;}
     if(box(id,x,y+.011,z+panel*2,w-panel*3,.016,panel,paint.wall)){bridgePanels++;writingLow=true;box(id,x,y+.011,z+panel*2,w-panel*3,.016,panel,paint.wall);writingLow=false;}
    }
   }
  }
 }
 let highTriangles=0,lowTriangles=0;
 for(const [id,bucket] of buckets){
  const high=mergeGeometries(bucket.high,false)!;
  // LOW solids are independently source-contained. Blank LOW bays keep their
  // largest structural panel so damage reveal cannot expose an empty section.
  const low=mergeGeometries(bucket.low.length?bucket.low:[bucket.high[0]],false)!;
  high.computeBoundingBox();high.computeBoundingSphere();low.computeBoundingSphere();parts.push({id,bounds:high.boundingBox!.clone(),high,low});
  highTriangles+=high.getAttribute('position').count/3;lowTriangles+=low.getAttribute('position').count/3;
  new Set([...bucket.high,...bucket.low]).forEach(g=>g.dispose());
 }
 floorRanges.sort((a,b)=>a[0]-b[0]);let floorCoverage=0,lastEnd=-Infinity;for(const [a,b] of floorRanges){floorCoverage+=Math.max(0,b-Math.max(a,lastEnd));lastEnd=Math.max(lastEnd,b);}
 return {parts,diagnostics:{highTriangles,lowTriangles,parts:parts.length,deckHeight:hull.deckHeight,hullPart:hull.hullPart,acceptedSolids:accepted,rejectedSolids:rejected,sourceIntersectionChecks:hull.intersectionChecks,longitudinalCoverage:floorCoverage/span,averageDeckCoverage:occupiedLengths.reduce((a,b)=>a+b,0)/deckCount/span,occupiedBays:occupied.size,bayCount,bridgePanels,wallThickness:panel,decks:deckCount,ceilingPanels,sideLiners,engineBlocks,fuelTanks}};
}
