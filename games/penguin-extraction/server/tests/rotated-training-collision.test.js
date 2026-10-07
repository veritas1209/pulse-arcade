import test from 'node:test';
import assert from 'node:assert/strict';
import {obstacleWorldPoint,obstacleLocalPoint,obstacleContainsPoint,rayObstacleDistance} from '../../shared/rotated-collision.js';
import {advanceMovement,movementBlocked} from '../../shared/movement.ts';
import {segmentObstacles} from '../spatialObstacles.js';
import {enemyLineOfSight} from '../enemyPerception.js';
import {movementSegmentClear} from '../enemyNavigation.js';

const cover={id:'angled-container',x:0,z:0,w:8,d:1,rotation:Math.PI/4};
const world={size:82,obstacles:[cover],terrain:[],roads:[]};

test('rotated training cover matches walking, bullets, sight and AI routing',()=>{
 const inside=obstacleWorldPoint(cover,{x:3,z:0});
 assert.ok(Math.abs(inside.z)>cover.d/2+.45,'the chosen point sits outside the old unrotated footprint');
 assert.equal(obstacleContainsPoint(cover,inside),true);
 assert.equal(movementBlocked(world,inside.x,inside.z),true);
 const before=obstacleWorldPoint(cover,{x:3,z:-3}),after=obstacleWorldPoint(cover,{x:3,z:3});
 assert.ok(segmentObstacles(world,before,after).has(cover),'broad-phase includes rotated extents');
 const dx=after.x-before.x,dz=after.z-before.z,range=Math.hypot(dx,dz);
 assert.ok(rayObstacleDistance(before,{x:dx/range,z:dz/range},cover,range)<range);
 assert.equal(enemyLineOfSight(world,[],before,after,0),false);
 assert.equal(movementSegmentClear(world,before,after),false);
});

test('rotated training cover leaves its empty bounding-box corners passable',()=>{
 const outside={x:3,z:3};
 assert.equal(obstacleContainsPoint(cover,outside,.45),false);
 assert.equal(movementBlocked(world,outside.x,outside.z),false);
});

test('player slides smoothly along both directions of a diagonal container',()=>{
 for(const sign of [1,-1]){
  const start=obstacleWorldPoint(cover,{x:-3*sign,z:1.03});
  const vector=obstacleWorldPoint({x:0,z:0,rotation:cover.rotation},{x:sign,z:-.38});
  const player={...start,stamina:100,maxStamina:100,moveMultiplier:1,coldUntil:0};
  for(let tick=0;tick<100;tick++){
   advanceMovement(player,{moveX:vector.x,moveZ:vector.z,sprint:false},.01,tick*10,world);
   assert.equal(movementBlocked(world,player.x,player.z),false,'sliding must not enter rotated cover');
  }
  const local=obstacleLocalPoint(cover,player);
  assert.ok(sign*local.x>2,'the player should travel along the diagonal face instead of sticking');
 }
});