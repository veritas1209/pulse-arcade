import * as THREE from 'three';
import { sweptSolidBlocker } from './extraction';

export const CAMERA_CLEARANCE = 0.12;

/** Continuous movement test: even a wheel jump across an entire room hits its wall. */
export function clearCameraPosition(
  from: THREE.Vector3, desired: THREE.Vector3, obstacles: THREE.Mesh[],
  radius = CAMERA_CLEARANCE,
): THREE.Vector3 {
  const movement = desired.clone().sub(from), distance = movement.length();
  if (distance < 1e-8 || !obstacles.length) return desired.clone();
  const direction = movement.divideScalar(distance);
  const blocked = (travel: number) => sweptSolidBlocker(from, direction, radius,
    radius, travel + radius, obstacles) !== null;
  if (!blocked(distance)) return desired.clone();
  let low = 0, high = distance;
  // Bisection brackets the first obstruction, including triangles between the
  // five ray samples formerly used for screw clearance. The small setback keeps
  // the near plane outside the surface and allows movement away from the wall.
  for (let i = 0; i < 14; i++) {
    const middle = (low + high) / 2;
    if (blocked(middle)) high = middle; else low = middle;
  }
  return from.clone().addScaledVector(direction, Math.max(0, low - 0.002));
}

/** Keep OrbitControls' orbit target in sync when a pan is stopped by a wall.
 * OrbitControls pans the camera and target by the same translation. If the
 * camera is collision-clamped while the target keeps the full translation,
 * their distance changes and later zooms orbit around a target beyond the wall.
 */
export function clearCameraAndTargetPosition(
  from: THREE.Vector3, desired: THREE.Vector3,
  targetFrom: THREE.Vector3, targetDesired: THREE.Vector3,
  obstacles: THREE.Mesh[], radius = CAMERA_CLEARANCE,
): { camera: THREE.Vector3; target: THREE.Vector3 } {
  const camera = clearCameraPosition(from, desired, obstacles, radius);
  const cameraMovement = desired.clone().sub(from);
  const targetMovement = targetDesired.clone().sub(targetFrom);
  const target = targetDesired.clone();
  const isPan = targetMovement.lengthSq() > 1e-14 &&
    cameraMovement.distanceToSquared(targetMovement) < 1e-8;
  if (isPan) target.copy(targetFrom).add(camera.clone().sub(from));
  return { camera, target };
}
