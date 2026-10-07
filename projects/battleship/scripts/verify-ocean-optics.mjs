import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.argv[2]||'artifacts/sea-optics-gpu';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.route('**/ocean-optics-fixture',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas style="width:1280px;height:720px"></canvas></body>'}));await page.goto('http://127.0.0.1:5195/ocean-optics-fixture');
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),oceanPath='/src/naval/ocean.ts',passPath='/src/naval/water-refraction.ts',fleetPath='/src/naval/fleet.ts';
  const {createOcean}=await import(oceanPath),{createWaterRefraction}=await import(passPath),{buildFleetAssets,fleetGeometry}=await import(fleetPath);
  const canvas=document.querySelector('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setSize(1280,720,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(46,1280/720,.05,1300),light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-3,5,-4);scene.add(light,new THREE.HemisphereLight(0xbde2ed,0x0c2734,2));
  const sea=createOcean(scene),pass=createWaterRefraction(renderer),assets=buildFleetAssets();
  const material=new THREE.MeshStandardMaterial({color:0x9ca8a8,vertexColors:true,roughness:.85,metalness:.02,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(fleetGeometry(assets.destroyer,[],false),material);scene.add(mesh);mesh.geometry.computeBoundingBox();
  const image=()=>canvas.toDataURL(),draw=(enabled=true)=>{scene.updateMatrixWorld();sea.followCamera(camera);sea.setRefraction(enabled?pass.capture(scene,camera,[{mesh}]):null,camera);renderer.render(scene,camera);};
  camera.position.set(2.2,.7,2.8);camera.lookAt(0,.08,0);draw(false);const opaque=image();draw(true);const transmitting=image(),near=pass.diagnostics();
  const context=renderer.getContext(),pixels=()=>{const a=new Uint8Array(1280*720*4);context.readPixels(0,0,1280,720,context.RGBA,context.UNSIGNED_BYTE,a);return a;};
  draw(false);const before=pixels();draw(true);const after=pixels();let changed=0,totalDelta=0;for(let i=0;i<before.length;i+=4){const delta=Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2]);if(delta>3)changed++;totalDelta+=delta;}
  // No coplanar fog/tile sheets: ocean alone remains temporally stable at map range.
  scene.remove(mesh);camera.position.set(110,150,150);camera.lookAt(0,0,0);sea.uniforms.uTime.value=3;draw(true);const farA=pixels(),farImage=image(),far=pass.diagnostics();sea.uniforms.uTime.value=3.016;draw(true);const farB=pixels();let maxDelta=0,largeChanges=0;for(let i=0;i<farA.length;i+=4){const delta=Math.max(Math.abs(farA[i]-farB[i]),Math.abs(farA[i+1]-farB[i+1]),Math.abs(farA[i+2]-farB[i+2]));maxDelta=Math.max(maxDelta,delta);if(delta>25)largeChanges++;}
  const fullPixels=1280*720;pass.dispose();sea.dispose();mesh.geometry.dispose();material.dispose();renderer.dispose();return{images:{opaque,transmitting,far:farImage},near,far,submergedChangePixels:changed,submergedMeanDelta:totalDelta/fullPixels/3,farMaxFrameDelta:maxDelta,farLargeChangeFraction:largeChanges/fullPixels,geometryBounds:mesh.geometry.boundingBox?{min:mesh.geometry.boundingBox.min.toArray(),max:mesh.geometry.boundingBox.max.toArray()}:null};
 });
 assert.deepEqual(errors,[]);assert.equal(result.near.enabled,true);assert.ok(result.submergedChangePixels>100,'Submerged hull must actually transmit through water');assert.equal(result.far.enabled,false);assert.ok(result.farLargeChangeFraction<.001,'Large far-field strobe changes');
 for(const [name,data]of Object.entries(result.images))await writeFile(`${out}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));delete result.images;await writeFile(`${out}/report.json`,JSON.stringify({errors,...result},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
