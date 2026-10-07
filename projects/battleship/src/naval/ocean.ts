import * as THREE from 'three';
import {WAKE_PHYSICS} from './wake-physics';
import {bakeWakeTurbulence} from './wake-noise';
// Linear daylight haze shared with opaque materials; one world unit is 84.58 m.
export const OCEAN_ATMOSPHERE={color:[.56,.73,.88] as const,density:.00048};
export const oceanAtmosphereGLSL=`vec3 oceanAtmosphere(vec3 color,float worldDistance){return mix(color,vec3(${OCEAN_ATMOSPHERE.color.join(',')}),1.-exp(-worldDistance*${OCEAN_ATMOSPHERE.density}));}`;
// Fixed board-centered detail; contacts, decals and wakes share its triangles.
const OCEAN_GRID={extent:600,core:60,step:1.25,coreCells:96,outerCells:16};
const outerStep=(OCEAN_GRID.extent-OCEAN_GRID.core)/OCEAN_GRID.outerCells;
function gridAxis(p:number){const step=Math.abs(p)<OCEAN_GRID.core?OCEAN_GRID.step:outerStep,origin=p<-OCEAN_GRID.core?-OCEAN_GRID.extent:p>=OCEAN_GRID.core?OCEAN_GRID.core:-OCEAN_GRID.core;return{a:origin+Math.floor((p-origin)/step)*step,step};}
// Deep-water dispersion in world units, independent oblique families, curved
// crests. The combined 2.18 m bound is below the former 6.60 m height bound.
const waves=[
 {angle:.43,length:16.7,amplitude:.0075,phase:.71},
 {angle:1.02,length:10.3,amplitude:.0060,phase:2.37},
 {angle:-.24,length:7.1,amplitude:.0045,phase:4.83},
 {angle:1.94,length:5.1,amplitude:.0035,phase:1.43},
 {angle:.78,length:3.7,amplitude:.0025,phase:5.61},
 {angle:2.51,length:2.8,amplitude:.0018,phase:3.19},
].map(w=>({...w,x:Math.cos(w.angle),z:Math.sin(w.angle),k:2*Math.PI/w.length,omega:Math.sqrt(9.81/WAKE_PHYSICS.metresPerUnit*2*Math.PI/w.length)}));
function swellHeight(x:number,z:number,t:number){const wx=x+Math.sin(z*.173+t*.071)*.45,wz=z+Math.sin(x*.139-t*.053)*.45;let height=0;for(const w of waves)height+=Math.sin((wx*w.x+wz*w.z)*w.k-t*w.omega+w.phase)*w.amplitude;return height;}
export function oceanSurfaceY(x:number,z:number,t:number){const gx=gridAxis(x),gz=gridAxis(z),ax=gx.a,az=gz.a,fx=(x-ax)/gx.step,fz=(z-az)/gz.step,h00=swellHeight(ax,az,t),h10=swellHeight(ax+gx.step,az,t),h01=swellHeight(ax,az+gz.step,t),h11=swellHeight(ax+gx.step,az+gz.step,t);return fx+fz<=1?h00+fx*(h10-h00)+fz*(h01-h00):h11+(1-fx)*(h01-h11)+(1-fz)*(h10-h11);}
const gl=(n:number)=>n.toFixed(9);
const waveGLSL=`
vec3 swellSurface(vec2 p,float t){
 vec2 phaseWarp=vec2(p.y*.173+t*.071,p.x*.139-t*.053);
 vec2 q=p+sin(phaseWarp)*.45;
 vec2 warpDerivative=cos(phaseWarp)*vec2(.173,.139)*.45;
 float height=0.;vec2 slope=vec2(0.);
 ${waves.map(w=>"{vec2 d=vec2("+gl(w.x)+","+gl(w.z)+");float phase=dot(q,d)*"+gl(w.k)+"-t*"+gl(w.omega)+"+"+gl(w.phase)+";height+=sin(phase)*"+gl(w.amplitude)+";slope+=cos(phase)*"+gl(w.amplitude*w.k)+"*vec2(d.x+d.y*warpDerivative.y,d.y+d.x*warpDerivative.x);}").join("\n ")}
 return vec3(height,slope);
}
float swell(vec2 p,float t){return swellSurface(p,t).x;}
`;
// Shared interpolation follows the nonuniform mesh and its diagonal.
export const oceanGridHeightGLSL=waveGLSL+`
vec2 oceanGridAxis(float p){float s=abs(p)<60.?1.25:33.75;float origin=p< -60.?-600.:p>=60.?60.:-60.;return vec2(origin+floor((p-origin)/s)*s,s);}
vec3 oceanGridSurface(vec2 p,float t){vec2 gx=oceanGridAxis(p.x),gz=oceanGridAxis(p.y),a=vec2(gx.x,gz.x),s=vec2(gx.y,gz.y),f=(p-a)/s;vec3 h00=swellSurface(a,t),h10=swellSurface(a+vec2(s.x,0.),t),h01=swellSurface(a+vec2(0.,s.y),t),h11=swellSurface(a+s,t);return f.x+f.y<=1.?h00+f.x*(h10-h00)+f.y*(h01-h00):h11+(1.-f.x)*(h01-h11)+(1.-f.y)*(h10-h11);}
float oceanGridHeight(vec2 p,float t){return oceanGridSurface(p,t).x;}
`;
function oceanGeometry(){const cells=OCEAN_GRID.coreCells+OCEAN_GRID.outerCells*2,geo=new THREE.PlaneGeometry(1200,1200,cells,cells);geo.rotateX(-Math.PI/2);const position=geo.getAttribute("position"),axis=(i:number)=>i<OCEAN_GRID.outerCells?-OCEAN_GRID.extent+i*outerStep:i<=OCEAN_GRID.outerCells+OCEAN_GRID.coreCells?-OCEAN_GRID.core+(i-OCEAN_GRID.outerCells)*OCEAN_GRID.step:OCEAN_GRID.core+(i-OCEAN_GRID.outerCells-OCEAN_GRID.coreCells)*outerStep;for(let z=0;z<=cells;z++)for(let x=0;x<=cells;x++)position.setXYZ(z*(cells+1)+x,axis(x),0,axis(z));position.needsUpdate=true;geo.computeBoundingBox();geo.computeBoundingSphere();return geo;}
export function createOcean(scene:THREE.Scene){
 const blank=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);blank.needsUpdate=true;
 const neutralTactical=new THREE.DataTexture(new Uint8Array([255,0,0,0]),1,1);neutralTactical.needsUpdate=true;
 // Cache micro-wave slopes once; sampling filtered normals avoids dozens of
 // procedural noise evaluations per covered pixel at close camera distances.
 const resolution=256,slopes=new Float32Array(resolution*resolution),normalPixels=new Uint8Array(resolution*resolution*4);
 // Seeded, seamless value noise is baked once. Warping breaks the aligned crests
 // of a Fourier/sine tile without any per-pixel procedural noise or added maps.
 const hash=(x:number,y:number)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 const noise=(x:number,y:number,period:number)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),at=(a:number,b:number)=>hash((a%period+period)%period,(b%period+period)%period);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iy),at(ix+1,iy),sx),THREE.MathUtils.lerp(at(ix,iy+1),at(ix+1,iy+1),sx),sy);};
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){const u=x/resolution,v=y/resolution,wx=(noise(u*4,v*4,4)-.5)*.12,wy=(noise(u*4+17,v*4+9,4)-.5)*.12;slopes[y*resolution+x]=noise((u+wx)*8,(v+wy)*8,8)*.44+noise((u-wy)*19,(v+wx)*19,19)*.32+noise(u*43,v*43,43)*.17+noise(u*83,v*83,83)*.07;}
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){const i=(y*resolution+x)*4,dx=(slopes[y*resolution+(x+1)%resolution]-slopes[y*resolution+(x+resolution-1)%resolution])*9,dz=(slopes[((y+1)%resolution)*resolution+x]-slopes[((y+resolution-1)%resolution)*resolution+x])*9;normalPixels[i]=Math.round(THREE.MathUtils.clamp(dx*.5+.5,0,1)*255);normalPixels[i+1]=Math.round(THREE.MathUtils.clamp(dz*.5+.5,0,1)*255);normalPixels[i+2]=Math.round(slopes[y*resolution+x]*255);normalPixels[i+3]=255;}
 const ripple=new THREE.DataTexture(normalPixels,resolution,resolution);ripple.wrapS=ripple.wrapT=THREE.RepeatWrapping;ripple.magFilter=THREE.LinearFilter;ripple.minFilter=THREE.LinearMipmapLinearFilter;ripple.generateMipmaps=true;ripple.anisotropy=2;ripple.needsUpdate=true;
 const foamNoise=new THREE.DataTexture(bakeWakeTurbulence(),512,512);foamNoise.name='unique-world-wake-turbulence';foamNoise.wrapS=foamNoise.wrapT=THREE.ClampToEdgeWrapping;foamNoise.magFilter=THREE.LinearFilter;foamNoise.minFilter=THREE.LinearMipmapLinearFilter;foamNoise.generateMipmaps=true;foamNoise.needsUpdate=true;
 const neutralWake=new THREE.DataTexture(new Uint8Array([128,128,128,0]),1,1);neutralWake.needsUpdate=true;
 const uniforms={uFoamNoise:{value:foamNoise},uWakeActive:{value:0},uWakeField:{value:neutralWake as THREE.Texture},uPatch:{value:new THREE.Vector3(0,0,0)},uLocalSurface:{value:0},uSceneColor:{value:blank as THREE.Texture},uSceneDepth:{value:blank as THREE.Texture},uSceneDepthEnabled:{value:0},uSceneResolution:{value:new THREE.Vector2(1,1)},uCameraNear:{value:.1},uCameraFar:{value:1300},uTacticalMask:{value:neutralTactical as THREE.Texture},uRipple:{value:ripple},uShore:{value:blank},uTime:{value:0},uSun:{value:new THREE.Vector3(-.55,.85,-.4).normalize()}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`uniform float uTime;uniform float uLocalSurface;uniform sampler2D uWakeField;uniform vec3 uPatch;varying vec3 vWorld;varying vec4 vClip;varying vec2 vSwellSlope;${oceanGridHeightGLSL}
 void main(){vec3 p=position;vec2 xz=p.xz+vec2(modelMatrix[3].x,modelMatrix[3].z);vec3 water=uLocalSurface>.5?oceanGridSurface(xz,uTime):swellSurface(xz,uTime);vSwellSlope=water.yz;if(uLocalSurface>.5){vec2 uv=(xz+60.)/120.;float inside=step(0.,uv.x)*step(0.,uv.y)*step(uv.x,1.)*step(uv.y,1.);float fade=1.-smoothstep(8.,12.,max(abs(xz.x-uPatch.x),abs(xz.y-uPatch.y)));p.y=water.x+(texture2D(uWakeField,clamp(uv,0.,1.)).r*255.-128.)/127.*${WAKE_PHYSICS.heightRange}*inside*fade;}else p.y+=water.x;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vClip=projectionMatrix*viewMatrix*world;gl_Position=vClip;}`,
 fragmentShader:`precision highp float;uniform float uTime;uniform vec3 uSun;uniform sampler2D uFoamNoise;uniform sampler2D uWakeField;uniform float uWakeActive;uniform vec3 uPatch;uniform float uLocalSurface;uniform sampler2D uShore;uniform sampler2D uRipple;uniform sampler2D uSceneColor;uniform sampler2D uSceneDepth;uniform sampler2D uTacticalMask;uniform float uSceneDepthEnabled;uniform vec2 uSceneResolution;uniform float uCameraNear;uniform float uCameraFar;varying vec3 vWorld;varying vec4 vClip;varying vec2 vSwellSlope;
 ${oceanAtmosphereGLSL}
 float viewDepth(float d){return uCameraNear*uCameraFar/max(.00001,uCameraFar-d*(uCameraFar-uCameraNear));}
 void main(){vec2 p=vWorld.xz;if(uLocalSurface<.5&&uPatch.z>.5&&max(abs(p.x-uPatch.x),abs(p.y-uPatch.y))<12.45)discard;vec2 fieldUV=(p+60.)/120.;float fieldIn=step(0.,fieldUV.x)*step(0.,fieldUV.y)*step(fieldUV.x,1.)*step(fieldUV.y,1.);vec4 field=vec4(128./255.,128./255.,128./255.,0.);if(uWakeActive>.5)field=texture2D(uWakeField,clamp(fieldUV,0.,1.));vec2 wakeSlope=(field.gb*255.-128.)/127.*.06*fieldIn;float pixel=length(fwidth(p));float detailWeight=1./(1.+pixel*pixel*900.);
 // Geometry carries swell; independently advected cached slopes carry 6-60 m
 // wind waves. Unequal scales and rotations break long grazing-angle strips.
 vec3 rippleA=texture2D(uRipple,p*.71+vec2(uTime*.014,-uTime*.009)).rgb;
 vec3 rippleB=texture2D(uRipple,mat2(.764,-.645,.645,.764)*p*1.63+vec2(-uTime*.022,uTime*.015)).rgb;
 vec3 macro=texture2D(uRipple,mat2(.939,.343,-.343,.939)*p*vec2(.19,.27)+vec2(uTime*.006,-uTime*.004)).rgb;
 vec2 micro=(rippleA.rg-.5)*.42+(rippleB.rg-.5)*.21;
 vec2 broadSlope=(macro.rg-.5)*.24/(1.+pixel*pixel*64.);
 vec2 totalSlope=-vSwellSlope+broadSlope+micro*detailWeight-wakeSlope/(1.+pixel*pixel*16.);
 vec3 n=normalize(vec3(totalSlope.x,1.,totalSlope.y)),v=normalize(cameraPosition-vWorld);
 float ndv=max(dot(v,n),.001),fres=.0204+.9796*pow(1.-ndv,5.);vec3 refl=reflect(-v,n);
 vec3 deep=vec3(.010,.048,.073),surfaceScatter=vec3(.024,.113,.151);
 float variation=(rippleA.b*.65+rippleB.b*.35-.5)*detailWeight;
 vec3 body=mix(deep,surfaceScatter,.42+(macro.b-.5)*.18+variation*.12);
 // Unresolved slopes broaden the reflection rather than leaving polished
 // streaks. GGX replaces the former pair of broad Phong highlights.
 float roughness=.19+(1.-detailWeight)*.17;
 vec3 sky=mix(vec3(.24,.45,.63),vec3(.035,.16,.42),pow(max(0.,refl.y),.35));
 sky=mix(sky,vec3(.22,.39,.55),roughness*.32);
 vec3 halfDirection=normalize(uSun+v);float ndh=max(dot(n,halfDirection),0.),ndl=max(dot(n,uSun),.001),vdh=max(dot(v,halfDirection),0.);
 float alpha=roughness*roughness,a2=alpha*alpha,denom=ndh*ndh*(a2-1.)+1.,distribution=a2/(3.14159265*denom*denom);
 float visibilityK=(roughness+1.)*(roughness+1.)*.125;
 float visibilityV=ndv/(ndv*(1.-visibilityK)+visibilityK),visibilityL=ndl/(ndl*(1.-visibilityK)+visibilityK);
 float sunFresnel=.0204+.9796*pow(1.-vdh,5.);
 float spec=min(.35,distribution*visibilityV*visibilityL*sunFresnel/(4.*ndv));
 vec3 col=mix(body,sky,fres*.80)+vec3(1.,.96,.86)*spec;
 if(uSceneDepthEnabled>.5){
  vec2 halfTexel=.5/uSceneResolution,screenUV=clamp(vClip.xy/vClip.w*.5+.5,halfTexel,1.-halfTexel);
  vec3 waterView=(viewMatrix*vec4(vWorld,1.)).xyz;float waterDepth=-waterView.z;
  float originalDepthRaw=texture2D(uSceneDepth,screenUV).r;float originalDepth=viewDepth(originalDepthRaw);float depthTolerance=max(.002,waterDepth*waterDepth/(uCameraNear*8388608.));
  // Refract only the submerged background. A foreground hull edge must never
  // be pulled sideways into water or duplicated as a bright outline.
  if(originalDepthRaw<.999999&&originalDepth>waterDepth+depthTolerance){
   vec2 normalView=(mat3(viewMatrix)*n).xy;
   vec2 refractedUV=clamp(screenUV+normalView*.003*detailWeight,halfTexel,1.-halfTexel);
   float behindDepthRaw=texture2D(uSceneDepth,refractedUV).r;float behindDepth=viewDepth(behindDepthRaw);
   if(behindDepthRaw>=.999999||behindDepth<=waterDepth+depthTolerance){refractedUV=screenUV;behindDepth=originalDepth;}
   float opticalDepth=max(0.,behindDepth-waterDepth)*length(waterView)/max(.1,waterDepth);
   vec3 transmission=exp(-min(opticalDepth,20.)*vec3(10.,6.,3.5));
   vec3 submerged=texture2D(uSceneColor,refractedUV).rgb*transmission+body*(1.-transmission);
   col=mix(submerged,sky,fres*.80)+vec3(1.,.96,.86)*spec;
  }
 }

 vec2 shoreUV=(p+60.)/120.;vec4 coast=texture2D(uShore,clamp(shoreUV,0.,1.));float inMap=step(0.,shoreUV.x)*step(0.,shoreUV.y)*step(shoreUV.x,1.)*step(shoreUV.y,1.);coast*=inMap;
 // B is actual shallow terrain below sea level, never an offshore halo.
 // Real depth transmission supplies its own seabed color when available.
 col=mix(col,vec3(.065,.11,.10),coast.b*.08*(1.-fres)*(1.-uSceneDepthEnabled));col*=1.-coast.a*.16;
 float foam=coast.r*(.065+.065*rippleB.b)*(1.-coast.g);if(field.a>.003){vec2 drift=vec2(uTime*.000035,-uTime*.000017),warp=(texture2D(uFoamNoise,clamp(shoreUV,0.,1.)).gb-.5)*.006;float turbulence=texture2D(uFoamNoise,clamp(shoreUV+drift+warp,0.,1.)).r;float breakup=smoothstep(.39,.62,turbulence);foam+=pow(field.a,1.25)*fieldIn*breakup*.64;}col=mix(col,vec3(.75,.82,.83),foam);vec4 tactical=mix(vec4(1.,0.,0.,0.),texture2D(uTacticalMask,clamp(shoreUV,0.,1.)),inMap);
 vec2 tile=fract((p+60.)/4.),tileSide=min(tile,1.-tile)*4.;float border=min(tileSide.x,tileSide.y);
 float tileEdge=1.-smoothstep(.035,.035+max(.045,pixel*.85),border);
 col*=mix(.94,1.,tactical.r);
 // A single antialiased pixel per axis keeps the board legible without a
 // competing coplanar mesh. Fade only once cells become subpixel at the horizon.
 vec2 gridFootprint=max(fwidth((p+60.)/4.),vec2(.00001));
 vec2 gridPixels=min(tile,1.-tile)/gridFootprint;
 float gridLine=(1.-smoothstep(.25,1.05,min(gridPixels.x,gridPixels.y)))*(1.-smoothstep(.28,.75,max(gridFootprint.x,gridFootprint.y)));
 col=mix(col,vec3(.15,.27,.285),gridLine*.12*inMap*(1.-coast.g));
 float movement=tactical.g*tileEdge*.16,recon=tactical.b*tileEdge*.17,lastKnown=tactical.a*tileEdge*.24;
 col=mix(col,vec3(.10,.31,.27),movement);col=mix(col,vec3(.35,.25,.10),recon);col=mix(col,vec3(.42,.075,.055),lastKnown);
 float dist=length(cameraPosition-vWorld);col=oceanAtmosphere(col,dist);gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const geo=oceanGeometry();const ocean=new THREE.Mesh(geo,material);ocean.name='multiscale-ocean';scene.add(ocean);
 const patchGeo=new THREE.PlaneGeometry(25,25,100,100);patchGeo.rotateX(-Math.PI/2);const patchMat=new THREE.ShaderMaterial({polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,uniforms:{...uniforms,uLocalSurface:{value:1}},vertexShader:material.vertexShader,fragmentShader:material.fragmentShader});const patch=new THREE.Mesh(patchGeo,patchMat);patch.name='displaced-pressure-wave-surface';patch.visible=false;scene.add(patch);const look=new THREE.Vector3();
 // Cloudless daylight. Linear colors follow the same output transform as
 // vessels/water, including the un-tonemapped linear refraction target.
 const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{uSun:uniforms.uSun},vertexShader:`varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;uniform vec3 uSun;
 void main(){vec3 d=normalize(vDir);float h=max(0.,d.y),sun=max(dot(d,uSun),0.);
 vec3 col=mix(vec3(.18,.42,.72),vec3(.035,.16,.42),pow(h,.35));
 float disk=smoothstep(.9999849,.9999928,sun);float haze=pow(sun,64.)*.045;
 col+=vec3(1.,.97,.90)*(disk*3.+haze);gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(480,32,16),skyMat);sky.name='clear-daylight-atmosphere';sky.frustumCulled=false;scene.add(sky);
 return {uniforms,mesh:ocean,setRefraction(target:THREE.WebGLRenderTarget|null,camera:THREE.PerspectiveCamera){uniforms.uCameraNear.value=camera.near;uniforms.uCameraFar.value=camera.far;uniforms.uSceneDepthEnabled.value=target?.depthTexture?1:0;uniforms.uSceneColor.value=target?.texture??blank;uniforms.uSceneDepth.value=target?.depthTexture??blank;uniforms.uSceneResolution.value.set(target?.width??1,target?.height??1);},followCamera(camera:THREE.Camera){sky.position.copy(camera.position);camera.getWorldDirection(look);const depth=-camera.position.y/Math.min(-.0001,look.y),enabled=uniforms.uWakeActive.value>.5&&camera.position.y<30&&look.y<-.025&&depth<70;patch.visible=enabled;const center=camera.position.clone().addScaledVector(look,Math.max(0,depth));patch.position.set(Math.round(THREE.MathUtils.clamp(center.x,-47.5,47.5)/1.25)*1.25,0,Math.round(THREE.MathUtils.clamp(center.z,-47.5,47.5)/1.25)*1.25);uniforms.uPatch.value.set(patch.position.x,patch.position.z,enabled?1:0);},diagnostics(){return{oceanWaveModel:'six-family-dispersive-warped-swell',oceanGeometricWaves:waves.length,oceanCoreGridStep:OCEAN_GRID.step,oceanSurfaceTriangles:geo.index!.count/3,oceanHeightBoundMetres:waves.reduce((sum,w)=>sum+w.amplitude,0)*WAKE_PHYSICS.metresPerUnit,oceanNormalSamples:3,oceanExtraReflectionPasses:0,wakeSurfacePatch:patch.visible,wakePattern:'unique-world-domain-warp',wakePatternPeriod:0,wakeTurbulenceBytes:512*512*4,wakeSurfaceTriangles:patch.visible?20000:0,wakeSurfacePatchBounds:patch.visible?{x:patch.position.x,z:patch.position.z,halfSize:12.5,alignedGrid:1.25}:null,wakeSurfaceDrawCalls:patch.visible?1:0};},dispose(){patchGeo.dispose();patchMat.dispose();neutralWake.dispose();foamNoise.dispose();blank.dispose();neutralTactical.dispose();ripple.dispose();geo.dispose();material.dispose();sky.geometry.dispose();skyMat.dispose();}};
}
