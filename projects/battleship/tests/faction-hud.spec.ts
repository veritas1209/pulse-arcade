import {test,expect} from '@playwright/test';
import {fleetLabelLayout,healthCellFraction,FACTION_COLORS} from '../src/naval/fleet-label';

test('distance widths are bounded, exact health stays faction-colored, torpedoes have no HP',()=>{
 const unit={kind:'destroyer' as const};
 const sizes=[0,30,100,400,2000].map(p=>fleetLabelLayout(p,1280,unit));
 expect(sizes.map(s=>s.width)).toEqual([...sizes.map(s=>s.width)].sort((a,b)=>a-b));
 expect(sizes[0].width).toBe(18);expect(sizes.at(-1)!.width).toBe(208);
 expect(sizes[0].detailed).toBe(false);expect(sizes[0].height).toBe(sizes[0].width);expect(fleetLabelLayout(80,1280,{kind:'destroyer',selected:true}).compact).toBe(true);expect(sizes.at(-1)!.detailed).toBe(true);
 expect(fleetLabelLayout(1000,390,unit).width).toBeLessThanOrEqual(390*.38);
 expect(healthCellFraction(341,500,6)).toBeCloseTo(.82);expect(healthCellFraction(341,500,7)).toBe(0);
 expect(healthCellFraction(0,0,0)).toBe(0);expect(FACTION_COLORS).toEqual({ally:'#65a7ff',enemy:'#ff626c'});
 for(const pixels of [0,27,28,70,100,300])for(const selected of [false,true])expect(fleetLabelLayout(pixels,1280,{kind:'destroyer',selected,hovered:true})).toEqual(fleetLabelLayout(pixels,1280,{kind:'destroyer',selected,hovered:false}));
 expect(fleetLabelLayout(1000,1280,{kind:'torpedo'})).toMatchObject({width:120,detailed:false,height:26});
});

test('visible ships and detected MK48s get approved faction banners in overview and inspection',async({page},info)=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{
  const h=window.__THREE_GAME_TEST_HOOKS__!;h.setState('route-fixture');const w=h.getState().world!;
  const ally=w.ships.find(s=>s.team===0&&s.kind==='destroyer')!,enemy=w.ships.find(s=>s.team===1&&s.kind==='battleship')!;enemy.x=ally.x+2;enemy.z=ally.z;enemy.hp=341;
  const base={source:{x:ally.x,z:ally.z},shipId:ally.id,target:{x:ally.x+5,z:ally.z},route:[{x:ally.x+5,z:ally.z}],index:0,nextAdvanceAt:20,sourceVisibility:[true,true] as [boolean,boolean],heading:0};
  w.torpedoes=[{...base,id:'hud-ally',team:0,x:ally.x+1,z:ally.z+1},{...base,id:'hud-enemy',team:1,x:ally.x+2,z:ally.z+1}];h.refresh();h.select(ally.id);
 });
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().texturesReady),{timeout:40000}).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoNameplates)).toBe(2);
 const far=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().fleetLabels) as any[];
 expect(far.some(l=>!l.friendly&&l.kind==='battleship'&&l.color==='#ff626c')).toBe(true);
 expect(far.filter(l=>l.kind==='torpedo').map(l=>l.hp)).toEqual([null,null]);
 expect(far.filter(l=>l.friendly).every(l=>l.color==='#65a7ff')).toBe(true);
 const selected=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().selectedId);
 const farWidth=far.find(l=>l.id===selected)!.width;
 await page.screenshot({path:`artifacts/faction-hud/${info.project.name}-fleet.png`});
 await page.keyboard.press('Space');
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().camera as {focusing:boolean}).focusing),{timeout:30000}).toBe(false);
 const near=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().fleetLabels) as any[];
 expect(near.find(l=>l.id===selected)!.width).toBeGreaterThan(farWidth);expect(near.find(l=>l.id===selected)!.detailed).toBe(true);
 expect(near.every(l=>l.width<=208&&l.width<=Math.max(76,info.project.use.viewport!.width*.38))).toBe(true);
 await page.screenshot({path:`artifacts/faction-hud/${info.project.name}-inspect.png`});
 // Out-of-sight enemy labels must disappear with the filtered view, never persist in the atlas submission.
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__!;const w=h.getState().world!;w.ships.filter(s=>s.team===1).forEach(s=>{s.x=27;s.z=27;});w.torpedoes=[];h.refresh();});
 await expect.poll(()=>page.evaluate(()=>(window.__THREE_GAME_TEST_HOOKS__!.getState().fleetLabels as any[]).filter(l=>!l.friendly).length)).toBe(0);
 await expect.poll(()=>page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().torpedoNameplates)).toBe(0);
 expect(errors).toEqual([]);
});
