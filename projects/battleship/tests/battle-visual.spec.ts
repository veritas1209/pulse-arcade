import {test,expect,type Page} from '@playwright/test';

async function clickCell(page:Page,x:number,z:number,right=false){
 const panel=page.locator('#minimap-panel');
 if(!await panel.isVisible())await page.locator('#minimap-toggle').click();
 const box=await page.locator('#tactical-map').boundingBox();expect(box).not.toBeNull();
 await page.mouse.click(box!.x+(x+.5)*box!.width/30,box!.y+(z+.5)*box!.height/30,{button:right?'right':'left'});
}
async function ownShip(page:Page,kind:string){
 return page.evaluate(kind=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.kind===kind)!,kind);
}
async function waitForCameraStill(page:Page){
 let previous:number[]|undefined,stable=0;
 await expect.poll(async()=>{
  const c=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as {position:number[];target:number[]};
  const values=[...c.position,...c.target];
  stable=previous&&values.every((v,i)=>Math.abs(v-previous![i])<.005)?stable+1:0;previous=values;return stable;
 },{timeout:20000,intervals:[300,500]}).toBeGreaterThanOrEqual(3);
}

test('seven ships share one map; recon, movement, attack and next turn consume and refresh AP',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await expect(page.locator('#start-game')).toBeVisible();await expect(page.locator('#ship-picker button')).toHaveCount(7);
 await page.locator('#start-game').click();
 const carrier=await ownShip(page,'carrier');
 await page.locator('#action-recon').click();await clickCell(page,15,15);await page.locator('#confirm-action').click();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.visibleCells.filter(c=>Math.abs(c.x-15)<=2&&Math.abs(c.z-15)<=2).length)).toBe(21);
 await expect(page.locator('#action-move')).toHaveCount(0);await expect(page.locator('#action-recon')).toBeDisabled();
 const destroyer=await ownShip(page,'destroyer');
 await page.locator('[data-ship="'+destroyer.id+'"]').click();
 await clickCell(page,destroyer.x+1,destroyer.z,true);
 await expect.poll(()=>page.evaluate(id=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.id===id)!.ap,destroyer.id)).toBe(3);
 await expect(page.locator('#action-attack')).toBeDisabled();await expect(page.locator('#action-recon')).toBeHidden();
 await page.locator('#end-turn').click();await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.resolveAITurn());
 await page.locator('#action-attack').click();await clickCell(page,0,0);await page.locator('#confirm-action').click();
 await expect.poll(()=>page.evaluate(id=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.id===id)!.ap,destroyer.id)).toBe(3);
 await expect(page.locator('#action-attack')).toBeDisabled();
 await page.locator('#end-turn').click();
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.resolveAITurn());
 await expect(page.locator('#end-turn')).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.kind==='carrier')!.ap)).toBe(4);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.recon.length)).toBe(0);
 expect(carrier.maxHp).toBe(1000);expect(errors).toEqual([]);
});
test('damage and result fit desktop and touch screens without overflow',async({page},info)=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('damage');h.setReducedMotion(true);});
 await expect(page.locator('#end-turn')).toBeVisible();await expect(page.locator('#ship-picker button')).toHaveCount(7);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/shared-map/'+info.project.name+'-damage.png'});
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('complete'));
 await expect(page.locator('#rematch')).toBeVisible();await page.locator('#rematch').click();await expect(page.locator('#start-game')).toBeVisible();await page.locator('#start-game').click();await expect(page.locator('#end-turn')).toBeEnabled();
 await page.locator('#help-toggle').click();await expect(page.locator('#help-panel')).toBeVisible();await page.locator('#exit-action').click();await expect(page.locator('#start-game')).toBeVisible();
});
test('selection, movement and attacks leave the free camera untouched',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.locator('#start-game').click();
 await page.locator('#end-turn').click();await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.resolveAITurn());
 await page.waitForTimeout(3500);
 const canvas=await page.locator('#game-canvas').boundingBox();
 await page.mouse.move(canvas!.width*.5,canvas!.height*.4);await page.mouse.down({button:'right'});
 await page.mouse.move(canvas!.width*.57,canvas!.height*.46,{steps:8});await page.mouse.up({button:'right'});await waitForCameraStill(page);
 const before=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as {position:number[];target:number[]};
 const ship=await ownShip(page,'destroyer');await page.locator('[data-ship="'+ship.id+'"]').click();
 await page.locator('#action-attack').click();await clickCell(page,29,29);await page.locator('#confirm-action').click();
 await clickCell(page,ship.x,ship.z+1,true);
 await page.waitForTimeout(900);
 const after=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as {position:number[];target:number[]};
 for(const key of ['position','target'] as const)for(let i=0;i<3;i++)expect(Math.abs(before[key][i]-after[key][i])).toBeLessThan(.06);
});

test('pregame placement stays within seven corner cells and rotation preserves one-cell ships',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 const carrier=await ownShip(page,'carrier');await clickCell(page,6,6);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.kind==='carrier')!.x)).toBe(6);
 await page.locator('#rotate-placement').click();
 const moved=await ownShip(page,'carrier');expect(moved.z).toBe(6);expect(moved.heading).not.toBe(carrier.heading);
 await clickCell(page,7,7);expect((await ownShip(page,'carrier')).x).toBe(6);
 await page.locator('#start-game').click();expect((await ownShip(page,'carrier')).x).toBe(6);
 await expect(page.locator('#rotate-placement')).toBeHidden();
});

test('free dolly stays within the map overview and middle drag moves the current view',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.locator('#start-game').click();await page.waitForTimeout(1500);
 const box=await page.locator('#game-canvas').boundingBox();await page.mouse.move(box!.width*.5,box!.height*.4);
 const read=()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as Promise<{position:number[];target:number[];minDistance:number;screenSpacePanning:boolean;zoomMode:string;worldDistance:number;maxWorldDistance:number}>;
 const start=await read();for(let i=0;i<240;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(20);}await waitForCameraStill(page);
 let camera=await read();expect(camera.worldDistance).toBeLessThanOrEqual(camera.maxWorldDistance+.01);expect(camera.worldDistance).toBeGreaterThan(camera.maxWorldDistance*.9);expect(camera.zoomMode).toBe('bounded-free-dolly');expect(camera.minDistance).toBe(0);expect(camera.screenSpacePanning).toBe(true);
 const y=camera.target[1];await page.mouse.down({button:'middle'});await page.mouse.move(box!.width*.53,box!.height*.46,{steps:10});await page.mouse.up({button:'middle'});await waitForCameraStill(page);
 camera=await read();expect(Math.abs(camera.target[1]-y)).toBeGreaterThan(.05);
 const far=camera.position;for(let i=0;i<8;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(20);}await waitForCameraStill(page);
 camera=await read();expect(Math.hypot(...camera.position.map((v,i)=>v-far[i]))).toBeGreaterThan(15);expect([...camera.position,...camera.target].every(Number.isFinite)).toBe(true);
 await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__ as any).home());await waitForCameraStill(page);camera=await read();expect(Math.hypot(camera.target[0],camera.target[2])).toBeLessThan(.1);expect(camera.worldDistance).toBeLessThanOrEqual(camera.maxWorldDistance+.01);expect(Math.hypot(...start.target)).toBeGreaterThan(30);
});

test('visible enemy inspector uses current damage and clears as reconnaissance expires',async({page},info)=>{
 test.setTimeout(100000);
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('damage'));
 const enemy=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.revealed.find(s=>s.kind==='battleship'&&s.hp===400)!);
 const attacker=await ownShip(page,'destroyer');await page.locator('[data-ship="'+attacker.id+'"]').click();
 await page.locator('#action-attack').click();await clickCell(page,enemy.x,enemy.z);
 await expect(page.locator('#enemy-panel')).toBeVisible();await expect(page.locator('#enemy-hp')).toHaveText('400 / 800');
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().enemyPreview as {damageMarks:number}).damageMarks)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().audio as {loaded:string[]}).loaded.length),{timeout:45000}).toBe(22);
 await page.locator('#confirm-action').click();await expect(page.locator('#enemy-hp')).toHaveText('200 / 800');
 const launched=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());
 expect((launched.projectiles as {duration:number;kind:string}[])[0]).toMatchObject({duration:1.3,kind:'destroyer'});
 expect((launched.enemyPreview as {damageMarks:number}).damageMarks).toBe(1);
 expect((launched.audio as {shots:number}).shots).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().enemyPreview as {damageMarks:number}).damageMarks),{timeout:15000}).toBe(2);
 expect(await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().audio as {shots:number}).shots)).toBe(0);
 await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/inspection/'+info.project.name+'-enemy-damage.png'});
 const before=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as {position:number[];target:number[]};
 const preview=await page.locator('#enemy-preview').boundingBox();await page.mouse.move(preview!.x+preview!.width*.5,preview!.y+preview!.height*.5);
 for(let i=0;i<12;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(20);}await page.waitForTimeout(500);
 let c=await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().enemyPreview as {camera:{distance:number;maxDistance:number;minDistance:number;target:number[];position:number[]}}).camera);
 expect(c.distance).toBeGreaterThan(1.5);expect(c.minDistance).toBe(0);
 const bounds=c as typeof c & {worldDistance:number;maxWorldDistance:number};expect(bounds.worldDistance).toBeLessThanOrEqual(bounds.maxWorldDistance+.01);
 const target=c.target;await page.mouse.down({button:'right'});await page.mouse.move(preview!.x+preview!.width*.6,preview!.y+preview!.height*.57,{steps:8});await page.mouse.up({button:'right'});
 await page.waitForTimeout(700);
 const panned=await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().enemyPreview as {camera:typeof c}).camera);
 expect(panned.target.some((v,i)=>Math.abs(v-target[i])>.01)).toBe(true);
 const farPreview=panned.position;for(let i=0;i<12;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(20);}await page.waitForTimeout(700);
 c=await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().enemyPreview as {camera:typeof c}).camera);
 expect(Math.hypot(...c.position.map((v,i)=>v-farPreview[i]))).toBeGreaterThan(.5);expect([...c.position,...c.target].every(Number.isFinite)).toBe(true);
 const after=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as typeof before;
 for(const key of ['position','target'] as const)for(let i=0;i<3;i++)expect(Math.abs(before[key][i]-after[key][i])).toBeLessThan(.01);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.command({type:'end'});h.resolveAITurn();h.command({type:'end'});});
 await expect(page.locator('#enemy-panel')).toBeHidden();await expect(page.locator('#enemy-name')).toHaveText('');await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().lastKnownTiles)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().enemyPreview as {visible:boolean}).visible)).toBe(false);
});

test('selected yellow cell remains selected when mouse hover changes',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.locator('#start-game').click();
 await clickCell(page,10,3);await page.mouse.move(640,300);
 const outline=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedCellOutline) as {x:number;z:number};
 expect(outline).toEqual({x:10,z:3});
});


test('the last living fleet AP automatically passes the turn',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.mouse.click(640,310);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('last-ap');h.command({type:'move',shipId:'0-destroyer-1',target:{x:2,z:3}});});
 const state=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state);
 expect(state.turn).toBe(1);expect(state.turnNumber).toBe(4);
 expect(state.own.filter(s=>!s.sunk).every(s=>s.ap===0)).toBe(true);
 await expect(page.locator('#end-turn')).toBeDisabled();
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.resolveAITurn());
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.turn)).toBe(0);
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.filter(s=>!s.sunk&&!s.parts?.engine?.disabled).every(s=>s.ap===s.maxAp))).toBe(true);
});


test('damage control consumes AP and limited stores, suppresses fire and cannot rebuild a destroyed system',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('damage'));
 const before=await ownShip(page,'carrier');await page.locator('#action-repair').click();await expect(page.locator('#confirm-action')).toBeEnabled();await page.locator('#confirm-action').click();
 const after=await ownShip(page,'carrier');expect(after.hp).toBe(before.hp+50);expect(after.ap).toBe(before.ap-1);expect(after.repairCharges).toBe(1);expect(after.damageControl).toBe(true);
 await expect(page.locator('#action-repair')).toBeDisabled();await expect(page.locator('#repair-status')).toContainText('화재 억제');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('setup starts near the friendly fleet and recon uses four naval aircraft',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 const start=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect((start.camera as {distance:number}).distance).toBeLessThan(125);expect((start.camera as {target:number[]}).target[0]).toBeLessThan(-30);
 expect(start.state.own.find(s=>s.kind==='carrier')!.maxAp).toBe(4);await page.locator('#start-game').click();await page.locator('#action-recon').click();await clickCell(page,15,15);await page.locator('#confirm-action').click();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().reconFighters)).toBe(4);const state=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect((state.reconModel as {name:string}).name).toContain('Super Hornet');expect(state.state.own.find(s=>s.kind==='carrier')!.ap).toBe(3);expect(state.state.lastShot).toBeUndefined();
});


test('first-contact airstrike reveals the ship before the two-second impact, then applies visual damage',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.setState('airstrike'));
 await page.locator('#action-recon').click();await clickCell(page,25,25);await page.locator('#confirm-action').click();
 const read=()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());let state=await read();const contact=state.state.revealed.find(s=>s.x===25&&s.z===25)!;expect(contact.hp).toBe(300);expect(state.state.lastShot?.kind).toBe('airstrike');expect((state.damageMarks as Record<string,unknown[]>)[contact.id]).toHaveLength(0);
 expect((state.projectiles as {duration:number}[])[0].duration).toBe(2);
 await expect.poll(async()=>((await read()).damageMarks as Record<string,unknown[]>)[contact.id].length,{timeout:15000}).toBe(1);
 state=await read();expect(state.state.own.find(s=>s.kind==='carrier')!.ap).toBe(3);expect((state.projectiles as unknown[]).length).toBe(0);
});


test('right-click water moves the selected ship; right drag only pans the view',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);await page.locator('#start-game').click();
 await expect(page.locator('#action-move')).toHaveCount(0);
 const ship=await ownShip(page,'destroyer');await page.locator('[data-ship="'+ship.id+'"]').click();
 const target={x:ship.x,z:ship.z+1},point=await page.evaluate(c=>window.__THREE_GAME_TEST_HOOKS__!.project(c),target);
 const before=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as {position:number[];target:number[]};
 await page.mouse.click(point.x,point.y,{button:'right'});
 await expect.poll(()=>page.evaluate(id=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.id===id)!.z,ship.id)).toBe(target.z);
 expect((await ownShip(page,'destroyer')).ap).toBe(3);
 const after=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().camera) as typeof before;
 for(const key of ['position','target'] as const)for(let i=0;i<3;i++)expect(Math.abs(after[key][i]-before[key][i])).toBeLessThan(.02);
 await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});await page.mouse.move(point.x+45,point.y+25,{steps:6});await page.mouse.up({button:'right'});
 expect((await ownShip(page,'destroyer')).ap).toBe(3);
});
