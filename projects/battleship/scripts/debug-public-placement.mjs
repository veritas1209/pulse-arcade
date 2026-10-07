import {chromium,devices,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const url=process.argv[2]||'http://127.0.0.1:5195',out=process.argv[3]||'artifacts/shared-browser';
const desktopOnly=process.argv.includes('--desktop-only');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
let debugA;const errors=[],snapshots=[],audioFiles=new Set(),latest=new Map();
function monitor(page){
 page.on('response',r=>{if(new URL(r.url()).pathname.includes('/audio/')){audioFiles.add(new URL(r.url()).pathname.split('/').at(-1));if(r.status()!==200)errors.push('Audio HTTP '+r.status());}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.text().startsWith('ACTUALCLICK'))console.log(m.text());if(m.type()==='error')errors.push(m.text());});
 page.on('websocket',ws=>{ws.on('framesent',({payload})=>console.log('SENT',payload.toString()));ws.on('framereceived',({payload})=>{try{const m=JSON.parse(payload.toString());if(m.type==='error')console.log('SERVER_ERROR',JSON.stringify(m));if(m.type==='state'){console.log('RECV',page===debugA?'A':'B',m.state.revision,m.state.own.map(s=>[s.id,s.x,s.z]));snapshots.push(m.state);latest.set(page,m.state);}}catch{}});});
}
async function mapClick(page,x,z,right=false){
 if(!await page.locator('#minimap-panel').isVisible())await page.locator('#minimap-toggle').click();
 const b=await page.locator('#tactical-map').boundingBox();
 await page.locator('#tactical-map').click({position:{x:(x+.5)*b.width/30,y:(z+.5)*b.height/30},button:right?'right':'left'});
}
async function pve(context,name){
 const page=await context.newPage();monitor(page);await page.goto(url);await page.locator('#ship-picker button').first().waitFor();
 if(await page.locator('#ship-picker button').count()!==7)throw new Error('Expected seven fleet controls '+name);
 if(!['localhost','127.0.0.1'].includes(new URL(url).hostname)&&await page.evaluate(()=>!!window.__THREE_GAME_TEST_HOOKS__))throw new Error('Local fixture hooks exposed publicly');
 await page.locator('#start-game').click();
 await page.waitForTimeout(1300);await page.screenshot({path:out+'/'+name+'-start.png'});
 await page.locator('#action-recon').click();await mapClick(page,27,26);await page.locator('#confirm-action').click();
 await page.waitForFunction(()=>document.getElementById('selected-ap').textContent==='3 / 4');
 if(await page.locator('#action-move').count()||!await page.locator('#action-recon').isDisabled())throw new Error('Carrier sortie/movement contract');
 await page.locator('[data-ship="0-destroyer-1"]').click();
 if(!await page.locator('#action-attack').isDisabled()||await page.locator('#action-recon').isVisible())throw new Error('Opening attack/recon menu restriction');
 await page.locator('#end-turn').click();await page.waitForFunction(()=>!document.getElementById('end-turn').disabled,{},{timeout:45000});
 await page.locator('#action-attack').click();await mapClick(page,28,26);await page.locator('#confirm-action').click();
 await page.waitForFunction(()=>document.getElementById('selected-ap').textContent==='3 / 4');
 await mapClick(page,2,4,true);
 await page.waitForFunction(()=>document.getElementById('selected-ap').textContent==='0 / 4');
 await page.waitForTimeout(1300);await page.screenshot({path:out+'/'+name+'-combat.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal overflow '+name);
 if(name==='desktop'){
  const c=await page.locator('#game-canvas').boundingBox();
  await page.mouse.move(c.width*.5,c.height*.38);await page.mouse.down();await page.mouse.move(c.width*.61,c.height*.47,{steps:12});await page.mouse.up();await page.mouse.wheel(0,-700);
  await page.waitForTimeout(600);await page.screenshot({path:out+'/'+name+'-orbit.png'});
 }
 await page.locator('#end-turn').click();
 await page.waitForFunction(()=>!document.getElementById('end-turn').disabled,{},{timeout:45000});
 await page.locator('#help-toggle').click();await page.locator('#volume-control').fill('45');await page.locator('#exit-action').click();
 await page.locator('#start-game').waitFor({state:'visible'});await page.close();
}
try{
 
 if(!desktopOnly){const mobile=await browser.newContext({...devices['iPhone 13'],browserName:undefined});await pve(mobile,'mobile');await mobile.close();}
 const ca=await browser.newContext({viewport:{width:1440,height:900}}),cb=await browser.newContext({viewport:{width:1440,height:900}});
 const a=await ca.newPage(),b=await cb.newPage();debugA=a;monitor(a);monitor(b);
 await a.addInitScript(()=>{window.__rx=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('close',e=>{window.__rx.push({close:e.code,reason:e.reason});});this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')window.__rx.push({r:m.state.revision,own:m.state.own.map(s=>[s.id,s.x,s.z])});});}};});await a.goto(url);await a.locator('#ship-picker button').first().waitFor();await a.locator('#mode-select').selectOption('online');await a.locator('#create-room').click();
 await a.locator('#room-code').waitFor({state:'visible'});const code=await a.locator('#room-code').textContent();
 await b.goto(url);await b.locator('#ship-picker button').first().waitFor();await b.locator('#mode-select').selectOption('online');await b.locator('#room-input').fill(code);await b.locator('#join-room').click();await b.locator('#room-code').waitFor({state:'visible'});
 await expect.poll(()=>[a,b].every(p=>latest.get(p)?.phase==='setup'&&latest.get(p)?.connected?.every(Boolean)),{timeout:15000}).toBe(true);
 
 await a.locator('[data-ship="0-destroyer-1"]').click();await expect(a.locator('[data-ship="0-destroyer-1"]')).toHaveAttribute('aria-pressed','true');await a.evaluate(()=>document.querySelector('#tactical-map').addEventListener('click',e=>console.log('ACTUALCLICK',JSON.stringify({x:e.clientX,z:e.clientY,rect:document.querySelector('#tactical-map').getBoundingClientRect().toJSON(),pressed:document.querySelector('#ship-picker [aria-pressed=true]')?.getAttribute('data-ship')}))));console.log('MAPBOX',await a.locator('#tactical-map').boundingBox());await mapClick(a,6,6);await a.waitForTimeout(2000);console.log('NATIVE_RX',JSON.stringify(await a.evaluate(()=>window.__rx)));console.log('TEXT',await a.locator('#target-label').textContent());await a.screenshot({path:out+'/placement-debug.png'});
 await ca.close();await cb.close();
}finally{await browser.close();}
