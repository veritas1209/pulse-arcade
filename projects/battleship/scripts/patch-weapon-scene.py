from pathlib import Path
p=Path('src/scene.ts');s=p.read_text(encoding='utf8')
s=s.replace("import {createEffects} from './naval/effects';","import {createEffects} from './naval/effects';\nimport {createWeaponMounts} from './naval/weapon-mounts';")
s=s.replace('type Vessel={group:', 'type Vessel={mountSource?:THREE.BufferGeometry;group:')
s=s.replace('const ships=new Map<string,Vessel>()','const weaponMounts=createWeaponMounts(shipMaterial);\n const ships=new Map<string,Vessel>()')
needle=' const surfacePoints='
idx=s.index(needle)
s=s[:idx]+''' function assignGeometry(v:Vessel,source:THREE.BufferGeometry){if(v.mountSource===source)return;const previous=v.mountSource?v.mesh.geometry:undefined;v.mountSource=source;v.mesh.geometry=weaponMounts.sync(v.ship.id,v.ship.kind,v.group,source,assets[v.ship.kind]);installSpatialRaycast(v.mesh);if(previous&&previous!==source&&previous!==v.mesh.geometry)previous.dispose();}
''' +s[idx:]
s=s.replace('ships.delete(id);','weaponMounts.remove(id);if(v.mountSource&&v.mesh.geometry!==v.mountSource)v.mesh.geometry.dispose();ships.delete(id);')
s=s.replace('ships.set(ship.id,v);}', 'ships.set(ship.id,v);assignGeometry(v,getGeometry(initial,true));}')
s=s.replace('v.mesh.geometry=getGeometry(ship,v.low);','assignGeometry(v,getGeometry(ship,v.low));')
s=s.replace('v.mesh.geometry=getGeometry(v.ship,low);','assignGeometry(v,getGeometry(v.ship,low));')
s=s.replace('v.fractured=true;v.mesh.visible=false;','v.fractured=true;v.mesh.visible=false;weaponMounts.remove(ship.id);')
# A restored hull needs its actors rebuilt even when its source pointer remains the same.
s=s.replace('v.fractured=false;v.mesh.visible=true;', 'if(v.fractured){v.mountSource=undefined;assignGeometry(v,getGeometry(ship,v.low));}v.fractured=false;v.mesh.visible=true;')
needle="effects.impact(shot,assets[ship?.kind??'battleship'].sectors[1].fragment,at,kind,sourcePosition,!!shot.sunk&&!ship&&!sourcePosition,defenseOrigin);"
replacement="""const target=at??cellPosition(shot).setY(shot.hit?.4:.1),mount=source&&shot.kind!=='torpedo'&&shot.kind!=='airstrike'?weaponMounts.prepare(source.ship.id,kind==='battleship'?'gun':'missile',target):undefined;let defenseMount:ReturnType<typeof weaponMounts.defense>;
  effects.impact(shot,assets[ship?.kind??'battleship'].sectors[1].fragment,at,kind,sourcePosition,!!shot.sunk&&!ship&&!sourcePosition,defenseOrigin,{launchDelay:mount?.launchDelay,getMuzzle:mount?.getMuzzle,onLaunch:mount?.fire,onDefenseAim:defender?(aim,duration)=>{defenseMount=weaponMounts.defense(defender.ship.id,aim,duration);}:undefined,getDefenseMuzzle:()=>defenseMount?.getMuzzle()});"""
assert needle in s;s=s.replace(needle,replacement)
s=s.replace('effects.setFires(fires);effects.update(dt,time);','weaponMounts.update(dt,time);effects.setFires(fires);effects.update(dt,time);')
s=s.replace('function diagnostics(){return{','function diagnostics(){return{weaponMounts:weaponMounts.diagnostics(),')
s=s.replace('effects.clear();effects.dispose();','effects.clear();effects.dispose();weaponMounts.dispose();')
s=s.replace('effects.clear();torpedoMotion.clear();','effects.clear();weaponMounts.clear();torpedoMotion.clear();')
# Picking uses authored actor meshes as well as the stripped static hull.
s=s.replace('ray.intersectObjects(vessels.map(v=>v.mesh),false)[0]','ray.intersectObjects(vessels.map(v=>v.group),true)[0]')
s=s.replace('vessels.find(v=>v.mesh===meshHit.object)!','vessels.find(v=>{let o:THREE.Object3D|null=meshHit.object;while(o){if(o===v.group)return true;o=o.parent;}return false;})!')
# Refraction must not reinsert the unrotated source turrets underneath their animated actors.
s=s.replace('low:getGeometry(v.ship,true)','low:v.mesh.geometry')
p.write_text(s,encoding='utf8')
