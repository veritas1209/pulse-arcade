import {test,expect} from '@playwright/test';

test('desktop command order, stable digits and held WASD respect focus and overlays',async({page})=>{
 test.setTimeout(60000);await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 const ids=['0-carrier','0-destroyer-1','0-destroyer-2','0-destroyer-3','0-battleship-1','0-battleship-2','0-battleship-3'];
 expect(await page.locator('#ship-picker [data-ship]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-ship')))).toEqual(ids);
 for(let i=0;i<7;i++){await page.keyboard.press(`Digit${i+1}`);expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedId)).toBe(ids[i]);}
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!,w=h.getState().world!;const dd=w.ships.find(s=>s.id==='0-destroyer-2')!;dd.sunk=true;dd.hp=0;h.refresh();});
 await page.keyboard.press('Digit4');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedId)).toBe(ids[3]);
 await page.keyboard.press('Digit3');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedId)).toBe(ids[3]);
 await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {distance:number}).distance)).toBeLessThan(5.1);
 await page.keyboard.down('KeyW');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {pressedKeys:string[]}).pressedKeys)).toEqual(['KeyW']);
 const beforePosition=await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {position:number[]}).position);const before=await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {target:number[]}).target);await page.waitForTimeout(250);const after=await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {target:number[]}).target);
 expect(Math.hypot(after[0]-before[0],after[2]-before[2])).toBeGreaterThan(.1);expect(after[1]).toBeCloseTo(before[1],7);expect(await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {position:number[]}).position[1])).toBeCloseTo(beforePosition[1],7);
 await page.keyboard.up('KeyW');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {pressedKeys:string[]}).pressedKeys)).toEqual([]);
 await page.keyboard.down('KeyD');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {pressedKeys:string[]}).pressedKeys)).toEqual([]);await page.keyboard.up('KeyD');
 await page.locator('#help-toggle').click();await page.keyboard.down('KeyW');await page.waitForTimeout(100);expect(await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {pressedKeys:string[]}).pressedKeys)).toEqual([]);await page.keyboard.up('KeyW');await page.locator('#help-toggle').click();
 await page.locator('#mode-select').selectOption('online');await page.locator('#room-input').focus();const selected=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedId);await page.keyboard.type('123wasd');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedId)).toBe(selected);expect(await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {pressedKeys:string[]}).pressedKeys)).toEqual([]);
});

test('launched torpedo draws the authoritative island detour and traverses its corners',async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('route-fixture');const w=h.getState().world!;w.turnNumber=3;w.round=2;w.ownTurns=[2,1];const dd=w.ships.find(s=>s.id==='0-destroyer-1')!;dd.x=4;dd.z=10;h.refresh();h.select(dd.id);h.command({type:'torpedo',shipId:dd.id,target:{x:12,z:10}});});
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().friendlyTorpedoRoutes)).toBe(1);
 const launch=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());const t=launch.state.torpedoes![0]!;
 expect(t.route!.at(-1)).toEqual({x:12,z:10});expect(t.route!.some(c=>c.z!==10)).toBe(true);expect(t.route!.some(c=>launch.state.islands.some(i=>i.x===c.x&&i.z===c.z))).toBe(false);expect(launch.torpedoRouteSegments).toBeGreaterThan(t.route!.length);expect(launch.state.own.find(s=>s.id==='0-destroyer-1')!.ap).toBe(3);
 await page.screenshot({path:'artifacts/iowa-daylight/torpedo-detour.png'});
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.command({type:'end'}));
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoMotion as {waypoints:number[][]}[])[0]?.waypoints.length)).toBeGreaterThan(0);
 const advanced=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.torpedoes![0]);expect(advanced!.route!.length).toBe(t.route!.length-5);
 expect(errors).toEqual([]);
});
