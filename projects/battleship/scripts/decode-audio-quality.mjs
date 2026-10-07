import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const dir='C:/tmp/battleship-audio-sources';
const sources=[['sonar.mp3','https://cdn.freesound.org/previews/493/493162_9159316-hq.mp3'],['rocket.mp3','https://cdn.freesound.org/previews/211/211617_71257-hq.mp3'],['hull.mp3','https://cdn.freesound.org/previews/514/514306_4984902-hq.mp3'],['bubbles.mp3','https://cdn.freesound.org/previews/267/267223_3112522-hq.mp3']];
await mkdir(dir,{recursive:true});
for(const [name,url] of sources){const r=await fetch(url);if(!r.ok)throw Error(`${name}: ${r.status}`);await writeFile(join(dir,name),Buffer.from(await r.arrayBuffer()));}
const server=createServer(async(req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Offline audio decode</title>');return;}try{res.end(await readFile(join(dir,req.url.slice(1))));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
try{const page=await browser.newPage();await page.goto(base);for(const file of (process.argv.length>2?process.argv.slice(2):['rocket','hull','bubbles','cannon','ship-engine','splash','fire','metal','jet','ocean','sonar'])){
const result=await page.evaluate(async file=>{const ctx=new OfflineAudioContext(1,1,32000),b=await ctx.decodeAudioData(await fetch(`/${file}.mp3`).then(r=>r.arrayBuffer()));return {rate:b.sampleRate,channels:Array.from({length:b.numberOfChannels},(_,i)=>Array.from(b.getChannelData(i).slice(0,b.sampleRate*65)))};},file);
await writeFile(join(dir,file+'.json'),JSON.stringify(result));console.log(file,result.rate,result.channels[0].length/result.rate);
}}finally{await browser.close();server.close();}
