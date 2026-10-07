// Offline four-squad tactical tournament. Same warehouse collision, navigation and LOS as live Raid.
// Combat is seeded and approximate; any winning policy must also pass real Raid integration tests.
import {TRAINING_WORLD} from '../trainingWorld.js';
import {movementBlocked} from '../../shared/movement.ts';
import {enemyLineOfSight,perceiveEnemy} from '../enemyPerception.js';
import {advanceEnemyNavigation} from '../enemyNavigation.js';
import {updateEnemyStamina} from '../enemyStamina.js';
import {trainingCombatSpeed,trainingCoveredStagingGoal,trainingTacticalGoal,trainingTravelSpeed,noteTrainingDamage,trainingPriorityTarget} from '../trainingTactics.js';
import {trainingTacticalGoal as championTacticalGoal} from './kothChampion145.js';

const ROLES=['sniper','dmr','rifle','machinegun','breach'];
const GUN={sniper:{range:52,damage:34,cooldown:1.15,accuracy:.62},dmr:{range:45,damage:20,cooldown:.55,accuracy:.55},rifle:{range:35,damage:12,cooldown:.22,accuracy:.48},machinegun:{range:34,damage:9,cooldown:.14,accuracy:.39},breach:{range:22,damage:10,cooldown:.16,accuracy:.48}};
const STARTS=[{x:-38,z:-38},{x:38,z:-38},{x:38,z:38},{x:-38,z:38}];
const dt=.1;
const tacticalPolicy=policy=>policy==='candidate'||policy==='challenger'||policy.startsWith('champion');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function rng(seed){let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
function validPoint(point){if(!movementBlocked(TRAINING_WORLD,point.x,point.z))return point;for(const radius of [2,4,6,8])for(let k=0;k<8;k++){const theta=k*Math.PI/4,p={x:point.x+Math.cos(theta)*radius,z:point.z+Math.sin(theta)*radius};if(!movementBlocked(TRAINING_WORLD,p.x,p.z))return p;}throw Error('No valid start');}
function buildTeam(id,policy){const start=STARTS[id],members=ROLES.map((role,index)=>{const p=validPoint({x:start.x+(index-2)*2.4,z:start.z+(id%2?2:-2)});return {id:`${id}-${role}`,team:id,trainingRole:role,trainingTier:4,kind:role==='sniper'||role==='dmr'?'sniper':'raider',x:p.x,z:p.z,yaw:Math.atan2(-p.x,-p.z),speed:2.3,hp:100,alive:true,rangedRange:GUN[role].range,shotsFired:0,hitsLanded:0,trainingPositionPhase:0,nextShotAt:0,reactionUntil:0,stamina:90,maxStamina:90,staminaRecoveryAt:0,sprintExhausted:false,sprintedLastTick:false,lastHitAt:-Infinity};});return {id,policy,members,stagingGoal:trainingCoveredStagingGoal(TRAINING_WORLD,start,{x:start.x*.5,z:start.z*.5},{x:0,z:0}),score:0,kills:0,wiped:false,contact:null,sightings:new Map(),trainingConfirmedDamage:new Map(),trainingAiLevel:4,sprints:0,flankShots:0,shots:0,hits:0};}
function chooseTarget(bot,opponents,now,team){
 const preferred=team.policy==='challenger'?trainingPriorityTarget(team,now):null;
 return perceiveEnemy(TRAINING_WORLD,[],bot,new Map(opponents.map(o=>[o.id,o])),now,preferred);
}
function approach(team,point){const center=team.members.reduce((a,b)=>({x:a.x+b.x/5,z:a.z+b.z/5}),{x:0,z:0}),dx=point.x-center.x,dz=point.z-center.z,d=Math.max(.01,Math.hypot(dx,dz));return {x:dx/d,z:dz/d};}
function move(team,bot,goal,now,policy,target){if(!goal){bot.movedThisTick=false;return;}const before={x:bot.x,z:bot.z},budget={remaining:2};let speed=policy==='walk'?2.3:policy==='rush'?9:trainingTravelSpeed({options:{training:true},trainingAiLevel:4},bot);if(policy==='hold')speed=5.5;if(policy==='challenger'&&target){const raid={options:{training:true},trainingAiLevel:4,enemies:new Map(team.members.map(m=>[m.id,m]))};speed=trainingCombatSpeed(raid,bot,target,now,goal,enemyLineOfSight(TRAINING_WORLD,[],bot,target,now));}advanceEnemyNavigation(TRAINING_WORLD,bot,goal,dt,now,budget,{speedOverride:speed});bot.movedThisTick=dist(before,bot)>.05;if(dist(before,bot)>.65)team.sprints++;}
function observedContact(team,point,now,playerId=null){const previous=team.contact;team.contact={point:{x:point.x,z:point.z},playerId,at:now,approach:previous&&now-previous.at<3000?previous.approach:approach(team,point)};}
export function simulateKoth(seed,policies=['candidate','walk','rush','hold']){
 const random=rng(seed),teams=policies.map((p,i)=>buildTeam(i,p)),all=teams.flatMap(t=>t.members);let elapsedTicks=0,navMs=0;
 for(let tick=0;tick<300;tick++){
  const now=tick*100;elapsedTicks++;
  // Rotating update order prevents an opening team from always firing first.
  const order=[...all].sort((a,b)=>((a.team+tick)%4)-((b.team+tick)%4));
  for(const bot of order){
   if(!bot.alive)continue;
   updateEnemyStamina(bot,dt,now);
   const team=teams[bot.team],opponents=all.filter(o=>o.team!==bot.team&&o.alive),perceived=chooseTarget(bot,opponents,now,team),target=perceived.target;
   if(target){team.sightings.set(target.id,{x:target.x,z:target.z,at:now});observedContact(team,target,now,target.id);if(bot.targetId!==target.id){bot.reactionUntil=now+600;bot.targetId=target.id;}}else if(perceived.observed&&perceived.point)observedContact(team,perceived.point,now);
   else bot.targetId=null;
   const contact=team.contact&&now-team.contact.at<5000?team.contact:null;
   let goal=null;
   if(target){
    if(tacticalPolicy(team.policy)){
     const raid={options:{training:true},trainingAiLevel:4,trainingMultiTeam:true,trainingSideScale:team.policy==='challenger'?Number(process.env.KOTH_CHALLENGER_SIDE??.45):.45,world:TRAINING_WORLD,areas:[],enemies:new Map(team.members.map(m=>[m.id,m])),trainingSquadContact:contact,trainingThreats:[...team.sightings].filter(([id,s])=>id!==target.id&&now-s.at<3000).map(([,s])=>s)};
     const tactic=team.policy.startsWith('champion')?championTacticalGoal:trainingTacticalGoal;const tactical=tactic(raid,bot,target,now,{point:target,move:true});goal=tactical.move?tactical.point:null;
    }else if(team.policy==='walk')goal=target;
    else if(team.policy==='rush')goal=target;
    else {const side=bot.trainingRole==='breach'?7:bot.trainingRole==='rifle'?-7:0;goal={x:target.x+side,z:target.z+8};}
   }else if(contact)goal=contact.point;
   else goal=tacticalPolicy(team.policy)&&tick<60?team.stagingGoal:{x:0,z:0};
   if(goal){const started=process.hrtime.bigint();move(team,bot,goal,now,team.policy,target);navMs+=Number(process.hrtime.bigint()-started)/1e6;}if(!goal)bot.movedThisTick=false;if(target)bot.yaw=Math.atan2(target.x-bot.x,target.z-bot.z);
   if(!target||now<bot.reactionUntil||now<(bot.reactionReadyAt??0)||now<bot.nextShotAt||dist(bot,target)>GUN[bot.trainingRole].range||!enemyLineOfSight(TRAINING_WORLD,[],bot,target,now))continue;
   const gun=GUN[bot.trainingRole];bot.nextShotAt=now+gun.cooldown*1000;bot.shotsFired++;team.shots++;bot.noisePosition={x:bot.x,z:bot.z};bot.noiseUntil=now+600;bot.noiseRadius=38;if(bot.trainingRole==='machinegun')bot.trainingLastSupportShotAt=now;bot.trainingLastSupportTargetId=target.id;
   const rangeFactor=Math.max(.35,1-dist(bot,target)/(gun.range*1.8)),moveFactor=target.sprintedLastTick?.72:1,hitChance=gun.accuracy*rangeFactor*moveFactor;
   if(random()<hitChance){team.hits++;bot.hitsLanded++;target.hp-=gun.damage;target.lastHitAt=now;if(team.policy==='challenger')noteTrainingDamage(team,bot,target.id,gun.damage,now);if(Math.abs(bot.x-target.x)>7)team.flankShots++;if(target.hp<=0){target.alive=false;team.kills++;team.score+=5;const victim=teams[target.team];if(!victim.wiped&&victim.members.every(member=>!member.alive)){victim.wiped=true;victim.score-=20;}}}
  }
  if(teams.filter(team=>!team.wiped).length<=1)break;
 }
 const highest=Math.max(...teams.map(team=>team.score));
 return {seed,ticks:elapsedTicks,winners:teams.filter(team=>team.score===highest).map(team=>team.policy),navMs:Number(navMs.toFixed(1)),teams:teams.map(team=>({policy:team.policy,score:team.score,kills:team.kills,alive:team.members.filter(m=>m.alive).length,shots:team.shots,hits:team.hits,sprints:team.sprints,flankShots:team.flankShots,roleStats:team.members.map(member=>({role:member.trainingRole,shots:member.shotsFired,hits:member.hitsLanded,alive:member.alive,x:Number(member.x.toFixed(1)),z:Number(member.z.toFixed(1))}))}))};
}
export function runKothTournament(rounds=8,seedBase=1409){const policies=['candidate','walk','rush','hold'],results=[];for(let i=0;i<rounds;i++){const rotated=policies.map((_,j)=>policies[(i+j)%4]);results.push(simulateKoth(seedBase+i*37,rotated));}const summary=Object.fromEntries(policies.map(policy=>{const rows=results.map(result=>result.teams.find(team=>team.policy===policy));return [policy,{wins:results.filter(result=>result.winners.includes(policy)).length,averageScore:Number((rows.reduce((a,b)=>a+b.score,0)/rounds).toFixed(1)),averageKills:Number((rows.reduce((a,b)=>a+b.kills,0)/rounds).toFixed(1)),averageFlankShots:Number((rows.reduce((a,b)=>a+b.flankShots,0)/rounds).toFixed(1))}];}));return {rules:{teams:4,squadSize:5,ticks:300,killPoints:5,wipePenalty:20},rounds,summary,matches:results};}
export function runChampionTournament(rounds=32,seedBase=4171){
 const policies=['challenger','champion-a','champion-b','champion-c'],matches=[];
 for(let i=0;i<rounds;i++)matches.push(simulateKoth(seedBase+i*37,policies.map((_,j)=>policies[(i+j)%4])));
 return {rounds,challengerWins:matches.filter(m=>m.winners.includes('challenger')).length,
  challengerAverageScore:Number((matches.reduce((total,m)=>total+m.teams.find(t=>t.policy==='challenger').score,0)/rounds).toFixed(1)),
  championAverageScore:Number((matches.reduce((total,m)=>total+m.teams.filter(t=>t.policy.startsWith('champion')).reduce((sum,t)=>sum+t.score,0),0)/(rounds*3)).toFixed(1))};
}
if(process.argv[1]?.endsWith('training-koth-sim.js'))console.log(JSON.stringify(runKothTournament(Number(process.argv[2])||8,Number(process.argv[3])||1409),null,2));
