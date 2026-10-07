import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {cellBoundaryEdges} from '../src/naval/cell-boundary';
import {createMovementOutline} from '../src/naval/movement-outline';
import {createTorpedoPaths} from '../src/naval/torpedo-paths';
import {createBattle,snapshot} from '../src/rules';
import type {SceneState} from '../src/contract';

test('movement union removes shared edges, outlines inaccessible holes, and respects empty range',()=>{
 expect(cellBoundaryEdges([{x:0,z:0},{x:1,z:0},{x:1,z:0}])).toHaveLength(6);
 const ring=Array.from({length:9},(_,i)=>({x:i%3,z:Math.floor(i/3)})).filter(c=>c.x!==1||c.z!==1);
 expect(cellBoundaryEdges(ring)).toHaveLength(16);expect(cellBoundaryEdges([], {x:1,z:1})).toEqual([]);
 expect(cellBoundaryEdges([{x:-1,z:2},{x:30,z:2}])).toEqual([]);
 const scene=new THREE.Scene(),outline=createMovementOutline(scene,{value:0}),view=snapshot(createBattle(),0);
 const state:SceneState={...view,selectedId:'0-carrier',action:'move',reachable:[{x:1,z:1}]};outline.sync(state);
 expect(outline.diagnostics().movementOutlineVisible).toBe(true);const line=scene.getObjectByName('selected-ship-movement-boundary') as THREE.Mesh;
 expect((line.material as THREE.ShaderMaterial & {color:THREE.Color;linewidth:number}).color.getHex()).toBe(0xf4ffff);
 state.reachable=[];outline.sync(state);expect(line.visible).toBe(false);outline.dispose();expect(scene.children).toHaveLength(0);
});

test('clicked yellow route survives a separate dashed hover; detected enemy route is red and disappears on lost contact',()=>{
 const scene=new THREE.Scene(),paths=createTorpedoPaths(scene,{value:0}),view=snapshot(createBattle(),0),dd=view.own.find(s=>s.id==='0-destroyer-1')!;dd.x=1;dd.z=1;
 const state:SceneState={...view,islands:[],selectedId:dd.id,action:'torpedo'};
 paths.sync(state,{x:8,z:1});expect(paths.diagnostics().torpedoLockedTarget).toBeNull();expect(paths.diagnostics().torpedoTracks[0]!.style).toBe('dashed');
 state.targetCell={x:8,z:1};paths.sync(state,{x:8,z:3});expect(paths.diagnostics().torpedoTracks.map(t=>[t.role,t.style,t.cells.at(-1)])).toEqual([['locked','solid',{x:8,z:1}],['preview','dashed',{x:8,z:3}]]);
 paths.sync(state,null);expect(paths.diagnostics().torpedoTracks).toHaveLength(1);expect(paths.diagnostics().torpedoLockedTarget).toEqual({x:8,z:1});
 paths.sync(state,state.targetCell);expect(paths.diagnostics().torpedoTracks).toHaveLength(1);
 state.torpedoes=[{id:'contact',team:1,x:4,z:4,heading:0,route:[{x:4,z:5},{x:4,z:6}]}];paths.sync(state,null);
 const enemy=scene.getObjectByName('detected-enemy-torpedo-tracks') as THREE.Mesh;expect(enemy.visible).toBe(true);expect((enemy.material as THREE.ShaderMaterial & {color:THREE.Color;dashed:boolean}).color.getHex()).toBe(0xff4b55);expect((enemy.material as THREE.ShaderMaterial & {dashed:boolean}).dashed).toBe(true);
 expect(paths.diagnostics().detectedEnemyTorpedoRoutes).toBe(1);state.torpedoes=[];paths.sync(state,null);expect(enemy.visible).toBe(false);
 state.targetCell=undefined;state.action='move';paths.sync(state,null);expect(paths.diagnostics().torpedoPathDrawCalls).toBe(0);paths.dispose();expect(scene.children).toHaveLength(0);
});
