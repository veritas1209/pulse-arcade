import * as THREE from 'three';

export interface CombatCameraControls {target:THREE.Vector3;enabled:boolean}
export interface CombatCameraOptions {
 seaAt?:(x:number,z:number)=>number;
 /** Optional hull anchor during preparation; vertical heave is ignored. */
 sourceShipPose?:()=>{position:THREE.Vector3}|undefined;
 projectilePose?:()=>{position:THREE.Vector3;direction:THREE.Vector3;progress:number;delivery?:string}|undefined;
}
type Stage='idle'|'preparing'|'launch'|'handoff'|'flight'|'impact'|'returning';
const UP=new THREE.Vector3(0,1,0);
const ease=(q:number)=>{const t=THREE.MathUtils.clamp(q,0,1);return t*t*t*(t*(t*6-15)+10);};

/**
 * begin(source,target,hullLength,prepSeconds) returns recommended launch delay.
 * launched(actualMuzzle,target,flightSeconds) holds the visible ship launch,
 * then blends into the moving projectile shot without a launch-time cut.
 * impact(actualImpact,sunk) holds 1.8s / 2.4s; effects/sinking may hold longer.
 * update(dt,time) runs after animated mounts/effects and before cameraGuard.
 * When effects are finished AND readyToEnd(), end(false) / finishShot() releases
 * this shot at its current pose. Queue the next shot only after isActive=false.
 * endBatch() restores the original user pose once, after the entire attack queue.
 * end() / finish() keep the older restore-by-default behavior.
 * cancel()/clear() preserve the visible pose and forget the saved batch pose.
 *
 * Cinemachine-style editorial cuts establish distant sources/impacts instead
 * of sweeping the entire board. Nearby transitions keep critically damped
 * position/look velocities and a 70-degree/s orientation cap. Flight follows the
 * actual projectile, then opens the framing to show the struck hull. All shots keep the same
 * side of the firing axis, world-up and 46-degree FOV. No raycasts or GPU passes.
 */
export function createCombatCamera(camera:THREE.PerspectiveCamera,controls:CombatCameraControls,options:CombatCameraOptions={}){
 let stage:Stage='idle',age=0,hullLength=3,preparation=.85,flightDuration=4,impactHold=1.8,sunk=false,priorEnabled=true,cancellations=0,shots=0,cuts=0,lastCut='none',batchSaved=false,restoreDuration=1.4,lastTime=0,anchorAvailable=false;
 const source=new THREE.Vector3(),target=new THREE.Vector3(),axis=new THREE.Vector3(0,0,-1),side=new THREE.Vector3(1,0,0);
 const storedPosition=new THREE.Vector3(),storedTarget=new THREE.Vector3(),storedQuaternion=new THREE.Quaternion(),sourceAnchorOffset=new THREE.Vector3();
 const lookPosition=new THREE.Vector3(),positionVelocity=new THREE.Vector3(),lookVelocity=new THREE.Vector3();
 const sourcePosition=new THREE.Vector3(),sourceLook=new THREE.Vector3(),targetPosition=new THREE.Vector3(),targetLook=new THREE.Vector3(),flightPosition=new THREE.Vector3();
 const returnPosition=new THREE.Vector3(),returnTarget=new THREE.Vector3(),returnQuaternion=new THREE.Quaternion();
 const desiredPosition=new THREE.Vector3(),desiredLook=new THREE.Vector3(),offset=new THREE.Vector3(),impulse=new THREE.Vector3(),before=new THREE.Vector3(),direction=new THREE.Vector3();
 const projectileAnchor=new THREE.Vector3(),projectileShift=new THREE.Vector3();let projectileFollowing=false,launchHold=.6,handoffDuration=1,torpedoShot=false,airstrikeShot=false;
 const handoffPosition=new THREE.Vector3(),handoffLook=new THREE.Vector3(),handoffQuaternion=new THREE.Quaternion();
 const viewMatrix=new THREE.Matrix4(),desiredQuaternion=new THREE.Quaternion();
 const active=()=>stage!=='idle';
 const speed=()=>THREE.MathUtils.clamp(hullLength*3,7,15);
 const floorAt=(x:number,z:number)=>{const sea=options.seaAt?.(x,z)??0;return Math.max(torpedoShot?.10:.32,(Number.isFinite(sea)?sea:0)+(torpedoShot?.08:.24));};
 const enforceSea=(p:THREE.Vector3)=>{p.y=Math.max(p.y,floorAt(p.x,p.z));};
 function aimAt(at:THREE.Vector3){camera.up.copy(UP);camera.lookAt(at);camera.updateMatrixWorld();}
 function cutTo(position:THREE.Vector3,at:THREE.Vector3,reason:string){camera.position.copy(position);enforceSea(camera.position);lookPosition.copy(at);controls.target.copy(at);positionVelocity.set(0,0,0);lookVelocity.set(0,0,0);aimAt(at);cuts++;lastCut=reason;}
 function release(){stage='idle';age=0;positionVelocity.set(0,0,0);lookVelocity.set(0,0,0);controls.enabled=priorEnabled;anchorAvailable=false;projectileFollowing=false;}
 function refreshAxis(selectSide:boolean){
  axis.copy(target).sub(source).setY(0);if(axis.lengthSq()<1e-8)camera.getWorldDirection(axis).setY(0);if(axis.lengthSq()<1e-8)axis.set(0,0,-1);axis.normalize();
  before.copy(side);side.set(-axis.z,0,axis.x);
  if(selectSide){offset.copy(camera.position).sub(source);if(side.dot(offset)<0)side.negate();}else if(side.dot(before)<0)side.negate();
 }
 function rigs(){
  sourcePosition.copy(source).addScaledVector(axis,-hullLength*.72).addScaledVector(side,hullLength*1.65);sourcePosition.y=source.y+Math.max(1.2,hullLength*.65);
  sourceLook.copy(source).addScaledVector(axis,hullLength*.12);sourceLook.y=source.y+hullLength*.045;
  targetPosition.copy(target).addScaledVector(axis,-hullLength*.9).addScaledVector(side,hullLength*1.8);targetPosition.y=target.y+Math.max(1.4,hullLength*.78);
  if(torpedoShot){targetPosition.copy(target).addScaledVector(axis,-.5).addScaledVector(side,THREE.MathUtils.clamp(hullLength*.35,1,1.7));targetPosition.y=target.y+.42;}
  targetLook.copy(target);targetLook.y=target.y+(torpedoShot?.12:hullLength*.07);enforceSea(sourcePosition);enforceSea(targetPosition);
  direction.copy(targetPosition).sub(sourcePosition);const travel=direction.length();flightPosition.copy(sourcePosition);if(travel>1e-8)flightPosition.addScaledVector(direction,Math.min(travel,Math.max(10,hullLength*4))/travel);
 }
 function begin(from:THREE.Vector3,to:THREE.Vector3,length:number,preparationSeconds=.85){
  if(!batchSaved){storedPosition.copy(camera.position);storedTarget.copy(controls.target);storedQuaternion.copy(camera.quaternion);priorEnabled=controls.enabled;batchSaved=true;}
  if(stage==='idle'){positionVelocity.set(0,0,0);lookVelocity.set(0,0,0);lookPosition.copy(controls.target);}
  torpedoShot=false;airstrikeShot=false;source.copy(from);target.copy(to);hullLength=THREE.MathUtils.clamp(Number.isFinite(length)?length:3,1.2,6);flightDuration=4;impactHold=1.8;sunk=false;age=0;stage='preparing';projectileFollowing=false;shots++;
  const pose=options.sourceShipPose?.();anchorAvailable=!!pose;if(pose)sourceAnchorOffset.copy(source).sub(pose.position);
  refreshAxis(true);rigs();controls.enabled=false;if(camera.fov!==46){camera.fov=46;camera.updateProjectionMatrix();}
  if(camera.position.distanceTo(sourcePosition)>Math.max(12,hullLength*5))cutTo(sourcePosition,sourceLook,'source-establish');
  const requested=Number.isFinite(preparationSeconds)?preparationSeconds:.85;
  preparation=Math.max(requested,THREE.MathUtils.clamp(camera.position.distanceTo(sourcePosition)/speed()+.55,.85,1.7));return preparation;
 }
 function launched(from:THREE.Vector3,to:THREE.Vector3,duration:number,delivery?:string){
  torpedoShot=delivery==='torpedo';airstrikeShot=delivery==='airstrike';
  if(stage==='idle'||stage==='returning')return;source.copy(from);target.copy(to);refreshAxis(false);rigs();flightDuration=Math.max(.1,Number.isFinite(duration)?duration:4);age=0;
  const pose=options.projectilePose?.();projectileFollowing=false;anchorAvailable=false;
  // The mount fires on this frame. Preserve the established hull framing so
  // the muzzle flash, recoil / VLS plume and initial separation remain visible.
  // Short flights still reserve time for tracking and victim reveal.
  launchHold=Math.min(.6,flightDuration*.18);handoffDuration=Math.min(1,flightDuration*.30);
  stage=pose?'launch':'flight';if(torpedoShot&&pose){launchHold=0;handoffDuration=Math.min(.65,flightDuration*.25);stage='handoff';handoffPosition.copy(camera.position);handoffLook.copy(lookPosition);handoffQuaternion.copy(camera.quaternion);}
 }
 function impact(at:THREE.Vector3,isSunk=false){
  if(stage==='idle'||stage==='returning')return;target.copy(at);sunk=isSunk;impactHold=sunk?2.4:1.8;rigs();stage='impact';age=0;anchorAvailable=false;
  if(camera.position.distanceTo(targetPosition)>Math.max(12,hullLength*5))cutTo(targetPosition,targetLook,'target-impact');
 }
 function finishShot(){if(stage!=='idle')release();}
 function endBatch(){
  if(!batchSaved){finishShot();return;}controls.enabled=false;anchorAvailable=false;
  const distance=camera.position.distanceTo(storedPosition),angle=camera.quaternion.angleTo(storedQuaternion);
  if(distance>Math.max(18,hullLength*6)||angle>Math.PI/3){cutTo(storedPosition,storedTarget,'batch-return');camera.quaternion.copy(storedQuaternion);batchSaved=false;release();return;}
  returnPosition.copy(camera.position);returnTarget.copy(controls.target);returnQuaternion.copy(camera.quaternion);restoreDuration=THREE.MathUtils.clamp(1.4+distance/70,1.4,1.8);stage='returning';age=0;
 }
 function end(restore=true){if(restore)endBatch();else finishShot();}
 function cancel(){if(!active()&&!batchSaved)return;cancellations++;batchSaved=false;release();}
 function spring(value:THREE.Vector3,velocity:THREE.Vector3,goal:THREE.Vector3,omega:number,dt:number,maxSpeed:number){
  before.copy(value);offset.copy(value).sub(goal);impulse.copy(velocity).addScaledVector(offset,omega);const decay=Math.exp(-omega*dt);
  value.copy(offset).addScaledVector(impulse,dt).multiplyScalar(decay).add(goal);velocity.addScaledVector(impulse,-omega*dt).multiplyScalar(decay);
  offset.copy(value).sub(before);const maximum=maxSpeed*dt,distance=offset.length();if(distance>maximum){offset.multiplyScalar(maximum/distance);value.copy(before).add(offset);velocity.copy(offset).multiplyScalar(1/dt);}else if(velocity.lengthSq()>maxSpeed*maxSpeed)velocity.setLength(maxSpeed);
 }
 function desired(){
  if(stage==='preparing'||stage==='launch'){if(anchorAvailable){const pose=options.sourceShipPose?.();if(pose){source.x=pose.position.x+sourceAnchorOffset.x;source.z=pose.position.z+sourceAnchorOffset.z;rigs();}}desiredPosition.copy(sourcePosition);desiredLook.copy(sourceLook);return;}
  if(stage==='flight'||stage==='handoff'){
   const pose=options.projectilePose?.();
   if(pose){const reveal=airstrikeShot?0:ease((pose.progress-(torpedoShot?.87:.72))/(torpedoShot?.12:.26));desiredPosition.copy(pose.position).addScaledVector(pose.direction,torpedoShot?-.38:-.45).addScaledVector(side,torpedoShot?.28:.08);desiredPosition.y+=torpedoShot?.14:.12;desiredPosition.lerp(targetPosition,reveal);desiredLook.copy(pose.position).addScaledVector(pose.direction,torpedoShot?.7:3).lerp(targetLook,reveal);return;}
   const q=age/flightDuration,transfer=ease((q-.06)/.82),lead=ease((q+Math.min(.24,flightDuration*.05)/flightDuration-.06)/.82);desiredPosition.copy(sourcePosition).lerp(flightPosition,transfer);desiredLook.copy(sourceLook).lerp(targetLook,lead);return;
  }
  desiredPosition.copy(targetPosition);desiredLook.copy(targetLook);
 }
 function update(dt:number,time:number){
  if(stage==='idle')return false;lastTime=Number.isFinite(time)?time:lastTime;const delta=THREE.MathUtils.clamp(Number.isFinite(dt)?dt:0,0,.2);if(delta===0)return true;
  if(stage==='returning'){
   age+=delta;const blend=ease(age/restoreDuration);camera.position.copy(returnPosition).lerp(storedPosition,blend);enforceSea(camera.position);controls.target.copy(returnTarget).lerp(storedTarget,blend);lookPosition.copy(controls.target);camera.quaternion.copy(returnQuaternion).slerp(storedQuaternion,blend);camera.up.copy(UP);camera.updateMatrixWorld();
   if(age>=restoreDuration){batchSaved=false;release();}return active();
  }
  // Carry the camera with the actual projectile, so long-range shots never
  // outrun a spring speed cap. Only the relative framing is damped.
  const pose=stage==='flight'?options.projectilePose?.():undefined;
  if(pose&&projectileFollowing){projectileShift.copy(pose.position).sub(projectileAnchor).multiplyScalar(airstrikeShot?1:1-ease((pose.progress-(torpedoShot?.87:.72))/(torpedoShot?.12:.26)));camera.position.add(projectileShift);lookPosition.add(projectileShift);projectileAnchor.copy(pose.position);}
  const steps=Math.max(1,Math.ceil(delta/(1/60))),step=delta/steps;
  let blendedOrientation=false;
  for(let i=0;i<steps;i++){
   age+=step;
   if(stage==='launch'&&age>=launchHold){age-=launchHold;stage='handoff';handoffPosition.copy(camera.position);handoffLook.copy(lookPosition);handoffQuaternion.copy(camera.quaternion);}
   desired();
   if(stage==='handoff'){
    // Blend toward the live projectile, not its old launch coordinates. A
    // capped spring alone cannot catch up with a long-range flying projectile.
    const blend=ease(age/handoffDuration);camera.position.copy(handoffPosition).lerp(desiredPosition,blend);lookPosition.copy(handoffLook).lerp(desiredLook,blend);enforceSea(camera.position);
    viewMatrix.lookAt(camera.position,lookPosition,UP);desiredQuaternion.setFromRotationMatrix(viewMatrix);camera.quaternion.copy(handoffQuaternion).slerp(desiredQuaternion,blend);blendedOrientation=true;
    if(age>=handoffDuration){stage='flight';age=launchHold+handoffDuration;const current=options.projectilePose?.();projectileFollowing=!!current;if(current)projectileAnchor.copy(current.position);positionVelocity.set(0,0,0);lookVelocity.set(0,0,0);}
   }else{spring(camera.position,positionVelocity,desiredPosition,stage==='preparing'?7:6,step,speed());spring(lookPosition,lookVelocity,desiredLook,8,step,speed()*2.5);const floor=floorAt(camera.position.x,camera.position.z);if(camera.position.y<floor){camera.position.y=floor;positionVelocity.y=Math.max(0,positionVelocity.y);}}
  }
  viewMatrix.lookAt(camera.position,lookPosition,UP);desiredQuaternion.setFromRotationMatrix(viewMatrix);const angle=camera.quaternion.angleTo(desiredQuaternion);
  if(!blendedOrientation)camera.quaternion.rotateTowards(desiredQuaternion,Math.min(angle*(1-Math.exp(-8*delta)),THREE.MathUtils.degToRad(70)*delta));
  direction.set(0,0,-1).applyQuaternion(camera.quaternion);controls.target.copy(camera.position).addScaledVector(direction,Math.max(1,camera.position.distanceTo(lookPosition)));camera.up.copy(UP);camera.updateMatrixWorld();return true;
 }
 const isEstablished=()=>stage==='preparing'&&camera.position.distanceTo(sourcePosition)<hullLength*.18&&controls.target.distanceTo(sourceLook)<hullLength*.18;
 const preparationRemaining=()=>stage==='preparing'?Math.max(0,preparation-age):0;
 return{hasSavedView:()=>batchSaved,isSinkingImpact:()=>stage==='impact'&&sunk,isTorpedoView:()=>active()&&torpedoShot,begin,launched,impact,update,end,finish:end,finishShot,endBatch,cancel,clear:cancel,isActive:active,isEstablished,preparationRemaining,readyToEnd:()=>stage==='impact'&&age>=impactHold,diagnostics:()=>({combatCameraStage:stage,combatCameraActive:active(),combatCameraReturning:stage==='returning',combatCameraStageAge:age,combatCameraHold:impactHold,combatCameraReadyToEnd:stage==='impact'&&age>=impactHold,combatCameraEstablished:isEstablished(),combatCameraPreparationRemaining:preparationRemaining(),combatCameraSunk:sunk,combatCameraFov:camera.fov,combatCameraSide:side.toArray(),combatCameraSource:source.toArray(),combatCameraTarget:target.toArray(),combatCameraSpeed:positionVelocity.length(),combatCameraMaxSpeed:speed(),combatCameraMaxAngularSpeed:70,combatCameraPreparation:preparation,combatCameraFlightDuration:flightDuration,combatCameraDelivery:torpedoShot?'torpedo':airstrikeShot?'airstrike':'surface',combatCameraLaunchHold:launchHold,combatCameraHandoffDuration:handoffDuration,combatCameraShots:shots,combatCameraCancellations:cancellations,combatCameraCuts:cuts,combatCameraLastCut:lastCut,combatCameraBatchSaved:batchSaved,combatCameraRestoreDuration:restoreDuration,combatCameraTime:lastTime})};
}

