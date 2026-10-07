import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('real desktop selection shows white move boundary and click locks route independently of hover',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:1920,height:1080});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('route-fixture');const w=h.getState().world!;w.turnNumber=3;w.round=2;w.ownTurns=[2,1];const dd=w.ships.find(s=>s.id==='0-destroyer-1')!;dd.x=4;dd.z=10;h.refresh();});
 await page.locator('#ship-picker [data-ship="0-destroyer-1"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movementOutlineVisible)).toBe(true);
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movementBoundaryEdges)).toBeGreaterThan(12);
 await mkdir('artifacts/tactical-lines',{recursive:true});await page.screenshot({path:'artifacts/tactical-lines/movement-white.png'});
 await page.locator('#action-torpedo').click();
 const clickMap=async(c:{x:number;z:number})=>{const b=await page.locator('#tactical-map').boundingBox();await page.mouse.click(b!.x+(c.x+.5)*b!.width/30,b!.y+(c.z+.5)*b!.height/30);};
 const target={x:12,z:10},hover={x:12,z:13};await clickMap(target);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoLockedTarget)).toEqual(target);
 const point=await page.evaluate(c=>window.__THREE_GAME_TEST_HOOKS__!.project(c),hover);await page.mouse.move(point.x,point.y);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoPreviewSteps)).toBeGreaterThan(0);
 const state=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(state.target).toEqual(target);const tracks=state.torpedoTracks as {role:string;style:string;cells:{x:number;z:number}[]}[];
 expect(tracks.find(t=>t.role==='locked')!.style).toBe('solid');expect(tracks.find(t=>t.role==='locked')!.cells.at(-1)).toEqual(target);expect(tracks.find(t=>t.role==='preview')!.cells.at(-1)).toEqual(hover);
 await page.screenshot({path:'artifacts/tactical-lines/locked-and-hover.png'});await page.mouse.move(4,4);await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoPreviewSteps)).toBe(0);expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoLockedTarget)).toEqual(target);
 await page.locator('#confirm-action').click();await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().friendlyTorpedoRoutes)).toBe(1);expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.torpedoes![0]!.target)).toEqual(target);expect(errors).toEqual([]);
});

test('sonar exposes red dashed enemy route in world and minimap; lost contact removes both',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:1920,height:1080});await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('detection-fixture');const w=h.getState().world!;w.turnNumber=3;w.ownTurns=[2,1];w.islands=[];const observer=w.ships.find(s=>s.id==='0-carrier')!;observer.x=12;observer.z=8;
 w.torpedoes=[{id:'red-contact',team:1,x:9,z:2,heading:Math.PI/2,source:{x:4,z:2},shipId:'1-destroyer-1',target:{x:19,z:2},route:Array.from({length:15},(_,i)=>({x:5+i,z:2})),index:5,nextAdvanceAt:4,sourceVisibility:[false,true]}];h.refresh();h.select(observer.id);});
 expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.torpedoes)).toEqual([]);
 const redPixels=()=>page.locator('#tactical-map').evaluate((c:HTMLCanvasElement)=>{const d=c.getContext('2d')!.getImageData(120,29,90,2).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]<120&&d[i+2]<140)n++;return n;});expect(await redPixels()).toBe(0);
 await page.locator('#action-sonar').click();await page.locator('#confirm-action').click();await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().detectedEnemyTorpedoRoutes)).toBe(1);expect(await redPixels()).toBeGreaterThan(30);
 const t=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.torpedoes![0]!);expect(t.route).toHaveLength(10);expect(t.target).toBeUndefined();
 await page.screenshot({path:'artifacts/tactical-lines/enemy-red-sonar.png'});
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!,w=h.getState().world!;w.sonar=[];h.refresh();});await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().detectedEnemyTorpedoRoutes)).toBe(0);expect(await redPixels()).toBe(0);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!,w=h.getState().world!,s=w.ships.find(s=>s.id==='0-carrier')!;s.x=10;s.z=2;h.refresh();});await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().detectedEnemyTorpedoRoutes)).toBe(1);
});


test('Space inspects closer, follows animated XZ movement with bow waves, and manual pan releases follow',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:1600,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('follow-fixture');const w=h.getState().world!;w.turnNumber=3;w.ownTurns=[2,1];w.islands=[];const dd=w.ships.find(s=>s.id==='0-destroyer-1')!;dd.x=10;dd.z=10;h.refresh();h.select(dd.id);});
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShips),{timeout:45000}).toBe(0);
 await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {distance:number}).distance)).toBeLessThan(3.3);
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {focusing:boolean}).focusing),{timeout:15000}).toBe(false);const before=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(before.followShipId).toBe('0-destroyer-1');const c=before.camera as {position:number[];target:number[];distance:number};
 const map=await page.locator('#tactical-map').boundingBox();await page.mouse.click(map!.x+13.5*map!.width/30,map!.y+10.5*map!.height/30,{button:'right'});
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShipWakes)).toBeGreaterThan(0);
 await page.waitForTimeout(650);const during=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState()),d=during.camera as typeof c,pos=(during.shipPositions as Record<string,number[]>)['0-destroyer-1']!;
 expect(during.followShipId).toBe('0-destroyer-1');expect(d.target[0]-c.target[0]).toBeGreaterThan(1);expect(d.target[0]).toBeCloseTo(pos[0],1);expect(d.target[2]).toBeCloseTo(pos[2],1);expect(d.position[1]).toBeCloseTo(c.position[1],1);expect(d.distance).toBeCloseTo(c.distance,1);expect(during.shipWakeDrawCalls).toBe(0);expect(during.wakePhysics).toBe('finite-depth-dispersive-heightfield');expect(during.wakeFoamMass).toBeGreaterThan(0);expect(during.wakeSurfaceTriangles).toBeLessThanOrEqual(20000);
 await page.screenshot({path:'artifacts/tactical-lines/f-follow-bow-waves.png'});
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShips),{timeout:15000}).toBe(0);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().movingShipWakes),{timeout:15000}).toBe(0);
 const stopped=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(stopped.wakeFoamMass).toBeGreaterThan(0);await page.waitForTimeout(1200);const later=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(later.wakeFoamMass).toBeGreaterThan(0);expect(later.wakeFoamMass).toBeLessThan(stopped.wakeFoamMass as number);await page.screenshot({path:'artifacts/tactical-lines/persistent-wake-after-stop.png'});
 await page.keyboard.down('KeyW');await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().followShipId)).toBeNull();await page.keyboard.up('KeyW');await page.keyboard.press('Space');expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().followShipId)).toBe('0-destroyer-1');await page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__ as any).home());expect(await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().followShipId)).toBeNull();expect(errors).toEqual([]);
});
