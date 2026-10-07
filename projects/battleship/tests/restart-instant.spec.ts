import {test,expect} from '@playwright/test';

test('new operation spawns the original fleet immediately without sailing back',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__?.getState().texturesReady,{},{timeout:40000});
 const before=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.map(s=>({id:s.id,x:s.x,z:s.z})));
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('complete');const w=h.getState().world!;for(const s of w.ships.filter(s=>s.team===0)){s.x+=15;s.z+=15;}h.refresh();});
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShips)).toBeGreaterThan(0);
 await page.locator('#restart').dispatchEvent('click');const after=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());
 expect(after.state.phase).toBe('setup');expect(after.movingShips).toBe(0);expect(after.movingShipIds).toEqual([]);
 for(const s of before){const p=(after.shipPositions as any)[s.id];expect(p[0]).toBe((s.x+.5)*4-60);expect(p[2]).toBe((s.z+.5)*4-60);}
});
