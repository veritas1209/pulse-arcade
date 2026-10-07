import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.argv[2]||'http://127.0.0.1:5195',out=process.argv[3]||'artifacts/desktop-fleet';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),errors=[],report={url,poses:[],resolutions:[],errors};
try{
 for(const [width,height,dpr] of [[2560,1440,1],[1920,1080,2]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__);await page.waitForFunction(()=>window.__THREE_GAME_DIAGNOSTICS__?.texturesReady);
  const h=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());
  assert.equal(h.resolution.drawingBufferWidth,width*dpr);assert.equal(h.resolution.drawingBufferHeight,height*dpr);report.resolutions.push(h.resolution);
  if(dpr===1){
   const cell=await page.evaluate(()=>{const ship=window.__THREE_GAME_TEST_HOOKS__.getState().state.own.find(s=>s.kind==='carrier');return{x:ship.x,z:ship.z};});
   await page.evaluate(c=>window.__THREE_GAME_TEST_HOOKS__.focus(c),cell);await page.waitForTimeout(1800);
   for(const [label,amount] of [['low-distance',800],['transition',-500],['close',-1100],['return',1400]]){
    const point=await page.evaluate(c=>window.__THREE_GAME_TEST_HOOKS__.project(c),cell);await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,amount);await page.waitForTimeout(900);
    const state=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());report.poses.push({label,camera:state.camera,ships:state.shipDetail,renderer:state.renderer});await page.screenshot({path:out+'/'+label+'.png'});
   }
   assert.ok(report.poses.some(p=>p.ships['0-carrier'].low));assert.ok(report.poses.some(p=>!p.ships['0-carrier'].low));
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,resolutions:report.resolutions,poses:report.poses.map(p=>({label:p.label,carrier:p.ships['0-carrier']})),errors}));
}finally{await browser.close();}
