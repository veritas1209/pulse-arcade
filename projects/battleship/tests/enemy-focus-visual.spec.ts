import {test,expect} from '@playwright/test';
test('visible enemy click Space focuses enemy, lost contact cannot remain inspected',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('damage');const w=h.getState().world!;w.sonar=[];w.recon=[];const enemy=w.ships.find(s=>s.id==='1-carrier')!;w.ships=w.ships.filter(s=>s.id!==enemy.id);h.refresh();enemy.x=4;enemy.z=4;w.ships.push(enemy);h.refresh();h.select('0-carrier');});
 const map=await page.locator('#tactical-map').boundingBox();await page.mouse.click(map!.x+4.5*map!.width/30,map!.y+4.5*map!.height/30);await expect(page.locator('#enemy-panel')).toBeVisible();await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {focusing:boolean}).focusing),{timeout:15000}).toBe(false);
 const d=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState()),c=d.camera as {target:number[]};expect(d.enemyId).toBe('1-carrier');expect(d.followShipId).toBeNull();expect(c.target[0]).toBeCloseTo(-42,0);expect(c.target[2]).toBeCloseTo(-42,0);
 await page.screenshot({path:'artifacts/tactical-lines/enemy-F-inspection.png'});
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!,w=h.getState().world!;const s=w.ships.find(s=>s.id==='1-carrier')!;s.x=29;s.z=29;h.refresh();});await expect(page.locator('#enemy-panel')).toBeHidden();await page.keyboard.press('Space');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().followShipId)).toBe('0-carrier');expect(errors).toEqual([]);
});
