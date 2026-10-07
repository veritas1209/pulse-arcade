import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const out='artifacts/aircraft-tool';fs.mkdirSync(`${out}/generated`,{recursive:true});
for(const name of ['aviation','generated/f18-external']){const code=ts.transpileModule(fs.readFileSync(`src/naval/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p}.mjs'`);fs.writeFileSync(`${out}/${name}.mjs`,code);}
const {buildSuperHornet}=await import('../artifacts/aircraft-tool/aviation.mjs');
const report=[];for(const [parked,low] of [[false,false],[true,false],[false,true]])for(const length of [.5,2.8]){const g=buildSuperHornet({parked,low,length});g.computeBoundingBox();const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color'),b=g.boundingBox;assert.ok(Math.abs(b.max.z-b.min.z-length)<1e-5);assert.ok(p.count>1000&&p.count<100000);assert.ok(p.count%3===0);for(let i=0;i<p.count;i++){for(const v of [p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),c.getX(i),c.getY(i),c.getZ(i)])assert.ok(Number.isFinite(v));assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);}report.push({parked,low,length,triangles:p.count/3,span:b.max.x-b.min.x,height:b.max.y-b.min.y,source:g.userData.source});g.dispose();}
fs.writeFileSync('artifacts/imported/f18/geometry-qa.json',JSON.stringify({finite:true,unitNormals:true,uniformScale:true,report},null,2));console.log(JSON.stringify({finite:true,unitNormals:true,uniformScale:true,report}));
