import {expect,test,type Page} from '@playwright/test';

type Kind='carrier'|'destroyer'|'battleship';

async function prepareBattle(page:Page,kind:Kind='carrier'){
 await page.goto('/');
 await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.locator('#start-game').click();
 await page.evaluate(selectedKind=>{
  const h=window.__THREE_GAME_TEST_HOOKS__ as any,w=h.getState().world as any;
  h.seed(5195);w.phase='battle';w.turn=0;w.turnNumber=3;w.round=2;w.winner=null;w.ownTurns=[2,1];w.islands=[];w.recon=[];w.sonar=[];w.torpedoes=[];w.shotEvents=[];w.history=[];
  const friendly=w.ships.filter((s:any)=>s.team===0),positions=[[15,15],[14,15],[16,15],[15,14],[15,16]];
  friendly.forEach((s:any,i:number)=>{s.x=positions[i][0];s.z=positions[i][1];s.hp=s.maxHp;s.ap=s.maxAp;s.sunk=false;s.attacked=false;s.moved=false;s.scouted=false;s.sonared=false;s.torpedoed=false;s.repaired=false;s.damageControl=false;for(const p of Object.values(s.parts??{}) as any[]){p.hp=p.maxHp;p.disabled=false;}});
  const enemies=w.ships.filter((s:any)=>s.team===1),enemyPositions=[[24,15],[29,29],[28,29],[29,28],[28,28]];
  enemies.forEach((s:any,i:number)=>{s.x=enemyPositions[i][0];s.z=enemyPositions[i][1];s.hp=s.maxHp;s.ap=s.maxAp;s.sunk=false;s.attacked=false;s.moved=false;s.scouted=false;s.sonared=false;s.torpedoed=false;s.repaired=false;s.damageControl=false;for(const p of Object.values(s.parts??{}) as any[]){p.hp=p.maxHp;p.disabled=false;}});
  h.select(friendly.find((s:any)=>s.kind===selectedKind).id);h.refresh();
 },kind);
}

async function clickMapCell(page:Page,x:number,z:number){
 const panel=page.locator('#minimap-panel');
 if(!await panel.isVisible())await page.locator('#minimap-toggle').click();
 const box=await page.locator('#tactical-map').boundingBox();expect(box).not.toBeNull();
 await page.mouse.click(box!.x+(x+.5)*box!.width/30,box!.y+(z+.5)*box!.height/30);
}

async function expectActions(page:Page,kind:Kind,ids:string[]){
 const ship=await page.evaluate(k=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.kind===k)!,kind);
 await page.locator(`[data-ship="${ship.id}"]`).click();
 await expect(page.locator('.action-picker .action-button:visible')).toHaveCount(ids.length);
 expect(await page.locator('.action-picker .action-button:visible').evaluateAll(buttons=>buttons.map(b=>b.id))).toEqual(ids);
 expect(await page.locator('.action-picker').evaluate(p=>p.scrollWidth<=p.clientWidth&&[...p.querySelectorAll<HTMLElement>('.action-button:not([hidden])')].every(b=>b.getBoundingClientRect().left>=p.getBoundingClientRect().left-1&&b.getBoundingClientRect().right<=p.getBoundingClientRect().right+1))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test('responsive ship commands expose the right actions and sonar is centered, limited, and bridge-dependent',async({page})=>{
 await prepareBattle(page);
 await expectActions(page,'carrier',['action-recon','action-sonar','action-repair']);
 await expectActions(page,'destroyer',['action-attack','action-sonar','action-torpedo','action-repair']);
 await expectActions(page,'battleship',['action-attack','action-sonar','action-repair']);
 const carrier=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.own.find(s=>s.kind==='carrier')!);
 await page.locator(`[data-ship="${carrier.id}"]`).click();
 await page.evaluate(id=>{const h=window.__THREE_GAME_TEST_HOOKS__ as any,w=h.getState().world as any,s=w.ships.find((v:any)=>v.id===id);s.parts.bridge.hp=0;s.parts.bridge.disabled=true;h.refresh();},carrier.id);
 await expect(page.locator('#action-sonar')).toBeDisabled();await expect(page.locator('#action-sonar')).toHaveAttribute('title','함교 파괴');
 await page.evaluate(id=>{const h=window.__THREE_GAME_TEST_HOOKS__ as any,w=h.getState().world as any,s=w.ships.find((v:any)=>v.id===id);s.parts.bridge.hp=s.parts.bridge.maxHp;s.parts.bridge.disabled=false;h.refresh();},carrier.id);
 expect((await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state.revealed)).some(s=>s.x===24&&s.z===15)).toBe(false);
 await page.locator('#action-sonar').click();await expect(page.locator('#confirm-action')).toBeEnabled();await expect(page.locator('#confirm-action span')).toHaveText('현재 함선 중심');await page.locator('#confirm-action').click();
 const state=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState().state,);
 const used=state.own.find(s=>s.id===carrier.id)!;expect(used.ap).toBe(carrier.maxAp-2);expect(used.sonared).toBe(true);expect(state.sonar).toHaveLength(1);expect(state.sonar![0]).toMatchObject({shipId:carrier.id,center:{x:15,z:15},expiresAt:5});
 expect(state.visibleCells).toHaveLength(441);expect(state.revealed.some(s=>s.x===24&&s.z===15)).toBe(true);
 await expect(page.locator('#action-sonar')).toBeDisabled();await expect(page.locator('#action-sonar')).toHaveAttribute('title','이번 턴 소나 완료');
});

test('destroyer torpedo uses a real minimap target, launches without instant damage, and advances five cells next turn',async({page})=>{
 await prepareBattle(page,'destroyer');
 const fixture=await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__ as any,w=h.getState().world as any,dd=w.ships.find((s:any)=>s.team===0&&s.kind==='destroyer'),victim=w.ships.find((s:any)=>s.team===1&&s.kind==='battleship');dd.x=10;dd.z=10;victim.x=20;victim.z=10;for(const key of ['engine','weapon','bridge']){const part=victim.parts[key];part.hp=0;part.disabled=true;}victim.repairCharges=0;h.select(dd.id);h.refresh();return{ddId:dd.id,victimId:victim.id,ap:dd.ap,hp:victim.hp};});
 await page.locator('#action-torpedo').click();await clickMapCell(page,20,10);
 const selected=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__!.getState());expect(selected.target).toEqual({x:20,z:10});expect(selected.selectedCellOutline).toEqual({x:20,z:10});
 const pixel=await page.locator('#tactical-map').evaluate((canvas:HTMLCanvasElement)=>[...canvas.getContext('2d')!.getImageData((20.5)*12,(10.5)*12,1,1).data]);expect(pixel[0]).toBeGreaterThan(pixel[1]);
 await expect(page.locator('#confirm-action')).toBeEnabled();await page.locator('#confirm-action').click();
 let launched=await page.evaluate(ids=>{const h=window.__THREE_GAME_TEST_HOOKS__ as any,w=h.getState().world as any;return{ship:w.ships.find((s:any)=>s.id===ids.ddId),victim:w.ships.find((s:any)=>s.id===ids.victimId),torpedoes:w.torpedoes};},fixture);
 expect(launched.ship.ap).toBe(fixture.ap-1);expect(launched.ship.torpedoed).toBe(true);expect(launched.victim.hp).toBe(fixture.hp);expect(launched.torpedoes).toHaveLength(1);expect(launched.torpedoes[0]).toMatchObject({x:10,z:10,target:{x:20,z:10},index:0});
 await page.locator('#end-turn').click();
 const advanced=await page.evaluate(victimId=>{const h=window.__THREE_GAME_TEST_HOOKS__ as any,w=h.getState().world as any;return{torpedoes:w.torpedoes,victim:w.ships.find((s:any)=>s.id===victimId)};},fixture.victimId);
 expect(advanced.torpedoes).toHaveLength(1);expect(advanced.torpedoes[0]).toMatchObject({x:15,z:10,index:5});expect(advanced.victim.hp).toBe(fixture.hp);
});
