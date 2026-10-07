import * as THREE from 'three';
import type {SceneState,ShipView,Cell} from '../contract';
import {buildSuperHornet} from './aviation';

export interface CarrierAircraftPose {matrixWorld:THREE.Matrix4;visible:boolean}
export type CarrierAircraftPoses=ReadonlyMap<string,CarrierAircraftPose>|((id:string)=>CarrierAircraftPose|undefined|null);
export type CarrierAircraftPhase='parked'|'queued'|'taxiOut'|'lineup'|'catapult'|'climb'|'outbound'|'orbit'|'return'|'approach'|'landing'|'taxiIn';
// Ford source deck UV track: CPU-rasterized 600 px/unit samples at z -.76/-1.86
// give x -.0118/-.0452. Follow its actual slight diagonal rather than a parallel lane.
const CATAPULT_START_X=-.0118,CATAPULT_END_X=-.0452,CATAPULT_START_Z=-.76,CATAPULT_END_Z=-1.86;
const catapultDirection=new THREE.Vector3(CATAPULT_END_X-CATAPULT_START_X,0,CATAPULT_END_Z-CATAPULT_START_Z).normalize();
const DECK_Y=.19625,LENGTH=18.9/304.5*3.6;
// Fourth aircraft extends the existing source-authored port parking row forward.
export const CARRIER_AIRCRAFT_PARKING=[[-.32,.75],[-.32,1.08],[-.32,.42],[-.32,.09]] as const;
const rank=[2,3,1,0],forward=new THREE.Vector3(0,0,-1),up=new THREE.Vector3(0,1,0);
const ease=(t:number)=>t*t*(3-2*t),clamp=(t:number)=>THREE.MathUtils.clamp(t,0,1);
const isDeck=(phase:CarrierAircraftPhase)=>['parked','queued','taxiOut','lineup','catapult','landing','taxiIn'].includes(phase);
type Actor={slot:number;phase:CarrierAircraftPhase;started:number;duration:number;position:THREE.Vector3;quaternion:THREE.Quaternion;start:THREE.Vector3;startQuaternion:THREE.Quaternion;curve:THREE.CurvePath<THREE.Vector3>|THREE.CubicBezierCurve3|null;launches:number;recoveries:number;progress:number};
type Squadron={presentationUntil?:number;presentationKey?:string;id:string;ship:ShipView;actors:Actor[];active:boolean;center:THREE.Vector3;targetKey:string};
const worldCell=(c:Cell)=>new THREE.Vector3((c.x+.5)*4-60,0,(c.z+.5)*4-60);
const disabledDeck=(ship:ShipView)=>!!ship.parts?.flightDeck&&(ship.parts.flightDeck.disabled||ship.parts.flightDeck.hp<=0);
const curve=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3)=>new THREE.CubicBezierCurve3(a.clone(),b.clone(),c.clone(),d.clone());

/** Four persistent deck/aircraft actors per visible carrier, bounded to two draws.
 * Caller owns material and opts into buildFleetAssets({carrierAircraft:'animated'}).
 * Only filtered own/revealed ships and their actual rendered matrices are accepted. */
export function createCarrierAircraft(scene:THREE.Scene,material:THREE.Material,options:{maxCarriers?:number}={}){
 const maxCarriers=Math.max(1,Math.min(8,options.maxCarriers??4)),capacity=maxCarriers*4;
 const parkedHigh=buildSuperHornet({parked:true,length:LENGTH}),parkedLow=buildSuperHornet({parked:true,low:true,length:LENGTH}),flightHigh=buildSuperHornet({length:LENGTH}),flightLow=buildSuperHornet({low:true,length:LENGTH});
 const gearLift=-parkedHigh.boundingBox!.min.y,deckHeight=DECK_Y+gearLift;
 const deckMesh=new THREE.InstancedMesh(parkedLow,material,capacity),airMesh=new THREE.InstancedMesh(flightLow,material,capacity);
 for(const mesh of [deckMesh,airMesh]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
 deckMesh.name='carrier-deck-aircraft';airMesh.name='carrier-airborne-squadron';deckMesh.castShadow=true;
 const squadrons=new Map<string,Squadron>(),dummy=new THREE.Object3D(),carrierPosition=new THREE.Vector3(),carrierQuaternion=new THREE.Quaternion(),carrierScale=new THREE.Vector3();
 const local=new THREE.Vector3(),tangent=new THREE.Vector3(),worldTarget=new THREE.Vector3(),worldTangent=new THREE.Vector3(),startTangent=new THREE.Vector3(),orientation=new THREE.Quaternion(),euler=new THREE.Euler(0,0,0,'YXZ');
 let clock=0,disposed=false,snapshot:SceneState|undefined,deckNear=false,airNear=false,transitions=0;
 const point=(x:number,z:number,y=deckHeight)=>new THREE.Vector3(x,y,z);
 const poseFor=(poses:CarrierAircraftPoses,id:string)=>typeof poses==='function'?poses(id):poses.get(id);
 function begin(a:Actor,phase:CarrierAircraftPhase,at:number,duration=0){a.phase=phase;a.started=at;a.duration=duration;a.progress=0;transitions++;}
 function taxiOut(a:Actor,at:number){
  const [x,z]=CARRIER_AIRCRAFT_PARKING[a.slot];a.curve=curve(point(x,z),point(x,z-.30),point(CATAPULT_START_X-catapultDirection.x*.38,-.38),point(CATAPULT_START_X,CATAPULT_START_Z));
  begin(a,'taxiOut',at,Math.max(8,a.curve.getLength()/.075));
 }
 function taxiIn(a:Actor,at:number){
  const [x,z]=CARRIER_AIRCRAFT_PARKING[a.slot],path=new THREE.CurvePath<THREE.Vector3>();
  // Two rolling U-turns use the clear central deck lane. Every join has the
  // same tangent; the nose follows the actual wheel path, never a sideways lerp.
  path.add(curve(point(.12,.70),point(.12,.45),point(.12,.05),point(.12,-.15)));
  path.add(curve(point(.12,-.15),point(.12,-.31),point(-.12,-.31),point(-.12,-.15)));
  const gate=z-.10,run=gate+.15;path.add(curve(point(-.12,-.15),point(-.12,-.15+run/3),point(-.12,-.15+run*2/3),point(-.12,gate)));
  // Enter from the clear side of the row; do not taxi through a neighbouring
  // parked jet when recon expired before the whole squadron could launch.
  path.add(curve(point(-.12,gate),point(-.12,z+.06),point(x,z+.12),point(x,z)));
  a.curve=path;begin(a,'taxiIn',at,Math.max(12,path.getLength()/.065));
 }
 function abortTaxi(a:Actor,pose:CarrierAircraftPose,at:number){
  // A cancelled mission turns through the empty central lane, then enters its
  // own parking slot from starboard without passing through queued aircraft.
  const inverse=pose.matrixWorld.clone().invert(),start=a.position.clone().applyMatrix4(inverse),direction=forward.clone().applyQuaternion(a.quaternion).transformDirection(inverse);
  start.y=deckHeight;direction.y=0;direction.normalize();
  const [x,z]=CARRIER_AIRCRAFT_PARKING[a.slot],front=Math.min(start.z-.30,z-.40),path=new THREE.CurvePath<THREE.Vector3>();
  path.add(curve(start,start.clone().addScaledVector(direction,.20),point(.12,front-.15),point(.12,front)));
  path.add(curve(point(.12,front),point(.12,front+.18),point(.12,z-.22),point(.12,z-.10)));
  path.add(curve(point(.12,z-.10),point(.12,z+.10),point(x,z+.20),point(x,z)));
  a.curve=path;begin(a,'taxiIn',at,Math.max(8,path.getLength()/.065));
 }
 function orbit(s:Squadron,a:Actor,time:number,target:THREE.Vector3,velocity:THREE.Vector3){
  const angle=time*.28-a.slot*.12,radius=2.4+(a.slot%2)*.28;
  target.set(s.center.x+Math.cos(angle)*radius,1.65+Math.floor(a.slot/2)*.10,s.center.z+Math.sin(angle)*radius);
  velocity.set(-Math.sin(angle),0,Math.cos(angle));
 }
 function outbound(s:Squadron,a:Actor,at:number){
  a.start.copy(a.position);a.startQuaternion.copy(a.quaternion);
  const duration=Math.max(4,Math.min(18,a.position.distanceTo(s.center)/2.8));orbit(s,a,at+duration,worldTarget,worldTangent);
  const reach=Math.max(.7,a.position.distanceTo(worldTarget)*.3);startTangent.copy(forward).applyQuaternion(a.quaternion).multiplyScalar(reach);
  a.curve=curve(a.position,a.position.clone().add(startTangent),worldTarget.clone().addScaledVector(worldTangent,-reach),worldTarget);
  begin(a,'outbound',at,duration);
 }
 function returning(s:Squadron,a:Actor,pose:CarrierAircraftPose,at:number){
  a.start.copy(a.position);a.startQuaternion.copy(a.quaternion);worldTarget.set(.12,deckHeight+1.8,8).applyMatrix4(pose.matrixWorld);
  const deckClear=Math.max(at,...s.actors.filter(other=>['taxiOut','lineup','taxiIn'].includes(other.phase)).map(other=>other.started+other.duration));
  begin(a,'return',at,Math.max(Math.max(5,Math.min(19,a.position.distanceTo(worldTarget)/2.5)),deckClear-at+2)+rank[a.slot]*12);
  a.recoveries++;
 }
 function ground(a:Actor,pose:CarrierAircraftPose,p:THREE.Vector3,direction:THREE.Vector3){
  a.position.copy(p).applyMatrix4(pose.matrixWorld);const yaw=Math.atan2(-direction.x,-direction.z);
  pose.matrixWorld.decompose(carrierPosition,carrierQuaternion,carrierScale);a.quaternion.setFromAxisAngle(up,yaw).premultiply(carrierQuaternion);
 }
 function flying(a:Actor,direction:THREE.Vector3,bank:number,blend=1){
  const yaw=Math.atan2(-direction.x,-direction.z),pitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
  orientation.setFromEuler(euler.set(pitch,yaw,bank));a.quaternion.copy(a.startQuaternion).slerp(orientation,blend);
 }
 function sample(s:Squadron,a:Actor,pose:CarrierAircraftPose,time:number){
  const t=a.duration?clamp((time-a.started)/a.duration):0;a.progress=t;
  if(a.phase==='parked'||a.phase==='queued'){const [x,z]=CARRIER_AIRCRAFT_PARKING[a.slot];ground(a,pose,local.set(x,deckHeight,z),forward);}
  else if(a.phase==='taxiOut'||a.phase==='taxiIn'){
   const u=ease(t);a.curve!.getPointAt(u,local);a.curve!.getTangentAt(u,tangent);ground(a,pose,local,tangent);
  }else if(a.phase==='lineup')ground(a,pose,local.set(CATAPULT_START_X,deckHeight,CATAPULT_START_Z),catapultDirection);
  else if(a.phase==='catapult')ground(a,pose,local.set(THREE.MathUtils.lerp(CATAPULT_START_X,CATAPULT_END_X,t*t),deckHeight,THREE.MathUtils.lerp(CATAPULT_START_Z,CATAPULT_END_Z,t*t)),catapultDirection);
  else if(a.phase==='climb'){
   local.set(CATAPULT_END_X+catapultDirection.x*3.1*t,deckHeight+1.35*t*t,CATAPULT_END_Z+catapultDirection.z*3.1*t);tangent.set(catapultDirection.x*3.1,2.7*t,catapultDirection.z*3.1);
   a.position.copy(local).applyMatrix4(pose.matrixWorld);tangent.transformDirection(pose.matrixWorld);flying(a,tangent,0,ease(t));
  }else if(a.phase==='outbound'){
   a.curve!.getPoint(t,a.position);a.curve!.getTangent(t,tangent);flying(a,tangent,-.10*Math.sin(Math.PI*t),ease(Math.min(1,t*3)));
  }else if(a.phase==='orbit'){
   orbit(s,a,time,a.position,tangent);flying(a,tangent,-.14*ease(clamp((time-a.started)/1.6)));
  }else if(a.phase==='return'){
   // Moving-carrier destination is re-evaluated from its rendered pose each frame.
   worldTarget.set(.12,deckHeight+1.8,8).applyMatrix4(pose.matrixWorld);worldTangent.copy(forward).transformDirection(pose.matrixWorld);
   const reach=Math.max(.7,a.start.distanceTo(worldTarget)*.30);startTangent.copy(forward).applyQuaternion(a.startQuaternion);
   const p0=a.start,p1=local.copy(p0).addScaledVector(startTangent,reach),p2=tangent.copy(worldTarget).addScaledVector(worldTangent,-reach),p3=worldTarget,u=1-t;
   a.position.copy(p0).multiplyScalar(u*u*u).addScaledVector(p1,3*u*u*t).addScaledVector(p2,3*u*t*t).addScaledVector(p3,t*t*t);
   // Derivative of the same curve sets heading; no independent lateral sliding.
   startTangent.copy(p1).sub(p0).multiplyScalar(3*u*u).addScaledVector(worldTangent.copy(p2).sub(p1),6*u*t).addScaledVector(worldTangent.copy(p3).sub(p2),3*t*t);
   flying(a,startTangent,-.08*Math.sin(Math.PI*t),ease(Math.min(1,t*3)));
  }else if(a.phase==='approach'){
   const u=ease(t);local.set(.12,deckHeight+THREE.MathUtils.lerp(1.8,.035,u),THREE.MathUtils.lerp(8,1.65,t));
   tangent.set(0,-1.765*6*t*(1-t),-6.35);a.position.copy(local).applyMatrix4(pose.matrixWorld);tangent.transformDirection(pose.matrixWorld);flying(a,tangent,0,ease(Math.min(1,t*3)));
  }else if(a.phase==='landing'){
   const arrest=1-Math.pow(1-t,3);ground(a,pose,local.set(.12,deckHeight+.035*Math.pow(1-clamp(t*5),2),THREE.MathUtils.lerp(1.65,.70,arrest)),forward);
  }
 }
 function advance(s:Squadron,a:Actor,pose:CarrierAircraftPose){
  // Consume every elapsed stage boundary; frame subdivision cannot skip launch
  // or replay deck legs. Sampling at the boundary provides continuous endpoints.
  for(let guard=0;guard<12&&a.duration>0&&clock>=a.started+a.duration;guard++){
   const at=a.started+a.duration;sample(s,a,pose,at);
   switch(a.phase){
    case 'queued':taxiOut(a,at);break;
    case 'taxiOut':begin(a,'lineup',at,2);break;
    case 'lineup':begin(a,'catapult',at,1.8);a.launches++;break;
    case 'catapult':a.startQuaternion.copy(a.quaternion);begin(a,'climb',at,3.5);break;
    case 'climb':if(s.active)outbound(s,a,at);else returning(s,a,pose,at);break;
    case 'outbound':begin(a,'orbit',at);break;
    case 'return':a.startQuaternion.copy(a.quaternion);begin(a,'approach',at,6.5);break;
    case 'approach':begin(a,'landing',at,2.8);break;
    case 'landing':taxiIn(a,at);break;
    case 'taxiIn':begin(a,s.active?'queued':'parked',at,s.active?1:0);break;
    default:break;
   }
  }
  sample(s,a,pose,clock);
 }
 function ensureSquadron(ship:ShipView,pose:CarrierAircraftPose,time:number){let s=squadrons.get(ship.id);if(!s){s={id:ship.id,ship,actors:Array.from({length:4},(_,slot)=>({slot,phase:'parked',started:time,duration:0,position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),start:new THREE.Vector3(),startQuaternion:new THREE.Quaternion(),curve:null,launches:0,recoveries:0,progress:0})),active:false,center:new THREE.Vector3(),targetKey:''};squadrons.set(ship.id,s);for(const a of s.actors)sample(s,a,pose,time);}return s;}
 /** Current-shot presentation only. A previously unseen enemy sortie may already
  * be airborne. Never call for own carriers or feed future recon destinations. */
 function prepareEnemyStrike(ship:ShipView,targetWorld:THREE.Vector3,pose:CarrierAircraftPose,time:number){
  if(disposed||!snapshot||ship.team===snapshot.you||ship.kind!=='carrier'||ship.sunk||ship.hp<=0||disabledDeck(ship)||!pose.visible||!Number.isFinite(time)||!targetWorld.toArray().every(Number.isFinite)||(!squadrons.has(ship.id)&&squadrons.size>=maxCarriers))return false;
  const s=ensureSquadron(ship,pose,time),key=targetWorld.toArray().join(',');if(s.presentationKey===key&&(s.presentationUntil??0)>time)return true;
  s.ship=ship;s.center.copy(targetWorld).setY(0);s.active=true;s.presentationKey=key;s.presentationUntil=time+12;s.targetKey=`strike:${key}`;
  let a=s.actors.find(a=>a.phase==='outbound'||a.phase==='orbit');
  if(!a){a=s.actors.find(a=>a.slot===3)!;const carrier=new THREE.Vector3().setFromMatrixPosition(pose.matrixWorld),bearing=targetWorld.clone().sub(carrier).setY(0);if(bearing.lengthSq()<.000001)bearing.copy(forward).transformDirection(pose.matrixWorld);bearing.normalize();a.position.copy(targetWorld).addScaledVector(bearing,-Math.min(6,Math.max(2,carrier.distanceTo(targetWorld)*.22))).setY(Math.max(1.65,targetWorld.y+.7));a.quaternion.setFromUnitVectors(forward,bearing);a.startQuaternion.copy(a.quaternion);a.launches=Math.max(1,a.launches);}
  // An existing visible airborne actor continues from its sampled position.
  // Three untouched parked actors remain at the actual carrier deck pose.
  outbound(s,a,time);return true;
 }
 function airstrikeReady(carrierId:string){return airstrikePosition(carrierId)!==undefined;}
 function sync(state:SceneState){snapshot=state;}
 function update(state:SceneState,poses:CarrierAircraftPoses,camera:THREE.Camera,dt:number,time:number){
  if(disposed)return;sync(state);clock=Number.isFinite(time)?Math.max(clock,time):clock+Math.max(0,dt);
  const eligible=new Map<string,{ship:ShipView;pose:CarrierAircraftPose}>();
  for(const ship of [...state.own,...state.revealed]){if(ship.kind!=='carrier'||ship.sunk||ship.hp<=0||disabledDeck(ship)||eligible.size>=maxCarriers)continue;const pose=poseFor(poses,ship.id);if(pose?.visible)eligible.set(ship.id,{ship,pose});}
  for(const id of squadrons.keys())if(!eligible.has(id))squadrons.delete(id);
  let deckCount=0,airCount=0,closestDeck=Infinity,closestAir=Infinity;
  for(const [id,{ship,pose}]of eligible){
   const s=ensureSquadron(ship,pose,clock);
   s.ship=ship;if(!((s.presentationUntil??0)>clock)){s.presentationUntil=undefined;s.presentationKey=undefined;const recon=state.recon.find(r=>r.carrierId===id&&r.team===ship.team),targetKey=recon?`${recon.center.x},${recon.center.z}`:'';
   if(recon){const changed=s.targetKey!==targetKey;if(!s.active||changed)for(const a of s.actors)sample(s,a,pose,clock);s.center.copy(worldCell(recon.center));if(!s.active||changed)for(const a of s.actors){
    if(a.phase==='parked')begin(a,'queued',clock,.15+rank[a.slot]*12);
    else if(['outbound','orbit','return','approach'].includes(a.phase))outbound(s,a,clock);
   }}else if(s.active){
    for(const a of s.actors)sample(s,a,pose,clock);
    // Clear cancelled deck traffic before scheduling a returning flight onto
    // the same landing/taxi lane. Ground actors never pass through one another.
    for(const a of s.actors){if(a.phase==='queued')begin(a,'parked',clock);else if(a.phase==='taxiOut'||a.phase==='lineup')abortTaxi(a,pose,clock);}
    for(const a of s.actors)if(['outbound','orbit','return','approach'].includes(a.phase))returning(s,a,pose,clock);
   }
   s.active=!!recon;s.targetKey=targetKey;}
   for(const a of s.actors){advance(s,a,pose);dummy.position.copy(a.position);dummy.quaternion.copy(a.quaternion);dummy.scale.setScalar(1);dummy.updateMatrix();
    const deck=isDeck(a.phase)||a.phase==='approach';if(deck){deckMesh.setMatrixAt(deckCount++,dummy.matrix);closestDeck=Math.min(closestDeck,camera.position.distanceTo(a.position));}else{airMesh.setMatrixAt(airCount++,dummy.matrix);closestAir=Math.min(closestAir,camera.position.distanceTo(a.position));}
   }
  }
  // Hysteresis prevents the complete squadron from flickering at the LOD radius.
  deckNear=closestDeck<(deckNear?11:9);airNear=closestAir<(airNear?11:9);
  deckMesh.geometry=deckNear?parkedHigh:parkedLow;airMesh.geometry=airNear?flightHigh:flightLow;
  deckMesh.count=deckCount;airMesh.count=airCount;deckMesh.visible=deckCount>0;airMesh.visible=airCount>0;
  if(deckCount)deckMesh.instanceMatrix.needsUpdate=true;if(airCount)airMesh.instanceMatrix.needsUpdate=true;
 }
 function airstrikePosition(carrierId:string){const s=squadrons.get(carrierId),actor=s?.actors.find(a=>a.phase==='orbit'||a.phase==='outbound');return actor?.position.clone();}
 function reset(){squadrons.clear();snapshot=undefined;clock=0;transitions=0;deckMesh.count=airMesh.count=0;deckMesh.visible=airMesh.visible=false;deckNear=airNear=false;}
 function diagnostics(){return{carriers:squadrons.size,capacity,aircraft:deckMesh.count+airMesh.count,deckAircraft:deckMesh.count,airborneAircraft:airMesh.count,reconFighters:[...squadrons.values()].reduce((sum,s)=>sum+s.actors.filter(a=>!['parked','queued','taxiOut','lineup','taxiIn'].includes(a.phase)).length,0),deckY:DECK_Y,gearLift,drawCalls:Number(deckMesh.count>0)+Number(airMesh.count>0),triangles:deckMesh.count*deckMesh.geometry.getAttribute('position').count/3+airMesh.count*airMesh.geometry.getAttribute('position').count/3,deckLow:!deckNear,airLow:!airNear,transitions,model:'F22 Raptor',length:LENGTH,filteredRecon:snapshot?.recon.length??0,squadrons:[...squadrons.values()].map(s=>({carrierId:s.id,active:s.active,enemyStrikePresentation:(s.presentationUntil??0)>clock,airstrikeReady:airstrikeReady(s.id),center:s.center.toArray(),actors:s.actors.map(a=>({slot:a.slot,phase:a.phase,phaseElapsed:clock-a.started,phaseDuration:a.duration,progress:a.progress,position:a.position.toArray(),quaternion:a.quaternion.toArray(),launches:a.launches,recoveries:a.recoveries,groundBank:isDeck(a.phase)?0:null}))}))};}
 function dispose(){if(disposed)return;disposed=true;reset();scene.remove(deckMesh,airMesh);deckMesh.dispose();airMesh.dispose();for(const g of [parkedHigh,parkedLow,flightHigh,flightLow])g.dispose();}
 return{sync,update,reset,clear:reset,diagnostics,dispose,deckMesh,airMesh,airstrikePosition,airstrikeReady,prepareEnemyStrike};
}
