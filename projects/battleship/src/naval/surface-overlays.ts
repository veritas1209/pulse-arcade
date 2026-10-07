import {Material} from 'three';
import type {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {oceanGridHeightGLSL} from './ocean';
/** Tactical marks sit on the water surface, never on a raised sheet through the hull. */
export function followWaterSurface(material:Material,time:{value:number},lift=.012){
 material.onBeforeCompile=shader=>{
  shader.uniforms.uSurfaceTime=time;
  shader.vertexShader=`uniform float uSurfaceTime;${oceanGridHeightGLSL}\n`+shader.vertexShader.replace('#include <project_vertex>',`
   vec4 surfaceWorld=vec4(transformed,1.);
   #ifdef USE_INSTANCING
    surfaceWorld=instanceMatrix*surfaceWorld;
   #endif
   surfaceWorld=modelMatrix*surfaceWorld;
   surfaceWorld.y=oceanGridHeight(surfaceWorld.xz,uSurfaceTime)+${lift.toFixed(4)};
   vec4 mvPosition=viewMatrix*surfaceWorld;
   gl_Position=projectionMatrix*mvPosition;`);
 };
 material.customProgramCacheKey=()=>`naval-water-overlay-${lift}`;material.needsUpdate=true;
}
export function followWaterOutline(material:LineMaterial,time:{value:number},lift=.018){
 material.onBeforeCompile=shader=>{
  shader.uniforms.uSurfaceTime=time;
  shader.vertexShader=`uniform float uSurfaceTime;${oceanGridHeightGLSL}\n`+shader.vertexShader
   .replace('vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );',`vec4 surfaceStart=modelMatrix*vec4(instanceStart,1.);surfaceStart.y=oceanGridHeight(surfaceStart.xz,uSurfaceTime)+${lift.toFixed(4)};vec4 start=viewMatrix*surfaceStart;`)
   .replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );',`vec4 surfaceEnd=modelMatrix*vec4(instanceEnd,1.);surfaceEnd.y=oceanGridHeight(surfaceEnd.xz,uSurfaceTime)+${lift.toFixed(4)};vec4 end=viewMatrix*surfaceEnd;`);
 };
 material.customProgramCacheKey=()=>`naval-water-outline-${lift}`;material.needsUpdate=true;
}
