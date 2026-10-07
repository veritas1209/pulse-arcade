import type { BattleCommand, Cell, Placement, QueuedAttack, ReconView, ShipKind, ShipView, Shot, SonarView, TorpedoView, ViewState } from './contract';
import {createParts,partAt,partDisabled,canMoveShip,canFireShip,canReconShip,canRepairShip,repairEligible,canSonarShip,canTorpedoShip} from './parts';
export type { Placement } from './contract';

export const BOARD_SIZE = 30;
export const SHIPS: Record<ShipKind, { label: string; hp: number; ap: number; count: number; damage: number; range: number }> = {
 carrier: { label: '항공모함', hp: 1000, ap: 4, count: 1, damage: 0, range: 0 },
 destroyer: { label: '구축함', hp: 500, ap: 4, count: 3, damage: 200, range: Infinity },
 battleship: { label: '전함', hp: 800, ap: 4, count: 3, damage: 200, range: 12.5 },
};
const STARTING_FLEET: [ShipKind,string,number,number][] = [['carrier','carrier',3,3],['destroyer','destroyer-1',2,1],['destroyer','destroyer-2',5,3],['battleship','battleship-1',2,5],['battleship','battleship-2',4,5],['destroyer','destroyer-3',4,1],['battleship','battleship-3',1,3]];
export const FLEET_SIZE = STARTING_FLEET.length;
const ISLAND_ROWS = [
 { x:5,z:8,rows:[[2,3,4],[1,2,3,4,5],[0,1,2,3,4,5],[0,1,2,3,4,5,6],[1,2,3,4,5],[2,3,4]] },
 { x:18,z:10,rows:[[2,3],[1,2,3,4],[0,1,2,3,4,5],[0,1,2,3,4,5],[1,2,3,4,5],[2,3,4]] },
 { x:11,z:19,rows:[[2,3,4,5],[1,2,3,4,5,6],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[1,2,3,4,5,6],[3,4,5]] },
];
export const ISLANDS: Cell[][] = ISLAND_ROWS.map(island => island.rows.flatMap((row,z) => row.map(x => ({x:island.x+x,z:island.z+z}))));
const DIRECTIONS = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,-1],[-1,1]] as const;
interface TorpedoState extends TorpedoView {source:Cell;shipId:string;target:Cell;route:Cell[];index:number;nextAdvanceAt:number;sourceVisibility:[boolean,boolean]}
interface ShotEvent {shot:Shot;source:[boolean,boolean];target:[boolean,boolean];interceptor:[boolean,boolean]}
export interface BattleState {
 combatPhase:'action'|'attack';queuedAttacks:[QueuedAttack[],QueuedAttack[]];reservationSequence:number;attackProgress:{completed:number;total:number};pendingTorpedoes:string[];resolutionCounter?:number;resolutionStep?:number;
 phase: ViewState['phase']; turn:number; round:number; turnNumber:number; winner:number|null;
 ships:ShipView[]; islands:Cell[]; recon:ReconView[]; sonar:SonarView[]; torpedoes:TorpedoState[]; torpedoSequence:number; shotEvents:ShotEvent[]; history:Shot[]; ownTurns:[number,number];
 ready:[boolean,boolean]; connected:[boolean,boolean]; revision:number; sequence:number; lastShot?:Shot; lastShotVisibility?:[boolean,boolean]; lastShotInterceptorVisibility?:[boolean,boolean]; lastShotTargetVisibility?:[boolean,boolean];
}
export function cellKey(c:Cell):string {return c.x+','+c.z;}
export function inBounds(c:Cell):boolean {return !!c&&Number.isInteger(c.x)&&Number.isInteger(c.z)&&c.x>=0&&c.z>=0&&c.x<30&&c.z<30;}
export function isOpeningTurn(view:Pick<ViewState,'turnNumber'>):boolean {return view.turnNumber<=2;}
export function canAttack(view:Pick<ViewState,'phase'|'turn'|'you'|'connected'|'turnNumber'|'combatPhase'>):boolean {
 return view.phase==='battle'&&view.combatPhase!=='attack'&&view.turn===view.you&&view.connected.every(Boolean)&&!isOpeningTurn(view);
}
function cloneCell(c:Cell):Cell {return {x:c.x,z:c.z};}
export function deploymentCells(team:number):Cell[] {
 if(team!==0&&team!==1)return [];
 const offset=team?23:0;
 return Array.from({length:49},(_,i)=>({x:offset+i%7,z:offset+Math.floor(i/7)}));
}
export function placementValid(fleet:Placement[],team:number):boolean {
 if(!Array.isArray(fleet)||fleet.length!==FLEET_SIZE||(team!==0&&team!==1))return false;
 const ids=new Set(STARTING_FLEET.map(([,id])=>team+'-'+id));
 const zone=new Set(deploymentCells(team).map(cellKey)),occupied=new Set<string>();
 for(const p of fleet){
  if(!p||!inBounds(p)||!ids.delete(p.id)||!zone.has(cellKey(p))||occupied.has(cellKey(p)))return false;
  if(p.heading!==undefined&&(typeof p.heading!=='number'||!Number.isFinite(p.heading)))return false;
  occupied.add(cellKey(p));
 }
 return ids.size===0;
}
export function applyPlacement(state:BattleState,team:number,fleet:Placement[]):{ok:boolean;error?:string}{
 if(state.phase!=='setup'||(team!==0&&team!==1)||state.ready[team])return {ok:false,error:'배치를 변경할 수 없습니다'};
 if(!placementValid(fleet,team))return {ok:false,error:`함선 ${FLEET_SIZE}척을 시작 구역 안에 겹치지 않게 배치하세요`};
 for(const p of fleet){const s=state.ships.find(s=>s.id===p.id)!;s.x=p.x;s.z=p.z;if(p.heading!==undefined){const heading=p.heading%(2*Math.PI);s.heading=heading<0?heading+2*Math.PI:heading;}}
 state.revision++;return {ok:true};
}
export function startBattle(state:BattleState):{ok:boolean;error?:string}{
 if(state.phase!=='setup'||![0,1].every(team=>placementValid(state.ships.filter(s=>s.team===team),team)))return {ok:false,error:'함선 배치를 확인하세요'};
 state.ready=[true,true];state.phase='battle';state.revision++;return {ok:true};
}
export function createBattle(started=true):BattleState {
 const ships:ShipView[]=[];
 for(let team=0;team<2;team++){
  for(const [kind,suffix,x,z] of STARTING_FLEET){
   const spec=SHIPS[kind];
   ships.push({id:team+'-'+suffix,kind,team,x:team?29-x:x,z:team?29-z:z,heading:team?Math.PI:0,hp:spec.hp,maxHp:spec.hp,ap:spec.ap,maxAp:spec.ap,attacked:false,moved:false,sunk:false,parts:createParts(kind),scouted:false,repaired:false,repairCharges:2,damageControl:false,sonared:false,torpedoed:false});
  }
 }
 return {combatPhase:'action',queuedAttacks:[[],[]],reservationSequence:0,attackProgress:{completed:0,total:0},pendingTorpedoes:[],phase:started?'battle':'setup',turn:0,round:1,turnNumber:1,winner:null,ships,islands:ISLANDS.flat().map(cloneCell),recon:[],sonar:[],torpedoes:[],torpedoSequence:0,shotEvents:[],history:[],ownTurns:[1,0],ready:[started,started],connected:[true,true],revision:0,sequence:0};
}
function reconCells(center:Cell):Cell[] {
 const result:Cell[]=[];
 for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++)if(!(Math.abs(x)===2&&Math.abs(z)===2)){
  const c={x:center.x+x,z:center.z+z};if(inBounds(c))result.push(c);
 }
 return result;
}
function activeRecon(state:BattleState,team:number):ReconView[]{
 return state.recon.filter(r=>r.team===team&&r.expiresAt>=state.turnNumber&&state.ships.some(s=>s.id===r.carrierId&&!s.sunk&&!partDisabled(s,'flightDeck')));
}
function sonarCells(center:Cell,islands:Cell[]):Cell[]{
 const land=new Set(islands.map(cellKey)),cells:Cell[]=[];
 for(let z=-12;z<=12;z++)for(let x=-12;x<=12;x++){const c={x:center.x+x,z:center.z+z};if(x*x+z*z<=144&&inBounds(c)&&!land.has(cellKey(c)))cells.push(c);}
 return cells;
}
function activeSonar(state:BattleState,team:number):SonarView[]{return state.sonar.filter(r=>r.team===team&&r.expiresAt>=state.turnNumber&&state.ships.some(s=>s.id===r.shipId&&!s.sunk&&!partDisabled(s,'bridge')));}
/** Eight-neighbor shortest water route. Only public terrain participates in planning. */
export function torpedoRoute(origin:Cell,target:Cell,islands:Cell[]=[]):Cell[]{
 const land=new Set(islands.map(cellKey));
 if(!inBounds(origin)||!inBounds(target)||land.has(cellKey(origin))||land.has(cellKey(target))||cellKey(origin)===cellKey(target))return [];
 const validStep=(from:Cell,to:Cell)=>inBounds(to)&&!land.has(cellKey(to))&&(from.x===to.x||from.z===to.z||!land.has(cellKey({x:to.x,z:from.z}))&&!land.has(cellKey({x:from.x,z:to.z})));
 const direct:Cell[]=[];let x=origin.x,z=origin.z;const dx=Math.abs(target.x-x),dz=Math.abs(target.z-z),sx=x<target.x?1:-1,sz=z<target.z?1:-1;let error=dx-dz;
 while(x!==target.x||z!==target.z){const from={x,z},twice=2*error;if(twice>-dz){error-=dz;x+=sx;}if(twice<dx){error+=dx;z+=sz;}if(!validStep(from,{x,z})){direct.length=0;break;}direct.push({x,z});}
 if(direct.length)return direct;
 const queue:Cell[]=[cloneCell(origin)],previous=new Map<string,Cell|null>([[cellKey(origin),null]]);
 for(let head=0;head<queue.length;head++){
  const current=queue[head]!;
  const neighbors=DIRECTIONS.map(([dx,dz],order)=>({cell:{x:current.x+dx,z:current.z+dz},order})).sort((a,b)=>(a.cell.x-target.x)**2+(a.cell.z-target.z)**2-((b.cell.x-target.x)**2+(b.cell.z-target.z)**2)||a.order-b.order);
  for(const {cell} of neighbors){const key=cellKey(cell);if(previous.has(key)||!validStep(current,cell))continue;previous.set(key,current);
   if(key===cellKey(target)){const route:Cell[]=[];let step:Cell|null=cell;while(step&&cellKey(step)!==cellKey(origin)){route.push(cloneCell(step));step=previous.get(cellKey(step))!;}return route.reverse();}
   queue.push(cell);
  }
 }
 return [];
}

function visibleCells(state:BattleState,team:number):Map<string,Cell>{
 const visible=new Map<string,Cell>();
 for(const r of activeSonar(state,team))for(const c of sonarCells(r.center,state.islands))visible.set(cellKey(c),c);
 for(const r of activeRecon(state,team))for(const c of reconCells(r.center))visible.set(cellKey(c),c);
 for(const ship of state.ships.filter(s=>s.team===team&&!s.sunk))for(const c of reconCells(ship).filter(c=>!partDisabled(ship,'radar')||Math.abs(c.x-ship.x)<=1&&Math.abs(c.z-ship.z)<=1))visible.set(cellKey(c),c);
 return visible;
}
export function snapshot(state:BattleState,you:number):ViewState {
 const recon=activeRecon(state,you),visible=visibleCells(state,you),sonar=activeSonar(state,you);
 const cloneShip=(s:ShipView):ShipView=>({...s,...(s.parts?{parts:Object.fromEntries(Object.entries(s.parts).map(([id,p])=>[id,{...p}]))}:{}),...(s.damageMarks?{damageMarks:s.damageMarks.map(m=>({...m}))}:{})});
 const own=state.ships.filter(s=>s.team===you).map(cloneShip);
 const revealed=state.ships.filter(s=>s.team!==you&&visible.has(cellKey(s))).map(cloneShip);
 const view:ViewState={phase:state.phase==='setup'&&state.ready[you]?'waiting':state.phase,you,turn:state.turn,round:state.round,turnNumber:state.turnNumber,winner:state.winner,own,revealed,islands:state.islands.map(cloneCell),visibleCells:[...visible.values()].map(cloneCell),recon:recon.map(r=>({...r,center:cloneCell(r.center)})),ready:[...state.ready],connected:[...state.connected],revision:state.revision,sonar:sonar.map(r=>({...r,center:cloneCell(r.center)})),torpedoes:state.torpedoes.filter(t=>t.team===you||visible.has(cellKey(t))).map(t=>({id:t.id,team:t.team,x:t.x,z:t.z,heading:t.heading,route:t.route.slice(t.index).map(cloneCell),...(t.team===you?{target:cloneCell(t.target)}:{})}))};
 const filterShot=(shot:Shot,flags:Pick<ShotEvent,'source'|'target'|'interceptor'>):Shot=>{
  const presentingSource=state.combatPhase==='attack'&&state.shotEvents.some(event=>event.shot.sequence===shot.sequence);
  const result:Shot={x:shot.x,z:shot.z,by:shot.by,sequence:shot.sequence,hit:shot.hit,damage:shot.damage,blocked:shot.blocked,halved:shot.halved,...(shot.sunk!==undefined?{sunk:shot.sunk}:{})};
  if(shot.projectileId&&(shot.by===you||visible.has(cellKey(shot))))result.projectileId=shot.projectileId;
  if(shot.approachFrom)result.approachFrom=cloneCell(shot.approachFrom);if(shot.localHit)result.localHit=cloneCell(shot.localHit);if(shot.kind)result.kind=shot.kind;
  if(shot.targetBefore&&(shot.targetBefore.team===you||shot.by===you&&shot.hit&&!shot.blocked||flags.target[you]&&revealed.concat(own).some(s=>s.id===shot.targetBefore!.id&&visible.has(cellKey(s)))))result.targetBefore=cloneShip(shot.targetBefore);
  if(shot.interceptedBy&&flags.interceptor[you]&&visible.has(cellKey(shot.interceptedBy)))result.interceptedBy=cloneCell(shot.interceptedBy);
  if(shot.source&&(presentingSource||shot.by===you||flags.source[you]&&visible.has(cellKey(shot.source))))result.source=cloneCell(shot.source);
  if(result.source&&shot.sourceShip)result.sourceShip=cloneShip(shot.sourceShip);
  if(result.targetBefore&&shot.targetAfter)result.targetAfter=cloneShip(shot.targetAfter);
  if(shot.shipId&&(own.some(s=>s.id===shot.shipId)||revealed.some(s=>s.id===shot.shipId)))result.shipId=shot.shipId;
  return result;
 };
 if(state.lastShot)view.lastShot=filterShot(state.lastShot,{source:state.lastShotVisibility??[false,false],target:state.lastShotTargetVisibility??[false,false],interceptor:state.lastShotInterceptorVisibility??[false,false]});
 view.shots=state.shotEvents.map(e=>filterShot(e.shot,e));
 view.combatPhase=state.combatPhase;view.queuedAttacks=structuredClone(state.queuedAttacks[you]);view.attackProgress={...state.attackProgress};
 if(state.combatPhase==='attack'&&state.resolutionStep!==undefined)view.resolutionStep=state.resolutionStep;
 return view;
}
function paths(origin:Cell,budget:number,islands:Cell[],ships:ShipView[],ignoredId:string):Map<string,{cell:Cell;distance:number;route:Cell[]}> {
 const blocked=new Set([...islands.map(cellKey),...ships.filter(s=>!s.sunk&&s.id!==ignoredId).map(cellKey)]);
 const seen=new Map<string,{cell:Cell;distance:number;route:Cell[]}>([[cellKey(origin),{cell:cloneCell(origin),distance:0,route:[]}]]);
 const queue=[{cell:cloneCell(origin),distance:0,route:[] as Cell[]}];
 for(let i=0;i<queue.length;i++){
  const current=queue[i]!;if(current.distance>=budget)continue;
  for(const [dx,dz] of DIRECTIONS){
   const c={x:current.cell.x+dx,z:current.cell.z+dz},key=cellKey(c);
   if(!inBounds(c)||seen.has(key)||blocked.has(key))continue;
   if(dx&&dz&&(blocked.has(cellKey({x:current.cell.x+dx,z:current.cell.z}))||blocked.has(cellKey({x:current.cell.x,z:current.cell.z+dz}))))continue;
   const item={cell:c,distance:current.distance+1,route:[...current.route,c]};seen.set(key,item);queue.push(item);
  }
 }
 seen.delete(cellKey(origin));return seen;
}
export function reachableCells(view:ViewState,shipId:string):Cell[] {
 const ship=view.own.find(s=>s.id===shipId);
 if(!ship||!canMoveShip(ship)||view.phase!=='battle'||view.combatPhase==='attack'||view.turn!==view.you)return [];
 return [...paths(ship,ship.ap,view.islands,[...view.own,...view.revealed],ship.id).values()].map(p=>cloneCell(p.cell));
}
function exhaustInactionable(state:BattleState,team:number):void {
 for(const s of state.ships.filter(s=>s.team===team&&!s.sunk)){
  const move=canMoveShip(s)&&paths(s,s.ap,state.islands,state.ships,s.id).size>0;
  const fire=s.kind!=='carrier'&&!isOpeningTurn(state)&&canFireShip(s);
  const torpedo=!isOpeningTurn(state)&&canTorpedoShip(s);
  if(!move&&!fire&&!canReconShip(s)&&!canSonarShip(s)&&!torpedo){if(repairEligible(s))s.ap=Math.min(s.ap,1);else s.ap=0;}
 }
}
function finishMissionDeadlock(state:BattleState):void {
 if(state.phase!=='battle'||state.combatPhase==='attack'||state.queuedAttacks.some(q=>q.length>0)||state.torpedoes.length>0)return;
 const capable=state.ships.filter(s=>!s.sunk).some(s=>{
  const refreshed={...s,ap:s.maxAp,attacked:false,moved:false,scouted:false,repaired:false,sonared:false,torpedoed:false};
  return canMoveShip(refreshed)&&paths(s,s.maxAp,state.islands,state.ships,s.id).size>0||canFireShip(refreshed)||canReconShip(refreshed)||canRepairShip(refreshed)||canSonarShip(refreshed)||canTorpedoShip(refreshed);
 });
 if(!capable){state.phase='finished';state.winner=null;}
}
function beginOwnTurn(state:BattleState):void {
 const incoming=state.ships.filter(s=>s.team===state.turn);
 for(const ship of incoming){
  ship.lastTurnDamage=0;
  if(ship.sunk||ship.damageControl||ship.hp>=ship.maxHp)continue;
  const damage=Math.min(ship.hp,50,Math.max(5,Math.ceil((ship.maxHp-ship.hp)*.05)));
  ship.hp-=damage;ship.lastTurnDamage=damage;
  if(ship.hp===0){ship.sunk=true;ship.ap=0;state.recon=state.recon.filter(r=>r.carrierId!==ship.id);}
 }
 const alive=[0,1].map(team=>state.ships.some(s=>s.team===team&&!s.sunk));
 if(!alive[0]||!alive[1]){state.phase='finished';state.winner=alive[0]?0:alive[1]?1:null;state.torpedoes=[];return;}
 for(const ship of incoming.filter(s=>!s.sunk)){ship.ap=ship.maxAp;ship.attacked=false;ship.moved=false;ship.scouted=false;ship.repaired=false;ship.sonared=false;ship.torpedoed=false;}
 exhaustInactionable(state,state.turn);
}
function advanceTurn(state:BattleState):void {
 const advance=()=>{
  state.recon=state.recon.filter(r=>r.expiresAt>state.turnNumber);state.sonar=state.sonar.filter(r=>r.expiresAt>state.turnNumber);
  state.turn=1-state.turn;state.turnNumber++;state.round=Math.floor((state.turnNumber-1)/2)+1;state.ownTurns[state.turn]++;
  beginOwnTurn(state);
 };
 advance();
 if(state.phase!=='battle')return;
 finishMissionDeadlock(state);
}
function mix32(value:number):number {value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return (value^(value>>>16))>>>0;}
/** Two decorrelated deterministic axes; impact placement never consumes defense RNG. */
export function fallbackHit(seed:number):Cell {return {x:mix32(seed^0x9e3779b9)/4294967296*1.6-.8,z:mix32(seed^0x85ebca6b)/4294967296*1.6-.8};}
/** Incoming sector in the model frame (model bow -Z), never a random deck mark.
 * Width/length ratios are from the uniformly fitted source hull bounds. */
export function torpedoImpactMark(victim:Pick<ShipView,'kind'|'heading'|'x'|'z'>,approach:Cell):Cell{
 const yaw=victim.heading+Math.PI,c=Math.cos(yaw),s=Math.sin(yaw),dx=approach.x-victim.x,dz=approach.z-victim.z;
 const ratio={carrier:.252827,destroyer:.16085,battleship:.121946}[victim.kind],x=(c*dx-s*dz)/ratio,z=s*dx+c*dz;
 const extent=Math.max(Math.abs(x),Math.abs(z));return extent<1e-9?{x:.88,z:0}:{x:x*.88/extent,z:z*.88/extent};
}
function resolveShot(state:BattleState,player:number,ship:ShipView,target:Cell,victim:ShipView|undefined,rng:()=>number,aim?:Cell,kind?:'airstrike'|'missile'|'shell'|'torpedo',options:{damage?:number;bypassDefense?:boolean;projectileId?:string;sourceVisibility?:[boolean,boolean];approachFrom?:Cell}={}):void {
 const targetBefore=victim?structuredClone(victim):undefined;
 const targetVisibility=[0,1].map(you=>!!victim&&visibleCells(state,you).has(cellKey(victim))) as [boolean,boolean];
 const sourceVisibility=options.sourceVisibility??[0,1].map(you=>you===player||visibleCells(state,you).has(cellKey(ship))) as [boolean,boolean];
 let blocked=false,halved=false,damage=victim?(options.damage??200):0,interceptor:ShipView|undefined;
 if(!options.bypassDefense&&victim&&(ship.kind==='destroyer'||kind==='airstrike')){
  const guards=state.ships.filter(s=>s.team===victim.team&&!s.sunk&&s.kind==='destroyer'&&!partDisabled(s,'radar')&&!partDisabled(s,'airDefense')&&reconCells(s).some(c=>cellKey(c)===cellKey(target))).sort((a,b)=>a.id.localeCompare(b.id));
  if(guards.length&&rng()<.5){blocked=true;damage=0;interceptor=guards[0];}
 }
 const interceptorVisibility=[0,1].map(you=>!!interceptor&&(interceptor.team===you||visibleCells(state,you).has(cellKey(interceptor)))) as [boolean,boolean];
 if(!options.bypassDefense&&!blocked&&victim?.kind==='carrier'&&!partDisabled(victim,'airDefense')){blocked=rng()<.33;if(blocked)damage=0;else if(rng()<.33){halved=true;damage=100;}}
 const sequence=state.sequence+1,seed=(Math.imul(sequence,1664525)+1013904223)>>>0;
 const localHit=victim&&damage>0?aim?cloneCell(aim):kind==='torpedo'?torpedoImpactMark(victim,options.approachFrom??ship):fallbackHit(seed):undefined;
 if(victim){victim.hp=Math.max(0,victim.hp-damage);victim.sunk=victim.hp===0;
  if(localHit){victim.damageControl=false;(victim.damageMarks??=[]).push({...localHit,seed});const id=partAt(victim.kind,localHit);victim.parts??=createParts(victim.kind);const part=id?victim.parts[id]:undefined;if(part){part.hp=Math.max(0,part.hp-damage);part.disabled=part.hp===0;}}
  if(victim.sunk){victim.ap=0;state.recon=state.recon.filter(r=>r.carrierId!==victim.id);}else{
   if(partDisabled(victim,'bridge'))state.sonar=state.sonar.filter(r=>r.shipId!==victim.id);
   if(partDisabled(victim,'flightDeck'))state.recon=state.recon.filter(r=>r.carrierId!==victim.id);
   if(partDisabled(victim,'engine')&&partDisabled(victim,victim.kind==='carrier'?'flightDeck':'weapon')&&!canSonarShip(victim))victim.ap=repairEligible(victim)?1:0;
  }
 }
 state.lastShot={x:target.x,z:target.z,by:player,sequence:++state.sequence,hit:!!victim,damage,blocked,halved,source:cloneCell(ship),sourceShip:structuredClone(ship),...(kind?{kind}:{}),...(options.projectileId?{projectileId:options.projectileId}:{}),...(options.approachFrom?{approachFrom:cloneCell(options.approachFrom)}:{}),...(targetBefore?{targetBefore,targetAfter:structuredClone(victim)}:{}),...(interceptor?{interceptedBy:cloneCell(interceptor)}:{}),...(localHit?{localHit}:{}),...(victim?{shipId:victim.id,sunk:victim.sunk}:{})};
 state.lastShotVisibility=sourceVisibility;state.lastShotInterceptorVisibility=interceptorVisibility;state.lastShotTargetVisibility=targetVisibility;state.shotEvents.push({shot:structuredClone(state.lastShot),source:sourceVisibility,target:targetVisibility,interceptor:interceptorVisibility});
 state.history.push({...state.lastShot,source:cloneCell(ship)});if(state.history.length>256)state.history.shift();
 if(state.combatPhase!=='attack'&&state.ships.filter(s=>s.team!==player).every(s=>s.sunk)){state.phase='finished';state.winner=state.ships.some(s=>s.team===player&&!s.sunk)?player:null;}
}
function advanceTorpedoes(state:BattleState,onlyId:string):void {
 const remaining:TorpedoState[]=[];
 for(const torpedo of state.torpedoes){
  if(torpedo.id!==onlyId){remaining.push(torpedo);continue;}
  let active=true;
  for(let n=0;n<5&&torpedo.index<torpedo.route.length;n++){
   const approachFrom=cloneCell(torpedo),step=torpedo.route[torpedo.index++]!;torpedo.heading=Math.atan2(step.x-torpedo.x,step.z-torpedo.z);const diagonal=step.x!==torpedo.x&&step.z!==torpedo.z;
   const swept=diagonal?[{x:step.x,z:torpedo.z},{x:torpedo.x,z:step.z},step]:[step];
   if(swept.some(c=>state.islands.some(land=>cellKey(land)===cellKey(c)))){active=false;break;}
   const victim=state.ships.find(s=>s.team!==torpedo.team&&!s.sunk&&cellKey(s)===cellKey(step));
   torpedo.x=step.x;torpedo.z=step.z;
   if(victim){const launcher=state.ships.find(s=>s.id===torpedo.shipId)!;resolveShot(state,torpedo.team,{...launcher,...torpedo.source},victim,victim,()=>1,undefined,'torpedo',{damage:300,bypassDefense:true,projectileId:torpedo.id,sourceVisibility:torpedo.sourceVisibility,approachFrom});active=false;break;}
  }
  if(active&&torpedo.index<torpedo.route.length){torpedo.nextAdvanceAt=state.turnNumber+1;remaining.push(torpedo);}
 }
 state.torpedoes=remaining;
}
function reserveAttack(state:BattleState,ship:ShipView,kind:QueuedAttack['kind'],target:Cell,localHit?:Cell):void {
 state.queuedAttacks[ship.team].push({id:'attack-'+(++state.reservationSequence),shipId:ship.id,kind,target:cloneCell(target),...(localHit?{localHit:cloneCell(localHit)}:{})});
}
function launchTorpedo(state:BattleState,ship:ShipView,target:Cell,route:Cell[]):string {
 const id='torpedo-'+((Math.imul(++state.torpedoSequence,2246822519)^3266489917)>>>0).toString(16);
 state.torpedoes.push({id,team:ship.team,...cloneCell(ship),heading:Math.atan2(route[0]!.x-ship.x,route[0]!.z-ship.z),target:cloneCell(target),source:cloneCell(ship),shipId:ship.id,route,index:0,nextAdvanceAt:state.turnNumber,sourceVisibility:[0,1].map(you=>you===ship.team||visibleCells(state,you).has(cellKey(ship))) as [boolean,boolean]});
 return id;
}
const ATTACK_FLEET_ORDER=['carrier','destroyer-1','destroyer-2','destroyer-3','battleship-1','battleship-2','battleship-3'];
function attackRank(shipId:string):number {const rank=ATTACK_FLEET_ORDER.indexOf(shipId.slice(2));return rank<0?99:rank;}
function beginAttackPhase(state:BattleState):void {
 state.combatPhase='attack';delete state.resolutionStep;state.shotEvents=[];
 state.queuedAttacks[state.turn].sort((a,b)=>attackRank(a.shipId)-attackRank(b.shipId));
 state.pendingTorpedoes=state.torpedoes.filter(t=>t.nextAdvanceAt<=state.turnNumber).sort((a,b)=>attackRank(a.shipId)-attackRank(b.shipId)).map(t=>t.id);
 state.attackProgress={completed:0,total:state.pendingTorpedoes.length+state.queuedAttacks[state.turn].length};
}
/** Called only after the previous presentation finishes. One authoritative step per call. */
export function resolveAttackStep(state:BattleState,rng:()=>number=Math.random):{ok:boolean;error?:string;shot?:Shot;complete?:boolean} {
 if(state.phase!=='battle'||state.combatPhase!=='attack')return {ok:false,error:'공격 처리 차례가 아닙니다'};
 if(!state.connected.every(Boolean))return {ok:false,error:'상대의 재접속을 기다리는 중입니다'};
 state.shotEvents=[];
 const queue=state.queuedAttacks[state.turn],nextTorpedo=state.torpedoes.find(t=>t.id===state.pendingTorpedoes[0]);
 const torpedoId=nextTorpedo&&(!queue[0]||attackRank(nextTorpedo.shipId)<=attackRank(queue[0].shipId))?state.pendingTorpedoes.shift():undefined;
 const queued=torpedoId?undefined:queue.shift();
 if(!torpedoId&&!queued){
  state.combatPhase='action';delete state.resolutionStep;
  const alive=[0,1].map(team=>state.ships.some(s=>s.team===team&&!s.sunk));
  if(!alive[0]||!alive[1]){state.phase='finished';state.winner=alive[0]?0:alive[1]?1:null;state.torpedoes=[];}else advanceTurn(state);
  state.revision++;return {ok:true,complete:true};
 }
 if(torpedoId)advanceTorpedoes(state,torpedoId);
 else if(queued){
  const ship=state.ships.find(s=>s.id===queued.shipId)!;
  if(queued.kind==='torpedo'){
   const route=torpedoRoute(ship,queued.target,state.islands);
   if(route.length){
    const id=launchTorpedo(state,ship,queued.target,route);
    advanceTorpedoes(state,id);
   }
  }else{
   const mask=queued.kind==='airstrike'?new Set(reconCells(queued.target).map(cellKey)):undefined;
   const victim=state.ships.filter(s=>s.team!==state.turn&&!s.sunk&&(mask?mask.has(cellKey(s)):cellKey(s)===cellKey(queued.target))).sort((a,b)=>Math.hypot(a.x-queued.target.x,a.z-queued.target.z)-Math.hypot(b.x-queued.target.x,b.z-queued.target.z)||a.id.localeCompare(b.id))[0];
   resolveShot(state,state.turn,ship,victim&&mask?victim:queued.target,victim,rng,queued.localHit,queued.kind);
  }
 }
 state.attackProgress.completed++;state.resolutionStep=state.resolutionCounter=(state.resolutionCounter??0)+1;state.revision++;
 // Keep this last hit in presentation, then finish on its acknowledgement. There
 // is no reason to fire the surviving reservations at an already defeated fleet.
 if([0,1].some(team=>!state.ships.some(s=>s.team===team&&!s.sunk))){state.queuedAttacks=[[],[]];state.pendingTorpedoes=[];state.torpedoes=[];state.attackProgress.total=state.attackProgress.completed;}

 return {ok:true,...(state.shotEvents[0]?{shot:structuredClone(state.shotEvents[0].shot)}:{}),complete:false};
}
export function applyAction(state:BattleState,player:number,command:BattleCommand,_rng:()=>number=Math.random):{ok:boolean;error?:string}{
 const fail=(error:string)=>({ok:false,error});
 if(!Number.isInteger(player)||player<0||player>1||!command||typeof command!=='object')return fail('잘못된 요청입니다');
 if(state.phase!=='battle'||state.combatPhase==='attack'||state.turn!==player)return fail('행동 차례가 아닙니다');
 if(!state.connected.every(Boolean))return fail('상대의 재접속을 기다리는 중입니다');
 if((command.type==='attack'||command.type==='torpedo')&&isOpeningTurn(state))return fail('첫 턴에는 공격할 수 없습니다');
 const previousSequence=state.sequence;
 if(command.type==='end'){beginAttackPhase(state);state.revision++;return {ok:true};}
 if(!['move','attack','recon','repair','sonar','torpedo'].includes(command.type))return fail('알 수 없는 행동입니다');
 const ship=state.ships.find(s=>s.id===command.shipId&&s.team===player&&!s.sunk);
 if(!ship)return fail('함선을 확인하세요');
 if(command.type==='sonar'){
  if(!canSonarShip(ship))return fail('함교가 정상이고 행동력 2가 필요합니다');
  ship.ap-=2;ship.sonared=true;state.sonar=state.sonar.filter(r=>r.shipId!==ship.id);state.sonar.push({shipId:ship.id,team:player,center:cloneCell(ship),expiresAt:state.turnNumber+2});
 }else if(command.type==='repair'){
  if(!canRepairShip(ship))return fail('대미지 컨트롤를 사용할 수 없습니다');
  ship.ap--;ship.repaired=true;ship.repairCharges=(ship.repairCharges??2)-1;ship.damageControl=true;ship.extinguishedMarkCount=ship.damageMarks?.length??0;ship.hp=Math.min(ship.maxHp,ship.hp+50);
  for(const part of Object.values(ship.parts??{}))if(!part.disabled&&part.hp>0&&part.hp<part.maxHp)part.hp=Math.min(part.maxHp,part.hp+50);
 }else{
  if(!command.target||!inBounds(command.target))return fail('좌표를 확인하세요');
  const target=command.target;
  if(command.type==='torpedo'){
   if(!canTorpedoShip(ship))return fail('구축함의 주무장과 행동력 1이 필요합니다');
   if(Math.hypot(target.x-ship.x,target.z-ship.z)>15||cellKey(target)===cellKey(ship))return fail('어뢰 사거리 밖입니다');
   const route=torpedoRoute(ship,target,state.islands);if(!route.length)return fail('어뢰가 도달할 수 없는 좌표입니다');ship.ap--;ship.torpedoed=true;
   launchTorpedo(state,ship,target,route);
  }else if(command.type==='move'){
   if(partDisabled(ship,'engine'))return fail('추진 계통이 파괴되었습니다');
   if(ship.ap<1)return fail('행동력이 부족합니다');
   const before=snapshot(state,player),known=[...before.own,...before.revealed];
   const route=paths(ship,ship.ap,state.islands,known,ship.id).get(cellKey(target));
   if(!route)return fail('이동할 수 없는 좌표입니다');
   const original=cloneCell(ship),seen=new Set(before.revealed.map(s=>s.id));
   for(const step of route.route){
    if(state.ships.some(s=>!s.sunk&&s.id!==ship.id&&cellKey(s)===cellKey(step)))break;
    ship.x=step.x;ship.z=step.z;
    if(snapshot(state,player).revealed.some(s=>!seen.has(s.id)&&!s.sunk))break;
   }
   if(cellKey(ship)!==cellKey(original))ship.heading=Math.atan2(ship.x-original.x,ship.z-original.z);
   ship.ap-=route.distance;ship.moved=true;
  }else if(command.type==='recon'){
   if(!canReconShip(ship))return fail('이동 전 턴당 한 번 출격할 수 있습니다');
   ship.ap--;ship.scouted=true;state.recon=state.recon.filter(r=>r.carrierId!==ship.id);
   state.recon.push({center:cloneCell(target),team:player,carrierId:ship.id,expiresAt:state.turnNumber+2});
   if(!isOpeningTurn(state))reserveAttack(state,ship,'airstrike',target);
  }else{
   if(partDisabled(ship,'weapon'))return fail('주무장이 파괴되었습니다');
   if(command.localHit!==undefined&&(!command.localHit||typeof command.localHit.x!=='number'||typeof command.localHit.z!=='number'||!Number.isFinite(command.localHit.x)||!Number.isFinite(command.localHit.z)||Math.abs(command.localHit.x)>1||Math.abs(command.localHit.z)>1))return fail('피격 위치를 확인하세요');
   if(!canFireShip(ship))return fail('이번 턴에는 공격할 수 없습니다');
   if(state.islands.some(c=>cellKey(c)===cellKey(target)))return fail('섬에는 공격할 수 없습니다');
   if(Math.hypot(target.x-ship.x,target.z-ship.z)>SHIPS[ship.kind].range)return fail('사거리 밖입니다');
   if(state.ships.some(s=>s.team===player&&!s.sunk&&cellKey(s)===cellKey(target)))return fail('아군에게 공격할 수 없습니다');
   ship.ap--;ship.attacked=true;reserveAttack(state,ship,ship.kind==='destroyer'?'missile':'shell',target,command.localHit);
  }
 }
 if(state.phase==='battle'){exhaustInactionable(state,player);finishMissionDeadlock(state);}
 state.shotEvents=state.shotEvents.filter(e=>e.shot.sequence>previousSequence);state.revision++;return {ok:true};
}
export interface AIMemory { contacts?: { id:string; x:number; z:number; hp:number; seen:number }[]; searched?: string[]; searchTurns?:Record<string,number>; lastSequence?:number; blocked?:{x:number;z:number;until:number}[]; pendingMove?:{shipId:string;from:string;x:number;z:number;turn:number}; flanks?:string[]; patrol?:Record<string,number>; }
export function chooseAIAction(view:ViewState,difficulty:'easy'|'normal'|'hard'='normal',rng:()=>number=Math.random,memory:AIMemory={}):BattleCommand|null{
 if(view.phase!=='battle'||view.combatPhase==='attack'||view.turn!==view.you||!view.connected.every(Boolean))return null;
 const pick=<T>(items:T[]):T|undefined=>items[Math.min(items.length-1,Math.max(0,Math.floor(rng()*items.length)))];
 const own=view.own.filter(s=>!s.sunk),enemies=view.revealed.filter(s=>!s.sunk);
 const visible=new Set(view.visibleCells.map(cellKey));
 memory.blocked=(memory.blocked??[]).filter(c=>c.until>view.turnNumber&&!own.some(s=>cellKey(s)===cellKey(c))&&(!visible.has(cellKey(c))||enemies.some(s=>cellKey(s)===cellKey(c))));
 if(memory.pendingMove){const previous=memory.pendingMove,current=own.find(s=>s.id===previous.shipId);if(current&&cellKey(current)===previous.from)memory.blocked.push({x:previous.x,z:previous.z,until:view.turnNumber+6});delete memory.pendingMove;}
 const remember=(command:BattleCommand):BattleCommand=>{if(command.type==='move'){const ship=own.find(s=>s.id===command.shipId)!;memory.pendingMove={shipId:ship.id,from:cellKey(ship),...command.target!,turn:view.turnNumber};}return command;};
 memory.contacts=(memory.contacts??[]).filter(c=>!own.some(s=>cellKey(s)===cellKey(c))&&(!visible.has(cellKey(c))||enemies.some(e=>cellKey(e)===cellKey(c))));
 for(const enemy of enemies){const contact={id:enemy.id,x:enemy.x,z:enemy.z,hp:enemy.hp,seen:view.turnNumber};memory.contacts=memory.contacts.filter(c=>c.id!==enemy.id&&cellKey(c)!==cellKey(enemy));memory.contacts.push(contact);}
 memory.searchTurns??={};memory.searched=(memory.searched??[]).filter(key=>view.turnNumber-(memory.searchTurns![key]??view.turnNumber)<24);
 const shot=view.lastShot;
 if(shot&&shot.sequence!==(memory.lastSequence??0)){
  memory.lastSequence=shot.sequence;
  if(shot.by===view.you){
   memory.contacts=memory.contacts.filter(c=>cellKey(c)!==cellKey(shot));
   if(shot.hit&&!shot.sunk){const observed=enemies.find(s=>cellKey(s)===cellKey(shot));memory.contacts.push({id:observed?.id??shot.shipId??'contact-'+cellKey(shot),x:shot.x,z:shot.z,hp:observed?.hp??1000,seen:view.turnNumber});}
   if(!shot.hit){if(!memory.searched.includes(cellKey(shot)))memory.searched.push(cellKey(shot));memory.searchTurns![cellKey(shot)]=view.turnNumber;memory.blocked=memory.blocked.filter(c=>cellKey(c)!==cellKey(shot));}
  }
 }
 const contacts=[...enemies,...memory.contacts.filter(c=>!enemies.some(e=>cellKey(e)===cellKey(c)))];
 const damaged=own.filter(canRepairShip).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
 if(damaged[0])return {type:'repair',shipId:damaged[0].id};
 const carrier=own.find(s=>s.kind==='carrier'&&s.ap>0);
 const home=view.you===0?26:3,ownHome=29-home,teamTurn=Math.floor((view.turnNumber-1)/2);
 if(carrier){
  const hint=contacts[0]??memory.blocked[0];
  const fleet=own.filter(s=>s.kind!=='carrier');
  const front={x:Math.round(fleet.reduce((sum,s)=>sum+s.x,0)/Math.max(1,fleet.length)),z:Math.round(fleet.reduce((sum,s)=>sum+s.z,0)/Math.max(1,fleet.length))};
  const threats=enemies.filter(s=>s.kind!=='carrier'&&!partDisabled(s,'weapon')&&Math.hypot(s.x-carrier.x,s.z-carrier.z)<=(s.kind==='battleship'?SHIPS.battleship.range:8));
  if(canMoveShip(carrier)&&(threats.length||carrier.scouted||partDisabled(carrier,'flightDeck'))){
   const moves=[...paths(carrier,carrier.ap,[...view.islands,...memory.blocked!],[...view.own,...view.revealed],carrier.id).values()].map(p=>p.cell);
   const vx=front.x-ownHome,vz=front.z-ownHome,len=Math.hypot(vx,vz)||1;
   const behind=fleet.length?{x:Math.max(0,Math.min(29,Math.round(front.x-vx/len*3))),z:Math.max(0,Math.min(29,Math.round(front.z-vz/len*3)))}:{x:home,z:home};
   const distance=(c:Cell)=>threats.length?Math.min(...threats.map(s=>Math.hypot(s.x-c.x,s.z-c.z))):-Math.hypot(c.x-behind.x,c.z-behind.z);
   moves.sort((a,b)=>distance(b)-distance(a)||Math.hypot(a.x-front.x,a.z-front.z)-Math.hypot(b.x-front.x,b.z-front.z));
   if(moves[0]&&distance(moves[0])>distance(carrier)+.01)return remember({type:'move',shipId:carrier.id,target:cloneCell(moves[0])});
  }
  const sector=teamTurn%6;
  const scan=teamTurn<4?{x:home+[-2,0,2][(teamTurn+Math.floor(rng()*3))%3]!,z:home+(teamTurn%2?1:-1)}:sector<2?{x:home,z:home}:sector===2?{x:ownHome,z:ownHome}:sector===3?front:{x:[3,8,14,20,26][Math.floor(teamTurn/6)%5]!,z:sector===4?home:15};
  const center=hint?cloneCell(hint):scan;
  if(canReconShip(carrier))return {type:'recon',shipId:carrier.id,target:center};
 }
 const sonarUser=own.filter(canSonarShip).find(s=>sonarCells(s,view.islands).filter(c=>!visible.has(cellKey(c))).length>=40&&!view.sonar?.some(r=>r.shipId===s.id));
 if(sonarUser&&(contacts.length||Math.floor((view.turnNumber-1)/2)%2===1))return {type:'sonar',shipId:sonarUser.id};
 if(canAttack(view))for(const dd of own.filter(canTorpedoShip)){
  const target=contacts.filter(c=>Math.hypot(c.x-dd.x,c.z-dd.z)<=15&&cellKey(c)!==cellKey(dd)&&!view.torpedoes?.some(t=>t.team===view.you&&t.target&&cellKey(t.target)===cellKey(c))).sort((a,b)=>a.hp-b.hp)[0];
  if(target){const route=torpedoRoute(dd,target,view.islands);if(route.length)return {type:'torpedo',shipId:dd.id,target:cloneCell(target)};}
 }
 const navigationIslands=[...view.islands,...memory.blocked!,...contacts];
 const nearest=(ship:ShipView)=>[...contacts,...memory.blocked!.map(c=>({...c,hp:1000}))].sort((a,b)=>Math.hypot(a.x-ship.x,a.z-ship.z)-Math.hypot(b.x-ship.x,b.z-ship.z))[0];
 const approach=(ship:ShipView,contact=nearest(ship)):Cell|undefined=>{
  const sector=Math.floor(teamTurn/10)%4;
  const noScout=!own.some(s=>s.kind==='carrier'&&!partDisabled(s,'flightDeck'));
  memory.patrol??={};const patrol=[{x:home,z:home},{x:ownHome,z:ownHome},{x:15,z:15},{x:home,z:ownHome},{x:ownHome,z:home}];
  let patrolIndex=memory.patrol[ship.id]??0;
  if(noScout&&!contact&&Math.hypot(ship.x-patrol[patrolIndex%patrol.length]!.x,ship.z-patrol[patrolIndex%patrol.length]!.z)<=1){patrolIndex++;memory.patrol[ship.id]=patrolIndex;}
  let objective:Cell=contact??(noScout?patrol[patrolIndex%patrol.length]!:sector===0?{x:home,z:home}:sector===1?{x:15,z:15}:sector===2?{x:ownHome,z:ownHome}:{x:home,z:ownHome});
  let desired=contact?(ship.kind==='battleship'?SHIPS.battleship.range-2:5):0;
  memory.flanks??=[];
  if(ship.kind==='battleship'&&!memory.flanks.includes(ship.id)&&(!contact||Math.hypot(ship.x-contact.x,ship.z-contact.z)>14)){
   const left=ship.id.endsWith('-1'),waypoint=view.you===0?(left?{x:10,z:16}:{x:22,z:8}):(left?{x:19,z:8}:{x:7,z:21});
   if(Math.hypot(ship.x-waypoint.x,ship.z-waypoint.z)<=2)memory.flanks.push(ship.id);
   else{objective=waypoint;desired=1;}
  }
  if(Math.hypot(ship.x-objective.x,ship.z-objective.z)<=desired)return undefined;
  const distances=paths(objective,900,navigationIslands,[...view.own,...view.revealed],ship.id);
  const score=(c:Cell)=>distances.get(cellKey(c))?.distance??(cellKey(c)===cellKey(objective)?0:10000);
  const budget=Math.max(1,ship.ap-(canAttack(view)&&canFireShip(ship)?1:0));
  const moves=[...paths(ship,budget,navigationIslands,[...view.own,...view.revealed],ship.id).values()].map(p=>p.cell).filter(c=>!contact||Math.hypot(c.x-contact.x,c.z-contact.z)>=3);
  moves.sort((a,b)=>score(a)-score(b)||Math.hypot(a.x-objective.x,a.z-objective.z)-Math.hypot(b.x-objective.x,b.z-objective.z));
  return moves[0]&&score(moves[0])<score(ship)?moves[0]:undefined;
 };
 // Reposition both weapon classes before firing, retaining one AP for the shot.
 for(const ship of own.filter(s=>s.kind!=='carrier'&&canMoveShip(s)&&s.ap>1&&!s.attacked)){
  const contact=nearest(ship);
  const distance=contact?Math.hypot(contact.x-ship.x,contact.z-ship.z):Infinity;
  if(!contact||distance>(ship.kind==='battleship'?SHIPS.battleship.range:difficulty==='easy'?12:7)){
   const target=approach(ship,contact);if(target)return remember({type:'move',shipId:ship.id,target:cloneCell(target)});
  }
 }
 for(const ship of own.filter(s=>canAttack(view)&&canFireShip(s))){
  const targets=[...contacts,...memory.blocked!.map(c=>({...c,hp:1000}))].filter(e=>Math.hypot(e.x-ship.x,e.z-ship.z)<=SHIPS[ship.kind].range&&!view.islands.some(c=>cellKey(c)===cellKey(e))&&!own.some(c=>cellKey(c)===cellKey(e)));
  if(targets.length){
   targets.sort((a,b)=>difficulty==='hard'?a.hp-b.hp:Math.hypot(a.x-ship.x,a.z-ship.z)-Math.hypot(b.x-ship.x,b.z-ship.z));
   const target=difficulty==='easy'?pick(targets)!:targets[0]!;
   return {type:'attack',shipId:ship.id,target:cloneCell(target)};
  }
 }
 for(const ship of own.filter(s=>s.kind!=='carrier'&&s.ap>0)){
  const target=canMoveShip(ship)?approach(ship):undefined;if(target&&(ship.ap>1||!canFireShip(ship)))return remember({type:'move',shipId:ship.id,target:cloneCell(target)});
  // After losing the scout, systematically search unseen water instead of stalling.
  if(canAttack(view)&&!own.some(s=>s.kind==='carrier'&&!partDisabled(s,'flightDeck'))&&canFireShip(ship)){
   const blocked=new Set([...view.islands,...own].map(cellKey)),water:Cell[]=[];
   for(let z=0;z<30;z++)for(let x=0;x<30;x++){const c={x,z};if(!blocked.has(cellKey(c))&&!memory.searched!.includes(cellKey(c))&&!visible.has(cellKey(c))&&Math.hypot(x-ship.x,z-ship.z)<=SHIPS[ship.kind].range)water.push(c);}
   const search=teamTurn%4===0?{x:home,z:home}:teamTurn%4===1?{x:ownHome,z:ownHome}:{x:15,z:15};
   water.sort((a,b)=>Math.hypot(a.x-search.x,a.z-search.z)-Math.hypot(b.x-search.x,b.z-search.z)||a.z-b.z||a.x-b.x);
   if(water[0])return {type:'attack',shipId:ship.id,target:cloneCell(water[0])};
  }
 }
 return {type:'end'};
}
