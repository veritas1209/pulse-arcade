import {test,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {torpedoImpactMark} from '../src/rules';

test('torpedo damage sectors follow approach and hull heading with Python parity',()=>{
 const cases=['carrier','destroyer','battleship'].flatMap(kind=>[0,Math.PI/4,Math.PI/2,Math.PI].flatMap(heading=>[[-1,0],[1,0],[0,1],[1,1]].map(([dx,dz])=>({victim:{kind,heading,x:10,z:10},approach:{x:10+dx,z:10+dz}}))));
 const expected=cases.map(c=>torpedoImpactMark(c.victim as any,c.approach));
 expect(expected.every(p=>Math.abs(Math.max(Math.abs(p.x),Math.abs(p.z))-.88)<1e-9)).toBe(true);
 const result=spawnSync('C:/Users/hajin/AppData/Local/Programs/Python/Python312/python.exe',['-c',"import sys,json;sys.path.insert(0,'server');from battleship_rooms import torpedo_impact_mark;print(json.dumps([torpedo_impact_mark(c['victim'],c['approach']) for c in json.load(sys.stdin)]))"],{input:JSON.stringify(cases),encoding:'utf8'});expect(result.status).toBe(0);const actual=JSON.parse(result.stdout);for(let i=0;i<expected.length;i++){expect(actual[i].x).toBeCloseTo(expected[i].x,12);expect(actual[i].z).toBeCloseTo(expected[i].z,12);}
});

test('a torpedo cuts the physical contact wall, not a random upper-deck crater',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/torpedo-breach',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas style="width:100vw;height:100vh"></canvas></body>'}));await page.goto('/torpedo-breach');
 const result=await page.evaluate(async()=>{
  const scenePath='/src/scene.ts',threePath='/node_modules/three/build/three.module.js';const {createNavalScene}=await import(scenePath),T=await import(threePath);let time=1;const canvas=document.querySelector('canvas')!,scene=createNavalScene(canvas,()=>{}),tick=()=>{time+=.05;scene.update(.05,time);};
  const source={id:'source',kind:'destroyer',team:0,x:14,z:14,heading:0,hp:500,maxHp:500,ap:4,maxAp:4,sunk:false},victim={id:'victim',kind:'battleship',team:1,x:16,z:14,heading:Math.PI/4,hp:800,maxHp:800,ap:4,maxAp:4,sunk:false,damageMarks:[]};const base={you:0,turn:0,own:[source],revealed:[victim],islands:[],visibleCells:[],recon:[]};scene.setState(base);
  for(let i=0;i<600&&!scene.diagnostics().texturesReady;i++)await new Promise(r=>setTimeout(r,25));for(let i=0;i<40;i++)tick();const original=scene.getFleetGeometry(victim,false);
  const mark={x:-.4,z:.45,seed:918},after={...victim,hp:500,damageMarks:[mark]};scene.impact({x:16,z:14,by:0,sequence:918,kind:'torpedo',approachFrom:{x:15,z:14},source:{x:14,z:14},hit:true,damage:300,blocked:false,halved:false,localHit:mark,targetBefore:victim,targetAfter:after,shipId:victim.id},after);scene.setState({...base,revealed:[after]});
  let impactBlast:any;for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,15));tick();const d=scene.diagnostics();impactBlast??=d.impactBlasts.at(-1);if(d.damagePreparation.pending===0&&d.damagePreparation.queued.length===0&&impactBlast)break;}
  const d=scene.diagnostics(),resolved=d.damageMarks.victim.at(-1),size=scene.getFleetAssets().battleship.fittedSize,contact=new T.Vector3(resolved.x*size[0]/2,resolved.y,resolved.z*size[2]/2),normal=new T.Vector3(...resolved.normal),damaged=scene.getFleetGeometry(after,false),material=new T.MeshBasicMaterial({side:T.DoubleSide}),ray=new T.Raycaster(contact.clone().addScaledVector(normal,.3),normal.clone().negate(),0,.8);
  const beforeDistance=ray.intersectObject(new T.Mesh(original,material))[0]?.distance??1,afterDistance=ray.intersectObject(new T.Mesh(damaged,material))[0]?.distance??1;
  scene.render();const image=canvas.toDataURL();original.dispose();damaged.dispose();material.dispose();scene.dispose();return{resolved,beforeDistance,afterDistance,blast:impactBlast,shipPosition:d.shipPositions.victim,heading:victim.heading,size,image};
 });
 expect(errors).toEqual([]);expect(result.resolved.y).toBeLessThan(.03);expect(result.resolved.normal).toHaveLength(3);expect(result.afterDistance-result.beforeDistance).toBeGreaterThan(.02);
 const m=result.resolved,yaw=result.heading+Math.PI,c=Math.cos(yaw),s=Math.sin(yaw),x=m.x*result.size[0]/2,z=m.z*result.size[2]/2;const expected=[result.shipPosition[0]+c*x+s*z,result.shipPosition[1]+m.y,result.shipPosition[2]-s*x+c*z];expect(Math.hypot(expected[0]-result.blast.position[0],expected[2]-result.blast.position[2])).toBeLessThan(.001);
 const {writeFile,mkdir}=await import('node:fs/promises');await mkdir('artifacts/lag-profile',{recursive:true});await writeFile('artifacts/lag-profile/torpedo-breach.png',Buffer.from(result.image.split(',')[1],'base64'));await writeFile('artifacts/lag-profile/torpedo-breach.json',JSON.stringify({...result,image:undefined},null,2));
});
