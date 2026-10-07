import * as THREE from 'three';
import {oceanSurfaceY,oceanGridHeightGLSL} from './ocean';

type Source={at:THREE.Vector3;length:number;width:number;heading:number;seed:number;birth:number;emitted:number};
type Drop={x:number;z:number;y:number;vx:number;vz:number;vy:number;birth:number;seed:number;size:number;wetAt?:number};
const CAPACITY=640,GRAVITY=1.25,DRAG=.65;
const random=(s:number)=>{const v=Math.sin(s*127.1+311.7)*43758.5453;return v-Math.floor(v);};

/** Hull-aligned displacement, falling spray and lingering aerated water.
 * Presentation time is compressed with the sinking animation; no CFD solver.
 * Every droplet returns to the current ocean height before becoming foam.
 */
export function createSinkingWater(scene:THREE.Scene){
 const geometry=new THREE.PlaneGeometry(1,1),params=new Float32Array(CAPACITY*4);
 geometry.setAttribute('aWater',new THREE.InstancedBufferAttribute(params,4).setUsage(THREE.DynamicDrawUsage));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
  uniforms:{uTime:{value:0}},vertexShader:`attribute vec4 aWater;varying vec2 vUV;varying vec4 vWater;uniform float uTime;${oceanGridHeightGLSL}
   void main(){vUV=uv*2.-1.;vWater=aWater;
    vec3 center=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
    vec2 scale=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
    vec3 p;
    if(aWater.x>.5){p=center+vec3(position.x*scale.x,0.,position.y*scale.y);p.y=oceanGridHeight(p.xz,uTime)+.035;}
    else{vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);p=center+right*position.x*scale.x+up*position.y*scale.y;}
    gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
  fragmentShader:`varying vec2 vUV;varying vec4 vWater;uniform float uTime;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
   void main(){float seed=vWater.z,fade=vWater.y,r=length(vUV);float n=noise(vUV*4.3+seed+vec2(uTime*.07,-uTime*.045));float a;
    if(vWater.x>.5){float edge=1.-smoothstep(.35,.95,r+(n-.5)*.25);float cells=smoothstep(.32,.73,n*.68+noise(vUV*13.7+seed)*.32);a=edge*(.18+cells*.82)*fade*.56;}
    else{float edge=1.-smoothstep(.25,1.,r+(n-.5)*.20);a=edge*fade*(vWater.w>.5?.22+n*.25:.35+n*.38);}
    if(a<.006)discard;gl_FragColor=vec4(mix(vec3(.49,.64,.69),vec3(.87,.94,.95),n*.6+.3),a);
    #include <colorspace_fragment>
   }`,
 });
 const mesh=new THREE.InstancedMesh(geometry,material,CAPACITY);mesh.name='sinking-water-spray-and-foam';mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=5;scene.add(mesh);
 const dummy=new THREE.Object3D();let contacts:THREE.Vector3[]=[],sources:Source[]=[],drops:Drop[]=[],emittedTotal=0,returns=0;
 function begin(at:THREE.Vector3,length:number,heading:number,width:number,seed:number,time:number){
  sources.push({at:at.clone(),length:THREE.MathUtils.clamp(length,1.6,5),width:Math.max(.16,width),heading,seed,birth:time,emitted:0});sources=sources.slice(-8);
 }
 /** Local underwater contact impulse, distinct from hull-wide sinking spray. */
 function contact(at:THREE.Vector3,seed:number,time:number){contacts.push(at.clone());contacts=contacts.slice(-8);
  for(let i=0;i<72;i++){const salt=seed+i*17.13,r=random(salt),angle=random(salt+3)*Math.PI*2,radial=.025+random(salt+4)*.09,mist=i%6===0;
   const x=at.x+Math.cos(angle)*radial,z=at.z+Math.sin(angle)*radial;
   drops.push({x,z,y:oceanSurfaceY(x,z,time)+.012,vx:Math.cos(angle)*(.08+r*.24),vz:Math.sin(angle)*(.08+r*.24),vy:.72+r*.85,birth:time,seed:salt,size:mist?.08+r*.07:.009+r*.017});emittedTotal++;
  }
  drops=drops.slice(-(CAPACITY-96));
 }
 function emit(source:Source,time:number){
  const i=source.emitted++,seed=source.seed+i*17.13,r=random(seed),long=(random(seed+3)-.5)*source.length*.92,side=i%2?1:-1;
  const lateral=side*source.width*(.32+random(seed+7)*.3),cs=Math.cos(source.heading),sn=Math.sin(source.heading);
  const x=source.at.x+lateral*cs+long*sn,z=source.at.z-lateral*sn+long*cs;
  const outward=side*(.12+r*.38),along=(random(seed+13)-.5)*.27,initial=time-source.birth<.6;
  drops.push({x,z,y:oceanSurfaceY(x,z,time)+.012,vx:outward*cs+along*sn,vz:-outward*sn+along*cs,vy:initial?.45+r*.55:.20+r*.45,birth:time,seed,size:(i%3===0?.075+r*.06:.007+r*.012)*(initial?1:.65)});emittedTotal++;
 }
 function update(time:number){material.uniforms.uTime.value=time;let count=0,spray=0,foam=0;
  const put=(x:number,y:number,z:number,sx:number,sy:number,mode:number,fade:number,seed:number,mist=0)=>{if(count>=CAPACITY)return;dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,1);dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);params.set([mode,fade,seed%100,mist],count*4);count++;if(mode)foam++;else spray++;};
  for(const s of sources){const age=time-s.birth;
   // Distributed bursts continue while the hull halves pass through the surface.
   const expected=Math.floor(Math.min(age,.55)*150+Math.max(0,Math.min(age- .55,3.25))*25+Math.max(0,Math.min(age-3.8,1.6))*12);
   let budget=18;while(s.emitted<expected&&budget-->0)emit(s,time);
   if(age<9){const fade=Math.min(1,age/.5)*Math.pow(Math.max(0,1-age/9),1.2),cs=Math.cos(s.heading),sn=Math.sin(s.heading);
    for(let i=0;i<12;i++){const z=(i/11-.5)*s.length,r=random(s.seed+i),spread=s.width*(1+age*.30),side=i%2?1:-1;
     put(s.at.x+z*sn+side*spread*.3*cs+age*.016,.1,s.at.z+z*cs-side*spread*.3*sn,spread*(1.4+r),s.length*.22*(1+r),1,fade,s.seed+i*5.7);}
   }
  }
  for(const d of drops){const age=time-d.birth,travel=(1-Math.exp(-DRAG*age))/DRAG,x=d.x+d.vx*travel,z=d.z+d.vz*travel,y=d.y+d.vy*age-.5*GRAVITY*age*age,water=oceanSurfaceY(x,z,time);
   if(d.wetAt===undefined&&age>d.vy/GRAVITY&&y<=water){d.wetAt=time;d.x=x;d.z=z;returns++;}
   if(d.wetAt!==undefined){const wetAge=time-d.wetAt;put(d.x+wetAge*.022,water,d.z+wetAge*.008,d.size*(2.5+wetAge*4),d.size*(2.5+wetAge*4),1,Math.max(0,1-wetAge/2),d.seed);}
   else put(x,y,z,d.size*(1+age*.3),d.size*(d.size>.03?1.3:1+Math.abs(d.vy-GRAVITY*age)*.7),0,Math.min(1,age/.05),d.seed,d.size>.03?1:0);
  }
  drops=drops.filter(d=>d.wetAt===undefined?time-d.birth<3:time-d.wetAt<2).slice(-(CAPACITY-96));sources=sources.filter(s=>time-s.birth<9);
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;geometry.getAttribute('aWater').needsUpdate=true;last={spray,foam};
 }
 let last={spray:0,foam:0};
 return {begin,contact,update,clear(){contacts=[];sources=[];drops=[];mesh.count=0;emittedTotal=returns=0;last={spray:0,foam:0};},diagnostics:()=>({sinkingWater:{contacts:contacts.map(p=>p.toArray()),sources:sources.length,spray:last.spray,foam:last.foam,capacity:CAPACITY,emitted:emittedTotal,waterReturns:returns,triangles:mesh.count*2,calls:mesh.count?1:0}}),dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}};
}
