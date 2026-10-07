import {expect,test} from '@playwright/test';

test('a detached Liberty foundation supports the remaining model and falls last',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/?qa=1');
  await page.waitForFunction(()=>Boolean((window as any).__SCREW_HARBOR__));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  const fixture=await page.evaluate(()=>{
    const qa=(window as any).__SCREW_HARBOR__;
    qa.loadStage(13);
    window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true);
    const parts=qa.getStructure().parts,foundation=parts.find((p:any)=>p.isFoundation);
    const ids=qa.getPuzzle().screws.filter((s:any)=>s.partId===foundation.id).map((s:any)=>s.id);
    // Retain one distant part so the support rule can be exercised without
    // replaying 478 clicks; the real-input bot separately drives the full level.
    parts.forEach((p:any)=>{if(!p.isFoundation)p.group.visible=false;});
    const retained=parts.find((p:any)=>{
      if(p.isFoundation)return false;
      p.group.visible=true;
      const clear=ids.every((id:string)=>!qa.getExtractionBlocker(id));
      if(!clear)p.group.visible=false;
      return clear;
    });
    if(!retained)throw Error('No nonblocking supported part');
    return {id:foundation.id,ids,retained:retained.id,position:foundation.group.position.toArray(),quaternion:foundation.group.quaternion.toArray(),last:parts.at(-1).id};
  });
  expect(fixture.last).toBe(fixture.id);
  expect(fixture.ids).toHaveLength(2);
  const before=await page.evaluate(f=>{
    const qa=(window as any).__SCREW_HARBOR__;
    f.ids.forEach((id:string)=>qa.removeScrew(id));
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(120);
    const part=qa.getStructure().parts.find((p:any)=>p.id===f.id);
    return {pending:qa.getDiagnostics().foundation.pending,position:part.group.position.toArray(),quaternion:part.group.quaternion.toArray(),visible:part.group.visible,bodies:qa.getDiagnostics().physics.bodies,moves:qa.getPuzzle().moves};
  },fixture);
  expect(before).toEqual({pending:[fixture.id],position:fixture.position,quaternion:fixture.quaternion,visible:true,bodies:1,moves:2});
  const after=await page.evaluate(f=>{
    const qa=(window as any).__SCREW_HARBOR__;
    qa.getStructure().parts.find((p:any)=>p.id===f.retained).group.visible=false;
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(1);
    const started=qa.getDiagnostics().physics.bodies;
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(20);
    const visible=qa.getStructure().parts.find((p:any)=>p.id===f.id).group.visible;
    const bodies=qa.getDiagnostics().physics.bodies;
    qa.loadStage(13);
    return {started,visible,bodies,restart:qa.getDiagnostics().remaining,pending:qa.getDiagnostics().foundation.pending};
  },fixture);
  expect(after).toEqual({started:2,visible:false,bodies:1,restart:480,pending:[]});
});

test('PBR maps load and zoom gestures reach the new close-up range',async({page,isMobile})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?qa=1');
  await page.waitForFunction(()=>(window as any).__SCREW_HARBOR__?.getDiagnostics().materials.ready);
  // Close-up distance remains available in empty space; intact walls must stop
  // the camera before the model center, verified separately below.
  await page.evaluate(()=>(window as any).__SCREW_HARBOR__.setCameraPose([0,30,30],[0,30,29]));
  await page.locator('canvas').hover();
  if(isMobile){
    const bounds=(await page.locator('canvas').boundingBox())!,x=bounds.x+bounds.width*.5,y=bounds.y+bounds.height*.5;
    const cdp=await page.context().newCDPSession(page);
    for(let i=0;i<4;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-20,y,id:1},{x:x+20,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-120,y,id:1},{x:x+120,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await cdp.detach();
  }else{
    for(let i=0;i<3;i++)await page.mouse.wheel(0,-10000);
  }
  await expect.poll(()=>page.evaluate(()=>(window as any).__SCREW_HARBOR__.getDiagnostics().camera.distance)).toBeLessThan(.3);
  const zoom=await page.evaluate(()=>{
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(60);
    const qa=(window as any).__SCREW_HARBOR__,d=qa.getDiagnostics();
    return {camera:d.camera,moves:d.moves,materials:d.materials,radius:qa.getStructure().radius};
  });
  expect(zoom.camera.distance).toBeLessThan(zoom.radius*.07);
  expect(zoom.camera.distance).toBeGreaterThanOrEqual(zoom.camera.minDistance-.001);
  expect(zoom.moves).toBe(0);
  expect(zoom.materials).toEqual({ready:true,failed:false,maps:3});
  expect(errors).toEqual([]);
});

test('extreme zoom stops outside intact exterior walls',async({page,isMobile})=>{
  await page.goto('/?qa=1');
  await page.waitForFunction(()=>(window as any).__SCREW_HARBOR__?.getDiagnostics().materials.ready);
  const initialCamera=await page.evaluate(()=>(window as any).__SCREW_HARBOR__.getDiagnostics().camera);
  const initial=initialCamera.distance;
  await page.locator('canvas').hover();
  if(isMobile){
    const bounds=(await page.locator('canvas').boundingBox())!,x=bounds.x+bounds.width*.5,y=bounds.y+bounds.height*.5;
    const cdp=await page.context().newCDPSession(page);
    for(let i=0;i<5;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-20,y,id:1},{x:x+20,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-120,y,id:1},{x:x+120,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await cdp.detach();
  }else for(let i=0;i<5;i++)await page.mouse.wheel(0,-10000);
  const result=await page.evaluate(()=>{
    const qa=(window as any).__SCREW_HARBOR__;
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(60);
    const d=qa.getDiagnostics();
    return {camera:d.camera,moves:d.moves};
  });
  // The outer bounding box includes open space below roof overhangs. The guard
  // must reach the real surface while preventing a jump to the room's center.
  expect(result.camera.distance).toBeLessThan(initial);
  expect(result.camera.distance).toBeGreaterThan(result.camera.minDistance+1);
  expect(result.moves).toBe(0);
  await page.locator('#restart').click();
  const reset=await page.evaluate(()=>{
    window.__THREE_GAME_TEST_HOOKS__!.advanceFrames(60);
    return (window as any).__SCREW_HARBOR__.getDiagnostics().camera;
  });
  for(let i=0;i<3;i++){
    expect(reset.position[i]).toBeCloseTo(initialCamera.position[i],5);
    expect(reset.target[i]).toBeCloseTo(initialCamera.target[i],5);
  }
});
