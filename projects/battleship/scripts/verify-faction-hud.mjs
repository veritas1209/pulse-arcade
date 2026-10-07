import {chromium} from '@playwright/test';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
const bundle=(await readFile('dist/index.html','utf8')).match(/assets\/index-[^"]+\.js/)[0];const out='artifacts/faction-hud';await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],failures=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)failures.push([r.status(),r.url()]);});
try{
 await page.goto('http://127.0.0.1:4196/battleship/');await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__?.getState().texturesReady,{},{timeout:60000});
 await page.waitForTimeout(700);const setup=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());
 assert.equal(setup.healthBars,7);assert.equal(setup.overlayDrawCalls,2);assert.deepEqual(setup.healthOverlayPriority,{depthTest:false,depthWrite:false,renderOrder:1000000});
 const frame=await page.screenshot({path:out+'/packaged-fleet-1920.png'}),png=PNG.sync.read(frame);let bluePixels=0,nonSeaPixels=0;for(let i=0;i<png.data.length;i+=4){const [r,g,b]=png.data.subarray(i,i+3);if(r>=90&&r<=110&&g>=155&&g<=175&&b>=245)bluePixels++;if(Math.max(r,g,b)-Math.min(r,g,b)>30)nonSeaPixels++;}assert.ok(bluePixels>100,`Blue HUD missing: ${bluePixels}`);assert.ok(nonSeaPixels>10000);
 await page.locator('#start-game').click();await page.keyboard.press('Space');await page.waitForFunction(()=>!window.__THREE_GAME_TEST_HOOKS__.getState().camera.focusing,{},{timeout:30000});
 const near=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());const pivot=near.camera.target;assert.ok(near.fleetLabels.find(l=>l.id===near.selectedId).detailed);await page.screenshot({path:out+'/packaged-inspect-1920.png'});
 await page.mouse.move(960,460);await page.mouse.down();await page.mouse.move(1250,460,{steps:20});await page.mouse.up();await page.waitForTimeout(900);const orbit=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState().camera);assert.ok(Math.hypot(...orbit.target.map((n,i)=>n-pivot[i]))<.02);await page.mouse.wheel(0,-120);await page.waitForTimeout(600);const zoom=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState().camera);assert.ok(Math.hypot(...zoom.target.map((n,i)=>n-pivot[i]))<.02);assert.ok(zoom.distance<orbit.distance);
 const credit=await page.request.get('http://127.0.0.1:4196/battleship/credits/ship-marks.txt');assert.equal(credit.status(),200);assert.ok((await credit.text()).includes('CC BY 3.0'));
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 const report={build:bundle,inspection:{pivot,orbit,zoom},errors,failures,bluePixels,nonSeaPixels,setup:{labels:setup.fleetLabels,renderer:setup.renderer,priority:setup.healthOverlayPriority,overlayDrawCalls:setup.overlayDrawCalls},near:{labels:near.fleetLabels,renderer:near.renderer,priority:near.healthOverlayPriority},mobile:'excluded by user request'};
 await writeFile(out+'/packaged-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({errors,failures,bluePixels,setupLabels:setup.fleetLabels.length,drawn:setup.fleetLabels.filter(l=>l.drawn).length,nearWidth:near.fleetLabels.find(l=>l.id===near.selectedId).width,overlayDrawCalls:setup.overlayDrawCalls}));
}finally{await browser.close();}
