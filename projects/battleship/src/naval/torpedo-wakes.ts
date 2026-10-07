import * as THREE from 'three';
import {oceanGridHeightGLSL} from './ocean';
import {wakeNoise,wakeSeed} from './wake-noise';

type Point={x:number;z:number;born:number;distance:number};
const LIFE=9,POINTS=128,MAX_SEGMENTS=24*(POINTS-1);
/** Only observed projectile positions enter history. No future route is sampled. */
export function createTorpedoWakeHistory(){
 const tracks=new Map<string,{points:Point[];last:Point;seed:number}>();
 let now=0;
 function observe(id:string,x:number,z:number,time:number){
  now=time;let track=tracks.get(id);
  if(!track){tracks.set(id,{points:[],last:{x,z,born:time,distance:0},seed:wakeSeed(id)});return;}
  const last=track.last,d=Math.hypot(x-last.x,z-last.z);
  if(d>4){track.points=[];track.last={x,z,born:time,distance:0};return;}
  if(d<.015){track.last.born=time;return;}
  if(!track.points.length)track.points.push({...last});
  const count=Math.ceil(d/.12);
  for(let i=1;i<=count;i++){const t=i/count;track.points.push({x:last.x+(x-last.x)*t,z:last.z+(z-last.z)*t,born:last.born+(time-last.born)*t,distance:last.distance+d*t});}
  track.last={x,z,born:time,distance:last.distance+d};
  if(track.points.length>POINTS)track.points.splice(0,track.points.length-POINTS);
 }
 function prune(time:number){now=time;for(const [id,t]of tracks){while(t.points.length&&time-t.points[0]!.born>LIFE)t.points.shift();if(!t.points.length&&time-t.last.born>LIFE)tracks.delete(id);}}
 function segments(){return [...tracks.values()].flatMap(t=>t.points.slice(1).map((b,i)=>({a:t.points[i]!,b,seed:t.seed})));}
 return{observe,prune,segments,clear(){tracks.clear();},diagnostics(){return{torpedoWakeSegments:segments().length,torpedoWakeHistory:tracks.size,torpedoWakeLifeSeconds:LIFE,torpedoWakePersistent:true,torpedoWakePattern:'observed-world-nonperiodic',torpedoWakeTime:now};}};
}

/** One bounded, narrow world-space foam ribbon; turbulent history survives impact.
 * Model/wake dimensions are metres, rather than broad attached repeated quads. */
export function createTorpedoWakes(scene:THREE.Scene,time:{value:number},noise:{value:THREE.Texture},shore:{value:THREE.Texture}){
 const history=createTorpedoWakeHistory(),positions=new Float32Array(MAX_SEGMENTS*18),attrs=new Float32Array(MAX_SEGMENTS*18);
 const geometry=new THREE.BufferGeometry(),position=new THREE.BufferAttribute(positions,3),detail=new THREE.BufferAttribute(attrs,3);position.setUsage(THREE.DynamicDrawUsage);detail.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',position);geometry.setAttribute('wakeDetail',detail);geometry.setDrawRange(0,0);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:time,uNoise:noise,uShore:shore},vertexShader:`uniform float uTime;attribute vec3 wakeDetail;varying vec3 vDetail;varying vec2 vWorld;${oceanGridHeightGLSL}
 void main(){vec3 p=position;p.y=oceanGridHeight(p.xz,uTime)+.003;vDetail=wakeDetail;vWorld=p.xz;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
 fragmentShader:`uniform float uTime;uniform sampler2D uNoise;uniform sampler2D uShore;varying vec3 vDetail;varying vec2 vWorld;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 uv=clamp((vWorld+60.)/120.,0.,1.);if(texture2D(uShore,uv).g>.45)discard;
 float age=max(0.,uTime-vDetail.y),edge=1.-smoothstep(.12,.95,abs(vDetail.x));vec2 warp=(texture2D(uNoise,uv).gb-.5)*.006;
 float clusters=texture2D(uNoise,clamp(uv+warp+vec2(age*.00008,-age*.00005),0.,1.)).r;
 float grain=mix(.7,hash(floor(vWorld*250.+vDetail.z)),1.-smoothstep(.015,.06,length(fwidth(vWorld))));
 float alpha=edge*exp(-age*.34)*smoothstep(.22,.62,clusters)*(.45+.55*grain)*.53*(1.-smoothstep(7.,9.,age));
 gl_FragColor=vec4(.69,.79,.80,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='persistent-torpedo-turbulent-foam';mesh.frustumCulled=false;scene.add(mesh);
 function update(now:number){history.prune(now);let at=0;
  const vertex=(p:Point,nx:number,nz:number,side:number,seed:number)=>{const age=Math.max(0,now-p.born),chaos=wakeNoise(p.distance*11,seed%997,seed),width=.018+age*.0025,drift=(chaos-.5)*Math.min(.04,age*.007);positions[at*3]=p.x+nx*(side*width+drift);positions[at*3+1]=0;positions[at*3+2]=p.z+nz*(side*width+drift);attrs[at*3]=side;attrs[at*3+1]=p.born;attrs[at*3+2]=seed%997;at++;};
  for(const {a,b,seed}of history.segments().slice(-MAX_SEGMENTS)){const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.00001)continue;const nx=-dz/length,nz=dx/length;
   for(const [p,side]of [[a,-1],[b,-1],[a,1],[a,1],[b,-1],[b,1]] as [Point,number][])vertex(p,nx,nz,side,seed);
  }
  geometry.setDrawRange(0,at);mesh.visible=at>0;if(at){position.needsUpdate=true;detail.needsUpdate=true;}
 }
 return{observe:history.observe,update,clear:history.clear,diagnostics(){return{...history.diagnostics(),torpedoWakeTriangles:geometry.drawRange.count/3,torpedoWakeDrawCalls:mesh.visible?1:0};},dispose(){history.clear();scene.remove(mesh);geometry.dispose();material.dispose();}};
}
