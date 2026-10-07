import './style.css';
import type {ActionMode,BattleCommand,Cell,ViewState} from './contract';
import {BOARD_SIZE,SHIPS,createBattle,snapshot,applyAction,resolveAttackStep,reachableCells,chooseAIAction,cellKey,deploymentCells,applyPlacement,startBattle,placementValid,canAttack,isOpeningTurn,torpedoRoute} from './rules';
import type {AIMemory} from './rules';
import {renderShipParts,blockedActionReason,renderRepairStatus,repairActionReason} from './hud';
import {canMoveShip,canFireShip,canReconShip,canRepairShip,canSonarShip,canTorpedoShip,createParts} from './parts';
import {createNavalScene} from './scene';
import {createEnemyPreview} from './enemy-preview';
import {BattleAudio} from './audio';
import {BattleConnection} from './network';
import {createSeededRandom} from './utils/random';
import {fleetShipAtDigit,orderFleetForControls} from './naval/navigation';
import {createResultGate} from './result-gate';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const audio=new BattleAudio();
const volumeStorageKey='battleship.master-volume';
try{const stored=localStorage.getItem(volumeStorageKey),saved=stored===null?NaN:Number(stored);if(Number.isFinite(saved)&&saved>=0&&saved<=100)audio.setVolume(saved/100);}catch{}
const resultGate=createResultGate();
let rng=createSeededRandom(crypto.getRandomValues(new Uint32Array(1))[0]);
let local=createBattle(false),view=snapshot(local,0);
let roomEntryGeneration=0,roomEntering=false,roomSnapshot=false;
let mode:'pve'|'online'='pve',selectedId:string|undefined=view.own[0]?.id,action:ActionMode='move',target:Cell|undefined;
let aiMemory:AIMemory={};
let enemyId:string|undefined,enemyPreview:ReturnType<typeof createEnemyPreview>|undefined;
let localHit:{x:number;z:number}|undefined;
let timer:ReturnType<typeof setTimeout>|undefined,aiGeneration=0,aiSteps=0,lastSequence=-1,resultPlayed=false;
let statusMessage='',paused=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,previous=performance.now(),raf=0,frames=0;
let resolutionIdleFrames=0,resolutionReceivedAt=0,acknowledgedStep:number|undefined;
let lastPresentationBusy=false,lastActionAvailability='';let mapPhase='';const lastKnown=new Map<string,Cell>();
const scene=createNavalScene(el<HTMLCanvasElement>('game-canvas'),selectCell,undefined,(phase,shot,kind)=>{
 if(phase==='launch'){resultGate.launch(shot);audio.startShot(shot,kind);}
 else{resultGate.impact(shot);audio.finishShot(shot,kind);renderEnemy();}
},moveToCell,ship=>audio.sink(ship),event=>{const cell={x:(event.position.x+60)/4-.5,z:(event.position.z+60)/4-.5};if(event.phase==='ciws-start')audio.ciwsBurst(event.shot,cell,event.duration);else audio.intercept(event.shot,cell);});
const connection=new BattleConnection(next=>{roomSnapshot=true;receive(next);},message=>{el('connection-label').textContent=message;if(message!=='연결됨'){roomSnapshot=false;acknowledgedStep=undefined;}renderUI();},announce);
const labels:Record<ActionMode,string>={move:'이동',attack:'공격',recon:'정찰',repair:'대미지 컨트롤',sonar:'소나',torpedo:'어뢰'};
const coord=(c:Cell)=>`${c.x+1} · ${c.z+1}`;
const orderedFleet=()=>orderFleetForControls(view.own);
const shipLabel=(ship:{id:string;kind:keyof typeof SHIPS})=>{const number=ship.id.match(/-(\d+)$/)?.[1];return `${SHIPS[ship.kind].label}${number?` ${number}`:''}`;};
const selected=()=>view.own.find(s=>s.id===selectedId&&!s.sunk);
const myTurn=()=>view.phase==='battle'&&view.combatPhase!=='attack'&&!scene.actionBusy()&&view.turn===view.you&&view.connected.every(Boolean);
const canControlShip=(id:string)=>myTurn()&&!scene.isShipMoving(id);
const land=()=>new Set(view.islands.map(cellKey));
const difficulty=()=>el<HTMLSelectElement>('difficulty').value as 'easy'|'normal'|'hard';

function announce(message:string){statusMessage=message;el('target-label').textContent=message;}
function log(message:string){
 const list=el('battle-log'),row=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');
 time.textContent=String(view.round).padStart(2,'0');text.textContent=message;row.append(time,text);list.prepend(row);
 while(list.children.length>5)list.lastElementChild?.remove();
}
function selectShip(id:string){
 const ship=view.own.find(s=>s.id===id&&!s.sunk);if(!ship)return;
 selectedId=id;enemyId=undefined;target=undefined;localHit=undefined;statusMessage='';
 action='move';
 audio.click();renderUI();
}
function selectCell(cell:Cell,hit?:{x:number;z:number}){
 if(view.phase==='setup'&&!view.ready[view.you]){
  const occupant=view.own.find(s=>s.x===cell.x&&s.z===cell.z);
  if(occupant){selectShip(occupant.id);return;}
  const ship=selected();if(!ship)return;
  const fleet=view.own.map(s=>({id:s.id,x:s.id===ship.id?cell.x:s.x,z:s.id===ship.id?cell.z:s.z,heading:s.heading}));
  if(mode==='online'){if(placementValid(fleet,view.you))connection.send({type:'placement',fleet});else announce('배치 구역 안에 놓으세요.');return;}
  const result=applyPlacement(local,view.you,fleet);if(!result.ok){announce(result.error||'배치할 수 없습니다.');return;}
  receive(snapshot(local,0));return;
 }
 if(view.phase!=='battle')return;
 const ship=view.own.find(s=>!s.sunk&&s.x===cell.x&&s.z===cell.z);
 if(ship){selectShip(ship.id);return;}
 const contact=view.revealed.find(s=>!s.sunk&&s.x===cell.x&&s.z===cell.z);
 enemyId=contact?.id;
 if(!contact&&action==='move'&&matchMedia('(pointer:coarse)').matches&&myTurn()){moveToCell(cell);return;}
 if(!myTurn()){renderUI();return;}
 target=cell;localHit=hit;statusMessage='';audio.click();renderUI();
}
function moveToCell(cell:Cell){
 if(view.phase==='setup'){selectCell(cell);return;}
 const ship=selected();if(!ship||!canControlShip(ship.id))return;
 action='move';enemyId=undefined;localHit=undefined;target=cell;statusMessage='';
 if(!legalTarget()){announce(blockedActionReason(ship,'move')||(!canMoveShip(ship)?'이동할 행동력이 없습니다.':'이동할 수 없는 위치입니다.'));renderUI();return;}
 dispatch({type:'move',shipId:ship.id,target:cell});
}
function legalTarget(){
 const ship=selected();if(!ship||!canControlShip(ship.id))return false;if(action==='repair')return canRepairShip(ship);if(action==='sonar')return canSonarShip(ship);if(!target)return false;
 if(action==='recon')return canReconShip(ship);
 if(land().has(cellKey(target)))return false;
 if(action==='torpedo')return canAttack(view)&&canTorpedoShip(ship)&&Math.hypot(ship.x-target.x,ship.z-target.z)<=15&&cellKey(ship)!==cellKey(target)&&torpedoRoute(ship,target,view.islands).length>0&&!view.own.some(s=>!s.sunk&&cellKey(s)===cellKey(target!));
 if(action==='move')return canMoveShip(ship)&&reachableCells(view,ship.id).some(c=>cellKey(c)===cellKey(target!));
 return canAttack(view)&&canFireShip(ship)&&
 !view.own.some(s=>!s.sunk&&cellKey(s)===cellKey(target!))&&
 (ship.kind==='destroyer'||Math.hypot(ship.x-target.x,ship.z-target.z)<=SHIPS.battleship.range);
}
function confirmAction(){
 if(legalTarget())dispatch({type:action,shipId:selectedId,...(action==='repair'||action==='sonar'?{}:{target}),...(action==='attack'&&localHit?{localHit}: {})});
}
function rotatePlacement(){
 const ship=selected();if(view.phase!=='setup'||view.ready[view.you]||!ship)return;
 const fleet=view.own.map(s=>({id:s.id,x:s.x,z:s.z,heading:s.heading+(s.id===ship.id?Math.PI/4:0)}));
 if(mode==='online'){connection.send({type:'placement',fleet});return;}
 if(applyPlacement(local,view.you,fleet).ok)receive(snapshot(local,0));
}
function receive(next:ViewState){
 resolutionReceivedAt=elapsed;resolutionIdleFrames=0;if(next.combatPhase!=='attack'||!next.connected.every(Boolean))acknowledgedStep=undefined;
 const old=view;if(old.combatPhase==='attack'&&next.combatPhase!=='attack')scene.finishAttackPresentation();if(mode==='online'&&(next.phase==='battle'||next.phase==='finished')&&(next.you!==old.you||old.phase==='setup'||old.phase==='waiting')&&!(next.combatPhase==='attack'&&next.resolutionStep!==undefined))lastSequence=Math.max(next.lastShot?.sequence??-1,...(next.shots??[]).map(s=>s.sequence));view=next;
 if(next.phase!=='battle'||next.you!==old.you)lastKnown.clear();else{const visible=new Set(next.visibleCells.map(cellKey));for(const [id,cell]of lastKnown)if(visible.has(cellKey(cell))&&!next.revealed.some(s=>s.id===id&&!s.sunk&&cellKey(s)===cellKey(cell)))lastKnown.delete(id);for(const s of next.revealed)if(s.sunk)lastKnown.delete(s.id);else lastKnown.set(s.id,{x:s.x,z:s.z});}

 if(!selected())selectedId=orderedFleet().find(s=>!s.sunk)?.id;
 if(old.turnNumber!==next.turnNumber){for(const s of next.own)if((s.lastTurnDamage??0)>0&&next.turn===next.you)log(`${SHIPS[s.kind].label} 화재 · 피해 ${s.lastTurnDamage}`);audio.turn();target=undefined;statusMessage='';log(next.turn===next.you?'우리 턴 · 행동력 회복':'상대 턴');}
 if(next.phase==='setup'&&old.phase==='finished'){scene.clearEffects(true);resultGate.reset();lastSequence=-1;resultPlayed=false;target=undefined;el('battle-log').replaceChildren();}
 if(old.phase==='battle')for(const scan of next.sonar??[])if(scan.team===next.you&&!(old.sonar??[]).some(s=>s.shipId===scan.shipId&&s.expiresAt===scan.expiresAt))audio.sonar(scan.center);
 for(const t of next.torpedoes??[])if(t.team===next.you&&!(old.torpedoes??[]).some(p=>p.id===t.id))audio.torpedoLaunch(t);
 const shots=next.shots?.length?next.shots:next.lastShot?[next.lastShot]:[];
 for(const shot of shots.filter(s=>s.sequence>lastSequence).sort((a,b)=>a.sequence-b.sequence)){
  lastSequence=shot.sequence;scene.impact(shot,shot.targetAfter??[...next.own,...next.revealed].find(s=>s.x===shot.x&&s.z===shot.z),next.recon.find(r=>r.team===shot.by)?.center);
  const result=shot.blocked?'미사일 요격':shot.hit?`피해 ${shot.damage}${shot.sunk?' · 침몰':''}`:'빗나감';
  log(`${shot.by===next.you?'아군':'적'}${shot.kind==='airstrike'?' 항공 타격':shot.kind==='torpedo'?' 어뢰':''} ${coord(shot)} · ${result}`);
 }
 renderUI();
}
function dispatch(command:BattleCommand){
 if(!myTurn())return;void audio.unlock();
 if(command.type!=='end'&&command.shipId&&scene.isShipMoving(command.shipId)){announce('이 함선은 이동 중입니다. 다른 함선을 조작할 수 있습니다.');return;}
 if(mode==='online'){if(connection.send(command as unknown as Record<string,unknown>))target=undefined;renderUI();return;}
 const result=applyAction(local,view.you,command,rng);
 if(!result.ok){announce(result.error||'행동할 수 없습니다.');return;}
 if(command.type==='move'){const moved=local.ships.find(s=>s.id===command.shipId);log(moved&&command.target&&cellKey(moved)!==cellKey(command.target)?'새 접촉 발견 · 이동 정지':'함선 이동');}
 if(command.type==='sonar')log('소나 · 해양 시야 2턴');
 if(command.type==='torpedo')log(`${coord(command.target!)} 어뢰 발사`);
 if(command.type==='attack')log(`${coord(command.target!)} 공격 예약 · 함선 번호순 실행`);
 if(command.type==='end')log('행동 종료 · 예약 공격 실행');
 if(command.type==='repair')log('대미지 컨트롤 · 복구');
 if(command.type==='recon')log(`${coord(command.target!)} 정찰 · 21칸`);
 target=undefined;statusMessage='';receive(snapshot(local,0));
 if(local.turn===1&&local.phase==='battle'&&local.combatPhase!=='attack')scheduleAI();
}
function scheduleAI(){
 clearTimeout(timer);const generation=aiGeneration;
 timer=setTimeout(()=>{
  if(generation!==aiGeneration||mode!=='pve'||local.turn!==1||local.phase!=='battle'||local.combatPhase==='attack')return;
  const command=chooseAIAction(snapshot(local,1),difficulty(),rng,aiMemory)||{type:'end'};
  const result=applyAction(local,1,++aiSteps>40?{type:'end'}:command,rng);
  if(!result.ok)applyAction(local,1,{type:'end'},rng);
  receive(snapshot(local,0));if(local.turn===1&&local.phase==='battle'&&(local.combatPhase as string)!=='attack')scheduleAI();else aiSteps=0;
 },650);
}
// One authoritative attack step follows the previous projectile, fracture and camera return.
function pumpAttackResolution(busy:boolean){
 if(paused||view.phase!=='battle'||view.combatPhase!=='attack'||!view.connected.every(Boolean)){resolutionIdleFrames=0;return;}
 if(busy||elapsed-resolutionReceivedAt<.25){resolutionIdleFrames=0;return;}if(++resolutionIdleFrames<2)return;
 if(mode==='pve'){resolutionIdleFrames=0;const result=resolveAttackStep(local,rng);if(!result.ok){announce(result.error??'공격 처리 오류');return;}receive(snapshot(local,0));if(result.complete&&local.phase==='battle'&&local.turn===1){aiSteps=0;scheduleAI();}}
 else if(view.resolutionStep!==undefined&&acknowledgedStep!==view.resolutionStep){if(connection.send({type:'attack-complete',step:view.resolutionStep}))acknowledgedStep=view.resolutionStep;}
}
function reset(){
 roomEntryGeneration++;roomEntering=false;roomSnapshot=false;
 scene.clearEffects(true);resultGate.reset();audio.syncActivity({movingShips:0,fighters:0,burningShips:0,active:false});
 lastKnown.clear();aiGeneration++;clearTimeout(timer);aiSteps=0;aiMemory={};acknowledgedStep=undefined;resolutionIdleFrames=0;if(connection.session)connection.leave();else connection.close();
 mode=el<HTMLSelectElement>('mode-select').value as 'pve'|'online';
 local=createBattle(false);view=snapshot(local,0);selectedId=view.own[0]?.id;
 enemyId=undefined;target=undefined;action='move';lastSequence=-1;resultPlayed=false;statusMessage='';
 el('battle-log').replaceChildren();el('room-code').hidden=true;el('connection-label').textContent='작전 준비';
 el('help-panel').hidden=true;renderUI();scene.deploymentView(view.you);
}
async function enterRoom(code?:string){
 if(roomEntering)return;
 const generation=++roomEntryGeneration;roomEntering=true;roomSnapshot=false;renderUI();
 try{void audio.unlock();const session=await connection.enter(code);
  if(generation!==roomEntryGeneration)return;
  mode='online';el<HTMLSelectElement>('mode-select').value='online';statusMessage='';
  el('room-code').hidden=false;el('room-code').textContent=session.code;
 }catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;announce(error instanceof Error?error.message:'연결 실패');}
 finally{if(generation===roomEntryGeneration){roomEntering=false;renderUI();}}
}
function renderUI(){
 document.body.dataset.phase=view.phase;document.body.dataset.mode=mode;
 el('room-code').hidden=mode!=='online'||!connection.session;
 if(connection.session)el('room-code').textContent=connection.session.code;
 const ship=selected(),started=view.phase==='battle'||view.phase==='finished',waiting=view.phase==='waiting'||(mode==='online'&&view.ready[view.you]);
 if(mapPhase!==view.phase){el('minimap-panel').hidden=matchMedia('(max-width:760px)').matches;el('minimap-toggle').setAttribute('aria-expanded',String(!el('minimap-panel').hidden));mapPhase=view.phase;}
 el('setup-panel').hidden=started;el('battle-panel').hidden=!started;
 document.querySelectorAll<HTMLElement>('.room-controls').forEach(e=>e.hidden=mode!=='online');
 const start=el<HTMLButtonElement>('start-game');start.disabled=roomEntering||waiting||(mode==='online'&&(!connection.session||!roomSnapshot));
 el<HTMLButtonElement>('create-room').disabled=roomEntering;el<HTMLButtonElement>('join-room').disabled=roomEntering;
 start.textContent=waiting?'상대 준비 대기':mode==='online'?'준비 완료':'출격';
 el('state-label').textContent=view.phase==='finished'?'작전 종료':started?myTurn()?'우리 턴':'상대 턴':'작전 준비';
 el('turn-counter').textContent=`${view.round} TURN`;
 el('target-label').textContent=statusMessage||(view.combatPhase==='attack'?`${view.turn===view.you?'아군':'적'} 공격 실행 · ${view.attackProgress?.completed??0} / ${view.attackProgress?.total??0}`:started?target?`${labels[action]} · ${coord(target)}${legalTarget()?'':' · 선택 불가'}`:myTurn()?isOpeningTurn(view)?'첫 턴 · 우클릭 이동·정찰':'함선 선택 → 우클릭 이동':'상대가 행동 중입니다':'함선 선택 → 배치 구역 클릭');
 const rotate=document.getElementById('rotate-placement') as HTMLButtonElement|null;
 if(rotate)rotate.disabled=started||waiting||!ship;
 const number=ship?.id.match(/-(\d+)$/)?.[1];
 el('selected-name').textContent=ship?`${SHIPS[ship.kind].label}${number?` ${number}`:''}`:'함선 선택';
 el('selected-hp').textContent=ship?`${ship.hp} / ${ship.maxHp}`:'—';el('selected-ap').textContent=ship?`${ship.ap} / ${ship.maxAp}`:'—';
 renderShipParts(el('selected-parts'),ship);renderRepairStatus(el('repair-status'),ship);
 const picker=el('ship-picker');picker.replaceChildren();
 for(const [index,s] of orderedFleet().entries()){
  const b=document.createElement('button');b.type='button';b.className=`ship-choice${s.id===selectedId?' is-selected':''}${s.sunk?' is-sunk':''}`;
  b.dataset.ship=s.id;b.disabled=s.sunk;b.setAttribute('aria-pressed',String(s.id===selectedId));b.setAttribute('aria-keyshortcuts',String(index+1));b.title=`${index+1} · ${shipLabel(s)}`;
  const n=s.id.match(/-(\d+)$/)?.[1],title=document.createElement('strong'),stats=document.createElement('small');
  title.textContent=`${SHIPS[s.kind].label}${n?` ${n}`:''}`;stats.textContent=s.sunk?'침몰':scene.isShipMoving(s.id)?`이동 중 · AP ${s.ap}`:`HP ${s.hp} · AP ${s.ap}`;
  b.append(title,stats);b.addEventListener('click',()=>selectShip(s.id));picker.append(b);
 }
 const integrity=el('fleet-status');integrity.replaceChildren();
 for(const s of orderedFleet()){
  const row=document.createElement('div'),text=document.createElement('span'),value=document.createElement('strong'),track=document.createElement('div'),fill=document.createElement('i');
  row.className='integrity-row';text.textContent=shipLabel(s);value.textContent=s.sunk?'침몰':String(s.hp);
  track.className='integrity-track';fill.style.setProperty('--integrity',`${100*s.hp/s.maxHp}%`);track.append(fill);row.append(text,value,track);integrity.append(row);
 }
 for(const kind of ['attack','recon','sonar','torpedo','repair'] as ActionMode[]){
  const b=el<HTMLButtonElement>(`action-${kind}`);b.setAttribute('aria-pressed',String(action===kind));
  b.hidden=(kind==='recon'&&ship?.kind!=='carrier')||(kind==='attack'&&ship?.kind==='carrier')||(kind==='torpedo'&&ship?.kind!=='destroyer');
  b.disabled=!ship||!canControlShip(ship.id)||(kind==='move'?!canMoveShip(ship):kind==='attack'?!canAttack(view)||!canFireShip(ship):kind==='recon'?!canReconShip(ship):kind==='sonar'?!canSonarShip(ship):kind==='torpedo'?!canAttack(view)||!canTorpedoShip(ship):!canRepairShip(ship));
  b.title=ship&&scene.isShipMoving(ship.id)?'이 함선은 이동 중입니다. 다른 함선을 조작할 수 있습니다.':(kind==='repair'?repairActionReason(ship):blockedActionReason(ship,kind))||((kind==='attack'||kind==='torpedo')&&isOpeningTurn(view)?'첫 턴에는 공격할 수 없습니다.':labels[kind]);
 }
 const confirm=el<HTMLButtonElement>('confirm-action');confirm.hidden=action==='move';confirm.disabled=!legalTarget();
 confirm.querySelector('span')!.textContent=action==='sonar'?'현재 함선 중심':target?coord(target):'목표 지정';confirm.querySelector('strong')!.textContent=`${labels[action]} ${action==='attack'?'예약':action==='torpedo'?'발사':'실행'}`;
 el<HTMLButtonElement>('end-turn').disabled=!myTurn();el('end-turn').querySelector('span')!.textContent=view.combatPhase==='attack'?'공격 실행 중':`턴 종료${view.queuedAttacks?.length?` · ${view.queuedAttacks.length} 예약`:''}`;el('result-panel').hidden=true;
 el('result-title').textContent=view.winner===null?'무승부':view.winner===view.you?'승리':'패배';el('result-message').textContent=view.winner===null?'양측 함대의 교전 능력이 상실되었습니다.':view.winner===view.you?'적 함대를 격파했습니다.':'아군 함대가 침몰했습니다.';
 const reachable=ship&&canControlShip(ship.id)?(action==='move'?reachableCells(view,ship.id):action==='torpedo'?Array.from({length:900},(_,i)=>({x:i%30,z:Math.floor(i/30)})).filter(c=>Math.hypot(c.x-ship.x,c.z-ship.z)<=15&&!land().has(cellKey(c))):[]):[];
 scene.setState({you:view.you,turn:view.turn,own:view.own,revealed:view.revealed,islands:view.islands,visibleCells:view.visibleCells,recon:view.recon,sonar:view.sonar,torpedoes:view.torpedoes,selectedId,selectedCell:target??ship,targetCell:target,reachable,action,lastKnown:[...lastKnown].filter(([id])=>!view.revealed.some(s=>s.id===id&&!s.sunk)).map(([,cell])=>cell),deploymentCells:started?undefined:deploymentCells(view.you)});
 renderEnemy();
 drawMap(reachable);
}
function renderEnemy(){
 const contact=view.phase==='battle'?view.revealed.find(s=>s.id===enemyId&&!s.sunk):undefined;
 const panel=el('enemy-panel');panel.hidden=!contact;
 if(!contact){enemyId=undefined;el('enemy-name').textContent='';el('enemy-hp').textContent='';enemyPreview?.setShip(undefined);renderShipParts(el('enemy-parts'),undefined);return;}
 el('enemy-name').textContent=`적 ${SHIPS[contact.kind].label}`;
 el('enemy-hp').textContent=`${contact.hp} / ${contact.maxHp}`;
 enemyPreview??=createEnemyPreview(el<HTMLCanvasElement>('enemy-preview'),scene.getFleetAssets(),scene.getFleetGeometry);
 const displayed=scene.visualShip(contact.id)??contact;renderShipParts(el('enemy-parts'),displayed);enemyPreview.setShip(displayed);enemyPreview.resize();
}
function drawMap(reachable:Cell[]){
 const map=el<HTMLCanvasElement>('tactical-map');if(!map)return;const size=360;map.width=size;map.height=size;
 const ctx=map.getContext('2d')!,unit=size/BOARD_SIZE;ctx.fillStyle='#0b202a';ctx.fillRect(0,0,size,size);
 if(view.phase==='setup'){ctx.fillStyle='#2a656a';for(const c of deploymentCells(view.you))ctx.fillRect(c.x*unit,c.z*unit,unit,unit);}
 for(const [cells,color] of [[view.visibleCells,'#254b51'],[view.islands,'#718168'],[reachable,'#265e68']] as [Cell[],string][]){
  ctx.fillStyle=color;for(const c of cells)ctx.fillRect(c.x*unit,c.z*unit,unit,unit);
 }
 for(const [id,c]of lastKnown)if(!view.revealed.some(s=>s.id===id&&!s.sunk)){ctx.fillStyle='#df353580';ctx.fillRect(c.x*unit,c.z*unit,unit,unit);ctx.strokeStyle='#ff5555';ctx.lineWidth=1;ctx.strokeRect(c.x*unit+.5,c.z*unit+.5,unit-1,unit-1);}
 if(target&&(action==='attack'||action==='torpedo')){ctx.fillStyle='#ef3e3e99';ctx.fillRect(target.x*unit,target.z*unit,unit,unit);}
 ctx.strokeStyle='#ffffff0c';ctx.lineWidth=1;ctx.beginPath();
 for(let i=0;i<=BOARD_SIZE;i++){ctx.moveTo(i*unit,0);ctx.lineTo(i*unit,size);ctx.moveTo(0,i*unit);ctx.lineTo(size,i*unit);}ctx.stroke();
 for(const s of [...view.own,...view.revealed]){
  if(s.sunk)continue;ctx.fillStyle=s.team===view.you?'#85d6dd':'#f2ae63';ctx.beginPath();ctx.arc((s.x+.5)*unit,(s.z+.5)*unit,unit*.34,0,Math.PI*2);ctx.fill();
  if(s.id===selectedId){ctx.strokeStyle='#ffe1a0';ctx.lineWidth=2;ctx.strokeRect(s.x*unit+1,s.z*unit+1,unit-2,unit-2);}
 }
 // Snapshot includes routes only for friendly or currently detected torpedoes.
 ctx.save();ctx.strokeStyle='#ff4b55';ctx.lineWidth=1.6;ctx.setLineDash([4,3]);
 for(const t of view.torpedoes??[]){if(t.team===view.you||!t.route?.length)continue;ctx.beginPath();ctx.moveTo((t.x+.5)*unit,(t.z+.5)*unit);for(const c of t.route)ctx.lineTo((c.x+.5)*unit,(c.z+.5)*unit);ctx.stroke();}
 ctx.restore();
 for(const t of view.torpedoes??[]){ctx.fillStyle=t.team===view.you?'#e8eee7':'#ff5544';ctx.beginPath();ctx.arc((t.x+.5)*unit,(t.z+.5)*unit,unit*.18,0,Math.PI*2);ctx.fill();}
 const tile=target??selected();if(tile){ctx.strokeStyle='#ffe600';ctx.lineWidth=3;ctx.strokeRect(tile.x*unit+1,tile.z*unit+1,unit-2,unit-2);}
 map.setAttribute('aria-label',`30 × 30 전술 지도. 아군 ${view.own.filter(s=>!s.sunk).length}척, 발견한 적 ${view.revealed.filter(s=>!s.sunk).length}척.`);
}
function bind(){
 const button=(id:string,fn:()=>void)=>el(id).addEventListener('click',fn);
 document.addEventListener('pointerdown',()=>{void audio.unlock();},{once:true});
 button('enemy-close',()=>{enemyId=undefined;renderUI();});
 const volume=el<HTMLInputElement>('volume-control'),volumeValue=el<HTMLOutputElement>('volume-value');
 const syncVolume=(persist=false)=>{const value=Math.min(100,Math.max(0,Math.round(Number(volume.value)||0)));volume.value=String(value);volume.setAttribute('aria-valuetext',`${value}%`);volumeValue.value=`전체 음량 ${value}%`;audio.setVolume(value/100);if(persist)try{localStorage.setItem(volumeStorageKey,String(value));}catch{}};
 volume.value=String(Math.round(audio.volume*100));syncVolume();volume.addEventListener('input',()=>{void audio.unlock();syncVolume(true);});
 button('help-toggle',()=>{const panel=el('help-panel');panel.hidden=!panel.hidden;el('help-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
 document.querySelectorAll<HTMLElement>('[data-close]').forEach(b=>b.addEventListener('click',()=>{el(b.dataset.close!).hidden=true;}));
 for(const id of ['exit-action','restart'])button(id,reset);
 button('rematch',()=>{if(mode==='online'){connection.send({type:'rematch'});return;}reset();});
 el('mode-select').addEventListener('change',reset);button('create-room',()=>{void enterRoom();});button('join-room',()=>{void enterRoom(el<HTMLInputElement>('room-input').value);});
 button('room-code',()=>{if(connection.session)void navigator.clipboard?.writeText(connection.session.code).catch(()=>announce(connection.session!.code));});
 button('start-game',()=>{void audio.unlock();if(mode==='online'){connection.send({type:'ready'});return;}const result=startBattle(local);if(!result.ok){announce(result.error||'배치를 확인하세요.');return;}receive(snapshot(local,0));log('작전 개시');});
 document.getElementById('rotate-placement')?.addEventListener('click',rotatePlacement);
 for(const kind of ['attack','recon','sonar','torpedo','repair'] as ActionMode[])button(`action-${kind}`,()=>{action=kind;target=undefined;localHit=undefined;statusMessage='';audio.click();renderUI();});
 button('confirm-action',confirmAction);button('end-turn',()=>dispatch({type:'end'}));
 el('tactical-map').addEventListener('click',event=>{
  const rect=el('tactical-map').getBoundingClientRect(),e=event as MouseEvent;
  selectCell({x:Math.min(29,Math.max(0,Math.floor((e.clientX-rect.left)/rect.width*30))),z:Math.min(29,Math.max(0,Math.floor((e.clientY-rect.top)/rect.height*30)))});
  if(matchMedia('(max-width:760px)').matches){el('minimap-panel').hidden=true;el('minimap-toggle').setAttribute('aria-expanded','false');}
 });
 el('tactical-map').addEventListener('contextmenu',event=>{event.preventDefault();const rect=el('tactical-map').getBoundingClientRect();moveToCell({x:Math.min(29,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*30))),z:Math.min(29,Math.max(0,Math.floor((event.clientY-rect.top)/rect.height*30)))});});
 document.getElementById('minimap-toggle')?.addEventListener('click',()=>{const panel=el('minimap-panel');panel.hidden=!panel.hidden;el('minimap-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
 window.addEventListener('keydown',event=>{
  const eventTarget=event.target instanceof HTMLElement?event.target:undefined;
  if(eventTarget&&(eventTarget.matches('input, select, textarea, [contenteditable="true"]')||eventTarget.isContentEditable))return;
  if(event.key==='Escape'){enemyId=undefined;target=undefined;el('help-panel').hidden=true;renderUI();return;}
  if(paused||!el('help-panel').hidden||!el('result-panel').hidden)return;
  if(event.code==='Space'){
   event.preventDefault();if(event.repeat)return;
   const contact=!el('enemy-panel').hidden&&view.phase==='battle'?view.revealed.find(s=>s.id===enemyId&&!s.sunk):undefined;
   if(contact){event.preventDefault();scene.focus(contact,false);return;}
   const ship=view.own.find(s=>s.id===selectedId&&!s.sunk);if(ship){event.preventDefault();scene.focus(ship,true);}return;
  }
  if(event.key==='Enter')confirmAction();
  const digit=/^Digit([1-7])$/.exec(event.code);
  if(digit){
   const ship=fleetShipAtDigit(view.own,Number(digit[1])),button=ship?document.querySelector<HTMLElement>(`[data-ship="${ship.id}"]`):undefined;
   if(ship&&!ship.sunk&&button&&!button.hidden){event.preventDefault();selectShip(ship.id);}return;
  }
  if(event.key.toLowerCase()==='r'&&view.phase==='setup'){rotatePlacement();return;}
  if(event.key.toLowerCase()==='r'){const recon=el<HTMLButtonElement>('action-recon');if(!recon.hidden&&!recon.disabled)recon.click();}
 });
 window.addEventListener('resize',()=>{scene.resize();enemyPreview?.resize();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.suspend();else audio.resume();});
}
bind();el<HTMLSelectElement>('mode-select').disabled=false;
if(connection.restore()){mode='online';el<HTMLSelectElement>('mode-select').value='online';}
renderUI();
const compassHeading=el('compass-heading'),compassTape=el('compass-tape'),compassLabels=compassTape?Array.from(compassTape.querySelectorAll('span')):[];let compassSector=-1,compassText='';
function updateCompass(){if(!compassHeading||!compassTape)return;const bearing=scene.cameraBearing(),base=Math.round(bearing/90)*90,cardinals=['N','E','S','W'],directions=['N','NE','E','SE','S','SW','W','NW'];const text=String(Math.round(bearing)%360).padStart(3,'0')+'° '+directions[Math.round(bearing/45)%8];if(text!==compassText){compassHeading.textContent=text;compassText=text;}if(base!==compassSector){compassSector=base;compassLabels.forEach((node,i)=>{const b=((base+(i-2)*90)%360+360)%360;node.textContent=cardinals[b/90]!;node.dataset.bearing=String(b);});}compassTape.style.transform=`translateX(calc(-50% + ${(-(bearing-base)*1.6).toFixed(2)}px))`;}
function loop(now:number){
 const dt=Math.min(.05,(now-previous)/1000);previous=now;if(!paused)elapsed+=dt;
 scene.update(paused?0:dt,elapsed);scene.render();updateCompass();const busy=scene.presentationBusy(),availability=JSON.stringify([scene.actionBusy(),scene.movingShipIds()]);if(busy!==lastPresentationBusy||availability!==lastActionAvailability){lastPresentationBusy=busy;lastActionAvailability=availability;renderUI();}pumpAttackResolution(busy);const resultReady=resultGate.ready(view.phase,busy);el('result-panel').hidden=!resultReady;if(resultReady&&!resultPlayed){resultPlayed=true;audio.result(view.winner===view.you);}
 enemyPreview?.update(paused||reduced?0:dt,reduced?0:elapsed);frames++;
 if(frames%10===0){
  const activity=scene.diagnostics(),camera=activity.camera as {position:number[];target:number[]};audio.syncListener(camera.position,camera.target);audio.syncActivity({torpedoes:view.torpedoes?.length??0,movingShips:Number(activity.movingShips??0),fighters:Number(activity.reconFighters??0),burningShips:Number(activity.burningShips??0),active:(view.phase==='battle'||view.phase==='finished'&&activity.presentationBusy===true)&&!paused&&!document.hidden});
 }
 if(frames%15===0&&['localhost','127.0.0.1'].includes(location.hostname)){
  (window as unknown as Record<string,unknown>).__THREE_GAME_DIAGNOSTICS__={frame:frames,elapsed,score:view.revealed.filter(s=>s.sunk).length,targetScore:view.own.length,complete:view.phase==='finished',state:view.phase,player:{position:{x:selected()?.x??0,y:0,z:selected()?.z??0},speed:0},canvas:{clientWidth:el<HTMLCanvasElement>('game-canvas').clientWidth,clientHeight:el<HTMLCanvasElement>('game-canvas').clientHeight,width:el<HTMLCanvasElement>('game-canvas').width,height:el<HTMLCanvasElement>('game-canvas').height,dpr:devicePixelRatio},...scene.diagnostics()};
 }
 raf=requestAnimationFrame(loop);
}
raf=requestAnimationFrame(loop);
function dispose(){cancelAnimationFrame(raf);clearTimeout(timer);connection.close(false);audio.dispose();scene.dispose();enemyPreview?.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
if(import.meta.hot)import.meta.hot.dispose(dispose);
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
 const hooks={
  seed(value:number){rng=createSeededRandom(value);},
  setPausedForScreenshot(value:boolean){paused=value;},setReducedMotion(value:boolean){reduced=value;},
  refresh(){receive(snapshot(local,0));},
  getState(){return {audio:audio.diagnostics(),state:view,world:mode==='pve'?local:undefined,selectedId,action,target,enemyId,enemyPreview:enemyPreview?.diagnostics(),resultGate:resultGate.diagnostics(),...scene.diagnostics()};},
  home(){scene.home();},focus(cell:Cell){scene.focus(cell);},project(cell:Cell){return scene.project(cell);},select(id:string){selectShip(id);},command(command:BattleCommand){dispatch(command);},
  resolveAITurn(){clearTimeout(timer);aiGeneration++;for(let i=0;i<45&&local.turn===1&&local.phase==='battle';i++){
   const cmd=chooseAIAction(snapshot(local,1),difficulty(),rng,aiMemory)||{type:'end'};
   if(!applyAction(local,1,cmd,rng).ok)applyAction(local,1,{type:'end'},rng);
  }receive(snapshot(local,0));},
  setState(name:string){
   scene.clearEffects();resultGate.reset();lastKnown.clear();aiGeneration++;clearTimeout(timer);mode='pve';local=createBattle();aiMemory={};
   if(name==='last-ap'){
    local.turnNumber=3;local.round=2;local.ownTurns=[2,1];
    for(const ship of local.ships.filter(s=>s.team===0))ship.ap=ship.kind==='destroyer'&&ship.id.endsWith('-1')?1:0;
   }
   if(name==='airstrike'){
    local.turnNumber=3;local.round=2;local.ownTurns=[2,1];
    const enemy=local.ships.find(s=>s.team===1&&s.kind==='destroyer')!;enemy.x=25;enemy.z=25;for(const guard of local.ships.filter(s=>s.team===1&&s.kind==='destroyer'))guard.parts!.airDefense={hp:0,maxHp:200,disabled:true};
   }
   if(name==='damage'){
    local.turnNumber=3;local.round=2;local.ownTurns=[2,1];
    for(const guard of local.ships.filter(s=>s.team===1&&s.kind==='destroyer'))guard.parts!.airDefense={hp:0,maxHp:200,disabled:true};
    local.ships[0].hp=500;local.ships[0].damageMarks=[{x:.24,z:-.23,seed:17},{x:-.12,z:.35,seed:29}];
    const enemy=local.ships.find(s=>s.team===1&&s.kind==='battleship')!;
    enemy.x=25;enemy.z=25;
    applyAction(local,0,{type:'recon',shipId:local.ships.find(s=>s.team===0&&s.kind==='carrier')!.id,target:enemy},rng);local.lastShot=undefined;enemy.hp=400;enemy.sunk=false;enemy.parts=createParts(enemy.kind);enemy.damageControl=false;enemy.damageMarks=[{x:-.2,z:.25,seed:33}];
   }
   local.queuedAttacks=[[],[]];local.combatPhase='action';local.attackProgress={completed:0,total:0};local.pendingTorpedoes=[];delete local.resolutionStep;local.shotEvents=[];local.lastShot=undefined;enemyId=undefined;selectedId=local.ships.find(s=>s.team===0&&!s.sunk)?.id;lastSequence=-1;resultPlayed=false;target=undefined;
   if(name==='complete'){local.phase='finished';local.winner=0;}
   receive(snapshot(local,0));scene.home();
  },
 };
 (window as unknown as Record<string,unknown>).__THREE_GAME_TEST_HOOKS__=hooks;
}

