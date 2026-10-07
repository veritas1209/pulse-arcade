import * as THREE from 'three';

/** Small linear-color/depth capture for shallow hull/shore transmission only.
 * Tactical overlays and VFX never enter it, and the main fleet retains its LOD.
 */
export function createWaterRefraction(renderer:THREE.WebGLRenderer){
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
 target.texture.colorSpace=THREE.LinearSRGBColorSpace;target.texture.name='shallow-water-linear-scene';target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);target.depthTexture.name='shallow-water-scene-depth';
 const viewport=new THREE.Vector2(),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),savedColor=new THREE.Color();let active=false,calls=0,triangles=0;
 function capture(scene:THREE.Scene,camera:THREE.PerspectiveCamera,candidates:{mesh:THREE.Mesh;low?:THREE.BufferGeometry}[]){
  active=false;calls=triangles=0;
  // Depth absorption hides distant submerged geometry; do not repeat the map
  // render for the tactical overview. Visible objects only: never hidden ships.
  if(camera.position.y>75)return null;
  camera.updateMatrixWorld();scene.updateMatrixWorld();frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visible=candidates.filter(({mesh})=>mesh.visible&&mesh.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position)<110&&frustum.intersectsObject(mesh));
  if(!visible.length)return null;
  renderer.getDrawingBufferSize(viewport);const scale=Math.min(.5,1024/Math.max(viewport.x,viewport.y));const width=Math.max(1,Math.round(viewport.x*scale)),height=Math.max(1,Math.round(viewport.y*scale));if(target.width!==width||target.height!==height)target.setSize(width,height);
  const layers=new Map<THREE.Object3D,number>(),geometries=new Map<THREE.Mesh,THREE.BufferGeometry>();const enable=(o:THREE.Object3D)=>{layers.set(o,o.layers.mask);o.layers.enable(1);};
  for(const {mesh,low} of visible){enable(mesh);if(low&&low!==mesh.geometry){geometries.set(mesh,mesh.geometry);mesh.geometry=low;}}
  scene.traverse(o=>{if(o instanceof THREE.Light)enable(o);});
  const cameraLayers=camera.layers.mask,oldTarget=renderer.getRenderTarget(),tone=renderer.toneMapping,autoShadow=renderer.shadowMap.autoUpdate,clearAlpha=renderer.getClearAlpha();renderer.getClearColor(savedColor);
  try{camera.layers.set(1);renderer.shadowMap.autoUpdate=false;renderer.toneMapping=THREE.NoToneMapping;renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,camera);calls=renderer.info.render.calls;triangles=renderer.info.render.triangles;active=true;}
  finally{renderer.setRenderTarget(oldTarget);renderer.setClearColor(savedColor,clearAlpha);renderer.toneMapping=tone;renderer.shadowMap.autoUpdate=autoShadow;camera.layers.mask=cameraLayers;for(const [o,mask]of layers)o.layers.mask=mask;for(const [mesh,geometry]of geometries)mesh.geometry=geometry;}
  return target;
 }
 return{capture,diagnostics:()=>({enabled:active,resolution:[target.width,target.height],calls,triangles,passes:active?1:0,maxDimension:1024,visibleOnly:true,lowDetailCapture:true}),dispose:()=>target.dispose()};
}
