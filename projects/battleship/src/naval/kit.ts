import * as THREE from 'three';
type V = [number,number,number];
export type Role = 'stone'|'cream'|'navy'|'dark'|'wood'|'gold'|'glass'|'red'|'coral'|'white'|'teal'|'jade';
export const palette:Record<Role,number> = {stone:0x8b9da7,cream:0xbac8c9,navy:0x283b49,dark:0x172026,wood:0x887b61,gold:0xc4a45c,glass:0x6ea4af,red:0x643839,coral:0xdc7556,white:0xe4e7d7,teal:0x3d777a,jade:0x65ae92};
/** Minimal reusable modeling kit. No disassembly fasteners or unrelated scenery. */
export class Kit {
 root=new THREE.Group();
 materials=Object.fromEntries(Object.entries(palette).map(([role,color])=>[role,new THREE.MeshStandardMaterial({name:role,color,roughness:role==='glass'?.23:.65,metalness:role==='gold'?.65:.28})])) as Record<Role,THREE.MeshStandardMaterial>;
 part(id:string,name:string,_layer:number,at:V,_unused:never[]){const g=new THREE.Group();g.name=name;g.userData.partId=id;g.position.set(...at);this.root.add(g);return g;}
 mesh(g:THREE.Group,geo:THREE.BufferGeometry,role:Role,p:V=[0,0,0],rot?:V){const m=new THREE.Mesh(geo,this.materials[role]);m.position.set(...p);if(rot)m.rotation.set(...rot);g.add(m);return m;}
 box(g:THREE.Group,size:V,p:V,role:Role,bevel=0){
  if(!bevel)return this.mesh(g,new THREE.BoxGeometry(...size),role,p);
  const [w,h,d]=size,r=Math.min(bevel,w/4,h/4,d/4),s=new THREE.Shape();
  s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  const geo=new THREE.ExtrudeGeometry(s,{depth:Math.max(.01,d-r*2),bevelEnabled:true,bevelThickness:r,bevelSize:r*.45,bevelSegments:1,steps:1,curveSegments:3});geo.translate(0,0,-d/2+r);return this.mesh(g,geo,role,p);
 }
 cyl(g:THREE.Group,rt:number,rb:number,h:number,p:V,role:Role,segments=16){return this.mesh(g,new THREE.CylinderGeometry(rt,rb,h,segments),role,p);}
 torus(g:THREE.Group,r:number,t:number,p:V,role:Role,rot?:V){return this.mesh(g,new THREE.TorusGeometry(r,t,5,20),role,p,rot);}
 beam(g:THREE.Group,a:V,b:V,w:number,role:Role){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));const m=this.box(g,[w,v.length(),w],[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],role);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());}
 shape(g:THREE.Group,points:[number,number][],depth:number,p:V,role:Role,bevel=.04){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();const geo=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1});geo.translate(0,0,-depth/2);return this.mesh(g,geo,role,p);}
 railing(g:THREE.Group,a:V,b:V,h=.42,role:Role='cream'){const n=Math.max(2,Math.round(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))/.6));for(const y of [h,h*.48])this.beam(g,[a[0],a[1]+y,a[2]],[b[0],b[1]+y,b[2]],.045,role);for(let i=0;i<=n;i++){const t=i/n,p:V=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];this.beam(g,p,[p[0],p[1]+h,p[2]],.045,role);}}
}
