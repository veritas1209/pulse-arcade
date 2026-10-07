import * as THREE from 'three';

/** Transient impact pyro. Six asymmetric pressure lobes share one density field;
 * soot absorbs emission inside the volume instead of stacking glowing circles.
 * Bounded to eight events / one draw, sharing the breach-fire noise texture. */
export function createImpactVolumes(scene:THREE.Scene,camera:THREE.Camera,noise:THREE.Data3DTexture){
 const lifetime=1.5,capacity=8,box=new THREE.BoxGeometry(1,1,1),geometry=new THREE.InstancedBufferGeometry();
 geometry.index=box.index;geometry.attributes.position=box.attributes.position;
 const origins=new Float32Array(capacity*3),dimensions=new Float32Array(capacity*3),params=new Float32Array(capacity*3),directions=new Float32Array(capacity*3);
 for(const [key,data] of [['aOrigin',origins],['aDimensions',dimensions],['aParams',params],['aDirection',directions]] as const)geometry.setAttribute(key,new THREE.InstancedBufferAttribute(data,3).setUsage(THREE.DynamicDrawUsage));
 geometry.instanceCount=0;
 const steps=48;
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,uniforms:{uNoise:{value:noise}},vertexShader:`
 attribute vec3 aOrigin,aDimensions,aParams,aDirection;
 varying vec3 vLocal,vEye,vDimensions,vParams,vDirection;
 void main(){vLocal=position+.5;vEye=(cameraPosition-aOrigin)/aDimensions+vec3(.5,0.,.5);vDimensions=aDimensions;vParams=aParams;vDirection=aDirection;
 vec3 world=aOrigin+(position+vec3(0.,.5,0.))*aDimensions;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
 fragmentShader:`precision highp float;precision highp sampler3D;
 uniform sampler3D uNoise;varying vec3 vLocal,vEye,vDimensions,vParams,vDirection;
 // Cubic reconstruction of the shared random voxel field removes the faceted
 // trilinear cell planes; density and its gradients form rounded smoke crowns.
 float volumeNoise(vec3 p){vec3 grid=p*32.-.5,f=fract(grid);f=f*f*(3.-2.*f);return texture(uNoise,(floor(grid)+f+.5)/32.).r;}
 float hash(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
 void main(){
  // Inside the proxy box its exit faces provide the ray endpoint. Outside,
  // entry faces do. Discard the other side to avoid double integration/draws.
  bool eyeInside=all(greaterThanEqual(vEye,vec3(0.)))&&all(lessThanEqual(vEye,vec3(1.)));
  if(eyeInside==gl_FrontFacing)discard;
  float age=vParams.x,seed=vParams.y,wet=vParams.z;
  vec3 ray=normalize(vLocal-vEye),inv=1./(ray+vec3(.00001)),a=(vec3(0.)-vEye)*inv,b=(vec3(1.)-vEye)*inv;
  vec3 lo=min(a,b),hi=max(a,b);float start=max(0.,max(lo.x,max(lo.y,lo.z))),finish=min(hi.x,min(hi.y,hi.z));if(finish<=start)discard;
  float stride=(finish-start)/48.,jitter=.36+.28*fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  float dissipate=smoothstep(.40,1.5,age),fade=1.-smoothstep(.55,1.5,age),flash=exp(-age*22.);
  vec4 acc=vec4(0.);vec3 sun=normalize(vec3(-.55,.85,-.4));
  // Per-event pressure directions and staged fuel are invariant along the ray.
  vec4 lobes[6];vec3 stretch[6];float burn[6];vec3 cloudMin=vec3(10.),cloudMax=vec3(-10.);
  for(int j=0;j<6;j++){
   float salt=seed+float(j)*19.31,angle=hash(salt)*6.283185,delay=float(j)*.026,life=max(0.,age-delay),expansion=1.-exp(-life*10.);
   vec3 axis=normalize(vec3(cos(angle),.45+hash(salt+4.)*.9,sin(angle)));
   vec3 center=axis*(.03+hash(salt+1.)*.12)*expansion+vDirection*(j<2?.10:.025)*expansion;
   center.y+=.07+float(j)*.022+min(life,.35)*(.045+hash(salt+2.)*.035);
   float radius=((.10+hash(salt+5.)*.055)*(.12+.88*expansion)+min(life,.35)*.020)*(1.-dissipate*.52);
   lobes[j]=vec4(center,radius);stretch[j]=vec3(.74+hash(salt+3.)*.42,1.+hash(salt+8.)*.65,.70+hash(salt+9.)*.50);
   burn[j]=smoothstep(delay,delay+.035,age)*(1.-smoothstep(.18+float(j)*.14,.64+float(j)*.38,age))*(j<3?1.:.055);
   cloudMin=min(cloudMin,center-radius*stretch[j]-vec3(.065));cloudMax=max(cloudMax,center+radius*stretch[j]+vec3(.065));
  }
  // Spend the 48 samples inside the occupied cloud, not the empty box.
  vec3 boundMin=clamp(vec3(cloudMin.x+.5,cloudMin.y*vDimensions.x/vDimensions.y,cloudMin.z+.5),0.,1.);
  vec3 boundMax=clamp(vec3(cloudMax.x+.5,cloudMax.y*vDimensions.x/vDimensions.y,cloudMax.z+.5),0.,1.);
  a=(boundMin-vEye)*inv;b=(boundMax-vEye)*inv;lo=min(a,b);hi=max(a,b);
  start=max(0.,max(lo.x,max(lo.y,lo.z)));finish=min(hi.x,min(hi.y,hi.z));if(finish<=start)discard;stride=(finish-start)/48.;
  for(int i=0;i<48;i++){
   if(acc.a>.992)break;vec3 p=vEye+ray*(start+(float(i)+jitter)*stride);
   vec3 q=(p-vec3(.5,0.,.5))*vec3(1.,vDimensions.y/vDimensions.x,1.);
   // Noise cells resolve individual rolling cauliflower crowns, not six balloons.
   // The contact envelope stays anchored. Small density changes dissolve its
   // surface instead of spinning or transporting a solid cloud over the sea.
   vec3 flow=q*.64+vec3(seed*.017,seed*.031,seed*.043)+vec3(sin(age*1.3)*.015,-age*.012,sin(age*.9)*.011);
   float coarse=volumeNoise(flow),medium=volumeNoise(flow*2.07+vec3(.17,.41,.29));
   float fine=volumeNoise(flow*2.93+vec3(.31,.13,.53));
   vec3 warped=q+(vec3(medium,fine,coarse)-.5)*.046;
   float n=coarse*.62+medium*.27+fine*.11,rough=(coarse-.5)*.10+(medium-.5)*.044+(fine-.5)*.008;
   float shape=0.,hotField=0.;vec3 surface=vec3(0.,1.,0.);
   for(int j=0;j<6;j++){
    vec3 relative=(warped-lobes[j].xyz)/stretch[j];float d=length(relative)+rough,radius=lobes[j].w;
    float envelope=1.-smoothstep(radius*.86,radius*1.015,d);

    // Fuel burns in elongated turbulent channels between dense soot crowns.
    float channel=smoothstep(.84,1.,(1.-coarse)*.74+fine*.48+medium*.12);
    float jet=1.-smoothstep(.18,.65,abs(relative.x+relative.z*.43)/max(.01,radius));
    if(envelope>shape){shape=envelope;surface=normalize(relative/stretch[j]+vec3(.0001));hotField=envelope*burn[j]*channel*(.08+.92*jet);}
   }
   float root=smoothstep(.001,.018,p.y),edge=1.-smoothstep(.80,.99,p.y);
   float density=shape*root*edge*fade*(.85+smoothstep(.30,.68,n)*2.4);
   // Differentiate the actual displaced density surface: the crown normal
   // follows its cauliflower relief, not the large enclosing pressure sphere.
   const float epsilon=.008;
   vec3 gradient=(vec3(volumeNoise(flow+vec3(epsilon,0.,0.)),
    volumeNoise(flow+vec3(0.,epsilon,0.)),
    volumeNoise(flow+vec3(0.,0.,epsilon)))-coarse)*(.64/epsilon);
   surface=normalize(surface+gradient*.10);
   float facing=max(0.,dot(surface,sun)),cavity=smoothstep(.40,.75,coarse)*.62;
   float light=(.14+facing*.83)*(1.-cavity)+smoothstep(.60,.85,medium)*.045;
   vec3 soot=mix(vec3(.004,.005,.0065),vec3(.19,.20,.215),light);
   float wisps=(1.-shape)*smoothstep(.5,.78,fine)*smoothstep(.5,1.8,age);
   soot+=vec3(.085,.090,.095)*wisps;
   float fire=hotField*(1.-wet*.87),heat=clamp(fire*1.6+flash*.75,0.,1.);
   vec3 flame=mix(vec3(1.2,.085,.003),vec3(4.,1.,.08),smoothstep(.15,.65,heat));
   flame=mix(flame,vec3(8.,5.,.8),smoothstep(.7,1.,heat)*(1.-smoothstep(.035,.12,age)));
   // Emission can be brilliant locally; thick foreground soot absorbs it.
   vec3 color=soot+flame*fire*.88;color=mix(color,vec3(.18,.21,.23)+soot,wet*.65);
   float opacity=1.-exp(-density*stride*30.);acc.rgb+=(1.-acc.a)*opacity*color;acc.a+=(1.-acc.a)*opacity;
  }
  if(acc.a<.012)discard;gl_FragColor=vec4(acc.rgb/max(.001,acc.a),acc.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='contact-pyro-volume';mesh.frustumCulled=false;mesh.renderOrder=6;scene.add(mesh);
 let tracks:{origin:THREE.Vector3;size:number;birth:number;seed:number;direction:THREE.Vector3;wet:boolean}[]=[];
 function begin(at:THREE.Vector3,radius:number,birth:number,seed:number,incoming:THREE.Vector3,wet=false){
  tracks.push({origin:at.clone().add(new THREE.Vector3(0,-radius*.08,0)),size:radius,birth,seed,direction:incoming.clone().normalize().multiplyScalar(-1),wet});tracks=tracks.slice(-capacity);
 }
 let lastUpdate=0;
 function update(time:number){lastUpdate=time;tracks=tracks.filter(t=>time-t.birth<lifetime);tracks.sort((a,b)=>b.origin.distanceToSquared(camera.position)-a.origin.distanceToSquared(camera.position));
  tracks.forEach((t,i)=>{origins.set(t.origin.toArray(),i*3);dimensions.set([t.size*3.5,t.size*4.4,t.size*3.5],i*3);params.set([Math.max(0,time-t.birth),t.seed,t.wet?1:0],i*3);directions.set(t.direction.toArray(),i*3);});geometry.instanceCount=tracks.length;for(const attr of Object.values(geometry.attributes))if(attr instanceof THREE.InstancedBufferAttribute)attr.needsUpdate=true;
 }
 return {begin,update,clear(){tracks=[];geometry.instanceCount=0;},diagnostics:()=>({impactVolume:{technique:'emission-absorption-3D-pressure-lobes',active:geometry.instanceCount,capacity,steps,calls:geometry.instanceCount?1:0,triangles:geometry.instanceCount*12,life:lifetime,origins:tracks.map(t=>t.origin.toArray()),ages:tracks.map(t=>Math.max(0,lastUpdate-t.birth))}}),dispose(){scene.remove(mesh);geometry.dispose();box.dispose();material.dispose();}};
}
