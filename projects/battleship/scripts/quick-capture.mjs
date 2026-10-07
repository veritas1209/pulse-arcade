import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
await mkdir('artifacts/qa',{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5195');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.waitForTimeout(1000);
await page.screenshot({path:'artifacts/qa/desktop-placement.png'});
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('damage'));await page.waitForTimeout(3000);await page.screenshot({path:'artifacts/qa/desktop-damage.png'});
const d=await page.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__);
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('placement'));await page.waitForTimeout(800);await page.screenshot({path:'artifacts/qa/mobile-placement.png'});
await writeFile('artifacts/qa/capture.json',JSON.stringify({errors,diagnostics:d},null,2));console.log(JSON.stringify({errors,diagnostics:d}));await browser.close();

