import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.argv[2]||'artifacts/formation-water';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
 await page.route('**/polish-fixture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas style="display:block;width:100vw;height:100vh"></canvas></body>'}));await page.goto('http://127.0.0.1:5195/polish-fixture');
 const report=await page.evaluate(async()=>{
  const {createNavalScene}=await import('/src/scene.ts'),{createBattle}=await import('/src/rules.ts');const b=createBattle(false),canvas=document.querySelector('canvas'),scene=createNavalScene(canvas,()=>{});let time=12;
  const state={you:0,turn:0,own:b.ships.filter(s=>s.team===0),revealed:[],islands:b.islands,visibleCells:[],recon:[],selectedId:'0-carrier'};scene.setState(state);
  for(let i=0;i<500&&(!scene.diagnostics().texturesReady||scene.diagnostics().damagePreparation?.status==='starting');i++)await new Promise(r=>setTimeout(r,40));
  const tick=()=>{time+=.016;scene.update(.016,time);scene.render();};for(let i=0;i<20;i++)tick();const images={formation:canvas.toDataURL()},formation=scene.diagnostics();
  scene.home();for(let i=0;i<160;i++)tick();images.coast=canvas.toDataURL();time=41;tick();images['coast-later']=canvas.toDataURL();scene.focus({x:8,z:11});for(let i=0;i<160;i++)tick();images['coast-close']=canvas.toDataURL();
  const dd=state.own.find(s=>s.id==='0-destroyer-1');scene.focus(dd);for(let i=0;i<160;i++)tick();const p=scene.project(dd);for(let i=0;i<14;i++){canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-110,clientX:p.x,clientY:p.y,bubbles:true,cancelable:true}));tick();}images['destroyer-close']=canvas.toDataURL();const close=scene.diagnostics();
  scene.home();for(let i=0;i<180;i++)tick();const bb=state.own.find(s=>s.id==='0-battleship-1');scene.focus(bb);for(let i=0;i<160;i++)tick();const bp=scene.project(bb);for(let i=0;i<13;i++){canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-110,clientX:bp.x,clientY:bp.y,bubbles:true,cancelable:true}));tick();}for(let i=0;i<120;i++)tick();images['iowa-close']=canvas.toDataURL();const iowa=scene.diagnostics();
  scene.setState({...state,own:state.own.slice(1)});tick();const removed=scene.diagnostics();scene.setState(state);tick();const restored=scene.diagnostics();scene.dispose();return {images,formation,close,iowa,removed,restored};
 });
 for(const [name,data] of Object.entries(report.images))await writeFile(`${out}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));delete report.images;
 assert.equal(report.formation.healthBars,7);assert.equal(report.formation.waterContactShadows,7);assert.deepEqual(report.formation.healthBarCssSize,[208,38]);assert.equal(report.removed.healthBars,6);assert.equal(report.removed.waterContactShadows,6);assert.equal(report.restored.healthBars,7);assert.equal(report.restored.waterContactShadows,7);
 assert.deepEqual(errors,[]);await writeFile(out+'/diagnostics.json',JSON.stringify({errors,...report},null,2));console.log(JSON.stringify({errors,formation:report.formation.renderer,close:report.close.renderer,health:report.formation.healthBarCssSize}));
}finally{await browser.close();}
