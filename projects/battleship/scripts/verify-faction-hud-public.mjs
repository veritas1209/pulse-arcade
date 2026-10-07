import {chromium} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
const bundle=(await readFile('dist/index.html','utf8')).match(/assets\/index-[^"]+\.js/)[0].split('/').pop();const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080},ignoreHTTPSErrors:true}),errors=[],failed=[];let bundleLoaded=false;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);if(r.url().includes(bundle)&&r.status()===200)bundleLoaded=true;});
try{
 await page.goto('https://222.96.173.194/games/battleship/',{waitUntil:'networkidle',timeout:60000});await page.locator('#start-game').waitFor({timeout:40000});await page.waitForTimeout(2000);assert.ok(bundleLoaded);
 const bytes=await page.screenshot({path:'artifacts/faction-hud/public-fleet-1920.png'}),png=PNG.sync.read(bytes);let bluePixels=0;for(let i=0;i<png.data.length;i+=4)if(png.data[i]>=90&&png.data[i]<=110&&png.data[i+1]>=155&&png.data[i+1]<=175&&png.data[i+2]>=245)bluePixels++;assert.ok(bluePixels>100);
 await page.locator('#start-game').click();await page.keyboard.press('Space');await page.waitForTimeout(5000);await page.screenshot({path:'artifacts/faction-hud/public-inspect-1920.png'});
 const credit=await page.request.get('https://222.96.173.194/games/battleship/credits/ship-marks.txt');assert.equal(credit.status(),200);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);const report={url:page.url(),bundleLoaded,bluePixels,errors,failed,viewport:{width:1920,height:1080},mobile:'excluded by user request'};await writeFile('artifacts/faction-hud/public-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
