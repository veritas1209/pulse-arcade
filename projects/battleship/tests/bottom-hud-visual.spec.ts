import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('PC bottom docks, closed dropdown log, MAP and live compass fit at three desktop sizes',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await mkdir('artifacts/bottom-hud',{recursive:true});
 for(const [width,height] of [[1280,720],[1920,1080],[2560,1440]]){
  await page.setViewportSize({width,height});await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('hud-fixture'));
  await expect(page.locator('#map-title')).toHaveText('MAP');await expect(page.locator('.log-panel')).not.toHaveAttribute('open');await expect(page.locator('#battle-log')).not.toBeVisible();await expect(page.locator('.compass-hud')).toBeVisible();
  const boxes=await page.evaluate(()=>Object.fromEntries(['.fleet-rail','.shared-fleet-selector','.order-dock','.intel-rail','#tactical-map'].map(selector=>{const b=document.querySelector(selector)!.getBoundingClientRect();return[selector,{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}];})));
  for(const box of Object.values(boxes)){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);expect(box.bottom).toBeLessThanOrEqual(height);}
  expect(boxes['.fleet-rail']!.bottom).toBeGreaterThan(height-24);expect(boxes['.intel-rail']!.bottom).toBeGreaterThan(height-24);expect(boxes['.fleet-rail']!.right).toBeLessThan(boxes['.order-dock']!.x);expect(boxes['.order-dock']!.right).toBeLessThan(boxes['.intel-rail']!.x);expect(boxes['#tactical-map']!.w).toBeGreaterThan(width===1280?230:310);
  await page.locator('.log-panel summary').click();await expect(page.locator('#battle-log')).toBeVisible();await page.locator('.log-panel summary').click();
  await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {focusing:boolean}).focusing),{timeout:15000}).toBe(false);
  const c=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {position:number[];target:number[]});const heading=((Math.atan2(c.target[0]-c.position[0],c.position[2]-c.target[2])*180/Math.PI)%360+360)%360;
  const readout=await page.locator('#compass-heading').textContent();expect(Math.abs(Number(readout!.slice(0,3))-Math.round(heading)%360)).toBeLessThanOrEqual(1);await page.screenshot({path:`artifacts/bottom-hud/f-carrier-${width}.png`});
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('damage'));const b=await page.locator('#tactical-map').boundingBox();await page.mouse.click(b!.x+25.5*b!.width/30,b!.y+25.5*b!.height/30);await expect(page.locator('#enemy-panel')).toBeVisible();await expect(page.locator('.log-panel')).not.toBeVisible();const inspector=await page.locator('.intel-rail').boundingBox();expect(inspector!.y).toBeGreaterThanOrEqual(0);expect(inspector!.y+inspector!.height).toBeLessThanOrEqual(height);await page.locator('#enemy-close').click();await expect(page.locator('.log-panel')).toBeVisible();
 }
 expect(errors).toEqual([]);
});
