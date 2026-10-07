import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {extractionBlocker,extractionBlockers,sweptSolidBlocker,EXTRACTION_RADIUS,SCREW_HEAD_TOP,SCREW_HEAD_DEPTH,SCREW_FULL_LENGTH} from '../src/extraction';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const start=new THREE.Vector3(),normal=new THREE.Vector3(0,1,0);
function block(front: number, x=0, width=1) {
  const m=new THREE.Mesh(new THREE.BoxGeometry(width,0.04,1),new THREE.MeshBasicMaterial());
  m.position.set(x,front+0.02,0);m.updateMatrixWorld(true);return m;
}
test('clearance compares obstacle entry with the whole screw length',()=>{
  expect(extractionBlocker(start,normal,0.05,[])).toBeNull();
  const near=block(SCREW_FULL_LENGTH-0.01);
  expect(extractionBlocker(start,normal,0.05,[near])).toBe(near);
  expect(extractionBlocker(start,normal,0.05,[block(SCREW_FULL_LENGTH+0.01)])).toBeNull();
  expect(extractionBlocker(start,normal,0.05,[block(SCREW_FULL_LENGTH)])).toBeNull();
});
test('scaled short screws fit the same gap that blocks a longer screw',()=>{
  const obstacle=block(0.2);
  expect(extractionBlocker(start,normal,0.05,[obstacle],SCREW_FULL_LENGTH*0.4)).toBeNull();
  expect(extractionBlocker(start,normal,0.05,[obstacle],SCREW_FULL_LENGTH)).toBe(obstacle);
});
test('head radius catches an edge obstruction and restores material sidedness',()=>{
  const edge=block(0.1,0.055,0.02);
  expect(extractionBlocker(start,normal,0,[edge])).toBeNull();
  expect(extractionBlocker(start,normal,0.05,[edge])).toBe(edge);
  expect((edge.material as THREE.Material).side).toBe(THREE.FrontSide);
});
test('a head already inside another solid cannot pass its backface',()=>{
  const solid=block(-0.01);
  expect(extractionBlocker(start,normal,0.05,[solid])).toBe(solid);
});

function boxAt(size: [number, number, number], position: [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
  mesh.position.set(...position); mesh.updateMatrixWorld(true); return mesh;
}

test('a deeply embedded head is blocked even when every exit is beyond the extraction distance', () => {
  const embedded = boxAt([2, 2, 2], [0, 0, 0]);
  expect(extractionBlocker(start, normal, .05, [embedded])).toBe(embedded);
});

test('side overlap behind the head top is blocked before extraction starts', () => {
  const ledge = boxAt([.04, .04, .2], [.055, -.09, 0]);
  expect(extractionBlocker(start, normal, .05, [ledge])).toBe(ledge);
  const behindHead = boxAt([1, .02, 1], [0, -SCREW_HEAD_DEPTH - .02, 0]);
  expect(extractionBlocker(start, normal, .05, [behindHead])).toBeNull();
});

test('a diagonal corner between all five former sample rays still obstructs the head', () => {
  const diagonal = boxAt([.015, .04, .015], [.032, .1, .032]);
  expect(extractionBlocker(start, normal, .05, [diagonal])).toBe(diagonal);
  const outside = boxAt([.01, .04, .01], [.05, .1, .05]);
  expect(extractionBlocker(start, normal, .05, [outside])).toBeNull();
});

test('all blockers are returned once without changing shared materials', () => {
  const first = block(.08), second = block(.25);
  second.material = first.material;
  expect(extractionBlockers(start, normal, .05, [first, second, first])).toEqual([first, second]);
  expect((first.material as THREE.Material).side).toBe(THREE.FrontSide);
});

test('the mounting surface is clear when included, while its perpendicular ledge blocks', () => {
  for (const scale of [.38, .64, 1]) {
    const wall = boxAt([2, .4, 2], [0, -.2, 0]);
    const headTop = new THREE.Vector3(0, .024 + SCREW_HEAD_TOP * scale, 0);
    expect(extractionBlocker(headTop, normal, EXTRACTION_RADIUS * scale, [wall], SCREW_FULL_LENGTH * scale)).toBeNull();
    const ledgeGeometry = new THREE.BoxGeometry(.08, .18, .4).translate(.16 * scale, .11, 0);
    const fused = new THREE.Mesh(mergeGeometries([wall.geometry.clone().translate(0, -.2, 0), ledgeGeometry]), wall.material);
    fused.updateMatrixWorld(true);
    expect(extractionBlocker(headTop, normal, EXTRACTION_RADIUS * scale, [fused], SCREW_FULL_LENGTH * scale)).toBe(fused);
  }
});

test('cached broad phase follows moving and rotating release geometry', () => {
  const moving = block(.1);
  expect(extractionBlocker(start, normal, .05, [moving])).toBe(moving);
  moving.position.x = 10; moving.updateMatrixWorld(true);
  expect(extractionBlocker(start, normal, .05, [moving])).toBeNull();
  moving.position.set(.1, .1, 0); moving.rotation.z = Math.PI / 2; moving.updateMatrixWorld(true);
  expect(extractionBlocker(start, normal, .2, [moving])).toBe(moving);
});

test('containment handles overlapping solids and leaves a real central cavity open', () => {
  const left = new THREE.BoxGeometry(2, 2, 2).translate(-.2, 0, 0);
  const right = new THREE.BoxGeometry(2, 2, 2).translate(.2, 0, 0);
  const overlap = new THREE.Mesh(mergeGeometries([left, right]), new THREE.MeshBasicMaterial());
  overlap.updateMatrixWorld(true);
  expect(extractionBlocker(start, normal, .05, [overlap])).toBe(overlap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .2, 12, 32), new THREE.MeshBasicMaterial());
  ring.rotation.x = Math.PI / 2; ring.updateMatrixWorld(true);
  expect(extractionBlocker(start, normal, .05, [ring])).toBeNull();
});

test('swept clearance is invariant under rotated, translated and scaled assemblies', () => {
  const assembly = new THREE.Group();
  const axis = new THREE.Vector3(1, .5, -.3).normalize();
  assembly.quaternion.setFromUnitVectors(normal, axis);
  assembly.position.set(3, -1, 2); assembly.scale.setScalar(2);
  const near = block(.1), exact = block(SCREW_FULL_LENGTH);
  assembly.add(near, exact); assembly.updateMatrixWorld(true);
  const origin = assembly.localToWorld(new THREE.Vector3());
  expect(extractionBlocker(origin, axis, .1, [near], SCREW_FULL_LENGTH * 2)).toBe(near);
  expect(extractionBlocker(origin, axis, .1, [exact], SCREW_FULL_LENGTH * 2)).toBeNull();
});

test('generic camera cylinder catches entry, tunneling and diagonal wall overlap', () => {
  const wall = boxAt([.08, 4, 4], [0, 0, 0]);
  const from = new THREE.Vector3(-3, 0, 0), direction = new THREE.Vector3(1, 0, 0);
  expect(sweptSolidBlocker(from, direction, .1, .1, 2, [wall])).toBeNull();
  expect(sweptSolidBlocker(from, direction, .1, .1, 3.1, [wall])).toBe(wall);
  expect(sweptSolidBlocker(from, direction, .1, .1, 6.1, [wall])).toBe(wall);
  expect(sweptSolidBlocker(from, direction, .1, .1, 6.1, [])).toBeNull();
  const edge = boxAt([.04, .04, .04], [0, .06, .06]);
  expect(sweptSolidBlocker(from, direction, .1, .1, 6.1, [edge])).toBe(edge);
});

test('generic movement respects actual hollow space and updated rotated walls', () => {
  const wall = boxAt([.1, 3, 3], [2, 0, 0]);
  const from = new THREE.Vector3(0, 0, -.5), direction = new THREE.Vector3(0, 0, 1);
  expect(sweptSolidBlocker(from, direction, .1, .1, 1.1, [wall])).toBeNull();
  wall.position.set(0, 0, .4); wall.rotation.y = Math.PI / 2; wall.updateMatrixWorld(true);
  expect(sweptSolidBlocker(from, direction, .1, .1, 1.1, [wall])).toBe(wall);
  const tube = new THREE.Mesh(new THREE.TorusGeometry(1.2, .2, 12, 32), new THREE.MeshBasicMaterial());
  tube.updateMatrixWorld(true);
  expect(sweptSolidBlocker(from, direction, .1, .1, 1.1, [tube])).toBeNull();
});
