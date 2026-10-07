import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {transpileQaModule} from './transpile-qa-modules.mjs';
const out='artifacts/interior-layout-tool';fs.mkdirSync(out,{recursive:true});
transpileQaModule('src/naval/interior-layout.ts',`${out}/interior-layout.mjs`);
transpileQaModule('src/naval/generated/fleet-external.ts',`${out}/generated/fleet-external.mjs`);
const {buildInteriorLayout,inspectInteriorHull}=await import(`../${out}/interior-layout.mjs`);
const {externalFleet}=await import(`../${out}/generated/fleet-external.mjs`);
const report={};
for(const [kind,source] of Object.entries(externalFleet)){
 const started=performance.now(),layout=buildInteriorLayout(kind,source),hull=inspectInteriorHull(source);
 let sampledVertices=0,interiorTriangles=0,sourceOverlaps=0;
 for(const part of layout.parts)for(const [lod,g] of [['high',part.high],['low',part.low]]){
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),interior=g.getAttribute('aInterior'),surface=g.getAttribute('aSurface'),tile=g.getAttribute('aSourceTile');
  assert.equal(p.count,n.count);assert.equal(p.count,g.getAttribute('uv').count);
  for(let i=0;i<p.count;i++){
   assert.equal(interior.getX(i),1);assert.equal(surface.getX(i),7);assert.equal(tile.getX(i),-1);
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),bridge=part.id.includes("-interior-bridge-"),section=bridge?hull.superSection(y,z).find(([a,b])=>x>a&&x<b):hull.section(y,z);
   assert.ok(section,`${kind}/${part.id}/${lod}: missing real shell section at ${y},${z}`);
   assert.ok(x>=section[0]+.001&&x<=section[1]-.001,`${kind}/${part.id}/${lod}: source shell escape`);
   assert.ok((bridge?y>hull.deckHeight+.004&&y<hull.bridgeBounds.max.y-.002:y<hull.deckHeight-.005&&y>hull.bounds.min.y),`${kind}: floating or bottom escape`);sampledVertices++;
  }
  for(let i=0;i<p.count;i+=3){
   const triangle=new THREE.Triangle(...[i,i+1,i+2].map(j=>new THREE.Vector3().fromBufferAttribute(p,j)));
   const center=triangle.getMidpoint(new THREE.Vector3()),section=part.id.includes("-interior-bridge-")?hull.superSection(center.y,center.z).find(([a,b])=>center.x>a&&center.x<b):hull.section(center.y,center.z);
   assert.ok(section&&center.x>section[0]&&center.x<section[1]);
   const bounds=new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c]);
   // A source face intersecting the triangle's bounding box is conservatively
   // rejected by the factory; verify the same independently after Float32 packing.
   if(hull.sourceIntersection(bounds))sourceOverlaps++;interiorTriangles++;
  }
  g.dispose();
 }
 assert.equal(sourceOverlaps,0,`${kind}: original source part intersections`);
 assert.ok(layout.diagnostics.highTriangles<=20000,`${kind}: HIGH interior budget`);
 assert.ok(layout.diagnostics.lowTriangles<=3000,`${kind}: LOW interior budget`);
 assert.equal(layout.diagnostics.occupiedBays,layout.diagnostics.bayCount,`${kind}: ship-wide coverage`);
 assert.ok(layout.diagnostics.longitudinalCoverage>.80,`${kind}: floor coverage`);
 report[kind]={...layout.diagnostics,sampledVertices,interiorTriangles,sourceOverlaps,cpuMs:Math.round(performance.now()-started)};
}
fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
