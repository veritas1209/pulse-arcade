import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateKoth} from './training-koth-sim.js';

test('four five-member squads finish a reproducible 300-tick KOTH round with kill and wipe scoring',()=>{
 const first=simulateKoth(1409),repeat=simulateKoth(1409);
 assert.deepEqual({...first,navMs:0},{...repeat,navMs:0});
 assert.ok(first.ticks>0&&first.ticks<=300);
 assert.equal(first.teams.length,4);
 for(const team of first.teams){
  assert.ok(team.alive>=0&&team.alive<=5);
  assert.equal(team.score,team.kills*5-(team.alive===0?20:0));
 }
 assert.ok(first.winners.every(policy=>first.teams.some(team=>team.policy===policy)));
});
