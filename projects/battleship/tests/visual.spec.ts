import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';
test('ocean islands and ships render; orbit drag cannot issue actions',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.locator('#start-game').click();
 await page.waitForTimeout(1100);
 const png=PNG.sync.read(await page.locator('#game-canvas').screenshot()),colors=new Set<string>();
 for(let p=0;p<png.width*png.height;p+=127){const i=p*4;colors.add((png.data[i]>>4)+','+(png.data[i+1]>>4)+','+(png.data[i+2]>>4));}
 expect(colors.size).toBeGreaterThan(30);
 const before=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.revision);
 const canvas=await page.locator('#game-canvas').boundingBox();
 await page.mouse.move(canvas!.width*.5,canvas!.height*.42);await page.mouse.down();await page.mouse.move(canvas!.width*.65,canvas!.height*.51,{steps:10});await page.mouse.up();await page.mouse.wheel(0,-500);
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.revision)).toBe(before);
 await page.screenshot({path:'artifacts/shared-map/'+info.project.name+'-orbit.png'});
 expect(errors).toEqual([]);
});

