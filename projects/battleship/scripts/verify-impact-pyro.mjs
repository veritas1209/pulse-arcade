import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:19096',out=process.argv[3]??'artifacts/impact-package-shot';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local fixture hooks are disabled publicly; use scripts/browser-qa.mjs for public verification');
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(url);await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__;h.setState('airstrike');const w=h.getState().world;w.islands=[];const v=w.ships.find(s=>s.id==='1-battleship-1');Object.assign(v,{x:9,z:7});w.recon=[{team:0,carrierId:'0-carrier',center:{x:9,z:7},expiresAt:99}];h.refresh();h.seed(11);});
 await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__.getState();return d.texturesReady&&!d.presentationBusy;});
 const label=await page.locator('#action-repair strong').innerText();if(label!=='대미지 컨트롤')throw new Error('Damage-control label mismatch');
 const labelFits=await page.locator('#action-repair strong').evaluate(el=>{const t=el.getBoundingClientRect(),b=el.closest('button').getBoundingClientRect();return t.left>=b.left&&t.right<=b.right&&t.top>=b.top&&t.bottom<=b.bottom;});if(!labelFits)throw new Error('Damage-control label overflows');
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__;h.command({type:'attack',shipId:'0-destroyer-1',target:{x:9,z:7}});h.command({type:'end'});});
 await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__.getState();return d.ciwsTracers>0&&d.ciwsBatteries.some(b=>b.id.startsWith('1-battleship-1:'));},{},{timeout:60000});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));const defense=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());await page.screenshot({path:out+'/ciws.png'});if(defense.interceptSmokeCount!==0)throw new Error('Hit missile must not become an interception');await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
 await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__.getState();return d.combatCameraStage==='impact'&&d.combatCameraStageAge>.35&&d.impactVolume.active>0;},{},{timeout:60000});
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));await page.screenshot({path:out+'/missile-impact.png'});const d=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());
 if(d.impactFlipbook.active!==0||d.impactVolume.steps!==48)throw new Error('Incorrect impact technique');if(d.triangles>750000||d.calls>300)throw new Error('Render budget exceeded');if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(out+'/report.json',JSON.stringify({url,errors,label,labelFits,defense,state:d},null,2));console.log(JSON.stringify({errors,label,labelFits,ciwsBatteries:defense.ciwsBatteries.length,ciwsTracers:defense.ciwsTracers,volume:d.impactVolume,calls:d.calls,triangles:d.triangles}));
}finally{await browser.close();}
