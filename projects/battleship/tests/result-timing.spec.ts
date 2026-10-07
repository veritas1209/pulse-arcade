import {test,expect} from '@playwright/test';
test('final victory waits for projectile and full sinking; rediscovered wreck does not block result',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('damage');const w=h.getState().world!;w.recon=[];w.sonar=[];w.history=[];w.lastShot=undefined;w.shotEvents=[];
  for(const s of w.ships.filter(s=>s.team===1)){s.sunk=true;s.hp=0;s.ap=0;}
  h.refresh();const enemy=w.ships.find(s=>s.id==='1-battleship-1')!;enemy.sunk=false;enemy.hp=100;enemy.x=2;enemy.z=3;
  h.refresh();
 });
 await page.waitForFunction(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!.getState(),p=h.damagePreparation as {status:string;pending:number;queued:unknown[]};return h.texturesReady&&!h.presentationBusy&&p.status==='ready'&&p.pending===0&&p.queued.length===0;},{},{timeout:30000});
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.select('0-destroyer-1');h.command({type:'attack',shipId:'0-destroyer-1',target:{x:2,z:3},localHit:{x:0,z:-.8}});
 });
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.command({type:'end'}));
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.combatPhase)).toBe('attack');
 await expect(page.locator('#result-panel')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sinkExplosionCount),{timeout:15000}).toBe(1);
 await expect(page.locator('#result-panel')).toBeHidden();await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().waterRings)).toBeGreaterThan(0);await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState() as any;return d.sinkingWater.spray>20&&d.sinkExplosions[0]?.age>.6;});await page.screenshot({path:'artifacts/movement-concurrency/sink-pulse.png'});await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__!.getState() as any;return d.sinkingWater.waterReturns>20&&d.sinkExplosions[0]?.age>1.8;});await page.screenshot({path:'artifacts/movement-concurrency/sink-water-return.png'});
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().presentationBusy),{timeout:30000}).toBe(false);
 await expect(page.locator('#result-panel')).toBeVisible({timeout:45000});await expect(page.locator('#result-title')).toHaveText('승리');
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.refresh());
 await expect(page.locator('#result-panel')).toBeVisible();expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sinkExplosionCount)).toBe(1);
 expect(errors).toEqual([]);
});
for(const visible of [true,false])test(`final torpedo carrier sinking waits for arrival and destruction (${visible?'visible contact':'hidden contact'})`,async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(visible=>{
  const hooks=window.__THREE_GAME_TEST_HOOKS__!;hooks.setState('damage');const world=hooks.getState().world!;
  world.islands=[];world.recon=[];world.sonar=[];world.history=[];world.lastShot=undefined;world.shotEvents=[];world.torpedoes=[];
  for(const ship of world.ships.filter(ship=>ship.team===1)){ship.sunk=true;ship.hp=0;ship.ap=0;ship.x=29;ship.z=29;}
  // Remove prior contact before creating this canonical visible victim: its old
  // rendered position must not still be traversing an 80-world reposition.
  hooks.refresh();
  const carrier=world.ships.find(ship=>ship.id==='1-carrier')!;Object.assign(carrier,{sunk:false,hp:300,x:8,z:2,damageControl:true});
  Object.assign(world.ships.find(ship=>ship.id==='0-destroyer-1')!,{x:4,z:2,ap:4,torpedoed:false});
  if(visible)Object.assign(world.ships.find(ship=>ship.id==='0-carrier')!,{x:7,z:2});
  hooks.refresh();
 },visible);
 await page.waitForFunction(()=>{
  const state=window.__THREE_GAME_TEST_HOOKS__!.getState(),preparation=state.damagePreparation as {status:string;pending:number;queued:unknown[]};
  return state.texturesReady&&!state.presentationBusy&&preparation.status==='ready'&&preparation.pending===0&&preparation.queued.length===0;
 },{},{timeout:30000});
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.revealed.some(ship=>ship.id==='1-carrier'))).toBe(visible);
 await page.evaluate(()=>{
  const hooks=window.__THREE_GAME_TEST_HOOKS__!;hooks.select('0-destroyer-1');
  hooks.command({type:'torpedo',shipId:'0-destroyer-1',target:{x:14,z:2}});
 });
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.torpedoes?.length)).toBe(1);expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.queuedAttacks?.length)).toBe(0);
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.command({type:'end'}));
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.combatPhase)).toBe('attack');
 await expect(page.locator('#result-panel')).toBeHidden();
 await page.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.lastShot?.kind==='torpedo');
 const final=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state);
 expect(final.shots?.[0]).toMatchObject({kind:'torpedo',damage:300,sunk:true});expect(final.shots?.[0]?.targetBefore?.id).toBe('1-carrier');
 await expect.poll(()=>page.evaluate(()=>{
  const state=window.__THREE_GAME_TEST_HOOKS__!.getState();
  return (state.unseenSinks as {phase:string}[]).some(sink=>sink.phase==='sinking');
 }),{timeout:15000}).toBe(true);
 await expect(page.locator('#result-panel')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sinkExplosionCount),{timeout:15000}).toBe(1);
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sinkingShips as string[])).toContain('1-carrier');
 await expect(page.locator('#result-panel')).toBeVisible({timeout:30000});await expect(page.locator('#result-title')).toHaveText('승리');
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().presentationBusy)).toBe(false);
 const explosions=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sinkExplosionCount);
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.refresh());
 await expect(page.locator('#result-panel')).toBeVisible();expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().sinkExplosionCount)).toBe(explosions);
 expect(errors).toEqual([]);
});
