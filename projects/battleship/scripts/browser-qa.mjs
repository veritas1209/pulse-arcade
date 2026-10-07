import {chromium,devices,expect} from '@playwright/test';
import fs from 'node:fs/promises';
const url=process.argv[2]||'http://127.0.0.1:5195',out=process.argv[3]||'artifacts/shared-browser';
const desktopOnly=process.argv.includes('--desktop-only');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const errors=[],snapshots=[],audioFiles=new Set(),latest=new Map(),acks=new Map();
function monitor(page){
 page.on('response',r=>{if(new URL(r.url()).pathname.includes('/audio/')){audioFiles.add(new URL(r.url()).pathname.split('/').at(-1));if(r.status()!==200)errors.push('Audio HTTP '+r.status());}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('websocket',ws=>{ws.on('framesent',({payload})=>{try{const m=JSON.parse(payload.toString());if(m.type==='attack-complete'){const sent=acks.get(page)??[];sent.push(m.step);acks.set(page,sent);}}catch{}});ws.on('framereceived',({payload})=>{try{const m=JSON.parse(payload.toString());if(m.type==='state'){snapshots.push(m.state);latest.set(page,m.state);}}catch{}});});
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
 await page.locator('#end-turn').click();await page.waitForFunction(()=>!document.getElementById('end-turn').disabled,{},{timeout:150000});
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
 await page.waitForFunction(()=>!document.getElementById('end-turn').disabled,{},{timeout:150000});
 await page.locator('#help-toggle').click();await page.locator('#volume-control').fill('45');await page.locator('#exit-action').click();
 await page.locator('#start-game').waitFor({state:'visible'});await page.close();
}
try{
 if(!process.argv.includes('--online-only')){const desktop=await browser.newContext({viewport:{width:1440,height:900}});await pve(desktop,'desktop');await desktop.close();}
 if(!desktopOnly){const mobile=await browser.newContext({...devices['iPhone 13'],browserName:undefined});await pve(mobile,'mobile');await mobile.close();}
 const ca=await browser.newContext({viewport:{width:1440,height:900}}),cb=await browser.newContext({viewport:{width:1440,height:900}});
 const a=await ca.newPage(),b=await cb.newPage();monitor(a);monitor(b);
 await a.goto(url);await a.locator('#ship-picker button').first().waitFor();await a.locator('#mode-select').selectOption('online');await a.locator('#create-room').click();
 await a.locator('#room-code').waitFor({state:'visible'});const code=await a.locator('#room-code').textContent();
 await b.goto(url);await b.locator('#ship-picker button').first().waitFor();await b.locator('#mode-select').selectOption('online');await b.locator('#room-input').fill(code);await b.locator('#join-room').click();await b.locator('#room-code').waitFor({state:'visible'});
 await expect.poll(()=>[a,b].every(p=>latest.get(p)?.phase==='setup'&&latest.get(p)?.connected?.every(Boolean)),{timeout:15000}).toBe(true);
 await a.locator('[data-ship="0-destroyer-1"]').click();await expect(a.locator('[data-ship="0-destroyer-1"]')).toHaveAttribute('aria-pressed','true');await mapClick(a,6,6);await expect.poll(()=>{const s=latest.get(a)?.own.find(s=>s.id==='0-destroyer-1');return s&&{x:s.x,z:s.z};}).toEqual({x:6,z:6});
 await b.locator('[data-ship="1-destroyer-1"]').click();await mapClick(b,25,25);await expect.poll(()=>{const s=latest.get(b)?.own.find(s=>s.id==='1-destroyer-1');return s&&{x:s.x,z:s.z};}).toEqual({x:25,z:25});await b.locator('#rotate-placement').click();
 await a.waitForFunction(()=>document.querySelector('[data-ship="0-destroyer-1"]').getAttribute('aria-pressed')==='true');
 await a.locator('[data-ship="0-carrier"]').click();
 await b.locator('[data-ship="1-carrier"]').click();
 await a.locator('#start-game').click();await b.locator('#start-game').click();await a.locator('#end-turn').waitFor({state:'visible'});
 await a.locator('#action-recon').click();await mapClick(a,25,25);await a.locator('#confirm-action').click();await a.waitForFunction(()=>document.getElementById('selected-ap').textContent==='3 / 4');
 await a.locator('[data-ship="0-destroyer-1"]').click();
 if(!await a.locator('#action-attack').isDisabled()||await a.locator('#action-recon').isVisible())throw new Error('Player0 opening restriction');
 await a.waitForFunction(()=>document.querySelector('#tactical-map')?.getBoundingClientRect().width>0);await a.waitForTimeout(100);
 await mapClick(a,25,25);try{await a.locator('#enemy-panel').waitFor({state:'visible'});}catch(e){await a.screenshot({path:out+'/inspector-failure.png'});await fs.writeFile(out+'/inspector-failure.json',JSON.stringify({state:latest.get(a),errors,client:await a.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__?.getState())},null,2));throw e;}
 if(await a.locator('#enemy-hp').textContent()!=='500 / 500')throw new Error('Enemy HP inspector');
 await a.locator('#end-turn').click();await b.waitForFunction(()=>!document.getElementById('end-turn').disabled);
 await b.locator('[data-ship="1-destroyer-1"]').click();if(!await b.locator('#action-attack').isDisabled())throw new Error('Player1 opening restriction');
 await b.locator('[data-ship="1-carrier"]').click();await b.locator('#action-recon').click();await mapClick(b,6,6);await b.locator('#confirm-action').click();
 await b.locator('#end-turn').click();await a.waitForFunction(()=>!document.getElementById('end-turn').disabled);
 await a.locator('#action-attack').click();await mapClick(a,25,25);await a.locator('#confirm-action').click();
 await a.waitForFunction(()=>document.getElementById('selected-ap').textContent==='3 / 4');
 if(latest.get(a).queuedAttacks?.length!==1||latest.get(a).lastShot)throw new Error('Attack must reserve without immediate damage');await a.locator('#end-turn').click();await a.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__?.getState().state.lastShot?.by===0||document.getElementById('target-label').textContent.includes('공격 실행'));await expect.poll(()=>latest.get(a)?.lastShot?.by,{timeout:30000}).toBe(0);const firstDamage=latest.get(a).lastShot.damage,enemyHP=500-firstDamage;if(![0,200].includes(firstDamage))throw new Error('Escort damage invariant');
 await a.waitForFunction(hp=>document.getElementById('enemy-hp').textContent===hp+' / 500',enemyHP,{timeout:30000});
 await a.waitForTimeout(1300);await a.screenshot({path:out+'/enemy-damage-inspector.png'});
 await b.waitForFunction(hp=>document.querySelector('[data-ship="1-destroyer-1"]').textContent.includes(String(hp)),enemyHP);
 await b.waitForFunction(()=>!document.getElementById('end-turn').disabled,{},{timeout:60000});
 await a.locator('#enemy-panel').waitFor({state:'hidden'});
 await b.reload();await b.waitForFunction(()=>document.body.dataset.phase==='battle'&&!document.getElementById('end-turn').disabled);
 await b.locator('[data-ship="1-destroyer-1"]').click();await b.locator('#action-attack').click();await mapClick(b,6,6);try{await b.locator('#enemy-panel').waitFor({state:'visible'});}catch(e){await b.screenshot({path:out+'/reconnect-inspector-failure.png'});await fs.writeFile(out+'/reconnect-inspector-failure.json',JSON.stringify({state:latest.get(b),otherState:latest.get(a),errors},null,2));throw e;}await b.locator('#confirm-action').click();
 await b.waitForFunction(()=>document.getElementById('selected-ap').textContent==='3 / 4');
 const priorSequence=latest.get(b).lastShot?.sequence??0;if(latest.get(b).queuedAttacks?.length!==1)throw new Error('Retaliation must reserve');if(['localhost','127.0.0.1'].includes(new URL(url).hostname))await b.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));await b.locator('#end-turn').click();await expect.poll(()=>latest.get(b)?.lastShot?.sequence,{timeout:30000}).toBe(priorSequence+1);const secondDamage=latest.get(b).lastShot.damage;if(![0,200].includes(secondDamage))throw new Error('Escort retaliation invariant');
 // Reload the firing client during this active presentation: it must replay the current step and acknowledge it afresh.
 const activeStep=latest.get(b).resolutionStep;if(activeStep===undefined)throw new Error('Missing active presentation step');if(['localhost','127.0.0.1'].includes(new URL(url).hostname))await expect.poll(()=>acks.get(a)?.includes(activeStep),{timeout:30000}).toBe(true);latest.delete(b);await b.reload();await expect.poll(()=>latest.get(b)?.resolutionStep,{timeout:30000}).toBe(activeStep);if(['localhost','127.0.0.1'].includes(new URL(url).hostname)){await b.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__?.getState();return d&&d.projectiles?.length>0&&d.combatCameraActive;},{},{timeout:30000});await expect.poll(()=>acks.get(a)?.filter(step=>step===activeStep).length,{timeout:30000}).toBeGreaterThanOrEqual(2);}

 await a.waitForFunction(hp=>document.querySelector('[data-ship="0-destroyer-1"]').textContent.includes(String(hp)),500-secondDamage);
 // Both clients retain their freely placed one-cell fleet across reconnect.
 await a.screenshot({path:out+'/online-shared.png'});
 await a.waitForFunction(()=>!document.getElementById('end-turn').disabled,{},{timeout:60000});await a.locator('#help-toggle').click();await a.locator('#exit-action').click();
 await b.locator('#result-panel').waitFor({state:'visible'});await ca.close();await cb.close();
 const allowed=new Set(['phase','you','turn','round','turnNumber','winner','own','revealed','islands','visibleCells','recon','ready','connected','revision','lastShot','shots','sonar','torpedoes','combatPhase','queuedAttacks','attackProgress','resolutionStep']);
 for(const s of snapshots){
  if(s.own.length!==7||['carrier','destroyer','battleship'].some((kind,i)=>s.own.filter(ship=>ship.kind===kind).length!==[1,3,3][i]))throw new Error('Expected seven-ship fleet (1 carrier/3 destroyers/3 battleships)');
  if(Object.keys(s).some(k=>!allowed.has(k)))throw new Error('Unexpected private payload key');
  const visible=new Set(s.visibleCells.map(c=>c.x+','+c.z));
  if(s.revealed.some(ship=>!visible.has(ship.x+','+ship.z)))throw new Error('Hidden enemy in snapshot');
  if((s.sonar??[]).some(p=>p.team!==s.you))throw new Error('Opposing private sonar');
  if((s.torpedoes??[]).some(t=>t.team!==s.you&&(!visible.has(t.x+','+t.z)||t.target)))throw new Error('Hidden enemy torpedo path');
  if((s.queuedAttacks??[]).some(q=>!s.own.some(ship=>ship.id===q.shipId)))throw new Error('Opposing private attack reservation');
  if(s.own.some(ship=>ship.team!==s.you))throw new Error('Opposing private fleet');
  if(s.lastShot?.source&&s.lastShot.by!==s.you&&!visible.has(s.lastShot.source.x+','+s.lastShot.source.z)){const current=s.combatPhase==='attack'&&(s.shots??[]).some(p=>p.sequence===s.lastShot.sequence);if(!current||!s.lastShot.sourceShip||s.lastShot.sourceShip.team!==s.lastShot.by)throw new Error('Archived/private attack origin');}
 }
 if(audioFiles.size!==23)throw new Error('Expected 23 game SFX, got '+audioFiles.size);
 if(errors.length)throw new Error(errors.join('\n'));
 const report={url,desktop:true,pve:!process.argv.includes('--online-only'),mobile:!desktopOnly,online:true,reconnect:true,openingTurn:true,enemyInspector:true,attackPhaseReconnect:true,audioFiles:audioFiles.size,privateSnapshots:snapshots.length,errors};
 await fs.writeFile(out+'/browser-qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}


