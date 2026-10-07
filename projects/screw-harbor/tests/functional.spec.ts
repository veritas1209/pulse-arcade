import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
async function ready(page: Page) {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean((window as any).__SCREW_HARBOR__));
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true));
}
async function state(page: Page) {
  return page.evaluate(() => (window as any).__SCREW_HARBOR__.getDiagnostics());
}
async function visibleScrew(page: Page, nonmatching: boolean) {
  return page.evaluate((nonmatching) => {
    const qa = (window as any).__SCREW_HARBOR__;
    const d = qa.getDiagnostics();
    const colors = d.boxes.map((b: any) => b.color);
    for (const s of d.screws) {
      if (nonmatching && colors.includes(s.color)) continue;
      if (!qa.getExtractionBlocker(s.id) && qa.viewScrew(s.id)) return qa.getDiagnostics().screws.find((v: any) => v.id === s.id);
    }
    return null;
  }, nonmatching);
}
test('any visible color can be picked; no hint, undo or dismantling phase', async ({page, isMobile}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  const original = await state(page);
  expect(original.remaining).toBeGreaterThanOrEqual(150);
  await expect(page.locator('#hint, #undo, #recover')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys((window as any).__SCREW_HARBOR__))).not.toContain('hint');
  expect(await page.evaluate(() => Object.keys((window as any).__SCREW_HARBOR__))).not.toContain('undo');
  expect(await page.locator('.scene-meta').innerText()).not.toContain('단계');
  const target = await visibleScrew(page, true);
  expect(target).toBeTruthy();
  if (isMobile) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await state(page)).moves).toBe(1);
  expect((await state(page)).buffer).toEqual([target.color]);
  await page.keyboard.press('h');
  await page.keyboard.press('z');
  expect((await state(page)).moves).toBe(1);
  await page.locator('#restart').click();
  expect((await state(page)).remaining).toBe(original.remaining);
  expect((await state(page)).physics.bodies).toBe(1);
  await page.locator('#pause').click();
  await expect(page.locator('#modal')).toBeVisible();
  const close = await page.locator('#close-modal').boundingBox();
  expect(close!.x + close!.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
  await page.locator('#resume').click();
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '소리 켜기');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '소리 끄기');
  expect(errors).toEqual([]);
});
test('all structures have 150+ screws; large ship, pixels and responsive layout', async ({page}) => {
  test.setTimeout(180000);
  await ready(page);
  const counts = await page.evaluate(() => {
    const qa = (window as any).__SCREW_HARBOR__;
    const result = [];
    for(let i=0; i<qa.stageCount; i++) { qa.loadStage(i); result.push(qa.getDiagnostics().remaining); }
    return result;
  });
  expect(counts).toHaveLength(20);
  expect(Math.min(...counts)).toBeGreaterThanOrEqual(150);
  expect(counts[10]).toBeGreaterThanOrEqual(240);
  expect(Math.min(...counts.slice(12))).toBeGreaterThanOrEqual(480);
  await page.locator('#stages').click();
  await expect(page.locator('.stage-card')).toHaveCount(20);
  const overlap=await page.locator('.stage-card').evaluateAll(cards=>cards.some(card=>{
    const name=card.querySelector('b')!.getBoundingClientRect(),image=card.querySelector('.stage-illustration')!.getBoundingClientRect();
    return name.bottom>image.top+1;
  }));
  expect(overlap).toBe(false);
  await page.locator('[data-stage="10"]').click();
  await expect(page.locator('#stage-name')).toHaveText('그랜드 오션라이너');
  await page.waitForTimeout(150);
  const png = PNG.sync.read(await page.locator('canvas').screenshot());
  const buckets = new Set<string>();
  for(let p=0; p<png.data.length; p+=160) buckets.add(`${png.data[p]>>4},${png.data[p+1]>>4},${png.data[p+2]>>4}`);
  expect(buckets.size).toBeGreaterThan(20);
  expect((await state(page)).renderer.calls).toBeLessThan(650);
  const layout = await page.evaluate(() => ({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
  expect(layout.sw).toBe(layout.w);
  expect(layout.sh).toBeLessThanOrEqual(layout.h+1);
});

test('storage stays at the top and editor camera gestures do not extract screws', async ({page,isMobile}) => {
  test.setTimeout(90000);
  await ready(page);
  await expect(page.locator('.workbench')).toHaveCount(0);
  await expect(page.locator('.sorting #buffer')).toBeVisible();
  await expect(page.locator('#restart')).toBeVisible();
  const target=await visibleScrew(page,false);
  expect(target).toBeTruthy();
  await page.mouse.click(target.x,target.y,{button:'right'});
  await page.keyboard.down('Shift');
  await page.mouse.click(target.x,target.y);
  await page.keyboard.up('Shift');
  expect((await state(page)).moves).toBe(0);
  const canvas=await page.locator('canvas').boundingBox();
  const x=canvas!.x+canvas!.width*.55,y=canvas!.y+canvas!.height*.5;
  const before=(await state(page)).camera;
  if(isMobile) {
    const cdp=await page.context().newCDPSession(page);
    const touchPoints=[{x:x-35,y,id:1},{x:x+35,y,id:2}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touchPoints.map(p=>({...p,x:p.x+45,y:p.y+24}))});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
  } else {
    await page.mouse.move(x,y);
    await page.mouse.down({button:'right'});
    await page.mouse.move(x+70,y+40,{steps:6});
    await page.mouse.up({button:'right'});
  }
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(45));
  const moved=(await state(page)).camera;
  expect(moved.target).not.toEqual(before.target);
  expect(moved.distance).toBeCloseTo(before.distance,3);
  expect((await state(page)).moves).toBe(0);
  await page.mouse.move(x,y);
  await page.mouse.wheel(0,-200);
  await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(45));
  expect((await state(page)).camera.distance).toBeLessThan(moved.distance);
  expect((await state(page)).moves).toBe(0);
  const screw=await visibleScrew(page,false);
  expect(screw).toBeTruthy();
  if(isMobile)await page.touchscreen.tap(screw.x,screw.y);else await page.mouse.click(screw.x,screw.y);
  expect((await state(page)).moves).toBe(1);
  for(const viewport of [{width:320,height:740},{width:390,height:664},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const layout=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));
    expect(layout.sw).toBe(layout.w);
    expect(layout.sh).toBeLessThanOrEqual(layout.h+1);
    const buffer=await page.locator('#buffer').boundingBox(),world=await page.locator('canvas').boundingBox();
    expect(buffer!.y+buffer!.height).toBeLessThanOrEqual(world!.y+1);
  }
});

test('parts stay fixed until the last screw; then detach and disappear', async ({page,isMobile}) => {
  await ready(page);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(false));
  await expect(page.locator('#rotate-left, #reset-view, #rotate-right, .orbit-tools')).toHaveCount(0);
  const target = await page.evaluate(() => {
    const qa=(window as any).__SCREW_HARBOR__;
    const first=qa.getPuzzle().screws[0];
    const ids=qa.getPuzzle().screws.filter((s:any)=>s.partId===first.partId).map((s:any)=>s.id);
    const part=qa.getStructure().parts.find((p:any)=>p.id===first.partId).group;
    return {partId:first.partId, ids, position:part.position.toArray(), quaternion:part.quaternion.toArray()};
  });
  expect(target.ids).toHaveLength(2);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  const readPart=()=>page.evaluate((id)=>{
    const qa=(window as any).__SCREW_HARBOR__;
    const g=qa.getStructure().parts.find((p:any)=>p.id===id).group;
    return {position:g.position.toArray(),quaternion:g.quaternion.toArray(),visible:g.visible,bodies:qa.getDiagnostics().physics.bodies};
  },target.partId);
  for(let i=0;i<target.ids.length;i++) {
    const id=target.ids[i];
    const point=await page.evaluate((id)=>{
      const qa=(window as any).__SCREW_HARBOR__;
      if(qa.getExtractionBlocker(id)||!qa.viewScrew(id))return null;
      return qa.getDiagnostics().screws.find((s:any)=>s.id===id);
    },id);
    expect(point).toBeTruthy();
    if(isMobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
    expect((await state(page)).moves).toBe(i+1);
    if(i===0) {
      await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(45));
      expect(await readPart()).toEqual({position:target.position,quaternion:target.quaternion,visible:true,bodies:1});
    } else {
      expect((await readPart()).bodies).toBe(2);
      await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(6));
      expect((await readPart()).position).not.toEqual(target.position);
      await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(140));
      expect((await readPart()).visible).toBe(false);
      expect((await readPart()).bodies).toBe(1);
    }
  }
});
test('production Pulse prefix loads with self-hosted assets and no helper controls', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror',e => errors.push(e.message));
  page.on('console',m => { if(m.type()==='error') errors.push(m.text()); });
  const bad: number[]=[];
  page.on('response',r => {if(r.status()>=400) bad.push(r.status());});
  const response=await page.goto('http://127.0.0.1:4190/games/screw-harbor/?qa=1');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await page.waitForFunction(() => Boolean((window as any).__SCREW_HARBOR__));
  await expect(page.locator('#stage-name')).toHaveText('해변 오두막');
  await expect(page.locator('#hint, #undo')).toHaveCount(0);
  expect((await state(page)).remaining).toBeGreaterThanOrEqual(150);
  expect(errors).toEqual([]);
  expect(bad).toEqual([]);
});

test('a visible but trapped screw accepts the tap, jolts, and preserves puzzle state', async ({page,isMobile}) => {
  await ready(page);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(false));
  const target = await page.evaluate(() => {
    const qa=(window as any).__SCREW_HARBOR__;
    for(const s of qa.getPuzzle().screws) {
      if(!qa.getExtractionBlocker(s.id) || !qa.viewScrew(s.id)) continue;
      let q: number[]=[];
      qa.getStructure().root.traverse((o:any) => {if(o.userData.screwId===s.id) q=o.quaternion.toArray();});
      return {...qa.getDiagnostics().screws.find((v:any)=>v.id===s.id), quaternion:q};
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  const before=await state(page);
  if(isMobile) await page.touchscreen.tap(target.x,target.y); else await page.mouse.click(target.x,target.y);
  const after=await page.evaluate((id) => {
    const qa=(window as any).__SCREW_HARBOR__;
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(3);
    window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true);
    let q:number[]=[];
    qa.getStructure().root.traverse((o:any)=>{if(o.userData.screwId===id)q=o.quaternion.toArray();});
    return {d:qa.getDiagnostics(),quaternion:q};
  },target.id);
  expect(after.d.blockedFeedback).toContain(target.id);
  expect(after.quaternion).not.toEqual(target.quaternion);
  expect(after.d.moves).toBe(before.moves);
  expect(after.d.remaining).toBe(before.remaining);
  expect(after.d.boxes).toEqual(before.boxes);
  expect(after.d.buffer).toEqual(before.buffer);
  await expect(page.locator('#toast')).toContainText('막혀');
  await page.screenshot({path:`artifacts/blocked-jolt-${isMobile?'mobile':'desktop'}.png`});
  await page.evaluate(()=>{window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(30);window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(false);});
  expect((await state(page)).blockedFeedback).toEqual([]);
});

test('five off-color picks lose; the only recovery is restarting', async ({page,isMobile})=>{
  await ready(page);
  for(let i=0;i<5;i++) {
    const target=await visibleScrew(page,true);
    expect(target).toBeTruthy();
    if(isMobile) await page.touchscreen.tap(target.x,target.y);else await page.mouse.click(target.x,target.y);
    await expect.poll(async()=>(await state(page)).moves).toBe(i+1);
    await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(10));
  }
  expect((await state(page)).state).toBe('lost');
  expect((await state(page)).buffer).toHaveLength(5);
  await expect(page.locator('#modal-title')).toHaveText('보관함이 찼어요');
  await expect(page.locator('#recover, #undo, #hint')).toHaveCount(0);
  await page.screenshot({path:`artifacts/lost-${isMobile?'mobile':'desktop'}.png`});
  await page.locator('#replay').click();
  expect((await state(page)).state).toBe('playing');
  expect((await state(page)).moves).toBe(0);
  expect((await state(page)).buffer).toEqual([]);
  await expect(page.locator('#modal')).toBeHidden();
});
