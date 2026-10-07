import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {transpileQaModule} from './transpile-qa-modules.mjs';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts/hit-region-tool');fs.mkdirSync(out,{recursive:true});
for(const [name,source]of [['fleet','src/naval/fleet.ts'],['parts','src/parts.ts']])transpileQaModule(path.join(root,source),path.join(out,`${name}.mjs`));
const {buildFleetAssets,detachedPartIndices,fleetGeometry}=await import('../artifacts/hit-region-tool/fleet.mjs');
const {WEAPON_REGIONS,SYSTEM_REGIONS,partAt}=await import('../artifacts/hit-region-tool/parts.mjs');
const source=JSON.parse(fs.readFileSync(path.join(root,'artifacts/external-assets/fleet-conversion-report.json'),'utf8'));
const assets=buildFleetAssets();let checked=0,systemChecks=0;
for(const [kind,asset]of Object.entries(assets)){
 const weapons=asset.parts.filter(p=>p.system==='weapon');assert.equal(WEAPON_REGIONS[kind].length,weapons.length);
 for(const region of [...WEAPON_REGIONS[kind],...SYSTEM_REGIONS[kind]]){
  const part=asset.parts.find(p=>p.id===region.id);assert.ok(part,region.id);
  assert.ok(source[kind].parts.some(p=>p.id===region.id),`${region.id} missing source provenance`);
  for(const [key,value]of Object.entries({x0:part.bounds.min.x/(asset.fittedSize[0]/2),x1:part.bounds.max.x/(asset.fittedSize[0]/2),z0:part.bounds.min.z/(asset.fittedSize[2]/2),z1:part.bounds.max.z/(asset.fittedSize[2]/2)}))assert.ok(Math.abs(region[key]-value)<1e-6,`${kind}/${part.id}/${key}`);
  if('system' in region){systemChecks++;continue;}
  assert.equal(partAt(kind,{x:(region.x0+region.x1)/2,z:(region.z0+region.z1)/2}),'weapon',region.id);checked++;
 }
 if(weapons.length){
  const r=WEAPON_REGIONS[kind][0],mark={x:(r.x0+r.x1)/2,z:(r.z0+r.z1)/2,seed:23};
  const alive={weapon:{hp:200,disabled:false}},indices=new Set(weapons.map(p=>p.index));
  const intact=detachedPartIndices(asset,[mark],alive);assert.ok([...indices].every(i=>!intact.has(i)));
  for(const low of [false,true]){
   // All source weapon attachments share one tactical subsystem. Inspect every
   // index at both LODs while building each whole hull once per state.
   const geometry=fleetGeometry(asset,[mark],low,alive),ids=new Set(geometry.getAttribute('aPart').array);
   for(const part of weapons)assert.ok(ids.has(part.index),`${part.id} intact weapon vanished at LOD ${low}`);
   geometry.dispose();
   for(const state of [{hp:0,disabled:false},{hp:0,disabled:true},{hp:200,disabled:true}]){
    const lost=detachedPartIndices(asset,[],{weapon:state});assert.ok([...indices].every(i=>lost.has(i)));
    const destroyed=fleetGeometry(asset,[],low,{weapon:state}),ids=destroyed.getAttribute('aPart').array;
    for(const id of ids)assert.ok(!indices.has(id),`Destroyed weapon retained at LOD ${low}`);
    destroyed.dispose();
   }
  }
 }
 for(const sector of asset.sectors)for(const geometry of Object.values(sector))geometry.dispose();
}
const samples=[];for(const kind of ['carrier','battleship','destroyer'])for(let x=-20;x<=20;x++)for(let z=-20;z<=20;z++)samples.push([kind,{x:x/20,z:z/20}]);
const code="import sys,json;sys.path.insert(0,'server');from battleship_rooms import WEAPON_REGIONS,SYSTEM_REGIONS,part_at;data=json.load(sys.stdin);print(json.dumps({'weapons':WEAPON_REGIONS,'systems':SYSTEM_REGIONS,'samples':[part_at(k,h) for k,h in data]}))";
const run=spawnSync('python',['-c',code],{cwd:root,input:JSON.stringify(samples),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
const canonical=JSON.parse(run.stdout);assert.deepEqual(canonical.weapons,WEAPON_REGIONS);assert.deepEqual(canonical.systems,SYSTEM_REGIONS);assert.deepEqual(canonical.samples,samples.map(([kind,hit])=>partAt(kind,hit)??null));
const result={sourceWeaponRegions:checked,sourceSystemRegions:systemChecks,normalizedCoordinateTolerance:1e-6,geometryLODs:2,hpAndDisabledGuards:true,visualStateParity:true,pythonRegionParity:true,pythonHitSamples:samples.length};
fs.writeFileSync(path.join(out,'conformance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
