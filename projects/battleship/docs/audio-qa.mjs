import {chromium} from '@playwright/test';

const base=process.argv[2]??'http://127.0.0.1:5195/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage();
await page.goto(base);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.evaluate(async()=>{
 const {BattleAudio}=await import('/src/audio.ts');
 const audio=new BattleAudio();
 Object.assign(window,{qaAudio:audio,qaReady:new Promise(resolve=>document.body.addEventListener('click',()=>resolve(audio.unlock()),{once:true}))});
});
const unlockStarted=Date.now();
await page.locator('body').click();
await page.evaluate(()=>window.qaReady);
const unlockMs=Date.now()-unlockStarted;
const report=await page.evaluate(async()=>{
 const audio=window.qaAudio;
 const initial=audio.diagnostics();
 const ctx=audio.ctx,analyser=ctx.createAnalyser();analyser.fftSize=2048;audio.compressor.disconnect();audio.compressor.connect(analyser);analyser.connect(ctx.destination);
 const shot=n=>({x:2,z:3,by:0,sequence:n,hit:true,damage:2,blocked:false,halved:false});
 audio.startShot(shot(101),'battleship');audio.startShot(shot(102),'destroyer');
 await new Promise(resolve=>setTimeout(resolve,40));
 const samples=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(samples);const sampleDeviation=Math.max(...samples.map(value=>Math.abs(value-128)));
 const twoShots=audio.diagnostics();audio.finishShot(shot(101),'battleship');const oneShot=audio.diagnostics();audio.finishShot(shot(102),'destroyer');
 audio.syncActivity({movingShips:2,fighters:1,burningShips:2,active:true});for(let i=0;i<100;i++)audio.syncActivity({movingShips:2,fighters:1,burningShips:2,active:true});
 const loopsAfter100=audio.diagnostics();audio.toggle();const muted=audio.diagnostics();audio.toggle();
 audio.suspend();await new Promise(resolve=>setTimeout(resolve,50));const suspended=ctx.state;audio.resume();await new Promise(resolve=>setTimeout(resolve,80));const resumed=ctx.state;
 audio.startShot(shot(103),'destroyer');audio.syncActivity({movingShips:0,fighters:0,burningShips:0,active:false});await new Promise(resolve=>setTimeout(resolve,650));const inactive=audio.diagnostics();
 audio.dispose();await new Promise(resolve=>setTimeout(resolve,50));const disposed={...audio.diagnostics(),contextState:ctx.state};
 return {initial,twoShots,oneShot,loopsAfter100,muted,suspended,resumed,inactive,disposed,sampleDeviation};
});
await browser.close();
const checks={decoded:report.initial.loaded.length===22&&Object.keys(report.initial.errors).length===0,nonzeroSamples:report.sampleDeviation>0,twoShots:report.twoShots.shots===2,finishOneRetainsOther:report.oneShot.shots===1,loopsDoNotStack:report.loopsAfter100.loops.length===6&&report.loopsAfter100.voices===6,muted:report.muted.muted===true,suspendResume:report.suspended==='suspended'&&report.resumed==='running',inactiveCleanup:report.inactive.shots===0&&report.inactive.loops.length===0,dispose:report.disposed.voices===0&&report.disposed.contextState==='closed'};
console.log(JSON.stringify({checks,unlockMs,report,pageErrors:errors},null,2));
if(errors.length||Object.values(checks).some(value=>!value))process.exitCode=1;
