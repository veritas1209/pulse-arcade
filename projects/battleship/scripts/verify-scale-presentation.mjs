import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/scale-presentation';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.route('**/scale-fixture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas id="game-canvas" style="width:100vw;height:100vh;display:block"></canvas></body>'}));await page.goto('http://127.0.0.1:5195/scale-fixture');
 const report=await page.evaluate(async()=>{
  const {createNavalScene}=await import('/src/scene.ts'),{createBattle}=await import('/src/rules.ts');const b=createBattle(false),canvas=document.querySelector('canvas'),scene=createNavalScene(canvas,()=>{});let time=12;
  // Fixture-generated pointer events have no native pointer-capture token.
  canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
  let state={you:0,turn:0,own:b.ships.filter(s=>s.team===0),revealed:[],islands:b.islands,visibleCells:[],recon:[],selectedId:'0-carrier',selectedCell:b.ships.find(s=>s.id==='0-carrier')};scene.setState(state);
  for(let i=0;i<500&&!scene.diagnostics().texturesReady;i++)await new Promise(r=>setTimeout(r,40));
  const tick=(n=1)=>{for(let i=0;i<n;i++){time+=1/60;scene.update(1/60,time);scene.render();}},images={},poses={},pan=[];
  const snap=name=>{images[name]=canvas.toDataURL();poses[name]=scene.diagnostics();};tick(60);snap('fleet');
  scene.home();tick(160);snap('overview');
  for(const kind of ['carrier','destroyer','battleship']){const ship=state.own.find(s=>s.kind===kind);state={...state,selectedId:ship.id,selectedCell:ship};scene.setState(state);scene.focus(ship);tick(160);snap(kind);
   for(const code of ['KeyW','KeyA','KeyS','KeyD']){const before=scene.diagnostics().camera;window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));tick(24);window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));const after=scene.diagnostics().camera;pan.push({kind,code,before,after});}
  }
  // Rebase a ground-facing viewpoint by orbiting with a real pointer drag.
  const ship=state.own.find(s=>s.kind==='carrier');scene.focus(ship);tick(160);canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:11,button:0,buttons:1,clientX:950,clientY:500,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:11,button:0,buttons:1,clientX:1220,clientY:570,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:11,button:0,buttons:0,clientX:1220,clientY:570,bubbles:true}));tick(40);snap('low-yaw');
  const before=scene.diagnostics().camera;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));tick(1200);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD',bubbles:true}));pan.push({kind:'world-boundary',code:'KeyD',before,after:scene.diagnostics().camera});snap('boundary');
  // A new team's real bounds must replace the previous team, even if it is sunk.
  scene.setState({...state,own:state.own.map(s=>({...s,sunk:true,hp:0}))});scene.setState({...state,you:1,turn:1,selectedId:'1-carrier',selectedCell:undefined,own:b.ships.filter(s=>s.team===1)});tick(20);snap('team-one');
  scene.focus({x:8,z:11});tick(160);snap('coast');time=43;tick();snap('coast-later');scene.dispose();return{images,poses,pan};
 });
 for(const [name,data] of Object.entries(report.images))await writeFile(`${out}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));delete report.images;
 await writeFile(`${out}/report.json`,JSON.stringify({errors,...report},null,2));
 for(const p of report.pan){assert.ok(Math.abs(p.before.position[1]-p.after.position[1])<1e-7,JSON.stringify(p));assert.ok(Math.abs(p.before.target[1]-p.after.target[1])<1e-7,JSON.stringify(p));}
 assert.equal(report.poses.fleet.healthBars,7);assert.equal(report.poses.fleet.waterContactShadows,7);assert.equal(report.poses.fleet.teamRingCount,0);assert.equal(report.poses.overview.healthBars,7);
 assert.equal(report.poses.destroyer.shipDetail['0-destroyer-1'].low,false);assert.ok(report.poses.destroyer.shadowCoverageWorld<30);
 assert.ok(report.poses['team-one'].camera.target[0]>30);assert.ok(Object.values(report.poses).every(p=>p.camera.position.every(Number.isFinite)&&p.highDetailShips<=4));assert.deepEqual(errors,[]);
 await writeFile(`${out}/report.json`,JSON.stringify({errors,...report},null,2));console.log(JSON.stringify({errors,poses:Object.fromEntries(Object.entries(report.poses).map(([k,p])=>[k,{camera:p.camera,renderer:p.renderer,health:p.healthBars,rings:p.teamRingCount,shadowTexelMetres:p.shadowTexelMetres,detail:p.highDetailShips}]))}));
}finally{await browser.close();}
