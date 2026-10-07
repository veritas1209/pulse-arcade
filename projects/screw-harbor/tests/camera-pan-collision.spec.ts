import { test, expect } from '@playwright/test';

test('a wall-clamped pan keeps the orbit target anchored to the camera', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean((window as any).__SCREW_HARBOR__));
  const before = await page.evaluate(async () => {
    // This is Vite's browser-resolvable optimized module URL; TypeScript only
    // resolves package specifiers in the Playwright worker, not page.evaluate.
    // @ts-expect-error Vite resolves the optimized browser module at runtime.
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const qa = (window as any).__SCREW_HARBOR__;
    const structure = qa.getStructure();
    const camera = qa.getDiagnostics().camera;
    const from = new THREE.Vector3().fromArray(camera.position);
    const target = new THREE.Vector3().fromArray(camera.target);
    const forward = target.clone().sub(from).normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    for (const sign of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial());
      wall.position.copy(from).addScaledVector(right, sign * 1.5);
      wall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), right.clone().multiplyScalar(sign));
      structure.root.add(wall);
      structure.parts.push({ id: `qa-pan-wall-${sign}`, group: wall });
    }
    return { camera, canvas: document.querySelector('canvas')!.getBoundingClientRect().toJSON(), right: right.toArray() };
  });
  await page.mouse.move(before.canvas.x + before.canvas.width / 2, before.canvas.y + before.canvas.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(before.canvas.x + before.canvas.width / 2 + 80, before.canvas.y + before.canvas.height / 2, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => (window as any).__THREE_GAME_TEST_HOOKS__.advanceFrames(45));
  const after = await page.evaluate(() => (window as any).__SCREW_HARBOR__.getDiagnostics().camera);
  console.log({ before: before.camera, after, cameraTravel: Math.hypot(...after.position.map((v: number, i: number) => v - before.camera.position[i])) });
  expect(after.distance).toBeCloseTo(before.camera.distance, 3);
  expect(Math.hypot(...after.position.map((v: number, i: number) => v - before.camera.position[i]))).toBeLessThan(3);
});
