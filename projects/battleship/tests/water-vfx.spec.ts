import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createSinkingWater} from '../src/naval/sinking-water';

test('sinking water rises, returns to water, leaves foam and expires without retaining draws',()=>{
 const scene=new THREE.Scene(),water=createSinkingWater(scene);
 water.begin(new THREE.Vector3(0,10,0),3.6,Math.PI/2,.45,123,0);
 let maxSpray=0,maxReturns=0;
 for(let frame=1;frame<=600;frame++){
  water.update(frame/60);const d=water.diagnostics().sinkingWater;
  maxSpray=Math.max(maxSpray,d.spray);maxReturns=Math.max(maxReturns,d.waterReturns);
  expect(d.triangles).toBeLessThanOrEqual(d.capacity*2);expect(d.calls).toBeLessThanOrEqual(1);
  if(frame===420){expect(d.spray).toBeLessThan(5);expect(d.foam).toBeGreaterThan(0);}
 }
 expect(maxSpray).toBeGreaterThan(50);expect(maxReturns).toBeGreaterThan(150);
 expect(water.diagnostics().sinkingWater).toMatchObject({sources:0,spray:0,foam:0,calls:0});
 water.dispose();expect(scene.children).toHaveLength(0);
});

test('simultaneous sinks retain one bounded shared mesh; reset cannot replay old sprays',()=>{
 const scene=new THREE.Scene(),water=createSinkingWater(scene);
 for(let i=0;i<12;i++)water.begin(new THREE.Vector3(i*5,0,0),4,0,.5,i*31,0);
 for(let frame=1;frame<300;frame++){water.update(frame/60);const d=water.diagnostics().sinkingWater;expect(d.spray+d.foam).toBeLessThanOrEqual(640);expect(d.sources).toBeLessThanOrEqual(8);}
 expect(scene.children).toHaveLength(1);water.clear();water.update(10);
 expect(water.diagnostics().sinkingWater).toMatchObject({sources:0,spray:0,foam:0,emitted:0,waterReturns:0});water.dispose();
});
