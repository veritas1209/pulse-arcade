import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {externalFighter} from './generated/f22-external';

const externalBases:Partial<Record<'flight'|'parked'|'flightLow'|'parkedNear'|'parkedLow',THREE.BufferGeometry>>={};
/** User-supplied F22 RAPTOR. Compatibility API; all variants retain source UV seams. */
export function buildSuperHornet(options:{length?:number;parked?:boolean;low?:boolean}={}){
 const variant=options.parked?(options.low?'parkedLow':'parkedNear'):options.low?'flightLow':'flight';let base=externalBases[variant];
 if(!base){const bytes=Uint8Array.from(atob(externalFighter[variant]),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),stride=externalFighter.stride,count=bytes.length/stride,position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),uv=new Float32Array(count*2),tile=new Float32Array(count),surface=new Float32Array(count).fill(-4);for(let i=0;i<count;i++){const at=i*stride;for(let j=0;j<3;j++){position[i*3+j]=view.getInt16(at+j*2,true)/32767;normal[i*3+j]=view.getInt8(at+6+j)/127;color[i*3+j]=view.getUint8(at+9+j)/255;}uv[i*2]=view.getFloat32(at+12,true);uv[i*2+1]=view.getFloat32(at+16,true);const t=view.getUint16(at+20,true);tile[i]=t===65535?-1:t;}base=new THREE.BufferGeometry();for(const [name,data,size]of [['position',position,3],['normal',normal,3],['color',color,3],['uv',uv,2],['aSourceTile',tile,1],['aSurface',surface,1]] as [string,Float32Array,number][])base.setAttribute(name,new THREE.BufferAttribute(data,size));base.normalizeNormals();base.computeBoundingBox();base.computeBoundingSphere();base.userData.source='F22 RAPTOR / sxnneh / Sketchfab Standard / user supplied';externalBases[variant]=base;}
 const geometry=base.clone(),length=options.length??18.9/304.5*3.6,size=base.boundingBox!.max.z-base.boundingBox!.min.z,scale=length/size;geometry.scale(scale,scale,scale);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Legacy procedural fallback. Navy F/A-18E/F: length18.5m/span13.68m. Nose -Z, merged PBR geometry. */
export function buildProceduralSuperHornet(options:{length?:number;parked?:boolean}={}){const parts:THREE.BufferGeometry[]=[];const add=(g:THREE.BufferGeometry,color:number)=>{const mesh=g.index?g.toNonIndexed():g;mesh.computeVertexNormals();const p=mesh.getAttribute('position'),c=new THREE.Color(color),colors=new Float32Array(p.count*3);for(let i=0;i<p.count;i++)colors.set(c.toArray(),i*3);mesh.setAttribute('color',new THREE.BufferAttribute(colors,3));mesh.deleteAttribute('uv');parts.push(mesh);if(mesh!==g)g.dispose();};
 const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,col:number,ry=0)=>{const g=new THREE.BoxGeometry(sx,sy,sz);g.rotateY(ry);g.translate(x,y,z);add(g,col);};
 const plate=(points:number[][],thickness:number,col:number)=>{const verts:number[]=[];for(let i=1;i<points.length-1;i++){for(const j of [0,i+1,i])verts.push(points[j][0],points[j][1]+thickness/2,points[j][2]);for(const j of [0,i,i+1])verts.push(points[j][0],points[j][1]-thickness/2,points[j][2]);}for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];verts.push(a[0],a[1]-thickness/2,a[2],b[0],b[1]-thickness/2,b[2],a[0],a[1]+thickness/2,a[2],a[0],a[1]+thickness/2,a[2],b[0],b[1]-thickness/2,b[2],b[0],b[1]+thickness/2,b[2]);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));add(g,col);};
 const loft=(sections:number[][],col:number)=>{const p:number[]=[];for(let j=0;j<sections.length-1;j++)for(let i=0;i<12;i++){const point=(s:number,k:number)=>{const [z,w,h,cy]=sections[s],a=k/12*Math.PI*2;return[Math.cos(a)*w,Math.sin(a)*h+cy,z];};p.push(...point(j,i),...point(j+1,i),...point(j,i+1),...point(j,i+1),...point(j+1,i),...point(j+1,i+1));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));add(g,col);};

 const tube=(radius:number,length:number,x:number,y:number,z:number,col:number)=>{const g=new THREE.CylinderGeometry(radius,radius,length,10);g.rotateX(Math.PI/2);g.translate(x,y,z);add(g,col);};
 loft([[-.925,.002,.004,0],[-.76,.043,.036,0],[-.56,.072,.058,0],[-.25,.105,.07,0],[.08,.20,.077,0],[.42,.192,.081,0],[.76,.15,.052,-.01],[.925,.15,.045,-.01]],0x929c9d);
 for(const side of [-1,1]){
  // Leading edge root extensions and swept wings, with fold seams and separate flaps.
  plate([[side*.058,.035,-.66],[side*.14,.055,-.39],[side*.265,.035,-.025],[side*.125,.047,.20]],.025,0x879496);
  plate([[side*.16,.013,-.12],[side*.666,.005,.20],[side*.666,.004,.44],[side*.20,.014,.49]],.027,0x9ea7a6);
  plate([[side*.30,.031,.21],[side*.615,.024,.37],[side*.612,.024,.426],[side*.28,.031,.442]],.005,0x66787d);
  box(side*.51,.031,.29,.006,.006,.255,0x4c616a);box(side*.43,-.049,.21,.026,.10,.19,0x73858c);box(side*.285,-.052,.105,.022,.075,.22,0x788a8f);
  plate([[side*.135,.064,.42],[side*.195,.32,.63],[side*.258,.32,.785],[side*.205,.055,.87]],.017,0x7d8b90);
  plate([[side*.182,.15,.62],[side*.219,.277,.701],[side*.244,.277,.754],[side*.218,.139,.739]],.004,0x485d68);
  plate([[side*.12,.005,.62],[side*.405,-.003,.77],[side*.393,-.004,.905],[side*.13,.005,.86]],.021,0x9aa6a7);
  // Twin circular F414 exhausts with metallic petals and recessed dark throats.
  tube(.067,.54,side*.093,-.021,.622,0x677c84);tube(.059,.09,side*.093,-.021,.879,0x273b45);tube(.048,.014,side*.093,-.021,.918,0x08171f);
  for(let j=0;j<10;j++){const a=j/10*Math.PI*2;box(side*.093+Math.sin(a)*.057,-.021+Math.cos(a)*.057,.8875,.006,.006,.075,0xa8adaa);}
  box(side*.137,-.049,-.155,.109,.107,.255,0x617883);box(side*.137,-.048,-.287,.088,.078,.009,0x101f29);box(side*.137,.005,-.288,.115,.012,.02,0xb1b9b6);
  tube(.009,.27,side*.675,.01,.298,0xd1d4c9);box(side*.675,.026,.395,.018,.007,.045,0x70828b);
  // Underwing Harpoon-type anti-ship stores with cruciform fins.
  tube(.022,.31,side*.285,-.109,.09,0xc1c8c4);const nose=new THREE.ConeGeometry(.022,.07,10);nose.rotateX(-Math.PI/2);nose.translate(side*.285,-.109,-.10);add(nose,0x708087);
  for(let j=0;j<4;j++){const fin=new THREE.BoxGeometry(.004,.102,.068);fin.rotateZ(j*Math.PI/2);fin.translate(side*.285,-.109,.191);add(fin,0x859396);}
  box(side*.16,.088,.315,.007,.006,.28,0x617780);
 }
 loft([[-.67,.014,.012,.049],[-.58,.039,.053,.07],[-.40,.051,.063,.08],[-.25,.037,.039,.068],[-.195,.006,.006,.047]],0x365666);
 box(0,.127,-.445,.008,.007,.36,0xc1c8c3);box(0,.076,-.21,.076,.026,.12,0x88999d);
 // Retracted gear bay doors and folded carrier arresting hook.
 for(const side of [-1,1])box(side*.077,-.083,.215,.055,.008,.16,0x425961);
 box(0,-.065,-.46,.036,.008,.16,0x485d67);box(0,-.079,.692,.014,.014,.24,0xb5bdb7);box(0,-.085,.82,.055,.018,.025,0x283d47);
 if(options.parked){for(const [x,z]of[[0,-.46],[-.10,.20],[.10,.20]]){box(x,-.115,z,.014,.09,.014,0xc1c6bf);const wheel=new THREE.CylinderGeometry(.027,.027,.021,10);wheel.rotateZ(Math.PI/2);wheel.translate(x,-.168,z);add(wheel,0x172933);}}
 const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());const scalar=(options.length??.5)/1.85;geometry.scale(scalar,scalar,scalar);const fp=geometry.getAttribute('position'),uv=new Float32Array(fp.count*2);for(let i=0;i<fp.count;i++){uv[i*2]=fp.getX(i)*2+.5;uv[i*2+1]=fp.getZ(i)*2+.5;}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
