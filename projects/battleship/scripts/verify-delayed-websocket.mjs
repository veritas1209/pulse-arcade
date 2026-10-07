import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const [url='https://222.96.173.194/',out='artifacts/delayed-websocket.json']=process.argv.slice(2);
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({ignoreHTTPSErrors:true});
try{
 await page.goto(url);const result=await page.evaluate(async()=>{
  const post=async path=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
  const owner=await post('/api/battleship/rooms'),urlFor=p=>`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/battleship/${p.code}?token=${p.token}`;
  const sockets=[],closes=[],states=[[],[]];
  function connect(info,index){const ws=new WebSocket(urlFor(info));sockets.push(ws);ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')states[index].push(m.state);});ws.addEventListener('close',e=>closes.push({index,code:e.code}));return ws;}
  const wait=async pred=>{const deadline=performance.now()+10000;while(!pred()){if(performance.now()>deadline||closes.length)throw Error('Socket closed or timed out '+JSON.stringify(closes));await new Promise(r=>setTimeout(r,20));}};
  try{
   const a=connect(owner,0);await wait(()=>states[0].length);const guest=await post(`/api/battleship/rooms/${owner.code}/join`),b=connect(guest,1);await wait(()=>states[0].at(-1).connected.every(Boolean)&&states[1].length);
   // The server sends a control PING at 20 seconds. The original compressed
   // connection rejected the first TEXT sent after Chrome's control PONG.
   await new Promise(r=>setTimeout(r,23000));
   const before=states[0].at(-1),fleet=before.own.map(s=>({id:s.id,x:s.x,z:s.z,heading:s.heading}));fleet.find(s=>s.id==='0-destroyer-1').x=6;fleet.find(s=>s.id==='0-destroyer-1').z=6;
   a.send(JSON.stringify({type:'placement',fleet}));await wait(()=>states[0].at(-1).own.some(s=>s.id==='0-destroyer-1'&&s.x===6&&s.z===6));
   return {passed:true,delaySeconds:23,extensions:sockets.map(ws=>ws.extensions),sameSocketsOpen:sockets.every(ws=>ws.readyState===WebSocket.OPEN),closes,revisionBefore:before.revision,revisionAfter:states[0].at(-1).revision,placement:states[0].at(-1).own.find(s=>s.id==='0-destroyer-1')};
  }finally{for(const ws of sockets)ws.close();}
 });assert.deepEqual(result.extensions,['','']);assert.equal(result.sameSocketsOpen,true);assert.deepEqual(result.closes,[]);await fs.mkdir(out.substring(0,out.lastIndexOf('/')),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
