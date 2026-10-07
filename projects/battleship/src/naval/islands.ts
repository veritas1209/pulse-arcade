import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Cell} from '../contract';
import {CELL,HALF,key} from './fleet';
const hash=(x:number,z:number)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
const smooth=(a:number,b:number,x:number)=>THREE.MathUtils.smoothstep(x,a,b);
export function buildIslands(cells:Cell[]){const root=new THREE.Group();root.name='authoritative-island-terrain';const occupied=new Set(cells.map(key)),segments:[number,number,number,number][]=[];for(const c of cells){const x=c.x*CELL-HALF,z=c.z*CELL-HALF;if(!occupied.has(key({x:c.x-1,z:c.z})))segments.push([x,z,x,z+CELL]);if(!occupied.has(key({x:c.x+1,z:c.z})))segments.push([x+CELL,z,x+CELL,z+CELL]);if(!occupied.has(key({x:c.x,z:c.z-1})))segments.push([x,z,x+CELL,z]);if(!occupied.has(key({x:c.x,z:c.z+1})))segments.push([x,z+CELL,x+CELL,z+CELL]);}
 const distance=(x:number,z:number)=>{let d=1e9;for(const [ax,az,bx,bz] of segments){const dx=bx-ax,dz=bz-az,t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);d=Math.min(d,Math.hypot(x-ax-t*dx,z-az-t*dz));}return d;};
 // A continuous kernel field rounds the coastline inside the authoritative cell union.
 // The submerged border prevents any land from crossing into a navigable cell.
 const centers=cells.map(c=>[(c.x+.5)*CELL-HALF,(c.z+.5)*CELL-HALF]);
 const coastDistance=(x:number,z:number)=>{let density=0;for(const [cx,cz] of centers){const r2=(x-cx)**2+(z-cz)**2;if(r2<180)density+=Math.exp(-r2/18);}const boundary=distance(x,z)-.35,organic=(density-1.4)*3;return -Math.log(Math.exp(-boundary*1.8)+Math.exp(-organic*1.8))/1.8;};
 // Separate connected islands receive distinct elongated ridge groups. The
 // coast controls the low beach ramp, not a single cone rising to every center.
 const remaining=new Set(cells.map(key)),regions:{cx:number;cz:number;angle:number;length:number;width:number;seed:number}[]=[];
 for(const cell of cells){if(!remaining.delete(key(cell)))continue;const group=[cell];for(let i=0;i<group.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const next={x:group[i].x+dx,z:group[i].z+dz};if(remaining.delete(key(next)))group.push(next);}
  const cx=group.reduce((a,c)=>a+(c.x+.5)*CELL-HALF,0)/group.length,cz=group.reduce((a,c)=>a+(c.z+.5)*CELL-HALF,0)/group.length;
  let xx=0,zz=0,xz=0;for(const c of group){const x=(c.x+.5)*CELL-HALF-cx,z=(c.z+.5)*CELL-HALF-cz;xx+=x*x;zz+=z*z;xz+=x*z;}
  const angle=.5*Math.atan2(2*xz,xx-zz),ca=Math.cos(angle),sa=Math.sin(angle);let length=CELL,width=CELL;
  for(const c of group){const x=(c.x+.5)*CELL-HALF-cx,z=(c.z+.5)*CELL-HALF-cz;length=Math.max(length,Math.abs(x*ca+z*sa)+CELL*.5);width=Math.max(width,Math.abs(-x*sa+z*ca)+CELL*.5);}
  regions.push({cx,cz,angle,length,width,seed:hash(cx,cz)});
 }
 const terrainNoise=(x:number,z:number)=>{const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);};
 const heightCache=new Map<string,number>();
 const height=(x:number,z:number)=>{const id=`${x.toFixed(4)},${z.toFixed(4)}`,cached=heightCache.get(id);if(cached!==undefined)return cached;
  const d=coastDistance(x,z),beachWidth=2.25+(terrainNoise(x*.09,z*.09)-.5)*.45;
  const beach=-.12+smooth(-.22,beachWidth,d)*.28,interiorDistance=d<1.4||d>6.2?d:(d*4+coastDistance(x-.55,z)+coastDistance(x+.55,z)+coastDistance(x,z-.55)+coastDistance(x,z+.55))/8,interior=smooth(2.0,5.6,interiorDistance);
  let upland=0;for(const region of regions){const dx=x-region.cx,dz=z-region.cz,ca=Math.cos(region.angle),sa=Math.sin(region.angle),u=(dx*ca+dz*sa)/region.length,v=(-dx*sa+dz*ca)/region.width;
   if(Math.abs(u)>1.5||Math.abs(v)>1.5)continue;
   const warp=(terrainNoise(x*.14+region.seed*11,z*.14)-.5)*.12,U=u+warp,V=v-warp*.7;
   const ridge=Math.exp(-((U+.18)**2/.28+(V-.12)**2/.20))*(1.45+region.seed*.55);
   const shoulder=Math.exp(-((U-.37)**2/.075+(V+.18)**2/.10))*1.65;
   const knoll=Math.exp(-((U+.42)**2/.09+(V+.33)**2/.07))*.95;
   // Elevated broken ridgelines keep each connected island mountainous.
   // Independent summit offsets vary the silhouette without steepening the beach.
   const crest=Math.exp(-((U+.20-region.seed*.17)**2/.038+(V-.09)**2/.025))*(1.4+region.seed*.7);
   const spur=Math.exp(-((U-.35)**2/.026+(V+.18+region.seed*.08)**2/.035))*(.9+region.seed*.5);
   upland=Math.max(upland,(ridge+shoulder*.76+knoll*.80)*(2.65+region.seed*.65)+crest+spur);
  }
  const drainage=Math.pow(1-Math.abs(terrainNoise(x*.32,z*.32)*2-1),3)*.24,detail=(terrainNoise(x*.7,z*.7)-.5)*.11;
  const h=beach+interior*Math.max(.1,upland-drainage+detail);heightCache.set(id,h);return h;
 };
 const pos:number[]=[],cols:number[]=[],uvs:number[]=[];const sand=new THREE.Color(0xc8bd96),wet=new THREE.Color(0x797e69),rock=new THREE.Color(0x81857b),green=new THREE.Color(0x51794a);const step=12;
 // Props and the shore mask use the rendered triangles, avoiding floating roots.
 const terrainStep=CELL/step;
 const meshHeight=(x:number,z:number)=>{const ax=Math.floor((x+HALF)/terrainStep)*terrainStep-HALF,az=Math.floor((z+HALF)/terrainStep)*terrainStep-HALF,fx=(x-ax)/terrainStep,fz=(z-az)/terrainStep;const a=height(ax,az),b=height(ax+terrainStep,az),c=height(ax,az+terrainStep),d=height(ax+terrainStep,az+terrainStep);return fx+fz<=1?a+fx*(b-a)+fz*(c-a):d+(1-fx)*(c-d)+(1-fz)*(b-d);};
 const vertex=(x:number,z:number)=>{const h=height(x,z),d=coastDistance(x,z),slope=Math.hypot(height(x+.2,z)-height(x-.2,z),height(x,z+.2)-height(x,z-.2))/.4,c=wet.clone().lerp(sand,smooth(-.035,.24,h));if(d>1.45)c.lerp(green,smooth(1.45,2.8,d));c.lerp(rock,Math.max(smooth(.7,2.2,slope),smooth(3.8,5.3,h)*.95)*smooth(.8,2.4,d));c.multiplyScalar(.9+.07*Math.sin(x*.75+z*.51)+.04*Math.cos(z*1.6-x*.3));pos.push(x,h,z);cols.push(c.r,c.g,c.b);uvs.push(x*.16,z*.16);};
 for(const cell of cells)for(let z=0;z<step;z++)for(let x=0;x<step;x++){const ax=cell.x*CELL-HALF+x*CELL/step,az=cell.z*CELL-HALF+z*CELL/step,bx=ax+CELL/step,bz=az+CELL/step;vertex(ax,az);vertex(ax,bz);vertex(bx,az);vertex(bx,az);vertex(ax,bz);vertex(bx,bz);}
 let terrain=new THREE.BufferGeometry();terrain.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));terrain.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));terrain.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));const smoothTerrain=mergeVertices(terrain,1e-4);terrain.dispose();terrain=smoothTerrain;terrain.computeVertexNormals();
 // CC0 photographed coastal stone; shared by the whole terrain and all instanced outcrops.
 const loader=new THREE.TextureLoader(),base=import.meta.env.BASE_URL;
 const detailTexture=loader.load(`${base}materials/coast-v2-color.webp`),normalTexture=loader.load(`${base}materials/coast-v2-normal.webp`),roughTexture=loader.load(`${base}materials/coast-v2-roughness.webp`);
 detailTexture.colorSpace=THREE.SRGBColorSpace;for(const t of [detailTexture,normalTexture,roughTexture]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;}
 const groundMat=new THREE.MeshStandardMaterial({name:'photographed-coastal-strata',vertexColors:true,map:detailTexture,normalMap:normalTexture,normalScale:new THREE.Vector2(.34,.34),roughnessMap:roughTexture,roughness:1,metalness:0,envMapIntensity:.45});const land=new THREE.Mesh(terrain,groundMat);land.receiveShadow=true;land.castShadow=true;root.add(land);
 // Driftwood-colored bent trunks and curved palm fronds give scale without a forest draw-call explosion.
 const trunkGeo=new THREE.CylinderGeometry(.011,.019,1,5,2,true);trunkGeo.translate(0,.5,0);const trunkPos=trunkGeo.getAttribute('position'),trunkColors:number[]=[];for(let i=0;i<trunkPos.count;i++){const y=trunkPos.getY(i);trunkPos.setX(i,trunkPos.getX(i)+y*y*.09);const shade=.7+.18*Math.sin(y*59);trunkColors.push(shade,shade*.94,shade*.79);}trunkGeo.setAttribute('color',new THREE.Float32BufferAttribute(trunkColors,3));trunkGeo.computeVertexNormals();const trunkMat=new THREE.MeshStandardMaterial({color:0x8c8971,vertexColors:true,roughness:.98});
 // Feathered fronds have narrow separated leaflets, not solid toy-like paddles.
 const leafPos:number[]=[],leafColors:number[]=[];for(let leaf=0;leaf<7;leaf++){const angle=leaf/7*Math.PI*2;const point=(f:number,side:number,width:number)=>{const r=f*2,w=width*side;return [Math.cos(angle)*r+Math.sin(angle)*w,Math.sin(f*Math.PI)*.4-f*f*.85,Math.sin(angle)*r-Math.cos(angle)*w];};for(let j=0;j<4;j++){const t=j/4,u=(j+1)/4,mid=(t+u)*.5,width=Math.sin((mid*.8+.1)*Math.PI)*.34;for(const side of [-1,1]){leafPos.push(...point(t,0,0),...point(u,0,0),...point(mid+.13,side,width));for(let k=0;k<3;k++)leafColors.push(.74+mid*.16,.82+mid*.1,.64+mid*.1);}}}
 const leafGeo=new THREE.BufferGeometry();leafGeo.setAttribute('position',new THREE.Float32BufferAttribute(leafPos,3));leafGeo.setAttribute('color',new THREE.Float32BufferAttribute(leafColors,3));leafGeo.computeVertexNormals();const leafMat=new THREE.MeshStandardMaterial({color:0x526c39,vertexColors:true,roughness:.89,side:THREE.DoubleSide});leafMat.onBeforeCompile=shader=>{shader.uniforms.uWind={value:0};leafMat.userData.shader=shader;shader.vertexShader='uniform float uWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 float phase=0.;
 #ifdef USE_INSTANCING
 phase=instanceMatrix[3].x+instanceMatrix[3].z;
 #endif
 transformed.y += sin(uWind*1.7+phase+position.x*2.1+position.z)*length(position.xz)*.045;`);};leafMat.customProgramCacheKey=()=> 'naval-palm-feather-wind-v2';
 // A fixed per-cell budget trades oversized outcrops for denser palm clusters.
 // Trunks span 14-27 m, crown radii 4-7 m at the fleet's physical scale.
 const treeLimit=Math.max(1,Math.floor(cells.length*1.67));
 const treeCells=cells.filter(c=>{const x=(c.x+.5)*CELL-HALF,z=(c.z+.5)*CELL-HALF;return distance(x,z)>1.8&&height(x,z)<6&&hash(c.x,c.z)>.14;});
 const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,treeLimit),leaves=new THREE.InstancedMesh(leafGeo,leafMat,treeLimit);
 const dummy=new THREE.Object3D();let treeCount=0;
 for(let j=0;j<8;j++)for(const c of treeCells){
  if(treeCount>=treeLimit)continue;
  const clusterX=(hash(c.x,7)-.5)*2.3,clusterZ=(hash(c.z,9)-.5)*2.3;
  const x=(c.x+.5)*CELL-HALF+clusterX+(hash(c.x+j*3,17)-.5)*.75,z=(c.z+.5)*CELL-HALF+clusterZ+(hash(c.z+j*3,29)-.5)*.75,h=meshHeight(x,z);
  if(h<.10||h>1.5||distance(x,z)<.35)continue;
  const size=.17+hash(c.x+j,c.z)*.15;
  dummy.position.set(x,h-.0045,z);dummy.rotation.set(.07*Math.sin(x),hash(x,z)*6.28,.08*Math.cos(z));dummy.scale.setScalar(size);dummy.updateMatrix();trunks.setMatrixAt(treeCount,dummy.matrix);
  const crown=new THREE.Vector3(.09*size,size,0).applyEuler(dummy.rotation);dummy.position.add(crown);dummy.rotation.x=0;dummy.rotation.z=0;dummy.scale.setScalar(.025+hash(z,x)*.017);dummy.updateMatrix();leaves.setMatrixAt(treeCount,dummy.matrix);leaves.setColorAt(treeCount,new THREE.Color().setHSL(.23,.19,.57+hash(x,z)*.18));treeCount++;
 }
 trunks.name='coastal-palm-trunks';leaves.name='coastal-palm-crowns';trunks.count=leaves.count=treeCount;trunks.castShadow=true;leaves.castShadow=true;root.add(trunks,leaves);
 // Broadleaf crowns: lobed, layered silhouettes with shaded lower foliage.
 // One 20-triangle crown plus a 6-triangle trunk per tree; no alpha cards/maps.
 const crownPositions:number[]=[],crownColors:number[]=[],crownIndices:number[]=[];
 const crownRings=[{y:.14,r:.70},{y:.62,r:1}];
 for(let ring=0;ring<2;ring++)for(let j=0;j<5;j++){const angle=j/5*Math.PI*2,r=crownRings[ring].r*(.88+hash(j+ring*11,73)*.23),y=crownRings[ring].y+(hash(j+ring*13,79)-.5)*.1;const c=new THREE.Color(0x2d5035).multiplyScalar(.66+ring*.16+hash(j,ring+81)*.15);crownPositions.push(Math.cos(angle)*r,y,Math.sin(angle)*r);crownColors.push(c.r,c.g,c.b);}
 crownPositions.push(.06,1.,-.05,0,.03,0);crownColors.push(.032,.086,.039,.012,.027,.013);
 for(let j=0;j<5;j++){const next=(j+1)%5,a=j,b=next,c=5+j,d=5+next;crownIndices.push(a,c,b,b,c,d);}
 for(let j=0;j<5;j++){const next=(j+1)%5;crownIndices.push(5+j,10,5+next,next,11,j);}
 const canopyGeo=new THREE.BufferGeometry();canopyGeo.setAttribute('position',new THREE.Float32BufferAttribute(crownPositions,3));canopyGeo.setAttribute('color',new THREE.Float32BufferAttribute(crownColors,3));canopyGeo.setIndex(crownIndices);canopyGeo.computeVertexNormals();
 const forestTrunkGeo=new THREE.CylinderGeometry(.015,.022,1,3,1,true);forestTrunkGeo.translate(0,.5,0);
 const canopyMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,envMapIntensity:.3}),forestTrunkMat=new THREE.MeshStandardMaterial({color:0x746953,roughness:1});
 const forestLimit=Math.max(1,Math.floor(cells.length*6)),canopies=new THREE.InstancedMesh(canopyGeo,canopyMat,forestLimit),forestTrunks=new THREE.InstancedMesh(forestTrunkGeo,forestTrunkMat,forestLimit);
 let forestCount=0;const planted=new Map<string,number[][]>();let minTreeHeight=Infinity,maxTreeHeight=0;
 // Jittered samples follow coherent grove density, with broad light gaps. A
 // small spatial rejection radius stops crowns piling up at identical roots.
 for(let candidate=0;candidate<70;candidate++)for(const c of cells){if(forestCount>=forestLimit)continue;
  const x=(c.x+hash(c.x*71+candidate,c.z+103))*CELL-HALF,z=(c.z+hash(c.z*79+candidate,c.x+137))*CELL-HALF,h=meshHeight(x,z),d=coastDistance(x,z);
  if(h<.14||h>5.1||d<1.45)continue;if(hash(x+149,z+73)<smooth(4.1,5.1,h))continue;const slope=Math.hypot(meshHeight(x+.12,z)-meshHeight(x-.12,z),meshHeight(x,z+.12)-meshHeight(x,z-.12))/.24;if(slope>.92)continue;
  const grove=terrainNoise(x*.16+31,z*.16-17);if(hash(x+candidate,z+211)>.45+grove*.52)continue;
  const bx=Math.floor(x/.22),bz=Math.floor(z/.22);let crowded=false;for(let dz=-1;dz<=1&&!crowded;dz++)for(let dx=-1;dx<=1&&!crowded;dx++)for(const p of planted.get(`${bx+dx},${bz+dz}`)??[])if((x-p[0])**2+(z-p[1])**2<.20*.20){crowded=true;break;}if(crowded)continue;
  const heightMeters=10+hash(x+13,z+19)*14,treeHeight=heightMeters/84.583,crownRadius=(6+hash(x+53,z+59)*8)/84.583,crownHeight=treeHeight*(.52+hash(x,z+7)*.16),trunkHeight=treeHeight-crownHeight*.90;
  dummy.position.set(x,h-.004,z);dummy.rotation.set(0,hash(x,z)*Math.PI*2,0);dummy.scale.set(treeHeight*.8,trunkHeight,treeHeight*.8);dummy.updateMatrix();forestTrunks.setMatrixAt(forestCount,dummy.matrix);
  dummy.position.y=h+trunkHeight-crownHeight*.10;dummy.scale.set(crownRadius*(.85+hash(x+41,z)*.3),crownHeight,crownRadius*(.9+hash(x,z+41)*.2));dummy.updateMatrix();canopies.setMatrixAt(forestCount,dummy.matrix);canopies.setColorAt(forestCount,new THREE.Color().setHSL(.24+hash(x+9,z)*.055,.22+hash(z,x)*.16,.75+hash(x,z+29)*.2));
  const bucket=`${bx},${bz}`,entries=planted.get(bucket)??[];entries.push([x,z]);planted.set(bucket,entries);forestCount++;minTreeHeight=Math.min(minTreeHeight,heightMeters);maxTreeHeight=Math.max(maxTreeHeight,heightMeters);
 }
 canopies.name='mixed-broadleaf-canopy';forestTrunks.name='mixed-broadleaf-trunks';canopies.count=forestTrunks.count=forestCount;canopies.castShadow=true;canopies.receiveShadow=true;root.add(canopies,forestTrunks);
 // The mass of a kilometre-scale forest is a continuous canopy, with the
 // individual crowns above retained for foreground silhouettes. Clip groves to
 // a smooth terrain/density field; edges return to the actual ground surface.
 // Periodic lattice noise avoids seams at the foliage texture repeat boundary.
 const foliageNoise=(u:number,v:number,period:number,seed:number)=>{const x=u*period,z=v*period,ix=Math.floor(x),iz=Math.floor(z),fx=smooth(0,1,x-ix),fz=smooth(0,1,z-iz),at=(a:number,b:number)=>hash(a%period+seed,b%period+seed*3);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iz),at(ix+1,iz),fx),THREE.MathUtils.lerp(at(ix,iz+1),at(ix+1,iz+1),fx),fz);};
 const forestPixels=new Uint8Array(128*128*4);
 for(let z=0;z<128;z++)for(let x=0;x<128;x++){const u=x/128,v=z/128,cluster=foliageNoise(u,v,4,93),leaf=foliageNoise(u,v,17,47),fine=foliageNoise(u,v,49,29),shade=.50+cluster*.26+leaf*.17+fine*.07,i=(z*128+x)*4;forestPixels[i]=Math.round(shade*.94*255);forestPixels[i+1]=Math.round(shade*255);forestPixels[i+2]=Math.round(shade*.88*255);forestPixels[i+3]=Math.round((.65+fine*.35)*255);}
 const forestTexture=new THREE.DataTexture(forestPixels,128,128);forestTexture.wrapS=forestTexture.wrapT=THREE.RepeatWrapping;forestTexture.magFilter=THREE.LinearFilter;forestTexture.minFilter=THREE.LinearMipmapLinearFilter;forestTexture.generateMipmaps=true;forestTexture.anisotropy=4;forestTexture.needsUpdate=true;
 // Jittered overlapping crown domes contribute real convex normals. Valleys
 // between neighboring crowns retain a darker woody understory tone.
 const crownCache=new Map<string,{dome:number;variation:number}>();
 const crownShape=(x:number,z:number)=>{const id=`${x.toFixed(5)},${z.toFixed(5)}`,cached=crownCache.get(id);if(cached)return cached;const spacing=.205,gx=Math.floor(x/spacing),gz=Math.floor(z/spacing);let dome=0,variation=0;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const cx=gx+dx,cz=gz+dz,seed=hash(cx+191,cz+73),px=(cx+.2+hash(cx+37,cz)*.6)*spacing,pz=(cz+.2+hash(cx,cz+31)*.6)*spacing,radius=.125+seed*.055,r2=((x-px)**2+(z-pz)**2)/(radius*radius),cap=Math.pow(Math.max(0,1-r2),.65);if(cap>dome){dome=cap;variation=seed;}}const result={dome,variation};crownCache.set(id,result);return result;};
 type CanopyPoint={x:number;z:number;density:number};
 const canopyThreshold=.24,canopyField=(x:number,z:number)=>{const h=meshHeight(x,z),d=coastDistance(x,z),grove=terrainNoise(x*.29+71,z*.29-31);return smooth(1.75,2.9,d)*smooth(.12,.26,h)*smooth(.32,.62,grove)*(1-smooth(4.1,5.1,h))*(.82+terrainNoise(x*3.8+91,z*3.8+17)*.30);};
 // Three canopy subdivisions per terrain edge keep every canopy triangle on a
 // single ground plane, avoiding terrain intersections on the steep ridges.
 const pointCache=new Map<string,CanopyPoint>(),canopyPositions:number[]=[],canopyVertexColors:number[]=[],canopyUvs:number[]=[];
 const canopyPoint=(gx:number,gz:number)=>{const key=`${gx},${gz}`;let point=pointCache.get(key);if(!point){const x=gx/9-HALF,z=gz/9-HALF;point={x,z,density:canopyField(x,z)};pointCache.set(key,point);}return point;};
 let canopyMinLift=Infinity,canopyMaxLift=0,canopyCoveredSamples=0,canopyEligibleSamples=0;
 const canopyVertex=(p:CanopyPoint)=>{const base=meshHeight(p.x,p.z),shape=crownShape(p.x,p.z),edge=smooth(canopyThreshold,.66,p.density),rise=.075+shape.dome*(.10+shape.variation*.08),lift=.004+rise*edge,c=new THREE.Color(0x34362a).lerp(new THREE.Color(0x385a3b),smooth(.12,.84,shape.dome)).multiplyScalar(.83+shape.variation*.26);canopyPositions.push(p.x,base+lift,p.z);canopyVertexColors.push(c.r,c.g,c.b,smooth(canopyThreshold,.42,p.density));canopyUvs.push(p.x+base*.35,p.z+base*.18);canopyMinLift=Math.min(canopyMinLift,lift);canopyMaxLift=Math.max(canopyMaxLift,lift);};
 const canopyTriangle=(a:CanopyPoint,b:CanopyPoint,c:CanopyPoint)=>{const input=[a,b,c],clipped:CanopyPoint[]=[];for(let j=0;j<3;j++){const from=input[j],to=input[(j+1)%3],inside=from.density>=canopyThreshold,nextInside=to.density>=canopyThreshold;if(inside)clipped.push(from);if(inside!==nextInside){const t=(canopyThreshold-from.density)/(to.density-from.density);clipped.push({x:THREE.MathUtils.lerp(from.x,to.x,t),z:THREE.MathUtils.lerp(from.z,to.z,t),density:canopyThreshold});}}for(let j=1;j<clipped.length-1;j++){const a=clipped[0],b=clipped[j],c=clipped[j+1];if((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)<1e-7)continue;canopyVertex(clipped[0]);canopyVertex(clipped[j]);canopyVertex(clipped[j+1]);}};
 for(const cell of cells)for(let z=0;z<36;z++)for(let x=0;x<36;x++){const gx=cell.x*36+x,gz=cell.z*36+z,a=canopyPoint(gx,gz),b=canopyPoint(gx,gz+1),c=canopyPoint(gx+1,gz),d=canopyPoint(gx+1,gz+1);canopyTriangle(a,b,c);canopyTriangle(c,b,d);const mx=(gx+.5)/9-HALF,mz=(gz+.5)/9-HALF;if(meshHeight(mx,mz)>.14&&meshHeight(mx,mz)<4.1&&coastDistance(mx,mz)>2.8){canopyEligibleSamples++;if(canopyField(mx,mz)>=canopyThreshold)canopyCoveredSamples++;}}
 let forestSurfaceGeo=new THREE.BufferGeometry();forestSurfaceGeo.setAttribute('position',new THREE.Float32BufferAttribute(canopyPositions,3));forestSurfaceGeo.setAttribute('color',new THREE.Float32BufferAttribute(canopyVertexColors,4));forestSurfaceGeo.setAttribute('uv',new THREE.Float32BufferAttribute(canopyUvs,2));const joinedForest=mergeVertices(forestSurfaceGeo,1e-6);forestSurfaceGeo.dispose();forestSurfaceGeo=joinedForest;forestSurfaceGeo.computeVertexNormals();
 const forestSurfaceMat=new THREE.MeshStandardMaterial({name:'dense-layered-forest-canopy',map:forestTexture,vertexColors:true,alphaTest:.28,roughness:.96,metalness:0,envMapIntensity:.22}),forestSurface=new THREE.Mesh(forestSurfaceGeo,forestSurfaceMat);forestSurface.name='continuous-forest-canopy';forestSurface.receiveShadow=true;root.add(forestSurface);
 // Angular stratified outcrops and coastal boulders share one instance draw call.
 const rockGeo=new THREE.IcosahedronGeometry(1,1),rp=rockGeo.getAttribute('position');for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),factor=.86+hash(x*13,z*17)*.18;rp.setXYZ(i,Math.sign(x)*Math.pow(Math.abs(x),.78)*factor+y*.22,y*(.93+.07*Math.sin(y*15)),Math.sign(z)*Math.pow(Math.abs(z),.8)*factor);}rockGeo.computeVertexNormals();const rockMat=new THREE.MeshStandardMaterial({color:0x92958a,map:detailTexture,normalMap:normalTexture,normalScale:new THREE.Vector2(.42,.42),roughnessMap:roughTexture,roughness:1});const rocks=new THREE.InstancedMesh(rockGeo,rockMat,Math.max(1,Math.floor(cells.length*.85)));let rockCount=0;for(let j=0;j<3;j++)for(const c of cells){if(rockCount>=rocks.instanceMatrix.count)continue;const x=(c.x+.5)*CELL-HALF+(hash(c.x+j,21)-.5)*2.5,z=(c.z+.5)*CELL-HALF+(hash(c.z+j,25)-.5)*2.5,d=distance(x,z),h=meshHeight(x,z);if(h<.05||hash(c.x+j,c.z+19)<.37)continue;const large=hash(c.x+j,c.z+61)>.94&&coastDistance(x,z)>2.5;const radius=Math.min(d*.40,large?.22+hash(c.x+j,1)*.12:.035+hash(c.x+j,1)*.115);const rockBase=Math.min(h,meshHeight(x-radius*.6,z),meshHeight(x+radius*.6,z),meshHeight(x,z-radius*.6),meshHeight(x,z+radius*.6));dummy.position.set(x,rockBase+radius*.08,z);dummy.rotation.set(hash(c.x+j,c.z)*.6,hash(c.z,c.x+j)*6.28,hash(c.x+j,3)*.35);dummy.scale.set(radius*(.8+hash(c.x,j)*.3),radius*(.55+hash(c.x,4)*.55),radius*.7);dummy.updateMatrix();rocks.setMatrixAt(rockCount++,dummy.matrix);}rocks.name='coastal-boulders';rocks.count=rockCount;rocks.castShadow=true;rocks.receiveShadow=true;root.add(rocks);
 const scrubGeo=new THREE.IcosahedronGeometry(1,0),scrubMat=new THREE.MeshStandardMaterial({color:0x3d5030,roughness:1,flatShading:true}),scrub=new THREE.InstancedMesh(scrubGeo,scrubMat,Math.max(1,Math.floor(cells.length*1.5)));let scrubCount=0;for(let j=0;j<4;j++)for(const c of cells){if(scrubCount>=scrub.instanceMatrix.count)continue;const x=(c.x+.5)*CELL-HALF+(hash(c.x+j,47)-.5)*3.1,z=(c.z+.5)*CELL-HALF+(hash(c.z+j,53)-.5)*3.1,h=meshHeight(x,z);if(h<.6||h>5||coastDistance(x,z)<1.5)continue;const r=.025+hash(x,z)*.045;dummy.position.set(x,h+r*.3,z);dummy.rotation.set(0,hash(x,z)*6.28,0);dummy.scale.set(r,r*.6,r*.9);dummy.updateMatrix();scrub.setMatrixAt(scrubCount,dummy.matrix);scrub.setColorAt(scrubCount,new THREE.Color().setHSL(.24+hash(z,x)*.035,.19,.43+hash(x,z)*.15));scrubCount++;}scrub.name='coastal-low-scrub';scrub.count=scrubCount;scrub.receiveShadow=true;root.add(scrub);
 for(const mesh of [trunks,leaves,canopies,forestTrunks,rocks,scrub]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
 // Rasterize the real terrain triangles, not the distance-field proxy:
 // its former foam center was below the sea and made the coast read concave.
 // RG: foam at height zero and dry land. B: submerged sand. A: key-light shadow.
 const texSize=192,data=new Uint8Array(texSize*texSize*4),heights=new Float32Array(texSize*texSize),texel=120/texSize;

 for(let z=0;z<texSize;z++)for(let x=0;x<texSize;x++){const wx=(x+.5)*texel-HALF,wz=(z+.5)*texel-HALF;const inside=occupied.has(key({x:Math.floor((wx+HALF)/CELL),z:Math.floor((wz+HALF)/CELL)}));heights[z*texSize+x]=inside?meshHeight(wx,wz):-20;}
 const sampleHeight=(x:number,z:number)=>{const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,at=(a:number,b:number)=>a>=0&&b>=0&&a<texSize&&b<texSize?Math.max(0,heights[b*texSize+a]):0;return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iz),at(ix+1,iz),fx),THREE.MathUtils.lerp(at(ix,iz+1),at(ix+1,iz+1),fx),fz);};
 for(let z=0;z<texSize;z++)for(let x=0;x<texSize;x++){const h=heights[z*texSize+x],i=(z*texSize+x)*4;let shadow=0;
  // Directional occlusion only: remove the old all-around dark contact ring.
  for(let tap=1;tap<=8;tap++){const reach=tap*.8,terrain=sampleHeight(x-reach*.809/texel,z-reach*.588/texel);shadow=Math.max(shadow,smooth(-.5,.9,terrain-reach*1.25)*(1-tap/10));}
  const foam=Math.exp(-(((h+.015)/.085)**2)),land=smooth(-.025,.10,h),submerged=Math.exp(Math.min(0,h)*8)*(1-smooth(-.015,.035,h));
  data[i]=Math.round(foam*255);data[i+1]=Math.round(land*255);data[i+2]=Math.round(submerged*255);data[i+3]=Math.round(shadow*.42*255);
 }
 const shore=new THREE.DataTexture(data,texSize,texSize);shore.minFilter=shore.magFilter=THREE.LinearFilter;shore.needsUpdate=true;
 return{root,shore,cells:cells.length,trees:treeCount+forestCount,palms:treeCount,broadleafTrees:forestCount,forestHeightMeters:[Number.isFinite(minTreeHeight)?minTreeHeight:0,maxTreeHeight],drawCalls:8,forestCanopy:{triangles:canopyPositions.length/9,midIslandCoverage:canopyCoveredSamples/Math.max(1,canopyEligibleSamples),minLift:canopyMinLift,maxLift:canopyMaxLift,textureSize:128},rocks:rockCount,scrubs:scrubCount,texturesReady:()=>[detailTexture,normalTexture,roughTexture].every(t=>!!t.image?.complete&&t.image.naturalWidth>0),triangles:pos.length/9+treeCount*(trunkGeo.index!.count/3+leafPos.length/9)+rockCount*rp.count/3+scrubCount*20+forestCount*(crownIndices.length/3+forestTrunkGeo.index!.count/3)+canopyPositions.length/9,update(time:number){if(leafMat.userData.shader)leafMat.userData.shader.uniforms.uWind.value=time;},dispose(){detailTexture.dispose();normalTexture.dispose();roughTexture.dispose();forestTexture.dispose();root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});groundMat.dispose();trunkMat.dispose();leafMat.dispose();canopyMat.dispose();forestTrunkMat.dispose();forestSurfaceMat.dispose();rockMat.dispose();scrubMat.dispose();shore.dispose();}};
}

