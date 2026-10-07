import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],rows=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await mkdir('artifacts/fidelity',{recursive:true});
await page.goto('http://127.0.0.1:4188/?qa=1');
await page.waitForFunction(()=>window.__SCREW_HARBOR__?.getDiagnostics().materials.ready);
for(const stage of [12,13,16,17,18,19]){
 await page.evaluate(i=>{
  const qa=window.__SCREW_HARBOR__;qa.loadStage(i);
  window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
  window.__THREE_GAME_TEST_HOOKS__.advanceFrames(1);
 },stage);
 await page.screenshot({path:`artifacts/fidelity/stage-${stage}-exterior.png`});
 const row=await page.evaluate(()=>window.__SCREW_HARBOR__.getDiagnostics());
 rows.push({stage,renderer:row.renderer,materials:row.materials});
 if(stage===13){
  await page.evaluate(()=>{
   const qa=window.__SCREW_HARBOR__;
   qa.setCameraPose([0,30,50],[0,3,0]);qa.setCameraPose([0,-30,50],[0,3,0]);
   qa.setCameraPose([13,-13,17],[0,3,0]);
  });
  await page.screenshot({path:'artifacts/fidelity/liberty-bottom.png'});
 }else{
  await page.evaluate(()=>{
   const qa=window.__SCREW_HARBOR__;
   for(const p of qa.getStructure().parts)p.group.visible=p.id.includes('-interior-');
   const c=qa.getStructure().center,r=qa.getStructure().radius;
   qa.setCameraPose([c.x+r*1.08,c.y+r*1.15,c.z+r*1.55],[c.x,c.y-1,c.z]);
   window.__THREE_GAME_TEST_HOOKS__.advanceFrames(1);
  });
  await page.screenshot({path:`artifacts/fidelity/stage-${stage}-interior-inspection.png`});
 }
}
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>{window.__SCREW_HARBOR__.loadStage(17);window.__THREE_GAME_TEST_HOOKS__.advanceFrames(1);});
await page.screenshot({path:'artifacts/fidelity/carrier-mobile.png'});
await writeFile('artifacts/fidelity/visual-metrics.json',JSON.stringify({rows,errors,interiorFixtures:'Exterior shell hidden only for inspecting internal authored geometry; actual input bot separately verifies full dismantling.'},null,2));
await browser.close();if(errors.length)process.exitCode=1;
