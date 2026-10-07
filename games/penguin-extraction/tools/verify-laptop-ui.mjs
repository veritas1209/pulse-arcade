import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

const release=resolve(process.argv[2]??'.');
const index=await readFile(resolve(release,'dist/index.html'),'utf8');
const styles=[...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map(match=>match[1].split('?')[0].replace(/^\/games\/penguin-extraction\//,''))
  .map(path=>resolve(release,'dist',path));
const trainingScript=resolve(release,'dist/assets/training-entry.js');
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({
  viewport:{width:1536,height:725},
  deviceScaleFactor:1.25,
});

async function newPage(html){
  const page=await context.newPage();
  await page.route('http://ui.test/**',async route=>{
    if(route.request().url().includes('/api/training/current')){
      await route.fulfill({contentType:'application/json',body:'{"active":true,"aiLevel":1,"aiActive":false}'});
      return;
    }
    await route.fulfill({contentType:'text/html',body:html});
  });
  await page.goto('http://ui.test/');
  for(const path of styles)await page.addStyleTag({path});
  return page;
}

const trainingHtml=[
  '<div id="app" class="in-raid"></div>',
  '<main class="raid-interface">',
  '<div class="raid-top"><div class="raid-location"><span class="eyebrow"></span><strong></strong></div></div>',
  '<div class="minimap-wrap"><canvas width="250" height="250"></canvas><button>M 지도 확대</button></div>',
  '<div class="weapon-cluster">',
  '<div id="weapon-name">Mk.14 · 정밀 [골드] · 210</div>',
  '<div class="ammo-display"><strong>37</strong><span>/ <b>38</b></span><button>재장전</button></div>',
  '<select class="ammo-type-select"><option>7.62mm · 일반</option></select>',
  '<div id="reload-state"></div>',
  '<div class="weapon-select"><button>1 1번 무기</button><button>2 2번 무기</button><button>3 권총</button><button>4 근접 무기</button></div>',
  '</div></main>',
].join('');
const training=await newPage(trainingHtml);
await training.evaluate(()=>sessionStorage.setItem('bluecap-training-raid','layout-test'));
await training.addScriptTag({path:trainingScript});
await training.waitForSelector('#training-controls');
const trainingBoxes=await training.evaluate(()=>{
  const box=selector=>{
    const rect=document.querySelector(selector).getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height};
  };
  return {map:box('.minimap-wrap'),controls:box('#training-controls'),weapon:box('.weapon-cluster')};
});
assert.ok(trainingBoxes.controls.top>=trainingBoxes.map.bottom,
  'training controls overlap minimap: '+JSON.stringify(trainingBoxes));
assert.ok(trainingBoxes.controls.bottom<=trainingBoxes.weapon.top,
  'training controls overlap weapon HUD: '+JSON.stringify(trainingBoxes));
assert.ok(trainingBoxes.controls.right<=1536&&trainingBoxes.controls.bottom<=725,
  'training controls leave viewport: '+JSON.stringify(trainingBoxes));
await training.screenshot({path:'/tmp/laptop-training-ui-150.png'});
await training.close();

const lobbyHtml=[
  '<div id="app">',
  '<aside class="ping-badge">▂▄▆ <span>20 ms</span></aside>',
  '<main class="menu-interface"><aside class="sortie-panel"><h2>아틱 베이스</h2></aside></main>',
  '</div>',
].join('');
const lobby=await newPage(lobbyHtml);
const lobbyBoxes=await lobby.evaluate(()=>{
  const box=selector=>{
    const rect=document.querySelector(selector).getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height};
  };
  return {ping:box('.ping-badge'),sortie:box('.sortie-panel')};
});
assert.ok(lobbyBoxes.ping.right<=lobbyBoxes.sortie.left,
  'ping overlaps sortie panel: '+JSON.stringify(lobbyBoxes));
assert.ok(lobbyBoxes.sortie.right<=1536,
  'sortie panel leaves viewport: '+JSON.stringify(lobbyBoxes));
await lobby.screenshot({path:'/tmp/laptop-lobby-ui-150.png'});
await lobby.close();

await writeFile('/tmp/laptop-ui-150-layout.json',JSON.stringify({trainingBoxes,lobbyBoxes},null,2));
await context.close();
await browser.close();
console.log(JSON.stringify({trainingBoxes,lobbyBoxes},null,2));
