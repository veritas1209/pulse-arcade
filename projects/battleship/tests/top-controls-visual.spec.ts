import {test,expect} from '@playwright/test';
test('only help and persistent 0–100 volume remain; Space focuses ship without scrolling or activating focused buttons',async({page})=>{
 test.setTimeout(60_000); // Two complete model loads plus focus on the native PC GPU.
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await expect(page.locator('#camera-home,#menu,#sound-toggle')).toHaveCount(0);
 const volume=page.locator('#volume-control');await expect(volume).toHaveAttribute('min','0');await expect(volume).toHaveAttribute('max','100');
 await volume.fill('37');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().audio as {volume:number}).volume)).toBe(37);
 await page.reload();await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await expect(volume).toHaveValue('37');
 await volume.fill('0');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().audio as {muted:boolean}).muted)).toBe(true);await volume.fill('100');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().audio as {volume:number}).volume)).toBe(100);
 await page.locator('#start-game').focus();await page.keyboard.press('KeyF');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().followShipId)).toBeNull();
 const phase=await page.evaluate(()=>document.body.dataset.phase);await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().followShipId)).toBe('0-carrier');expect(await page.evaluate(()=>document.body.dataset.phase)).toBe(phase);expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.screenshot({path:'artifacts/top-controls/volume-space.png'});expect(errors).toEqual([]);
});
