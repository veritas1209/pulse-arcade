import * as THREE from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export interface NavigationBounds {
 center: THREE.Vector3;
 /** World-space travel radius. Unlike maxDistance, this also bounds free dolly. */
 maxDistance: number | (() => number);
}

export interface FleetControlShip {id:string;kind:'carrier'|'destroyer'|'battleship'}
const FLEET_KIND_SLOT:Record<FleetControlShip['kind'],number>={carrier:0,destroyer:1,battleship:4};

/** Canonical command order: carrier, DD 1..3, then BB 1..3. Never filters sunk ships, so digit slots do not drift. */
export function orderFleetForControls<T extends FleetControlShip>(ships:readonly T[]):T[]{
 const slot=(ship:T)=>FLEET_KIND_SLOT[ship.kind]+(ship.kind==='carrier'?0:Math.max(0,Number(ship.id.match(/-(\d+)$/)?.[1]??1)-1));
 return [...ships].sort((a,b)=>slot(a)-slot(b)||a.id.localeCompare(b.id));
}

export function fleetShipAtDigit<T extends FleetControlShip>(ships:readonly T[],digit:number):T|undefined{
 return Number.isInteger(digit)&&digit>=1&&digit<=7?orderFleetForControls(ships)[digit-1]:undefined;
}

export function keyboardPanIntent(keys:ReadonlySet<string>):{x:number;y:number}{
 const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),y=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),length=Math.hypot(x,y);
 return length>1?{x:x/length,y:y/length}:{x,y};
}

/** Ground-plane navigation follows camera yaw; pitch never contributes height. */
export function horizontalPanStep(camera:THREE.Camera,intent:{x:number;y:number},distance:number,out=new THREE.Vector3()){
 const forward=camera.getWorldDirection(new THREE.Vector3()).setY(0);
 if(forward.lengthSq()<1e-8){forward.setFromMatrixColumn(camera.matrixWorld,1).setY(0);}
 if(forward.lengthSq()<1e-8)forward.set(0,0,-1);forward.normalize();
 const right=new THREE.Vector3(-forward.z,0,forward.x);
 return out.copy(right).multiplyScalar(intent.x).addScaledVector(forward,intent.y).normalize().multiplyScalar(distance).setY(0);
}

/** Fit every corner of a world box with a small screen margin, at any aspect ratio. */
export function frameNavalBounds(camera:THREE.PerspectiveCamera,bounds:THREE.Box3,direction:THREE.Vector3,margin=1.08,worldMatrix?:THREE.Matrix4){
 const target=bounds.getCenter(new THREE.Vector3());if(worldMatrix)target.applyMatrix4(worldMatrix);const back=direction.clone().normalize();
 const right=new THREE.Vector3().crossVectors(camera.up,back).normalize();
 const up=new THREE.Vector3().crossVectors(back,right).normalize();
 const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5)/camera.zoom,tanX=tanY*Math.max(.1,camera.aspect);
 let distance=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const corner=new THREE.Vector3(x,y,z);if(worldMatrix)corner.applyMatrix4(worldMatrix);corner.sub(target);const depth=corner.dot(back);
  distance=Math.max(distance,depth+Math.abs(corner.dot(right))*margin/tanX,depth+Math.abs(corner.dot(up))*margin/tanY);
 }
 distance=Math.max(camera.near*4,distance);
 return{target,position:target.clone().addScaledVector(back,distance),distance};
}

/** Free pan/dolly with an optional centered, angle-fitted inspection orbit. */
export function installModelNavigation(camera:THREE.PerspectiveCamera,controls:OrbitControls,element:HTMLElement,floor:number,depthAt?:(origin:THREE.Vector3,direction:THREE.Vector3)=>number|undefined,bounds?:NavigationBounds,onKeyboardPan?:(active:boolean)=>void,inspectionFrame?:(direction:THREE.Vector3)=>{id:string;target:THREE.Vector3;distance:number}|undefined){
 const basePan=1.15,zoom=1.05,touches=new Map<number,THREE.Vector2>(),pending=new THREE.Vector3(),keys=new Set<string>();
 const keyStep=new THREE.Vector3();
 const keyboard=element.id==='game-canvas';
 let wheelStep=0,pinchSpan=0,resolving=false,inspectionId:string|undefined,inspectionScale=1,inspectionGoal=1,panDepth=floor;
 let drag:{id:number;x:number;y:number;button:number;rebased:boolean}|undefined;
 const distance=()=>camera.position.distanceTo(controls.target);
 const maximum=()=>bounds?Math.max(floor,typeof bounds.maxDistance==='function'?bounds.maxDistance():bounds.maxDistance):Infinity;
 const forward=()=>camera.getWorldDirection(new THREE.Vector3());
 const viewDepth=()=>{
  const hit=depthAt?.(camera.position,forward()),fallback=distance();
  // Near-horizontal water intersections can be kilometres away. They must not
  // turn a small pan/wheel into an enormous jump through the map.
  return THREE.MathUtils.clamp(hit!==undefined&&Number.isFinite(hit)&&hit>0?hit:fallback,.25,bounds?Math.min(80,maximum()*.55):Math.max(80,fallback));
 };
 function constrain(horizontal=false){
  if(!bounds)return;
  const offset=camera.position.clone().sub(bounds.center),length=offset.length(),limit=maximum();
  if(length<=limit)return;
  const correction=horizontal?new THREE.Vector3(offset.x,0,offset.z).multiplyScalar(Math.sqrt(Math.max(0,limit*limit-offset.y*offset.y))/Math.max(1e-8,Math.hypot(offset.x,offset.z))).add(new THREE.Vector3(bounds.center.x,camera.position.y,bounds.center.z)).sub(camera.position):offset.multiplyScalar(limit/length).add(bounds.center).sub(camera.position);
  camera.position.add(correction);controls.target.add(correction);camera.updateMatrixWorld();
 }
 function tune(resolveDepth=false){
  if(resolving)return;resolving=true;constrain();
  controls.maxDistance=bounds?maximum()*2:Infinity;
  if(resolveDepth)panDepth=Math.max(floor,viewDepth());
  controls.panSpeed=basePan*panDepth/Math.max(.001,distance());resolving=false;
 }
 controls.minDistance=0;controls.maxDistance=bounds?maximum()*2:Infinity;
 controls.mouseButtons.MIDDLE=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
 controls.touches.TWO=THREE.TOUCH.PAN;
 const changed=()=>tune();controls.addEventListener('change',changed);
 function translate(step:THREE.Vector3,horizontal=false){
  const before=camera.position.clone();camera.position.add(step);controls.target.add(step);constrain(horizontal);
  camera.updateMatrixWorld();controls.dispatchEvent({type:'change'});controls.update();tune();
  // A collision or world boundary consumes the gesture, rather than accumulating
  // pressure that launches the camera after the obstruction disappears.
  if(camera.position.distanceTo(before.clone().add(step))>1e-4)pending.set(0,0,0);
 }
 function inspection(){
  const direction=camera.position.clone().sub(controls.target).normalize(),frame=inspectionFrame?.(direction);
  if(!frame){inspectionId=undefined;return undefined;}
  if(inspectionId!==frame.id){inspectionId=frame.id;inspectionScale=inspectionGoal=camera.position.distanceTo(controls.target)/Math.max(.001,frame.distance);}
  return{...frame,direction};
 }
 function fitInspection(dt:number){const frame=inspection();if(!frame)return;inspectionScale+=(inspectionGoal-inspectionScale)*(1-Math.exp(-dt*24));controls.target.copy(frame.target);camera.position.copy(frame.target).addScaledVector(frame.direction,Math.max(.35,frame.distance*inspectionScale));camera.lookAt(controls.target);camera.updateMatrixWorld();}
 function dolly(fraction:number){
  const frame=inspection();if(frame){pending.set(0,0,0);inspectionGoal=THREE.MathUtils.clamp(inspectionGoal*Math.exp(-fraction),.35,8);fitInspection(1/60);controls.dispatchEvent({type:'change'});controls.update();return;}
  const depth=viewDepth();wheelStep=Math.max(floor,depth)*fraction;
  const move=forward().multiplyScalar(wheelStep);pending.add(move);
  // First response is synchronous; the remainder settles in ~100 ms.
  const first=pending.clone().multiplyScalar(.35);pending.sub(first);translate(first);
 }
 function wheel(e:WheelEvent){
  if(!controls.enabled||!controls.enableZoom)return;
  e.preventDefault();e.stopImmediatePropagation();controls.dispatchEvent({type:'start'});
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?100:1)*(e.ctrlKey?10:1);
  dolly(-THREE.MathUtils.clamp(delta,-1000,1000)*.0007*zoom);controls.dispatchEvent({type:'end'});
 }
 function span(){const [a,b]=[...touches.values()];return a&&b?a.distanceTo(b):0;}
 function down(e:PointerEvent){
  pending.set(0,0,0);
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,button:e.button,rebased:false};tune(true);
  if(e.pointerType==='touch'){touches.set(e.pointerId,new THREE.Vector2(e.clientX,e.clientY));pinchSpan=span();}
 }
 function move(e:PointerEvent){
  if(drag?.id===e.pointerId&&(drag.button!==0||e.pointerType==='touch')&&!drag.rebased&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4){
   const direction=forward(),depth=Math.max(floor,viewDepth());controls.target.copy(camera.position).addScaledVector(direction,depth);drag.rebased=true;tune(true);
  }
  if(!touches.has(e.pointerId))return;
  touches.set(e.pointerId,new THREE.Vector2(e.clientX,e.clientY));const next=span();
  if(touches.size===2&&next>0&&pinchSpan>0&&controls.enabled&&controls.enableZoom)dolly(Math.log(next/pinchSpan)*.85);
  pinchSpan=next;
 }
 function up(e:PointerEvent){if(drag?.id===e.pointerId)drag=undefined;touches.delete(e.pointerId);pinchSpan=span();}
 function editable(target:EventTarget|null){
  const node=target instanceof HTMLElement?target:document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  return !!node&&(node.matches('input, select, textarea, [contenteditable="true"]')||node.isContentEditable);
 }
 function keyboardBlocked(){return editable(document.activeElement)||document.hidden||document.body.dataset.paused==='true'||!!document.querySelector('[aria-modal="true"]:not([hidden]), .menu-panel:not([hidden]), #help-panel:not([hidden]), #result-panel:not([hidden])');}
 function keydown(e:KeyboardEvent){
  if(e.altKey||e.ctrlKey||e.metaKey){clearKeys();return;}
  if(!keyboard||!['KeyW','KeyA','KeyS','KeyD'].includes(e.code)||editable(e.target)||keyboardBlocked()||!controls.enabled)return;
  if(!keys.has(e.code)){if(keys.size===0){pending.set(0,0,0);onKeyboardPan?.(true);controls.dispatchEvent({type:'start'});}keys.add(e.code);}e.preventDefault();
 }
 function keyup(e:KeyboardEvent){if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)&&keys.delete(e.code)&&keys.size===0){onKeyboardPan?.(false);controls.dispatchEvent({type:'end'});}}
 function clearKeys(){if(keys.size===0)return;keys.clear();onKeyboardPan?.(false);controls.dispatchEvent({type:'end'});}
 element.addEventListener('pointerdown',down,true);element.addEventListener('pointermove',move,true);
 element.addEventListener('pointerup',up,true);element.addEventListener('pointercancel',up,true);
 element.addEventListener('wheel',wheel,{capture:true,passive:false});tune(true);
 if(keyboard){window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clearKeys);document.addEventListener('visibilitychange',clearKeys);}
 return{
  update(delta:number){
   const dt=Math.min(.05,Math.max(0,delta));
   if(dt<=0){if(keyboard)clearKeys();return;}
   if(!controls.enabled){pending.set(0,0,0);clearKeys();return;}
   if(keyboard&&!keyboardBlocked()){
    const intent=keyboardPanIntent(keys);
    if(intent.x||intent.y){camera.updateMatrixWorld();horizontalPanStep(camera,intent,Math.max(floor,viewDepth())*.72*dt,keyStep);translate(keyStep,true);}
   }else if(keyboard)clearKeys();
   if(pending.lengthSq()<1e-7){pending.set(0,0,0);return;}const step=pending.clone().multiplyScalar(1-Math.exp(-dt*24));pending.sub(step);translate(step);
  },
  fitInspection,
  stop(){inspectionId=undefined;pending.set(0,0,0);clearKeys();},
  diagnostics:()=>({inspectionPivot:inspectionId??null,inspectionZoom:inspectionScale,navigationFloor:floor,effectivePanDistance:Math.max(viewDepth(),floor),lastWheelStep:wheelStep,middleMouse:'pan',keyboardPan:keyboard?'WASD':null,keyboardPanPlane:'XZ',pressedKeys:keyboard?[...keys]:[],zoomMode:bounds?'bounded-free-dolly':'free-dolly',maxWorldDistance:bounds?maximum():null,worldDistance:bounds?camera.position.distanceTo(bounds.center):null}),
  dispose(){controls.removeEventListener('change',changed);element.removeEventListener('pointerdown',down,true);element.removeEventListener('pointermove',move,true);element.removeEventListener('pointerup',up,true);element.removeEventListener('pointercancel',up,true);element.removeEventListener('wheel',wheel,true);if(keyboard){window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clearKeys);document.removeEventListener('visibilitychange',clearKeys);}touches.clear();pending.set(0,0,0);clearKeys();}
 };
}

