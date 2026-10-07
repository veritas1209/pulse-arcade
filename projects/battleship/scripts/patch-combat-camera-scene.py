from pathlib import Path
p=Path('src/scene.ts');s=p.read_text(encoding='utf8').replace("import {createWeaponMounts} from './naval/weapon-mounts';","import {createWeaponMounts} from './naval/weapon-mounts';\nimport {createCombatCamera} from './naval/combat-camera';")
s=s.replace("onShotPhase?.(phase,shot,kind);},", "if(phase==='impact'){combatCamera.impact(combatImpactPoints.get(shot.sequence)??cellPosition(shot).setY(.3),!!shot.sunk);combatImpactPoints.delete(shot.sequence);}onShotPhase?.(phase,shot,kind);},")
s=s.replace(",onDefense),controls=new OrbitControls", ",event=>{if(event.phase==='intercept')combatImpactPoints.set(event.shot.sequence,event.position.clone());onDefense?.(event);}),controls=new OrbitControls")
needle=' // One reconnaissance aircraft'
index=s.index(needle)
s=s[:index]+''' let combatSourceId:string|undefined;const combatImpactPoints=new Map<number,THREE.Vector3>();
 const combatCamera=createCombatCamera(camera,controls,{seaAt:(x,z)=>oceanSurfaceY(x,z,elapsed),sourceShipPose:()=>{const vessel=combatSourceId?ships.get(combatSourceId):undefined;return vessel?{position:vessel.group.position}:undefined;}});
 const cancelCombatCamera=()=>{if(combatCamera.isActive())combatCamera.cancel();};canvas.addEventListener('pointerdown',cancelCombatCamera);canvas.addEventListener('wheel',cancelCombatCamera,{passive:true});
''' +s[index:]
s=s.replace("const target=at??cellPosition(shot).setY(shot.hit?.4:.1),mount=", "const target=at??cellPosition(shot).setY(shot.hit?.4:.1),mount=")
s=s.replace("let defenseMount:ReturnType<typeof weaponMounts.defense>;", "let defenseMount:ReturnType<typeof weaponMounts.defense>;const launchDelay=shot.kind==='torpedo'?0:Math.max(.85,mount?.launchDelay??0);combatSourceId=source?.ship.id;stopFocus();followShipId=undefined;combatImpactPoints.set(shot.sequence,target.clone());combatCamera.begin(sourcePosition??target.clone().add(new THREE.Vector3(0,.4,1)),target,assets[source?.ship.kind??ship?.kind??'destroyer'].fittedSize[2],launchDelay);")
s=s.replace("launchDelay:mount?.launchDelay,getMuzzle:mount?.getMuzzle,onLaunch:mount?.fire,", "launchDelay,getMuzzle:mount?.getMuzzle,onLaunch:()=>{mount?.fire();const projectile=effects.diagnostics().projectiles.find(p=>p.sequence===shot.sequence);if(projectile)combatCamera.launched(new THREE.Vector3().fromArray(projectile.source),new THREE.Vector3().fromArray(projectile.target),projectile.duration);},")
s=s.replace("function presentationBusy(){return effects.projectileBusy()", "function effectsBusy(){return effects.projectileBusy()")
needle=' function render(){'
index=s.index(needle)
s=s[:index]+''' function presentationBusy(){return effectsBusy()||combatCamera.isActive()||[...ships.values()].some(v=>!v.ship.sunk&&(v.path.length>0||Math.hypot(v.group.position.x-v.target.x,v.group.position.z-v.target.z)>.08))||torpedoMotion.diagnostics().some(t=>t.waypoints.length>0);}
''' +s[index:]
s=s.replace('controls.update();cameraGuard.update();updateLocalShadow();', 'if(!combatCamera.isActive())controls.update();cameraGuard.update();updateLocalShadow();')
s=s.replace('effects.update(dt,time);torpedoWakes.update(time);', 'effects.update(dt,time);torpedoWakes.update(time);if(!effectsBusy()&&combatCamera.readyToEnd())combatCamera.end();combatCamera.update(dt,time);if(combatCamera.isActive()){cameraGuard.update();updateLocalShadow();ocean.followCamera(camera);}')
s=s.replace('function diagnostics(){return{weaponMounts:', 'function diagnostics(){return{...combatCamera.diagnostics(),weaponMounts:')
s=s.replace('effects.clear();effects.dispose();weaponMounts.dispose();', "combatCamera.clear();canvas.removeEventListener('pointerdown',cancelCombatCamera);canvas.removeEventListener('wheel',cancelCombatCamera);effects.clear();effects.dispose();weaponMounts.dispose();")
s=s.replace('effects.clear();weaponMounts.clear();', 'combatCamera.clear();combatImpactPoints.clear();effects.clear();weaponMounts.clear();')
# Explicit focus/navigation is an intentional override of the current cinematic.
s=s.replace('function focus(cell:Cell,follow=false){', 'function focus(cell:Cell,follow=false){combatCamera.cancel();')
p.write_text(s,encoding='utf8')
p=Path('src/main.ts');s=p.read_text(encoding='utf8').replace("receive(snapshot(local,0));if(local.turn===1&&local.phase==='battle'&&local.combatPhase!=='attack')", "receive(snapshot(local,0));if(local.turn===1&&local.phase==='battle'&&(local.combatPhase as string)!=='attack')")
s=s.replace("scene.impact(shot,[...next.own,...next.revealed].find", "scene.impact(shot,shot.targetAfter??[...next.own,...next.revealed].find")
p.write_text(s,encoding='utf8')
