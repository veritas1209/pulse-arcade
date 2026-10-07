import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:4190/games/screw-harbor/?qa=1');await page.waitForFunction(()=>window.__SCREW_HARBOR__);
const found=await page.evaluate(()=>{
 const qa=window.__SCREW_HARBOR__;const result=[];
 for(let stage=0;stage<12;stage++){
  qa.loadStage(stage);
  for(const s of qa.getPuzzle().screws){const blocker=qa.getExtractionBlocker(s.id);if(blocker&&qa.viewScrew(s.id)){result.push({stage,id:s.id,blocker,point:qa.getDiagnostics().screws.find(v=>v.id===s.id)});break;}}
  if(result.length)break;
 }
 return result;
});console.log(JSON.stringify(found));await browser.close();
