import * as THREE from 'three';
/** CC0 Blender/Cycles explosion frames by rubberduck, OpenGameArt.
 * One shared 8x4 atlas, eight bounded billboard instances. Existing particles
 * provide directional debris, black smoke and water interaction around it. */
export function createImpactFlipbooks(scene:THREE.Scene){
 const capacity=8,geometry=new THREE.PlaneGeometry(1,1),frame=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1),alpha=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
 geometry.setAttribute('aFrame',frame);geometry.setAttribute('aOpacity',alpha);let loaded=typeof document==='undefined',disposed=false;
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uAtlas:{value:null}},vertexShader:`attribute float aFrame,aOpacity;varying vec2 vUv;varying float vFrame,vOpacity;void main(){vUv=uv;vFrame=aFrame;vOpacity=aOpacity;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));p.xy+=position.xy*size;gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform sampler2D uAtlas;varying vec2 vUv;varying float vFrame,vOpacity;vec4 sampleFrame(float f){vec2 cell=vec2(mod(f,8.),3.-floor(f/8.));vec2 inset=vec2(.5/128.);vec2 uv=(cell+clamp(vUv,inset,vec2(1.)-inset))/vec2(8.,4.);vec4 c=texture2D(uAtlas,uv);c.rgb*=c.a;return c;}void main(){float f=min(29.,vFrame);vec4 c=mix(sampleFrame(floor(f)),sampleFrame(min(29.,floor(f)+1.)),fract(f));if(c.a<.008)discard;c.rgb/=max(.001,c.a);gl_FragColor=vec4(c.rgb*1.15,c.a*vOpacity);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name='external-impact-pyro';mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=8;scene.add(mesh);
 let texture:THREE.Texture|undefined;if(typeof document!=='undefined'){texture=new THREE.TextureLoader().load(new URL('../../assets/vfx/impact-pyro.png',import.meta.url).href,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;loaded=true;},undefined,()=>{loaded=true;});material.uniforms.uAtlas.value=texture;}
 const dummy=new THREE.Object3D();let tracks:{at:THREE.Vector3;birth:number;size:number;life:number}[]=[];
 function begin(at:THREE.Vector3,radius:number,birth:number,blocked=false){tracks.push({at:at.clone(),birth,size:radius*(blocked?2:3.2),life:blocked?.85:1.65});tracks=tracks.slice(-capacity);}
 function update(time:number){tracks=tracks.filter(t=>time-t.birth<t.life);let count=0;for(const t of tracks){const age=Math.max(0,time-t.birth),q=age/t.life;dummy.position.copy(t.at);dummy.position.y+=t.size*.21+age*.08;dummy.rotation.set(0,0,0);dummy.scale.setScalar(t.size);dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);frame.setX(count,q*29);alpha.setX(count,THREE.MathUtils.smoothstep(age,0,.035)*(1-THREE.MathUtils.smoothstep(q,.85,1)));count++;}mesh.count=loaded&&texture?count:0;mesh.instanceMatrix.needsUpdate=true;frame.needsUpdate=alpha.needsUpdate=true;}
 return {begin,update,texturesReady:()=>loaded,clear(){tracks=[];mesh.count=0;},diagnostics:()=>({impactFlipbook:{source:'rubberduck / OpenGameArt',license:'CC0-1.0',frames:30,capacity,active:mesh.count,calls:mesh.count?1:0,triangles:mesh.count*2,loaded,atlasBytes:1024*512*4}}),dispose(){disposed=true;scene.remove(mesh);geometry.dispose();material.dispose();texture?.dispose();}};
}
