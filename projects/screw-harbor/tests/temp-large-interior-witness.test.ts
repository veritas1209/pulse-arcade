import { test, expect } from '@playwright/test';
import { buildStructure, Kit } from '../src/structures';
import { buildStarDestroyer, buildEnterprise } from '../src/large-ships';
import * as THREE from 'three';

test('spacecraft interior fittings stay inside the thick shell envelopes',()=>{
  for(const build of [buildStarDestroyer,buildEnterprise]) {
    const kit=new Kit();build(kit);kit.root.updateMatrixWorld(true);
    const bad=new Set<string>();
    for(const part of kit.parts.filter(p=>p.id.includes('-interior-')))part.group.traverse((object:any)=>{
      if(!object.isMesh)return;const pos=object.geometry.getAttribute('position');
      for(let i=0;i<pos.count;i++) {
        const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(object.matrixWorld);
        if(build===buildStarDestroyer) {
          const f=Math.abs(v.x)/(.15+(v.z+23)/40*12.3),lower=-.35-(1-f)*1.2+.2,upper=1.1+(1-f)*(1.1+(v.z+23)*.022)-.2;
          if(v.y<lower-.035||v.y>upper+.035)bad.add(part.id);
        } else if(part.id.includes('saucer')||part.id.includes('rim-utility')) {
          const r=Math.hypot(v.x,v.z+11),ring=r<3.8?0:r<6.3?1:2;
          const lower=6.4-.25-(2-ring)*.18,upper=6.4+.13+(2-ring)*.25;
          if(v.y<lower-.035||v.y>upper+.035)bad.add(part.id);
        } else {
          const radius=1.65+(v.z+2.5)/16.8*.42-.2;
          for(let q=0;q<8;q++){const t=(q+.5)*Math.PI/4;if(v.x*Math.cos(t)+v.y*Math.sin(t)>radius*Math.cos(Math.PI/8)+.035)bad.add(part.id);}
        }
      }
    });
    expect([...bad],build.name).toEqual([]);
  }
});

test('five large ship interiors preserve real fastener witnesses and target counts', () => {
  test.setTimeout(240_000);
  for (const [stage, screws] of [[12,600],[16,640],[17,800],[18,560],[19,720]]) {
    const started=Date.now();
    const model=buildStructure(stage);
    expect(model.parts.length*2).toBe(screws);
    expect(model.root.userData.screwCount).toBe(screws);
    expect(new Set(model.root.userData.witnessPartIds).size).toBe(model.parts.length);
    for(const part of model.parts) {
      expect(part.screws).toHaveLength(2);
      for(const screw of part.screws) expect(screw.position.every(Number.isFinite)).toBe(true);
    }
    console.log(JSON.stringify({stage,parts:model.parts.length,screws,interior:model.parts.filter(p=>p.id.includes('-interior-')).length,witnesses:model.root.userData.witnessPartIds.length,milliseconds:Date.now()-started}));
    model.root.traverse((object:any)=>{if(object.isMesh)object.geometry.dispose();});
  }
});
