import * as THREE from 'three';

export const SCREW_HEAD_TOP = 0.153;
export const SCREW_FULL_LENGTH = 0.373;
/** Includes the washer (major radius .225, tube radius .025). */
export const EXTRACTION_RADIUS = 0.25;
export const SCREW_HEAD_BOTTOM = -0.019;
export const SCREW_HEAD_DEPTH = SCREW_HEAD_TOP - SCREW_HEAD_BOTTOM;

type ObstacleCache = {
  geometry: THREE.BufferGeometry;
  positionVersion: number;
  matrix: number[];
  bounds: THREE.Box3;
};
const obstacleCache = new WeakMap<THREE.Mesh, ObstacleCache>();

function obstacleBounds(mesh: THREE.Mesh): THREE.Box3 {
  const geometry = mesh.geometry, position = geometry.getAttribute('position');
  const version = (position as THREE.BufferAttribute).version ?? 0;
  let cached = obstacleCache.get(mesh);
  if (!cached || cached.geometry !== geometry || cached.positionVersion !== version ||
      cached.matrix.some((value, index) => value !== mesh.matrixWorld.elements[index])) {
    // BufferGeometry bounding boxes are already computed by structure authoring.
    // Recompute when positions changed; transforms alone reuse the local box.
    if (!geometry.boundingBox || (cached?.geometry === geometry && cached.positionVersion !== version)) geometry.computeBoundingBox();
    cached = { geometry, positionVersion: version, matrix: [...mesh.matrixWorld.elements],
      bounds: geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld) };
    obstacleCache.set(mesh, cached);
  }
  return cached.bounds;
}

/** Clip a triangle to the head's axial interval in screw coordinates. */
function clipHeight(polygon: THREE.Vector3[], height: number, above: boolean): THREE.Vector3[] {
  const clipped: THREE.Vector3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = (a.z - height) * (above ? 1 : -1), db = (b.z - height) * (above ? 1 : -1);
    if (da >= 0) clipped.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
  }
  return clipped;
}

/** Distance from the axis to a convex polygon projected into the radial plane. */
function radialDistanceSquared(polygon: THREE.Vector3[]): number {
  let minimum = Infinity, positive = false, negative = false, area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length > 0 ? THREE.MathUtils.clamp(-(a.x * dx + a.y * dy) / length, 0, 1) : 0;
    minimum = Math.min(minimum, (a.x + t * dx) ** 2 + (a.y + t * dy) ** 2);
    const cross = a.x * b.y - a.y * b.x;
    positive ||= cross > 1e-14; negative ||= cross < -1e-14; area += cross;
  }
  // A nondegenerate projected polygon containing the axis has zero distance.
  // A vertical/edge-on triangle projects to a segment, so use its edge distance.
  return Math.abs(area) > 1e-14 && !(positive && negative) ? 0 : minimum;
}

/** Solid-angle parity is insufficient for merged overlapping authored solids.
 * Signed crossings count both overlapping solids, while reversed cavity walls
 * subtract them. Ray/triangle tests ignore rendering material sidedness. */
function containsPoint(mesh: THREE.Mesh, point: THREE.Vector3): boolean {
  const inverse = mesh.matrixWorld.clone().invert();
  const origin = point.clone().applyMatrix4(inverse);
  const direction = new THREE.Vector3(0.827193, 0.351731, 0.437117).normalize().transformDirection(inverse);
  const ray = new THREE.Ray(origin, direction), geometry = mesh.geometry;
  const positions = geometry.getAttribute('position'), index = geometry.getIndex();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const edge = new THREE.Vector3(), face = new THREE.Vector3();
  const crossings: { distance: number; sign: number }[] = [];
  const count = index ? index.count : positions.count;
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(i) : i);
    b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
    if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
    const distance = hit.distanceTo(origin); if (distance < 1e-8) continue;
    face.subVectors(b, a).cross(edge.subVectors(c, a));
    crossings.push({ distance, sign: Math.sign(face.dot(direction)) });
  }
  crossings.sort((a, b) => a.distance - b.distance);
  let winding = 0;
  for (let i = 0; i < crossings.length;) {
    let signs = 0, j = i;
    while (j < crossings.length && Math.abs(crossings[j].distance - crossings[i].distance) < 1e-7) signs += crossings[j++].sign;
    winding += Math.sign(signs); i = j;
  }
  return winding > 0;
}

function sweepBlockers(
  start: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  obstacles: THREE.Mesh[],
  length: number,
  firstOnly: boolean,
  backLength = SCREW_HEAD_DEPTH * length / SCREW_FULL_LENGTH,
): THREE.Mesh[] {
  if (length <= 0 || normal.lengthSq() === 0 || !obstacles.length) return [];
  const axis = normal.clone().normalize();
  const epsilon = Math.max(1e-7, length * 1e-5);
  const low = -Math.max(0, backLength) + epsilon, high = length - epsilon;
  const tangent = new THREE.Vector3().crossVectors(axis,
    Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const bitangent = new THREE.Vector3().crossVectors(axis, tangent).normalize();
  const frame = new THREE.Matrix4().makeBasis(tangent, bitangent, axis).setPosition(start).invert();
  const from = start.clone().addScaledVector(axis, low), to = start.clone().addScaledVector(axis, high);
  const sweepBounds = new THREE.Box3().setFromPoints([from, to]);
  const extent = new THREE.Vector3(
    radius * Math.sqrt(Math.max(0, 1 - axis.x * axis.x)),
    radius * Math.sqrt(Math.max(0, 1 - axis.y * axis.y)),
    radius * Math.sqrt(Math.max(0, 1 - axis.z * axis.z)),
  );
  sweepBounds.min.sub(extent); sweepBounds.max.add(extent);
  const center = from.clone().add(to).multiplyScalar(0.5);
  const effectiveRadius = Math.max(0, radius - epsilon), radiusSquared = effectiveRadius * effectiveRadius;
  const result: THREE.Mesh[] = [], seen = new Set<THREE.Mesh>();
  const transform = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of obstacles) {
    if (seen.has(mesh)) continue; seen.add(mesh);
    const bounds = obstacleBounds(mesh); if (!bounds.intersectsBox(sweepBounds)) continue;
    const geometry = mesh.geometry, positions = geometry.getAttribute('position'), index = geometry.getIndex();
    const count = index ? index.count : positions.count;
    transform.multiplyMatrices(frame, mesh.matrixWorld);
    let blocked = false;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(transform);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1).applyMatrix4(transform);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2).applyMatrix4(transform);
      if (Math.max(a.z, b.z, c.z) < low || Math.min(a.z, b.z, c.z) > high ||
          Math.max(a.x, b.x, c.x) < -radius || Math.min(a.x, b.x, c.x) > radius ||
          Math.max(a.y, b.y, c.y) < -radius || Math.min(a.y, b.y, c.y) > radius) continue;
      const clipped = clipHeight(clipHeight([a, b, c], low, true), high, false);
      if (clipped.length && radialDistanceSquared(clipped) <= radiusSquared + 1e-18) { blocked = true; break; }
    }
    // No surface crossing can be visible when the whole swept head lies inside a
    // thick neighboring solid. Test containment as well as boundary intersection.
    if (!blocked && bounds.containsPoint(center)) blocked = containsPoint(mesh, center);
    if (blocked) { result.push(mesh); if (firstOnly) break; }
  }
  return result;
}

/** Generic solid-cylinder sweep for movement clearance. The cylinder runs from
 * start - normal * backLength to start + normal * forwardLength. Contact at its
 * outer boundary is allowed. Matrices must be current, as for Three raycasts. */
export function sweptSolidBlockers(
  start: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  backLength: number,
  forwardLength: number,
  obstacles: THREE.Mesh[],
  firstOnly = false,
): THREE.Mesh[] {
  return sweepBlockers(start, normal, radius, obstacles, forwardLength, firstOnly, backLength);
}

export function sweptSolidBlocker(
  start: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  backLength: number,
  forwardLength: number,
  obstacles: THREE.Mesh[],
): THREE.Mesh | null {
  return sweepBlockers(start, normal, radius, obstacles, forwardLength, true, backLength)[0] ?? null;
}

/** Every obstacle overlapping the current head or its complete extraction sweep.
 * The shaft is excluded, so the owning mesh can also be checked: an ordinary
 * mounting surface is clear while its other walls or trim may obstruct the head.
 * `start` is the current head top; exactly `length` clear space is sufficient. */
export function extractionBlockers(
  start: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  obstacles: THREE.Mesh[],
  length = SCREW_FULL_LENGTH,
): THREE.Mesh[] {
  return sweepBlockers(start, normal, radius, obstacles, length, false);
}

export function extractionBlocker(
  start: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  obstacles: THREE.Mesh[],
  length = SCREW_FULL_LENGTH,
): THREE.Mesh | null {
  return sweepBlockers(start, normal, radius, obstacles, length, true)[0] ?? null;
}
