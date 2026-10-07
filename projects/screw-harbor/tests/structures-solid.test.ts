import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { buildStructure, cutGeometry, Kit, thickenSurface } from '../src/structures';

function signedVolume(geometry: THREE.BufferGeometry): number {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = flat.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  if (flat !== geometry) flat.dispose();
  return volume;
}

/** A closed oriented surface has each geometric edge in both directions. */
function expectClosed(geometry: THREE.BufferGeometry): void {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = flat.getAttribute('position'), edges = new Map<string, number>();
  const key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
  for (let i = 0; i < p.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = key(i + j), b = key(i + (j + 1) % 3); if (a === b) continue;
    const edge = [a, b].sort().join('/'); edges.set(edge, (edges.get(edge) ?? 0) + (a < b ? 1 : -1));
  }
  expect([...edges.values()].filter(v => v !== 0)).toEqual([]);
  expect(signedVolume(flat)).toBeGreaterThan(0);
  if (flat !== geometry) flat.dispose();
}

test('repeated panel cuts stay closed and conserve a beveled board volume', () => {
  const kit = new Kit(), group = kit.part('board', 'Board', 0, [0, 0, 0], []);
  kit.box(group, [4.8, 0.36, 3.8], [0, 0, 0], 'wood', 0.075);
  kit.finish(0);
  let geometry = (group.children[0] as THREE.Mesh).geometry;
  for (const [axis, plane] of [[0, 0], [2, 0], [0, -1.2], [2, -0.8]]) {
    const negative = cutGeometry(geometry, axis, plane, false)!;
    const positive = cutGeometry(geometry, axis, plane, true)!;
    expectClosed(negative); expectClosed(positive);
    expect(signedVolume(negative) + signedVolume(positive)).toBeCloseTo(signedVolume(geometry), 7);
    geometry = negative;
  }
});

test('a coincident cut never leaves a paper-thin end face on the empty side', () => {
  const box = new THREE.BoxGeometry(2, 2, 2);
  expect(cutGeometry(box, 0, 1, true)).toBeNull();
  expect(cutGeometry(box, 0, -1, false)).toBeNull();
  const retained = cutGeometry(box, 0, 1, false)!;
  expectClosed(retained);
  expect(signedVolume(retained)).toBeCloseTo(8, 8);
});

test('a cut ring keeps its cavity, solid cross-section and outward cap normals', () => {
  const ring = new THREE.TorusGeometry(1.5, 0.3, 12, 32);
  const half = cutGeometry(ring, 2, 0, false)!;
  expectClosed(half);
  const mesh = new THREE.Mesh(half, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  ray.set(new THREE.Vector3(1.5, 0, 2), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(mesh)[0];
  expect(hit.point.z).toBeCloseTo(0, 8);
  expect(hit.face!.normal.z).toBeCloseTo(1, 8);
});

test('thick skins have connected rims and leave interior openings intact', () => {
  const shape = new THREE.Shape();
  shape.moveTo(-2, -2); shape.lineTo(2, -2); shape.lineTo(2, 2); shape.lineTo(-2, 2); shape.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.8, 0, Math.PI * 2, true); shape.holes.push(hole);
  const shell = thickenSurface(new THREE.ShapeGeometry(shape, 16), p => p.add(new THREE.Vector3(0, 0, -0.14)));
  expectClosed(shell);
  expect(shell.boundingBox!.max.z - shell.boundingBox!.min.z).toBeCloseTo(0.14, 8);
  expectClosed(cutGeometry(shell, 0, 0, true)!);
});

test('all 20 stages retain two real fasteners per independent solid component', () => {
  test.setTimeout(240_000);
  const counts = [156, 168, 180, 192, 204, 252, 220, 232, 290, 252, 336, 276, 600, 480, 520, 640, 640, 800, 560, 720];
  for (let stage = 0; stage < counts.length; stage++) {
    const definition = buildStructure(stage);
    expect(definition.parts.length * 2).toBe(counts[stage]);
    expect(definition.root.userData.screwCount).toBe(counts[stage]);
    expect(new Set(definition.root.userData.witnessPartIds).size).toBe(definition.parts.length);
    for (const part of definition.parts) {
      expect(part.screws).toHaveLength(2);
      const mesh = part.group.children[0] as THREE.Mesh;
      expect((mesh.material as THREE.Material).side).toBe(THREE.FrontSide);
      expect(signedVolume(mesh.geometry), part.id).toBeGreaterThan(0);
      expectClosed(mesh.geometry);
      expect(mesh.geometry.getAttribute('position').array).toBeInstanceOf(Float32Array);
      for (const screw of part.screws) {
        expect(screw.position.every(Number.isFinite)).toBe(true);
        expect(new THREE.Vector3(...screw.normal).length()).toBeCloseTo(1, 5);
      }
      mesh.geometry.dispose();
    }
  }
});
