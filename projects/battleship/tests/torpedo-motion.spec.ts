import {test,expect} from '@playwright/test';
import {createTorpedoMotion} from '../src/naval/torpedo-paths';
import type {TorpedoView} from '../src/contract';

test('a five-cell turn animates all intervening corners instead of crossing terrain',()=>{
 const motion=createTorpedoMotion(),route=[{x:5,z:6},{x:6,z:6},{x:7,z:6},{x:7,z:7},{x:7,z:8}],launched:TorpedoView={id:'friendly',team:0,x:5,z:5,heading:0,route};
 motion.sync([], [launched],[]);
 const advanced={...launched,x:7,z:8,route:[]};motion.sync([launched],[advanced],[]);
 const positions:number[][]=[];
 for(let i=0;i<24;i++)positions.push(motion.step(advanced,.05).position.toArray());
 // First leg stays at x=-38, then travels horizontally at z=-34,
 // then turns south at x=-30. A chord would cross the blocked inside corner.
 for(const p of positions)expect(Math.abs(p[0]+38)<.0001||Math.abs(p[2]+34)<.0001||Math.abs(p[0]+30)<.0001).toBe(true);
 expect(positions.at(-1)).toEqual([-30,0,-26]);expect(motion.step(advanced,0).heading).toBeCloseTo(0);
 motion.sync([advanced],[],[]);expect(motion.diagnostics()).toEqual([]);
});

test('visible enemy motion derives only public terrain and cannot expose an enemy route',()=>{
 const motion=createTorpedoMotion(),old:TorpedoView={id:'enemy',team:1,x:2,z:2,heading:0},next={...old,x:4,z:2};
 motion.sync([], [old],[]);motion.sync([old],[next],[{x:3,z:2}]);
 expect(motion.diagnostics()[0]!.waypoints.length).toBeGreaterThan(2);
 for(const p of motion.diagnostics()[0]!.waypoints)expect(p).not.toEqual([-46,0,-50]);
 const stopped=motion.step(next,0).position.clone();expect(motion.step(next,0).position.equals(stopped)).toBe(true);
 motion.clear();expect(motion.diagnostics()).toEqual([]);
});
