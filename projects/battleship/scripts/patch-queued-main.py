from pathlib import Path
p=Path('src/main.ts');s=p.read_text(encoding='utf8')
s=s.replace('snapshot,applyAction,reachableCells','snapshot,applyAction,resolveAttackStep,reachableCells')
s=s.replace("let mapPhase='';", "let resolutionIdleFrames=0,resolutionReceivedAt=0,acknowledgedStep:number|undefined;\nlet mapPhase='';")
s=s.replace("view.phase==='battle'&&view.turn===view.you&&view.connected.every(Boolean)","view.phase==='battle'&&view.combatPhase!=='attack'&&!scene.presentationBusy()&&view.turn===view.you&&view.connected.every(Boolean)")
s=s.replace('function receive(next:ViewState){','function receive(next:ViewState){\n resolutionReceivedAt=elapsed;resolutionIdleFrames=0;if(next.combatPhase!==\'attack\')acknowledgedStep=undefined;')
s=s.replace("if(command.type==='torpedo')log(`${coord(command.target!)} 어뢰 발사`);", "if(command.type==='torpedo')log(`${coord(command.target!)} 어뢰 예약`);\n if(command.type==='attack')log(`${coord(command.target!)} 공격 예약 · ${(local.queuedAttacks[view.you]??[]).length}번째`);\n if(command.type==='end')log('행동 종료 · 예약 공격 실행');")
s=s.replace("if(local.turn===1&&local.phase==='battle')scheduleAI();", "if(local.turn===1&&local.phase==='battle'&&local.combatPhase!=='attack')scheduleAI();")
s=s.replace("local.turn!==1||local.phase!=='battle')return;", "local.turn!==1||local.phase!=='battle'||local.combatPhase==='attack')return;")
s=s.replace("if(local.turn===1&&local.phase==='battle')scheduleAI();else aiSteps=0;", "if(local.turn===1&&local.phase==='battle'&&local.combatPhase!=='attack')scheduleAI();else aiSteps=0;")
needle='function reset(){'
idx=s.index(needle)
s=s[:idx]+'''// One authoritative attack step follows the previous projectile, fracture and camera return.
function pumpAttackResolution(busy:boolean){
 if(paused||view.phase!=='battle'||view.combatPhase!=='attack'||!view.connected.every(Boolean)){resolutionIdleFrames=0;return;}
 if(busy||elapsed-resolutionReceivedAt<.25){resolutionIdleFrames=0;return;}if(++resolutionIdleFrames<2)return;
 if(mode==='pve'){resolutionIdleFrames=0;const result=resolveAttackStep(local,rng);if(!result.ok){announce(result.error??'공격 처리 오류');return;}receive(snapshot(local,0));if(result.complete&&local.phase==='battle'&&local.turn===1){aiSteps=0;scheduleAI();}}
 else if(view.resolutionStep!==undefined&&acknowledgedStep!==view.resolutionStep){if(connection.send({type:'attack-complete',step:view.resolutionStep}))acknowledgedStep=view.resolutionStep;}
}
''' +s[idx:]
s=s.replace("if(connection.session)connection.leave();", "acknowledgedStep=undefined;resolutionIdleFrames=0;if(connection.session)connection.leave();")
s=s.replace("statusMessage||(started?target?", "statusMessage||(view.combatPhase==='attack'?`${view.turn===view.you?'아군':'적'} 공격 실행 · ${view.attackProgress?.completed??0} / ${view.attackProgress?.total??0}`:started?target?")
s=s.replace("confirm.querySelector('strong')!.textContent=`${labels[action]} 실행`;", "confirm.querySelector('strong')!.textContent=`${labels[action]} ${action==='attack'||action==='torpedo'?'예약':'실행'}`;")
s=s.replace("el<HTMLButtonElement>('end-turn').disabled=!myTurn();", "el<HTMLButtonElement>('end-turn').disabled=!myTurn();el('end-turn').querySelector('span')!.textContent=view.combatPhase==='attack'?'공격 실행 중':`턴 종료${view.queuedAttacks?.length?` · ${view.queuedAttacks.length} 예약`:''}`;")
s=s.replace("updateCompass();const busy=scene.presentationBusy(),resultReady", "updateCompass();const busy=scene.presentationBusy();pumpAttackResolution(busy);const resultReady")
p.write_text(s,encoding='utf8')
p=Path('index.html');s=p.read_text(encoding='utf8').replace('아군 7척이 각각 행동합니다.','행동 → 턴 종료 → 예약 순서대로 공격 → 상대 행동').replace('매 턴 5칸','발사 예약 · 자기 공격 단계마다 5칸');p.write_text(s,encoding='utf8')
