import * as THREE from 'three';
import {oceanGridHeightGLSL} from './ocean';

/** Pooled surface ripples: soft sonar fronts or broken foam from impacts. */
export function createWaterPulseMaterial(time:{value:number},sonar=false){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
  uniforms:{uTime:time,uSonar:{value:sonar?1:0},uColor:{value:new THREE.Color(sonar?0x70cdd4:0xaacbd2)}},
  vertexShader:`varying vec2 vPulseUV;varying vec3 vPulseColor;uniform float uTime;${oceanGridHeightGLSL}
   void main(){vPulseUV=uv*2.-1.;vPulseColor=vec3(1.);
   #ifdef USE_INSTANCING_COLOR
    vPulseColor=instanceColor;
   #endif
   vec4 p=vec4(position,1.);
   #ifdef USE_INSTANCING
    p=instanceMatrix*p;
   #endif
   p=modelMatrix*p;p.y=oceanGridHeight(p.xz,uTime)+.035;
   gl_Position=projectionMatrix*viewMatrix*p;}`,
  fragmentShader:`varying vec2 vPulseUV;varying vec3 vPulseColor;uniform vec3 uColor;uniform float uTime;uniform float uSonar;
   void main(){float r=length(vPulseUV),angle=atan(vPulseUV.y,vPulseUV.x),aa=max(.003,fwidth(r)*1.2);
   float irregular=(sin(angle*11.+uTime*.7)*.003+sin(angle*23.-uTime*.4)*.002)*(1.-uSonar);
   float edge=1.-smoothstep(.009+aa,.025+aa,abs(r-(.93+irregular)));
   float trailing=(1.-smoothstep(.012+aa,.033+aa,abs(r-.855)))*.22;
   float breakup=mix(.58+sin(angle*19.+uTime)*.18+sin(angle*37.-uTime*.6)*.12,1.,uSonar);
   float strength=clamp(max(vPulseColor.r,max(vPulseColor.g,vPulseColor.b)),0.,1.);
   float alpha=(edge*breakup+trailing+uSonar*.015*(1.-smoothstep(.2,.9,r)))*strength*.64;
   if(alpha<.004)discard;gl_FragColor=vec4(uColor,alpha);
   #include <colorspace_fragment>
   }`,
 });
}
export function createWaterPulseGeometry(sonar=false){const g=new THREE.RingGeometry(.77,1,sonar?128:64,3);g.rotateX(-Math.PI/2);return g;}
