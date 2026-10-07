import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingSpawns,trainingContact,trainingTacticalGoal,noteTrainingDamage,trainingPriorityTarget} from '../trainingTactics.js';
import {TRAINING_WORLD} from '../trainingWorld.js';
import {perceiveEnemy,forceEnemyThreat} from '../enemyPerception.js';

test('training stages use bounded encounters and retain the DPS target',()=>{
 const spawns=TRAINING_WORLD.enemySpawns;
 assert.equal(trainingSpawns(spawns,'normal',1).length,spawns.length-1);
 assert.deepEqual(trainingSpawns(spawns,'dps',4).map(spawn=>spawn.id),['training-dps']);
 const boss=trainingSpawns(spawns,'mixed',2);
 assert.equal(boss.length,2);
 assert.equal(boss[0].trainingRole,'boss');
 const squad=trainingSpawns(spawns,'mixed',4);
 assert.equal(squad.length,6);
 assert.deepEqual(squad.filter(spawn=>!spawn.trainingImmortal).map(spawn=>spawn.trainingRole),['sniper','dmr','rifle','machinegun','breach']);
 assert.equal(new Set(squad.map(spawn=>spawn.id)).size,squad.length);
});

test('squad shares observed positions without tracking a hidden moving player',()=>{
 const raid={options:{training:true},trainingAiLevel:3};
 const scout={id:'observer'},support={id:'support'};
 const player={id:'trainer',x:8,z:4};
 trainingContact(raid,scout,{target:player,point:{x:8,z:4},observed:true},1000);
 player.x=31;player.z=27;
 const report=trainingContact(raid,support,{target:null,point:null,observed:false},1200);
 assert.deepEqual(report.point,{x:8,z:4});
 assert.equal(trainingContact(raid,support,{target:null,point:null,observed:false},11200).point,null);
});

test('boss searches near the last seen point instead of reading hidden coordinates',()=>{
 const raid={options:{training:true},trainingAiLevel:2};
 const boss={id:'boss',x:0,z:0};
 const player={id:'trainer',x:5,z:5};
 trainingContact(raid,boss,{target:player,point:{x:5,z:5},observed:true},1000);
 player.x=30;player.z=30;
 boss.x=5;boss.z=5;
 assert.deepEqual(trainingContact(raid,boss,{target:null,point:{x:5,z:5},observed:false},3500).point,{x:9,z:5});
 assert.deepEqual(trainingContact(raid,boss,{target:null,point:null,observed:false},10000).point,null);
});

test('response squad assigns separate pressure lanes around an observed contact',()=>{
 const mg={trainingRole:'machinegun',shotsFired:0,x:0,z:0,rangedRange:36};
 const breach={trainingRole:'breach',x:4,z:0};
 const sniper={trainingRole:'sniper',x:4,z:0,rangedRange:52,lastHitAt:-Infinity};
 const raid={options:{training:true},trainingAiLevel:4,world:{size:100,obstacles:[]},areas:[],enemies:new Map([['mg',mg],['breach',breach],['sniper',sniper]])};
 const target={id:'player',x:20,z:0};
 raid.trainingSquadContact={point:{x:20,z:0},playerId:'player',at:1000,approach:{x:1,z:0}};
 const mgGoal=trainingTacticalGoal(raid,mg,target,1000,{move:false});
 const breachGoal=trainingTacticalGoal(raid,breach,target,1000,{move:false});
 const sniperGoal=trainingTacticalGoal(raid,sniper,target,1000,{move:false});
 assert.equal(mgGoal.move,false);
 assert.equal(breachGoal.move,true);
 assert.equal(sniperGoal.move,false);
 assert.notEqual(breachGoal.point.z,0,'SMG takes a flank while support holds clear lines');
 mg.trainingLastSupportShotAt=1000;mg.trainingLastSupportTargetId='player';
 const assaultGoal=trainingTacticalGoal(raid,breach,target,1001,{move:false});
 assert.ok(breachGoal.point.x<assaultGoal.point.x,'SMG closes only after MG establishes support fire');
});

test('training forced threat behind a wall stays a point, not a shootable target',()=>{
 const world={size:100,obstacles:[{id:'wall',x:0,z:0,w:2,d:12}]};
 const enemy={id:'boss',kind:'commander',trainingTier:2,x:-5,z:0,yaw:Math.PI/2,alertState:'idle'};
 const player={id:'trainer',x:5,z:0,alive:true,downed:false,boarded:false,settlement:false};
 forceEnemyThreat(enemy,player,1000);
 const seen=perceiveEnemy(world,[],enemy,new Map([[player.id,player]]),1100);
 assert.equal(seen.target,null);
 assert.deepEqual(seen.point,{x:5,z:0});
});

test('aim correction uses only fresh observed motion and caps impossible velocity',()=>{
 const raid={options:{training:true},trainingAiLevel:3};
 const enemy={id:'sniper',trainingTier:3};
 const player={id:'trainer',x:0,z:0};
 trainingContact(raid,enemy,{target:player,point:{x:0,z:0},observed:true},1000);
 player.x=100;
 trainingContact(raid,enemy,{target:player,point:{x:100,z:0},observed:true},1100);
 assert.ok(Math.hypot(enemy.trainingObservedVelocity.x,enemy.trainingObservedVelocity.z)<=8.001);
 const last={...enemy.trainingObservedVelocity};
 player.x=140;
 trainingContact(raid,enemy,{target:null,point:{x:100,z:0},observed:false},1300);
 assert.deepEqual(enemy.trainingObservedVelocity,last);
});

test('response squad keeps five roles cohesive without a three-unit close cluster',()=>{
 const members=trainingSpawns(TRAINING_WORLD.enemySpawns,'normal',4).map(member=>({...member,hp:100,rangedRange:50,shotsFired:0}));
 const raid={options:{training:true},trainingAiLevel:4,world:TRAINING_WORLD,areas:[],enemies:new Map(members.map(member=>[member.id,member])),trainingSquadContact:{point:{x:0,z:30},at:1000,approach:{x:0,z:1}}};
 const target={x:0,z:30},goals=members.map(member=>{
  const tactical=trainingTacticalGoal(raid,member,target,1000,{point:target,move:true});
  return tactical.point??member;
 });
 for(let i=0;i<goals.length;i++){
  assert.ok(goals.filter((point,j)=>i!==j&&Math.hypot(point.x-goals[i].x,point.z-goals[i].z)<9).length<=1,'at most two units gather within 9m');
  assert.ok(goals.some((point,j)=>i!==j&&Math.hypot(point.x-goals[i].x,point.z-goals[i].z)<30),'every role has a nearby teammate');
 }
});

test('confirmed-hit priority does not override the normal vision and wall checks',()=>{
 const raid={trainingAiLevel:4},source={trainingRole:'rifle'};
 noteTrainingDamage(raid,source,'preferred',30,1000);
 assert.equal(trainingPriorityTarget(raid,1100),'preferred');
 const enemy={id:'observer',trainingTier:4,kind:'raider',x:0,z:0,yaw:Math.PI/2};
 const near={id:'near',x:8,z:-2,alive:true};
 const preferred={id:'preferred',x:10,z:3,alive:true};
 const wall={size:100,obstacles:[{id:'screen',x:5,z:1.5,w:2,d:1.5}]};
 const seen=perceiveEnemy(wall,[],enemy,new Map([['near',near],['preferred',preferred]]),1100,trainingPriorityTarget(raid,1100));
 assert.equal(seen.target.id,'near','preferred target remains hidden by a wall');
 assert.equal(trainingPriorityTarget(raid,6100),null,'damage priority expires');
});