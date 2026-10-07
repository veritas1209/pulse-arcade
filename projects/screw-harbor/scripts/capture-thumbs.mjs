import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:480,height:844}});await page.goto('http://127.0.0.1:4188/?qa=1');await page.waitForFunction(()=>window.__SCREW_HARBOR__);await mkdir('artifacts/thumb-sources',{recursive:true});
for(let i=0;i<await page.evaluate(()=>window.__SCREW_HARBOR__.stageCount);i++){await page.evaluate(n=>window.__SCREW_HARBOR__.loadStage(n),i);await page.waitForTimeout(100);await page.locator('canvas').screenshot({path:`artifacts/thumb-sources/${i+1}.png`});}
await browser.close();
