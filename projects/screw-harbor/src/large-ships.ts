import * as THREE from 'three';
import type { Kit } from './structures';

type V = [number, number, number];
type Role = Parameters<Kit['box']>[3];
const TAU = Math.PI * 2;

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

export function buildStarDestroyer(k: Kit) {
  starInteriors(k);
  const zFront=-23,zBack=17;
  const half=(z:number)=>.15+(z-zFront)/(zBack-zFront)*12.3;
  // Thin top and belly wedges form a complete shell around an open structural interior.
  for(let row=0;row<10;row++) {
    const za=zFront+row*4,zb=za+4;
    for(const side of [-1,1]) for(let col=0;col<2;col++) {
      const a=col*.5,b=(col+1)*.5;
      for(const upper of [true,false]) {
        const y=(f:number,z:number)=>upper ? 1.1+(1-f)*(1.1+(z-zFront)*.022) : -.35-(1-f)*1.2;
        const outer: V[]=[[side*half(za)*a,y(a,za),za],[side*half(zb)*a,y(a,zb),zb],[side*half(zb)*b,y(b,zb),zb],[side*half(za)*b,y(b,za),za]];
        const g=p(k,`sd-armor-${row}-${side}-${col}-${upper}`,'쐐기형 선체 장갑',[0,0,0],2);
        k.mesh(g,solid(outer,outer.map(v=>[v[0],v[1]+(upper?-.22:.22),v[2]])),upper?'stone':'cream');
        if(upper && row>1) {
          const x=side*half((za+zb)/2)*(a+b)/2,yy=y((a+b)/2,(za+zb)/2);
          k.box(g,[Math.max(.35,half(za)*.18),.11,1.5],[x,yy+.1,(za+zb)/2],'cream');
          for(let q=0;q<2;q++) k.box(g,[.22,.08,.7],[x+side*q*.35,yy+.19,za+1.7],'navy');
        }
      }
    }
    for(const side of [-1,1]) {
      const g=p(k,`sd-trench-${row}-${side}`,'측면 참호 · 격벽과 장비',[0,0,0],2);
      const outer:V[]=[[side*half(za),-.35,za],[side*half(zb),-.35,zb],[side*half(zb),1.10,zb],[side*half(za),1.10,za]];
      k.mesh(g,solid(outer,outer.map(v=>[v[0]-side*.25,v[1],v[2]])),'dark');
      for(let j=0;j<4;j++) {
        const z=za+(j+.5)*(zb-za)/4,x=side*(half(z)+.06);
        k.box(g,[.19,.36,.32],[x,.34,z],j%2?'cream':'stone');
        k.box(g,[.2,.09,.3],[x,.73,z],'glass');
      }
    }
  }
  for(const [label,z] of [['bow',zFront],['stern',zBack]] as const) {
    const g=p(k,`sd-${label}-pressure-plate`,label==='bow'?'선수 압력 외판':'함미 추진기관 장갑 격벽',[0,0,z],3);
    const w=half(z)+.01,top=2.2+(z-zFront)*.022;
    k.shape(g,[[-w,-.35],[0,-1.55],[w,-.35],[w,1.1],[0,top],[-w,1.1]],.18,[0,0,0],'stone',0);
  }
  for(let level=0;level<4;level++) {
    const g=p(k,`sd-terrace-${level}`,'계단식 상부 지휘구획',[0,0,0],1);
    const w=6.3-level*1.15,front=-5+level*2.5,back=13.7-level*.8,y=3.1+level*.75;
    deck(k,g,[[-w*.28,front],[w*.28,front],[w,back-3],[w*.9,back],[-w*.9,back],[-w,back-3]],y,.67,'stone');
    for(const side of [-1,1]) for(let n=0;n<6;n++) {
      const z=front+2+(back-front-3)*n/6;
      k.box(g,[.5,.15,.65],[side*(w*.3+(z-front)/(back-front)*w*.52),y+.43,z],'cream');
    }
    windows(k,g,w*1.45,y+.08,back+.035,12);
  }
  const neck=p(k,'sd-command-neck','장갑 지휘탑 지지부',[0,5.9,10.3],1);
  deck(k,neck,[[-1.5,-1.5],[1.5,-1.5],[2.1,1.4],[-2.1,1.4]],.5,2.6,'stone');
  const bridge=p(k,'sd-command-bridge','쐐기형 가로 지휘함교',[0,8.3,10.6],0);
  deck(k,bridge,[[-5,-.85],[-3.2,-1.6],[3.2,-1.6],[5,-.85],[4.75,1.25],[-4.75,1.25]],0,1.2,'cream');
  windows(k,bridge,7.1,.07,-1.62,16);windows(k,bridge,8.5,.08,1.29,16);
  for(const side of [-1,1]) {
    const dome=p(k,`sd-shield-dome-${side}`,'방어막 발전기 구체',[side*3.3,9.3,10.7],0);
    k.cyl(dome,.49,.68,.55,[0,0,0],'stone',12);
    k.mesh(dome,new THREE.IcosahedronGeometry(.91,1),'cream',[0,.95,0]);
    for(let n=0;n<4;n++) k.torus(dome,.83,.035,[0,.95,0],'stone',[0,n*Math.PI/4,Math.PI/2]);
    for(let gun=0;gun<4;gun++) turret(k,`sd-heavy-turret-${side}-${gun}`,[side*(7.1+gun*.78),2.4,3.6+gun*2.5],.57,2,side*.3);
  }
  const radar=p(k,'sd-central-sensor','장거리 센서 배열',[0,9.15,10.4],0);
  k.box(radar,[2.4,.5,.32],[0,.65,0],'dark');k.box(radar,[2.6,.15,.55],[0,.95,0],'cream');
  k.beam(radar,[0,0,0],[0,1.25,0],.15,'stone');
  for(let i=0;i<7;i++) {
    const x=(i-3)*3.45,r=i===1||i===3||i===5?1.28:.72;
    const g=p(k,`sd-engine-${i}`,'함미 이온 추진기',[x,.05,17.12],2);
    pipe(k,g,[0,0,-.6],[0,0,.6],r*1.18,'stone',r);
    k.torus(g,r,.14,[0,0,.7],'cream');
    pipe(k,g,[0,0,.66],[0,0,.73],r*.8,'navy');
    pipe(k,g,[0,0,.735],[0,0,.78],r*.59,'glass');
    for(let q=0;q<6;q++) {const t=q*TAU/6;k.box(g,[.13,.13,.9],[Math.cos(t)*r*1.1,Math.sin(t)*r*1.1,.05],'cream');}
  }
  for(let i=0;i<5;i++) {
    const g=p(k,`sd-dorsal-system-${i}`,'등쪽 동력 냉각 설비',[0,2.65,-13+i*3.2],1);
    k.box(g,[1.1,.35,1.9],[0,0,0],'stone',.08);vents(k,g,0,.23,0,.75,1.4);
  }
  // Open-bottom hangar frame: entrance remains a real cavity.
  const hangar=p(k,'sd-ventral-hangar','복부 도킹 격납고 프레임',[0,-1.85,1.7],3);
  for(const x of [-2.6,2.6]) k.box(hangar,[.35,.9,5.5],[x,0,0],'cream');
  for(const z of [-2.7,2.7]) k.box(hangar,[5.2,.9,.35],[0,0,z],'cream');
  k.box(hangar,[4.8,.16,5.1],[0,.5,0],'dark');
  for(const x of [-2.3,2.3]) k.box(hangar,[.1,.13,4.6],[x,-.3,0],'glass');
}

/** Closed annular-sector extrusion, including radial end walls. */
function radial(k: Kit,g: THREE.Group,inner:number,outer:number,y0:number,y1:number,t0:number,t1:number,role:Role,z=0) {
  const s=new THREE.Shape(),steps=5;
  for(let i=0;i<=steps;i++) {const t=t0+(t1-t0)*i/steps; const x=Math.cos(t)*outer,zz=Math.sin(t)*outer; i?s.lineTo(x,-zz):s.moveTo(x,-zz);}
  for(let i=steps;i>=0;i--) {const t=t0+(t1-t0)*i/steps;s.lineTo(Math.cos(t)*inner,-Math.sin(t)*inner);}
  s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:y1-y0,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);geo.translate(0,y0,z);
  k.mesh(g,geo,role);
}

export function buildEnterprise(k: Kit) {
  enterpriseInteriors(k);
  const saucerZ=-11,saucerY=6.4;
  for(let ring=0;ring<3;ring++) for(let sector=0;sector<16;sector++) {
    const inner=ring===0?1.5:3.8+(ring-1)*2.5,outer=3.8+ring*2.5;
    const t0=sector*TAU/16,t1=(sector+1)*TAU/16;
    const g=p(k,`en-saucer-${ring}-${sector}`,'원반형 주선체 · 방사형 외판',[0,saucerY,saucerZ],1);
    radial(k,g,inner,outer,.13+(2-ring)*.25,.48+(2-ring)*.25,t0,t1,'cream');
    radial(k,g,inner,outer,-.5-(2-ring)*.18,-.25-(2-ring)*.18,t0,t1,'stone');
    const mid=(t0+t1)/2,r=(inner+outer)/2;
    if(ring>0) {
      const mark=k.box(g,[.13,.065,outer-inner-.35],[Math.cos(mid)*r,.59+(2-ring)*.25,Math.sin(mid)*r],sector%4===0?'red':'stone');mark.rotation.y=Math.PI/2-mid;
    }
    if(ring===2) {
      radial(k,g,8.63,8.87,-.28,.25,t0,t1,'cream');
      for(let q=0;q<3;q++) {const t=t0+(q+.5)*(t1-t0)/3;const m=k.box(g,[.28,.15,.07],[Math.cos(t)*8.89,-.025,Math.sin(t)*8.89],'dark');m.rotation.y=Math.PI/2-t;}
    }
  }
  const bridge=p(k,'en-bridge-module','주 함교와 원반 중앙 돔',[0,7.7,saucerZ],0);
  k.cyl(bridge,1.53,1.53,.42,[0,-.27,0],'cream',32);
  k.cyl(bridge,1.3,1.6,.48,[0,0,0],'cream',32);
  k.mesh(bridge,new THREE.SphereGeometry(1,24,12),'cream',[0,.26,0]).scale.set(1,.45,1);
  windows(k,bridge,1.15,.17,-1.23,5);
  k.box(bridge,[.85,.17,1.1],[0,.13,1.1],'stone');
  const dome=p(k,'en-lower-sensor','하부 행성 탐사 센서',[0,5.1,saucerZ],1);
  k.cyl(dome,1.53,1.45,.52,[0,.39,0],'stone',32);
  k.cyl(dome,1.4,.88,.44,[0,0,0],'stone',24);k.mesh(dome,new THREE.SphereGeometry(.78,20,12),'glass',[0,-.23,0]).scale.y=.55;
  for(const side of [-1,1]) {
    const g=p(k,`en-saucer-beacon-${side}`,'원반 항법등과 표식',[side*8.8,6.75,saucerZ],0);
    k.mesh(g,new THREE.SphereGeometry(.2,10,8),side<0?'red':'jade');
  }
  const neck=p(k,'en-dorsal-neck','경사형 원반 연결 넥',[0,0,0],2);
  k.mesh(neck,solid([[-.65,1.1,-2],[.65,1.1,-2],[.65,1.1,2],[-.65,1.1,2]],[[-.65,6.25,-6],[.65,6.25,-6],[.65,6.25,-2.7],[-.65,6.25,-2.7]]),'cream');
  for(const side of [-1,1]) for(let i=0;i<5;i++) k.box(neck,[.08,.19,1.1],[side*.7,2+i*.65,-.9-i*.52],'dark');
  // Secondary hull: longitudinal barrel shell built from closed curved strips.
  for(let station=0;station<6;station++) for(let q=0;q<8;q++) {
    const za=-2.5+station*2.8,zb=za+2.8,ta=q*TAU/8,tb=(q+1)*TAU/8;
    const radius=(z:number)=>1.65+(z+2.5)/16.8*.42;
    const corners=(rOffset:number):V[]=>[[Math.cos(ta)*(radius(za)+rOffset),Math.sin(ta)*(radius(za)+rOffset),za],[Math.cos(ta)*(radius(zb)+rOffset),Math.sin(ta)*(radius(zb)+rOffset),zb],[Math.cos(tb)*(radius(zb)+rOffset),Math.sin(tb)*(radius(zb)+rOffset),zb],[Math.cos(tb)*(radius(za)+rOffset),Math.sin(tb)*(radius(za)+rOffset),za]];
    const g=p(k,`en-secondary-${station}-${q}`,'보조 선체 · 분리식 압력 외피',[0,0,0],3);
    k.mesh(g,solid(corners(0),corners(-.2)),q<4?'cream':'stone');
    if(q===0||q===3) for(let w=0;w<3;w++) k.box(g,[.08,.13,.27],[(q===0?1:-1)*(radius(za)+.035),.38,za+.5+w*.67],'dark');
  }
  const deflector=p(k,'en-deflector','선수 항법 디플렉터',[0,0,-2.75],1);
  pipe(k,deflector,[0,0,-.05],[0,0,.45],1.65,'stone',1.7);
  k.torus(deflector,1.34,.13,[0,0,-.13],'gold');
  pipe(k,deflector,[0,0,-.22],[0,0,-.11],1.18,'gold');
  pipe(k,deflector,[0,0,-.32],[0,0,-.23],.81,'navy');
  pipe(k,deflector,[0,0,-.45],[0,0,-.33],.34,'gold');
  const bay=p(k,'en-shuttle-bay','함미 셔틀 격납고',[0,0,14.4],2);
  pipe(k,bay,[0,0,-.12],[0,0,.35],2.09,'cream',1.92);
  k.box(bay,[2.5,1.7,.12],[0,.1,.4],'dark',.2);
  for(let i=0;i<7;i++) k.box(bay,[2.34,.12,.08],[0,-.59+i*.22,.5],'stone');
  for(const side of [-1,1]) {
    const support=p(k,`en-nacelle-pylon-${side}`,'사선 워프 나셀 연결 날개',[0,0,0],2);
    k.mesh(support,solid([[side*1.5,.8,5],[side*1.5,.8,9],[side*7.9,6.1,11],[side*7.9,6.1,7]],[[side*1.5,1.03,5],[side*1.5,1.03,9],[side*7.9,6.33,11],[side*7.9,6.33,7]]),'cream');
    for(let station=0;station<6;station++) {
      const z=-.3+station*3.2,g=p(k,`en-nacelle-${side}-${station}`,'워프 나셀 · 엔진 구획',[side*8,6.5,z],1);
      pipe(k,g,[0,0,0],[0,0,3.2],1.02,'cream');
      for(const dx of [-1,1]) k.box(g,[.11,.3,2.76],[dx*1.01,.18,1.56],'navy');
      k.box(g,[.55,.09,2.5],[0,1.035,1.56],'stone');
      k.box(g,[.12,.07,2.2],[0,1.095,1.56],'red');
    }
    const cap=p(k,`en-bussard-${side}`,'적색 버사드 수집기',[side*8,6.5,-.65],0);
    k.torus(cap,1.02,.13,[0,0,.2],'stone');
    k.mesh(cap,new THREE.SphereGeometry(1.04,24,12),'coral',[0,0,0]).scale.z=.65;
    for(let blade=0;blade<8;blade++) {
      const t=blade*TAU/8;pipe(k,cap,[Math.cos(t)*.3,Math.sin(t)*.3,-.58],[Math.cos(t+.25)*.77,Math.sin(t+.25)*.77,-.38],.035,'gold');
    }
    const tail=p(k,`en-nacelle-tail-${side}`,'나셀 배기부와 후방 핀',[side*8,6.5,18.88],1);
    pipe(k,tail,[0,0,0],[0,0,.9],1.02,'stone',.63);
    k.mesh(tail,new THREE.SphereGeometry(.64,16,10),'glass',[0,0,.9]).scale.z=.55;
    for(const dx of [-1,1]) deck(k,tail,[[dx*.5,0],[dx*1.65,1.1],[dx*.6,1.5]],-.25,.14,'cream');
  }
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
    k.box(g,[2.2-level*.24,.76,6.2-level*.72],[0,0,0],'stone',.12);
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
    const width=w-j*.43,len=l-j*.7;
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
  const helo=p(k,'dd-helicopter','함재 대잠 헬리콥터',[0,1.7,14.4],0);
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

function starInteriors(k:Kit) {
  for(let bay=0;bay<7;bay++) {
    const z=-11.5+bay*3.9,depth=3.68,half=(.15+(z-depth/2+23)/40*12.3)*.74;
    const floor=p(k,`sd-interior-deck-${bay}`,'내부 작전 갑판 · 중앙 통로',[0,-.55,z],5);
    k.box(floor,[half*2,.16,depth],[0,0,0],'navy');
    for(const x of [-.55,.55]) k.box(floor,[.045,.026,depth-.12],[x,.094,0],'gold');
    if(bay<6) bulkhead(k,`sd-interior-bulkhead-${bay}`,[0,-.45,z+1.9],half,1.52,1.05);
    for(const side of [-1,1]) {
      const usable=half-.8,x=side*(.7+usable/2);
      if(bay<4) roomModule(k,`sd-interior-room-${bay}-${side}`,[x,-.43,z],Math.min(usable*.84,2.5),depth*.77,bay===0?'store':bay===1?'berth':bay===2?'control':'workshop',.93);
      else machinery(k,`sd-interior-machinery-${bay}-${side}`,[x,-.42,z],Math.min(usable*.76,2.75),depth*.78,1.37,bay===4?'reactor':bay===5?'tank':'engine');
      const wall=p(k,`sd-interior-corridor-${bay}-${side}`,'장갑 복도 · 동력 공급 레일',[side*.62,-.42,z],5);
      for(const end of [-1,1]) k.box(wall,[.095,1.18,.7],[0,.59,end*1.37],'cream');
      k.box(wall,[.12,.15,3.44],[0,1.29,0],'stone');
      pipe(k,wall,[side*.15,.9,-1.55],[side*.15,.9,1.55],.045,'teal');
      if(bay>3) {
        const outer=p(k,`sd-interior-peripheral-${bay}-${side}`,'외곽 전력 분배실',[side*(half-.57),-.32,z],6);
        k.box(outer,[.54,.66,2.66],[0,.33,0],'stone');
        for(let q=0;q<4;q++) {k.box(outer,[.56,.06,.2],[0,.54,-.99+q*.66],'gold');k.box(outer,[.36,.045,.24],[0,.7,-.99+q*.66],'glass');}
      }
    }
  }
  for(let q=0;q<4;q++) {
    const g=p(k,`sd-interior-engine-feed-${q}`,'함미 추진기 동력 연결관',[(-1.5+q)*4.2,-.18,15.22],6);
    pipe(k,g,[0,0,-.64],[0,0,.64],.32,'stone');
    k.torus(g,.34,.06,[0,0,-.36],'gold');k.torus(g,.34,.06,[0,0,.36],'gold');
    k.box(g,[1.02,.15,1.56],[0,-.33,0],'navy');
  }
  for(let bay=0;bay<2;bay++) {
    const z=-18.2+bay*3.15,w=bay===0?1.25:2.13;
    const g=p(k,`sd-interior-forward-sensors-${bay}`,'선수 장거리 탐지·항법 구획',[0,-.58,z],6);
    k.box(g,[w,.16,2.75],[0,0,0],'navy');
    for(const side of [-1,1]) {
      k.box(g,[w*.24,.7,1.9],[side*w*.32,.46,0],'cream');
      k.box(g,[w*.19,.055,1.5],[side*w*.32,.84,0],'glass');
      pipe(k,g,[side*w*.28,.86,-.88],[side*w*.28,.86,.88],.035,'gold');
    }
  }
  // Raise the working deck above the inward thickness of the sloping belly armor.
  for(const part of k.parts) if(part.id.startsWith('sd-interior-')) part.group.position.y+=.28;
}

function enterpriseInteriors(k:Kit) {
  // The saucer's decks follow its shallow lens profile rather than protruding through it.
  for(let ring=0;ring<2;ring++) for(let sector=0;sector<12;sector++) {
    const inner=ring===0?1.78:4.13,outer=ring===0?3.47:5.87;
    const a=sector*TAU/12+.025,b=(sector+1)*TAU/12-.025,mid=(a+b)/2,r=(inner+outer)/2;
    const floorY=ring===0?5.87:6.06,top=ring===0?.75:.42;
    const floor=p(k,`en-interior-saucer-floor-${ring}-${sector}`,'원반 내부 · 방사형 층 구획',[0,0,-11],5);
    radial(k,floor,inner,outer,floorY,floorY+.075,a,b,'navy');
    radial(k,floor,inner+.13,inner+.17,floorY+.08,floorY+.1,a,b,'gold');
    const room=p(k,`en-interior-saucer-room-${ring}-${sector}`,'원반 내부 · 승무원 구역',[Math.cos(mid)*r,floorY+.08,-11+Math.sin(mid)*r],6);
    room.rotation.y=Math.PI/2-mid;
    k.box(room,[.93,top*.56,.38],[0,top*.28,.39],'cream');
    k.box(room,[.81,.055,.27],[0,top*.6,.39],sector%3===0?'glass':'teal');
    if(sector%3===0) {
      k.box(room,[.25,top*.25,.27],[-.23,top*.15,-.27],'navy');
      k.box(room,[.25,top*.25,.27],[.23,top*.15,-.27],'navy');
    } else {
      k.box(room,[.45,.09,.79],[-.23,.08,-.23],'stone');
      k.box(room,[.4,.055,.71],[-.23,.16,-.23],'teal');
      k.box(room,[.35,.04,.18],[-.23,.21,-.46],'cream');
    }
    const wall=p(k,`en-interior-saucer-wall-${ring}-${sector}`,'원반 방사형 격벽',[0,0,-11],5);
    const wallBase=floorY+.065,wallTop=floorY+top+.105,gap=.26/inner;
    for(const edge of [a,b]) {
      const partition=k.box(wall,[outer-inner+.06,wallTop-wallBase,.075],[Math.cos(edge)*r,(wallTop+wallBase)/2,Math.sin(edge)*r],'cream');partition.rotation.y=-edge;
    }
    radial(k,wall,outer-.045,outer+.03,wallBase,wallTop,a,b,'cream');
    radial(k,wall,inner-.035,inner+.045,wallBase,wallTop,a,mid-gap,'cream');
    radial(k,wall,inner-.035,inner+.045,wallBase,wallTop,mid+gap,b,'cream');
    radial(k,wall,inner-.035,inner+.045,wallTop-.1,wallTop,mid-gap,mid+gap,'cream');
    const ceiling=p(k,`en-interior-saucer-ceiling-${ring}-${sector}`,'원반 선실 탈착식 천장',[0,0,-11],4);
    radial(k,ceiling,inner-.045,outer+.04,wallTop-.025,wallTop+.055,a-.008,b+.008,'stone');
    const door=p(k,`en-interior-saucer-door-${ring}-${sector}`,'원반 선실 출입문',[Math.cos(mid)*(inner-.01),wallBase,-11+Math.sin(mid)*(inner-.01)],4);
    door.rotation.y=Math.PI/2-mid;
    k.box(door,[.6,wallTop-wallBase-.065,.09],[0,(wallTop-wallBase-.065)/2,0],'stone');
    k.box(door,[.045,.1,.035],[.18,(wallTop-wallBase)*.4,-.07],'gold');
  }
  for(let sector=0;sector<12;sector++) {
    const a=sector*TAU/12+.035,b=(sector+1)*TAU/12-.035,mid=(a+b)/2;
    const g=p(k,`en-interior-rim-utility-${sector}`,'원반 외곽 · 얕은 설비 트레이',[0,0,-11],6);
    radial(k,g,6.57,8.34,6.2,6.25,a,b,'navy');
    for(const r of [6.95,7.76]) {
      const c=k.box(g,[1.4,.13,.39],[Math.cos(mid)*r,6.34,Math.sin(mid)*r],sector%2?'stone':'teal');c.rotation.y=Math.PI/2-mid;
      const band=k.box(g,[1.22,.035,.06],[Math.cos(mid)*r,6.425,Math.sin(mid)*r],'gold');band.rotation.y=Math.PI/2-mid;
    }
  }
  // Central secondary hull contains a walkable engineering spine and machinery bays.
  for(let bay=0;bay<6;bay++) {
    const z=-.95+bay*2.75;
    const floor=p(k,`en-interior-engineering-floor-${bay}`,'보조 선체 · 기관실 바닥',[0,-.89,z],5);
    k.box(floor,[2.02+bay*.09,.13,2.57],[0,0,0],'navy');
    for(const x of [-.31,.31]) k.box(floor,[.04,.024,2.38],[x,.079,0],'gold');
    if(bay<5) bulkhead(k,`en-interior-engineering-wall-${bay}`,[0,-.81,z+1.31],.94,1.74,.73);
    if(bay===2||bay===3) {
      for(const side of [-1,1]) machinery(k,`en-interior-warp-system-${bay}-${side}`,[side*.77,-.78,z],.63,2.08,1.28,bay===2?'reactor':'engine');
    } else for(const side of [-1,1]) roomModule(k,`en-interior-engineering-room-${bay}-${side}`,[side*.68,-.79,z],.63,2.01,bay===0?'control':bay===1?'workshop':bay===4?'store':'control',.93);
    const pipeRack=p(k,`en-interior-plasma-conduit-${bay}`,'워프 플라스마 · 천장 도관',[0,1.0,z],4);
    for(const side of [-1,1]) {
      pipe(k,pipeRack,[side*.7,0,-1.13],[side*.7,0,1.13],.07,'teal');
      for(const zz of [-.87,.87]) k.box(pipeRack,[.31,.11,.11],[side*.7,-.01,zz],'gold');
    }
  }
}
