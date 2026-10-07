import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {meshAboveWater} from '../src/naval/sinking-visibility';

test('sinking visibility follows the rotated hull and waterline, not the bubble lifetime',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,4));mesh.position.y=-.6;expect(meshAboveWater(mesh,0)).toBe(false);
 mesh.rotation.x=Math.PI/4;expect(meshAboveWater(mesh,0)).toBe(true);
 mesh.position.y=-3;expect(meshAboveWater(mesh,.05)).toBe(false);
 mesh.position.y=1;mesh.visible=false;expect(meshAboveWater(mesh,0)).toBe(false);mesh.geometry.dispose();
});

test('ship inspection retains its center through orbit and wheel; profile changes fit distance',async({page})=>{
 test.setTimeout(70000);await page.goto('/');await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__?.getState().texturesReady,{},{timeout:40000});
 await page.locator('#start-game').click();await page.keyboard.press('Space');await page.waitForFunction(()=>!(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as any).focusing,{},{timeout:30000});
 const pose=()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as Promise<any>;
 const before=await pose(),canvas=(await page.locator('#game-canvas').boundingBox())!;
 await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.43);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.68,canvas.y+canvas.height*.43,{steps:20});await page.mouse.up();await page.waitForTimeout(1000);
 const turned=await pose();expect(Math.hypot(...turned.target.map((n:number,i:number)=>n-before.target[i]))).toBeLessThan(.02);expect(Math.abs(turned.distance-before.distance)).toBeGreaterThan(.08);
 await page.mouse.wheel(0,-120);await page.waitForTimeout(700);const zoomed=await pose();expect(zoomed.distance).toBeLessThan(turned.distance);expect(Math.hypot(...zoomed.target.map((n:number,i:number)=>n-before.target[i]))).toBeLessThan(.02);
 await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.43,{steps:20});await page.mouse.up();await page.waitForTimeout(1000);const again=await pose();expect(Math.hypot(...again.target.map((n:number,i:number)=>n-before.target[i]))).toBeLessThan(.02);
 await test.info().attach('inspection-poses',{body:JSON.stringify({before,turned,zoomed,again},null,2),contentType:'application/json'});
});
