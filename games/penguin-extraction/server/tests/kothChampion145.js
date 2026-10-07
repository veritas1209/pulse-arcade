// Frozen 145 tactics for head-to-head self-play evaluation.
// Training-only encounter director. Uses authored spawns, real weapons, LOS and bounded Raid navigation.
import {movementBlocked} from '../../shared/movement.ts';
import {enemyLineOfSight} from '../enemyPerception.js';

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
  if(perceived.observed&&perceived.point)reportContact(raid,perceived.point,null,now,'sound');
  const contact=raid.trainingSquadContact;
  if(contact&&now-contact.at<10000&&contact.at>(enemy.trainingLastSawAt??-Infinity)&&!perceived.observed)
    return {...perceived,point:contact.point};
  if(raid.trainingAiLevel===4&&contact&&now-contact.at>=12000&&!perceived.observed)return {...perceived,point:null};
  return perceived;
}
export function trainingKothStagingGoal(world,origin,stageFraction=.62){
  return safePoint(world,{x:origin.x*stageFraction,z:origin.z*stageFraction});
}
export function trainingTravelSpeed(raid,enemy){
  return raid.options.training&&raid.trainingAiLevel===4&&enemy.trainingRole?9:null;
}
export function trainingSweepGoal(raid,enemy,now){
  if(raid.trainingAiLevel!==4||!enemy.trainingRole)return null;
  const spawn=raid.world.spawn??{x:0,z:raid.world.size/2-4};
  const forward=direction(spawn.x,spawn.z||1),right={x:forward.z,z:-forward.x};
  const slot=SWEEP_SLOTS[enemy.trainingRole],phase=enemy.trainingSweepPhase??0;
  const side=phase%2===0?slot.side:-slot.side;
  const depth=phase%3===2?slot.depth+16:slot.depth;
  const point=safePoint(raid.world,{x:spawn.x-forward.x*depth+right.x*side,z:spawn.z-forward.z*depth+right.z*side});
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
function pressurePoint(raid,enemy,contact,now){
  const role=enemy.trainingRole,slot=PRESSURE_SLOTS[role];
  if(!slot)return contact.point;
  const support=[...raid.enemies.values()].find(member=>member.trainingRole==='machinegun');
  const pressure=now-(support?.trainingLastSupportShotAt??-Infinity)<1800;
  const phase=enemy.trainingPositionPhase??0,forward=contact.approach??direction(contact.point.x-enemy.x,contact.point.z-enemy.z),right={x:forward.z,z:-forward.x};
  const depth=role==='breach'?(pressure?6:16):role==='rifle'?(pressure?8:14):slot.depth;
  const sideRaw=['sniper','dmr','machinegun'].includes(role)?slot.side+(phase%3-1)*4:slot.side*(phase%2===0?1:-1);
  const side=sideRaw*(raid.trainingMultiTeam?.45:1);
  const nominal={x:contact.point.x-forward.x*depth+right.x*side,z:contact.point.z-forward.z*depth+right.z*side};
  const cached=enemy.trainingAssignedGoal;
  if(cached&&now<cached.expiresAt&&distance(cached.anchor,contact.point)<4&&cached.phase===phase&&cached.pressure===pressure)return cached.point;
  let best=null,score=Infinity;
  const variants=[[0,0],[4,0],[-4,0],[0,4],[0,-4],[8,0],[-8,0],[8,8],[8,-8],[12,0],[12,8],[12,-8]];
  for(const [along,across] of variants){
    const candidate=safePoint(raid.world,{x:nominal.x+forward.x*along+right.x*across,z:nominal.z+forward.z*along+right.z*across});
    if(!candidate)continue;
    const sight=enemyLineOfSight(raid.world,raid.areas,candidate,contact.point,now);
    const value=(sight?0:role==='breach'||role==='rifle'?5:25)+distance(enemy,candidate)*.055+Math.abs(along)*.12+Math.abs(across)*.09;
    if(value<score){best=candidate;score=value;}
  }
  best??=safePoint(raid.world,contact.point)??contact.point;
  enemy.trainingAssignedGoal={point:best,anchor:{...contact.point},phase,pressure,expiresAt:now+1500};
  return best;
}
export function trainingSearchGoal(raid,enemy,point,now){
  if(raid.trainingAiLevel!==4||!enemy.trainingRole)return point;
  const contact=raid.trainingSquadContact;
  if(!contact||now-contact.at>=12000)return point;
  return pressurePoint(raid,enemy,contact,now);
}
export function trainingTacticalGoal(raid,enemy,target,now,defaultGoal){
  if(!raid.options.training||raid.trainingAiLevel<4||!enemy.trainingRole)return defaultGoal;
  if(['sniper','dmr'].includes(enemy.trainingRole)){
    const shots=enemy.shotsFired??0;
    if(shots-(enemy.trainingLastRepositionShotCount??0)>=2||now-(enemy.lastHitAt??-Infinity)<2500){
      enemy.trainingPositionPhase=(enemy.trainingPositionPhase??0)+1;
      enemy.trainingLastRepositionShotCount=shots;
      enemy.trainingAssignedGoal=null;
    }
  }else{
    enemy.trainingNextPositionAt??=now+3500;
    if(now>=enemy.trainingNextPositionAt){
      enemy.trainingPositionPhase=(enemy.trainingPositionPhase??0)+1;
      enemy.trainingNextPositionAt=now+3500;
      enemy.trainingAssignedGoal=null;
    }
  }
  if(raid.trainingMultiTeam&&enemy.hp<65){
    const away=direction(enemy.x-target.x,enemy.z-target.z);
    const fallback=safePoint(raid.world,{x:enemy.x+away.x*12,z:enemy.z+away.z*12});
    if(fallback&&distance(enemy,fallback)>2)return {point:fallback,move:true};
  }
  const contact=raid.trainingSquadContact??{point:{x:target.x,z:target.z},approach:direction(target.x-enemy.x,target.z-enemy.z)};
  let goal=pressurePoint(raid,enemy,{...contact,point:{x:target.x,z:target.z}},now);
  if(raid.trainingMultiTeam){
    const allies=[...raid.enemies.values()].filter(member=>member.hp>0&&!member.trainingImmortal);
    if(allies.length){
      const center=allies.reduce((sum,member)=>({x:sum.x+member.x/allies.length,z:sum.z+member.z/allies.length}),{x:0,z:0});
      const delta=distance(center,goal);
      if(delta>12)goal=safePoint(raid.world,{x:center.x+(goal.x-center.x)*12/delta,z:center.z+(goal.z-center.z)*12/delta})??goal;
    }
  }
  const support=['sniper','dmr','machinegun'].includes(enemy.trainingRole);
  if(support&&distance(enemy,goal)<9&&distance(enemy,target)<enemy.rangedRange&&enemyLineOfSight(raid.world,raid.areas,enemy,target,now))return {point:null,move:false};
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
