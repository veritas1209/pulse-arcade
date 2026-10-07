import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const [url='http://127.0.0.1:5296',label='before']=process.argv.slice(2),out='artifacts/near-camera';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(url);await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__);
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('damage'));await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__.getState().damagePreparation?.status==='ready'&&window.__THREE_GAME_TEST_HOOKS__.getState().damagePreparation?.pending===0,{},{timeout:45000});await page.waitForTimeout(1000);
const cdp=await page.context().newCDPSession(page);const measurements={};
async function measure(name,pan=false){await page.waitForTimeout(1000);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
const frames=await page.evaluate(pan=>new Promise(resolve=>{const c=document.getElementById('game-canvas'),r=c.getBoundingClientRect(),x=r.width*.5,y=r.height*.5;if(pan)c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,pointerType:'mouse',button:2,buttons:2,clientX:x,clientY:y,bubbles:true}));let prev=performance.now(),a=[];function tick(now){if(pan)c.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:2,clientX:x+Math.sin(a.length*.12)*25,clientY:y+Math.cos(a.length*.12)*15,bubbles:true}));a.push(now-prev);prev=now;if(a.length<150)requestAnimationFrame(tick);else{if(pan)c.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,pointerType:'mouse',button:2,buttons:0,clientX:x,clientY:y,bubbles:true}));a.sort((x,y)=>x-y);resolve({mean:a.reduce((x,y)=>x+y,0)/a.length,p50:a[75],p95:a[142],fps:1000/(a.reduce((x,y)=>x+y,0)/a.length)})}}requestAnimationFrame(tick)}),pan);
const {profile}=await cdp.send('Profiler.stop');await fs.writeFile(`${out}/${label}-${name}-cpu.json`,JSON.stringify(profile));const counts=new Map();for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
const hot=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,count:counts.get(n.id)??0})).sort((a,b)=>b.count-a.count).slice(0,15);
const state=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());measurements[name]={frames,hot,diagnostics:state};await page.screenshot({path:`${out}/${label}-${name}.png`});console.log(name,JSON.stringify({frames,hot:hot.slice(0,8),camera:state.camera,renderer:state.renderer}));}
await measure('far');
const cell=await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__,s=h.getState().state.own.find(s=>s.kind==='carrier');return {x:s.x,z:s.z};});
await page.evaluate(c=>window.__THREE_GAME_TEST_HOOKS__.focus(c),cell);await page.waitForTimeout(1600);
for(let i=0;i<160;i++){const p=await page.evaluate(c=>window.__THREE_GAME_TEST_HOOKS__.project(c),cell);await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-90);await page.waitForTimeout(25);const s=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());if(s.camera.position[1]<2.1)break;}
await measure('near');await measure('near-pan',true);await fs.writeFile(`${out}/${label}.json`,JSON.stringify({url,viewport:{width:2560,height:1440},measurements,errors},null,2));await browser.close();if(errors.length)process.exitCode=1;
