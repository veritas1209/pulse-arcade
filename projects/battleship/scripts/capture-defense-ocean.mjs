import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/defense-ocean-final';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/defense-ocean-fixture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><button id="unlock">Unlock audio</button><canvas style="width:100vw;height:100vh"></canvas></body>'}));
await page.goto('http://127.0.0.1:5195/defense-ocean-fixture');
await page.evaluate(async()=>{
 const [{createNavalScene},{BattleAudio},{createParts},{ISLANDS}]=await Promise.all([import('/src/scene.ts'),import('/src/audio.ts'),import('/src/parts.ts'),import('/src/rules.ts')]);
 const audio=new BattleAudio(),phases=[],defenses=[];
 document.querySelector('#unlock').onclick=async()=>{await audio.unlock();window.audioReady=true;};
 let time=17;const scene=createNavalScene(document.querySelector('canvas'),()=>{},undefined,(phase,shot,kind)=>{phases.push({phase,sequence:shot.sequence,time});if(phase==='launch')audio.startShot(shot,kind);else audio.finishShot(shot,kind);},undefined,undefined,e=>{defenses.push({...e,position:e.position.toArray(),time});const cell={x:(e.position.x+60)/4-.5,z:(e.position.z+60)/4-.5};if(e.phase==='ciws-start')audio.ciwsBurst(e.shot,cell,e.duration);else audio.intercept(e.shot,cell);});
 const make=(id,kind,x,z)=>({id,kind,team:0,x,z,heading:0,hp:kind==='battleship'?800:500,maxHp:kind==='battleship'?800:500,ap:4,maxAp:4,sunk:false,attacked:false,moved:false,parts:createParts(kind)});
 const ships=[make('ddg','destroyer',14,4),make('iowa','battleship',16,4),make('guard','destroyer',14,6)];
 scene.setState({you:0,turn:0,own:ships,revealed:[],islands:ISLANDS.flat(),visibleCells:ships,recon:[],selectedId:'ddg',selectedCell:ships[0]});
 window.fixture={scene,audio,ships,phases,defenses,step(n){for(let i=0;i<n;i++)scene.update(1/60,time+=1/60);scene.render();const d=scene.diagnostics();audio.syncListener(d.camera.position,d.camera.target);return d;}};
});
await page.locator('#unlock').click();await page.waitForFunction(()=>window.audioReady,{},{timeout:45000});
await page.evaluate(()=>document.querySelector('#unlock').remove());
await page.waitForFunction(()=>{const f=window.fixture;f.step(2);const d=f.scene.diagnostics();return d.texturesReady&&d.damagePreparation.pending===0&&d.damagePreparation.status==='ready';},{},{timeout:60000});
const states={};
for(const id of ['ddg','iowa']){
 states[id]=await page.evaluate(id=>{const f=window.fixture;f.scene.focus(f.ships.find(s=>s.id===id),true);return f.step(300);},id);
 await page.screenshot({path:`${out}/${id}-close.png`});
 assert.equal(states[id].teamRingCount,0);assert.equal(states[id].selectionRingCount,0);
}
await page.evaluate(()=>{const f=window.fixture;f.scene.focus({x:14,z:5});f.step(300);f.scene.impact({x:14,z:6,source:{x:14,z:4},interceptedBy:{x:14,z:6},by:0,sequence:101,kind:'missile',hit:true,damage:0,blocked:true,halved:false},f.ships[2]);});
states.missile=await page.evaluate(()=>window.fixture.step(14));await page.screenshot({path:`out/missile-flight.png`.replace('out/',out+'/')});
states.ciws=await page.evaluate(()=>window.fixture.step(29));await page.screenshot({path:`${out}/ciws.png`});
assert(states.ciws.ciwsTracers>0);assert.equal(states.ciws.ciwsBursts,1);assert.equal(states.ciws.missileDeliveryTriangles,2295);
states.intercept=await page.evaluate(()=>window.fixture.step(20));await page.screenshot({path:`${out}/intercept-smoke.png`});
assert.equal(states.intercept.interceptSmokeCount,1);assert.equal(states.intercept.projectiles.length,0);
await page.evaluate(()=>{const f=window.fixture;f.step(210);f.scene.impact({x:14,z:6,source:{x:16,z:4},by:0,sequence:102,kind:'shell',hit:false,damage:0,blocked:false,halved:false});});
states.shell=await page.evaluate(()=>window.fixture.step(14));await page.screenshot({path:`${out}/cannon-smoke.png`});assert.equal(states.shell.shellDeliveryTriangles,336);assert.equal(states.shell.gunLaunches,1);
const audio=await page.evaluate(()=>window.fixture.audio.diagnostics()),events=await page.evaluate(()=>({phases:window.fixture.phases,defenses:window.fixture.defenses}));
assert.equal(audio.loaded.length,23);assert.deepEqual(audio.errors,{});assert.equal(audio.ciwsEvents,1);assert.equal(audio.interceptEvents,1);
await page.evaluate(()=>{window.fixture.scene.dispose();window.fixture.audio.dispose();});await browser.close();
await fs.writeFile(`${out}/report.json`,JSON.stringify({errors,audio,events,states},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,errors,audio,events,renderers:Object.fromEntries(Object.entries(states).map(([k,s])=>[k,s.renderer]))}));
