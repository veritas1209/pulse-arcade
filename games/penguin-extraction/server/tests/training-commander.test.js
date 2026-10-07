import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingCommanderOrder} from '../trainingCommander.js';
import {trainingSearchGoal} from '../trainingTactics.js';

function squad(){
 const roles=['sniper','dmr','machinegun','rifle','breach'];
 const members=roles.map((trainingRole,index)=>({
  id:trainingRole,trainingRole,x:(index-2)*3,z:0,hp:100,
  rangedRange:index<3?45:10,lastHitAt:-Infinity,
  trainingLastSupportShotAt:-Infinity,trainingLastSupportTargetId:null,
 }));
 const raid={
  options:{training:true},trainingAiLevel:4,world:{size:100,obstacles:[]},areas:[],
  enemies:new Map(members.map(member=>[member.id,member])),
  trainingSquadContact:{point:{x:0,z:25},playerId:'observed',at:0,kind:'sight',approach:{x:0,z:1}},
  trainingObservedThreats:new Map([['observed',{x:0,z:25,at:0}]]),
  trainingConfirmedDamage:new Map(),
 };
 return {raid,members};
}
test('commander caches one shared decision and maneuvers only blocked assault members after support fire',()=>{
 const {raid,members}=squad();
 const first=trainingCommanderOrder(raid,0);
 assert.equal(first.phase,'pin');
 members[2].trainingLastSupportShotAt=100;
 members[2].trainingLastSupportTargetId='observed';
 assert.equal(trainingCommanderOrder(raid,500),first,'the squad shares the cached order');
 const second=trainingCommanderOrder(raid,600);
 assert.equal(second.phase,'maneuver');
 assert.deepEqual(second.moverIds,['rifle','breach']);
 assert.ok(second.flankPoint);
});
test('commander expires observed contact and never reads a hidden player position',()=>{
 const left=squad(),right=squad();
 left.raid.players=new Map([['observed',{x:40,z:40}]]);
 right.raid.players=new Map([['observed',{x:-40,z:-40}]]);
 assert.deepEqual(trainingCommanderOrder(left.raid,0),trainingCommanderOrder(right.raid,0));
 assert.equal(trainingCommanderOrder(left.raid,9000).phase,'search');
});
test('an audio-only contact triggers investigation rather than a firing command',()=>{
 const {raid}=squad();
 raid.trainingObservedThreats.clear();
 raid.trainingSquadContact={point:{x:4,z:20},playerId:null,at:0,kind:'sound',approach:{x:0,z:1}};
 assert.equal(trainingCommanderOrder(raid,0).phase,'investigate');
});

test('search refreshes the shared order when sight is lost',()=>{
 const {raid,members}=squad();
 assert.equal(trainingCommanderOrder(raid,0).phase,'pin');
 raid.trainingObservedThreats.clear();
 raid.trainingSquadContact={point:{x:4,z:20},playerId:null,at:700,kind:'sound',approach:{x:0,z:1}};
 const goal=trainingSearchGoal(raid,members[0],raid.trainingSquadContact.point,700);
 assert.ok(goal&&Number.isFinite(goal.x)&&Number.isFinite(goal.z));
 assert.equal(raid.trainingCommander.order.phase,'investigate');
 assert.equal(raid.trainingCommander.order.contactId,null);
});
