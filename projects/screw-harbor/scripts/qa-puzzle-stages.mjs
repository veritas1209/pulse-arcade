import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
await page.goto('http://127.0.0.1:4190/games/screw-harbor/?qa=1');
await page.waitForFunction(()=>window.__SCREW_HARBOR__);
const results=await page.evaluate(()=>{
 const qa=window.__SCREW_HARBOR__,rows=[];
 for(let stage=0;stage<qa.stageCount;stage++){
  qa.loadStage(stage);const p=qa.getPuzzle();
  for(const s of p.screws){if(!p.remove(s.id).ok)throw Error('Witness failed '+s.id);}
  rows.push({stage,screws:p.screws.length,colors:new Set(p.screws.map(s=>s.color)).size,status:p.status,bufferCapacity:p.bufferCapacity});
 }
 return rows;
});
await browser.close();await writeFile('artifacts/puzzle-stages.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
if(results.some(r=>r.status!=='won'||r.screws<150||r.colors!==5||r.bufferCapacity!==5))process.exitCode=1;
