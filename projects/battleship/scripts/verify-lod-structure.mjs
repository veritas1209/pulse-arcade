import fs from 'node:fs';
import assert from 'node:assert/strict';
const text=fs.readFileSync('src/naval/generated/fleet-external.ts','utf8');
const fleet=JSON.parse(text.slice(text.indexOf(' = ')+3).trim().replace(/;$/,''));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function inspect(ship,variant){
 const b=Buffer.from(ship[variant],'base64'),stride=ship.stride??14,parts=ship.parts.map(()=>({area:0,triangles:0,degenerate:0,inverted:0,zeroNormals:0}));
 assert.equal(b.length%(stride*3),0);
 for(let at=0;at<b.length;at+=stride*3){
  const points=[],normals=[],part=b.readUInt16LE(at+12);assert.ok(part<parts.length);const out=parts[part];out.triangles++;
  for(let j=0;j<3;j++){const q=at+j*stride;assert.equal(b.readUInt16LE(q+12),part);points.push([0,2,4].map(n=>b.readInt16LE(q+n)/8192));normals.push([6,7,8].map(n=>b.readInt8(q+n)/127));if(!Math.hypot(...normals[j]))out.zeroNormals++;if(stride>=24){assert.ok(Number.isFinite(b.readFloatLE(q+14)));assert.ok(Number.isFinite(b.readFloatLE(q+18)));}}
  const face=cross(points[1].map((n,i)=>n-points[0][i]),points[2].map((n,i)=>n-points[0][i])),area=Math.hypot(...face)/2;out.area+=area;
  if(area<1e-12)out.degenerate++;else if(face.reduce((s,n,i)=>s+n*(normals[0][i]+normals[1][i]+normals[2][i]),0)<-area*.2)out.inverted++;
 }
 return {triangles:b.length/(stride*3),parts};
}
const report=[],failures=[];
for(const [kind,ship]of Object.entries(fleet)){
 for(const variant of ship.medium?['medium','low']:['low']){
 const high=inspect(ship,'high'),low=inspect(ship,variant),structural=[];
 assert.ok(high.triangles<5000?low.triangles<=high.triangles:low.triangles<high.triangles*.85,`${kind} must retain a real reduced LOD`);
 for(let i=0;i<ship.parts.length;i++){
  const h=high.parts[i],l=low.parts[i],part=ship.parts[i];assert.equal(l.zeroNormals,0,`${kind}/${part.id}: zero normal`);
  const extent=Math.max(...part.bounds[1].map((n,j)=>n-part.bounds[0][j]));
  if(l.degenerate>h.degenerate)failures.push(`${kind}/${part.id}: new degenerate faces ${l.degenerate-h.degenerate}`);
  if(l.inverted>h.inverted)failures.push(`${kind}/${part.id}: new opposing face/vertex normals ${l.inverted-h.inverted}`);
  if(h.area>.1||extent>=ship.span*.3){
   const coverage=l.area/h.area;structural.push({id:part.id,high:h,low:l,coverage});
   if(coverage<.9)failures.push(`${kind}/${part.id}: structural surface coverage ${(coverage*100).toFixed(1)}% <90%`);
  }
 }
 report.push({kind,variant,highTriangles:high.triangles,lowTriangles:low.triangles,structural});
 }}
fs.mkdirSync('artifacts/lod-structure',{recursive:true});fs.writeFileSync('artifacts/lod-structure/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({ships:report.map(({kind,variant,highTriangles,lowTriangles})=>({kind,variant,highTriangles,lowTriangles})),failures},null,2));
assert.deepEqual(failures,[], 'LOW must preserve structural coverage and source normal/winding quality');
