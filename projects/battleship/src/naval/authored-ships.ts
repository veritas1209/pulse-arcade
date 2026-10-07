import * as THREE from 'three';
import type { Kit } from './kit';

type V = [number, number, number];
type Role = Parameters<Kit['box']>[3];

/** A closed, eight-corner solid. Every hull panel has an inner skin and four rims. */
function solid(a: V[], b: V[]): THREE.BufferGeometry {
  const vertices = [...a, ...b].flat();
  const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  // Correct orientation even when a mirrored hull strip reverses its winding.
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const p = new THREE.Vector3(...([...a, ...b][indices[i]]));
    const q = new THREE.Vector3(...([...a, ...b][indices[i + 1]]));
    const r = new THREE.Vector3(...([...a, ...b][indices[i + 2]]));
    volume += p.dot(q.cross(r));
  }
  if (volume < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geo.setIndex(indices);
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

function deck(k: Kit, g: THREE.Group, polygon: [number, number][], y: number, thickness: number, role: Role) {
  const s = new THREE.Shape();
  polygon.forEach(([x,z], i) => i ? s.lineTo(x,-z) : s.moveTo(x,-z));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s,{depth:thickness, bevelEnabled:false,steps:1});
  geo.rotateX(-Math.PI / 2);
  geo.translate(0,y - thickness/2,0);
  return k.mesh(g,geo,role);
}

function p(k: Kit, id: string, name: string, at: V = [0,0,0], layer = 1) {
  return k.part(id,name,layer,at,[]);
}

function pipe(k: Kit, g: THREE.Group, a: V, b: V, r: number, role: Role, r2 = r) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const d = to.clone().sub(from);
  const mesh = k.cyl(g,r2,r,d.length(),from.add(to).multiplyScalar(.5).toArray() as V,role,12);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return mesh;
}

function windows(k: Kit,g: THREE.Group,span: number,y: number,z: number,n = 8) {
  for(let i=0;i<n;i++) k.box(g,[span/n*.63,.19,.07],[-span/2+(i+.5)*span/n,y,z],'glass');
}

function vents(k: Kit,g: THREE.Group,x: number,y: number,z: number,w: number,d: number,n = 5) {
  k.box(g,[w,.08,d],[x,y,z],'dark');
  for(let i=0;i<n;i++) k.box(g,[w*.87,.065,.08],[x,y+.065,z-d*.42+i*d*.84/(n-1)],'stone');
}

function turret(k: Kit,id: string,at: V,scale = 1,barrels = 2,angle = 0,role: Role = 'stone') {
  const g = p(k,id,'포탑 · 회전식 함포',at);
  k.cyl(g,1.02*scale,1.12*scale,.3*scale,[0,.1*scale,0],'dark',16);
  deck(k,g,[[-1,-.75],[-.82,-1.05],[.82,-1.05],[1,.5],[.65,.85],[-.65,.85]].map(([x,z])=>[x*scale,z*scale]),.65*scale,.88*scale,role);
  for(let i=0;i<barrels;i++) {
    const x=(i-(barrels-1)/2)*.48*scale;
    pipe(k,g,[x,.71*scale,-.7*scale],[x,.92*scale,-3.45*scale],.13*scale,'stone',.09*scale);
    pipe(k,g,[x,.72*scale,-.75*scale],[x,.77*scale,-1.35*scale],.18*scale,'dark');
  }
  k.box(g,[1.1*scale,.09,.6*scale],[0,1.13*scale,.05],'cream');
  g.rotation.y=angle;
  return g;
}

function antenna(k: Kit,id: string,at: V,height = 4,radar = true) {
  const g=p(k,id,'통신 마스트와 레이더',at);
  pipe(k,g,[0,0,0],[0,height,0],.14,'stone',.06);
  k.beam(g,[-1.15,height*.7,0],[1.15,height*.7,0],.1,'stone');
  k.beam(g,[0,height*.38,-.7],[0,height*.8,0],.1,'stone');
  k.beam(g,[0,height*.38,0],[0,height*.38,-.7],.12,'stone');g.children[g.children.length-1].userData.structuralSupport=true;
  if(radar) {
    k.box(g,[1.6,.85,.15],[0,height*.91,0],'navy');
    for(let i=0;i<5;i++) k.box(g,[.06,.75,.05],[-.66+i*.33,height*.91,.11],'stone');
    k.box(g,[1.66,.06,.06],[0,height*.91,.13],'cream');
  }
  k.cyl(g,.12,.12,.18,[0,height+.08,0],'coral',8);
}

/** Segmented, hollow displacement hull. Keel, chine, side and deck are all removable. */
function navalHull(k: Kit,prefix: string,length: number,width: number,deckY: number,role: Role,carrier = false) {
  const n=10, z0=-length/2, step=length/n;
  const widthAt=(z: number) => {
    const t=(z+length/2)/length;
    const f=t<.17 ? .07+.93*Math.sin(t/.17*Math.PI/2) : t>.85 ? 1-(t-.85)/.15*.3 : 1;
    return width*f;
  };
  for(let i=0;i<n;i++) {
    const za=z0+i*step,zb=z0+(i+1)*step;
    const wa=widthAt(za),wb=widthAt(zb);
    for(const side of [-1,1]) {
      const section=(z:number,w:number): V[]=>[[side*.12,-2.45,z],[side*w*.65,-1.7,z],[side*w,.1,z],[side*w,deckY-.10,z]];
      const aa=section(za,wa),bb=section(zb,wb);
      for(let band=0;band<3;band++) {
        const g=p(k,`${prefix}-hull-${i}-${side}-${band}`,'선체 · 곡면 장갑 패널',[0,0,0],3);
        const outer=[aa[band],bb[band],bb[band+1],aa[band+1]];
        const inner=outer.map(v=>[v[0]-side*.17,v[1]+(band===0?.14:0),v[2]] as V);
        k.mesh(g,solid(outer,inner),band===0?'red':role);
        if(band===0 && side===1) k.box(g,[.28,.16,step+.012],[0,-2.42,(za+zb)/2],'red');
        if(band===1) {
          k.beam(g,[side*wa*.922,-.3,za+.09],[side*wb*.922,-.3,zb-.09],.065,'navy');
        }
        if(band===2 && i>1) {
          for(let q=0;q<3;q++) k.box(g,[.055,.14,.25],[side*(wa+(wb-wa)*(q+.5)/3+.02),deckY-.72,za+(zb-za)*(q+.5)/3],'dark');
        }
      }
    }
    const g=p(k,`${prefix}-deck-${i}`,'주갑판 · 분리식 구획',[0,0,0],2);
    const widening=carrier ? .45 : 0;
    if(carrier && i>1 && i<9) {
      // The flight deck is the hangar roof; leave its center genuinely open below.
      for(const side of [-1,1]) deck(k,g,[[side*(wa-.72),za],[side*(wa+widening),za],[side*(wb+widening),zb],[side*(wb-.72),zb]],deckY,.23,'stone');
      k.beam(g,[-wa+.16,deckY-.22,(za+zb)/2],[wb-.16,deckY-.22,(za+zb)/2],.19,'stone');
    } else deck(k,g,[[-wa-widening,za],[wa+widening,za],[wb+widening,zb],[-wb-widening,zb]],deckY,.23,carrier?'navy':'wood');
    if(i>1 && i<9 && !carrier) for(const side of [-1,1]) k.railing(g,[side*(wa-.14),deckY+.15,za],[side*(wb-.14),deckY+.15,zb],.32,'stone');
    if(i>1 && i<8) {
      const rib=p(k,`${prefix}-rib-${i}`,'내부 횡방향 늑골',[0,0,0],5);
      k.beam(rib,[-wa*.75,-1.05,za+.28],[wa*.75,-1.05,za+.28],.18,'stone');
      for(const side of [-1,1]) k.beam(rib,[side*wa*.75,-1.05,za+.28],[side*wa*.88,deckY-.42,za+.28],.16,'stone');
    }
  }
  // End plates close the finite-width stem and the full-depth stern without filling the hull.
  const endProfile=(w:number):[number,number][]=>[[-.14,-2.49],[.14,-2.49],[w*.65,-1.7],[w,.1],[w,deckY-.085],[-w,deckY-.085],[-w,.1],[-w*.65,-1.7]];
  const bow=p(k,`${prefix}-stem-plate`,'선수 수밀 마감 외판',[0,0,z0+.025],3);
  k.shape(bow,endProfile(widthAt(z0)+.018),.18,[0,0,0],'stone',0);
  const stern=p(k,`${prefix}-transom`,'함미 트랜섬',[0,0,0],3);
  k.shape(stern,endProfile(widthAt(length/2)+.012),.2,[0,0,length/2],'stone',0);
  for(const side of [-1,1]) {
    const g=p(k,`${prefix}-propeller-${side}`,'프로펠러와 추진축',[side*width*.43,-1.6,length/2-.2],4);
    pipe(k,g,[0,0,-2],[0,0,1.5],.17,'stone');
    for(let b=0;b<4;b++) {
      const blade=k.box(g,[1.6,.24,.18],[0,0,1.45],'gold',.06);blade.rotation.z=b*Math.PI/2+.35;
    }
    k.mesh(g,new THREE.SphereGeometry(.24,10,8),'gold',[0,0,1.6]);
  }
  navalInteriors(k,prefix,length,width,deckY,carrier);
  navalBowDetails(k,prefix,length,width,deckY);
}

function jet(k: Kit,id: string,at: V,angle=0) {
  const g=p(k,id,'함재 전투기',at,0);
  pipe(k,g,[0,.23,-1.3],[0,.23,1.1],.2,'cream',.26);
  k.mesh(g,new THREE.SphereGeometry(.24,12,8),'glass',[0,.39,-.3]).scale.set(.8,.8,1.7);
  deck(k,g,[[-.18,-.55],[-1.35,.64],[-1.24,.92],[-.16,.5],[.16,.5],[1.24,.92],[1.35,.64],[.18,-.55]],.22,.09,'stone');
  deck(k,g,[[-.12,.6],[-.65,1.24],[.65,1.24],[.12,.6]],.34,.08,'cream');
  const fin=k.shape(g,[[0,0],[.66,.72],[.84,0]],.075,[0,.36,.52],'navy',0);fin.rotation.y=-Math.PI/2;
  pipe(k,g,[0,.2,1.02],[0,.2,1.15],.14,'dark');
  for(const side of [-1,1]) pipe(k,g,[side*.8,.22,.3],[side*.8,.22,.9],.075,'white');
  k.box(g,[.4,.12,.16],[0,.02,.65],'dark');g.rotation.y=angle;
}

export function buildCarrier(k: Kit) {
  navalHull(k,'cv',42,4.7,1.65,'stone',true);
  // The asymmetric waist and port cantilever form the recognizable angled landing deck.
  for(let i=0;i<8;i++) {
    const za=-19.6+i*5,zb=za+5;
    const port=(z:number)=>z< -13?-4.1:z<6?-6.25: -5.4;
    const stbd=(z:number)=>z< -13?4.25:5.35;
    const g=p(k,`cv-flight-deck-${i}`,'비행 갑판 · 착함 구획',[0,0,0],1);
    deck(k,g,[[port(za),za],[stbd(za),za],[stbd(zb),zb],[port(zb),zb]],2.1,.32,'navy');
    // Integral closed under-deck band overlaps the hull and catwalk roof line.
    deck(k,g,[[port(za),za],[stbd(za),za],[stbd(zb),zb],[port(zb),zb]],1.735,.43,'stone');
    for(const x of [-2.1,.7]) k.box(g,[.095,.035,4.65],[x,2.28,(za+zb)/2],'cream');
    for(let q=0;q<2;q++) k.box(g,[.18,.045,.78],[-.7,2.285,za+1+q*2.5],'white');
    for(const side of [-1,1]) for(let q=0;q<3;q++) k.box(g,[.13,.08,.26],[side*(side<0?-port(za)-.14:stbd(za)-.14),2.31,za+.5+q*1.55],'gold');
  }
  for(let i=0;i<7;i++) {
    const z=-8+i*3.8,x=-3.3+(z+8)*.14;
    const g=p(k,`cv-angled-runway-${i}`,'사선 착함 유도선',[x,2.295,z],0);
    for(const side of [-1,1]) {const m=k.box(g,[.12,.055,3.6],[side*1.38,0,0],'cream');m.rotation.y=.14;}
    const center=k.box(g,[.13,.056,1.4],[0,.008,0],'gold');center.rotation.y=.14;
    if(i>3) k.box(g,[3,.07,.055],[0,.08,0],'stone');
  }
  for(let j=0;j<3;j++) {
    const g=p(k,`cv-elevator-${j}`,'갑판 가장자리 항공기 엘리베이터',[j===0?-5.7:5.35,1.95,-6+j*10],1);
    k.box(g,[2.3,.26,3.7],[0,0,0],'stone');
    for(const side of [-1,1]) k.box(g,[.08,.045,3.5],[side*1.04,.17,0],'gold');
    k.box(g,[2,.045,.09],[0,.17,-1.66],'gold');
    for(let q=0;q<3;q++) k.box(g,[.2,.6,.25],[.5-q*.5,-.4,-1.8],'dark');
  }
  for(let level=0;level<4;level++) {
    const g=p(k,`cv-island-${level}`,'우현 항공모함 아일랜드',[3.68,2.5+level*.82,-2+level*.35],1);
    g.userData.supportFootprint=[2.2-level*.24,6.2-level*.72];k.box(g,[2.2-level*.24,.76,6.2-level*.72],[0,0,0],'stone',.12);
    if(level>1) {windows(k,g,1.76-level*.1,.12,-(6.2-level*.72)/2-.05,7);windows(k,g,1.76-level*.1,.12,(6.2-level*.72)/2+.05,7);}
    for(const side of [-1,1]) k.box(g,[.08,.15,3.7],[side*(1.1-level*.12+.025),.12,0],'glass');
  }
  antenna(k,'cv-forward-mast',[3.7,5.9,-2.3],3.5);
  antenna(k,'cv-aft-mast',[3.7,5.9,1.8],2.6);
  const dome=p(k,'cv-radome','위성 통신 레이돔',[3.65,6.25,.05],0);
  k.cyl(dome,.34,.45,.4,[0,0,0],'stone',12);k.mesh(dome,new THREE.SphereGeometry(.64,16,10),'cream',[0,.62,0]);
  const stack=p(k,'cv-exhaust','아일랜드 배기통',[3.75,5.7,2.7],1);k.box(stack,[1.5,1.1,1.2],[0,0,0],'stone',.13);vents(k,stack,0,.6,0,1.25,.9);
  for(let i=0;i<10;i++) jet(k,`cv-aircraft-${i}`,[i<5?3:-4.8,2.42,i<5?-16+i*3.3:2+(i-5)*3.7],i<5?-.18:Math.PI*.66);
  for(const side of [-1,1]) for(let i=0;i<3;i++) {
    const g=p(k,`cv-sponson-${side}-${i}`,'측면 방어 포대 스폰슨',[side*5.15,1.2,-11+i*13],2);
    deck(k,g,[[-.9,-1.3],[.9,-1.3],[1.2,1.2],[-1.2,1.2]],0,.3,'stone');
    k.beam(g,[0,-1.25,0],[side*.7,-.1,0],.24,'stone');
    turret(k,`cv-ciws-${side}-${i}`,[side*5.2,1.45,-11+i*13],.38,1,side*Math.PI/2,'cream');
  }
}

function vls(k:Kit,id:string,at:V,rows=4,cols=4) {
  const g=p(k,id,'수직 발사관 모듈',at,1);
  k.box(g,[cols*.5+.15,.23,rows*.56+.15],[0,0,0],'dark');
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
    k.box(g,[.44,.105,.48],[(c-(cols-1)/2)*.5,.16,(r-(rows-1)/2)*.56],'stone');
    k.box(g,[.17,.035,.055],[(c-(cols-1)/2)*.5,.23,(r-(rows-1)/2)*.56+.12],'cream');
  }
}

function navalSuper(k:Kit,prefix:string,at:V,w:number,l:number,levels:number) {
  for(let j=0;j<levels;j++) {
    const g=p(k,`${prefix}-super-${j}`,'중앙 함교와 장갑 지휘실',[at[0],at[1]+j*.86,at[2]+j*.3],1);
    const width=w-j*.43,len=l-j*.7;g.userData.supportFootprint=[width,len];
    deck(k,g,[[-width/2+.25,-len/2],[width/2-.25,-len/2],[width/2,-len/2+.7],[width/2,len/2],[-width/2,len/2],[-width/2,-len/2+.7]],0,.78,'stone');
    if(j===levels-1) {windows(k,g,width-.5,.12,-len/2-.04,8);windows(k,g,width-.5,.12,len/2+.04,8);}
    for(const side of [-1,1]) {k.box(g,[.055,.17,len*.58],[side*(width/2+.02),.1,0],j===levels-1?'glass':'dark');k.railing(g,[side*width/2,.48,-len*.3],[side*width/2,.48,len*.35],.28,'cream');}
  }
}

function funnel(k:Kit,id:string,at:V,w:number,d:number,h:number) {
  const g=p(k,id,'경사진 연돌과 배기 그릴',at,1);
  k.mesh(g,solid([[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2]],[[-w*.4,h,-d*.3],[w*.4,h,-d*.3],[w*.4,h,d*.7],[-w*.4,h,d*.7]]),'stone');
  k.box(g,[w*.86,.3,d*1.05],[0,h+.06,d*.2],'dark',.1);
  vents(k,g,0,h+.25,d*.2,w*.71,d*.78);
}

export function buildDestroyer(k: Kit) {
  navalHull(k,'dd',36,3.15,1.1,'stone');
  turret(k,'dd-main-gun',[0,1.43,-12.7],.84,1,0,'cream');
  vls(k,'dd-forward-vls',[0,1.39,-8],5,5);
  navalSuper(k,'dd-bridge',[0,1.95,-2.4],5.1,7.2,3);
  // Four sloping phased-array faces on a pyramidal integrated mast.
  const tower=p(k,'dd-integrated-mast','통합 위상배열 레이더 마스트',[0,4.1,-2.1],0);
  k.mesh(tower,solid([[-1.2,0,-1.1],[1.2,0,-1.1],[1.2,0,1.1],[-1.2,0,1.1]],[[-.63,2.7,-.55],[.63,2.7,-.55],[.63,2.7,.55],[-.63,2.7,.55]]),'cream');
  for(let face=0;face<4;face++) {
    const t=face*Math.PI/2;
    const panel=k.box(tower,[1.15,1.3,.07],[Math.sin(t)*.91,1.45,Math.cos(t)*.86],'navy');panel.rotation.set(-.2*Math.cos(t),t,.2*Math.sin(t));
  }
  antenna(k,'dd-mast-antenna',[0,6.85,-2.1],2.9);
  funnel(k,'dd-forward-funnel',[0,3.4,2.3],2.3,2.5,1.7);
  funnel(k,'dd-aft-funnel',[0,2.8,7.1],2.15,2.45,1.5);
  for(const side of [-1,1]) {
    const missiles=p(k,`dd-antiship-${side}`,'대함 미사일 경사 발사관',[side*1.7,2,4.1],1);
    // Welded deck foundation, two inclined cradles and clamps share the launcher part ID.
    k.box(missiles,[1.35,.16,1.68],[side*.2,-.715,.58],'stone');
    const axis=new THREE.Vector3(side,1,1.15).normalize();
    for(const t of [.18,.82]){const x=side*(-.3+t),z=t*1.15,top=.84+t;
      k.beam(missiles,[x,-.66,z],[x,top,z],.15,'navy');
      k.beam(missiles,[side*(-.40),-.64,.03],[x,top-.2,z],.12,'stone');
      for(let i=0;i<4;i++){const collar=k.mesh(missiles,new THREE.TorusGeometry(.197,.027,5,12),'dark',[x,i*.28+t,z]);collar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis);}
    }
    for(let i=0;i<4;i++) pipe(k,missiles,[side*-.3,i*.28,0],[side*.7,1+i*.28,1.15],.19,'stone');
    const boat=p(k,`dd-rhib-${side}`,'고속 단정과 진수 크레인',[side*2.2,1.6,8.9],1);
    deck(k,boat,[[-.45,-1.2],[0,-1.65],[.45,-1.2],[.5,1.3],[-.5,1.3]],.15,.38,'dark');k.box(boat,[.55,.4,.65],[0,.48,.1],'cream');k.beam(boat,[0,0,1.6],[0,1.8,1.6],.12,'stone');k.beam(boat,[0,1.8,1.6],[-side*.8,1.8,1],.12,'stone');
    turret(k,`dd-ciws-${side}`,[side*2.4,2.2,1.8],.37,1,side*Math.PI/2,'cream');
  }
  vls(k,'dd-aft-vls',[0,1.39,10.9],3,4);
  const hangar=p(k,'dd-helicopter-hangar','헬리콥터 격납고',[0,1.9,8.7],1);
  k.box(hangar,[3.8,1.55,3.8],[0,0,0],'stone',.12);k.box(hangar,[2.8,1.22,.075],[0,-.03,1.94],'dark');
  for(let i=0;i<5;i++) k.box(hangar,[2.64,.06,.08],[0,-.5+i*.24,2],'cream');
  const helipad=p(k,'dd-helicopter-pad','함미 헬리패드',[0,1.3,14.5],0);
  k.torus(helipad,1.68,.045,[0,0,0],'cream',[-Math.PI/2,0,0]);
  for(const x of [-.45,.45]) k.box(helipad,[.12,.06,1.45],[x,0,0],'cream');k.box(helipad,[1,.06,.12],[0,0,0],'cream');
  const helo=p(k,'dd-helicopter','함재 대잠 헬리콥터',[0,1.41,14.4],0);
  k.mesh(helo,new THREE.SphereGeometry(.6,14,10),'cream',[0,.35,0]).scale.set(.75,.8,1.5);
  k.mesh(helo,new THREE.SphereGeometry(.45,12,8),'glass',[0,.5,-.57]).scale.set(.8,.75,.75);
  pipe(k,helo,[0,.4,.6],[0,.7,2],.17,'stone',.07);k.box(helo,[.08,.7,.52],[0,.95,1.8],'stone');
  pipe(k,helo,[0,.8,0],[0,1.12,0],.08,'dark');
  for(let i=0;i<2;i++) {const r=k.box(helo,[3.6,.06,.16],[0,1.15,0],'dark');r.rotation.y=i*Math.PI/2+.3;}
  for(const side of [-1,1]) {k.beam(helo,[side*.37,-.15,-.4],[side*.37,-.15,.7],.09,'dark');k.beam(helo,[side*.37,-.15,0],[side*.32,.2,0],.07,'stone');}
}

export function buildBattleship(k: Kit) {
  navalHull(k,'bb',42,4,1.25,'stone');
  turret(k,'bb-main-turret-a',[0,1.65,-13.3],1.34,3);
  const barbette=p(k,'bb-turret-b-barbette','상부 주포탑 바베트',[0,1.55,-7.8],2);k.cyl(barbette,1.54,1.72,.95,[0,.25,0],'stone',20);
  turret(k,'bb-main-turret-b',[0,2.6,-7.8],1.24,3);
  turret(k,'bb-main-turret-x',[0,1.65,13.4],1.34,3,Math.PI);
  navalSuper(k,'bb-superstructure',[0,2.05,-1.4],5.4,9.4,4);
  const bridge=p(k,'bb-command-bridge','전함 지휘탑과 관측소',[0,5.6,-2.1],0);
  k.cyl(bridge,1.3,1.5,.65,[0,0,0],'cream',12);windows(k,bridge,1.8,.12,-1.15,6);
  k.box(bridge,[3.4,.37,.85],[0,.65,0],'stone',.1);
  for(const side of [-1,1]) pipe(k,bridge,[side*1.35,.7,-.45],[side*1.35,.7,.6],.25,'navy');
  antenna(k,'bb-foremast',[0,6.2,-.8],4.7);
  // Tripod legs retain the characteristic 20th-century battleship silhouette.
  const tripod=p(k,'bb-tripod','三각 관측 마스트 지지대',[0,0,0],1);
  for(const side of [-1,1]) k.beam(tripod,[side*1.5,4.4,1.4],[0,8.2,-.8],.2,'stone');
  funnel(k,'bb-forward-stack',[0,4.5,3.2],2.6,2.5,2.1);
  funnel(k,'bb-rear-stack',[0,3.25,7.1],2.3,2.5,2.1);
  antenna(k,'bb-aft-mast',[0,4.9,8.8],3.4);
  for(const side of [-1,1]) for(let i=0;i<4;i++) {
    turret(k,`bb-secondary-${side}-${i}`,[side*2.8,1.8,-4.4+i*4.2],.53,2,side*Math.PI/2);
    const aa=p(k,`bb-aa-platform-${side}-${i}`,'대공포 원형 플랫폼',[side*3.3,2,-5.8+i*5],1);
    k.cyl(aa,.58,.62,.2,[0,0,0],'stone',16);
    k.cyl(aa,.17,.22,.45,[0,.31,0],'navy',12);
    for(const dx of [-.12,.12]) pipe(k,aa,[dx,.47,0],[dx+side*.55,.9,.2],.045,'dark');
    k.railing(aa,[-.45,.13,.35],[.45,.13,.35],.25,'cream');
  }
  for(const side of [-1,1]) for(let i=0;i<2;i++) {
    const boat=p(k,`bb-boat-${side}-${i}`,'함재 구명정',[side*2.1,3.12,2.1+i*2.3],1);
    deck(k,boat,[[-.37,-.9],[0,-1.3],[.37,-.9],[.37,.9],[0,1.1],[-.37,.9]],0,.3,'cream');k.box(boat,[.48,.09,1.3],[0,.2,0],'wood');
    for(const z of [-.55,.55]) k.box(boat,[.66,.08,.15],[0,.3,z],'stone');
  }
  const crane=p(k,'bb-crane','함미 정찰기 회수 크레인',[1.7,1.6,17.4],1);
  k.cyl(crane,.35,.52,.9,[0,.35,0],'stone',12);k.beam(crane,[0,.8,0],[0,3.5,0],.22,'stone');k.beam(crane,[0,3.5,0],[-3,2.9,-.8],.18,'stone');k.beam(crane,[0,2.4,0],[-2.8,2.95,-.75],.12,'stone');
  const catapult=p(k,'bb-catapult','정찰기 사출 레일',[-1.5,1.6,17.4],1);
  for(const x of [-.25,.25]) k.box(catapult,[.12,.25,3.8],[x,.2,0],'stone');
  for(let i=0;i<6;i++) k.box(catapult,[.7,.12,.12],[0,.2,-1.6+i*.62],'dark');
  jet(k,'bb-scout-plane',[-1.5,2.06,17.4],Math.PI);
  for(const side of [-1,1]) {
    const chain=p(k,`bb-anchor-${side}`,'선수 앵커와 윈치',[side*1.05,1.51,-18.3],1);
    k.cyl(chain,.3,.36,.35,[0,.14,0],'dark',12);k.box(chain,[.07,.065,1.6],[0,.1,-.65],'stone');
    for(let i=0;i<6;i++) k.torus(chain,.1,.025,[0,.16,-.2-i*.19],'stone',[Math.PI/2,0,i%2*Math.PI/2]);
  }
}

/** Room-sized modules are separate gameplay parts; fittings belong to their module. */
function roomModule(k:Kit,id:string,at:V,w:number,d:number,kind:'berth'|'store'|'control'|'workshop',height=.9) {
  const names={berth:'승조원 침실 · 이층 침대',store:'보급품 보관실 · 선반',control:'제어실 · 계기 콘솔',workshop:'정비실 · 작업대'};
  const g=p(k,id,names[kind],at,6);
  const top=height;
  // Furnishings, room shell, ceiling and door are independently dismantlable.
  const roomH=height+.22,wall=.075,doorW=Math.min(.65,w*.56);
  k.box(g,[w+.12,.08,d+.12],[0,-.025,0],'navy');
  const walls=p(k,`${id}-walls`,'선실 외벽 · 출입구 프레임',at,5);
  for(const side of [-1,1]) k.box(walls,[wall,roomH,d+.15],[side*(w/2+.04),roomH/2,0],'cream');
  k.box(walls,[w+.15,roomH,wall],[0,roomH/2,d/2+.04],'cream');
  for(const side of [-1,1]) k.box(walls,[(w+.15-doorW)/2,roomH,wall],[side*(doorW/2+(w+.15-doorW)/4),roomH/2,-d/2-.04],'cream');
  k.box(walls,[doorW,.14,wall],[0,roomH-.07,-d/2-.04],'cream');
  const ceiling=p(k,`${id}-ceiling`,'선실 탈착식 천장',at,4);
  k.box(ceiling,[w+.15,.09,d+.15],[0,roomH+.015,0],'stone');
  const door=p(k,`${id}-door`,'선실 수밀 출입문',at,4);
  k.box(door,[doorW+.04,roomH-.105,.085],[0,(roomH-.105)/2,-d/2-.045],'stone');
  k.box(door,[.055,.13,.045],[doorW*.27,roomH*.42,-d/2-.105],'gold');
  if(kind==='berth') {
    for(const side of [-1,1]) {
      const x=side*w*.29;
      for(const y of [.17,top*.75]) {
        k.box(g,[w*.36,.09,d*.79],[x,y,0],'stone');
        k.box(g,[w*.32,.09,d*.7],[x,y+.09,0],'teal');
        k.box(g,[w*.29,.06,d*.15],[x,y+.16,-d*.25],'cream');
      }
      for(const z of [-d*.38,d*.38]) k.box(g,[.07,top,.07],[x,top/2,z],'stone');
    }
    k.box(g,[w*.18,top*.7,d*.36],[0,top*.35,d*.22],'cream');
    k.box(g,[.04,.12,.04],[.055,top*.4,d*.41],'gold');
  } else if(kind==='store') {
    for(const side of [-1,1]) {
      const x=side*w*.3;
      for(const y of [.1,top*.55]) {
        k.box(g,[w*.39,.07,d*.83],[x,y,0],'stone');
        for(let n=0;n<3;n++) {
          const z=(n-1)*d*.255;
          k.box(g,[w*.29,top*.3,d*.2],[x,y+top*.19,z],n===1?'wood':'cream',.025);
          k.box(g,[w*.295,.045,.07],[x,y+top*.21,z+d*.105],'dark');
        }
      }
      for(const z of [-d*.42,d*.42]) k.box(g,[.07,top,.07],[x,top/2,z],'stone');
    }
  } else if(kind==='control') {
    for(const side of [-1,1]) {
      const x=side*w*.3;
      k.box(g,[w*.4,top*.58,d*.75],[x,top*.29,0],'navy',.05);
      for(let n=0;n<3;n++) {
        const z=(n-1)*d*.22;
        k.box(g,[w*.29,.055,d*.15],[x,top*.6,z],'glass');
        k.box(g,[.09,.065,.045],[x-side*w*.12,top*.62,z],'gold');
      }
    }
    k.box(g,[w*.2,.07,d*.35],[0,top*.28,0],'dark');
    k.box(g,[.075,top*.28,.075],[0,top*.14,0],'stone');
  } else {
    k.box(g,[w*.86,.11,d*.64],[0,top*.57,0],'wood');
    for(const x of [-w*.34,w*.34]) for(const z of [-d*.25,d*.25]) k.box(g,[.09,top*.55,.09],[x,top*.27,z],'stone');
    k.box(g,[w*.36,top*.36,d*.5],[-w*.21,top*.22,0],'teal');
    k.box(g,[w*.22,.17,d*.27],[w*.16,top*.73,0],'stone');
    for(let n=0;n<3;n++) k.box(g,[.09,.065,d*.2],[-w*.23+n*.13,top*.67,0],'dark');
    k.box(g,[w*.63,top*.32,.1],[0,top*.85,d*.35],'cream');
  }
}

function machinery(k:Kit,id:string,at:V,w:number,d:number,h:number,kind:'engine'|'tank'|'pump'|'reactor'='engine') {
  const g=p(k,id,kind==='reactor'?'반응로 · 냉각 계통':kind==='tank'?'연료 탱크 · 압력 용기':kind==='pump'?'보조 펌프 · 배관 유닛':'기관실 · 추진 엔진',at,6);
  k.box(g,[w,.12,d],[0,.06,0],'dark');
  if(kind==='tank') {
    for(const side of [-1,1]) {
      const x=side*w*.25,r=w*.2;
      k.cyl(g,r,r,h*.68,[x,h*.42,0],'cream',12);
      k.mesh(g,new THREE.SphereGeometry(r,12,8),'cream',[x,h*.76,0]).scale.y=.45;
      k.torus(g,r+.025,.035,[x,h*.45,0],'stone',[Math.PI/2,0,0]);
      pipe(k,g,[x,h*.87,0],[x,h*.87,d*.3],.055,'teal');
    }
  } else if(kind==='reactor') {
    k.cyl(g,w*.32,w*.38,h*.77,[0,h*.47,0],'navy',16);
    for(let n=0;n<4;n++) k.torus(g,w*.35,.055,[0,h*.2+n*h*.18,0],'gold',[Math.PI/2,0,0]);
    k.cyl(g,w*.15,w*.15,h*.65,[0,h*.48,0],'glass',12);
    for(const side of [-1,1]) {
      pipe(k,g,[side*w*.41,.17,-d*.32],[side*w*.41,h*.82,-d*.32],.065,'teal');
      pipe(k,g,[side*w*.41,h*.82,-d*.32],[0,h*.82,-d*.32],.065,'teal');
    }
  } else {
    pipe(k,g,[0,h*.43,-d*.34],[0,h*.43,d*.34],w*.31,'stone');
    for(let n=0;n<4;n++) {
      const z=-d*.3+n*d*.2;
      k.box(g,[w*.76,h*.24,.12],[0,h*.56,z],'cream');
      k.torus(g,w*.325,.034,[0,h*.43,z],'dark');
    }
    for(const side of [-1,1]) {
      pipe(k,g,[side*w*.38,h*.43,-d*.32],[side*w*.38,h*.43,d*.31],.055,'teal');
      k.box(g,[.1,h*.27,d*.64],[side*w*.43,h*.28,0],'stone');
    }
    k.box(g,[w*.43,.12,d*.38],[0,h*.86,0],kind==='pump'?'coral':'navy');
    pipe(k,g,[0,h*.43,d*.34],[0,h*.43,d*.46],w*.11,'gold');
  }
}

function bulkhead(k:Kit,id:string,at:V,half:number,h:number,door=.8) {
  const g=p(k,id,'수밀 격벽 · 실제 통행 개구부',at,5);
  const wall=half-door/2;
  for(const side of [-1,1]) {
    k.box(g,[wall,h,.12],[side*(door/2+wall/2),h/2,0],'cream');
    k.box(g,[.065,h-.1,.065],[side*(door/2+.07),h/2,.09],'stone');
    k.box(g,[Math.max(.13,wall*.52),.06,.035],[side*(door/2+wall/2),h*.63,.085],'navy');
  }
  k.box(g,[door,.2,.12],[0,h-.1,0],'cream');
  k.box(g,[door+.08,.065,.065],[0,h-.24,.09],'gold');
}

function navalInteriors(k:Kit,prefix:string,length:number,width:number,deckY:number,carrier:boolean) {
  const floorY=-.93,step=length*.088,first=-length*.325;
  const ceiling=deckY-.31,clear=ceiling-floorY;
  const profile=(z:number)=>{const t=(z+length/2)/length;return t<.17?.07+.93*Math.sin(t/.17*Math.PI/2):t>.85?1-(t-.85)/.15*.3:1;};
  for(let bay=0;bay<9;bay++) {
    const z=first+bay*step,depth=step-.17;
    const half=width*Math.min(profile(z-depth/2),profile(z+depth/2))*.74-.13;
    const floor=p(k,`${prefix}-interior-floor-${bay}`,'내부 층 바닥 · 중앙 통로',[0,floorY,z],5);
    k.box(floor,[half*2,.15,depth],[0,0,0],carrier?'stone':'navy');
    for(const x of [-.45,.45]) k.box(floor,[.045,.018,depth-.12],[x,.085,0],'gold');
    for(const side of [-1,1]) k.box(floor,[.11,.11,depth-.06],[side*(half-.08),.12,0],'stone');
    // All upper fittings leave the two aisle strips clear for reachable fasteners.
    if(bay<8) bulkhead(k,`${prefix}-interior-bulkhead-${bay}`,[0,floorY+.1,z+depth/2+.045],half,clear-.14,carrier?2.35:.88);
    const rooms=carrier && bay>1 && bay<7;
    if(rooms) {
      // Full-width hangar bays are divided by open portals, not sealed solid boxes.
      const gantry=p(k,`${prefix}-interior-gantry-${bay}`,'격납고 천장 크레인 · 배관',[0,ceiling-.08,z],4);
      for(const side of [-1,1]) {
        k.box(gantry,[.16,.15,depth],[side*(half-.3),0,0],'stone');
        pipe(k,gantry,[side*(half-.49),-.13,-depth*.4],[side*(half-.49),-.13,depth*.4],.055,'teal');
      }
      k.box(gantry,[half*1.75,.17,.2],[0,-.14,.5],'gold');
      k.box(gantry,[.55,.23,.38],[.65,-.33,.5],'stone');
      const aircraft=p(k,`${prefix}-interior-hangar-aircraft-${bay}`,'격납고 함재기 · 접힌 날개',[bay%2?-.75:.75,floorY+.28,z],6);
      pipe(k,aircraft,[0,.26,-1.05],[0,.26,1.05],.18,'cream',.24);
      k.mesh(aircraft,new THREE.SphereGeometry(.19,12,8),'glass',[0,.41,-.4]).scale.z=1.6;
      deck(k,aircraft,[[-.14,-.35],[-.78,.54],[-.62,.83],[.62,.83],[.78,.54],[.14,-.35]],.24,.08,'stone');
      for(const side of [-1,1]) {
        const wing=k.box(aircraft,[.07,.52,.58],[side*.68,.52,.56],'cream');wing.rotation.z=side*.15;
        k.box(aircraft,[.12,.18,.17],[side*.3,.06,.57],'dark');
      }
      k.box(aircraft,[.08,.6,.49],[0,.63,.91],'navy');
      const x=bay%2?half-.59:-half+.59;
      roomModule(k,`${prefix}-interior-hangar-service-${bay}`,[x,floorY+.11,z],.91,depth*.64,bay%2?'workshop':'store',.92);
    } else {
      for(const side of [-1,1]) {
        const x=side*(.57+(half-.63)/2),w=half-.73;
        if(bay===4||bay===5) machinery(k,`${prefix}-interior-engine-${bay}-${side}`,[x,floorY+.12,z],w*.82,depth*.77,Math.min(1.35,clear*.69),bay===4?'engine':'tank');
        else roomModule(k,`${prefix}-interior-room-${bay}-${side}`,[x,floorY+.12,z],w*.88,depth*.76,(['store','berth','berth','control','workshop','store','workshop','store','store'] as const)[bay],Math.min(1.03,clear*.59));
        const wall=p(k,`${prefix}-interior-passage-${bay}-${side}`,'중앙 복도 · 구획 벽과 배관',[side*.48,floorY+.1,z],5);
        for(const end of [-1,1]) k.box(wall,[.075,clear*.74,depth*.25],[0,clear*.37,end*depth*.37],'cream');
        k.box(wall,[.11,.13,depth*.96],[0,clear*.77,0],'stone');
        pipe(k,wall,[side*.11,clear*.65,-depth*.43],[side*.11,clear*.65,depth*.43],.035,'teal');
      }
    }
  }
  // Lower machinery occupies the narrow keel volume below the working deck.
  for(let bay=0;bay<4;bay++) {
    const z=-length*.13+bay*length*.125;
    machinery(k,`${prefix}-interior-bilge-${bay}`,[0,-2.08,z],Math.min(1.75,width*.5),length*.075,.72,bay%2?'pump':'tank');
  }
  if(!carrier) {
    const magazine=p(k,`${prefix}-interior-magazine`,'함포 탄약 이송실',[0,-.75,-length*.36],6);
    k.box(magazine,[1.05,.15,1.55],[0,0,0],'stone');
    for(let q=0;q<6;q++) {
      const x=(q%2-.5)*.37,z=(Math.floor(q/2)-1)*.43;
      k.cyl(magazine,.12,.12,.52,[x,.33,z],'gold',10);
      k.mesh(magazine,new THREE.ConeGeometry(.12,.2,10),'stone',[x,.69,z]);
    }
  }
}

function navalBowDetails(k:Kit,prefix:string,length:number,width:number,deckY:number) {
  for(const side of [-1,1]) {
    const g=p(k,`${prefix}-bow-ground-tackle-${side}`,'선수 앵커·체인 수납 구획',[side*width*.43,deckY+.15,-length*.395],1);
    k.box(g,[.8,.12,1.7],[0,0,0],'stone');
    k.cyl(g,.25,.31,.36,[0,.21,.34],'navy',12);
    for(let q=0;q<6;q++) k.torus(g,.09,.027,[0,.105,-.62+q*.15],'dark',[Math.PI/2,q%2*Math.PI/2,0]);
    k.box(g,[.49,.13,.61],[side*.05,.13,-.68],'cream');
    k.box(g,[.23,.06,.13],[side*.05,.23,-.68],'gold');
    const anchorHalf=width*(.07+.93*Math.sin(.126/.17*Math.PI/2))+.06;
    const anchor=p(k,`${prefix}-bow-anchor-${side}`,'선측 앵커·호스 파이프',[side*anchorHalf,.16,-length*.374],2);
    k.torus(anchor,.24,.07,[0,0,0],'dark',[0,Math.PI/2,0]);
    k.beam(anchor,[side*.07,-.15,0],[side*.07,-.72,.08],.1,'stone');
    k.beam(anchor,[side*.07,-.68,-.27],[side*.07,-.68,.35],.11,'stone');
    for(const z of [-.27,.35]) k.beam(anchor,[side*.07,-.7,z],[side*.07,-.45,z*.7],.1,'stone');
  }
  const hatch=p(k,`${prefix}-foredeck-access`,'선수 작업 갑판 · 점검 해치',[0,deckY+.18,-length*.445],1);
  k.box(hatch,[width*.61,.12,1.3],[0,0,0],'stone');
  k.box(hatch,[width*.5,.07,1.02],[0,.1,0],'cream');
  for(const z of [-.38,.38]) k.box(hatch,[.42,.07,.08],[0,.17,z],'dark');
}


/** Complete above-deck load paths in the original source coordinates; every fitting owns its supports. */
export function attachNavalSupports(k:Kit,kind:'carrier'|'battleship'|'destroyer'){
  const deckTop=kind==='carrier'?2.26:kind==='battleship'?1.365:1.215;
  const ray=new THREE.Raycaster(),audit:{id:string;bottom:number;base:number;gap:number;meshes:number}[]=[];
  const candidates=k.root.children.filter((g):g is THREE.Group=>g instanceof THREE.Group&&/mast|radome|main-gun|main-turret|secondary|ciws|aa-platform|vls|super-|island-|command-bridge|funnel|stack|exhaust|rhib|boat-|crane|catapult|anchor-|scout-plane/.test(String(g.userData.partId??''))&&!/interior/.test(String(g.userData.partId??'')));
  candidates.sort((a,b)=>new THREE.Box3().setFromObject(a).min.y-new THREE.Box3().setFromObject(b).min.y);
  for(const g of candidates){k.root.updateMatrixWorld(true);const id=String(g.userData.partId),box=new THREE.Box3().setFromObject(g),size=box.getSize(new THREE.Vector3()),bottom=box.min.y;if(bottom<=deckTop+.015)continue;const x=g.position.x,z=g.position.z;
    ray.set(new THREE.Vector3(x,bottom+.012,z),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=Math.max(.02,bottom-deckTop+.05);
    const other=k.root.children.filter(o=>o!==g&&!/interior|rib/.test(String(o.userData.partId??'')));
    const hit=ray.intersectObjects(other,true).find(h=>h.point.y<=bottom+.014);const base=Math.max(deckTop,hit?.point.y??deckTop),gap=bottom-base;if(gap<=.018)continue;
    const before=g.children.length,localY=(base+bottom)/2-g.position.y,height=gap+.04;
    if(g.userData.supportFootprint){const [w,d]=g.userData.supportFootprint as number[];k.box(g,[w*.98,height,d*.98],[0,localY,0],'stone');}
    else if(/rhib|boat-|catapult|scout-plane/.test(id)){const width=Math.min(.6,size.x*.6),length=Math.min(1.5,size.z*.6);for(const end of [-1,1]){k.box(g,[width,height,.16],[0,localY,end*length/2],'stone');k.box(g,[width+.08,.08,.27],[0,base-g.position.y+.025,end*length/2],'navy');}}
    else if(/funnel|stack|exhaust/.test(id)){k.box(g,[size.x*.65,height,size.z*.6],[0,localY,0],'stone');}
    else {const radius=/mast/.test(id)?.18:/radome/.test(id)?.33:Math.min(.62,Math.max(.18,size.x*.28));k.cyl(g,radius,radius*1.12,height,[0,localY,0],'stone',12);k.cyl(g,radius*1.3,radius*1.3,.07,[0,base-g.position.y+.015,0],'navy',12);}
    for(const mesh of g.children.slice(before))mesh.userData.structuralSupport=true;
    audit.push({id,bottom,base,gap,meshes:g.children.length-before});
  }
  k.root.userData.supportAudit=audit;k.root.updateMatrixWorld(true);
}
