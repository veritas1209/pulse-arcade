import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {transpileQaModule} from './transpile-qa-modules.mjs';
const out='artifacts/carrier-uv-tool';fs.mkdirSync(out,{recursive:true});transpileQaModule('src/naval/fracture.ts',`${out}/fracture.mjs`);
const {fractureHull}=await import('../artifacts/carrier-uv-tool/fracture.mjs');
const source=new THREE.BoxGeometry(1,1,4).toNonIndexed(),p=source.getAttribute('position'),uv=[],tile=[],surface=[],colors=[];
for(let i=0;i<p.count;i++){uv.push(p.getX(i)*.2+.5,p.getZ(i)*.1+.5);tile.push(3);surface.push(-1);colors.push(.5,.5,.5);}
source.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));source.setAttribute('aSourceTile',new THREE.Float32BufferAttribute(tile,1));source.setAttribute('aSurface',new THREE.Float32BufferAttribute(surface,1));source.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
const chunks=fractureHull(source,0,1);let checked=0;
for(const chunk of chunks)for(const g of [chunk.geometry,chunk.lowGeometry]){const p=g.getAttribute('position'),uv=g.getAttribute('uv'),tile=g.getAttribute('aSourceTile');assert.equal(tile.count,p.count);for(let i=0;i<p.count;i++){assert.ok(tile.getX(i)===3||tile.getX(i)===-1);if(tile.getX(i)<0)continue;assert.ok(Math.abs(uv.getX(i)-((p.getX(i)+chunk.center.x)*.2+.5))<1e-6);assert.ok(Math.abs(uv.getY(i)-((p.getZ(i)+chunk.center.z)*.1+.5))<1e-6);checked++;}}
console.log(JSON.stringify({passed:true,checked,highAndLow:true,interpolatedUv:true,sourceTile:true}));
