import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {fleetPresentationPose,projectedHullPixels,selectDetailedHulls} from '../src/naval/presentation-scale';
test('fleet framing fits fleet extents at a lower angle with mirrored team orientation',()=>{
 const c=new THREE.PerspectiveCamera(46,16/9,.02,5000),box=new THREE.Box3(new THREE.Vector3(-12,0,-12),new THREE.Vector3(12,1,12));
 const a=fleetPresentationPose(c,box,0),b=fleetPresentationPose(c,box,1),offset=a.position.clone().sub(a.target);
 expect(Math.asin(offset.y/offset.length())*180/Math.PI).toBeCloseTo(22,5);expect(a.distance).toBeGreaterThanOrEqual(18);expect(a.distance).toBeLessThan(35);
 expect(b.position.x-b.target.x).toBeCloseTo(-offset.x,6);expect(b.position.y-b.target.y).toBeCloseTo(offset.y,6);
 c.position.copy(a.position);c.lookAt(a.target);c.updateMatrixWorld();
 for(const x of [-12,12])for(const y of [0,1])for(const z of [-12,12]){const p=new THREE.Vector3(x,y,z).project(c);expect(Math.abs(p.x)).toBeLessThan(1);expect(Math.abs(p.y)).toBeLessThan(1);}
});
test('screen-size LOD prioritizes selected smaller hull and respects hysteresis and budget',()=>{
 const c=(id:string,pixels:number,triangles=100000)=>({id,pixels,triangles,selected:false,hovered:false,wasHigh:false,sunk:false});
 const candidates=[c('carrier',150),c('bb1',100),c('bb2',80),c('bb3',70),{...c('selected-dd',35),selected:true}];
 expect([...selectDetailedHulls(candidates)]).toEqual(['selected-dd','carrier','bb1','bb2']);
 expect([...selectDetailedHulls([{...c('retained',35),wasHigh:true},c('new',35),{...c('sunk',100),sunk:true}])]).toEqual(['retained']);
 expect([...selectDetailedHulls([c('heavy',100,610000),c('fits',90,100000)])]).toEqual(['fits']);
 const camera=new THREE.PerspectiveCamera(46,16/9,.02,5000);camera.position.set(0,3,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 expect(projectedHullPixels(camera,new THREE.Vector3(),1.82,1080)).toBeGreaterThan(100);expect(projectedHullPixels(camera,new THREE.Vector3(1000,0,0),1.82,1080)).toBe(0);
});
