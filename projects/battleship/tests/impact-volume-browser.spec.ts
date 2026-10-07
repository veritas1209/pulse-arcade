import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test('impact pyro has solid changing smoke volume without flame cards, and clears its bounded pool',async({page})=>{
 test.setTimeout(100000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/pyro-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>'}));await page.goto('/pyro-fixture');
 const result=await page.evaluate(async()=>{
  const path='/src/scene.ts',{createNavalScene}=await import(/* @vite-ignore */path),canvas=document.querySelector('canvas')!;let time=0;
  const scene=createNavalScene(canvas,()=>{});for(let i=0;i<600&&!scene.diagnostics().texturesReady;i++)await new Promise(r=>setTimeout(r,25));
  const source={id:'source',kind:'destroyer',team:0,x:14,z:14,heading:0,hp:500,maxHp:500,ap:4,maxAp:4,sunk:false},victim={id:'victim',kind:'battleship',team:0,x:16,z:14,heading:0,hp:800,maxHp:800,ap:4,maxAp:4,sunk:false};
  const base={you:0,turn:0,own:[source,victim],revealed:[],islands:[],visibleCells:[],recon:[]},tick=()=>{time+=.025;scene.update(.025,time);};scene.setState(base);for(let i=0;i<20;i++)tick();
  scene.impact({x:16,z:14,by:1,sequence:971,kind:'missile',source:{x:14,z:14},hit:true,damage:100,blocked:false,halved:false,shipId:'victim',targetBefore:victim},{...victim,hp:700});
  const captures:any[]=[],impactRenderMs:number[]=[],baselineRenderMs:number[]=[];let impactAt=-1;const ages=[.075,.2,.4,.7,1.1,1.6];
  for(let i=0;i<800;i++){tick();const d=scene.diagnostics();if(impactAt<0&&d.impactVolume.active>0)impactAt=time;if(impactAt>=0&&captures.length<ages.length&&time-impactAt>=ages[captures.length]!){scene.render();captures.push({age:time-impactAt,data:canvas.toDataURL(),diagnostics:scene.diagnostics()});if(captures.length===3){const gl=canvas.getContext('webgl2')!;for(let n=0;n<16;n++){const start=performance.now();scene.render();gl.finish();impactRenderMs.push(performance.now()-start);}}}if(captures.length===ages.length)break;}
  for(let i=0;i<200;i++)tick();const expired=scene.diagnostics().impactVolume;scene.clearEffects();const cleared=scene.diagnostics().impactVolume;const gl=canvas.getContext('webgl2')!;for(let n=0;n<16;n++){const start=performance.now();scene.render();gl.finish();baselineRenderMs.push(performance.now()-start);}scene.dispose();return {captures,expired,cleared,impactRenderMs,baselineRenderMs};
 });
 expect(errors).toEqual([]);expect(result.captures).toHaveLength(6);expect(result.captures.every(c=>c.diagnostics.impactVolume.active===(c.age<1.5?1:0)&&c.diagnostics.impactFlipbook.active===0)).toBe(true);expect(result.expired.active).toBe(0);expect(result.cleared.active).toBe(0);
 await mkdir('artifacts/impact-volume',{recursive:true});for(const c of result.captures)await writeFile(`artifacts/impact-volume/impact-${c.age.toFixed(2)}.png`,Buffer.from(c.data.split(',')[1],'base64'));await writeFile('artifacts/impact-volume/report.json',JSON.stringify({errors,...result,captures:result.captures.map(({data,...c})=>c)},null,2));
});

test('close camera inside the pressure cloud still renders its density',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/inside-pyro-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><canvas width="512" height="512"></canvas>'}));await page.goto('/inside-pyro-fixture');
 const result=await page.evaluate(async()=>{
  const threePath='/node_modules/.vite/deps/three.js',pyroPath='/src/naval/impact-volume.ts',THREE=await import(/* @vite-ignore */threePath),{createImpactVolumes}=await import(/* @vite-ignore */pyroPath);
  const canvas=document.querySelector('canvas')!,renderer=new THREE.WebGLRenderer({canvas,preserveDrawingBuffer:true}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(46,1,.01,100);scene.background=new THREE.Color(0x5588bb);camera.position.set(.1,.6,.1);camera.lookAt(1,.6,.1);
  const data=new Uint8Array(32**3);for(let i=0;i<data.length;i++)data[i]=(Math.sin(i*127.1+311.7)*43758.54%1+1)%1*255;const noise=new THREE.Data3DTexture(data,32,32,32);noise.format=THREE.RedFormat;noise.minFilter=noise.magFilter=THREE.LinearFilter;noise.wrapS=noise.wrapT=noise.wrapR=THREE.RepeatWrapping;noise.needsUpdate=true;
  const pyro=createImpactVolumes(scene,camera,noise),gl=renderer.getContext(),read=()=>{const pixels=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};renderer.render(scene,camera);const before=read();pyro.begin(new THREE.Vector3(),.95,0,975,new THREE.Vector3(0,0,1));pyro.update(.4);renderer.render(scene,camera);const after=read();let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2])>30)changed++;const calls=renderer.info.render.calls,image=canvas.toDataURL();pyro.dispose();noise.dispose();renderer.dispose();return {changed,calls,image};
 });
 expect(errors).toEqual([]);expect(result.changed).toBeGreaterThan(512*512*.2);expect(result.calls).toBe(1);await mkdir('artifacts/impact-volume',{recursive:true});await writeFile('artifacts/impact-volume/inside.png',Buffer.from(result.image.split(',')[1],'base64'));await writeFile('artifacts/impact-volume/inside.json',JSON.stringify({errors,changedPixels:result.changed,calls:result.calls},null,2));
});
