import * as THREE from "three";
import type { Kit } from "./structures";

type V3 = [number, number, number];
type Role = "cream" | "white" | "teal" | "coral" | "navy" | "gold" | "wood" | "dark" | "glass" | "stone" | "jade" | "red";
const TAU = Math.PI * 2;

/** Every authored surface has an inside, an outside, and sealed boundary faces. */
function solidGeometry(vertices: V3[], quads: number[][]): THREE.BufferGeometry {
  const data: number[] = [];
  for (const q of quads) for (let i = 1; i < q.length - 1; i++) {
    data.push(...vertices[q[0]], ...vertices[q[i]], ...vertices[q[i + 1]]);
  }
  let volume = 0;
  for (let i = 0; i < data.length; i += 9) {
    const a = new THREE.Vector3(...data.slice(i, i + 3) as V3);
    const b = new THREE.Vector3(...data.slice(i + 3, i + 6) as V3);
    const c = new THREE.Vector3(...data.slice(i + 6, i + 9) as V3);
    volume += a.dot(b.cross(c));
  }
  if (volume < 0) for (let i = 0; i < data.length; i += 9) {
    for (let j = 0; j < 3; j++) [data[i + 3 + j], data[i + 6 + j]] = [data[i + 6 + j], data[i + 3 + j]];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Thick, scalloped copper shell. Adjacent panels meet without enclosing solid cores. */
function robePanel(y0: number, y1: number, a0: number, a1: number): THREE.BufferGeometry {
  const profile = (y: number): [number, number, number] => {
    const ys = [10.8, 12.7, 15.1, 17.7, 20.2, 22.5, 23.0];
    const xs = [2.65, 2.5, 2.13, 1.86, 1.66, 2.01, 1.4];
    const zs = [1.73, 1.58, 1.4, 1.23, 1.03, 1.1, .84];
    let i = 0; while (i < ys.length - 2 && y > ys[i + 1]) i++;
    const t = Math.max(0, Math.min(1, (y - ys[i]) / (ys[i + 1] - ys[i])));
    return [THREE.MathUtils.lerp(xs[i], xs[i + 1], t), THREE.MathUtils.lerp(zs[i], zs[i + 1], t), .13 * Math.sin((y - 11) * .21)];
  };
  const v: V3[] = [], q: number[][] = [], nx = 8, ny = 5;
  for (let inner = 0; inner < 2; inner++) for (let row = 0; row <= ny; row++) {
    const y = THREE.MathUtils.lerp(y0, y1, row / ny), [rx, rz, cx] = profile(y);
    for (let col = 0; col <= nx; col++) {
      const a = THREE.MathUtils.lerp(a0, a1, col / nx);
      const pleat = .11 * Math.cos(a * 14 + y * .22) + .055 * Math.cos(a * 27 - y * .32);
      const diagonal = .13 * Math.sin(2 * a + y * .8) * Math.max(0, (y - 16) / 7);
      v.push([cx + (rx + pleat + diagonal - inner * .23) * Math.cos(a), y, (rz + pleat + diagonal - inner * .23) * Math.sin(a)]);
    }
  }
  const stride = nx + 1, sheet = stride * (ny + 1);
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const i = r * stride + c;
    q.push([i, i + stride, i + stride + 1, i + 1]);
    q.push([i + sheet, i + sheet + 1, i + sheet + stride + 1, i + sheet + stride]);
  }
  for (let c = 0; c < nx; c++) {
    q.push([c, c + 1, c + 1 + sheet, c + sheet]);
    const i = ny * stride + c;
    q.push([i, i + sheet, i + sheet + 1, i + 1]);
  }
  for (let r = 0; r < ny; r++) {
    const i = r * stride, j = i + nx;
    q.push([i, i + sheet, i + sheet + stride, i + stride]);
    q.push([j, j + stride, j + stride + sheet, j + sheet]);
  }
  return solidGeometry(v, q);
}

function ellipsoid(k: Kit, g: THREE.Group, p: V3, scale: V3, role: Role, segments = 20): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, segments, 14);
  geo.scale(...scale);
  return k.mesh(g, geo, role, p);
}
function taperedLimb(k: Kit, g: THREE.Group, a: V3, b: V3, r0: number, r1: number, role: Role): void {
  const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const mesh = k.cyl(g, r1, r0, d.length(), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], role, 16);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

export function buildLiberty(k: Kit): void {
  // The lowest masonry course includes its actual floor. Its closed footprint
  // remains under the hollow pedestal until every supported assembly is removed.
  const foundation = k.part("lib-pedestal-0", "석조 받침대의 닫힌 바닥", 3, [0, 0, 0], [], { isFoundation: true, keepAssembly: true });
  k.box(foundation, [9.6, .30, 8.1], [0, .15, 0], "stone");
  // Upper masonry courses remain independent walls around a hollow interior.
  const courses = [
    { y: .38, h: .76, w: 9.6, d: 8.1 }, { y: 1.15, h: .78, w: 8.8, d: 7.3 },
    { y: 2.1, h: 1.12, w: 7.8, d: 6.5 }, { y: 3.4, h: 1.48, w: 7.0, d: 5.8 },
    { y: 4.9, h: 1.48, w: 6.75, d: 5.55 }, { y: 6.4, h: 1.48, w: 6.45, d: 5.3 },
    { y: 7.85, h: 1.4, w: 6.2, d: 5.05 }, { y: 8.85, h: .58, w: 7.0, d: 5.85 },
    { y: 9.38, h: .48, w: 7.4, d: 6.25 }, { y: 10.13, h: .95, w: 6.05, d: 4.95 },
  ];
  courses.forEach((c, row) => {
    for (let side = 0; side < 4; side++) {
      const g = row === 0 ? foundation : k.part(`lib-pedestal-${row}-${side}`, "석조 받침대 벽체", 1, [0, 0, 0], []);
      const front = side < 2, sign = side % 2 ? -1 : 1, t = .76;
      k.box(g, front ? [c.w, c.h + .08, t] : [t, c.h + .08, c.d - 2 * t], front ? [0, c.y, sign * (c.d - t) / 2] : [sign * (c.w - t) / 2, c.y, 0], row % 3 === 0 ? "cream" : "stone", .05);
      if (row >= 3 && row <= 6 && front) {
        for (let n = -2; n <= 2; n++) {
          k.box(g, [.15, c.h - .12, .12], [n * 1.1, c.y, sign * (c.d / 2 + .035)], "cream", .025);
        }
      }
      if (row === 7 && front) for (let n = -3; n <= 3; n++) {
        k.box(g, [.26, .28, .22], [n * .84, c.y - .34, sign * (c.d / 2 - .05)], "cream", .025);
      }
    }
  });
  const sole = k.part("lib-feet", "샌들과 동상 기단", 1, [0, 0, 0], []);
  k.box(sole, [5.9, .25, 4.8], [0, 10.68, 0], "jade", .09);
  ellipsoid(k, sole, [-1, 10.92, .92], [.57, .27, 1.07], "teal");
  ellipsoid(k, sole, [.87, 10.98, .25], [.55, .34, .9], "jade");
  for (let i = 0; i < 5; i++) k.torus(sole, .18, .055, [1.25 + i * .22, 10.94, 1.25], "jade", [Math.PI / 2, i % 2 * Math.PI / 2, 0]);
  // Copper hem physically overlaps the plinth; its former 0.095 gap exposed the pylon.
  const levels = [10.77, 13.15, 15.6, 18.05, 20.6, 23];
  for (let row = 0; row < levels.length - 1; row++) for (let s = 0; s < 10; s++) {
    const g = k.part(`lib-robe-${row}-${s}`, "주름진 구리 로브", 0, [0, 0, 0], []);
    k.mesh(g, robePanel(levels[row], levels[row + 1], s * TAU / 10, (s + 1) * TAU / 10), s % 4 === 0 ? "jade" : "teal");
  }
  // Closed copper shoulder annulus joins the sculpted robe to the neck. The
  // central hole is entirely inside the neck volume, while the scalloped outer
  // lip overlaps the top wall's real thickness. No interior pylon is exposed.
  const shoulders = k.part("lib-shoulder-closure", "닫힌 구리 어깨와 옷깃", 0, [0, 0, 0], []);
  const collarVertices: V3[] = [], collarFaces: number[][] = [], collarSegments = 80;
  for (let ring = 0; ring < 4; ring++) for (let n = 0; n < collarSegments; n++) {
    const a = n * TAU / collarSegments, y = ring % 2 ? 23.02 : 22.88;
    if (ring < 2) {
      const fold = .11 * Math.cos(a * 14 + 23 * .22) + .055 * Math.cos(a * 27 - 23 * .32) + .13 * Math.sin(2 * a + 23 * .8);
      collarVertices.push([.13 * Math.sin(12 * .21) + (1.435 + fold) * Math.cos(a), y, (.875 + fold) * Math.sin(a)]);
    } else collarVertices.push([.12 + .49 * Math.cos(a), y, .03 + .46 * Math.sin(a)]);
  }
  for (let n = 0; n < collarSegments; n++) {
    const j = (n + 1) % collarSegments, s = collarSegments;
    collarFaces.push([n, j, j + s, n + s], [n + 2*s, n + 3*s, j + 3*s, j + 2*s], [n + s, j + s, j + 3*s, n + 3*s], [n, n + 2*s, j + 2*s, j]);
  }
  k.mesh(shoulders, solidGeometry(collarVertices, collarFaces), "teal");
  // A visible removable iron pylon appears as the copper drapery is removed.
  for (let level = 0; level < 5; level++) {
    const g = k.part(`lib-pylon-${level}`, "에펠의 내부 지지 골조", 2, [0, 0, 0], []);
    const y0 = 10.85 + level * 2.3, y1 = y0 + 2.3;
    for (const x of [-.65, .65]) for (const z of [-.5, .5]) k.beam(g, [x, y0, z], [x, y1, z], .17, "dark");
    for (const z of [-.5, .5]) {
      k.beam(g, [-.65, y0, z], [.65, y1, z], .11, "dark");
      k.beam(g, [.65, y0, z], [-.65, y1, z], .11, "dark");
    }
  }
  const neck = k.part("lib-neck", "목과 옷깃", 0, [0, 0, 0], []);
  ellipsoid(k, neck, [.12, 23.12, .03], [.65, .85, .64], "teal");
  // Face has a forehead, flattened cheeks, distinct nose, lips, brow and chin.
  const head = k.part("lib-face", "여신의 얼굴", 0, [0, 0, 0], []);
  ellipsoid(k, head, [.12, 24.28, .16], [.9, 1.25, .77], "teal", 28);
  ellipsoid(k, head, [.12, 23.61, .55], [.51, .34, .42], "teal");
  for (const side of [-1, 1]) {
    ellipsoid(k, head, [.12 + side * .43, 24.1, .75], [.35, .39, .16], "teal");
    ellipsoid(k, head, [.12 + side * .34, 24.5, .84], [.31, .105, .11], "jade");
    ellipsoid(k, head, [.12 + side * .34, 24.41, .85], [.22, .043, .04], "dark", 12);
    ellipsoid(k, head, [.12 + side * .88, 24.15, .09], [.13, .29, .21], "teal", 12);
  }
  ellipsoid(k, head, [.12, 24.23, .92], [.16, .35, .22], "teal");
  ellipsoid(k, head, [.12, 24.01, 1.02], [.2, .12, .13], "teal");
  ellipsoid(k, head, [.12, 23.8, .87], [.31, .067, .09], "jade");
  ellipsoid(k, head, [.12, 23.72, .87], [.28, .065, .095], "teal");
  // Locks are sculpted along the sides and back, without a second buried head.
  for (let s = 0; s < 6; s++) {
    const a = Math.PI * .95 + s * Math.PI * 1.1 / 5;
    const g = k.part(`lib-hair-${s}`, "물결치는 머리카락", 0, [0, 0, 0], []);
    ellipsoid(k, g, [.12 + .77 * Math.cos(a), 24.15, .08 + .67 * Math.sin(a)], [.23, 1.05, .28], "jade", 16);
  }
  const crown = k.part("lib-crown-band", "자유의 왕관 띠", 0, [0, 0, 0], []);
  k.torus(crown, .84, .16, [.12, 25.0, .08], "jade", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * .06 + i * Math.PI * .088;
    k.box(crown, [.09, .2, .09], [.12 + .86 * Math.cos(a), 25.0, .08 + .86 * Math.sin(a)], "dark", .02);
  }
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * .04 + i * Math.PI * .92 / 6;
    const g = k.part(`lib-crown-ray-${i}`, "왕관의 일곱 광선", 0, [0, 0, 0], []);
    const base: V3 = [.12 + .81 * Math.cos(a), 24.94 + .31 * Math.sin(a), -.02];
    const tip: V3 = [base[0] + 1.55 * Math.cos(a), base[1] + 1.75 * Math.sin(a), -.12];
    taperedLimb(k, g, base, tip, .17, .025, "teal");
  }
  const raised = [
    { a: [-1.48, 22.03, .08], b: [-2.65, 23.49, .03], r0: .79, r1: .59 },
    { a: [-2.65, 23.49, .03], b: [-3.43, 25.19, .06], r0: .59, r1: .46 },
    { a: [-3.43, 25.19, .06], b: [-3.78, 27.08, .12], r0: .45, r1: .31 },
  ];
  raised.forEach((s, i) => {
    const g = k.part(`lib-raised-arm-${i}`, "횃불을 치켜든 오른팔", 0, [0, 0, 0], []);
    taperedLimb(k, g, s.a as V3, s.b as V3, s.r0, s.r1, "teal");
    if (i < 2) for (let n = 0; n < 3; n++) {
      const p = new THREE.Vector3(...s.a).lerp(new THREE.Vector3(...s.b), .25 + n * .2);
      ellipsoid(k, g, [p.x, p.y, p.z + s.r0 * .68], [.29, .17, .15], "jade", 12);
    }
  });
  const hand = k.part("lib-torch-hand", "횃불을 감싼 손", 0, [0, 0, 0], []);
  ellipsoid(k, hand, [-3.79, 27.18, .16], [.38, .46, .34], "teal");
  for (let i = 0; i < 4; i++) ellipsoid(k, hand, [-3.8, 27 + i * .17, .43], [.31, .1, .13], "jade", 12);
  const torch = k.part("lib-torch-stem", "횃불 손잡이와 받침", 0, [0, 0, 0], []);
  k.cyl(torch, .27, .2, 1.68, [-3.79, 27.55, .08], "jade", 20);
  k.cyl(torch, .74, .26, .57, [-3.79, 28.54, .08], "teal", 24);
  k.cyl(torch, .81, .74, .2, [-3.79, 28.92, .08], "gold", 24);
  const flame = k.part("lib-flame", "황금빛 횃불의 불꽃", 0, [0, 0, 0], []);
  const flameShape: [number, number][] = [[-.63,0],[-.77,.48],[-.57,1.04],[-.36,.79],[-.43,1.43],[-.1,2.12],[.14,2.8],[.28,2.17],[.19,1.62],[.54,1.95],[.57,1.34],[.81,.72],[.69,.22],[.4,0]];
  k.shape(flame, flameShape, .64, [-3.79, 29.02, .08], "gold", .11);
  const left = k.part("lib-left-arm", "석판을 품은 왼팔", 0, [0, 0, 0], []);
  taperedLimb(k, left, [1.6, 21.94, .0], [2.45, 20.65, .55], .73, .55, "teal");
  taperedLimb(k, left, [2.45, 20.65, .55], [1.8, 20.25, 1.35], .54, .34, "teal");
  const tablet = k.part("lib-tablet", "독립 선언의 석판", 0, [2.0, 21.01, 1.43], []);
  tablet.rotation.set(.09, -.13, -.16);
  k.box(tablet, [1.64, 2.82, .37], [0, 0, 0], "jade", .13);
  for (let row = 0; row < 3; row++) for (let c = 0; c < 5 - row; c++) {
    k.box(tablet, [.105, .18, .035], [-.48 + c * .23, .65 - row * .32, .215], "teal", .015);
  }
  const fingers = k.part("lib-tablet-hand", "석판 아래의 손가락", 0, [0, 0, 0], []);
  ellipsoid(k, fingers, [1.78, 19.68, 1.55], [.5, .26, .28], "teal");
  for (let i = 0; i < 4; i++) ellipsoid(k, fingers, [1.46 + i * .2, 19.8, 1.68], [.1, .31, .12], "teal", 12);
}

export function buildArchBridge(k: Kit): void {
  const radius = 5, outer = 5.85, spring = 2.35, top = 8.55, depth = 7.1;
  for (let pier = 0; pier < 4; pier++) for (let row = 0; row < 3; row++) {
    const x = -18 + pier * 12, g = k.part(`bridge-pier-${pier}-${row}`, "아치교의 석조 교각", 1, [x, 0, 0], []);
    const h = row === 0 ? .55 : .9, y = row === 0 ? .275 : .55 + (row - .5) * .9;
    k.box(g, [row === 0 ? 3.2 : 2.15, h, row === 0 ? 8 : depth], [0, y, 0], row === 0 ? "stone" : "cream", .06);
    if (row > 0 && pier > 0 && pier < 3) {
      for (const z of [-1, 1]) {
        k.shape(g, [[-1.075,0],[0,-1.15],[1.075,0]], h, [0, y, z * depth / 2], "stone", .03).rotation.x = z * Math.PI / 2;
      }
    }
  }
  for (let arch = 0; arch < 3; arch++) {
    const cx = (arch - 1) * 12;
    for (let wedge = 0; wedge < 13; wedge++) {
      const a0 = wedge * Math.PI / 13, a1 = (wedge + 1) * Math.PI / 13, pts: [number, number][] = [];
      for (let s = 0; s <= 3; s++) { const a = THREE.MathUtils.lerp(a0, a1, s / 3); pts.push([outer * Math.cos(a), outer * Math.sin(a)]); }
      for (let s = 3; s >= 0; s--) { const a = THREE.MathUtils.lerp(a0, a1, s / 3); pts.push([radius * Math.cos(a), radius * Math.sin(a)]); }
      const g = k.part(`bridge-arch-${arch}-${wedge}`, wedge === 6 ? "아치의 쐐기돌" : "둥근 아치의 홍예석", 0, [cx, spring, 0], []);
      k.shape(g, pts, depth, [0, 0, 0], wedge === 6 ? "cream" : wedge % 2 ? "stone" : "cream", .012);
    }
    // Curved-bottom spandrels leave all three vaults genuinely open.
    for (const side of [-1, 1]) for (let n = 0; n < 6; n++) {
      const x0 = -6 + n * 2, x1 = x0 + 2;
      const floor = (x: number) => spring + Math.sqrt(Math.max(0, outer * outer - x * x));
      const pts: [number, number][] = [[x0, top], [x1, top]];
      for (let s = 8; s >= 0; s--) { const x = THREE.MathUtils.lerp(x0, x1, s / 8); pts.push([x, floor(x)]); }
      const g = k.part(`bridge-spandrel-${arch}-${side}-${n}`, "아치 위 석조 벽", 0, [cx, 0, side * (depth / 2 - .34)], []);
      k.shape(g, pts, .68, [0, 0, 0], n % 2 ? "cream" : "stone", .01);
      for (const y of [4.3, 5.8, 7.3]) if (y > Math.max(floor(x0), floor(x1)) + .18) {
        k.box(g, [1.88, .055, .055], [(x0 + x1) / 2, y, side * .36], "cream");
      }
    }
  }
  for (let n = 0; n < 12; n++) {
    const x = -16.5 + n * 3;
    const g = k.part(`bridge-deck-${n}`, "교량 상판과 가로보", 1, [x, 0, 0], []);
    k.box(g, [2.98, .38, 7.85], [0, 8.76, 0], "cream", .04);
    k.box(g, [.34, .35, 6.0], [0, 8.39, 0], "stone", .035);
    k.box(g, [2.98, .1, 5.7], [0, 9.0, 0], "stone", .025);
    for (const side of [-1, 1]) {
      const rail = k.part(`bridge-balustrade-${n}-${side}`, "돌난간과 보행자 보호벽", 0, [x, 0, side * 3.66], []);
      k.box(rail, [2.98, .2, .44], [0, 9.16, 0], "cream", .035);
      k.box(rail, [2.98, .22, .5], [0, 10.25, 0], "cream", .045);
      for (let s = -1; s <= 1; s++) {
        k.box(rail, [.27, .93, .28], [s * .98, 9.7, 0], "stone", .04);
        k.cyl(rail, .16, .21, .36, [s * .98, 9.7, 0], "cream", 12);
      }
    }
  }
  for (const end of [-1, 1]) {
    const g = k.part(`bridge-abutment-${end}`, "교량 끝의 진입 계단", 1, [end * 18.5, 0, 0], []);
    k.box(g, [1, .42, 7.85], [0, 8.73, 0], "cream", .05);
    for (const z of [-3.65, 3.65]) {
      k.box(g, [.65, 1.43, .68], [0, 9.66, z], "stone", .07);
      k.box(g, [.82, .21, .82], [0, 10.45, z], "cream", .05);
    }
  }
}

export function buildEiffel(k: Kit): void {
  const metal: Role = "wood", trim: Role = "gold";
  const heights = [.65, 2.7, 4.9, 7.15, 9.45, 11.6, 14.0, 16.4, 18.8];
  const spreads = [6.15, 5.66, 4.97, 4.21, 3.51, 2.94, 2.49, 2.1, 1.79];
  const widths = [1.55, 1.43, 1.3, 1.16, 1.04, .93, .82, .73, .64];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const key = `${sx}-${sz}`;
    const foot = k.part(`eiffel-foot-${key}`, "에펠탑의 석조 기초", 1, [sx * 6.15, 0, sz * 6.15], []);
    k.box(foot, [2.5, .43, 2.5], [0, .215, 0], "stone", .1);
    k.box(foot, [1.95, .24, 1.95], [0, .55, 0], "cream", .04);
    for (let level = 0; level < heights.length - 1; level++) {
      const g = k.part(`eiffel-leg-${key}-${level}`, "곡선 기둥의 입체 격자", 0, [0, 0, 0], []);
      const y0 = heights[level], y1 = heights[level + 1];
      const point = (top: boolean, x: number, z: number): V3 => {
        const i = level + (top ? 1 : 0);
        return [sx * spreads[i] + x * widths[i] / 2, top ? y1 : y0, sz * spreads[i] + z * widths[i] / 2];
      };
      for (const x of [-1, 1]) for (const z of [-1, 1]) k.beam(g, point(false, x, z), point(true, x, z), level < 5 ? .21 : .16, metal);
      for (const side of [-1, 1]) {
        k.beam(g, point(false, -1, side), point(true, 1, side), .115, metal);
        k.beam(g, point(false, 1, side), point(true, -1, side), .115, metal);
        k.beam(g, point(false, side, -1), point(true, side, 1), .115, metal);
        k.beam(g, point(false, side, 1), point(true, side, -1), .115, metal);
        k.beam(g, point(true, -1, side), point(true, 1, side), .15, trim);
        k.beam(g, point(true, side, -1), point(true, side, 1), .15, trim);
      }
    }
  }
  // Four broad open arches are structural rims, with no filled plane across the opening.
  for (let face = 0; face < 4; face++) for (let section = 0; section < 6; section++) {
    const a0 = section * Math.PI / 6, a1 = (section + 1) * Math.PI / 6;
    const g = k.part(`eiffel-arch-${face}-${section}`, "에펠탑 하부 아치", 0, [0, 0, 0], []);
    const transform = (a: number, outer: boolean, back: boolean): V3 => {
      const x = (outer ? 5.24 : 4.95) * Math.cos(a), y = 2.05 + (outer ? 6.45 : 6.15) * Math.sin(a);
      const z = (back ? 4.46 : 4.9) - 1.95 * Math.sin(a);
      if (face === 0) return [x, y, z];
      if (face === 1) return [-x, y, -z];
      if (face === 2) return [z, y, -x];
      return [-z, y, x];
    };
    for (let s = 0; s < 5; s++) {
      const a = THREE.MathUtils.lerp(a0, a1, s / 5), b = THREE.MathUtils.lerp(a0, a1, (s + 1) / 5);
      for (const back of [false, true]) for (const outer of [false, true]) k.beam(g, transform(a, outer, back), transform(b, outer, back), .18, metal);
      k.beam(g, transform(a, false, false), transform(b, true, false), .105, trim);
      k.beam(g, transform(a, true, true), transform(b, false, true), .105, metal);
      k.beam(g, transform(a, false, false), transform(a, false, true), .12, metal);
    }
  }
  for (let level = 0; level < 2; level++) {
    const y = level === 0 ? 11.72 : 18.91, half = level === 0 ? 3.65 : 2.37;
    for (let face = 0; face < 4; face++) {
      const g = k.part(`eiffel-platform-${level}-${face}`, "전망대 테두리와 난간", 0, [0, 0, 0], []);
      g.rotation.y = face * Math.PI / 2;
      k.box(g, [half * 2, .32, .8], [0, y, half - .4], metal, .035);
      k.box(g, [half * 2 + .2, .14, .98], [0, y + .21, half - .4], trim, .025);
      k.box(g, [half * 2, .12, .17], [0, y + .94, half - .04], metal);
      for (let n = 0; n <= 12; n++) {
        const x = -half + n * half / 6;
        k.box(g, [.075, .72, .075], [x, y + .58, half - .04], metal);
      }
      for (let n = 0; n < 6; n++) {
        const x0 = -half + n * half / 3, x1 = x0 + half / 3;
        k.beam(g, [x0, y - .58, half - .32], [x1, y - .08, half - .32], .12, metal);
        k.beam(g, [x1, y - .58, half - .32], [x0, y - .08, half - .32], .12, metal);
      }
      if (level === 0) {
        k.box(g, [half * 1.32, .82, .5], [0, y + .69, half - .68], "dark", .03);
        for (let n = -3; n <= 3; n++) k.box(g, [.42, .5, .055], [n * .64, y + .72, half - .4], "glass", .02);
      }
    }
  }
  const upperY = [19.15, 20.85, 22.65, 24.45, 26.15, 27.75, 29.15];
  const upperR = [1.8, 1.48, 1.19, .94, .73, .53, .37];
  for (let level = 0; level < upperY.length - 1; level++) for (let face = 0; face < 4; face++) {
    const g = k.part(`eiffel-spire-${level}-${face}`, "상부 첨탑 격자 패널", 0, [0, 0, 0], []);
    g.rotation.y = face * Math.PI / 2;
    const r0 = upperR[level], r1 = upperR[level + 1], y0 = upperY[level], y1 = upperY[level + 1];
    k.beam(g, [-r0, y0, r0], [-r1, y1, r1], .14, metal);
    k.beam(g, [r0, y0, r0], [r1, y1, r1], .14, metal);
    k.beam(g, [-r0, y0, r0], [r1, y1, r1], .1, metal);
    k.beam(g, [r0, y0, r0], [-r1, y1, r1], .1, metal);
    k.beam(g, [-r1, y1, r1], [r1, y1, r1], .12, trim);
  }
  const cabin = k.part("eiffel-summit", "최상층 전망실", 0, [0, 0, 0], []);
  k.box(cabin, [1.55, .19, 1.55], [0, 29.3, 0], trim, .04);
  for (let face = 0; face < 4; face++) {
    const wall = new THREE.Group(); wall.rotation.y = face * Math.PI / 2; cabin.add(wall);
    k.box(wall, [1.05, .68, .12], [0, 29.73, .47], metal, .025);
    for (let n = -1; n <= 1; n++) k.box(wall, [.21, .37, .06], [n * .29, 29.8, .55], "glass", .015);
  }
  k.box(cabin, [1.38, .16, 1.38], [0, 30.16, 0], trim, .045);
  const cap = k.part("eiffel-lantern", "에펠탑의 꼭대기 등롱", 0, [0, 0, 0], []);
  k.cyl(cap, .24, .57, .57, [0, 30.51, 0], metal, 8);
  k.cyl(cap, .23, .23, .55, [0, 31.04, 0], trim, 8);
  const antenna = k.part("eiffel-antenna", "방송 안테나", 0, [0, 0, 0], []);
  k.cyl(antenna, .075, .16, 1.38, [0, 31.99, 0], metal, 12);
  k.cyl(antenna, .035, .07, .78, [0, 33.05, 0], trim, 12);
  for (const y of [31.55, 31.93, 32.3]) k.torus(antenna, .22, .045, [0, y, 0], metal, [Math.PI / 2, 0, 0]);
}

