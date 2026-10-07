import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome'});const p=await browser.newPage({ignoreHTTPSErrors:true});await p.goto('https://222.96.173.194/');
console.log(await p.evaluate(async()=>{
const h=await(await fetch('/api/battleship/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
const states=[];const ws=new WebSocket('wss://'+location.host+'/ws/battleship/'+h.code+'?token='+h.token);
const next=()=>new Promise((r,j)=>{const timeout=setTimeout(()=>j(Error('timeout')),8000);ws.addEventListener('message',e=>{clearTimeout(timeout);r(JSON.parse(e.data))},{once:true});});
let before=(await next()).state;
const aJoin=next();const g=await(await fetch('/api/battleship/rooms/'+h.code+'/join',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();await aJoin;const aConnected=next();const wb=new WebSocket('wss://'+location.host+'/ws/battleship/'+g.code+'?token='+g.token);const bConnected=new Promise(r=>wb.addEventListener('message',r,{once:true}));await Promise.all([aConnected,bConnected]);
const fleet=before.own.map(s=>({id:s.id,x:s.x,z:s.z,heading:s.heading}));fleet[1].x=6;fleet[1].z=6;
const response=next();ws.send(JSON.stringify({type:'placement',fleet}));const after=await response;wb.close();ws.close();
return {before:before.own.map(s=>[s.id,s.x,s.z]),after:after.state?.own.map(s=>[s.id,s.x,s.z]),error:after.message};
}));await browser.close();
