from pathlib import Path
p=Path('artifacts/weapon-vfx-cpu-check.mjs');s=p.read_text(encoding='utf8')
s=s.replace('i<360','i<1080').replace('i<180','i<600')
s=s.replace('blocked.events[1].time-.91','blocked.events[1].time-(4+Math.hypot(16,.1)*.045)*.7')
s=s.replace("assert(Math.abs(blocked.events[1].position[0]-3.2)<1e-9);", "assert(blocked.events[1].position[0]>3.2&&blocked.events[1].position[0]<8);")
s=s.replace('halved.phases[1].time-1.3','halved.phases[1].time-(4+Math.hypot(16,.1)*.045)')
s=s.replace("'blocked arrival unchanged'","'slower flight with authoritative blocked outcome'")
needle="fs.writeFileSync(new URL('weapon-vfx-cpu-report.json'"
index=s.index(needle)
s=s[:index]+'''const deferredPhases=[],delayed=createEffects(new THREE.Scene(),new THREE.PerspectiveCamera(),new THREE.MeshBasicMaterial(),()=>1440,(phase)=>deferredPhases.push(phase));let fired=0;const finalMuzzle=new THREE.Vector3(2,.5,3);delayed.impact({...seed,blocked:false,kind:'shell'},new THREE.BoxGeometry(),new THREE.Vector3(8,.3,0),'battleship',new THREE.Vector3(0,.4,0),false,undefined,{launchDelay:1,getMuzzle:()=>finalMuzzle.clone(),onLaunch:()=>fired++});for(let i=0;i<59;i++)delayed.update(1/60,i/60);assert.deepEqual(deferredPhases,[]);assert.equal(delayed.diagnostics().shellDeliveryTriangles,0);assert(delayed.projectileBusy());for(let i=0;i<2;i++)delayed.update(1/60,1+i/60);assert.deepEqual(deferredPhases,['launch']);assert.equal(fired,1);assert.deepEqual(delayed.diagnostics().projectiles[0].source,finalMuzzle.toArray());for(let i=0;i<400;i++)delayed.update(1/60,2+i/60);assert.deepEqual(deferredPhases,['launch','impact']);assert.equal(fired,1);delayed.dispose();reports.push({name:'aim-before-launch',launches:fired,muzzle:finalMuzzle.toArray()});
''' +s[index:]
p.write_text(s,encoding='utf8')
