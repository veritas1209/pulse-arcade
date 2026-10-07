import {test,expect} from '@playwright/test';
test('held WASD preserves camera and pivot height at the world limit and sloping obstacle',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{
  const threePath='/node_modules/.vite/deps/three.js',controlPath='/node_modules/three/examples/jsm/controls/OrbitControls.js',navPath='/src/naval/navigation.ts',guardPath='/src/naval/camera.ts';const THREE=await import(threePath),{OrbitControls}=await import(controlPath),{installModelNavigation}=await import(navPath),{guardNavalCamera}=await import(guardPath);
  // Isolated input fixture with actual browser key events; no extra WebGL context.
  const canvas=document.createElement('canvas');canvas.id='game-canvas';document.body.append(canvas);const camera=new THREE.PerspectiveCamera(46,16/9,.02,500);camera.position.set(2,6,2);const controls=new OrbitControls(camera,canvas);controls.target.set(0,1,0);controls.update();let active=false;
  const obstacle=new THREE.Mesh(new THREE.BoxGeometry(2,12,2),new THREE.MeshBasicMaterial());obstacle.position.set(4.5,6,-.5);obstacle.rotation.z=.2;
  const guard=guardNavalCamera(camera,controls,()=>[obstacle],{sea:.3,horizontalPanActive:()=>active}),nav=installModelNavigation(camera,controls,canvas,2.5,undefined,{center:new THREE.Vector3(),maxDistance:10},(a:boolean)=>{active=a;});
  const before={position:camera.position.toArray(),target:controls.target.toArray()};window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));let maxY=0,maxTargetY=0;
  for(let i=0;i<2000;i++){nav.update(.016);guard.update();maxY=Math.max(maxY,Math.abs(camera.position.y-before.position[1]));maxTargetY=Math.max(maxTargetY,Math.abs(controls.target.y-before.target[1]));}
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD',bubbles:true}));const after={position:camera.position.toArray(),target:controls.target.toArray(),distance:camera.position.length()};nav.dispose();guard.dispose();controls.dispose();canvas.remove();obstacle.geometry.dispose();obstacle.material.dispose();return{before,after,maxY,maxTargetY,collisions:guard.diagnostics().collisions};
 });
 expect(result.collisions).toBeGreaterThan(0);expect(result.maxY).toBeLessThan(1e-8);expect(result.maxTargetY).toBeLessThan(1e-8);expect(result.after.distance).toBeCloseTo(10,7);expect(Math.hypot(result.after.position[0]-result.before.position[0],result.after.position[2]-result.before.position[2])).toBeGreaterThan(5);
});
