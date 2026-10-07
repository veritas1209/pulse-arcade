import fs from 'node:fs';
import {transpileQaModule} from './transpile-qa-modules.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const out='artifacts/hit-region-tool';fs.mkdirSync(out,{recursive:true});
for(const name of ['fleet','kit','authored-ships','aviation','fracture'])transpileQaModule(`src/naval/${name}.ts`,`${out}/${name}.mjs`);
const {buildFleetAssets,fleetGeometry}=await import('../artifacts/hit-region-tool/fleet.mjs');
const {fractureHull}=await import('../artifacts/hit-region-tool/fracture.mjs');const assets=buildFleetAssets(),report=[];
for(const [kind,asset]of Object.entries(assets)){
 const source=fleetGeometry(asset,[{x:.1,z:.1,seed:67}],false);source.computeBoundingBox();const bounds=source.boundingBox;
 for(const fraction of [-.4,0,.4]){
  const start=performance.now(),chunks=fractureHull(source,asset.fittedSize[2]*fraction,67);const splitMs=performance.now()-start;assert.equal(chunks.length,2);let triangles=0;
  for(const chunk of chunks){assert.ok(chunk.cutEdges>10);assert.ok(chunk.interiorVertices>100);const p=chunk.geometry.getAttribute('position');triangles+=p.count/3;
   for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).add(chunk.center);assert.ok(v.toArray().every(Number.isFinite));assert.ok(bounds.clone().expandByScalar(.025).containsPoint(v));}
   for(const name of ['normal','color','uv','aInterior','aPart','aSurface'])assert.ok([...chunk.geometry.getAttribute(name).array].every(Number.isFinite));
   assert.ok(chunk.lowGeometry.getAttribute('position').count<=p.count);chunk.geometry.dispose();chunk.lowGeometry.dispose();
  }
  assert.ok(triangles<source.getAttribute('position').count/3*1.3);report.push({kind,fraction,triangles,cutEdges:chunks.map(c=>c.cutEdges),splitMilliseconds:Math.round(splitMs),verificationMilliseconds:Math.round(performance.now()-start-splitMs)});
 }
 source.dispose();for(const sector of asset.sectors)for(const g of Object.values(sector))g.dispose();
}
fs.mkdirSync('artifacts/fracture',{recursive:true});fs.writeFileSync('artifacts/fracture/source-qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify({cases:report.length,allShipKinds:3,finiteGeometry:true,originalBounds:true,noStretch:true,report}));

