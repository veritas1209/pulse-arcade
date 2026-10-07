import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {clearCameraAndTargetPosition,clearCameraPosition,CAMERA_CLEARANCE} from '../src/camera-clearance';

function wall(){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,4,.1),new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);return mesh;
}
test('camera sweep stops a jump through a closed room and can move away',()=>{
  const mesh=wall(),from=new THREE.Vector3(0,0,3);
  const stopped=clearCameraPosition(from,new THREE.Vector3(0,0,-3),[mesh]);
  expect(stopped.z).toBeGreaterThan(.05+CAMERA_CLEARANCE);
  expect(stopped.z).toBeLessThan(.18);
  expect(clearCameraPosition(stopped,from,[mesh]).distanceTo(from)).toBeLessThan(1e-8);
});
test('removing the wall opens movement and a distant wall leaves empty-space zoom free',()=>{
  const from=new THREE.Vector3(0,0,3),to=new THREE.Vector3(0,0,-3);
  expect(clearCameraPosition(from,to,[]).equals(to)).toBe(true);
  const mesh=wall();mesh.position.x=8;mesh.updateMatrixWorld(true);
  expect(clearCameraPosition(from,to,[mesh]).equals(to)).toBe(true);
});
test('camera volume catches a corner between axial ray samples',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.015,.015,2),new THREE.MeshBasicMaterial());
  mesh.position.set(.075,.075,0);mesh.updateMatrixWorld(true);
  const stopped=clearCameraPosition(new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-3),[mesh]);
  expect(stopped.z).toBeGreaterThan(1);
});
test('pan target follows the camera when a wall stops the pan',()=>{
  const mesh=wall(),from=new THREE.Vector3(0,0,3),targetFrom=new THREE.Vector3(0,0,0);
  const cleared=clearCameraAndTargetPosition(from,new THREE.Vector3(0,0,-3),targetFrom,
    new THREE.Vector3(0,0,-6),[mesh]);
  expect(cleared.camera.z).toBeGreaterThan(.05+CAMERA_CLEARANCE);
  expect(cleared.camera.z).toBeLessThan(.18);
  expect(cleared.camera.distanceTo(cleared.target)).toBeCloseTo(from.distanceTo(targetFrom),6);
});
test('free pan keeps its requested target and zoom keeps a fixed target',()=>{
  const from=new THREE.Vector3(0,0,3),targetFrom=new THREE.Vector3(0,0,0);
  const targetDesired=new THREE.Vector3(2,1,-1),desired=from.clone().add(targetDesired.clone().sub(targetFrom));
  const panned=clearCameraAndTargetPosition(from,desired,targetFrom,targetDesired,[]);
  expect(panned.camera.equals(desired)).toBe(true);
  expect(panned.target.equals(targetDesired)).toBe(true);
  const zoomed=clearCameraAndTargetPosition(from,new THREE.Vector3(0,0,2),targetFrom,targetFrom,[]);
  expect(zoomed.camera.equals(new THREE.Vector3(0,0,2))).toBe(true);
  expect(zoomed.target.equals(targetFrom)).toBe(true);
});
