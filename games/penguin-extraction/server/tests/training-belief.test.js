import test from 'node:test';
import assert from 'node:assert/strict';
import {movementBlocked} from '../../shared/movement.ts';
import {observeTrainingBelief,advanceTrainingBelief,trainingBeliefGoal,TRAINING_BELIEF_LIMITS} from '../trainingBelief.js';

const barrier={size:100,obstacles:[{x:0,z:0,w:2,d:28}]};
test('position belief expands through walkable cells without seeing the hidden player',()=>{
 const raid={options:{training:true},trainingAiLevel:4,world:barrier,areas:[]};
 observeTrainingBelief(raid,{x:-12,z:0},1000);
 const hiddenPlayer={x:30,z:30};
 const estimate=advanceTrainingBelief(raid,3100);
 assert.ok(estimate.cells.size>1);
 assert.ok(estimate.cells.size<=TRAINING_BELIEF_LIMITS.maxCells);
 assert.ok([...estimate.cells.values()].every(cell=>!movementBlocked(barrier,cell.x*4,cell.z*4)));
 assert.ok([...estimate.cells.values()].every(cell=>cell.x<0),'belief cannot cross a long wall in 2.1 seconds');
 assert.notDeepEqual(trainingBeliefGoal(raid,'breach',3100),hiddenPlayer);
});
test('belief expires instead of tracking a hidden player indefinitely',()=>{
 const raid={options:{training:true},trainingAiLevel:4,world:{size:100,obstacles:[]},areas:[]};
 observeTrainingBelief(raid,{x:5,z:5},1000);
 assert.equal(trainingBeliefGoal(raid,'rifle',17001),null);
});
