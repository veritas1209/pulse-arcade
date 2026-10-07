import {test,expect} from '@playwright/test';
import {createResultGate} from '../src/result-gate';
import {applyAction,createBattle,snapshot} from '../src/rules';
import type {Shot} from '../src/contract';

const event=(sequence:number):Pick<Shot,'sequence'>=>({sequence});
test('terminal result waits for torpedo arrival even when scene has no prepared damage yet',()=>{
 const gate=createResultGate();gate.launch(event(1));
 for(let frame=0;frame<100;frame++)expect(gate.ready('finished',false)).toBe(false);
 gate.impact(event(1));expect(gate.ready('finished',false)).toBe(false);
 expect(gate.ready('finished',true)).toBe(false);
 expect(gate.ready('finished',false)).toBe(false);
 expect(gate.ready('finished',false)).toBe(true);
});
test('all arrivals and asynchronous sinking must finish before showing victory',()=>{
 const gate=createResultGate();gate.launch(event(1));gate.launch(event(2));
 gate.impact(event(2));expect(gate.ready('finished',false)).toBe(false);
 gate.impact(event(1));for(let frame=0;frame<450;frame++)expect(gate.ready('finished',true)).toBe(false);
 expect(gate.ready('finished',false)).toBe(false);expect(gate.ready('finished',false)).toBe(true);
 gate.launch(event(3));expect(gate.ready('finished',false)).toBe(false);
 gate.impact(event(3));expect(gate.ready('finished',false)).toBe(false);expect(gate.ready('finished',false)).toBe(true);
});
test('reset cancels old arrivals and finished reconnects require no historical replay',()=>{
 const gate=createResultGate();gate.launch(event(9));gate.reset();
 expect(gate.diagnostics().arrivingShots).toEqual([]);
 expect(gate.ready('battle',false)).toBe(false);expect(gate.ready('setup',false)).toBe(false);
 expect(gate.ready('finished',false)).toBe(false);expect(gate.ready('finished',false)).toBe(true);
 // Receiving the same authority state creates no new launch callback.
 expect(gate.ready('finished',false)).toBe(true);
});
for(const visible of [false,true])test(`final carrier torpedo snapshot (${visible?'visible':'hidden'}) preserves impact event ordering without hidden model disclosure`,()=>{
 const state=createBattle();state.islands=[];state.turnNumber=3;state.round=2;state.ownTurns=[2,1];
 const launcher=state.ships.find(s=>s.id==='0-destroyer-1')!;launcher.x=4;launcher.z=2;
 for(const ship of state.ships.filter(s=>s.team===1)){ship.sunk=true;ship.hp=0;ship.ap=0;}
 const carrier=state.ships.find(s=>s.id==='1-carrier')!;Object.assign(carrier,{x:8,z:2,sunk:false,hp:300,damageControl:true});
 if(visible)Object.assign(state.ships.find(s=>s.id==='0-carrier')!,{x:7,z:2});
 expect(snapshot(state,0).revealed.some(s=>s.id===carrier.id)).toBe(visible);
 expect(applyAction(state,0,{type:'torpedo',shipId:launcher.id,target:{x:14,z:2}}).ok).toBe(true);
 const projectileId=state.torpedoes[0]!.id;
 expect(applyAction(state,0,{type:'end'}).ok).toBe(true);
 const final=snapshot(state,0);expect(final.phase).toBe('finished');expect(final.winner).toBe(0);
 expect(final.torpedoes).toEqual([]);expect(final.shots).toHaveLength(1);
 const shot=final.shots![0]!;expect(shot).toMatchObject({kind:'torpedo',projectileId,sunk:true,damage:300});
 expect(!!shot.targetBefore).toBe(visible);expect(shot.shipId!==undefined).toBe(visible);
 const gate=createResultGate();gate.launch(shot);expect(gate.ready(final.phase,false)).toBe(false);
 gate.impact(shot);expect(gate.ready(final.phase,true)).toBe(false);
 expect(gate.ready(final.phase,false)).toBe(false);expect(gate.ready(final.phase,false)).toBe(true);
});
