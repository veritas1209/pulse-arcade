import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {fleetShipAtDigit,horizontalPanStep,keyboardPanIntent,orderFleetForControls} from '../src/naval/navigation';

const fleet=[
 {id:'0-battleship-3',kind:'battleship' as const,sunk:false},
 {id:'0-destroyer-2',kind:'destroyer' as const,sunk:true},
 {id:'0-carrier',kind:'carrier' as const,sunk:false},
 {id:'0-battleship-1',kind:'battleship' as const,sunk:false},
 {id:'0-destroyer-3',kind:'destroyer' as const,sunk:false},
 {id:'0-destroyer-1',kind:'destroyer' as const,sunk:false},
 {id:'0-battleship-2',kind:'battleship' as const,sunk:false},
];

test('fleet command slots remain carrier, DD1-3, BB1-3 without filtering sunk ships',()=>{
 expect(orderFleetForControls(fleet).map(ship=>ship.id)).toEqual([
  '0-carrier','0-destroyer-1','0-destroyer-2','0-destroyer-3','0-battleship-1','0-battleship-2','0-battleship-3',
 ]);
 expect(fleetShipAtDigit(fleet,2)?.id).toBe('0-destroyer-1');
 expect(fleetShipAtDigit(fleet,3)).toMatchObject({id:'0-destroyer-2',sunk:true});
 expect(fleetShipAtDigit(fleet,4)?.id).toBe('0-destroyer-3');
 expect(fleetShipAtDigit(fleet,0)).toBeUndefined();expect(fleetShipAtDigit(fleet,8)).toBeUndefined();
});

test('WASD intent cancels opposing keys and normalizes diagonals',()=>{
 expect(keyboardPanIntent(new Set(['KeyW']))).toEqual({x:0,y:1});
 expect(keyboardPanIntent(new Set(['KeyA','KeyD']))).toEqual({x:0,y:0});
 const diagonal=keyboardPanIntent(new Set(['KeyW','KeyD']));
 expect(Math.hypot(diagonal.x,diagonal.y)).toBeCloseTo(1,8);expect(diagonal.x).toBeGreaterThan(0);expect(diagonal.y).toBeGreaterThan(0);
});

test('WASD follows view yaw on the XZ plane at steep, shallow and vertical pitch',()=>{
 const camera=new THREE.PerspectiveCamera();
 for(const position of [[8,18,5],[-8,2,5],[0,20,0]]){
  camera.position.fromArray(position);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const intent of [{x:0,y:1},{x:1,y:0},{x:Math.SQRT1_2,y:Math.SQRT1_2}]){
   const step=horizontalPanStep(camera,intent,3);expect(step.y).toBe(0);expect(step.length()).toBeCloseTo(3,8);
  }
  const step=horizontalPanStep(camera,{x:0,y:1},3);
  if(position[0])expect(step.x*position[0]+step.z*position[2]).toBeLessThan(0);
 }
});
