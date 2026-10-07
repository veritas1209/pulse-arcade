import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
async function ready(page:Page){await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState();return d.texturesReady&&!d.presentationBusy;},null,{timeout:60000});}
async function tile(page:Page,x:number,z:number,button:'left'|'right'='left'){
 const box=await page.locator('#tactical-map').boundingBox();expect(box).toBeTruthy();await page.mouse.click(box!.x+(x+.5)*box!.width/30,box!.y+(z+.5)*box!.height/30,{button});
}

test('sonar fronts remain water-following, smooth and within the rendering budget',async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('airstrike');h.getState().world!.islands=[];h.refresh();});await ready(page);
 await page.locator('[data-ship="0-carrier"]').click();await page.locator('#action-sonar').click();await page.locator('#confirm-action').click();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sonarPulses)).toBe(3);
 await page.waitForTimeout(1000);const d=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(d.state.own.find(s=>s.id==='0-carrier')!.ap).toBe(2);expect(d.triangles as number).toBeLessThan(750000);expect(d.calls as number).toBeLessThan(300);
 await page.screenshot({path:'artifacts/movement-concurrency/sonar-pulse.png'});expect(errors).toEqual([]);await fs.writeFile('artifacts/movement-concurrency/sonar-pulse.json',JSON.stringify({errors,state:d},null,2));
});
test('moving hulls leave other ships actionable, arrival unlocks independently and end waits for movement',async({page})=>{
 test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('airstrike');h.getState().world!.islands=[];h.refresh();});await ready(page);
 const plans=await page.evaluate(async()=>{const h=window.__THREE_GAME_TEST_HOOKS__!,v=h.getState().state,{reachableCells}=await import('../src/rules');return ['0-carrier','0-destroyer-2'].map((id,i)=>{const s=v.own.find(s=>s.id===id)!,steps=i?1:3,c=reachableCells(v,id).find(c=>i?i?c.z===s.z&&c.x===s.x+steps:c.x===s.x&&c.z===s.z+steps:c.x===s.x&&c.z===s.z+steps);if(!c)throw new Error('Missing clear fixture route');return {id,target:c,ap:s.ap};});});
 await page.locator(`[data-ship="${plans[0]!.id}"]`).click();await tile(page,plans[0]!.target.x,plans[0]!.target.z,'right');
 await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShips===1);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShips===1);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));await expect(page.locator('#end-turn')).toBeEnabled();await page.locator(`[data-ship="${plans[1]!.id}"]`).click();await expect(page.locator('#action-sonar')).toBeEnabled();await tile(page,plans[1]!.target.x,plans[1]!.target.z,'right');
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().movingShipIds as string[]).length)).toBe(2);
 // A stationary third ship can spend AP while both movement animations run.
 await page.locator('[data-ship="0-destroyer-3"]').click();await page.locator('#action-sonar').click();await page.locator('#confirm-action').click();await page.locator('#action-attack').click();await tile(page,25,25);await page.locator('#confirm-action').click();
 const acting=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(acting.state.own.find(s=>s.id==='0-destroyer-3')!.ap).toBe(1);expect(acting.state.queuedAttacks).toHaveLength(1);expect(acting.state.lastShot).toBeUndefined();
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState(),ids=d.movingShipIds as string[];return !ids.includes('0-destroyer-2')&&ids.includes('0-carrier');});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true));
 await page.locator('[data-ship="0-destroyer-2"]').click();await expect(page.locator('#action-sonar')).toBeEnabled();await page.locator('[data-ship="0-carrier"]').click();await expect(page.locator('#action-sonar')).toBeDisabled();
 await page.locator('#end-turn').click();const ending=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(ending.state.combatPhase).toBe('attack');expect(ending.state.lastShot).toBeUndefined();expect(ending.movingShipIds).toContain('0-carrier');
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false));await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.lastShot?.by===0,null,{timeout:35000});
 const firing=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(firing.movingShipIds).toEqual([]);expect(firing.state.own.find(s=>s.id==='0-destroyer-3')!.ap).toBe(1);expect(errors).toEqual([]);
 await fs.mkdir('artifacts/movement-concurrency',{recursive:true});await fs.writeFile('artifacts/movement-concurrency/input.json',JSON.stringify({errors,acting,ending,firing},null,2));
});
test('torpedo appears at launch coordinates immediately and attack reservation deducts AP exactly once',async({page})=>{
 test.setTimeout(80000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('airstrike');h.getState().world!.islands=[];h.refresh();});await ready(page);
 await page.locator('[data-ship="0-destroyer-1"]').click();await page.locator('#action-torpedo').click();const origin=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.id==='0-destroyer-1')!);await tile(page,origin.x+10,origin.z);await page.locator('#confirm-action').click();
 const launch=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(launch.state.torpedoes).toHaveLength(1);expect(launch.state.torpedoes![0]).toMatchObject({x:origin.x,z:origin.z});expect(launch.torpedoModels).toBe(1);expect(launch.friendlyTorpedoRoutes).toBe(1);expect(launch.state.queuedAttacks).toEqual([]);expect(launch.state.own.find(s=>s.id===origin.id)!.ap).toBe(origin.ap-1);
 await page.locator('#action-attack').click();await tile(page,25,25);await page.locator('#confirm-action').click();expect(await page.locator('#selected-ap').textContent()).toBe('2 / 4');
 await page.locator('#end-turn').click();await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.lastShot?.kind==='missile',null,{timeout:30000});const resolving=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(resolving.state.own.find(s=>s.id===origin.id)!.ap).toBe(2);expect(resolving.state.torpedoes![0]!.route!.length).toBe(5);expect(errors).toEqual([]);
 await fs.writeFile('artifacts/movement-concurrency/torpedo-ap.json',JSON.stringify({errors,launch,resolving},null,2));
});
test('shell and missile cameras follow actual projectile then frame the struck hull and surface pulses',async({page})=>{
 test.setTimeout(110000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('airstrike');const w=h.getState().world!;w.islands=[];const victim=w.ships.find(s=>s.id==='1-battleship-1')!;Object.assign(victim,{x:9,z:7});w.recon=[{team:0,carrierId:'0-carrier',center:{x:9,z:7},expiresAt:99}];h.refresh();h.seed(11);});await ready(page);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.command({type:'attack',shipId:'0-battleship-1',target:{x:9,z:7}});h.command({type:'attack',shipId:'0-destroyer-1',target:{x:9,z:7}});h.command({type:'end'});});
 const shots:any[]=[];for(const kind of ['missile','shell']){
  await page.waitForFunction(kind=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState() as any;return d.state.lastShot?.kind===kind&&d.combatCameraStage==='launch'&&d.combatCameraStageAge>.15;},kind,{timeout:40000});
  const launch=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState() as any);expect(launch.launchSmokeParticles).toBeGreaterThan(0);expect(launch.combatCameraLastCut).not.toBe('projectile-follow');await page.screenshot({path:`artifacts/movement-concurrency/${kind}-launch.png`});
  await page.waitForFunction(kind=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState() as any;return d.state.lastShot?.kind===kind&&d.combatCameraStage==='flight'&&d.projectiles.some((p:any)=>p.phase==='flight'&&p.remaining/p.duration<.58&&p.remaining/p.duration>.30);},kind,{timeout:40000});
  const flight=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState() as any),p=flight.projectiles[0];expect(flight.combatCameraStage).toBe('flight');expect(p.trailPoints).toBeGreaterThan(10);expect(Math.hypot(...p.position.map((v:number,i:number)=>v-flight.camera.position[i]))).toBeLessThan(2);
  await page.screenshot({path:`artifacts/movement-concurrency/${kind}-follow.png`});await page.waitForFunction(kind=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState() as any;return d.state.lastShot?.kind===kind&&d.combatCameraStage==='impact'&&d.combatCameraStageAge>.4;},kind,{timeout:25000});
  const impact=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState() as any);expect(impact.state.lastShot.hit).toBe(true);expect(impact.waterRings).toBeGreaterThan(0);expect(impact.shipDetail['1-battleship-1'].projectedPixels).toBeGreaterThan(150);await page.screenshot({path:`artifacts/movement-concurrency/${kind}-impact.png`});shots.push({launch,flight,impact});
 }
 expect(errors).toEqual([]);await fs.writeFile('artifacts/movement-concurrency/projectile-camera.json',JSON.stringify({errors,shots},null,2));
});
