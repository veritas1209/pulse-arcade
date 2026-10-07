import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {createBattle,applyAction,resolveAttackStep,snapshot,canAttack,reachableCells,chooseAIAction} from '../src/rules';
import type {BattleState} from '../src/rules';
const ship=(s:BattleState,id:string)=>s.ships.find(s=>s.id===id)!;
function battle(){const s=createBattle();s.turnNumber=3;s.round=2;s.islands=[];return s;}
function end(s:BattleState,team=s.turn){expect(applyAction(s,team,{type:'end'}).ok).toBe(true);}
const resolve=(s:BattleState)=>resolveAttackStep(s,()=>1);
test('carrier aircraft precedes D1 D2 D3 B1 B2 B3 even when reserved last; same-ship reservations remain stable',()=>{
 const s=battle(),target=ship(s,'1-carrier');Object.assign(target,{x:20,z:20});
 s.ships.filter(x=>x.team===0).forEach((x,i)=>Object.assign(x,{x:14+i,z:15}));
 for(const id of ['0-battleship-3','0-battleship-2','0-battleship-1','0-destroyer-3','0-destroyer-2','0-destroyer-1'])expect(applyAction(s,0,{type:'attack',shipId:id,target}).ok).toBe(true);
 expect(applyAction(s,0,{type:'torpedo',shipId:'0-destroyer-3',target:{x:25,z:15}}).ok).toBe(true);
 expect(applyAction(s,0,{type:'recon',shipId:'0-carrier',target}).ok).toBe(true);end(s);
 expect(s.queuedAttacks[0].map(a=>[a.shipId,a.kind])).toEqual([['0-carrier','airstrike'],['0-destroyer-1','missile'],['0-destroyer-2','missile'],['0-destroyer-3','missile'],['0-battleship-1','shell'],['0-battleship-2','shell'],['0-battleship-3','shell']]);
 const launches:string[]=[];for(let i=0;i<8;i++){const r=resolve(s);launches.push(r.shot?.sourceShip?.id??'0-destroyer-3');}expect(launches).toEqual(['0-carrier','0-destroyer-1','0-destroyer-2','0-destroyer-3','0-destroyer-3','0-battleship-1','0-battleship-2','0-battleship-3']);
});
test('reservations spend AP immediately, hide enemy queue and execute fleet order without early damage or RNG',()=>{
 const s=battle(),target=ship(s,'1-carrier');let draws=0;
 for(const id of ['0-destroyer-2','0-destroyer-1'])expect(applyAction(s,0,{type:'attack',shipId:id,target},()=>{draws++;return 1;}).ok).toBe(true);
 expect(draws).toBe(0);expect(target.hp).toBe(1000);expect(s.sequence).toBe(0);expect(ship(s,'0-destroyer-1').ap).toBe(3);
 expect(snapshot(s,0).queuedAttacks?.map(a=>a.shipId)).toEqual(['0-destroyer-2','0-destroyer-1']);expect(snapshot(s,1).queuedAttacks).toEqual([]);
 snapshot(s,0).queuedAttacks![0]!.target.x=999;expect(s.queuedAttacks[0][0]!.target.x).toBe(target.x);
 end(s);expect(s.turn).toBe(0);expect(s.turnNumber).toBe(3);expect(canAttack(snapshot(s,0))).toBe(false);expect(reachableCells(snapshot(s,0),'0-carrier')).toEqual([]);expect(chooseAIAction(snapshot(s,0))).toBeNull();
 const frozen=JSON.stringify(s);for(const team of [0,1])for(const type of ['end','move','attack','repair','recon','sonar','torpedo'] as const)expect(applyAction(s,team,{type,shipId:`${team}-carrier`,target}).ok).toBe(false);expect(JSON.stringify(s)).toBe(frozen);
 expect(resolve(s).shot?.sourceShip?.id).toBe('0-destroyer-1');expect(target.hp).toBe(800);expect(s.turn).toBe(0);
 expect(resolve(s).shot?.sourceShip?.id).toBe('0-destroyer-2');expect(target.hp).toBe(600);expect(s.turn).toBe(0);expect(s.combatPhase).toBe('attack');
 expect(resolve(s).complete).toBe(true);expect(s.turn).toBe(1);expect(s.turnNumber).toBe(4);expect(s.combatPhase).toBe('action');
});
test('end with empty queue resolves explicitly and exhausted AP does not pass automatically',()=>{
 const s=battle();for(const own of s.ships.filter(x=>x.team===0))own.ap=0;
 expect(s.turn).toBe(0);end(s);expect(s.turn).toBe(0);expect(snapshot(s,0).resolutionStep).toBeUndefined();expect(resolve(s).complete).toBe(true);expect(s.turn).toBe(1);
});
test('launcher uses final position and source/target snapshots preserve fog',()=>{
 const s=battle(),launcher=ship(s,'0-destroyer-1'),target=ship(s,'1-carrier');
 expect(applyAction(s,0,{type:'attack',shipId:launcher.id,target}).ok).toBe(true);expect(applyAction(s,0,{type:'move',shipId:launcher.id,target:{x:1,z:1}}).ok).toBe(true);end(s);resolve(s);
 expect(snapshot(s,0).lastShot?.source).toEqual({x:1,z:1});expect(snapshot(s,1).lastShot?.source).toEqual({x:1,z:1});expect(snapshot(s,1).lastShot?.sourceShip?.id).toBe(launcher.id);expect(snapshot(s,1).revealed).toEqual([]);expect(snapshot(s,0).lastShot?.targetBefore?.id).toBe(target.id);expect(snapshot(s,0).revealed).toEqual([]);expect(snapshot(s,1).lastShot?.targetBefore?.hp).toBe(1000);expect(snapshot(s,1).lastShot?.targetAfter?.hp).toBe(800);
 target.hp=1;expect(snapshot(s,1).lastShot?.targetAfter?.hp).toBe(800);target.hp=800;resolve(s);expect(snapshot(s,1).lastShot?.source).toBeUndefined();expect(snapshot(s,1).lastShot?.sourceShip).toBeUndefined();
});
test('victory remains locked until final presentation, later attacks launch and miss destroyed tile',()=>{
 const s=battle(),target=ship(s,'1-destroyer-1');for(const enemy of s.ships.filter(x=>x.team===1&&x!==target)){enemy.hp=0;enemy.sunk=true;}target.hp=100;
 for(const id of ['0-destroyer-1','0-destroyer-2'])expect(applyAction(s,0,{type:'attack',shipId:id,target}).ok).toBe(true);end(s);
 expect(resolve(s).shot?.sunk).toBe(true);expect(snapshot(s,1).lastShot?.targetBefore?.hp).toBe(100);expect(snapshot(s,1).lastShot?.targetAfter?.hp).toBe(0);expect(s.phase).toBe('battle');expect(s.winner).toBeNull();expect(resolve(s).shot?.hit).toBe(false);expect(s.phase).toBe('battle');expect(resolve(s).complete).toBe(true);expect(s.phase).toBe('finished');expect(s.winner).toBe(0);
});
test('recon reveals immediately and reserves its strike in order for end; opening recon never attacks',()=>{
 const s=battle(),target=ship(s,'1-carrier');expect(applyAction(s,0,{type:'recon',shipId:'0-carrier',target}).ok).toBe(true);expect(snapshot(s,0).revealed.some(e=>e.id===target.id)).toBe(true);expect(target.hp).toBe(1000);end(s);expect(resolve(s).shot?.kind).toBe('airstrike');expect(target.hp).toBe(800);
 const opening=createBattle();expect(applyAction(opening,0,{type:'recon',shipId:'0-carrier',target:{x:26,z:26}}).ok).toBe(true);end(opening);expect(opening.attackProgress.total).toBe(0);expect(resolve(opening).complete).toBe(true);
});
test('torpedo launches immediately and advances at either side end with unique no-shot steps',()=>{
 const s=battle(),launcher=ship(s,'0-destroyer-1');Object.assign(launcher,{x:1,z:10});
 expect(applyAction(s,0,{type:'torpedo',shipId:launcher.id,target:{x:16,z:10}}).ok).toBe(true);expect(s.torpedoes).toHaveLength(1);expect(s.torpedoes[0]).toMatchObject({x:1,z:10,index:0});expect(s.queuedAttacks[0]).toEqual([]);end(s);expect(resolve(s).shot).toBeUndefined();const token=s.resolutionStep!;expect(s.torpedoes[0]?.x).toBe(6);expect(s.attackProgress.completed).toBe(1);resolve(s);
 end(s);expect(resolve(s).shot).toBeUndefined();expect(s.torpedoes[0]?.x).toBe(11);expect(s.resolutionStep).toBeGreaterThan(token);
 s.connected=[true,false];const frozen=JSON.stringify(s);expect(resolve(s).ok).toBe(false);expect(JSON.stringify(s)).toBe(frozen);s.connected=[true,true];expect(resolve(s).complete).toBe(true);
});
test('persistent torpedoes resolve inside their launcher fleet slot after carrier and before later ships',()=>{
 const s=battle(),launcher=ship(s,'0-destroyer-1');Object.assign(launcher,{x:1,z:10});expect(applyAction(s,0,{type:'torpedo',shipId:launcher.id,target:{x:16,z:10}}).ok).toBe(true);end(s);resolve(s);resolve(s);end(s);resolve(s);resolve(s);
 expect(applyAction(s,0,{type:'attack',shipId:'0-destroyer-2',target:{x:26,z:26}}).ok).toBe(true);expect(applyAction(s,0,{type:'recon',shipId:'0-carrier',target:{x:26,z:26}}).ok).toBe(true);end(s);
 expect(resolve(s).shot?.sourceShip?.id).toBe('0-carrier');expect(s.torpedoes[0]?.x).toBe(11);expect(resolve(s).shot).toBeUndefined();expect(s.torpedoes).toEqual([]);expect(resolve(s).shot?.sourceShip?.id).toBe('0-destroyer-2');
});
test('TS/Python parity through mixed reservations, resolve steps, misses, turn damage and fog snapshots',()=>{
 const py=process.env.BATTLESHIP_PYTHON??'C:/Users/hajin/AppData/Local/Programs/Python/Python312/python.exe';
 const s=battle(),target=ship(s,'1-carrier'),commands=[{type:'torpedo',shipId:'0-destroyer-2',target:{x:15,z:3}},{type:'attack',shipId:'0-destroyer-1',target:{x:target.x,z:target.z}},{type:'recon',shipId:'0-carrier',target:{x:target.x,z:target.z}},{type:'end'}] as const;
 const frames:unknown[]=[];for(const c of commands){expect(applyAction(s,0,c).ok).toBe(true);frames.push([snapshot(s,0),snapshot(s,1)]);}for(let i=0;i<4;i++){expect(resolve(s).ok).toBe(true);frames.push([snapshot(s,0),snapshot(s,1)]);}
 const script=`import sys,json\nsys.path.insert(0,'server')\nfrom battleship_rooms import *\ns=create_battle();s['turnNumber']=3;s['round']=2;s['islands']=[]\nframes=[]\nfor c in json.loads(sys.stdin.read()):\n assert apply_action(s,0,c)['ok'];frames.append([snapshot(s,0),snapshot(s,1)])\nfor _ in range(4):\n assert resolve_attack_step(s,lambda:1)['ok'];frames.append([snapshot(s,0),snapshot(s,1)])\nprint(json.dumps(frames))`;
 const result=spawnSync(py,['-c',script],{cwd:process.cwd(),input:JSON.stringify(commands),encoding:'utf8'});expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toEqual(frames);
});


test('torpedo contact carries the final water route segment even when launcher origin is hidden',()=>{
 const s=battle(),launcher=ship(s,'0-destroyer-1'),victim=ship(s,'1-carrier');Object.assign(launcher,{x:1,z:10});Object.assign(victim,{x:5,z:10});
 expect(applyAction(s,0,{type:'torpedo',shipId:launcher.id,target:{x:16,z:10}}).ok).toBe(true);end(s);const impact=resolve(s).shot!;
 expect(impact.approachFrom).toEqual({x:4,z:10});expect(impact.source).toEqual({x:1,z:10});for(const you of [0,1])expect(snapshot(s,you).shots?.[0]?.approachFrom).toEqual({x:4,z:10});expect(snapshot(s,0).revealed).toEqual([]);
});
