// Bounded, observation-only squad command. One shared decision is cached for 600 ms.
import {movementBlocked} from '../shared/movement.ts';
import {enemyLineOfSight} from './enemyPerception.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const unit=(x,z)=>{const d=Math.max(.001,Math.hypot(x,z));return {x:x/d,z:z/d};};
const role=member=>member.trainingRole;
function walkable(world,point){
 const half=world.size/2-1;
 for(const [dx,dz] of [[0,0],[2,0],[-2,0],[0,2],[0,-2],[4,0],[-4,0]]){
  const candidate={x:Math.max(-half,Math.min(half,point.x+dx)),z:Math.max(-half,Math.min(half,point.z+dz))};
  if(!movementBlocked(world,candidate.x,candidate.z))return candidate;
 }
 return null;
}
function knownThreats(raid,now,contactId){
 const sightings=raid.trainingThreats??[...(raid.trainingObservedThreats?.entries()??[])].map(([id,point])=>({...point,id}));
 return sightings.filter(point=>point.id!==contactId&&now-point.at<3000).slice(0,2);
}
function chooseFlank(raid,members,contact,now,oldSign){
 const approach=contact.approach??unit(contact.point.x-members[0].x,contact.point.z-members[0].z);
 const right={x:approach.z,z:-approach.x};
 const movers=members.filter(member=>role(member)==='rifle'||role(member)==='breach');
 const threats=knownThreats(raid,now,contact.playerId);
 let best=null;
 for(const sign of [-1,1]){
  const nominal={x:contact.point.x-approach.x*10+right.x*sign*15,z:contact.point.z-approach.z*10+right.z*sign*15};
  const point=walkable(raid.world,nominal);
  if(!point)continue;
  const travel=movers.reduce((sum,member)=>sum+distance(member,point),0)/Math.max(1,movers.length);
  const exposed=threats.reduce((sum,threat)=>sum+(enemyLineOfSight(raid.world,raid.areas,threat,point,now)?1:0),0);
  const hasShot=enemyLineOfSight(raid.world,raid.areas,point,contact.point,now);
  const score=travel*.15+exposed*7+(hasShot?0:5)+(sign===oldSign?-2:0);
  if(!best||score<best.score)best={sign,point,score};
 }
 return best??{sign:oldSign??1,point:walkable(raid.world,contact.point)??contact.point};
}
function selectContact(raid,members,now,prior){
 const fallback=raid.trainingSquadContact;
 const sightings=[...(raid.trainingObservedThreats?.entries()??[])].filter(([,seen])=>now-seen.at<3500).slice(0,4);
 if(!sightings.length)return fallback;
 const center=members.reduce((sum,member)=>({x:sum.x+member.x/members.length,z:sum.z+member.z/members.length}),{x:0,z:0});
 let best=null;
 for(const [id,seen] of sightings){
  const visible=members.filter(member=>distance(member,seen)<=member.rangedRange&&
    enemyLineOfSight(raid.world,raid.areas,member,seen,now)).length;
  const confirmed=raid.trainingConfirmedDamage?.get(id);
  const damage=confirmed&&now-confirmed.at<5000?confirmed.amount:0;
  const score=visible*5+damage*.12-distance(center,seen)*.12-(now-seen.at)/600+
    (prior?.contactId===id?3:0);
  if(!best||score>best.score)best={id,seen,score};
 }
 if(!best)return fallback;
 const approach=fallback?.playerId===best.id&&fallback.approach
   ?fallback.approach:unit(best.seen.x-center.x,best.seen.z-center.z);
 return {point:{x:best.seen.x,z:best.seen.z},playerId:best.id,at:best.seen.at,kind:'sight',approach};
}
export function trainingCommanderOrder(raid,now){
 if(!raid.options?.training||raid.trainingAiLevel!==4||raid.trainingCommanderMode==='off')return null;
 const state=raid.trainingCommander??= {nextAt:-Infinity,order:null};
 if(now<state.nextAt)return state.order;
 state.nextAt=now+600;
 const members=[...(raid.enemies?.values()??[])].filter(member=>member.hp>0&&role(member)&&!member.trainingImmortal);
 const contact=selectContact(raid,members,now,state.order);
 if(!members.length||!contact||now-contact.at>=8500){
  state.order={phase:'search',at:now,contactId:null,flankSign:state.order?.flankSign??1,flankPoint:null};
  return state.order;
 }
 const age=now-contact.at;
 const freshSight=contact.kind==='sight'&&age<2600;
 const hitCount=members.filter(member=>now-(member.lastHitAt??-Infinity)<1800).length;
 const movers=members.filter(member=>['rifle','breach'].includes(role(member)));
 const blockedMovers=movers.filter(member=>distance(member,contact.point)>member.rangedRange||
   !enemyLineOfSight(raid.world,raid.areas,member,contact.point,now));
 const support=members.some(member=>['machinegun','dmr'].includes(role(member))&&
   now-(member.trainingLastSupportShotAt??-Infinity)<1800&&
   member.trainingLastSupportTargetId===contact.playerId);
 const prior=state.order,contactChanged=prior?.contactId!==contact.playerId;
 const flank=chooseFlank(raid,members,contact,now,contactChanged?null:prior?.flankSign);
 let phase='investigate';
 if(freshSight){
  const shooters=members.filter(member=>distance(member,contact.point)<=member.rangedRange&&
    enemyLineOfSight(raid.world,raid.areas,member,contact.point,now)).length;
  const scores={
    establish:support?-20:10+Math.max(0,2-shooters)*5,
    pin:shooters*4+(support?4:0)-hitCount*3,
    maneuver:support&&blockedMovers.length&&shooters>=2
      ?blockedMovers.length*8+(support?7:0)+shooters-flank.score*.5-hitCount*2
      :-Infinity,
    reposition:hitCount>=2?hitCount*9-shooters*2:-Infinity,
  };
  if(prior?.contactId===contact.playerId&&prior.phase in scores)scores[prior.phase]+=3;
  phase=Object.entries(scores).reduce((best,[name,score])=>score>best.score?{name,score}:best,{name:'establish',score:-Infinity}).name;
 }
 state.order={phase,at:now,contactId:contact.playerId,contactPoint:{...contact.point},
   flankSign:flank.sign,flankPoint:flank.point,moverIds:blockedMovers.map(member=>member.id),
   support,hitCount,confidence:freshSight?1:Math.max(0,1-age/8500)};
 return state.order;
}
