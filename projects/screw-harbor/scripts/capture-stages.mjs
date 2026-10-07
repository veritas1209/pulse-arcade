import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],rows=[];
page.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/large-structures',{recursive:true});await mkdir('artifacts/thumb-sources',{recursive:true});
await page.goto('http://127.0.0.1:4188/?qa=1');await page.waitForFunction(()=>window.__SCREW_HARBOR__);
await page.waitForFunction(()=>window.__SCREW_HARBOR__.getDiagnostics().materials.ready);
const count=await page.evaluate(()=>window.__SCREW_HARBOR__.stageCount);
const only=process.argv.find(value=>value.startsWith('--stages='));
const stages=only?only.split('=')[1].split(',').map(Number):Array.from({length:count},(_,i)=>i);
for(const i of stages) {
 const row=await page.evaluate(i=>{
  const start=performance.now(),qa=window.__SCREW_HARBOR__;qa.loadStage(i);
  window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(true);window.__THREE_GAME_TEST_HOOKS__.advanceFrames(1);
  const d=qa.getDiagnostics(),s=qa.getStructure();
  return {stage:i,name:s.name,screws:d.remaining,parts:s.parts.length,radius:s.radius,calls:d.renderer.calls,triangles:d.renderer.triangles,buildMs:performance.now()-start};
 },i);
 rows.push(row);console.log(JSON.stringify(row));
 const pixels=await page.evaluate(()=>{window.__THREE_GAME_TEST_HOOKS__.advanceFrames(1);return document.querySelector('canvas').toDataURL('image/png').split(',')[1];});
 await writeFile(`artifacts/thumb-sources/${i+1}.png`,Buffer.from(pixels,'base64'));
 if(i===0||i>=12)await page.screenshot({path:`artifacts/large-structures/stage-${i}.png`});
}
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__SCREW_HARBOR__.loadStage(17));
await page.screenshot({path:'artifacts/large-structures/mobile-carrier.png'});
await writeFile(`artifacts/large-structures/metrics${only?'-stages-'+stages.join('-'):''}.json`,JSON.stringify({rows,errors},null,2));await browser.close();
if(errors.length)process.exitCode=1;
