// Training-only encounter director. Uses authored spawns, real weapons, LOS and bounded Raid navigation.
import {movementBlocked} from '../shared/movement.ts';
import {obstacleLocalPoint,obstacleWorldPoint} from '../shared/rotated-collision.js';
import {enemyLineOfSight} from './enemyPerception.js';
import {enemyInsidePlayerViewport} from './enemyCombat.js';
import {observeTrainingBelief,excludeVisibleTrainingCells,trainingBeliefGoal} from './trainingBelief.js';
import {trainingCommanderOrder} from './trainingCommander.js';

const ROLE_SPAWNS=[
  ['training-left','sniper','sniper','m24','저격수'],
  ['training-far','dmr','sniper','mk12','DMR 엄호'],
  ['training-heavy','rifle','raider','m416','AR 엄호'],
  ['training-front','machinegun','heavy','m249','MG 화망'],
  ['training-right','breach','scout','mp5k','SMG 돌입'],
];
const RESPONSE_SPAWNS=[
  ROLE_SPAWNS[0],ROLE_SPAWNS[1],
  ['training-enemy-2','rifle','raider','m416','AR 측면'],
  ['training-heavy','machinegun','heavy','m249','MG 엄호'],
  ['training-enemy-1','breach','scout','mp5k','SMG 돌입'],
];
const SWEEP_SLOTS={
  sniper:{side:-24,depth:30},dmr:{side:24,depth:30},
  rifle:{side:-8,depth:22},machinegun:{side:2,depth:26},breach:{side:11,depth:20},
};
const PRESSURE_SLOTS={
  sniper:{side:-18,depth:12},dmr:{side:17,depth:12},
  rifle:{side:-8,depth:8},machinegun:{side:1,depth:10},breach:{side:8,depth:6},
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function direction(x,z){const length=Math.max(.001,Math.hypot(x,z));return {x:x/length,z:z/length};}
function safePoint(world,point){
  const half=world.size/2-1;
  for(const [dx,dz] of [[0,0],[3,0],[-3,0],[0,3],[0,-3],[6,0],[-6,0],[0,6],[0,-6]]){
    const candidate={x:Math.max(-half,Math.min(half,point.x+dx)),z:Math.max(-half,Math.min(half,point.z+dz))};
    if(!movementBlocked(world,candidate.x,candidate.z))return candidate;
  }
  return null;
}
function roleSpawns(spawns,tier){
  const normal=spawns.filter(spawn=>!spawn.trainingImmortal),used=new Set();
  return (tier===4?RESPONSE_SPAWNS:ROLE_SPAWNS).map(([id,role,kind,weapon,name])=>{
    const spawn=normal.find(item=>item.id===id&&!used.has(item.id))??normal.find(item=>!used.has(item.id));
    if(!spawn)return null;
    used.add(spawn.id);
    return {...spawn,kind,name,trainingTier:tier,trainingRole:role,trainingWeaponId:weapon};
  }).filter(Boolean);
}
export function trainingSpawns(spawns,type='mixed',tier=1){
  const normal=spawns.filter(spawn=>!spawn.trainingImmortal),dummy=spawns.filter(spawn=>spawn.trainingImmortal);
  if(type==='dps')return dummy;
  let selected=normal;
  if(tier===2){
    const boss=normal.find(spawn=>spawn.id==='training-heavy')??normal[0];
    selected=boss?[{...boss,kind:'commander',name:'추격 보스',trainingTier:2,trainingRole:'boss',trainingWeaponId:'m416'}]:[];
  }else if(tier>=3)selected=roleSpawns(spawns,tier);
  return type==='mixed'?[...selected,...dummy]:selected;
}
function reportContact(raid,point,playerId,now,kind){
  const previous=raid.trainingSquadContact;
  const keepApproach=previous&&now-previous.at<12000&&previous.playerId===playerId;
  const members=[...(raid.enemies?.values()??[])].filter(enemy=>!enemy.trainingImmortal);
  const center=members.reduce((p,enemy)=>({x:p.x+enemy.x/members.length,z:p.z+enemy.z/members.length}),{x:0,z:0});
  const approach=keepApproach?previous.approach:direction(point.x-center.x,point.z-center.z);
  raid.trainingSquadContact={point:{x:point.x,z:point.z},playerId,at:now,kind,approach};
}
// A contact always stores an observed position. Hidden players cannot update it.
export function trainingContact(raid,enemy,perceived,now){
  if(!raid.options.training||raid.trainingAiLevel<2)return perceived;
  if(perceived.target&&perceived.observed){
    const previous=enemy.trainingLastSeenPoint,elapsed=now-(enemy.trainingLastSawAt??now);
    if(previous&&elapsed>=80&&elapsed<=500){
      const vx=(perceived.target.x-previous.x)*1000/elapsed,vz=(perceived.target.z-previous.z)*1000/elapsed;
      const scale=Math.min(1,8/Math.max(.001,Math.hypot(vx,vz)));
      enemy.trainingObservedVelocity={x:vx*scale,z:vz*scale};
      enemy.trainingObservedAt=now;
    }
    enemy.trainingLastSawAt=now;
    enemy.trainingLastSeenPoint={x:perceived.target.x,z:perceived.target.z};
    if(raid.trainingAiLevel>=3)reportContact(raid,enemy.trainingLastSeenPoint,perceived.target.id,now,'sight');
    if(raid.trainingAiLevel===4)noteTrainingSight(raid,perceived.target.id,now);
    if(raid.trainingAiLevel===4){
      raid.trainingObservedThreats??=new Map();
      raid.trainingObservedThreats.set(perceived.target.id,{...enemy.trainingLastSeenPoint,at:now});
    }
    observeTrainingBelief(raid,enemy.trainingLastSeenPoint,now,'sight');
    return perceived;
  }
  if(raid.trainingAiLevel===2){
    const seen=enemy.trainingLastSeenPoint,age=now-(enemy.trainingLastSawAt??-Infinity);
    if(seen&&age<8500&&(!perceived.point||distance(enemy,seen)<1.4)){
      const side=Math.floor(age/2200)%4,offsets=[[0,0],[4,0],[0,4],[-4,0]];
      return {...perceived,point:{x:seen.x+offsets[side][0],z:seen.z+offsets[side][1]}};
    }
    return perceived;
  }
  if(perceived.observed&&perceived.point){reportContact(raid,perceived.point,null,now,'sound');observeTrainingBelief(raid,perceived.point,now,'sound');}
  else excludeVisibleTrainingCells(raid,enemy,now);
  const contact=raid.trainingSquadContact;
  if(contact&&now-contact.at<10000&&contact.at>(enemy.trainingLastSawAt??-Infinity)&&!perceived.observed)
    return {...perceived,point:contact.point};
  if(raid.trainingAiLevel===4&&contact&&now-contact.at>=12000&&!perceived.observed)return {...perceived,point:null};
  return perceived;
}
export function noteTrainingSight(raid,targetId,now){
  if(raid.trainingAiLevel!==4||!targetId)return;
  const call=raid.trainingTargetCall;
  if(!call||now-call.at>=(2200))raid.trainingTargetCall={targetId,at:now};
}
export function noteTrainingDamage(raid,source,targetId,amount,now){
  if(raid.trainingAiLevel!==4||!source?.trainingRole||!targetId||!Number.isFinite(amount)||amount<=0)return;
  const records=raid.trainingConfirmedDamage??=new Map();
  const previous=records.get(targetId),recent=now-(previous?.at??-Infinity)<5000;
  records.set(targetId,{amount:Math.min(150,(recent?previous.amount:0)+amount),at:now});
}
export function trainingPriorityTarget(raid,now){
  if(raid.trainingAiLevel!==4)return null;
  let bestId=null,bestDamage=20;
  for(const [id,record] of raid.trainingConfirmedDamage??[]){
    if(now-record.at>=5000){raid.trainingConfirmedDamage.delete(id);continue;}
    if(record.amount>bestDamage){bestId=id;bestDamage=record.amount;}
  }
  const order=raid.trainingCommander?.order;
  return bestId??(order?.contactId&&now-order.at<2500?order.contactId:null)??
    (now-(raid.trainingTargetCall?.at??-Infinity)<2200?raid.trainingTargetCall.targetId:null);
}
export function trainingCoveredStagingGoal(world,origin,nominal,threat){
 let best=null,score=Infinity;
 for(const obstacle of world.obstacles??[]){
  if(obstacle.bulletPassable||distance(nominal,obstacle)>15)continue;
  const w=obstacle.w??obstacle.width??1,d=obstacle.d??obstacle.depth??1;
  const local=obstacleLocalPoint(obstacle,threat),axis=Math.abs(local.x/w)>Math.abs(local.z/d)?'x':'z',sign=Math.sign(local[axis])||1;
  const hide=obstacleWorldPoint(obstacle,axis==='x'?{x:-sign*(w/2+1.2),z:0}:{x:0,z:-sign*(d/2+1.2)});
  if(movementBlocked(world,hide.x,hide.z)||enemyLineOfSight(world,[],hide,threat,0))continue;
  const value=distance(nominal,hide)+distance(origin,hide)*.15;
  if(value<score){score=value;best=hide;}
 }
 return best??safePoint(world,nominal)??nominal;
}
export function trainingAmbushStagingGoal(world,origin,threat,role,{fraction=.8,formation='split2',spread=2}={}){
  const nominal={x:origin.x+(threat.x-origin.x)*(1-fraction),z:origin.z+(threat.z-origin.z)*(1-fraction)};
  const cover=trainingCoveredStagingGoal(world,origin,nominal,threat);
  const toward=direction(threat.x-origin.x,threat.z-origin.z),right={x:toward.z,z:-toward.x};
  const index=['sniper','dmr','rifle','machinegun','breach'].indexOf(role);
  const offset=formation==='split2'?[-15,-12,0,3,15][index]:formation==='split'?[-12,-9,4,7,18][index]:(index-2)*spread;
  if(index<0||!offset)return cover;
  return safePoint(world,{x:cover.x+right.x*offset,z:cover.z+right.z*offset})??cover;
}
export function trainingKothStagingGoal(world,origin,stageFraction=.62){
  return safePoint(world,{x:origin.x*stageFraction,z:origin.z*stageFraction});
}
export function trainingTravelSpeed(raid,enemy){
  return raid.options.training&&raid.trainingAiLevel===4&&enemy.trainingRole?9:null;
}
export function trainingCombatSpeed(raid,enemy,target,now,goal,canShoot){
 if(!raid.options.training||raid.trainingAiLevel!==4||!enemy.trainingRole)return null;
 const travel=goal?distance(enemy,goal):0;
 const underFire=now-(enemy.lastHitAt??-Infinity)<2000;
 const order=raid.trainingCommander?.order;
 if(raid.trainingCommanderMode!=='observe'&&order?.phase==='maneuver'&&order.moverIds?.includes(enemy.id)&&travel>4)return 9;
 const mg=[...raid.enemies.values()].find(member=>member.trainingRole==='machinegun');
 const supported=now-(mg?.trainingLastSupportShotAt??-Infinity)<1800&&mg?.trainingLastSupportTargetId===target.id;
 if(['breach','rifle'].includes(enemy.trainingRole))return travel>5&&(!canShoot||supported||underFire)?9:5.5;
 return travel>6?9:5.5;
}
export function trainingSweepGoal(raid,enemy,now){
  if(raid.trainingAiLevel!==4||!enemy.trainingRole)return null;
  const spawn=raid.world.spawn??{x:0,z:raid.world.size/2-4};
  const forward=direction(spawn.x,spawn.z||1),right={x:forward.z,z:-forward.x};
  const slot=SWEEP_SLOTS[enemy.trainingRole],phase=enemy.trainingSweepPhase??0;
  const side=phase%2===0?slot.side:-slot.side;
  const depth=phase%3===2?slot.depth+16:slot.depth;
  const nominal={x:spawn.x-forward.x*depth+right.x*side,z:spawn.z-forward.z*depth+right.z*side};
  enemy.trainingSweepOrigin??={x:enemy.x,z:enemy.z};
  const key=`${phase}:${side}:${depth}`;
  if(enemy.trainingCoveredSweep?.key!==key)enemy.trainingCoveredSweep={key,point:trainingCoveredStagingGoal(raid.world,enemy.trainingSweepOrigin,nominal,spawn)};
  const point=enemy.trainingCoveredSweep.point;
  if(!point)return null;
  if(distance(enemy,point)<2.5){
    enemy.trainingSweepPauseUntil??=now+1800;
    if(now>=enemy.trainingSweepPauseUntil){
      enemy.trainingSweepPhase=(phase+1)%4;enemy.trainingSweepPauseUntil=null;
      return trainingSweepGoal(raid,enemy,now);
    }
  }else enemy.trainingSweepPauseUntil=null;
  enemy.alertState='search';
  return point;
}
function pressurePoint(raid,enemy,contact,now,target=null){
  const role=enemy.trainingRole,slot=PRESSURE_SLOTS[role];
  if(!slot)return contact.point;
  const support=[...raid.enemies.values()].find(member=>member.trainingRole==='machinegun');
  const pressure=now-(support?.trainingLastSupportShotAt??-Infinity)<1800&&support?.trainingLastSupportTargetId===contact.playerId;
  const phase=enemy.trainingPositionPhase??0,forward=contact.approach??direction(contact.point.x-enemy.x,contact.point.z-enemy.z),right={x:forward.z,z:-forward.x};
  const shocked=now-(raid.trainingLastShockAt??-Infinity)<2600||now<(raid.trainingChargeUntil??0);
  const depth=role==='breach'?(shocked?14:pressure?6:16):role==='rifle'?(shocked?13:pressure?8:14):slot.depth;
  const sideRaw=slot.side+(phase%3-1)*4;
  const side=sideRaw*(raid.trainingMultiTeam?(raid.trainingSideScale??.45):1);
  const nominal={x:contact.point.x-forward.x*depth+right.x*side,z:contact.point.z-forward.z*depth+right.z*side};
  const cached=enemy.trainingAssignedGoal;
  if(cached&&now<cached.expiresAt&&distance(cached.anchor,contact.point)<4&&cached.phase===phase&&cached.pressure===pressure)return cached.point;
  let best=null,score=Infinity;
  const allies=[...raid.enemies.values()].filter(member=>member.hp>0&&!member.trainingImmortal);
  const center=allies.reduce((sum,member)=>({x:sum.x+member.x/allies.length,z:sum.z+member.z/allies.length}),{x:0,z:0});
  const threats=(raid.trainingThreats??[...(raid.trainingObservedThreats?.entries()??[])].filter(([id,seen])=>id!==contact.playerId&&now-seen.at<3000).map(([,seen])=>seen)).slice(0,2);
  const variants=[[0,0],[4,0],[-4,0],[0,4],[0,-4],[8,0],[-8,0],[8,8],[8,-8],[12,0],[12,8],[12,-8]];
  for(const [along,across] of variants){
    const candidate=safePoint(raid.world,{x:nominal.x+forward.x*along+right.x*across,z:nominal.z+forward.z*along+right.z*across});
    if(!candidate)continue;
    const sight=enemyLineOfSight(raid.world,raid.areas,candidate,contact.point,now);
    const squadmates=allies.filter(member=>member!==enemy);
    const close=squadmates.filter(member=>distance(candidate,member.trainingAssignedGoal?.point??member)<9).length;
    const overlap=squadmates.some(member=>distance(candidate,member.trainingAssignedGoal?.point??member)<4)?18:0;
    const triple=squadmates.some(member=>distance(candidate,member.trainingAssignedGoal?.point??member)<9&&squadmates.some(other=>other!==member&&distance(member.trainingAssignedGoal?.point??member,other.trainingAssignedGoal?.point??other)<9));
    const crowded=raid.trainingMultiTeam?(overlap*.25+(close>=2?7+(close-2)*5:0)+(triple?8:0)):overlap+(close>=2?35+(close-2)*20:0)+(triple?45:0);
    const anchor=squadmates.find(member=>member.trainingRole==='machinegun')??squadmates.find(member=>member.trainingRole==='rifle');
    const isolated=anchor&&role!=='machinegun'&&distance(candidate,anchor)>29?(distance(candidate,anchor)-29)*3:0;
    const radius=raid.trainingMultiTeam?12:25;
    const cohesion=Math.max(0,distance(center,candidate)-radius)*4;
    const outsidePlayerView=target&&!raid.trainingMultiTeam&&!enemyInsidePlayerViewport(candidate,target,16/9,1)?35:0;
    const exposed=threats.reduce((count,threat)=>count+(distance(candidate,threat)<40&&enemyLineOfSight(raid.world,raid.areas,threat,candidate,now)?1:0),0);
    const value=(sight?0:role==='breach'||role==='rifle'?25:40)+distance(enemy,candidate)*.055+Math.abs(along)*.12+Math.abs(across)*.09+crowded+isolated+cohesion+exposed*8+outsidePlayerView;
    if(value<score){best=candidate;score=value;}
  }
  best??=safePoint(raid.world,contact.point)??contact.point;
  enemy.trainingAssignedGoal={point:best,anchor:{...contact.point},phase,pressure,expiresAt:now+1500};
  return best;
}
export function trainingSearchGoal(raid,enemy,point,now){
  if(raid.trainingAiLevel!==4||!enemy.trainingRole)return point;
  const order=trainingCommanderOrder(raid,now);
  const contact=raid.trainingSquadContact;
  if(!contact||now-contact.at>=12000)return point;
  const predicted=trainingBeliefGoal(raid,enemy.trainingRole,now);
  const searchPoint=predicted??order?.contactPoint??contact.point;
  return pressurePoint(raid,enemy,{...contact,point:searchPoint},now);
}
export function trainingTacticalGoal(raid,enemy,target,now,defaultGoal){
  if(!raid.options.training||raid.trainingAiLevel<4||!enemy.trainingRole)return defaultGoal;
  const latestHit=Math.max(...[...raid.enemies.values()].filter(member=>!member.trainingImmortal).map(member=>member.lastHitAt??-Infinity));
  raid.trainingLastShockAt=latestHit;


  if(raid.trainingMultiTeam&&enemy.hp<(raid.trainingRetreatHp??45)){
    const away=direction(enemy.x-target.x,enemy.z-target.z);
    const fallback=safePoint(raid.world,{x:enemy.x+away.x*12,z:enemy.z+away.z*12});
    if(fallback&&distance(enemy,fallback)>2)return {point:fallback,move:true};
  }
  const motion=enemy.trainingObservedVelocity,approach=motion?(motion.x*(enemy.x-target.x)+motion.z*(enemy.z-target.z))/Math.max(.01,distance(enemy,target)):0;
  if(now-(enemy.trainingObservedAt??-Infinity)<500&&distance(enemy,target)<20&&approach>3.5)raid.trainingChargeUntil=Math.max(raid.trainingChargeUntil??0,now+1800);
  const contact=raid.trainingSquadContact??{point:{x:target.x,z:target.z},approach:direction(target.x-enemy.x,target.z-enemy.z)};
  const order=trainingCommanderOrder(raid,now);
  let goal=pressurePoint(raid,enemy,{...contact,point:{x:target.x,z:target.z}},now,target);
  const role=enemy.trainingRole,targetDistance=distance(enemy,target);
  if(order?.phase==='reposition'&&now-(enemy.lastHitAt??-Infinity)<1800){
    const away=direction(enemy.x-target.x,enemy.z-target.z);
    const side={x:-away.z*order.flankSign,z:away.x*order.flankSign};
    const escape=safePoint(raid.world,{x:enemy.x+away.x*6+side.x*6,z:enemy.z+away.z*6+side.z*6});
    if(escape&&distance(enemy,escape)>2)return {point:escape,move:true};
  }
  const maneuver=raid.trainingCommanderMode!=='observe'&&order?.phase==='maneuver'&&order.contactId===target.id&&order.flankPoint&&order.moverIds?.includes(enemy.id);
  if(maneuver){
    const fromContact=direction(order.flankPoint.x-order.contactPoint.x,order.flankPoint.z-order.contactPoint.z);
    const offset=role==='rifle'?-5:0;
    goal=safePoint(raid.world,{x:order.flankPoint.x+fromContact.x*offset,z:order.flankPoint.z+fromContact.z*offset})??goal;
  }
  const clearShot=targetDistance<enemy.rangedRange&&enemyLineOfSight(raid.world,raid.areas,enemy,target,now)&&(raid.trainingMultiTeam||enemyInsidePlayerViewport(enemy,target,16/9,1));
  if(clearShot){
    if(maneuver&&distance(enemy,goal)>3)return {point:goal,move:true};
    if(role==='sniper'&&targetDistance>=12)return {point:null,move:false};
    if(role==='dmr'&&targetDistance>=9)return {point:null,move:false};
    if(role==='machinegun'&&targetDistance>=8&&targetDistance<=28)return {point:null,move:false};
    if(role==='rifle'&&targetDistance>=12&&targetDistance<=30)return {point:null,move:false};
    if(role==='breach'&&targetDistance<=14)return {point:null,move:false};
  }
  return distance(enemy,goal)>2.4?{point:goal,move:true}:{point:null,move:false};
}
export function trainingSuppressionPoint(raid,enemy,point,now){
  if(raid.trainingAiLevel!==4)return enemyLineOfSight(raid.world,raid.areas,enemy,point,now)?point:null;
  const offsets=[[0,0],[2,0],[-2,0],[0,2],[0,-2],[4,0],[-4,0]];
  for(const [dx,dz] of offsets){
    const candidate={x:point.x+dx,z:point.z+dz};
    if(distance(enemy,candidate)<enemy.rangedRange&&enemyLineOfSight(raid.world,raid.areas,enemy,candidate,now))return candidate;
  }
  return null;
}
