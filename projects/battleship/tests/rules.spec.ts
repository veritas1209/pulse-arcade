import {activeFireMarks} from '../src/naval/fire-state';
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BOARD_SIZE, SHIPS, ISLANDS, createBattle, snapshot, applyAction as reserveAction, resolveAttackStep, reachableCells, chooseAIAction, cellKey, deploymentCells, placementValid, applyPlacement, startBattle, canAttack, isOpeningTurn, torpedoRoute, fallbackHit } from '../src/rules';
import type { BattleState, AIMemory } from '../src/rules';
import {WEAPON_REGIONS,SYSTEM_REGIONS,createParts,partAt,canRepairShip,partDisabled,canFireShip,canTorpedoShip,canReconShip,type PartId} from '../src/parts';
import type { BattleCommand, Cell, ShipKind } from '../src/contract';
function sourceHit(kind:ShipKind,system:PartId):Cell {
 if(system==='flightDeck')return {x:0,z:-.5};
 const regions=system==='weapon'?WEAPON_REGIONS[kind]:SYSTEM_REGIONS[kind].filter(r=>r.system===system);
 for(const r of regions){const points=[{x:(r.x0+r.x1)/2,z:(r.z0+r.z1)/2},...[.1,.5,.9].flatMap(x=>[.1,.5,.9].map(z=>({x:r.x0+(r.x1-r.x0)*x,z:r.z0+(r.z1-r.z0)*z})))];for(const hit of points)if(partAt(kind,hit)===system)return hit;}
 // Carrier AA retains the tactical deck-edge footprint when the imported source
 // has no separately tagged AA attachment. Avoid a source-specific bridge overlap.
 if(kind==='carrier'&&system==='airDefense')for(const x of [-.8,.8])for(const z of [-.5,0,.5]){const hit={x,z};if(partAt(kind,hit)===system)return hit;}
 throw new Error(`No actual source footprint for ${kind}/${system}`);
}
const seeded=(seed:number)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function ship(state:BattleState,id:string){return state.ships.find(s=>s.id===id)!;}
function act(state:BattleState,player:number,type:BattleCommand['type'],id?:string,target?:Cell,rng=()=>.9){return applyAction(state,player,{type,shipId:id,target},rng);}
// Test presentation driver: end declarations lock first; assertions may inspect the
// last impact before the following completion step commits turn damage and AP refresh.
function present(state:BattleState,rng=()=>.9):void {
 if(state.combatPhase==='action')expect(reserveAction(state,state.turn,{type:'end'}).ok).toBe(true);
 while(state.phase==='battle'&&(state.pendingTorpedoes.length||state.queuedAttacks[state.turn].length))expect(resolveAttackStep(state,rng).ok).toBe(true);
}
function finish(state:BattleState,rng=()=>.9):void {
 present(state,rng);if(state.phase==='battle'&&state.combatPhase==='attack')expect(resolveAttackStep(state,rng).ok).toBe(true);
}
function applyAction(state:BattleState,player:number,command:BattleCommand,rng=()=>.9){
 if(command.type==='end'&&state.combatPhase==='attack'&&state.turn===player&&state.connected.every(Boolean)){finish(state,rng);return {ok:true};}
 const result=reserveAction(state,player,command,rng);
 if(result.ok&&command.type==='end')finish(state,rng);
 return result;
}
function fireCommand(state:BattleState,player:number,command:BattleCommand,rng=()=>.9){const result=applyAction(state,player,command,rng);if(result.ok)present(state,rng);return result;}
function fire(state:BattleState,player:number,type:BattleCommand['type'],id?:string,target?:Cell,rng=()=>.9){const result=act(state,player,type,id,target,rng);if(result.ok)present(state,rng);return result;}
// Fixed deployment for pre-authored route/AP/privacy scenarios; independent of UI defaults.
const scenarioFleet: [string,number,number][]=[['carrier',3,1],['destroyer-1',1,3],['destroyer-2',5,3],['battleship-1',2,5],['battleship-2',4,5],['destroyer-3',6,0],['battleship-3',0,5]];
function routeBattle():BattleState {
 const state=createBattle();
 for(const team of [0,1])for(const [suffix,x,z] of scenarioFleet)Object.assign(ship(state,team+'-'+suffix),{x:team?29-x:x,z:team?29-z:z});
 return state;
}
function combatBattle():BattleState {const state=routeBattle();act(state,0,'end');act(state,1,'end');return state;}
function fixtureBattle():BattleState {
 const state=combatBattle();
 const xs=[14,4,24,9,19,0,29];
 for(const team of [0,1])state.ships.filter(s=>s.team===team).forEach((s,i)=>{s.x=xs[i]!;s.z=team?27:2;});
 return state;
}
test('free deployment accepts all 49 corner cells, rejects invalid fleets without mutation, and locks at battle start',()=>{
 const s=createBattle(false);expect(s.phase).toBe('setup');expect(s.ready).toEqual([false,false]);
 expect(deploymentCells(0)).toHaveLength(49);expect(deploymentCells(1)).toHaveLength(49);
 const fleet=s.ships.filter(s=>s.team===0).map((s,i)=>({id:s.id,x:i,z:6,heading:-Math.PI/2,hp:99999,ap:99}));
 expect(placementValid(fleet,0)).toBe(true);expect(placementValid(s.ships.filter(s=>s.team===1),1)).toBe(true);
 for(const bad of [fleet.slice(0,5),fleet.slice(1),fleet.map((p,i)=>i===0?{...p,x:7}:p),fleet.map((p,i)=>i===0?{...p,x:1}:p),fleet.map((p,i)=>i===0?{...p,id:'1-carrier'}:p),fleet.map((p,i)=>i===0?{...p,heading:Infinity}:p)]){
  const before=JSON.stringify(s);expect(applyPlacement(s,0,bad).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 }
 expect(applyPlacement(s,0,fleet).ok).toBe(true);expect(ship(s,'0-carrier')).toMatchObject({x:0,z:6,hp:1000,ap:4,heading:Math.PI*1.5});
 expect(snapshot(s,1).revealed).toEqual([]);expect(startBattle(s).ok).toBe(true);expect(s.ready).toEqual([true,true]);
 expect(applyPlacement(s,0,fleet).ok).toBe(false);
});
test('both opening turns forbid attack without AP, RNG, damage or state mutation, then each second turn permits fire',()=>{
 const s=createBattle();let draws=0;
 for(const team of [0,1]){
  expect(s.turn).toBe(team);expect(isOpeningTurn(snapshot(s,team))).toBe(true);expect(canAttack(snapshot(s,team))).toBe(false);
  const before=JSON.stringify(s);
  expect(fireCommand(s,team,{type:'attack',shipId:team+'-destroyer-1',target:ship(s,(1-team)+'-carrier'),localHit:{x:.5,z:-.5}},()=>{draws++;return .9;})).toMatchObject({ok:false,error:'첫 턴에는 공격할 수 없습니다'});
  expect(JSON.stringify(s)).toBe(before);expect(draws).toBe(0);
  expect(act(s,team,'recon',team+'-carrier',{x:15,z:15}).ok).toBe(true);
  expect(act(s,team,'move',team+'-destroyer-1',team?{x:27,z:25}:{x:2,z:4}).ok).toBe(true);
  expect(act(s,team,'end').ok).toBe(true);
 }
 for(const team of [0,1]){
  expect(s.turn).toBe(team);expect(canAttack(snapshot(s,team))).toBe(true);
  expect(act(s,team,'attack',team+'-destroyer-1',ship(s,(1-team)+'-destroyer-2')).ok).toBe(true);
  expect(ship(s,(1-team)+'-destroyer-2').hp).toBe(500);present(s);expect(ship(s,(1-team)+'-destroyer-2').hp).toBeLessThanOrEqual(300);act(s,team,'end');
 }
});
test('all AI difficulties scout and move without attacking either opening turn even with visible enemies',()=>{
 for(const difficulty of ['easy','normal','hard'] as const){
  const s=createBattle(),memory:AIMemory[]=[{},{}];
  for(const team of [0,1]){
   let moved=false,recon=false;
   for(let i=0;i<40&&s.turn===team;i++){
    const command=chooseAIAction(snapshot(s,team),difficulty,()=>0,memory[team])!;
    expect(command.type).not.toBe('attack');moved ||=command.type==='move';recon ||=command.type==='recon';
    expect(applyAction(s,team,command).ok).toBe(true);
   }
   expect(s.turn).toBe(1-team);expect(moved).toBe(true);expect(recon).toBe(true);
  }
  expect(s.turnNumber).toBe(3);expect(s.sequence).toBe(0);expect(s.ships.every(s=>s.hp===s.maxHp)).toBe(true);
 }
});
test('last AP spent on movement, recon or attack waits for explicit end, ignores wreck AP and refreshes only living opponents',()=>{
 for(const type of ['move','recon','attack'] as const){
  const s=combatBattle();s.islands=[];
  for(const own of s.ships.filter(s=>s.team===0))own.ap=0;
  const wreck=ship(s,'0-destroyer-2');wreck.sunk=true;wreck.hp=0;wreck.ap=99;
  for(const enemy of s.ships.filter(s=>s.team===1)){enemy.ap=0;enemy.moved=true;enemy.attacked=true;}
  const enemyWreck=ship(s,'1-destroyer-2');enemyWreck.sunk=true;enemyWreck.hp=0;
  const actor=ship(s,type==='recon'?'0-carrier':'0-destroyer-1');actor.ap=1;
  const target=type==='move'?{x:2,z:4}:type==='recon'?{x:26,z:28}:ship(s,'1-destroyer-1');
  const turnNumber=s.turnNumber,revision=s.revision;
  expect(act(s,0,type,actor.id,target).ok).toBe(true);
  expect(s).toMatchObject({phase:'battle',turn:0,turnNumber,revision:revision+1,winner:null});act(s,0,'end');expect(s.turn).toBe(1);
  expect(actor.ap).toBe(0);expect(wreck.ap).toBe(99);expect(enemyWreck.ap).toBe(0);
  for(const enemy of s.ships.filter(s=>s.team===1&&!s.sunk))expect(enemy).toMatchObject({ap:enemy.maxAp,attacked:false,moved:false});
  if(type==='recon')expect(snapshot(s,0).visibleCells.length).toBeGreaterThan(0);
  if(type==='attack')expect(s.lastShot).toMatchObject({sequence:1,damage:200,by:0});
  const before=JSON.stringify(s);expect(act(s,0,'end').ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 }
});
test('explicit end expires recon and scrubs revealed contacts while retaining the final shot; victory never advances',()=>{
 const s=combatBattle();for(const own of s.ships.filter(s=>s.team===0))own.ap=0;
 const shooter=ship(s,'0-destroyer-1');shooter.ap=1;
 s.recon=[{center:{x:28,z:26},team:0,carrierId:'0-carrier',expiresAt:s.turnNumber}];
 expect(snapshot(s,0).revealed.some(s=>s.id==='1-destroyer-1')).toBe(true);
 expect(fire(s,0,'attack',shooter.id,ship(s,'1-destroyer-1')).ok).toBe(true);
 act(s,0,'end');expect(s.turn).toBe(1);expect(s.sequence).toBe(1);expect(snapshot(s,0).revealed).toEqual([]);expect(snapshot(s,0).lastShot!.shipId).toBeUndefined();
 expect(snapshot(s,1).lastShot).toMatchObject({sequence:1,damage:200,shipId:'1-destroyer-1'});
 const win=combatBattle();for(const own of win.ships.filter(s=>s.team===0))own.ap=0;ship(win,'0-destroyer-1').ap=1;
 for(const enemy of win.ships.filter(s=>s.team===1)){enemy.hp=0;enemy.sunk=true;}
 const last=ship(win,'1-destroyer-1');last.hp=200;last.sunk=false;last.ap=1;const n=win.turnNumber;
 expect(fire(win,0,'attack','0-destroyer-1',last).ok).toBe(true);finish(win);expect(win).toMatchObject({phase:'finished',winner:0,turn:0,turnNumber:n,sequence:1});
 expect(ship(win,'0-destroyer-1').ap).toBe(0);expect(win.lastShot!.sunk).toBe(true);
});
test('rejected actions and remaining active AP never advance the turn',()=>{
 const base=combatBattle();base.islands=[];for(const own of base.ships.filter(s=>s.team===0))own.ap=0;ship(base,'0-destroyer-1').ap=2;
 for(const enemy of base.ships.filter(s=>s.team===1))enemy.ap=0;
 for(const change of [{phase:'setup' as const},{phase:'finished' as const},{connected:[true,false] as [boolean,boolean]},{turn:1}]){
  const s={...base,...change},before=JSON.stringify(s);expect(act(s,0,'move','0-destroyer-1',{x:2,z:4}).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 }
 expect(act(base,0,'move','0-destroyer-1',{x:2,z:4}).ok).toBe(true);expect(base.turn).toBe(0);expect(ship(base,'0-destroyer-1').ap).toBe(1);
});
test('each living ship kind grants the same 21-cell passive mask, follows movement and vanishes on sinking',()=>{
 for(const kind of ['carrier','destroyer','battleship'] as const){
  const s=combatBattle();s.islands=[];
  for(const own of s.ships.filter(s=>s.team===0)){own.sunk=true;own.hp=0;}
  const watcher=s.ships.find(s=>s.team===0&&s.kind===kind)!;watcher.sunk=false;watcher.hp=watcher.maxHp;watcher.x=10;watcher.z=10;
  const inside=ship(s,'1-destroyer-1');inside.x=12;inside.z=11;
  const corner=ship(s,'1-battleship-1');corner.x=12;corner.z=12;
  const view=snapshot(s,0);expect(view.visibleCells).toHaveLength(21);expect(view.visibleCells.map(c=>c.z).sort((a,b)=>a-b)).toEqual([8,8,8,9,9,9,9,9,10,10,10,10,10,11,11,11,11,11,12,12,12]);
  expect(view.visibleCells).toContainEqual({x:12,z:11});expect(view.visibleCells).not.toContainEqual({x:12,z:12});expect(view.revealed.map(s=>s.id)).toEqual([inside.id]);
  expect(watcher.ap).toBe(watcher.maxAp);expect(view.recon).toEqual([]);
  expect(act(s,0,'move',watcher.id,{x:8,z:10}).ok).toBe(true);expect(snapshot(s,0).revealed).toEqual([]);
  watcher.sunk=true;watcher.hp=0;expect(snapshot(s,0).visibleCells).toEqual([]);
 }
});
test('passive regions deduplicate, clip map edges and union with a distant 21-cell plane region',()=>{
 const s=combatBattle();for(const own of s.ships.filter(s=>s.team===0)){own.sunk=true;own.hp=0;}
 const c=ship(s,'0-carrier');c.sunk=false;c.hp=c.maxHp;c.x=10;c.z=10;
 const d=ship(s,'0-destroyer-1');d.sunk=false;d.hp=d.maxHp;d.x=11;d.z=10;
 expect(snapshot(s,0).visibleCells).toHaveLength(26);expect(act(s,0,'recon',c.id,{x:20,z:20}).ok).toBe(true);expect(snapshot(s,0).visibleCells).toHaveLength(47);
 expect(new Set(snapshot(s,0).visibleCells.map(cellKey)).size).toBe(47);c.sunk=true;d.sunk=true;expect(snapshot(s,0).visibleCells).toEqual([]);
 d.sunk=false;d.x=0;d.z=0;expect(snapshot(s,0).visibleCells).toHaveLength(8);d.x=29;d.z=29;expect(snapshot(s,0).visibleCells).toHaveLength(8);
});
test('passive visibility governs shot origins at fire time and withdraws them after the watching source disappears',()=>{
 const s=combatBattle();s.islands=[];for(const own of s.ships.filter(s=>s.team===1)){own.sunk=true;own.hp=0;}
 const observer=ship(s,'1-destroyer-1');observer.sunk=false;observer.hp=500;observer.x=12;observer.z=10;
 const shooter=ship(s,'0-destroyer-1');shooter.x=10;shooter.z=10;
 expect(fire(s,0,'attack',shooter.id,observer).ok).toBe(true);expect(snapshot(s,1).lastShot!.source).toEqual({x:10,z:10});
 finish(s);observer.x=16;observer.z=10;expect(snapshot(s,1).lastShot!.source).toBeUndefined();observer.x=12;observer.sunk=true;observer.hp=0;expect(snapshot(s,1).lastShot!.source).toBeUndefined();
 const hidden=combatBattle();const hiddenShooter=ship(hidden,'0-destroyer-1');hiddenShooter.x=10;hiddenShooter.z=10;
 expect(fire(hidden,0,'attack',hiddenShooter.id,{x:29,z:29}).ok).toBe(true);
 finish(hidden);ship(hidden,'1-destroyer-1').x=12;ship(hidden,'1-destroyer-1').z=10;
 expect(snapshot(hidden,1).revealed.some(s=>s.id===hiddenShooter.id)).toBe(true);expect(snapshot(hidden,1).lastShot!.source).toBeUndefined();
});
test('local hit marks persist without changing occupancy, reject malformed aim, and remain private',()=>{
 const s=combatBattle(),target=ship(s,'1-destroyer-1'),before=JSON.stringify(s);
 for(const localHit of [{x:1.1,z:0},{x:NaN,z:0},{x:0,z:Infinity}])expect(fireCommand(s,0,{type:'attack',shipId:'0-destroyer-1',target,localHit}).ok).toBe(false);
 expect(JSON.stringify(s)).toBe(before);
 expect(fireCommand(s,0,{type:'attack',shipId:'0-destroyer-1',target,localHit:{x:.7,z:-.3}},()=>.9).ok).toBe(true);
 expect(target).toMatchObject({x:28,z:26,hp:300});expect(target.damageMarks).toHaveLength(1);expect(target.damageMarks![0]).toMatchObject({x:.7,z:-.3});
 expect(snapshot(s,0).revealed).toEqual([]);const own=snapshot(s,1).own.find(s=>s.id===target.id)!;own.damageMarks![0]!.x=99;expect(target.damageMarks![0]!.x).toBe(.7);
 act(s,0,'end');act(s,1,'end');expect(fire(s,0,'attack','0-destroyer-1',target).ok).toBe(true);expect(target.damageMarks).toHaveLength(2);
 expect(target.damageMarks![1]!.seed).not.toBe(target.damageMarks![0]!.seed);expect(Math.abs(target.damageMarks![1]!.x)).toBeLessThanOrEqual(.8);
 const blocked=combatBattle();expect(fireCommand(blocked,0,{type:'attack',shipId:'0-destroyer-1',target:ship(blocked,'1-carrier'),localHit:{x:1,z:1}},()=>0).ok).toBe(true);expect(ship(blocked,'1-carrier').damageMarks).toBeUndefined();
});
test('AI scouts and advances both weapon classes without blind bombardment while scout is alive',()=>{
 const s=createBattle(),memory:AIMemory={},moves=new Set<string>();let attacks=0,multiStep=false;
 // Opposing vessels remain hidden outside the chosen recon region.
 s.ships.filter(s=>s.team===1).forEach((enemy,i)=>{enemy.x=23+i;enemy.z=0;});
 for(let turn=0;turn<3;turn++){
  for(let i=0;i<40&&s.turn===0;i++){
   const command=chooseAIAction(snapshot(s,0),'normal',()=>0,memory)!;
   const ap=command.shipId?ship(s,command.shipId).ap:0;
   if(command.type==='move')moves.add(command.shipId!);
   if(command.type==='attack')attacks++;
   expect(applyAction(s,0,command,()=>.9).ok).toBe(true);
   if(command.type==='move'&&ap-ship(s,command.shipId!).ap>1)multiStep=true;
  }
  expect(s.turn).toBe(1);act(s,1,'end');
 }
 expect(moves.size).toBe(7);expect(moves.has('0-carrier')).toBe(true);expect(attacks).toBe(0);expect(multiStep).toBe(true);
});
test('30x30 map has three connected irregular islands and seven ships per team',()=>{
 const defaults=createBattle(),formation=[['carrier',3,3],['destroyer-1',2,1],['destroyer-2',5,3],['battleship-1',2,5],['battleship-2',4,5],['destroyer-3',4,1],['battleship-3',1,3]] as const;
 for(const team of [0,1])expect(defaults.ships.filter(s=>s.team===team).map(s=>[s.id,s.x,s.z])).toEqual(formation.map(([suffix,x,z])=>[team+'-'+suffix,team?29-x:x,team?29-z:z]));
 const py=spawnSync('python',['-c',"import sys,json;sys.path.insert(0,'server');from battleship_rooms import create_battle;print(json.dumps([[s['id'],s['x'],s['z']] for s in create_battle()['ships']]))"],{encoding:'utf8'});expect(py.status,py.stderr).toBe(0);expect(JSON.parse(py.stdout)).toEqual(defaults.ships.map(s=>[s.id,s.x,s.z]));
 const state=fixtureBattle();expect(BOARD_SIZE).toBe(30);expect(ISLANDS).toHaveLength(3);
 expect(SHIPS.carrier).toMatchObject({hp:1000,ap:4,count:1});expect(SHIPS.destroyer).toMatchObject({hp:500,ap:4,count:3});expect(SHIPS.battleship).toMatchObject({hp:800,ap:4,count:3,range:12.5});
 for(const team of [0,1])expect(state.ships.filter(s=>s.team===team).map(s=>s.kind)).toEqual(['carrier','destroyer','destroyer','battleship','battleship','destroyer','battleship']);
 expect(new Set(state.ships.map(s=>s.id)).size).toBe(14);
 for(const island of ISLANDS){const pending=new Set(island.map(cellKey)),queue=[island[0]!];pending.delete(cellKey(queue[0]!));for(let i=0;i<queue.length;i++){const c=queue[i]!;for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const n={x:c.x+dx,z:c.z+dz};if(pending.delete(cellKey(n)))queue.push(n);}}expect(pending.size).toBe(0);}
});
test('BFS charges every eight-direction step, prevents corners and ignores wreck occupancy',()=>{
 const state=fixtureBattle();state.islands=[];const d=ship(state,'0-destroyer-1');d.x=1;d.z=1;d.ap=1;state.islands=[{x:2,z:1}];
 expect(act(state,0,'move',d.id,{x:2,z:2}).ok).toBe(false);expect(d.ap).toBe(1);d.ap=2;
 expect(act(state,0,'move',d.id,{x:2,z:2}).ok).toBe(true);expect(d.ap).toBe(0);
 const fresh=fixtureBattle();fresh.islands=[];const mover=ship(fresh,'0-destroyer-1');
 expect(act(fresh,0,'move',mover.id,{x:8,z:6}).ok).toBe(true);expect(mover.ap).toBe(0);
 expect(act(fresh,0,'move',mover.id,{x:9,z:6}).ok).toBe(false);
 const blocked=fixtureBattle();blocked.islands=[];const victim=ship(blocked,'1-destroyer-1');victim.x=5;victim.z=3;
 expect(act(blocked,0,'move','0-destroyer-1',{x:5,z:3}).ok).toBe(false);victim.sunk=true;victim.hp=0;
 expect(act(blocked,0,'move','0-destroyer-1',{x:5,z:3}).ok).toBe(true);
});
test('ships act independently, move around one attack, and refresh only on their turn',()=>{
 const s=fixtureBattle();s.islands=[];
 expect(act(s,0,'move','0-destroyer-1',{x:5,z:3}).ok).toBe(true);
 expect(act(s,0,'attack','0-destroyer-1',{x:29,z:29}).ok).toBe(true);
 expect(ship(s,'0-destroyer-1').ap).toBe(2);expect(act(s,0,'attack','0-destroyer-1',{x:28,z:29}).ok).toBe(false);
 expect(act(s,0,'move','0-destroyer-1',{x:7,z:5}).ok).toBe(true);
 expect(ship(s,'0-destroyer-2').ap).toBe(4);
 expect(act(s,1,'end').ok).toBe(false);expect(act(s,0,'end').ok).toBe(true);
 expect(ship(s,'0-destroyer-1').ap).toBe(0);expect(act(s,1,'end').ok).toBe(true);
 expect(ship(s,'0-destroyer-1')).toMatchObject({ap:4,attacked:false,moved:false});expect(s.ownTurns).toEqual([3,2]);
});
test('weapons validate range, island/friendly targets and immutable rejection',()=>{
 const s=fixtureBattle(),before=JSON.stringify(s);
 for(const [id,target] of [['0-battleship-1',{x:21,z:6}],['0-battleship-1',{x:22,z:2}],['0-destroyer-1',s.islands[0]!],['0-carrier',{x:4,z:27}],['0-destroyer-1',{x:9,z:2}]] as const)expect(act(s,0,'attack',id,target).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 expect(act(s,0,'attack','0-battleship-1',{x:21,z:5}).ok).toBe(true);expect(act(s,0,'attack','0-destroyer-1',{x:4,z:27}).ok).toBe(true);expect(s.lastShot).toBeUndefined();present(s);expect(ship(s,'1-destroyer-1').hp).toBe(300);expect(s.history.map(shot=>shot.hit)).toEqual([true,false]);
});

test('carrier recon is21 cells, clips edges and lasts through next own turn end',()=>{
 const s=fixtureBattle(),baseline=snapshot(s,0).visibleCells;
 expect(act(s,0,'recon','0-carrier',{x:14,z:27}).ok).toBe(true);
 const view=snapshot(s,0);expect(view.visibleCells).toHaveLength(baseline.length+21);expect(view.visibleCells).not.toContainEqual({x:12,z:25});expect(view.revealed.map(s=>s.id)).toEqual(['1-carrier']);
 expect(snapshot(s,1).recon).toEqual([]);expect(ship(s,'0-carrier').ap).toBe(3);expect(act(s,0,'recon','0-carrier',{x:15,z:15}).ok).toBe(false);
 act(s,0,'end');expect(snapshot(s,0).visibleCells).toHaveLength(baseline.length+21);act(s,1,'end');expect(snapshot(s,0).visibleCells).toHaveLength(baseline.length+21);
 act(s,0,'end');expect(snapshot(s,0).visibleCells).toEqual(baseline);
 const edge=fixtureBattle();edge.ships.filter(s=>s.team===0).forEach((s,i)=>{s.x=20+i;s.z=15;});const edgeBase=snapshot(edge,0).visibleCells.length;act(edge,0,'recon','0-carrier',{x:0,z:0});expect(snapshot(edge,0).visibleCells).toHaveLength(edgeBase+8);
 const moved=fixtureBattle();act(moved,0,'move','0-carrier',{x:15,z:2});expect(act(moved,0,'recon','0-carrier',{x:10,z:10}).ok).toBe(false);
});
test('carrier defense uses sequential independent33% draws for both weapons',()=>{
 for(const kind of ['destroyer','battleship']){
  for(const [draws,damage,blocked,halved,calls]of[[[.2],0,true,false,1],[[.5,.2],100,false,true,2],[[.33,.33],200,false,false,2]] as const){
   const s=fixtureBattle(),attacker=ship(s,'0-'+kind+'-1');attacker.x=14;attacker.z=19;let i=0;
   expect(fire(s,0,'attack',attacker.id,{x:14,z:27},()=>draws[i++]??.9).ok).toBe(true);
   expect(s.lastShot).toMatchObject({hit:true,damage,blocked,halved});expect(ship(s,'1-carrier').hp).toBe(1000-damage);expect(i).toBe(calls);
  }
 }
});
test('carrier death removes fighter sight during resolution; seventh sinking commits victory after presentation',()=>{
 const s=fixtureBattle();s.recon=[{center:{x:4,z:2},team:1,carrierId:'1-carrier',expiresAt:99}];ship(s,'1-carrier').hp=200;fire(s,0,'attack','0-destroyer-1',ship(s,'1-carrier'));expect(snapshot(s,1).recon).toEqual([]);expect(s.phase).toBe('battle');
 const victory=fixtureBattle();for(const enemy of victory.ships.filter(x=>x.team===1)){enemy.hp=0;enemy.sunk=true;}for(const id of ['1-destroyer-3','1-battleship-3'])Object.assign(ship(victory,id),{hp:200,sunk:false});
 for(const [id,target] of [['0-destroyer-1','1-destroyer-3'],['0-destroyer-3','1-battleship-3']])expect(act(victory,0,'attack',id,ship(victory,target!)).ok).toBe(true);present(victory);expect(victory.phase).toBe('battle');finish(victory);expect(victory.winner).toBe(0);
});

test('fog excludes unrelated hidden fleet while hit snapshots support temporary target presentation',()=>{
 const s=fixtureBattle();expect(snapshot(s,0).revealed).toEqual([]);expect(snapshot(s,1).revealed).toEqual([]);
 fire(s,0,'attack','0-destroyer-1',{x:4,z:27});
 const attack=snapshot(s,0),defense=snapshot(s,1);
 expect(attack.lastShot?.shipId).toBeUndefined();expect(attack.lastShot?.source).toEqual({x:4,z:2});expect(attack.revealed).toEqual([]);
 expect(defense.lastShot?.shipId).toBe('1-destroyer-1');expect(defense.lastShot?.sourceShip?.id).toBe('0-destroyer-1');
 act(s,0,'end');fire(s,1,'recon','1-carrier',{x:4,z:2});expect(snapshot(s,1).lastShot?.kind).toBe('airstrike');expect(snapshot(s,1).lastShot?.source).toEqual({x:14,z:27});
 expect('history' in attack).toBe(false);expect('ships' in attack).toBe(false);expect('lastAction' in attack).toBe(false);
 const copy=snapshot(s,0);copy.own[0]!.hp=1;copy.islands[0]!.x=99;expect(ship(s,'0-carrier').hp).toBe(1000);expect(s.islands[0]!.x).not.toBe(99);
});
test('fog-based route stops on newly acquired passive contact without a hidden-occupancy error',()=>{
 const s=fixtureBattle();ship(s,'1-destroyer-1').x=6;ship(s,'1-destroyer-1').z=5;
 const view=snapshot(s,0);expect(view.revealed).toEqual([]);expect(reachableCells(view,'0-destroyer-1')).toContainEqual({x:6,z:5});
 expect(act(s,0,'move','0-destroyer-1',{x:6,z:5}).ok).toBe(true);expect(snapshot(s,0).revealed.map(s=>s.id)).toContain('1-destroyer-1');expect(ship(s,'0-destroyer-1').ap).toBe(1);expect(cellKey(ship(s,'0-destroyer-1'))).not.toBe('6,5');
});
test('AI cannot react to hidden enemy changes, and remembers only observed contacts',()=>{
 const a=fixtureBattle(),b=fixtureBattle();for(const enemy of b.ships.filter(s=>s.team===1)){enemy.x=(enemy.x+3)%30;enemy.z=24;enemy.hp=50;}
 expect(snapshot(a,0)).toEqual(snapshot(b,0));expect(chooseAIAction(snapshot(a,0),'hard',seeded(5),{})).toEqual(chooseAIAction(snapshot(b,0),'hard',seeded(5),{}));
 act(a,0,'recon','0-carrier',{x:4,z:27});const memory:AIMemory={};chooseAIAction(snapshot(a,0),'normal',()=>0,memory);
 ship(a,'0-carrier').hp=0;ship(a,'0-carrier').sunk=true;a.recon=[];
 for(const s of a.ships.filter(s=>s.team===0&&s.id!=='0-destroyer-1'))s.ap=0;ship(a,'0-destroyer-1').ap=1;delete memory.pendingMove;
 const noSight=snapshot(a,0);expect(noSight.revealed).toEqual([]);expect(chooseAIAction(noSight,'normal',()=>0,memory)).toMatchObject({type:'attack',target:{x:4,z:27}});
});
test('TS and Python canonical maps, actions and privacy snapshots agree',()=>{
 const commands: [number,BattleCommand][]=[[0,{type:'attack',shipId:'0-destroyer-1',target:{x:28,z:26}}],[0,{type:'end'}],[1,{type:'attack',shipId:'1-destroyer-1',target:{x:1,z:3}}],[1,{type:'end'}],[0,{type:'recon',shipId:'0-carrier',target:{x:26,z:28}}],[0,{type:'attack',shipId:'0-destroyer-1',target:{x:28,z:26},localHit:{x:.7,z:-.2}}],[0,{type:'move',shipId:'0-destroyer-1',target:{x:6,z:4}}],[0,{type:'attack',shipId:'0-destroyer-1',target:{x:29,z:29}}],[0,{type:'attack',shipId:'0-battleship-1',target:{x:21,z:5}}],[0,{type:'end'}],[1,{type:'recon',shipId:'1-carrier',target:{x:6,z:4}}],[1,{type:'attack',shipId:'1-destroyer-2',target:{x:5,z:3}}],[1,{type:'end'}],[0,{type:'move',shipId:'0-destroyer-1',target:{x:7,z:4}}],[0,{type:'end'}],[1,{type:'end'}]];
 const state=createBattle(),expected:{ok:boolean;views:unknown[]}[]=[];for(const [you,command]of commands){const result=applyAction(state,you,command,()=>.9);expected.push({ok:result.ok,views:[snapshot(state,0),snapshot(state,1)]});}
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import create_battle,snapshot;sys.path.insert(0,'tests');from test_rooms import apply_action;s=create_battle();out=[]\nfor player,command in json.load(sys.stdin):\n r=apply_action(s,player,command,lambda:.9);out.append({'ok':r['ok'],'views':[snapshot(s,0),snapshot(s,1)]})\nprint(json.dumps(out))";
 const run=spawnSync('python',['-c',code],{input:JSON.stringify(commands),encoding:'utf8'});expect(run.status,run.stderr).toBe(0);expect(JSON.parse(run.stdout)).toEqual(expected);
});
test('TS and Python explicitly commit exhausted opening fleets with identical private snapshots',()=>{
 const routes:[string,number,number][]=[['carrier',3,5],['destroyer-1',1,7],['destroyer-2',5,7],['battleship-1',2,9],['battleship-2',4,9],['destroyer-3',6,4],['battleship-3',0,9]];
 const commands:[number,BattleCommand][]=[];
 for(const team of [0,1]){for(const [suffix,x,z]of routes)commands.push([team,{type:'move',shipId:team+'-'+suffix,target:{x:team?29-x:x,z:team?29-z:z}}]);commands.push([team,{type:'end'}]);}
 commands.push([1,{type:'end'}],[0,{type:'attack',shipId:'0-destroyer-1',target:{x:28,z:22},localHit:{x:.4,z:-.7}}]);
 const state=routeBattle(),expected:{ok:boolean;views:unknown[]}[]=[];
 for(const [you,command]of commands){const result=applyAction(state,you,command,()=>.9);expected.push({ok:result.ok,views:[snapshot(state,0),snapshot(state,1)]});}
 expect(state.turnNumber).toBe(3);expect(state.lastShot).toBeUndefined();expect(expected[16]!.ok).toBe(false);
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import create_battle,snapshot;sys.path.insert(0,'tests');from test_rooms import apply_action;sys.path.insert(0,'tests');from test_rooms import route_battle;s=route_battle();out=[]\nfor player,command in json.load(sys.stdin):\n r=apply_action(s,player,command,lambda:.9);out.append({'ok':r['ok'],'views':[snapshot(s,0),snapshot(s,1)]})\nprint(json.dumps(out))";
 const run=spawnSync('python',['-c',code],{input:JSON.stringify(commands),encoding:'utf8'});expect(run.status,run.stderr).toBe(0);expect(JSON.parse(run.stdout)).toEqual(expected);
});
test('TS and Python agree on passive contact acquisition, attack origin visibility and contact loss during legal moves',()=>{
 const commands:[number,BattleCommand][]=[];
 for(const [a,b] of [[{x:5,z:4},{x:24,z:25}],[{x:9,z:7},{x:20,z:21}],[{x:13,z:7},{x:17,z:17}],[{x:13,z:11},{x:17,z:13}]]){
  commands.push([0,{type:'move',shipId:'0-destroyer-1',target:a!}],[0,{type:'end'}],[1,{type:'move',shipId:'1-destroyer-1',target:b!}],[1,{type:'end'}]);
 }
 commands.push([0,{type:'move',shipId:'0-destroyer-1',target:{x:15,z:12}}],[0,{type:'attack',shipId:'0-destroyer-1',target:{x:17,z:13}}],[0,{type:'end'}],[1,{type:'move',shipId:'1-destroyer-1',target:{x:17,z:17}}]);
 const state=routeBattle(),expected:{ok:boolean;views:ReturnType<typeof snapshot>[]}[]=[];
 for(const [you,command]of commands){const result=applyAction(state,you,command,()=>.9);expect(result.ok,result.error).toBe(true);expected.push({ok:result.ok,views:[snapshot(state,0),snapshot(state,1)]});}
 expect(expected[16]!.views[0]!.revealed.map(s=>s.id)).toEqual(['1-destroyer-1']);expect(expected[18]!.views[1]!.lastShot!.source).toEqual({x:15,z:12});expect(expected[19]!.views[1]!.lastShot!.source).toBeUndefined();
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import create_battle,snapshot;sys.path.insert(0,'tests');from test_rooms import apply_action;sys.path.insert(0,'tests');from test_rooms import route_battle;s=route_battle();out=[]\nfor player,command in json.load(sys.stdin):\n r=apply_action(s,player,command,lambda:.9);out.append({'ok':r['ok'],'views':[snapshot(s,0),snapshot(s,1)]})\nprint(json.dumps(out))";
 const run=spawnSync('python',['-c',code],{input:JSON.stringify(commands),encoding:'utf8'});expect(run.status,run.stderr).toBe(0);expect(JSON.parse(run.stdout)).toEqual(expected);
});
test('all difficulties finish seeded self-play using filtered snapshots and public memory only',()=>{
 test.setTimeout(60_000);
 for(const difficulty of ['easy','normal','hard'] as const)for(const seed of [1,2,3,4]){
  const s=createBattle(),rng=seeded(seed),memory:AIMemory[]=[{},{}];let actions=0;
  while(s.phase==='battle'&&s.round<=90&&actions++<10000){const you=s.turn,command=chooseAIAction(snapshot(s,you),difficulty,rng,memory[you])!;const result=applyAction(s,you,command,rng);if(!result.ok)expect(act(s,you,'end').ok).toBe(true);}
  expect(s.phase,difficulty+' seed'+seed+' survivors '+JSON.stringify(s.ships.filter(s=>!s.sunk).map(s=>({id:s.id,hp:s.hp,x:s.x,z:s.z,parts:s.parts})))).toBe('finished');expect(s.round).toBeLessThanOrEqual(90);expect(s.winner===0||s.winner===1).toBe(true);
 }
});

function aimed(s:BattleState,attacker:string,victim:string,x:number,z:number,rng=()=>.9){const result=fireCommand(s,s.turn,{type:'attack',shipId:attacker,target:ship(s,victim),localHit:{x,z}},rng);if(result.ok)present(s,rng);return result;}
function disable(s:BattleState,id:string,part: keyof ReturnType<typeof createParts>){ship(s,id).parts![part]={hp:0,maxHp:200,disabled:true};}
test('source-local subsystem mapping disables only struck systems and deep-copies private part state',()=>{
 expect(Object.keys(createParts('carrier'))).toEqual(['bridge','engine','radar','flightDeck','airDefense']);expect(Object.keys(createParts('destroyer'))).toContain('airDefense');
 for(const [kind,point,part] of [['carrier',sourceHit('carrier','radar'),'radar'],['carrier',sourceHit('carrier','airDefense'),'airDefense'],['carrier',sourceHit('carrier','flightDeck'),'flightDeck'],['destroyer',sourceHit('destroyer','airDefense'),'airDefense'],['battleship',sourceHit('battleship','weapon'),'weapon'],['destroyer',sourceHit('destroyer','engine'),'engine']] as const)expect(partAt(kind,point)).toBe(part);
 for(const part of ['engine','weapon','radar'] as const){const point=sourceHit('destroyer',part);
  const s=fixtureBattle();expect(aimed(s,'0-destroyer-1','1-destroyer-1',point.x,point.z).ok).toBe(true);const victim=ship(s,'1-destroyer-1');expect(victim.hp).toBe(300);expect(victim.parts![part]).toMatchObject({hp:0,disabled:true});expect(Object.values(victim.parts!).filter(p=>p.disabled)).toHaveLength(1);
  expect(snapshot(s,0).revealed).toEqual([]);const own=snapshot(s,1).own.find(v=>v.id===victim.id)!;own.parts![part]!.hp=99;expect(victim.parts![part]!.hp).toBe(0);
  act(s,0,'end');const before=JSON.stringify(s);
  if(part==='engine'){expect(reachableCells(snapshot(s,1),victim.id)).toEqual([]);expect(act(s,1,'move',victim.id,{x:5,z:26}).ok).toBe(false);}
  if(part==='weapon')expect(fire(s,1,'attack',victim.id,ship(s,'0-destroyer-1')).ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
 }
 const radar=fixtureBattle();for(const own of radar.ships.filter(v=>v.team===0)){own.sunk=true;own.hp=0;}const watcher=ship(radar,'0-battleship-1');watcher.sunk=false;watcher.hp=800;watcher.x=10;watcher.z=10;expect(snapshot(radar,0).visibleCells).toHaveLength(21);disable(radar,watcher.id,'radar');expect(snapshot(radar,0).visibleCells).toHaveLength(9);
});
test('carrier deck removes planes, disabled AA removes defense draws, and half damage leaves a repairable partial system',()=>{
 const s=fixtureBattle();act(s,0,'end');act(s,1,'recon','1-carrier',{x:14,z:15});act(s,1,'end');expect(s.recon).toHaveLength(1);expect(aimed(s,'0-destroyer-1','1-carrier',0,-.5).ok).toBe(true);expect(ship(s,'1-carrier').parts!.flightDeck!.disabled).toBe(true);expect(s.recon).toEqual([]);act(s,0,'end');expect(act(s,1,'recon','1-carrier',{x:14,z:15}).ok).toBe(false);
 const half=fixtureBattle(),aa=sourceHit('carrier','airDefense');const draws=[.9,.1];let calls=0;expect(aimed(half,'0-destroyer-1','1-carrier',aa.x,aa.z,()=>draws[calls++]!).ok).toBe(true);expect(calls).toBe(2);expect(ship(half,'1-carrier').parts!.airDefense).toMatchObject({hp:100,disabled:false});expect(ship(half,'1-carrier').hp).toBe(900);
 act(half,0,'end');act(half,1,'end');expect(aimed(half,'0-destroyer-1','1-carrier',aa.x,aa.z).ok).toBe(true);expect(ship(half,'1-carrier').parts!.airDefense!.disabled).toBe(true);act(half,0,'end');act(half,1,'end');calls=0;expect(aimed(half,'0-destroyer-1','1-carrier',0,.8,()=>{calls++;return 0;}).ok).toBe(true);expect(calls).toBe(0);expect(half.lastShot!.damage).toBe(200);
});
test('one DD escort roll intercepts missiles and airstrikes within 21 cells, never shells, and respects disabled radar or AA',()=>{
 for(const projectile of ['missile','shell','airstrike'] as const){const s=fixtureBattle();s.islands=[];const target=ship(s,'1-battleship-1');target.x=14;target.z=15;ship(s,'0-battleship-1').x=14;ship(s,'0-battleship-1').z=5;for(const [i,id] of ['1-destroyer-1','1-destroyer-2'].entries()){ship(s,id).x=12+i;ship(s,id).z=14;}let calls=0;const rng=()=>{calls++;return 0;};
  const result=projectile==='airstrike'?fire(s,0,'recon','0-carrier',target,rng):aimed(s,projectile==='shell'?'0-battleship-1':'0-destroyer-1',target.id,.5,.1,rng);expect(result.ok).toBe(true);expect(s.lastShot!.kind).toBe(projectile);expect(calls).toBe(projectile==='shell'?0:1);expect(s.lastShot!.damage).toBe(projectile==='shell'?200:0);if(projectile!=='shell'){expect(snapshot(s,1).lastShot!.interceptedBy).toEqual({x:12,z:14});if(projectile==='missile')expect(snapshot(s,0).lastShot!.interceptedBy).toBeUndefined();}
 }
 for(const broken of ['radar','airDefense'] as const){const s=fixtureBattle();disable(s,'1-destroyer-1',broken);let calls=0;expect(aimed(s,'0-destroyer-1','1-destroyer-1',.5,.1,()=>{calls++;return 0;}).ok).toBe(true);expect(calls).toBe(0);expect(s.lastShot!.damage).toBe(200);}
 const edge=fixtureBattle();const target=ship(edge,'1-battleship-1');target.x=14;target.z=15;ship(edge,'1-destroyer-1').x=12;ship(edge,'1-destroyer-1').z=13;let calls=0;expect(aimed(edge,'0-destroyer-1',target.id,.5,.1,()=>{calls++;return 0;}).ok).toBe(true);expect(calls).toBe(0);
});
test('carrier has four AP, one 1AP sortie, follows scouting with movement, and airstrikes only the nearest target after opening',()=>{
 const opening=routeBattle();let draws=0;const target=ship(opening,'1-destroyer-1');expect(act(opening,0,'recon','0-carrier',target,()=>{draws++;return 0;}).ok).toBe(true);expect(draws).toBe(0);expect(opening.sequence).toBe(0);expect(ship(opening,'0-carrier')).toMatchObject({ap:3,scouted:true});expect(act(opening,0,'recon','0-carrier',target).ok).toBe(false);expect(act(opening,0,'move','0-carrier',{x:3,z:4}).ok).toBe(true);expect(ship(opening,'0-carrier').ap).toBe(0);
 const s=fixtureBattle();const first=ship(s,'1-battleship-1'),second=ship(s,'1-battleship-2');first.x=14;first.z=15;second.x=15;second.z=15;expect(fire(s,0,'recon','0-carrier',{x:14,z:15}).ok).toBe(true);expect(s.lastShot).toMatchObject({kind:'airstrike',damage:200,shipId:first.id});expect(first.hp).toBe(600);expect(second.hp).toBe(800);expect(ship(s,'0-carrier').ap).toBe(3);
 act(s,0,'end');act(s,1,'end');expect(ship(s,'0-carrier').scouted).toBe(false);expect(act(s,0,'move','0-carrier',{x:15,z:2}).ok).toBe(true);expect(act(s,0,'recon','0-carrier',{x:14,z:15}).ok).toBe(false);
});
test('damage control costs one AP, restores only live HP, preserves destroyed systems and scars, and is limited to two charges',()=>{
 const s=fixtureBattle(),v=ship(s,'0-carrier');v.hp=900;v.parts!.radar!.hp=100;disable(s,v.id,'bridge');disable(s,v.id,'engine');v.damageMarks=[{x:0,z:.8,seed:1}];
 expect(canRepairShip(v)).toBe(true);expect(act(s,0,'repair',v.id).ok).toBe(true);expect(v).toMatchObject({hp:950,ap:3,repaired:true,repairCharges:1,damageControl:true});expect(v.parts!.radar!.hp).toBe(150);expect(v.parts!.engine!.hp).toBe(0);expect(v.damageMarks).toHaveLength(1);const before=JSON.stringify(s);expect(act(s,0,'repair',v.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 act(s,0,'end');act(s,1,'end');expect(v.damageControl).toBe(true);expect(v.repaired).toBe(false);expect(act(s,0,'repair',v.id).ok).toBe(true);expect(v.hp).toBe(1000);expect(v.parts!.radar!.hp).toBe(200);expect(v.repairCharges).toBe(0);act(s,0,'end');expect(aimed(s,'1-destroyer-1',v.id,0,-.5).ok).toBe(true);expect(v.damageControl).toBe(false);act(s,1,'end');expect(canRepairShip(v)).toBe(false);
 const dead=fixtureBattle();const corpse=ship(dead,'0-destroyer-1');corpse.sunk=true;corpse.hp=0;expect(act(dead,0,'repair',corpse.id).ok).toBe(false);
});
test('actionless disabled fleets receive repair AP and require explicit end when charges are exhausted',()=>{
 const s=fixtureBattle();for(const enemy of s.ships.filter(v=>v.team===1)){disable(s,enemy.id,'bridge');disable(s,enemy.id,'engine');disable(s,enemy.id,enemy.kind==='carrier'?'flightDeck':'weapon');enemy.hp-=200;enemy.repairCharges=0;enemy.ap=3;}act(s,0,'end');expect(s.turn).toBe(1);expect(s.turnNumber).toBe(4);act(s,1,'end');expect(s.turn).toBe(0);expect(s.ships.filter(v=>v.team===1).every(v=>v.ap===0)).toBe(true);
 const repair=fixtureBattle();for(const enemy of repair.ships.filter(v=>v.team===1)){disable(repair,enemy.id,'bridge');disable(repair,enemy.id,'engine');disable(repair,enemy.id,enemy.kind==='carrier'?'flightDeck':'weapon');enemy.hp-=200;enemy.repairCharges=2;}act(repair,0,'end');expect(repair.turn).toBe(1);expect(repair.ships.filter(v=>v.team===1).every(v=>v.ap===1)).toBe(true);for(const enemy of repair.ships.filter(v=>v.team===1))expect(act(repair,1,'repair',enemy.id).ok).toBe(true);expect(repair.turn).toBe(1);act(repair,1,'end');expect(repair.turn).toBe(0);
});

test('both completely disabled fleets finish as a draw instead of repeating empty turns',()=>{
 const s=fixtureBattle();for(const v of s.ships){disable(s,v.id,'bridge');disable(s,v.id,'engine');disable(s,v.id,v.kind==='carrier'?'flightDeck':'weapon');v.repairCharges=0;}expect(act(s,0,'end').ok).toBe(true);expect(s.phase).toBe('finished');expect(s.winner).toBeNull();
});

test('hit target cinematic snapshot is exact and copied without granting persistent vision',()=>{
 const s=fixtureBattle();const victim=ship(s,'1-destroyer-1');expect(fire(s,0,'recon','0-carrier',victim).ok).toBe(true);const first=snapshot(s,0).lastShot!;expect(first.kind).toBe('airstrike');expect(first.targetBefore).toMatchObject({id:victim.id,hp:500,parts:{engine:{hp:200,disabled:false}}});expect(victim.hp).toBe(300);first.targetBefore!.parts!.engine!.hp=7;expect(s.lastShot!.targetBefore!.parts!.engine!.hp).toBe(200);
 s.recon=[];expect(snapshot(s,0).lastShot!.targetBefore!.hp).toBe(500);expect(snapshot(s,1).lastShot!.targetBefore!.hp).toBe(500);
 const blind=fixtureBattle();expect(aimed(blind,'0-destroyer-1','1-destroyer-1',0,.8).ok).toBe(true);expect(snapshot(blind,0).lastShot!.targetBefore!.id).toBe('1-destroyer-1');blind.recon=[{team:0,carrierId:'0-carrier',center:{x:4,z:27},expiresAt:blind.turnNumber+2}];expect(snapshot(blind,0).revealed).toHaveLength(1);expect(snapshot(blind,0).lastShot!.targetBefore!.id).toBe('1-destroyer-1');
});
test('carrier AI spends its sortie then follows moving screens every opening round and retreats from observed threats',()=>{
 const s=createBattle();const memory:AIMemory={};let sorties=0,moved=0;
 for(let round=0;round<3;round++){const start=cellKey(ship(s,'0-carrier'));for(let n=0;n<40&&s.turn===0;n++){const cmd=chooseAIAction(snapshot(s,0),'normal',()=>0,memory)!;if(cmd.shipId==='0-carrier'&&cmd.type==='recon')sorties++;if(cmd.shipId==='0-carrier'&&cmd.type==='move')moved++;expect(applyAction(s,0,cmd,()=>.9).ok).toBe(true);}expect(cellKey(ship(s,'0-carrier'))).not.toBe(start);expect(s.turn).toBe(1);act(s,1,'end');}
 expect(sorties).toBe(3);expect(moved).toBeGreaterThanOrEqual(3);
 const threatened=fixtureBattle();threatened.islands=[];const c=ship(threatened,'0-carrier'),e=ship(threatened,'1-battleship-1');c.x=10;c.z=10;e.x=12;e.z=10;const cmd=chooseAIAction(snapshot(threatened,0),'hard',()=>0,{})!;expect(cmd).toMatchObject({type:'move',shipId:c.id});expect(Math.hypot(cmd.target!.x-e.x,cmd.target!.z-e.z)).toBeGreaterThan(2);
});

test('uncontrolled hull fire ticks once at each owner turn start in proportion to missing HP with a five minimum',()=>{
 for(const [id,hp,damage] of [['1-carrier',999,5],['1-carrier',899,6],['1-destroyer-1',300,10],['1-battleship-1',400,20],['1-carrier',50,48]] as const){
  const s=fixtureBattle(),v=ship(s,id);v.hp=hp;v.ap=0;v.lastTurnDamage=99;const parts=JSON.stringify(v.parts),marks=JSON.stringify(v.damageMarks),sequence=s.sequence;
  expect(act(s,0,'end').ok).toBe(true);expect(v.hp).toBe(hp-damage);expect(v.lastTurnDamage).toBe(damage);expect(v.ap).toBe(v.maxAp);expect(JSON.stringify(v.parts)).toBe(parts);expect(JSON.stringify(v.damageMarks)).toBe(marks);expect(s.sequence).toBe(sequence);expect(s.history).toEqual([]);expect(s.lastShot).toBeUndefined();
  const once=v.hp;expect(act(s,1,'move',v.id,{x:v.x,z:v.z-1}).ok).toBe(true);expect(v.hp).toBe(once);expect(ship(s,'0-carrier').lastTurnDamage).toBe(0);expect(ship(s,'1-destroyer-2').lastTurnDamage).toBe(0);
 }
});
test('repair suppresses future hull fire until a positive hit reignites it, and zero ticks clear stale values',()=>{
 const s=fixtureBattle(),v=ship(s,'0-destroyer-1');v.hp=300;v.lastTurnDamage=10;expect(act(s,0,'repair',v.id).ok).toBe(true);expect(v.hp).toBe(350);act(s,0,'end');act(s,1,'end');expect(v.hp).toBe(350);expect(v.lastTurnDamage).toBe(0);expect(v.damageControl).toBe(true);
 act(s,0,'end');expect(aimed(s,'1-destroyer-1',v.id,.5,.1).ok).toBe(true);expect(v.hp).toBe(150);expect(v.damageControl).toBe(false);const shot=JSON.stringify(s.lastShot);act(s,1,'end');expect(v.hp).toBe(132);expect(v.lastTurnDamage).toBe(18);expect(JSON.stringify(s.lastShot)).toBe(shot);
 const skip=fixtureBattle();const dead=ship(skip,'1-destroyer-1');dead.hp=0;dead.sunk=true;dead.lastTurnDamage=25;const full=ship(skip,'1-carrier');full.lastTurnDamage=25;act(skip,0,'end');expect(dead.lastTurnDamage).toBe(0);expect(full.lastTurnDamage).toBe(0);
});
test('lethal turn fire sinks the whole incoming batch, removes carrier planes, awards victory and never refreshes wreck AP',()=>{
 const s=fixtureBattle();for(const enemy of s.ships.filter(v=>v.team===1)){enemy.hp=0;enemy.sunk=true;enemy.ap=0;}const c=ship(s,'1-carrier'),d=ship(s,'1-destroyer-1');c.hp=20;c.sunk=false;c.ap=99;d.hp=5;d.sunk=false;d.ap=99;s.recon=[{team:1,carrierId:c.id,center:{x:4,z:2},expiresAt:99}];
 const sequence=s.sequence;expect(act(s,0,'end').ok).toBe(true);expect(s).toMatchObject({phase:'finished',winner:0,turn:1,turnNumber:4});expect(c).toMatchObject({hp:0,sunk:true,ap:0,lastTurnDamage:20});expect(d).toMatchObject({hp:0,sunk:true,ap:0,lastTurnDamage:5});expect(s.recon).toEqual([]);expect(snapshot(s,1).visibleCells).toEqual([]);expect(s.sequence).toBe(sequence);const before=JSON.stringify(s);expect(act(s,1,'repair',c.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 const draw=fixtureBattle();for(const v of draw.ships){v.hp=0;v.sunk=true;v.ap=0;}const last=ship(draw,'1-carrier');last.hp=1;last.sunk=false;expect(act(draw,0,'end').ok).toBe(true);expect(draw.phase).toBe('finished');expect(draw.winner).toBe(1);
});
test('fire damage remains private outside current sight and TS/Python agree on fire, suppression, reignition and lethal ticks',()=>{
 const s=fixtureBattle();ship(s,'1-carrier').hp=899;act(s,0,'end');expect(snapshot(s,0).revealed).toEqual([]);expect('lastTurnDamage' in snapshot(s,0)).toBe(false);expect(snapshot(s,1).own.find(v=>v.id==='1-carrier')!.lastTurnDamage).toBe(6);s.recon=[{team:0,carrierId:'0-carrier',center:{x:14,z:27},expiresAt:99}];expect(snapshot(s,0).revealed[0]).toMatchObject({hp:893,lastTurnDamage:6});s.recon=[];expect(snapshot(s,0).revealed).toEqual([]);
 const commands:[number,BattleCommand][]=[[0,{type:'end'}],[1,{type:'repair',shipId:'1-carrier'}],[1,{type:'end'}],[0,{type:'attack',shipId:'0-destroyer-1',target:{x:14,z:27},localHit:{x:.8,z:.5}}],[0,{type:'end'}],[1,{type:'end'}],[0,{type:'end'}]];
 const state=fixtureBattle();ship(state,'1-carrier').hp=899;ship(state,'1-destroyer-1').hp=1;const expected:unknown[]=[];for(const [team,cmd]of commands){const result=applyAction(state,team,cmd,()=>.9);expected.push({ok:result.ok,views:[snapshot(state,0),snapshot(state,1)]});}
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import create_battle,snapshot;sys.path.insert(0,'tests');from test_rooms import apply_action;s=create_battle();apply_action(s,0,{'type':'end'});apply_action(s,1,{'type':'end'})\nfor team in (0,1):\n for v,x in zip([v for v in s['ships'] if v['team']==team],[14,4,24,9,19,0,29]):v.update(x=x,z=27 if team else 2)\nnext(v for v in s['ships'] if v['id']=='1-carrier')['hp']=899;next(v for v in s['ships'] if v['id']=='1-destroyer-1')['hp']=1;out=[]\nfor team,cmd in json.load(sys.stdin):\n r=apply_action(s,team,cmd,lambda:.9);out.append({'ok':r['ok'],'views':[snapshot(s,0),snapshot(s,1)]})\nprint(json.dumps(out))";
 const run=spawnSync('python',['-c',code],{input:JSON.stringify(commands),encoding:'utf8'});expect(run.status,run.stderr).toBe(0);expect(JSON.parse(run.stdout)).toEqual(expected);
});

test('sonar is ship-centered, sea-only radius12, private, 2AP once per turn and lasts through next own turn end',()=>{
 for(const kind of ['carrier','destroyer','battleship'] as const){const s=fixtureBattle();s.islands=[{x:11,z:10}];for(const own of s.ships.filter(v=>v.team===0)){own.hp=0;own.sunk=true;}const v=s.ships.find(v=>v.team===0&&v.kind===kind)!;v.hp=v.maxHp;v.sunk=false;v.x=10;v.z=10;const inside=ship(s,'1-destroyer-1');inside.x=22;inside.z=10;const outside=ship(s,'1-destroyer-2');outside.x=22;outside.z=11;const ap=v.ap;
  expect(act(s,0,'sonar',v.id).ok).toBe(true);expect(v).toMatchObject({ap:ap-2,sonared:true});const view=snapshot(s,0);expect(view.sonar).toEqual([{shipId:v.id,team:0,center:{x:10,z:10},expiresAt:5}]);expect(view.visibleCells).toContainEqual({x:22,z:10});expect(view.visibleCells).not.toContainEqual({x:22,z:11});expect(view.revealed.map(v=>v.id)).toEqual([inside.id]);expect(snapshot(s,1).sonar).toEqual([]);expect(act(s,0,'sonar',v.id).ok).toBe(false);
  const seaOnly=view.visibleCells.filter(c=>Math.abs(c.x-v.x)>2||Math.abs(c.z-v.z)>2);expect(seaOnly.every(c=>Math.hypot(c.x-10,c.z-10)<=12)).toBe(true);act(s,0,'end');expect(snapshot(s,0).sonar).toHaveLength(1);act(s,1,'end');expect(v.sonared).toBe(false);expect(snapshot(s,0).sonar).toHaveLength(1);act(s,0,'end');expect(snapshot(s,0).sonar).toEqual([]);
 }
 const s=fixtureBattle();const v=ship(s,'0-destroyer-1');v.x=10;v.z=10;s.islands=[{x:15,z:10}];expect(act(s,0,'sonar',v.id).ok).toBe(true);expect(snapshot(s,0).visibleCells).not.toContainEqual({x:15,z:10});disable(s,v.id,'bridge');expect(snapshot(s,0).sonar).toEqual([]);act(s,0,'end');act(s,1,'end');const before=JSON.stringify(s);expect(act(s,0,'sonar',v.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
});
test('torpedo launch is DD-only, weapon-gated, 1AP once independent of missiles, radius15 and forbidden in both opening turns',()=>{
 const initial=createBattle();for(const team of [0,1]){const before=JSON.stringify(initial);expect(act(initial,team,'torpedo',team+'-destroyer-1',{x:15,z:15}).ok).toBe(false);expect(JSON.stringify(initial)).toBe(before);act(initial,team,'end');}
 const s=fixtureBattle();const d=ship(s,'0-destroyer-1');expect(act(s,0,'torpedo',d.id,{x:19,z:3}).ok).toBe(false);expect(act(s,0,'torpedo','0-battleship-1',{x:14,z:2}).ok).toBe(false);expect(act(s,0,'torpedo',d.id,{x:19,z:2}).ok).toBe(true);expect(d).toMatchObject({ap:3,torpedoed:true,attacked:false});expect(s.sequence).toBe(0);expect(s.shotEvents).toEqual([]);expect(act(s,0,'torpedo',d.id,{x:18,z:2}).ok).toBe(false);expect(act(s,0,'attack',d.id,{x:29,z:29}).ok).toBe(true);expect(d.ap).toBe(2);
 const disabled=fixtureBattle();disable(disabled,d.id,'weapon');const before=JSON.stringify(disabled);expect(act(disabled,0,'torpedo',d.id,{x:14,z:2}).ok).toBe(false);expect(JSON.stringify(disabled)).toBe(before);
});
test('torpedoes advance five water steps at every side end and avoid diagonal island corners',()=>{
 const s=fixtureBattle();s.islands=[];expect(act(s,0,'torpedo','0-destroyer-1',{x:19,z:2}).ok).toBe(true);expect(s.torpedoes[0]).toMatchObject({x:4,z:2,index:0,nextAdvanceAt:3});act(s,0,'end');expect(s.torpedoes[0]).toMatchObject({x:9,z:2,index:5,nextAdvanceAt:4});act(s,1,'end');expect(s.torpedoes[0]).toMatchObject({x:14,index:10});act(s,0,'end');expect(s.torpedoes).toEqual([]);
 for(const land of [{x:7,z:2},{x:5,z:2}]){const target={x:14,z:2},route=torpedoRoute({x:4,z:2},target,[land]);expect(route.at(-1)).toEqual(target);let previous:Cell={x:4,z:2};for(const step of route){expect(step).not.toEqual(land);if(step.x!==previous.x&&step.z!==previous.z){expect({x:step.x,z:previous.z}).not.toEqual(land);expect({x:previous.x,z:step.z}).not.toEqual(land);}previous=step;}}
});

test('swept torpedo hits bypass carrier AA and DD escort, deal300 with subsystem damage, and preserve original launch-source privacy',()=>{
 const s=fixtureBattle();s.islands=[];const c=ship(s,'1-carrier');c.x=7;c.z=2;const guard=ship(s,'1-destroyer-1');guard.x=7;guard.z=3;let calls=0;expect(act(s,0,'torpedo','0-destroyer-1',{x:14,z:2},()=>{calls++;return 0;}).ok).toBe(true);expect(act(s,0,'end',undefined,undefined,()=>{calls++;return 0;}).ok).toBe(true);expect(s.lastShot?.targetAfter?.hp).toBe(700);expect(c.damageMarks).toHaveLength(1);expect(Object.values(c.parts!).some(p=>p.disabled)).toBe(true);expect(s.lastShot).toMatchObject({kind:'torpedo',damage:300,blocked:false,halved:false});expect(calls).toBe(0);expect(s.torpedoes).toEqual([]);
 const hidden=fixtureBattle();hidden.islands=[];expect(act(hidden,0,'torpedo','0-destroyer-1',{x:19,z:2}).ok).toBe(true);act(hidden,0,'end');const observer=ship(hidden,'1-carrier');observer.x=10;observer.z=2;const enemyTorp=snapshot(hidden,1).torpedoes![0]!;expect(Object.keys(enemyTorp).sort()).toEqual(['heading','id','route','team','x','z']);expect(enemyTorp.x).toBe(9);act(hidden,1,'end');act(hidden,0,'end');expect(snapshot(hidden,1).lastShot!.source).toBeUndefined();expect(snapshot(hidden,1).lastShot!.targetBefore!.id).toBe(observer.id);
});
test('torpedo impacts resolve sequentially, survive launcher loss and defer final victory',()=>{
 const s=fixtureBattle();s.islands=[];Object.assign(ship(s,'0-destroyer-2'),{x:4,z:4});Object.assign(ship(s,'1-carrier'),{x:8,z:2});Object.assign(ship(s,'1-battleship-1'),{x:8,z:4});for(const [id,target] of [['0-destroyer-1',{x:14,z:2}],['0-destroyer-2',{x:14,z:4}]] as const)expect(act(s,0,'torpedo',id,target).ok).toBe(true);ship(s,'0-destroyer-1').sunk=true;ship(s,'0-destroyer-1').hp=0;
 expect(reserveAction(s,0,{type:'end'}).ok).toBe(true);expect(resolveAttackStep(s).shot?.sequence).toBe(1);expect(snapshot(s,1).shots).toHaveLength(1);expect(resolveAttackStep(s).shot?.sequence).toBe(2);expect(snapshot(s,1).shots).toHaveLength(1);expect(ship(s,'1-carrier').hp).toBe(700);expect(ship(s,'1-battleship-1').hp).toBe(500);finish(s);expect(snapshot(s,1).shots).toEqual([]);
 const win=fixtureBattle();win.islands=[];for(const v of win.ships.filter(v=>v.team===1)){v.hp=0;v.sunk=true;}Object.assign(ship(win,'1-carrier'),{hp:300,sunk:false,x:8,z:2});act(win,0,'torpedo','0-destroyer-1',{x:14,z:2});present(win);expect(win.phase).toBe('battle');expect(win.lastShot?.sunk).toBe(true);finish(win);expect(win.winner).toBe(0);
});

test('AI uses useful sonar and known-contact torpedoes without reacting to hidden-world differences',()=>{
 const s=fixtureBattle();ship(s,'0-carrier').ap=0;const observer=ship(s,'0-destroyer-1');observer.x=10;observer.z=10;const enemy=ship(s,'1-battleship-1');enemy.x=12;enemy.z=10;const command=chooseAIAction(snapshot(s,0),'hard',()=>0,{})!;expect(command.type).toBe('sonar');expect(applyAction(s,0,command,()=>.9).ok).toBe(true);for(const own of s.ships.filter(v=>v.team===0))own.sonared=true;const torpedo=chooseAIAction(snapshot(s,0),'hard',()=>0,{})!;expect(torpedo).toMatchObject({type:'torpedo',target:{x:12,z:10}});
 const a=fixtureBattle(),b=fixtureBattle();for(const e of b.ships.filter(v=>v.team===1)){e.x=29;e.z=29;e.hp=1;}expect(snapshot(a,0)).toEqual(snapshot(b,0));expect(chooseAIAction(snapshot(a,0),'hard',()=>0,{})).toEqual(chooseAIAction(snapshot(b,0),'hard',()=>0,{}));
});
test('TS and Python agree on sonar privacy, every-turn torpedo sweeps and sequential impact steps',()=>{
 const commands:[number,BattleCommand][]=[[0,{type:'sonar',shipId:'0-carrier'}],[0,{type:'torpedo',shipId:'0-destroyer-1',target:{x:14,z:2}}],[0,{type:'torpedo',shipId:'0-destroyer-2',target:{x:14,z:4}}],[0,{type:'end'}],[1,{type:'sonar',shipId:'1-battleship-2'}],[1,{type:'end'}],[0,{type:'end'}],[1,{type:'end'}]];
 const s=fixtureBattle();s.islands=[];ship(s,'0-destroyer-2').x=4;ship(s,'0-destroyer-2').z=4;ship(s,'1-carrier').x=8;ship(s,'1-carrier').z=2;ship(s,'1-battleship-1').x=8;ship(s,'1-battleship-1').z=4;const expected:unknown[]=[];
 for(const [team,cmd]of commands){const r=applyAction(s,team,cmd,()=>.9);expect(r.ok,r.error).toBe(true);expected.push({ok:r.ok,views:[snapshot(s,0),snapshot(s,1)]});}
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import create_battle,snapshot;sys.path.insert(0,'tests');from test_rooms import apply_action;s=create_battle();apply_action(s,0,{'type':'end'});apply_action(s,1,{'type':'end'})\nfor team in (0,1):\n for v,x in zip([v for v in s['ships'] if v['team']==team],[14,4,24,9,19,0,29]):v.update(x=x,z=27 if team else 2)\ns['islands']=[]\nfor identifier,x,z in [('0-destroyer-2',4,4),('1-carrier',8,2),('1-battleship-1',8,4)]:next(v for v in s['ships'] if v['id']==identifier).update(x=x,z=z)\nout=[]\nfor team,cmd in json.load(sys.stdin):\n r=apply_action(s,team,cmd,lambda:.9);out.append({'ok':r['ok'],'views':[snapshot(s,0),snapshot(s,1)]})\nprint(json.dumps(out))";
 const run=spawnSync('python',['-c',code],{input:JSON.stringify(commands),encoding:'utf8'});expect(run.status,run.stderr).toBe(0);expect(JSON.parse(run.stdout)).toEqual(expected);
});

test('side cells do not count as torpedo hits and an armed sonar bridge retains AP after other systems fail',()=>{
 const s=fixtureBattle();s.islands=[];const adjacent=ship(s,'1-carrier');adjacent.x=5;adjacent.z=2;expect(act(s,0,'torpedo','0-destroyer-1',{x:8,z:6}).ok).toBe(true);act(s,0,'end');expect(adjacent.hp).toBe(1000);expect(s.sequence).toBe(0);
 const cripple=fixtureBattle();const victim=ship(cripple,'1-battleship-1');disable(cripple,victim.id,'engine');expect(aimed(cripple,'0-destroyer-1',victim.id,0,-.7).ok).toBe(true);expect(victim.ap).toBe(4);act(cripple,0,'end');expect(victim.ap).toBe(4);expect(act(cripple,1,'sonar',victim.id).ok).toBe(true);
});
test('pending torpedoes defer deadlock until their route ends',()=>{
 const s=fixtureBattle();s.islands=[];act(s,0,'torpedo','0-destroyer-1',{x:19,z:2});act(s,0,'end');for(const v of s.ships){disable(s,v.id,'engine');disable(s,v.id,'bridge');disable(s,v.id,v.kind==='carrier'?'flightDeck':'weapon');v.repairCharges=0;}
 expect(s.phase).toBe('battle');act(s,1,'end');expect(s.torpedoes[0]?.index).toBe(10);act(s,0,'end');expect(s.torpedoes).toEqual([]);expect(s.phase).toBe('finished');expect(s.winner).toBeNull();
});

test('destroyed weapons reject every new launch without mutation even when zero HP has a stale disabled flag',()=>{
 for(const inconsistent of [false,true])for(const kind of ['destroyer','battleship','carrier'] as const){
  const state=combatBattle(),actor=state.ships.find(s=>s.team===0&&s.kind===kind)!;
  const key=kind==='carrier'?'flightDeck':'weapon';actor.parts![key]={hp:inconsistent?0:200,maxHp:200,disabled:!inconsistent};
  expect(partDisabled(actor,key)).toBe(true);
  expect(kind==='carrier'?canReconShip(actor):canFireShip(actor)).toBe(false);
  if(kind==='destroyer')expect(canTorpedoShip(actor)).toBe(false);
  const commands:BattleCommand[]=kind==='carrier'?[{type:'recon',shipId:actor.id,target:{x:4,z:4}}]:[{type:'attack',shipId:actor.id,target:{x:4,z:4}},...(kind==='destroyer'?[{type:'torpedo' as const,shipId:actor.id,target:{x:4,z:4}}]:[])];
  let draws=0;for(const command of commands){const before=JSON.stringify(state);expect(applyAction(state,0,command,()=>{draws++;return .9;}).ok).toBe(false);expect(JSON.stringify(state)).toBe(before);}
  expect(draws).toBe(0);
 }
 for(const difficulty of ['easy','normal','hard'] as const){
  const state=combatBattle();state.islands=[];
  for(const own of state.ships.filter(s=>s.team===0)){const key=own.kind==='carrier'?'flightDeck':'weapon';own.parts![key]={hp:0,maxHp:200,disabled:false};}
  ship(state,'1-destroyer-1').x=3;ship(state,'1-destroyer-1').z=3;
  for(let i=0;i<15&&state.turn===0;i++){const command=chooseAIAction(snapshot(state,0),difficulty,seeded(3),{});expect(command).not.toBeNull();expect(['attack','torpedo','recon']).not.toContain(command!.type);expect(applyAction(state,0,command!,()=>.9).ok).toBe(true);}
 }
});

test('a positive hit destroys weapon or flight deck and the next refreshed turn cannot fire from that ship',()=>{
 for(const kind of ['destroyer','battleship','carrier'] as const){
  const s=combatBattle();s.islands=[];const shooter=ship(s,'0-destroyer-1'),victim=s.ships.find(v=>v.team===1&&v.kind===kind)!;
  victim.x=4;victim.z=4;
  expect(fireCommand(s,0,{type:'attack',shipId:shooter.id,target:victim,localHit:sourceHit(kind,kind==='carrier'?'flightDeck':'weapon')},()=>.9).ok).toBe(true);
  const key=kind==='carrier'?'flightDeck':'weapon';expect(victim.parts![key]).toMatchObject({hp:0,disabled:true});
  expect(act(s,0,'end').ok).toBe(true);expect(victim.ap).toBe(victim.maxAp);
  for(const type of kind==='carrier'?['recon'] as const:kind==='destroyer'?['attack','torpedo'] as const:['attack'] as const){const before=JSON.stringify(s);expect(applyAction(s,1,{type,shipId:victim.id,target:shooter},()=>{throw new Error('disabled action must not consume RNG');}).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
 }
});

test('weapon hits match narrow authored forward, aft and side footprints rather than a full bow strip',()=>{
 for(const kind of ['battleship','destroyer'] as const)for(const r of WEAPON_REGIONS[kind])expect(partAt(kind,{x:(r.x0+r.x1)/2,z:(r.z0+r.z1)/2})).toBe('weapon');
 const source=JSON.parse(readFileSync('artifacts/external-assets/fleet-conversion-report.json','utf8')) as Record<ShipKind,{parts:{system:string|null}[]}>;
 for(const kind of ['battleship','destroyer'] as const)expect(WEAPON_REGIONS[kind]).toHaveLength(source[kind].parts.filter(part=>part.system==='weapon').length);
 expect(WEAPON_REGIONS.battleship.length).toBeGreaterThanOrEqual(3);expect(WEAPON_REGIONS.destroyer.length).toBeGreaterThanOrEqual(5);
 expect(partAt('destroyer',sourceHit('destroyer','weapon'))).toBe('weapon');expect(partAt('battleship',sourceHit('battleship','weapon'))).toBe('weapon');
 for(const kind of ['battleship','destroyer'] as const)expect(partAt(kind,{x:.8,z:-.7})).toBeUndefined();
 expect(partAt('destroyer',sourceHit('destroyer','engine'))).toBe('engine');expect(partAt('battleship',sourceHit('battleship','bridge'))).toBe('bridge');
});
test('all AI difficulties omit subsystem aim even with every enemy system visible',()=>{
 const s=combatBattle();s.islands=[];
 for(const v of s.ships.filter(v=>v.team===0)){v.ap=0;v.sonared=true;v.torpedoed=true;}
 const shooter=ship(s,'0-battleship-1');shooter.ap=1;shooter.x=10;shooter.z=5;shooter.parts!.engine!.disabled=true;
 const victim=ship(s,'1-battleship-1');victim.x=11;victim.z=5;const view=snapshot(s,0);
 for(const difficulty of ['easy','normal','hard'] as const)for(let i=0;i<50;i++){const cmd=chooseAIAction(view,difficulty,seeded(i),{})!;expect(cmd.type).toBe('attack');expect(cmd.localHit).toBeUndefined();}
});
test('hashed fallback covers both surface axes without defense RNG and has exact Python parity',()=>{
 const seeds=Array.from({length:256},(_,i)=>(Math.imul(i+1,1664525)+1013904223)>>>0),hits=seeds.map(fallbackHit);
 for(const axis of ['x','z'] as const){expect(Math.min(...hits.map(h=>h[axis]))).toBeLessThan(-.7);expect(Math.max(...hits.map(h=>h[axis]))).toBeGreaterThan(.7);expect(Math.abs(hits.reduce((sum,h)=>sum+h[axis],0)/hits.length)).toBeLessThan(.08);}
 expect(hits.filter(h=>partAt('destroyer',h)==='weapon').length).toBeLessThan(90);
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import fallback_hit;print(json.dumps([fallback_hit(s) for s in json.load(sys.stdin)]))";
 const run=spawnSync('python',['-c',code],{input:JSON.stringify(seeds),encoding:'utf8'});expect(run.status,run.stderr).toBe(0);expect(JSON.parse(run.stdout)).toEqual(hits);
});

test('hidden fleet mutations cannot alter AI scouting, navigation, remembered fire or torpedo decisions',()=>{
 for(const difficulty of ['easy','normal','hard'] as const)for(let scenario=0;scenario<4;scenario++)for(let seed=0;seed<12;seed++){
  const a=fixtureBattle();a.islands=[];
  if(scenario>0)ship(a,'0-carrier').ap=0;
  if(scenario===2)for(const own of a.ships.filter(v=>v.team===0)){own.torpedoed=true;own.sonared=true;own.ap=own.kind==='carrier'?0:1;own.parts!.engine!.disabled=true;}
  if(scenario===3){ship(a,'0-carrier').parts!.flightDeck!.disabled=true;for(const own of a.ships.filter(v=>v.team===0))own.sonared=true;}
  const b=structuredClone(a);for(const enemy of b.ships.filter(v=>v.team===1)){enemy.x=(enemy.x+seed+1)%30;enemy.z=24;enemy.hp=25+seed;enemy.parts!.bridge!.disabled=true;}
  const av=snapshot(a,0),bv=snapshot(b,0);expect(av.revealed).toEqual([]);expect(bv).toEqual(av);
  const initial:AIMemory=scenario===1||scenario===2?{contacts:[{id:'observed-old-contact',x:8,z:2,hp:400,seen:a.turnNumber-1}]}:{};
  const am=structuredClone(initial),bm=structuredClone(initial);
  expect(chooseAIAction(av,difficulty,seeded(seed),am)).toEqual(chooseAIAction(bv,difficulty,seeded(seed),bm));expect(am).toEqual(bm);
 }
});


test('damage control permanently extinguishes previous impacts across re-hits and snapshots',()=>{
 const s=combatBattle();s.islands=[];const victim=ship(s,'0-battleship-1'),attacker=ship(s,'1-destroyer-1');
 victim.hp=600;victim.damageMarks=[{x:-.4,z:-.4,seed:11},{x:.4,z:.4,seed:12}];attacker.x=victim.x+1;attacker.z=victim.z;
 expect(activeFireMarks(victim).map(m=>m.seed)).toEqual([11,12]);
 expect(act(s,0,'repair',victim.id).ok).toBe(true);expect(victim.extinguishedMarkCount).toBe(2);expect(activeFireMarks(victim)).toEqual([]);
 act(s,0,'end');expect(fireCommand(s,1,{type:'attack',shipId:attacker.id,target:victim,localHit:{x:.8,z:0}},()=>.9).ok).toBe(true);
 expect(victim.damageControl).toBe(false);expect(victim.damageMarks).toHaveLength(3);expect(activeFireMarks(victim)).toEqual([victim.damageMarks![2]]);
 for(const you of [0,1]){const v=[...snapshot(s,you).own,...snapshot(s,you).revealed].find(v=>v.id===victim.id)!;expect(v.extinguishedMarkCount).toBe(2);expect(activeFireMarks(v)).toEqual([victim.damageMarks![2]]);}
 act(s,1,'end');expect(act(s,0,'repair',victim.id).ok).toBe(true);expect(victim.extinguishedMarkCount).toBe(3);
 act(s,0,'end');expect(fireCommand(s,1,{type:'attack',shipId:attacker.id,target:victim,localHit:{x:-.8,z:0}},()=>.9).ok).toBe(true);
 expect(victim.damageMarks).toHaveLength(4);expect(activeFireMarks(victim)).toEqual([victim.damageMarks![3]]);
});

test('torpedo shortest-water routing rejects land and unreachable launches without AP, follows detours and updates heading',()=>{
 const origin={x:1,z:1},target={x:3,z:1},land=[{x:2,z:1}],route=torpedoRoute(origin,target,land);
 expect(route).toHaveLength(4);expect(route.at(-1)).toEqual(target);expect(route).not.toContainEqual(origin);expect(route).not.toContainEqual(land[0]);
 const wall=Array.from({length:30},(_,x)=>({x,z:5}));expect(torpedoRoute({x:3,z:3},{x:3,z:7},wall)).toEqual([]);
 for(const [islands,goal] of [[land,land[0]!],[wall,{x:3,z:7}]] as [Cell[],Cell][]){const s=fixtureBattle();s.islands=islands;Object.assign(ship(s,'0-destroyer-1'),{x:3,z:3});const before=JSON.stringify(s);expect(act(s,0,'torpedo','0-destroyer-1',goal).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
 const s=fixtureBattle();s.islands=[{x:7,z:2}];expect(act(s,0,'torpedo','0-destroyer-1',{x:14,z:2}).ok).toBe(true);expect(s.torpedoes[0]).toMatchObject({x:4,z:2,index:0});const planned=torpedoRoute(ship(s,'0-destroyer-1'),{x:14,z:2},s.islands);present(s);const t=s.torpedoes[0]!;
 expect(t.index).toBe(5);expect(snapshot(s,0).torpedoes![0]!.route).toEqual(planned.slice(5));
 const copy=snapshot(s,0).torpedoes![0]!.route!;copy[0]!.x=99;expect(t.route).toEqual(planned);
 expect(act(s,0,'end').ok).toBe(true);expect(t).toMatchObject({...planned[4],index:5});expect(t.heading).toBe(Math.atan2(planned[4]!.x-planned[3]!.x,planned[4]!.z-planned[3]!.z));expect(snapshot(s,0).torpedoes![0]!.route).toEqual(planned.slice(5));
 const observer=ship(s,'1-carrier');observer.x=t.x;observer.z=t.z+1;const enemy=snapshot(s,1).torpedoes![0]!;expect(Object.keys(enemy).sort()).toEqual(['heading','id','route','team','x','z']);
 const different=structuredClone(s);for(const enemy of different.ships.filter(v=>v.team===1)){enemy.x=27;enemy.z=27;}expect(torpedoRoute({x:4,z:2},{x:14,z:2},different.islands)).toEqual(planned);
});
test('TS/Python water routes match and are minimal over varied terrain with no diagonal corner cutting',()=>{
 const cases:{origin:Cell;target:Cell;islands:Cell[]}[]=[{origin:{x:1,z:1},target:{x:3,z:1},islands:[{x:2,z:1}]},{origin:{x:3,z:3},target:{x:3,z:7},islands:Array.from({length:30},(_,x)=>({x,z:5}))}];
 const rng=seeded(19);for(let n=0;n<50;n++){const origin={x:Math.floor(rng()*30),z:Math.floor(rng()*30)},target={x:Math.floor(rng()*30),z:Math.floor(rng()*30)},islands=n%2?ISLANDS.flat().map(c=>({...c})):Array.from({length:80},()=>({x:Math.floor(rng()*30),z:Math.floor(rng()*30)}));cases.push({origin,target,islands});}
 function shortestLength(origin:Cell,target:Cell,islands:Cell[]):number|undefined {
  const blocked=new Set(islands.map(cellKey));if(blocked.has(cellKey(origin))||blocked.has(cellKey(target)))return undefined;
  const queue=[{...origin,d:0}],seen=new Set([cellKey(origin)]);
  for(let i=0;i<queue.length;i++){const p=queue[i]!;if(cellKey(p)===cellKey(target))return p.d;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const q={x:p.x+dx,z:p.z+dz};if(q.x<0||q.z<0||q.x>=30||q.z>=30||seen.has(cellKey(q))||blocked.has(cellKey(q))||dx&&dz&&(blocked.has(cellKey({x:q.x,z:p.z}))||blocked.has(cellKey({x:p.x,z:q.z}))))continue;seen.add(cellKey(q));queue.push({...q,d:p.d+1});}}
  return undefined;
 }
 const expected=cases.map(c=>torpedoRoute(c.origin,c.target,c.islands));
 for(let i=0;i<cases.length;i++){const c=cases[i]!,route=expected[i]!,minimal=shortestLength(c.origin,c.target,c.islands);expect(route.length).toBe(minimal??0);let previous=c.origin;for(const step of route){expect(Math.max(Math.abs(step.x-previous.x),Math.abs(step.z-previous.z))).toBe(1);expect(c.islands).not.toContainEqual(step);if(step.x!==previous.x&&step.z!==previous.z){expect(c.islands).not.toContainEqual({x:step.x,z:previous.z});expect(c.islands).not.toContainEqual({x:previous.x,z:step.z});}previous=step;}if(route.length)expect(route.at(-1)).toEqual(c.target);}
 const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import torpedo_route;print(json.dumps([torpedo_route(c['origin'],c['target'],c['islands']) for c in json.load(sys.stdin)]))";
 const py=spawnSync('python',['-c',code],{input:JSON.stringify(cases),encoding:'utf8'});expect(py.status,py.stderr).toBe(0);expect(JSON.parse(py.stdout)).toEqual(expected);
});

test('AI launches a terrain-routed torpedo toward a legitimate contact behind an island',()=>{
 for(const difficulty of ['easy','normal','hard'] as const){const s=fixtureBattle();s.islands=[{x:7,z:2}];for(const v of s.ships.filter(v=>v.team===0))v.ap=0;const launcher=ship(s,'0-destroyer-1');launcher.ap=1;const target=ship(s,'1-carrier');target.x=8;target.z=2;s.recon=[{team:0,carrierId:'0-carrier',center:{x:8,z:2},expiresAt:99}];
  const cmd=chooseAIAction(snapshot(s,0),difficulty,seeded(42),{})!;expect(cmd).toMatchObject({type:'torpedo',shipId:launcher.id,target:{x:8,z:2}});expect(applyAction(s,0,cmd,()=>.9).ok).toBe(true);present(s);expect(s.lastShot).toMatchObject({kind:'torpedo',damage:300});expect(target.hp).toBe(700);
 }
});


test('enemy torpedo paths require current passive or sonar detection and remain detached from authority',()=>{
 const s=fixtureBattle();s.islands=[];expect(act(s,0,'torpedo','0-destroyer-1',{x:19,z:2}).ok).toBe(true);act(s,0,'end');
 const observer=ship(s,'1-carrier');observer.x=12;observer.z=8;expect(snapshot(s,1).torpedoes).toEqual([]);
 expect(act(s,1,'sonar',observer.id).ok).toBe(true);const contact=snapshot(s,1).torpedoes![0]!;
 expect(contact.route).toEqual(s.torpedoes[0]!.route.slice(s.torpedoes[0]!.index));expect(contact.target).toBeUndefined();expect(Object.keys(contact).sort()).toEqual(['heading','id','route','team','x','z']);
 contact.route![0]!.x=999;expect(s.torpedoes[0]!.route[s.torpedoes[0]!.index]!.x).not.toBe(999);
 s.turnNumber=s.sonar[0]!.expiresAt+1;expect(snapshot(s,1).torpedoes).toEqual([]);
 observer.x=10;observer.z=2;expect(snapshot(s,1).torpedoes![0]!.route).toHaveLength(10);
 observer.x=26;observer.z=26;expect(snapshot(s,1).torpedoes).toEqual([]);expect(snapshot(s,0).torpedoes![0]!.route).toHaveLength(10);
});


test('final sinking cancels remaining salvos and torpedoes, and victory waits only for the final presentation',()=>{
 const s=fixtureBattle();s.islands=[];for(const v of s.ships.filter(v=>v.team===1)){v.hp=0;v.sunk=true;}
 const victim=ship(s,'1-battleship-1');Object.assign(victim,{hp:200,sunk:false,x:6,z:2});
 expect(reserveAction(s,0,{type:'attack',shipId:'0-destroyer-1',target:victim}).ok).toBe(true);
 for(const id of ['0-destroyer-2','0-destroyer-3'])expect(reserveAction(s,0,{type:'attack',shipId:id,target:{x:29,z:29}}).ok).toBe(true);
 expect(reserveAction(s,0,{type:'torpedo',shipId:'0-destroyer-3',target:{x:14,z:4}}).ok).toBe(true);
 expect(reserveAction(s,0,{type:'end'}).ok).toBe(true);const hit=resolveAttackStep(s,()=>.9);
 expect(hit.shot?.sunk).toBe(true);expect(s.phase).toBe('battle');expect(s.combatPhase).toBe('attack');expect(s.queuedAttacks).toEqual([[],[]]);expect(s.pendingTorpedoes).toEqual([]);expect(s.torpedoes).toEqual([]);expect(s.attackProgress).toEqual({completed:1,total:1});
 const sequence=s.sequence;expect(resolveAttackStep(s,()=>{throw new Error('No extra salvo or RNG after the final sinking');})).toMatchObject({ok:true,complete:true});expect(s).toMatchObject({phase:'finished',winner:0,sequence});expect(s.history).toHaveLength(1);
});
