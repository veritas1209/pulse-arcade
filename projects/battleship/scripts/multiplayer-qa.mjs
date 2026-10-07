import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const url=process.argv[2]||'http://127.0.0.1:5195',out=process.argv[3]||'artifacts/multiplayer';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),contexts=[],errors=[],checks=[];
async function player(blockStorage=false){
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:800}});contexts.push(context);
 if(blockStorage)await context.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage disabled','SecurityError');}}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('.ship-choice').first().waitFor();await page.locator('#mode-select').selectOption('online');return page;
}
try{
 const a=await player();let createRequests=0;
 a.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/battleship/rooms')createRequests++;});
 await a.locator('#join-room').click();await a.waitForTimeout(250);
 assert.equal(createRequests,0,'Empty join created a room');assert.equal(await a.locator('#room-code').isVisible(),false);checks.push('empty-join-rejected');
 let release;const gate=new Promise(resolve=>release=resolve);
 await a.route('**/api/battleship/rooms',async route=>{await gate;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'ABC234',token:'cancelled-fixture',player:0})});}catch{}});
 await a.locator('#create-room').click();await a.waitForTimeout(100);await a.locator('#mode-select').selectOption('pve');release();await a.waitForTimeout(350);
 assert.equal(await a.locator('body').getAttribute('data-mode'),'pve');assert.equal(await a.locator('#mode-select').inputValue(),'pve');assert.equal(await a.locator('#room-code').isVisible(),false);checks.push('cancelled-create-stays-pve');
 await a.unroute('**/api/battleship/rooms');await a.locator('#mode-select').selectOption('online');
 await a.locator('#create-room').click();await a.locator('#room-code').waitFor({state:'visible'});
 await a.waitForFunction(()=>document.getElementById('connection-label').textContent==='연결됨');
 const code=await a.locator('#room-code').textContent();const b=await player();
 await b.locator('#room-input').fill(code.toLowerCase());await b.locator('#join-room').click();
 await b.waitForFunction(()=>document.getElementById('connection-label').textContent==='연결됨');
 await a.locator('#start-game').click();await b.locator('#start-game').click();
 await a.waitForFunction(()=>document.body.dataset.phase==='battle');await b.waitForFunction(()=>document.body.dataset.phase==='battle');
 const ownCount=await a.locator('.ship-choice').count();assert.equal(ownCount,await b.locator('.ship-choice').count());assert.equal(ownCount,7);checks.push('two-player-ready');
 await a.locator('#end-turn').click();await b.waitForFunction(()=>!document.getElementById('end-turn').disabled);
 await b.reload();await b.waitForFunction(()=>document.body.dataset.phase==='battle'&&!document.getElementById('end-turn').disabled);checks.push('reload-reconnect');
 await b.locator('#end-turn').click();await a.waitForFunction(()=>!document.getElementById('end-turn').disabled);await a.screenshot({path:out+'/two-player-battle.png'});
 await a.locator('#help-toggle').click();await a.locator('#exit-action').click();await b.waitForFunction(()=>document.body.dataset.phase==='finished');checks.push('leave-notifies-opponent');
 const c=await player(true);await c.locator('#create-room').click();await c.waitForFunction(()=>document.getElementById('connection-label').textContent==='연결됨');assert.equal(await c.locator('#room-code').isVisible(),true);await c.locator('#help-toggle').click();await c.locator('#exit-action').click();checks.push('storage-disabled-room-works');
 assert.deepEqual(errors,[]);const report={ok:true,url,ownCount,checks,errors};await fs.writeFile(out+'/multiplayer-qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
