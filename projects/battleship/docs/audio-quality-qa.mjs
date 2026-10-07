import {chromium} from '@playwright/test';
import ts from 'typescript';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('.');
const source=(await readFile(resolve(root,'src/audio.ts'),'utf8')).replace('import.meta.env.BASE_URL',JSON.stringify('/'));
const module=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const server=createServer(async(req,res)=>{try{
 let data,type='text/html';const path=req.url.split('?')[0];
 if(path==='/')data=Buffer.from('<!doctype html><button id="unlock">Unlock audio</button><script type="module">import {BattleAudio} from "/audio.js";window.qaAudio=new BattleAudio();document.querySelector("button").onclick=()=>{window.qaReady=window.qaAudio.unlock();};</script>');
 else if(path==='/audio.js'){data=Buffer.from(module);type='text/javascript';}
 else if(path.startsWith('/audio/')){data=await readFile(resolve(root,'public',path.slice(1)));type='audio/wav';}
 else{res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',type);res.setHeader('Content-Length',data.length);res.end(data);
 }catch(error){res.statusCode=500;res.end(String(error));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
let report,errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.qaAudio);
 const before=Date.now();await page.locator('#unlock').click();await page.evaluate(()=>window.qaReady);const unlockMs=Date.now()-before;
 report=await page.evaluate(async unlockMs=>{
  const audio=window.qaAudio,ctx=audio.ctx,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const initial=audio.diagnostics();
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;audio.compressor.disconnect();audio.compressor.connect(analyser);analyser.connect(ctx.destination);
  const sample=()=>{const x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);return {peak:Math.max(...x.map(Math.abs)),rms:Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length)};};
  const shot=(sequence,kind='shell',extra={})=>({x:14,z:14,by:0,sequence,kind,source:{x:11,z:11},hit:true,damage:2,blocked:false,halved:false,...extra});
  audio.startShot(shot(101),'battleship');audio.startShot(shot(102,'missile'),'destroyer');
  const flights={shell:audio.shots.get(101)?.source.buffer===audio.buffers.get('cannonFlight'),missile:audio.shots.get(102)?.source.buffer===audio.buffers.get('missileFlight')};const twoShots=audio.diagnostics();
  audio.finishShot(shot(101),'battleship');const oneShot=audio.diagnostics();audio.finishShot(shot(102,'missile'),'destroyer');const beforeDuplicate=audio.sources.size;audio.finishShot(shot(102,'missile'),'destroyer');const duplicateDidNotReplay=audio.sources.size===beforeDuplicate;
  // A sequence can be reused after a fast restart while its first preload callback is pending.
  await wait(100);const loaded=audio.loading,cachedCannon=audio.buffers.get('cannonFlight'),cachedMissile=audio.buffers.get('missileFlight');let release;
  audio.loading=new Promise(resolve=>{release=resolve;});audio.buffers.delete('cannonFlight');audio.buffers.delete('missileFlight');
  audio.startShot(shot(105,'missile'),'destroyer');audio.startShot(shot(105,'missile'),'destroyer');
  audio.buffers.set('cannonFlight',cachedCannon);audio.buffers.set('missileFlight',cachedMissile);release();await wait(30);
  const deferredSequenceReuse=[...audio.sources].filter(v=>v.source.loop&&v.source.buffer===cachedMissile).length===1;audio.finishShot(shot(105,'missile'),'destroyer');audio.loading=loaded;
  for(let i=0;i<100;i++)audio.syncActivity({movingShips:5,fighters:4,burningShips:3,torpedoes:3,active:true});
  const activity=audio.diagnostics();audio.sink({x:14,z:14});audio.torpedoLaunch({x:11,z:11});audio.sonar({x:12,z:11});audio.finishShot(shot(103,'shell',{hit:false}),'battleship');audio.finishShot(shot(104,'missile',{blocked:true}),'destroyer');
  let peak=0,rms=0;for(let i=0;i<20;i++){await wait(25);const s=sample();peak=Math.max(peak,s.peak);rms=Math.max(rms,s.rms);}
  audio.syncListener([0,100,0],[0,0,0]);await wait(350);const l=ctx.listener;const listener=[l.forwardX.value,l.forwardY.value,l.forwardZ.value,l.upX.value,l.upY.value,l.upZ.value];audio.syncListener([0,100,0],[0,100,0]);await wait(150);const coincident=[l.forwardX.value,l.forwardY.value,l.forwardZ.value,l.upX.value,l.upY.value,l.upZ.value];
  audio.toggle();await wait(500);const muted={...audio.diagnostics(),sample:sample()};audio.toggle();audio.suspend();await wait(40);const suspended=ctx.state;audio.resume();await wait(50);const resumed=ctx.state;
  audio.syncActivity({movingShips:0,fighters:0,burningShips:0,torpedoes:0,active:false});await wait(700);const inactive=audio.diagnostics();audio.dispose();await wait(30);const disposed={...audio.diagnostics(),contextState:ctx.state};
  return {unlockMs,initial,flights,twoShots,oneShot,duplicateDidNotReplay,deferredSequenceReuse,activity,peak,rms,listener,coincident,muted,suspended,resumed,inactive,disposed};
 },unlockMs);
}finally{await browser.close();server.close();}
const checks={decoded:report.initial.loaded.length===22&&Object.keys(report.initial.errors).length===0,weaponFlights:report.flights.shell&&report.flights.missile,shotOwnership:report.twoShots.shots===2&&report.oneShot.shots===1,duplicateResolution:report.duplicateDidNotReplay,deferredSequenceReuse:report.deferredSequenceReuse,loopsDoNotStack:report.activity.loops.length===7&&report.activity.voices===7,headroom:report.peak>0.01&&report.peak<.98&&report.rms>.001,listener:report.listener.every(Number.isFinite)&&report.coincident.every(Number.isFinite)&&Math.abs(report.listener.slice(0,3).reduce((s,v,i)=>s+v*report.listener[i+3],0))<.01,mute:report.muted.muted&&report.muted.sample.peak<.003,suspendResume:report.suspended==='suspended'&&report.resumed==='running',inactive:report.inactive.loops.length===0&&report.inactive.shots===0,dispose:report.disposed.activeSources===0&&report.disposed.voices===0&&report.disposed.contextState==='closed',noPageErrors:errors.length===0};
const result={checks,report,pageErrors:errors};console.log(JSON.stringify(result,null,2));await mkdir('artifacts/audio',{recursive:true});await writeFile('artifacts/audio/quality-runtime.json',JSON.stringify(result,null,2)+'\n');if(Object.values(checks).some(v=>!v))process.exitCode=1;
