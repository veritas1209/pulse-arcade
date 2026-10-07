import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const origin='https://222.96.173.194';
const browser=await chromium.launch({channel:'chrome',headless:true});
const manifest=JSON.parse(await readFile('release/pulse/manifest.json','utf8'));
const results=[];
for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage();const errors=[],hubWarnings=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){const row={message:m.text(),url:m.location().url};if(row.url.includes('/games/screw-harbor/'))errors.push(row);else hubWarnings.push(row);}});
 page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
 await page.goto(origin+'/');
 const card=page.locator('a.game-card[href="/games/screw-harbor/"]');
 const description=await page.evaluate(async()=>{const c=await(await fetch('/api/games')).json();return c.games.find(g=>g.id==='screw-harbor')?.description;});
 if(description!=='나사를 뽑아 구조물을 해체하세요.')throw Error('Portal description was not updated');
 await card.waitFor({state:'visible'});await card.click();
 await page.locator('#progress-count').filter({hasText:'0 / 156'}).waitFor();
 const bundle=manifest.files.find(file=>/^assets\/.*\.js$/.test(file.path)).path;
 const loaded=await page.locator('script[src]').evaluateAll(scripts=>scripts.map(script=>script.src));
 if(!loaded.some(src=>new URL(src).pathname.endsWith('/'+bundle)))throw Error('Public page loaded an old game bundle');
 if(await page.locator('#rotate-left, #reset-view, #rotate-right, .orbit-tools').count())throw Error('Removed camera buttons still exist');
 if(await page.locator('.workbench').count()||!await page.locator('.sorting #buffer').isVisible())throw Error('Storage was not moved to the top');
 const labels=await page.locator('.box-caption b').allTextContents();
 if(labels.some(v=>!['빨강','보라','초록','노랑','파랑'].includes(v)))throw Error('Old color labels remain');
 const hooks=await page.evaluate(()=>!!window.__SCREW_HARBOR__||!!window.__THREE_GAME_TEST_HOOKS__);
 if(hooks)throw Error('QA hooks leaked into production');
 const assets=await page.evaluate(async(files)=>{
  const rows=[];for(const f of files){const r=await fetch('./'+f.path);const data=await r.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');rows.push({file:f.path,status:r.status,mime:r.headers.get('content-type'),matches:hash===f.sha256});}return rows;
 },manifest.files);
 if(assets.some(a=>a.status!==200||!a.matches))throw Error('Public asset mismatch');
 const bounds=await page.locator('canvas').boundingBox(),px=bounds.x+bounds.width*.55,py=bounds.y+bounds.height*.5;
 const beforePan=await page.locator('canvas').screenshot();
 if(mobile){
  const cdp=await context.newCDPSession(page),points=[{x:px-35,y:py,id:1},{x:px+35,y:py,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points.map(p=>({...p,x:p.x+40,y:p.y+25}))});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{await page.mouse.move(px,py);await page.mouse.down({button:'right'});await page.mouse.move(px+70,py+40,{steps:6});await page.mouse.up({button:'right'});}
 if(beforePan.equals(await page.locator('canvas').screenshot()))throw Error('Public camera pan did not change the view');
 if(await page.locator('#progress-count').innerText()!=='0 / 156')throw Error('Camera gesture extracted a screw');
 await page.locator('#restart').click();
 const beforeZoom=await page.locator('canvas').screenshot();
 if(mobile){
  const cdp=await context.newCDPSession(page);
  for(let i=0;i<5;i++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px-20,y:py,id:1},{x:px+20,y:py,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px-120,y:py,id:1},{x:px+120,y:py,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await cdp.detach();
 }else{
  await page.locator('canvas').hover();
  for(let i=0;i<5;i++)await page.mouse.wheel(0,-10000);
 }
 if(beforeZoom.equals(await page.locator('canvas').screenshot()))throw Error('Public zoom did not change the view');
 if(await page.locator('#progress-count').innerText()!=='0 / 156')throw Error('Zoom gesture extracted a screw');
 await page.screenshot({path:`artifacts/deployment/public-zoom-wall-${mobile?'mobile':'desktop'}.png`});
 await page.locator('#restart').click();
 const local=await context.newPage();await local.goto('http://127.0.0.1:4188/?qa=1');await local.waitForFunction(()=>window.__SCREW_HARBOR__);
 const candidates=await local.evaluate(()=>window.__SCREW_HARBOR__.getDiagnostics().screws.filter(s=>!window.__SCREW_HARBOR__.getExtractionBlocker(s.id)));
 let target=null;
 for(const point of candidates){
  if(point.x<0||point.y<0||point.x>(mobile?390:1440)||point.y>(mobile?844:1000))continue;
  if(mobile)await local.touchscreen.tap(point.x,point.y);else await local.mouse.click(point.x,point.y);
  const ok=await local.evaluate(()=>window.__SCREW_HARBOR__.getPuzzle().moves>0);
  if(ok){target=point;break;}
 }
 if(!target)throw Error('No default-view click target found');
 await local.close();
 if(mobile)await page.touchscreen.tap(target.x,target.y);else await page.mouse.click(target.x,target.y);
 await page.waitForFunction(()=>document.getElementById('progress-count')?.textContent==='1 / 156');
 await page.locator('#restart').click();await page.waitForFunction(()=>document.getElementById('progress-count')?.textContent==='0 / 156');
 await page.locator('#pause').click();await page.locator('#resume').click();
 await page.locator('#stages').click();
 if(await page.locator('.stage-card').count()!==20)throw Error('New structures missing');
 const namesOverlap=await page.locator('.stage-card').evaluateAll(cards=>cards.some(c=>c.querySelector('b').getBoundingClientRect().bottom>c.querySelector('.stage-illustration').getBoundingClientRect().top+1));
 if(namesOverlap)throw Error('Card headings overlap images');
 await page.evaluate(async()=>{
  await Promise.all([...document.querySelectorAll('.stage-card img')].filter(img=>img.getBoundingClientRect().top<innerHeight).map(img=>img.decode()));
 });
 await page.screenshot({path:`artifacts/deployment/public-gallery-${mobile?'mobile':'desktop'}.png`,animations:'disabled'});
 await page.locator('[data-stage="10"]').click();await page.locator('#progress-count').filter({hasText:'0 / 336'}).waitFor();
 await page.locator('#stages').click();await page.locator('[data-stage="17"]').click();await page.locator('#progress-count').filter({hasText:'0 / 800'}).waitFor();
 await page.screenshot({path:`artifacts/deployment/public-${mobile?'mobile':'desktop'}.png`});
 const layout=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
 if(layout.sw>layout.w||layout.sh>layout.h+1)throw Error('Layout overflow');
 const catalog=await page.evaluate(async()=>{const c=await(await fetch('/api/games')).json();return c.games.map(g=>g.id);});
 const oldGames=await page.evaluate(async()=>{
  const c=await(await fetch('/api/games')).json();const rows=[];
  for(const g of c.games){if(g.id==='screw-harbor')continue;const r=await fetch(g.href);rows.push({id:g.id,status:r.status});}return rows;
 });
 if(oldGames.some(r=>r.status!==200))throw Error('Existing game route failed');
 await page.locator('.hub-link').click();await page.locator('a.game-card[href="/games/screw-harbor/"]').waitFor({state:'visible'});
 results.push({mobile,description,topStorage:true,cameraPan:true,cameraZoom:true,structures:20,carrierScrews:800,namesAboveImages:true,assets,layout,catalog,oldGames,errors,hubWarnings});
 console.log(JSON.stringify({mobile,files:assets.length,input:true,restart:true,pause:true,liner:336,hubReturn:true,errors}));
 await context.close();
}
await writeFile('artifacts/deployment/public-verification.json',JSON.stringify(results,null,2));await browser.close();
if(results.some(r=>r.errors.length))process.exitCode=1;
