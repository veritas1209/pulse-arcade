import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const mobile=process.argv.includes('--mobile');
const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
await mkdir('artifacts',{recursive:true});
await page.goto('http://127.0.0.1:4190/games/screw-harbor/?qa=1');
await page.waitForFunction(()=>window.__SCREW_HARBOR__);
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setReducedMotion(true));
const results=[];
const only=process.argv.find(v=>v.startsWith('--stages='));
const stages=only?only.split('=')[1].split(',').map(Number):Array.from({length:await page.evaluate(()=>window.__SCREW_HARBOR__.stageCount)},(_,i)=>i);
for(const stage of stages){
  await page.evaluate(i=>window.__SCREW_HARBOR__.loadStage(i),stage);
  const ids=await page.evaluate(()=>window.__SCREW_HARBOR__.getPuzzle().screws.map(s=>s.id));
  let clicked=0, failure=null;
  for(const id of ids){
    const target=await page.evaluate(id=>{
      const qa=window.__SCREW_HARBOR__;
      window.__THREE_GAME_TEST_HOOKS__.advanceFrames(10);
      if(!qa.viewScrew(id)) return null;
      return qa.getDiagnostics().screws.find(s=>s.id===id);
    },id);
    if(!target){failure={id,reason:'not geometrically reachable'};break;}
    if(mobile) await page.touchscreen.tap(target.x,target.y); else await page.mouse.click(target.x,target.y);
    const accepted=await page.evaluate(id=>{
      const qa=window.__SCREW_HARBOR__;
      window.__THREE_GAME_TEST_HOOKS__.advanceFrames(10);
      return qa.getPuzzle().removed.has(id);
    },id);
    if(!accepted){failure={id,reason:'real click did not remove expected screw',target};break;}
    clicked++;
    if(clicked===Math.floor(ids.length/2)) await page.screenshot({path:`artifacts/ad-active-${mobile?'mobile':'desktop'}-${stage}.png`});
  }
  const d=await page.evaluate(()=>window.__SCREW_HARBOR__.getDiagnostics());
  if(failure) await page.screenshot({path:`artifacts/ad-failure-${mobile?'mobile':'desktop'}-${stage}.png`});
  const row={stage,total:ids.length,clicked,failure,status:d.state,calls:d.renderer.calls,triangles:d.renderer.triangles};
  results.push(row);console.log(JSON.stringify(row));
}
await writeFile(`artifacts/input-bot${mobile?'-mobile':''}${only?'-stages-'+stages.join('-'):''}.json`,JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
await browser.close();
if(errors.length||results.some(r=>r.status!=='won'||r.failure)) process.exitCode=1;
