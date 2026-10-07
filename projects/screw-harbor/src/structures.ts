import * as THREE from "three";
import { extractionBlockers, EXTRACTION_RADIUS, SCREW_HEAD_TOP, SCREW_FULL_LENGTH } from './extraction';
import { createSurfaceMaterial, materialProfile } from './materials';
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildStarDestroyer, buildEnterprise, buildCarrier, buildDestroyer, buildBattleship } from "./large-ships";
import { buildLiberty, buildArchBridge, buildEiffel } from "./large-landmarks";

export interface StructurePart {
  id: string;
  group: THREE.Group;
  screws: {
    position: [number, number, number];
    normal: [number, number, number];
  }[];
  layer: number;
  name: string;
  dependsOn?: string[];
  /** Relative to the game's normal bolt mesh; small boards use smaller fasteners. */
  boltScale?: number;
  /** The integral bottom course stays until all supported components are gone. */
  isFoundation?: boolean;
}
export interface StructureDefinition {
  id: string;
  name: string;
  subtitle: string;
  theme: string;
  difficulty: number;
  parts: StructurePart[];
  root: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  background: number;
  accent: number;
}
export const STAGES = [
  {
    id: "little-harbor",
    name: "해변 오두막",
    subtitle: "바닷바람이 머무는 작은 집",
    theme: "COASTAL VILLAGE",
    difficulty: 1,
  },
  {
    id: "beacon",
    name: "산호빛 등대",
    subtitle: "돌아오는 배를 기다리는 따뜻한 빛",
    theme: "SALT & SUNSHINE",
    difficulty: 1,
  },
  {
    id: "windmill",
    name: "황금빛 풍차",
    subtitle: "네 개의 날개에 담긴 오래된 이야기",
    theme: "COUNTRYSIDE",
    difficulty: 2,
  },
  {
    id: "pagoda",
    name: "비취 정자",
    subtitle: "굽이진 처마 아래 숨겨진 조각들",
    theme: "GARDEN RETREAT",
    difficulty: 2,
  },
  {
    id: "clocktower",
    name: "구시가지 시계탑",
    subtitle: "잠시 멈춘 시간을 한 조각씩",
    theme: "OLD TOWN",
    difficulty: 2,
  },
  {
    id: "ferry",
    name: "섬마을 여객선",
    subtitle: "햇살 가득한 섬으로 떠나는 항해",
    theme: "ISLAND HOPPER",
    difficulty: 2,
  },
  {
    id: "observatory",
    name: "별빛 천문대",
    subtitle: "작은 돔 너머 끝없이 펼쳐지는 우주",
    theme: "CELESTIAL WORKSHOP",
    difficulty: 3,
  },
  {
    id: "temple",
    name: "붉은 처마 사원",
    subtitle: "나무와 기와가 간직한 고요한 정원",
    theme: "ANCIENT GARDENS",
    difficulty: 3,
  },
  {
    id: "cargo",
    name: "항구의 화물선",
    subtitle: "소중한 화물과 정교한 선체의 비밀",
    theme: "WORKING WATERFRONT",
    difficulty: 3,
  },
  {
    id: "grand-hotel",
    name: "리비에라 호텔",
    subtitle: "엽서 속 해안에서 보내는 느긋한 오후",
    theme: "POSTCARD COAST",
    difficulty: 3,
  },
  {
    id: "oceanliner",
    name: "그랜드 오션라이너",
    subtitle: "바다 위 작은 도시를 한 조각씩",
    theme: "THE GREAT CROSSING",
    difficulty: 4,
  },
  {
    id: "royal-pagoda",
    name: "구름 위 궁전",
    subtitle: "가장 섬세한 마지막 컬렉션",
    theme: "MASTER COLLECTION",
    difficulty: 4,
  },
  { id: "star-destroyer", name: "스타 디스트로이어", subtitle: "", theme: "", difficulty: 5 },
  { id: "liberty", name: "자유의 여신상", subtitle: "", theme: "", difficulty: 4 },
  { id: "arch-bridge", name: "아치 다리", subtitle: "", theme: "", difficulty: 4 },
  { id: "eiffel", name: "에펠탑", subtitle: "", theme: "", difficulty: 5 },
  { id: "enterprise", name: "U.S.S. 엔터프라이즈", subtitle: "", theme: "", difficulty: 5 },
  { id: "aircraft-carrier", name: "대형 항공모함", subtitle: "", theme: "", difficulty: 5 },
  { id: "destroyer", name: "구축함", subtitle: "", theme: "", difficulty: 4 },
  { id: "battleship", name: "전함", subtitle: "", theme: "", difficulty: 5 },
];
type V3 = [number, number, number];
type Role =
  | "cream"
  | "white"
  | "teal"
  | "coral"
  | "navy"
  | "gold"
  | "wood"
  | "dark"
  | "glass"
  | "stone"
  | "jade"
  | "red";
type Screw = StructurePart["screws"][number];
const C: Record<Role, number> = {
  cream: 0xf4e4c5,
  white: 0xfffbec,
  teal: 0x398f8f,
  coral: 0xde7959,
  navy: 0x274f68,
  gold: 0xd9ad61,
  wood: 0x94704d,
  dark: 0x344754,
  glass: 0x79b7bf,
  stone: 0xb4b1a2,
  jade: 0x527d69,
  red: 0xb75548,
};
const UP: V3 = [0, 1, 0],
  FRONT: V3 = [0, 0, 1];
const TAU = Math.PI * 2;
const a = (x: number, y: number, z: number, normal: V3 = FRONT): Screw => ({
  position: [x, y, z],
  normal,
});
const frontPair = (span: number, y: number, z: number): Screw[] => [
  a(-span, y, z),
  a(span, y, z),
];
const topPair = (span: number, y: number, z = 0): Screw[] => [
  a(-span, y, z, UP),
  a(span, y, z, UP),
];

/** Decoration is fused into its owning part; no scenery remains after completion. */
export class Kit {
  parts: StructurePart[] = [];
  root = new THREE.Group();
  materials: Record<Role, THREE.MeshStandardMaterial>;
  constructor() {
    this.materials = Object.fromEntries(
      Object.entries(C).map(([role, color]) => [
        role,
        new THREE.MeshStandardMaterial({
          name: role,
          color,
          roughness: role === "glass" ? 0.2 : role === "gold" ? 0.34 : 0.66,
          metalness: role === "gold" ? 0.55 : role === "glass" ? 0.16 : 0.02,
        }),
      ]),
    ) as Record<Role, THREE.MeshStandardMaterial>;
  }
  part(
    id: string,
    name: string,
    layer: number,
    position: V3,
    screws: Screw[],
    options: { isFoundation?: boolean; keepAssembly?: boolean } = {},
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(...position);
    group.userData.partId = id;
    group.userData.isFoundation = !!options.isFoundation;
    group.userData.keepAssembly = !!options.keepAssembly;
    this.parts.push({ id, name, layer, group, screws, isFoundation: options.isFoundation });
    this.root.add(group);
    return group;
  }
  mesh(
    g: THREE.Group,
    geo: THREE.BufferGeometry,
    role: Role,
    p: V3 = [0, 0, 0],
    rot?: V3,
  ): THREE.Mesh {
    // Surface primitives need a genuine back and rim before they can be cut.
    if (geo instanceof THREE.CircleGeometry) {
      geo = thickenSurface(geo, p => p.add(new THREE.Vector3(0, 0, -0.045)));
    } else if (geo instanceof THREE.TubeGeometry && !geo.parameters.closed) {
      geo = closeTubeEnds(geo);
    } else if (geo instanceof THREE.SphereGeometry && geo.parameters.thetaLength < Math.PI) {
      const innerScale = (geo.parameters.radius - 0.13) / geo.parameters.radius;
      geo = thickenSurface(geo, p => p.multiplyScalar(innerScale));
    } else if (geo instanceof THREE.CylinderGeometry && geo.parameters.thetaLength < TAU - 1e-5) {
      const q = geo.parameters;
      const skin = new THREE.CylinderGeometry(q.radiusTop, q.radiusBottom, q.height, q.radialSegments, q.heightSegments, true, q.thetaStart, q.thetaLength);
      geo.dispose();
      geo = thickenSurface(skin, p => {
        const r = Math.hypot(p.x, p.z), inner = Math.max(0.01, r - 0.15);
        return p.set(p.x * inner / r, p.y, p.z * inner / r);
      });
    }
    const m = new THREE.Mesh(geo, this.materials[role]);
    m.position.set(...p);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  box(g: THREE.Group, size: V3, p: V3, role: Role, bevel = 0): THREE.Mesh {
    if (!bevel) return this.mesh(g, new THREE.BoxGeometry(...size), role, p);
    const [w, h, d] = size;
    const r = Math.min(bevel, w / 4, h / 4, d / 4);
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2);
    sh.lineTo(w / 2 - r, -h / 2);
    sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    sh.lineTo(w / 2, h / 2 - r);
    sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    sh.lineTo(-w / 2 + r, h / 2);
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    sh.lineTo(-w / 2, -h / 2 + r);
    sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const geo = new THREE.ExtrudeGeometry(sh, {
      depth: Math.max(0.01, d - r * 2),
      bevelEnabled: true,
      bevelThickness: r,
      bevelSize: r * 0.45,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 3,
    });
    geo.translate(0, 0, -d / 2 + r);
    return this.mesh(g, geo, role, p);
  }
  cyl(
    g: THREE.Group,
    rt: number,
    rb: number,
    h: number,
    p: V3,
    role: Role,
    segments = 24,
  ): THREE.Mesh {
    return this.mesh(
      g,
      new THREE.CylinderGeometry(rt, rb, h, segments),
      role,
      p,
    );
  }
  torus(
    g: THREE.Group,
    radius: number,
    tube: number,
    p: V3,
    role: Role,
    rot?: V3,
  ): THREE.Mesh {
    return this.mesh(
      g,
      new THREE.TorusGeometry(radius, tube, 6, 32),
      role,
      p,
      rot,
    );
  }
  beam(g: THREE.Group, from: V3, to: V3, width: number, role: Role): void {
    const v = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
    const m = this.box(
      g,
      [width, v.length(), width],
      [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      role,
    );
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  }
  shape(
    g: THREE.Group,
    points: [number, number][],
    depth: number,
    p: V3,
    role: Role,
    bevel = 0.04,
  ): THREE.Mesh {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      steps: 1,
    });
    geo.translate(0, 0, -depth / 2);
    return this.mesh(g, geo, role, p);
  }
  window(
    g: THREE.Group,
    x: number,
    y: number,
    z: number,
    w = 0.65,
    h = 0.82,
    arch = false,
  ): void {
    const firstWindowMesh = g.children.length;
    if (arch) {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, -h / 2);
      s.lineTo(w / 2, -h / 2);
      s.lineTo(w / 2, h / 2 - w / 2);
      s.absarc(0, h / 2 - w / 2, w / 2, 0, Math.PI, false);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.07,
        bevelEnabled: false,
        curveSegments: 10,
      });
      this.mesh(g, geo, "gold", [x, y, z]);
      const inner = geo.clone();
      inner.scale(0.79, 0.82, 1);
      this.mesh(g, inner, "glass", [x, y, z + 0.075]);
    } else {
      this.box(g, [w + 0.14, h + 0.14, 0.12], [x, y, z], "cream", 0.035);
      this.box(g, [w, h, 0.055], [x, y, z + 0.083], "glass", 0.018);
    }
    this.box(g, [0.055, h, 0.055], [x, y, z + 0.14], "cream");
    this.box(g, [w, 0.045, 0.055], [x, y - 0.08, z + 0.14], "cream");
    this.box(
      g,
      [w + 0.27, 0.1, 0.23],
      [x, y - h / 2 - 0.1, z + 0.035],
      "gold",
      0.02,
    );
    for (const child of g.children.slice(firstWindowMesh))
      child.userData.component = `window-${x}-${y}-${z}`;
  }
  port(g: THREE.Group, x: number, y: number, z: number, r = 0.16): void {
    this.torus(g, r, 0.038, [x, y, z], "gold");
    this.mesh(g, new THREE.CircleGeometry(r * 0.85, 16), "glass", [
      x,
      y,
      z + 0.004,
    ]);
  }
  railing(
    g: THREE.Group,
    from: V3,
    to: V3,
    height = 0.42,
    role: Role = "cream",
  ): void {
    const n = Math.max(
      2,
      Math.round(
        new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to)) / 0.43,
      ),
    );
    this.beam(
      g,
      [from[0], from[1] + height, from[2]],
      [to[0], to[1] + height, to[2]],
      0.055,
      role,
    );
    this.beam(
      g,
      [from[0], from[1] + height * 0.48, from[2]],
      [to[0], to[1] + height * 0.48, to[2]],
      0.035,
      role,
    );
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p: V3 = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ];
      this.beam(g, p, [p[0], p[1] + height, p[2]], 0.045, role);
    }
  }
  finish(index: number): StructureDefinition {
    // Keep authored volumes separate until clipping. Overlapping trim of the same
    // material is not a hole in a board; combining their contours would invent one.
    // componentize still merges to one draw call per final detachable component.
    for (const part of this.parts) {
      part.group.updateMatrixWorld(true);
      for (const obj of part.group.children) if (obj instanceof THREE.Mesh) {
        obj.updateMatrix();
        const transformed = obj.geometry.clone().applyMatrix4(obj.matrix);
        const flat = transformed.index ? transformed.toNonIndexed() : transformed;
        flat.deleteAttribute('uv');
        obj.geometry.dispose();
        if (flat !== transformed) transformed.dispose();
        obj.geometry = flat;
        obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.set(1, 1, 1);
        obj.updateMatrix();
      }
    }
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.root);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    return {
      ...STAGES[index],
      parts: this.parts,
      root: this.root,
      center: sphere.center,
      radius: sphere.radius,
      background: 0xe5eff0,
      accent: index === 7 || index === 11 ? 0xb75548 : 0x348c8d,
    };
  }
}

/** Continuous bowed eaves with four curved roof surfaces and a hollow underside. */
function hipRoof(
  k: Kit,
  g: THREE.Group,
  w: number,
  d: number,
  rise: number,
  role: Role = "teal",
  flare = 0.18,
): void {
  const vertices: number[] = [];
  const cuts = 8;
  const corners = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  for (let face = 0; face < 4; face++) {
    const c0 = corners[face],
      c1 = corners[(face + 1) % 4];
    for (let row = 0; row < cuts; row++) {
      const t0 = row / cuts,
        t1 = (row + 1) / cuts;
      const vertex = (c: number[], t: number): V3 => [
        c[0] * (1 - t),
        rise * Math.pow(t, 0.72) + flare * Math.pow(1 - t, 8),
        c[1] * (1 - t),
      ];
      const p0 = vertex(c0, t0),
        p1 = vertex(c1, t0),
        p2 = vertex(c1, t1),
        p3 = vertex(c0, t1);
      vertices.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2);
    }
    k.beam(g, [c0[0], flare, c0[1]], [c1[0], flare, c1[1]], 0.12, "gold");
    const points = [];
    for (let i = 0; i <= cuts; i++) {
      const t = i / cuts;
      points.push(
        new THREE.Vector3(
          c0[0] * (1 - t),
          rise * Math.pow(t, 0.72) + flare * Math.pow(1 - t, 8) + 0.035,
          c0[1] * (1 - t),
        ),
      );
    }
    k.mesh(
      g,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        12,
        0.045,
        5,
        false,
      ),
      "gold",
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  // The roof is a hollow canopy with a 0.14-unit board depth and closed eaves.
  const solidRoof = thickenSurface(geo, p => p.add(new THREE.Vector3(0, -0.14, 0)));
  solidRoof.userData.woodUnderside = true;
  k.mesh(g, solidRoof, role);
  for (let face = 0; face < 4; face++) {
    const p0 = corners[face],
      p1 = corners[(face + 1) % 4];
    for (let n = 1; n < 9; n++) {
      const f = n / 9;
      const x = p0[0] + (p1[0] - p0[0]) * f,
        z = p0[1] + (p1[1] - p0[1]) * f;
      const pts = [];
      for (let j = 0; j <= 5; j++) {
        const t = j / 5;
        pts.push(
          new THREE.Vector3(
            x * (1 - t),
            rise * Math.pow(t, 0.72) + flare * Math.pow(1 - t, 8) + 0.013,
            z * (1 - t),
          ),
        );
      }
      k.mesh(
        g,
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts),
          7,
          0.018,
          3,
          false,
        ),
        role === "red" ? "coral" : "jade",
      );
    }
  }
}

function house(k: Kit, grand = false): void {
  const w = grand ? 5.4 : 4.4,
    d = 3.35,
    wallH = grand ? 3.6 : 2.6,
    roofY = wallH + 0.45;
  for (const side of [-1, 1]) {
    const g = k.part(
      `roof-${side}`,
      side === 1 ? "Sunward roof" : "Garden roof",
      0,
      [0, roofY + 0.54, side * 0.95],
      topPair(w * 0.27, 0.18, 0),
    );
    g.rotation.x = side * 0.52;
    k.box(g, [w + 0.75, 0.2, 2.35], [0, 0, 0], "teal", 0.055);
    for (let i = 0; i < 10; i++)
      k.box(g, [0.025, 0.055, 2.27], [-w / 2 + (i * w) / 9, 0.13, 0], "jade");
    for (let row = 0; row < 4; row++)
      k.box(g, [w + 0.74, 0.055, 0.035], [0, 0.13, -0.85 + row * 0.57], "jade");
    k.box(g, [w + 0.82, 0.18, 0.13], [0, -0.02, side * 1.15], "gold", 0.025);
  }
  const chimney = k.part(
    "chimney",
    "Brick chimney",
    0,
    [-w * 0.26, roofY + 0.72, -0.28],
    frontPair(0.22, 0.26, 0.36),
  );
  k.box(chimney, [0.82, 1.34, 0.67], [0, 0, 0], "coral", 0.055);
  k.box(chimney, [1.02, 0.2, 0.87], [0, 0.67, 0], "cream", 0.04);
  k.box(chimney, [0.66, 0.06, 0.5], [0, 0.79, 0], "dark");
  for (let i = 0; i < 4; i++)
    k.box(chimney, [0.81, 0.025, 0.012], [0, -0.44 + i * 0.28, 0.341], "gold");
  const front = k.part(
    "facade",
    "Windowed front wall",
    1,
    [0, wallH / 2 + 0.25, d / 2],
    frontPair(w * 0.36, wallH * 0.27, 0.2),
  );
  k.box(front, [w, wallH, 0.3], [0, 0, 0], "cream", 0.055);
  k.box(front, [w, 0.30, 0.30], [0, wallH / 2 + 0.13, 0], 'cream');
  k.box(front, [w + 0.12, 0.19, 0.4], [0, -wallH / 2 + 0.04, 0], "gold", 0.025);
  k.window(front, -w * 0.28, grand ? 0.47 : 0.1, 0.2, 0.77, 1.01, true);
  k.window(front, w * 0.28, grand ? 0.47 : 0.1, 0.2, 0.77, 1.01, true);
  k.box(front, [0.83, 1.57, 0.13], [0, -wallH / 2 + 0.86, 0.22], "teal", 0.07);
  k.box(front, [0.63, 0.57, 0.04], [0, -wallH / 2 + 1.2, 0.31], "glass", 0.025);
  k.cyl(
    front,
    0.06,
    0.06,
    0.08,
    [0.25, -wallH / 2 + 0.76, 0.35],
    "gold",
    12,
  ).rotation.x = Math.PI / 2;
  if (grand) {
    k.window(front, 0, 1.01, 0.2, 0.66, 0.81, true);
    for (const x of [-w * 0.28, w * 0.28])
      k.window(front, x, -0.96, 0.2, 0.67, 0.82);
  }
  const back = k.part(
    "back-wall",
    "Rear timber wall",
    1,
    [0, wallH / 2 + 0.25, -d / 2],
    frontPair(w * 0.33, wallH * 0.3, -0.18).map((s) => ({
      ...s,
      normal: [0, 0, -1],
    })),
  );
  k.box(back, [w, wallH, 0.3], [0, 0, 0], "cream", 0.045);
  k.box(back, [w, 0.30, 0.30], [0, wallH / 2 + 0.13, 0], 'cream');
  for (let i = 0; i < 5; i++)
    k.box(
      back,
      [w, 0.035, 0.03],
      [0, -wallH / 2 + 0.3 + (i * wallH) / 5, -0.17],
      "gold",
    );
  for (const side of [-1, 1]) {
    const g = k.part(
      `side-${side}`,
      side > 0 ? "East gable" : "West gable",
      1,
      [(side * w) / 2, wallH / 2 + 0.25, 0],
      frontPair(1.04, wallH * 0.26, 0.2),
    );
    g.rotation.y = (side * Math.PI) / 2;
    k.shape(
      g,
      [
        [-d / 2, -wallH / 2],
        [d / 2, -wallH / 2],
        [d / 2, wallH / 2 + 0.25],
        [0, wallH / 2 + 1.20],
        [-d / 2, wallH / 2 + 0.25],
      ],
      0.28,
      [0, 0, 0],
      "cream",
    );
    k.window(g, 0, 0.15, 0.19, 0.83, 1.05, true);
    k.beam(
      g,
      [-1.5, wallH / 2, 0.21],
      [0, wallH / 2 + 0.94, 0.21],
      0.13,
      "wood",
    );
    k.beam(
      g,
      [1.5, wallH / 2, 0.21],
      [0, wallH / 2 + 0.94, 0.21],
      0.13,
      "wood",
    );
  }
  const porch = k.part(
    "porch",
    "Welcome porch",
    0,
    [0, 0.25, d / 2 + 0.56],
    topPair(0.73, 0.16, 0),
  );
  k.box(porch, [2.25, 0.27, 1.08], [0, 0, 0], "wood", 0.04);
  k.box(porch, [1.64, 0.13, 0.5], [0, -0.11, 0.69], "stone", 0.03);
  for (const x of [-0.95, 0.95]) {
    k.box(porch, [0.12, 2.13, 0.12], [x, 1.1, -0.12], "cream", 0.025);
    k.box(porch, [0.54, 0.39, 0.5], [x, 0.3, 0.15], "coral", 0.04);
    for (let i = 0; i < 3; i++)
      k.mesh(porch, new THREE.SphereGeometry(0.15, 8, 6), "jade", [
        x + (i - 1) * 0.13,
        0.63,
        0.15,
      ]);
  }
  const core = k.part(
    "timber-frame",
    "Hidden timber frame",
    2,
    [0, wallH / 2 + 0.2, 0],
    frontPair(w * 0.3, 0.05, 0.19),
  );
  k.box(core, [w - 0.4, 0.37, 0.3], [0, 0, 0], "wood", 0.04);
  for (const x of [-w * 0.38, w * 0.38])
    k.box(core, [0.2, wallH - 0.2, 2.3], [x, 0, 0], "wood", 0.025);
  const floor = k.part(
    "floor",
    "Oak floor foundation",
    2,
    [0, 0.15, 0],
    topPair(w * 0.3, 0.18, 0.8),
  );
  k.box(floor, [w + 0.3, 0.28, d + 0.3], [0, 0, 0], "wood", 0.045);
  for (let i = 0; i < 8; i++)
    k.box(
      floor,
      [w + 0.18, 0.015, 0.024],
      [0, 0.151, -d / 2 + (i * d) / 7],
      "gold",
    );
}

function lighthouse(k: Kit): void {
  const cap = k.part(
    "beacon-roof",
    "Copper lantern roof",
    0,
    [0, 5.44, 0],
    frontPair(0.58, 0.12, 0.88),
  );
  k.cyl(cap, 0.1, 1.19, 0.66, [0, 0.24, 0], "coral", 32);
  k.cyl(cap, 1.25, 1.25, 0.13, [0, -0.1, 0], "gold", 32);
  k.cyl(cap, 0.065, 0.07, 0.45, [0, 0.76, 0], "gold", 12);
  k.mesh(cap, new THREE.SphereGeometry(0.14, 12, 8), "gold", [0, 0.99, 0]);
  k.box(cap, [1.5, 0.3, 0.12], [0, 0.03, 0.79], "coral", 0.03);
  const lantern = k.part(
    "lantern",
    "Lantern cage",
    1,
    [0, 4.7, 0],
    frontPair(0.53, -0.24, 0.86),
  );
  k.cyl(lantern, 0.92, 0.98, 0.2, [0, -0.4, 0], "cream");
  k.cyl(lantern, 0.36, 0.36, 0.7, [0, 0, 0], "gold", 20);
  k.cyl(lantern, 0.54, 0.25, 0.2, [0, 0.18, 0], "glass", 24);
  k.box(lantern, [1.34, 0.3, 0.15], [0, -0.22, 0.74], "teal", 0.04);
  k.cyl(lantern, 1.0, 1.0, 0.16, [0, -0.55, 0], 'cream', 32);
  for (let pane = 0; pane < 8; pane++) {
    const angle = (pane + 0.5) * TAU / 8;
    const glass = k.box(lantern, [0.68, 1.14, 0.065], [Math.sin(angle) * 0.785, 0.05, Math.cos(angle) * 0.785], 'glass');
    glass.rotation.y = angle;
  }
  for (let i = 0; i < 8; i++) {
    const t = (i * TAU) / 8;
    k.beam(
      lantern,
      [Math.sin(t) * 0.85, -0.42, Math.cos(t) * 0.85],
      [Math.sin(t) * 0.85, 0.69, Math.cos(t) * 0.85],
      0.075,
      "dark",
    );
  }
  const gallery = k.part(
    "gallery",
    "Lookout balcony",
    0,
    [0, 4.03, 0],
    topPair(0.8, 0.14, 0.82),
  );
  k.cyl(gallery, 1.47, 1.38, 0.21, [0, 0, 0], "cream", 40);
  k.cyl(gallery, 0.89, 0.85, 0.68, [0, -0.42, 0], "cream", 32);
  k.torus(gallery, 1.35, 0.048, [0, 0.61, 0], "gold", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 20; i++) {
    const t = (i * TAU) / 20;
    k.beam(
      gallery,
      [Math.sin(t) * 1.35, 0.08, Math.cos(t) * 1.35],
      [Math.sin(t) * 1.35, 0.61, Math.cos(t) * 1.35],
      0.038,
      "dark",
    );
  }
  for (let tier = 0; tier < 3; tier++) {
    const r = 1.15 - tier * 0.11,
      y = 0.65 + tier * 1.12;
    for (const front of [true, false]) {
      const g = k.part(
        `tower-${tier}-${front}`,
        `${["Lower", "Middle", "Upper"][tier]} tower shell`,
        tier === 2 ? 1 : 2,
        [0, y, 0],
        frontPair(r * 0.48, 0.1, r * 0.91 + 0.04),
      );
      if (!front) g.rotation.y = Math.PI;
      k.mesh(
        g,
        new THREE.CylinderGeometry(
          r - 0.11,
          r,
          1.13,
          20,
          1,
          false,
          -Math.PI / 2,
          Math.PI,
        ),
        tier === 1 ? "coral" : "cream",
      );
      k.mesh(
        g,
        new THREE.CylinderGeometry(
          r + 0.04,
          r + 0.04,
          0.11,
          20,
          1,
          false,
          -Math.PI / 2,
          Math.PI,
        ),
        "gold",
        [0, -0.52, 0],
      );
      k.window(g, 0, -0.11, r + 0.03, 0.38, 0.65, true);
    }
  }
  const plinth = k.part(
    "plinth",
    "Seaside foundation",
    3,
    [0, 0.12, 0],
    topPair(0.8, 0.29, 0.7),
  );
  k.cyl(plinth, 1.53, 1.68, 0.32, [0, 0, 0], "stone", 32);
  k.cyl(plinth, 1.5, 1.5, 0.09, [0, 0.2, 0], "cream", 32);
}

function pagoda(k: Kit, levels = 2, temple = false): void {
  const gap = 1.53,
    baseW = temple ? 5.65 : 4.7;
  for (let t = 0; t < levels; t++) {
    const w = baseW - t * 0.82,
      d = w * 0.76,
      y = 0.5 + t * gap;
    const roof = k.part(
      `roof-${t}`,
      `${["Lower", "Middle", "Upper"][t] ?? "Crown"} sweeping eaves`,
      t === levels - 1 ? 0 : 1,
      [0, y + 1.05, 0],
      [
        a(-w * 0.24, 0.58, d * 0.28, [0, 0.8, 0.6]),
        a(w * 0.24, 0.58, d * 0.28, [0, 0.8, 0.6]),
      ],
    );
    hipRoof(k, roof, w + 0.72, d + 0.66, 0.84, temple ? "red" : "teal", 0.22);
    for (const x of [-w * 0.24, w * 0.24]) {
      const tab = k.box(
        roof,
        [0.46, 0.1, 0.43],
        [x, 0.49, d * 0.28],
        temple ? "red" : "teal",
        0.03,
      );
      tab.rotation.x = 0.38;
    }
    const front = k.part(
      `screen-${t}`,
      `${t + 1}F carved screen`,
      t === levels - 1 ? 1 : 2,
      [0, y + 0.5, d / 2 - 0.18],
      frontPair(w * 0.33, 0.04, 0.17),
    );
    k.box(
      front,
      [w - 0.44, 1.38, 0.22],
      [0, 0.16, 0],
      temple ? "red" : "cream",
      0.045,
    );
    k.box(front, [w - 0.28, 0.12, 0.28], [0, 0.49, 0], "gold", 0.025);
    for (const x of [-w * 0.23, 0, w * 0.23]) {
      k.box(front, [0.59, 0.73, 0.06], [x, -0.04, 0.14], "dark", 0.02);
      for (let j = -1; j <= 1; j++)
        k.box(front, [0.032, 0.75, 0.05], [x + j * 0.18, -0.04, 0.2], "gold");
      for (const h of [-0.22, 0.1, 0.26])
        k.box(front, [0.6, 0.032, 0.05], [x, h, 0.2], "gold");
    }
    const frame = k.part(
      `frame-${t}`,
      `${t + 1}F lacquered frame`,
      3,
      [0, y + 0.45, 0],
      frontPair(w * 0.31, 0, 0.21),
    );
    // Integral story floor and side screens close the room below the sweeping
    // eaves. They detach with this floor's authored shell, exposing its contents.
    k.box(frame, [w - 0.40, 0.12, d - 0.24], [0, -0.50, 0], 'wood');
    for (const side of [-1, 1]) {
      k.box(frame, [0.18, 1.40, d - 0.22], [side * (w / 2 - 0.27), 0.23, 0], 'cream');
      for (const z of [-d * 0.23, 0, d * 0.23]) {
        k.box(frame, [0.04, 0.65, 0.50], [side * (w / 2 - 0.165), 0.14, z], 'dark');
        for (const dz of [-0.16, 0, 0.16]) k.box(frame, [0.035, 0.67, 0.025], [side * (w / 2 - 0.135), 0.14, z + dz], 'gold');
      }
    }
    k.box(
      frame,
      [w - 0.6, 0.35, 0.32],
      [0, 0, 0],
      temple ? "red" : "wood",
      0.04,
    );
    for (const x of [-w / 2 + 0.28, w / 2 - 0.28])
      for (const z of [-d / 2 + 0.24, d / 2 - 0.24]) {
        k.cyl(frame, 0.11, 0.13, 1.1, [x, 0, z], temple ? "red" : "wood", 12);
        k.cyl(frame, 0.18, 0.18, 0.12, [x, -0.5, z], "gold", 12);
      }
    const rear = k.part(
      `rear-${t}`,
      `${t + 1}F gallery`,
      2,
      [0, y + 0.43, -d / 2 + 0.15],
      frontPair(w * 0.31, 0.17, -0.21).map((s) => ({
        ...s,
        normal: [0, 0, -1],
      })),
    );
    k.box(
      rear,
      [w - 0.48, 1.40, 0.26],
      [0, 0.22, 0],
      temple ? "cream" : "red",
      0.04,
    );
    for (let n = -3; n <= 3; n++)
      k.box(rear, [0.07, 0.9, 0.05], [(n * w) / 9, 0, -0.17], "gold");
  }
  const finial = k.part(
    "finial",
    "Golden roof ornament",
    0,
    [0, 0.5 + (levels - 1) * gap + 2.0, 0],
    frontPair(0.24, -0.08, 0.3),
  );
  k.cyl(finial, 0.14, 0.38, 0.54, [0, 0, 0], "gold", 16);
  k.cyl(finial, 0.045, 0.1, 0.55, [0, 0.54, 0], "gold", 12);
  k.box(finial, [0.72, 0.3, 0.5], [0, -0.15, 0], "gold", 0.045);
  k.mesh(finial, new THREE.SphereGeometry(0.13, 12, 8), "gold", [0, 0.83, 0]);
  const foundation = k.part(
    "foundation",
    "Carved stone terrace",
    4,
    [0, 0.15, 0],
    topPair(baseW * 0.32, 0.31, baseW * 0.25),
  );
  k.box(
    foundation,
    [baseW + 0.5, 0.3, baseW * 0.76 + 0.5],
    [0, 0, 0],
    "stone",
    0.075,
  );
  k.box(
    foundation,
    [baseW + 0.3, 0.13, baseW * 0.76 + 0.3],
    [0, 0.21, 0],
    "cream",
    0.045,
  );
  for (let n = 0; n < 3; n++)
    k.box(
      foundation,
      [1.95, 0.13, (3 - n) * 0.25],
      [0, -0.08 + n * 0.07, baseW * 0.38 + 0.35],
      "stone",
      0.02,
    );
}

function windmill(k: Kit): void {
  const rotor = k.part(
    "sails",
    "Four lattice sails",
    0,
    [0, 3.83, 1.4],
    frontPair(0.34, 0, 0.38),
  );
  k.cyl(rotor, 0.43, 0.43, 0.46, [0, 0, 0], "wood", 20).rotation.x =
    Math.PI / 2;
  k.box(rotor, [0.96, 0.3, 0.15], [0, 0, 0.27], "gold", 0.04);
  for (let blade = 0; blade < 4; blade++) {
    const b = new THREE.Group();
    b.rotation.z = Math.PI / 4 + (blade * Math.PI) / 2;
    rotor.add(b);
    k.box(b, [0.18, 2.42, 0.13], [0, 1.3, 0], "wood", 0.025);
    k.shape(
      b,
      [
        [-0.02, 0.6],
        [0.62, 0.82],
        [0.74, 2.45],
        [-0.02, 2.33],
      ],
      0.075,
      [0, 0, -0.045],
      "cream",
    );
    for (let i = 0; i < 6; i++)
      k.box(b, [0.71, 0.04, 0.08], [0.32, 0.8 + i * 0.29, 0.025], "gold");
    k.box(b, [0.04, 1.72, 0.08], [0.55, 1.54, 0.03], "gold");
    b.updateMatrix();
    for (const child of [...b.children]) {
      child.applyMatrix4(b.matrix);
      rotor.add(child);
    }
    rotor.remove(b);
  }
  const roof = k.part(
    "cap",
    "Weathered mill cap",
    0,
    [0, 4.03, 0],
    frontPair(0.58, 0.28, 1.02),
  );
  hipRoof(k, roof, 2.7, 2.6, 0.98, "teal", 0.03);
  k.cyl(roof, 1.13, 1.14, 0.72, [0, -0.29, 0], "teal", 12);
  k.box(roof, [1.5, 0.38, 0.2], [0, 0.2, 0.87], "teal", 0.04);
  for (let t = 0; t < 2; t++)
    for (const front of [true, false]) {
      const y = 1.15 + t * 1.52,
        r = 1.53 - t * 0.2,
        mountZ = Math.sqrt((r - 0.128) ** 2 - (r * 0.5) ** 2) + 0.045;
      const g = k.part(
        `shell-${t}-${front}`,
        `${t === 0 ? "Lower" : "Upper"} mill masonry`,
        1,
        [0, y, 0],
        frontPair(r * 0.5, 0.21, mountZ),
      );
      if (!front) g.rotation.y = Math.PI;
      k.mesh(
        g,
        new THREE.CylinderGeometry(
          r - 0.2,
          r,
          1.53,
          12,
          1,
          false,
          -Math.PI / 2,
          Math.PI,
        ),
        "cream",
      );
      if (t === 0) k.mesh(g, new THREE.CylinderGeometry(r + 0.005, r + 0.025, 0.18, 12, 1, false, -Math.PI / 2, Math.PI), 'cream', [0, -0.79, 0]);
      k.window(g, 0, -0.27, r - 0.06, 0.58, 0.74, true);
      for (let i = 0; i < 4; i++)
        k.mesh(
          g,
          new THREE.CylinderGeometry(
            r - i * 0.045 + 0.006,
            r - i * 0.045 + 0.006,
            0.025,
            12,
            1,
            false,
            -Math.PI / 2,
            Math.PI,
          ),
          "gold",
          [0, -0.65 + i * 0.35, 0],
        );
    }
  const gallery = k.part(
    "gallery",
    "Miller balcony",
    0,
    [0, 1.85, 0],
    topPair(1.32, 0.15, 0.7),
  );
  k.cyl(gallery, 1.86, 1.9, 0.19, [0, 0, 0], "wood", 12);
  for (let i = 0; i < 12; i++) {
    const t = (i * TAU) / 12,
      t1 = ((i + 1) * TAU) / 12;
    k.railing(
      gallery,
      [Math.sin(t) * 1.79, 0.1, Math.cos(t) * 1.79],
      [Math.sin(t1) * 1.79, 0.1, Math.cos(t1) * 1.79],
      0.44,
    );
  }
  const gears = k.part(
    "gear-frame",
    "Hidden oak mechanism",
    2,
    [0, 2.23, 0],
    frontPair(0.64, 0, 0.26),
  );
  k.box(gears, [1.7, 0.38, 0.4], [0, 0, 0], "wood", 0.04);
  k.cyl(gears, 0.2, 0.2, 3.6, [0, 0, 0], "wood", 12);
  k.torus(gears, 0.69, 0.14, [0, 0.35, 0], "gold", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const t = (i * TAU) / 12;
    const m = k.box(
      gears,
      [0.17, 0.26, 0.24],
      [Math.sin(t) * 0.72, 0.35, Math.cos(t) * 0.72],
      "wood",
      0.02,
    );
    m.rotation.y = t;
  }
  const foot = k.part(
    "foundation",
    "Millstone foundation",
    2,
    [0, 0.15, 0],
    topPair(0.93, 0.23, 0.84),
  );
  k.cyl(foot, 1.91, 2.05, 0.3, [0, 0, 0], "stone", 24);
  k.torus(foot, 1.64, 0.07, [0, 0.18, 0], "gold", [Math.PI / 2, 0, 0]);
}

function clockTower(k: Kit): void {
  const crown = k.part(
    "spire",
    "Verdigris clock spire",
    0,
    [0, 4.76, 0],
    frontPair(0.59, 0.3, 1.31),
  );
  hipRoof(k, crown, 2.7, 2.7, 1.11, "teal", 0.05);
  for (const side of [-1, 1]) {
    k.box(crown, [2.16, 0.47, 0.15], [0, 0.16, side * 1.0], 'teal');
    k.box(crown, [0.15, 0.47, 2.16], [side * 1.0, 0.16, 0], 'teal');
  }
  k.box(crown, [1.6, 0.31, 0.22], [0, 0.3, 1.16], "teal", 0.03);
  k.cyl(crown, 0.045, 0.08, 0.66, [0, 1.29, 0], "gold", 10);
  k.mesh(crown, new THREE.SphereGeometry(0.14, 12, 8), "gold", [0, 1.67, 0]);
  for (const side of [0, 1, 2, 3]) {
    const theta = (side * Math.PI) / 2;
    const face = k.part(
      `clock-${side}`,
      `${["South", "East", "North", "West"][side]} clock face`,
      0,
      [Math.sin(theta) * 1.0, 3.84, Math.cos(theta) * 1.0],
      frontPair(0.76, -0.5, 0.18),
    );
    face.rotation.y = theta;
    k.box(face, [2.0, 1.64, 0.26], [0, 0, 0], "cream", 0.055);
    k.box(face, [2.14, 0.15, 0.39], [0, 0.81, 0], "gold", 0.02);
    k.torus(face, 0.61, 0.075, [0, 0.08, 0.19], "gold");
    k.mesh(face, new THREE.CircleGeometry(0.57, 40), "navy", [0, 0.08, 0.2]);
    for (let h = 0; h < 12; h++) {
      const t = (h * TAU) / 12;
      const m = k.box(
        face,
        [0.045, h % 3 === 0 ? 0.13 : 0.085, 0.024],
        [Math.sin(t) * 0.48, 0.08 + Math.cos(t) * 0.48, 0.225],
        "cream",
      );
      m.rotation.z = -t;
    }
    k.beam(face, [0, 0.08, 0.25], [-0.23, 0.29, 0.25], 0.05, "gold");
    k.beam(face, [0, 0.08, 0.26], [0.31, 0.31, 0.26], 0.035, "cream");
    k.mesh(
      face,
      new THREE.SphereGeometry(0.055, 10, 6),
      "gold",
      [0, 0.08, 0.27],
    );
  }
  for (const side of [0, 1, 2, 3]) {
    const theta = (side * Math.PI) / 2;
    const wall = k.part(
      `wall-${side}`,
      `${["South", "East", "North", "West"][side]} arcade wall`,
      1,
      [Math.sin(theta) * 0.9, 1.59, Math.cos(theta) * 0.9],
      frontPair(0.62, 0.72, 0.22),
    );
    wall.rotation.y = theta;
    k.box(wall, [1.84, 2.85, 0.3], [0, 0, 0], "coral", 0.045);
    k.window(wall, 0, 0.22, 0.2, 0.62, 1.36, true);
    for (const x of [-0.84, 0.84]) {
      k.box(wall, [0.19, 2.95, 0.41], [x, 0, 0.06], "cream", 0.025);
      for (let y = 0; y < 7; y++)
        k.box(
          wall,
          [0.26, 0.15, 0.46],
          [x, -1.2 + y * 0.4, 0.06],
          "gold",
          0.015,
        );
    }
    k.box(wall, [2.03, 0.2, 0.47], [0, -1.34, 0.03], "stone", 0.025);
  }
  const mechanism = k.part(
    "mechanism",
    "Brass clockworks",
    2,
    [0, 3.52, 0],
    frontPair(0.48, -0.1, 0.29),
  );
  k.box(mechanism, [1.38, 0.36, 0.47], [0, -0.1, 0], "wood", 0.04);
  k.torus(mechanism, 0.61, 0.12, [0, 0.6, 0], "gold");
  for (let i = 0; i < 14; i++) {
    const t = (i * TAU) / 14;
    const m = k.box(
      mechanism,
      [0.13, 0.23, 0.14],
      [Math.sin(t) * 0.67, 0.6 + Math.cos(t) * 0.67, 0],
      "gold",
    );
    m.rotation.z = -t;
  }
  k.beam(mechanism, [0, 0.22, 0], [0, -1.34, 0], 0.08, "gold");
  k.cyl(mechanism, 0.29, 0.29, 0.12, [0, -1.4, 0], "gold", 20).rotation.x =
    Math.PI / 2;
  const foot = k.part(
    "foundation",
    "Town square pedestal",
    2,
    [0, 0.16, 0],
    topPair(0.8, 0.32, 0.72),
  );
  k.box(foot, [2.8, 0.32, 2.8], [0, 0, 0], "stone", 0.07);
  k.box(foot, [2.46, 0.15, 2.46], [0, 0.2, 0], "cream", 0.035);
}

/** Ship sections use shaped cross-sections and tapered ends, never a rectangular hull. */
function hullSection(
  length: number,
  width: number,
  height: number,
  start: number,
  end: number,
  side: 1 | -1,
): THREE.BufferGeometry {
  const verts: number[] = [];
  const nx = 20,
    ny = 4;
  function p(i: number, j: number): V3 {
    const x = start + ((end - start) * i) / nx,
      t = (x + length / 2) / length;
    const taper = Math.pow(
      Math.sin(Math.PI * Math.max(0.001, Math.min(0.999, t))),
      0.25,
    );
    const v = j / ny;
    return [
      x,
      height * v,
      side * width * 0.5 * taper * (0.58 + 0.42 * Math.sin((v * Math.PI) / 2)),
    ];
  }
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const aa = p(i, j),
        b = p(i + 1, j),
        c = p(i + 1, j + 1),
        d = p(i, j + 1);
      if (side === 1) verts.push(...aa, ...b, ...c, ...aa, ...c, ...d);
      else verts.push(...aa, ...c, ...b, ...aa, ...d, ...c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return thickenSurface(geo, p => p.add(new THREE.Vector3(0, 0, -side * 0.14)));

}
function deckShape(length: number, width: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, 0);
  s.bezierCurveTo(
    -length / 2 + 0.35,
    -width * 0.49,
    -length * 0.3,
    -width / 2,
    0,
    -width / 2,
  );
  s.bezierCurveTo(
    length * 0.3,
    -width / 2,
    length / 2 - 0.35,
    -width * 0.36,
    length / 2,
    0,
  );
  s.bezierCurveTo(
    length / 2 - 0.35,
    width * 0.36,
    length * 0.3,
    width / 2,
    0,
    width / 2,
  );
  s.bezierCurveTo(
    -length * 0.3,
    width / 2,
    -length / 2 + 0.35,
    width * 0.49,
    -length / 2,
    0,
  );
  return s;
}
function ship(k: Kit, kind: "ferry" | "cargo" | "liner"): void {
  const liner = kind === "liner",
    cargo = kind === "cargo";
  const len = liner ? 10.7 : cargo ? 9.8 : 8.4,
    width = liner ? 3.05 : 2.9,
    h = liner ? 1.45 : 1.25;
  // Deckhouses are actual rooms. Each wall, floor and roof has its own
  // fasteners, so opening the superstructure reveals the furnishings below.
  const deckhouse = (id: string, name: string, x: number, y: number, l: number, d: number, height: number, level: number) => {
    const floor = k.part(`${id}-floor`, `${name} floor`, 4, [x, y - height / 2 + 0.04, 0], []);
    k.box(floor, [l - 0.20, 0.08, d - 0.20], [0, 0, 0], 'wood', 0.015);
    for (const side of [-1, 1]) {
      const wall = k.part(`${id}-wall-${side}`, `${name} windowed side wall`, 1, [x, y, side * (d / 2 - 0.05)], []);
      k.box(wall, [l, height, 0.10], [0, 0, 0], 'cream', 0.018);
      const n = Math.max(2, Math.floor(l / 0.49));
      for (let i = 0; i < n; i++) k.box(wall, [0.28, Math.min(0.27, height * 0.45), 0.036], [-l / 2 + 0.36 + i * (l - 0.72) / (n - 1), 0.04, side * 0.067], 'glass', 0.022);
      k.box(wall, [l, 0.045, 0.045], [0, -height * 0.34, side * 0.067], 'gold');
    }
    for (const end of [-1, 1]) {
      const wall = k.part(`${id}-end-${end}`, `${name} doorway bulkhead`, 2, [x + end * (l / 2 - 0.05), y, 0], []);
      // A solid door closes the passage until its exterior panel is removed.
      const jamb = (d - 0.20 - 0.46) / 2;
      for (const side of [-1, 1]) k.box(wall, [0.10, height, jamb], [0, 0, side * (0.23 + jamb / 2)], 'cream', 0.012);
      k.box(wall, [0.10, 0.12, 0.46], [0, height / 2 - 0.06, 0], 'cream', 0.012);
      k.box(wall, [0.11, height - 0.08, 0.49], [0, -0.04, 0], 'teal');
      k.box(wall, [0.025, 0.18, 0.27], [end * 0.065, height * 0.18, 0], 'glass');
    }
    const roof = k.part(`${id}-roof`, `${name} roof and promenade rails`, level === 0 ? 1 : 0, [x, y + height / 2 + 0.06, 0], []);
    k.box(roof, [l + 0.30, 0.12, d + 0.25], [0, 0, 0], cargo ? 'teal' : 'white', 0.025);
    for (const side of [-1, 1]) k.railing(roof, [-l / 2, 0.06, side * (d / 2 + 0.09)], [l / 2, 0.06, side * (d / 2 + 0.09)], 0.27, 'cream');
  };
  for (const side of [-1, 1] as const)
    for (let section = 0; section < 2; section++) {
      const start = -len / 2 + (section * len) / 2,
        end = start + len / 2;
      const hullScrews = [-0.63, 0.63].map((offset) => {
        const x = (start + end) / 2 + offset,
          t = (x + len / 2) / len,
          z =
            width *
            0.5 *
            Math.pow(Math.sin(Math.PI * t), 0.25) *
            (0.58 + 0.42 * Math.sin((0.56 * Math.PI) / 2));
        return a(x, h * 0.56, side * (z + 0.05), [0, 0, side]);
      });
      const g = k.part(
        `hull-${side}-${section}`,
        `${side === 1 ? "Port" : "Starboard"} ${section === 0 ? "stern" : "bow"} hull`,
        2,
        [0, 0.15, 0],
        hullScrews,
      );
      k.mesh(
        g,
        hullSection(len, width, h, start, end, side),
        cargo ? "teal" : "navy",
      );
      // The shaped side shell used to stop above a completely open bilge.
      // Give each hull section a matching solid bottom skin and end closure.
      const bottom = new THREE.Shape();
      bottom.moveTo(start, side * 0.025);
      for (let i = 0; i <= 20; i++) {
        const x = start + (end - start) * i / 20;
        const t = Math.max(0.001, Math.min(0.999, (x + len / 2) / len));
        bottom.lineTo(x, -side * (width * 0.5 * Math.pow(Math.sin(Math.PI * t), 0.25) * 0.58 + 0.025));
      }
      bottom.lineTo(end, side * 0.025); bottom.closePath();
      const bottomGeometry = new THREE.ExtrudeGeometry(bottom, {depth: 0.13, bevelEnabled: false});
      bottomGeometry.rotateX(-Math.PI / 2);
      k.mesh(g, bottomGeometry, cargo ? 'teal' : 'navy', [0, -0.07, 0]);
      const endX = section === 0 ? start : end;
      const endWidth = width * 0.5 * Math.pow(Math.sin(Math.PI * 0.001), 0.25);
      const closure = k.shape(g, [
        [side * 0.025, -0.02], [-side * (endWidth * 0.58 + 0.035), -0.02],
        [-side * (endWidth + 0.035), h + 0.02], [side * 0.025, h + 0.02],
      ], 0.14, [endX, 0, 0], cargo ? 'teal' : 'navy', 0);
      closure.rotation.y = Math.PI / 2;
      for (let i = 0; i < 8; i++) {
        const x = start + 0.46 + ((end - start - 0.92) * i) / 7,
          t = (x + len / 2) / len,
          z = side * width * 0.5 * Math.pow(Math.sin(Math.PI * t), 0.25);
        k.port(g, x, h * 0.77, z + side * 0.025, 0.09);
        if (side < 0) {
          const last = g.children[g.children.length - 1];
          last.rotation.y = Math.PI;
        }
      }
      for (const yy of [h * 0.13, h * 0.95]) {
        const pts = [];
        for (let i = 0; i <= 20; i++) {
          const x = start + ((end - start) * i) / 20,
            t = (x + len / 2) / len,
            taper = Math.pow(
              Math.sin(Math.PI * Math.max(0.001, Math.min(0.999, t))),
              0.25,
            ),
            v = yy / h;
          pts.push(
            new THREE.Vector3(
              x,
              yy,
              side *
                (width *
                  0.5 *
                  taper *
                  (0.58 + 0.42 * Math.sin((v * Math.PI) / 2)) +
                  0.02),
            ),
          );
        }
        k.mesh(
          g,
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(pts),
            24,
            yy < h / 2 ? 0.065 : 0.035,
            5,
            false,
          ),
          yy < h / 2 ? "coral" : "gold",
        );
      }
    }
  const deck = k.part(
    "deck",
    "Teak promenade deck",
    1,
    [0, h + 0.16, 0],
    topPair(len * 0.31, 0.24, 0.7),
  );
  // Use the very same sampled sheer line as the hull, including the end caps.
  // A different Bezier deck outline left crescents open along the bow shoulders.
  const sealedDeck = new THREE.Shape();
  for (const side of [-1, 1]) for (let i = 0; i <= 40; i++) {
    const sample = side < 0 ? i : 40 - i;
    const t = Math.max(0.001, Math.min(0.999, sample / 40));
    const x = -len / 2 + len * sample / 40 + (sample === 0 ? -0.065 : sample === 40 ? 0.065 : 0);
    const z = side * (width * 0.5 * Math.pow(Math.sin(Math.PI * t), 0.25) + 0.045);
    if (side === -1 && i === 0) sealedDeck.moveTo(x, z); else sealedDeck.lineTo(x, z);
  }
  sealedDeck.closePath();
  const deckGeo = new THREE.ExtrudeGeometry(
    sealedDeck,
    {
      depth: 0.23,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 1,
      curveSegments: 18,
    },
  );
  deckGeo.rotateX(-Math.PI / 2);
  k.mesh(deck, deckGeo, "wood");
  for (let z = -0.98; z <= 0.98; z += 0.22)
    k.box(deck, [len * 0.7, 0.016, 0.022], [0, 0.27, z], "gold");
  for (const side of [-1, 1])
    k.railing(
      deck,
      [-len * 0.34, 0.26, side * (width / 2 - 0.12)],
      [len * 0.31, 0.26, side * (width / 2 - 0.12)],
      0.39,
    );
  for (const x of [-len * 0.38, len * 0.37])
    for (const z of [-0.7, 0.7]) {
      k.cyl(deck, 0.065, 0.075, 0.21, [x, 0.35, z], "dark", 8);
      k.box(deck, [0.3, 0.06, 0.08], [x, 0.47, z], "gold");
    }
  if (cargo) {
    for (let i = 0; i < 4; i++) {
      const g = k.part(
        `cargo-${i}`,
        `${["Jade", "Ivory", "Coral", "Blue"][i]} freight container`,
        0,
        [-2.1 + i * 1.36, h + 0.97, 0],
        frontPair(0.37, 0.05, 1.04),
      );
      const role: Role = (["jade", "cream", "coral", "teal"] as Role[])[i];
      k.box(g, [1.18, 1.08, 1.95], [0, 0, 0], role, 0.045);
      for (let rib = 0; rib < 7; rib++)
        k.box(g, [0.042, 0.99, 0.042], [-0.49 + rib * 0.16, 0, 1.0], "gold");
      k.box(g, [1.08, 0.075, 0.055], [0, 0.42, 1.02], "cream");
      k.box(g, [1.08, 0.075, 0.055], [0, -0.42, 1.02], "cream");
    }
    deckhouse('bridge-lower', 'Crew accommodation', -3.5, h + 0.80, 1.25, 1.85, 0.76, 0);
    deckhouse('bridge-upper', 'Cargo navigation bridge', -3.5, h + 1.68, 1.25, 1.85, 0.76, 1);
    const cabin = k.part('bridge-funnel', 'Bridge exhaust and signal mast', 0, [-3.5, h + 1.32, 0], []);
    k.cyl(cabin, 0.23, 0.27, 0.84, [0, 1.25, -0.4], "coral", 16);
    k.cyl(cabin, 0.24, 0.24, 0.18, [0, 1.69, -0.4], "dark", 16);
    k.beam(cabin, [0.45, 0.9, 0], [0.45, 2.08, 0], 0.06, "gold");
    const crane = k.part(
      "crane",
      "Harbor loading crane",
      0,
      [3.25, h + 0.5, 0],
      frontPair(0.35, -0.03, 0.46),
    );
    k.box(crane, [0.94, 0.64, 0.8], [0, 0, 0], "gold", 0.045);
    k.box(crane, [0.16, 2.24, 0.18], [0, 1.24, 0], "gold");
    k.beam(crane, [0, 2.2, 0], [-2.1, 2.75, 0], 0.17, "gold");
    k.beam(crane, [0, 2.6, 0], [-2.1, 2.75, 0], 0.04, "dark");
    k.beam(crane, [-2.05, 2.74, 0], [-2.05, 1.22, 0], 0.025, "dark");
    k.torus(crane, 0.12, 0.035, [-2.04, 1.1, 0], "gold");
  } else {
    const levels = liner ? 3 : 2;
    for (let level = 0; level < levels; level++) {
      const l = len * (0.65 - level * 0.1),
        d = width * (0.73 - level * 0.07),
        y = h + 0.72 + level * 0.72;
      deckhouse(`saloon-${level}`, `${['Promenade', 'Boat', 'Bridge'][level]} deckhouse`, level * 0.15, y, l, d, 0.60, level);
    }
    for (let i = 0; i < (liner ? 3 : 1); i++) {
      const x = liner ? -1.6 + i * 1.35 : -0.25,
        funnel = k.part(
          `funnel-${i}`,
          `${i + 1} steam funnel`,
          0,
          [x, h + 0.72 * levels + 0.82, 0],
          frontPair(0.22, 0.03, 0.55),
        );
      k.cyl(funnel, 0.48, 0.53, 0.96, [0, 0, 0], "coral", 24);
      k.cyl(funnel, 0.49, 0.49, 0.24, [0, 0.47, 0], "dark", 24);
      k.cyl(funnel, 0.31, 0.31, 0.02, [0, 0.6, 0], "navy", 24);
      k.torus(funnel, 0.5, 0.035, [0, -0.24, 0], "gold", [Math.PI / 2, 0, 0]);
      k.box(funnel, [0.71, 0.3, 0.08], [0, 0, 0.47], "coral", 0.035);
    }
    for (const side of [-1, 1]) {
      const boat = k.part(
        `lifeboats-${side}`,
        side > 0 ? "Port lifeboats" : "Starboard lifeboats",
        0,
        [-0.55, h + 1.01, side * (width / 2 - 0.08)],
        frontPair(1.1, 0.08, side * 0.36).map((s) => ({
          ...s,
          normal: [0, 0, side],
        })),
      );
      for (const x of [-1.1, 1.1]) {
        const geo = new THREE.ExtrudeGeometry(deckShape(1.55, 0.56), {
          depth: 0.22,
          bevelEnabled: true,
          bevelSize: 0.035,
          bevelThickness: 0.04,
          bevelSegments: 2,
          curveSegments: 10,
        });
        geo.rotateX(-Math.PI / 2);
        k.mesh(boat, geo, "coral", [x, -0.1, 0]);
        k.box(boat, [1.07, 0.07, 0.28], [x, 0.16, 0], "cream", 0.05);
        k.beam(
          boat,
          [x - 0.43, -0.25, -side * 0.3],
          [x - 0.43, 0.48, 0],
          0.05,
          "gold",
        );
        k.beam(
          boat,
          [x + 0.43, -0.25, -side * 0.3],
          [x + 0.43, 0.48, 0],
          0.05,
          "gold",
        );
      }
    }
    const mast = k.part(
      "mast",
      "Signal mast",
      0,
      [len * 0.4, h + 0.62, 0],
      frontPair(0.27, -0.02, 0.24),
    );
    k.box(mast, [0.8, 0.4, 0.38], [0, 0, 0], "cream", 0.03);
    k.cyl(mast, 0.038, 0.095, 2.53, [0, 1.17, 0], "gold", 12);
    k.beam(mast, [-0.69, 1.65, 0], [0.69, 1.65, 0], 0.055, "gold");
    k.shape(
      mast,
      [
        [0, 2.15],
        [0.72, 2.0],
        [0, 1.86],
      ],
      0.026,
      [0, 0, 0],
      "coral",
      0,
    );
    k.beam(mast, [0, 2.18, 0], [-1.05, 0.2, 0], 0.017, "dark");
  }
  const keel = k.part(
    "keel",
    "Keel and inner ribs",
    3,
    [0, 0.24, 0],
    topPair(len * 0.27, 0.21, 0),
  );
  k.box(keel, [len * 0.91, 0.31, 0.4], [0, 0, 0], "wood", 0.05);
  for (let i = 0; i < 9; i++) {
    const x = -len * 0.37 + (i * len * 0.74) / 8,
      rw = width * Math.pow(Math.sin((Math.PI * (x + len / 2)) / len), 0.25),
      shape = k.shape(
        keel,
        [
          [-rw * 0.25, 0],
          [-rw * 0.2, -0.09],
          [rw * 0.2, -0.09],
          [rw * 0.25, 0],
          [rw * 0.44, h * 0.71],
          [rw * 0.36, h * 0.71],
          [rw * 0.2, 0.04],
          [-rw * 0.2, 0.04],
          [-rw * 0.36, h * 0.71],
          [-rw * 0.44, h * 0.71],
        ],
        0.095,
        [x, 0, 0],
        "wood",
        0.02,
      );
    shape.rotation.y = Math.PI / 2;
  }
}

function observatory(k: Kit): void {
  const domeY = 3.53,
    r = 1.77;
  for (const side of [-1, 1]) {
    const dome = k.part(
      `dome-${side}`,
      side === 1 ? "Eastern dome shutter" : "Western dome shutter",
      0,
      [0, domeY, 0],
      [
        a(side * 0.76, 1.16, 1.11, [side * 0.42, 0.65, 0.62]),
        a(side * 1.16, 0.5, 1.32, [side * 0.64, 0.28, 0.73]),
      ],
    );
    k.mesh(
      dome,
      new THREE.SphereGeometry(
        r,
        24,
        14,
        side === 1 ? Math.PI / 2 : -Math.PI / 2,
        Math.PI,
        0,
        Math.PI / 2,
      ),
      "teal",
    );
    k.mesh(dome, new THREE.CylinderGeometry(r, r, 0.22, 24, 1, false, side === 1 ? 0 : Math.PI, Math.PI), 'teal', [0, -0.08, 0]);
    for (let n = 1; n <= 4; n++) {
      const theta = (n * Math.PI) / 10,
        rr = (r + 0.016) * Math.sin(theta),
        yy = (r + 0.016) * Math.cos(theta),
        ringPoints = [];
      for (let j = 0; j <= 24; j++) {
        const phi =
          (side === 1 ? Math.PI / 2 : -Math.PI / 2) + (j * Math.PI) / 24;
        ringPoints.push(
          new THREE.Vector3(-rr * Math.cos(phi), yy, rr * Math.sin(phi)),
        );
      }
      k.mesh(
        dome,
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(ringPoints),
          28,
          0.022,
          4,
          false,
        ),
        "gold",
      );
    }
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = (i * Math.PI) / 32;
      pts.push(new THREE.Vector3(0, r * Math.cos(t), r * Math.sin(t)));
    }
    k.mesh(
      dome,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        20,
        0.055,
        5,
        false,
      ),
      "gold",
    );
  }
  const telescope = k.part(
    "telescope",
    "Brass telescope",
    1,
    [0, 3.6, 0],
    frontPair(0.37, -0.2, 0.39),
  );
  k.box(telescope, [1.1, 0.4, 0.64], [0, -0.25, 0], "gold", 0.04);
  k.cyl(telescope, 0.16, 0.26, 0.84, [0, 0.16, 0], "gold");
  const tube = k.cyl(telescope, 0.32, 0.24, 1.85, [0.24, 0.64, 0], "cream", 24);
  tube.rotation.z = -Math.PI / 3;
  const ring = k.cyl(telescope, 0.34, 0.34, 0.16, [1.02, 1.09, 0], "gold", 24);
  ring.rotation.z = -Math.PI / 3;
  const lens = k.cyl(telescope, 0.27, 0.27, 0.03, [1.11, 1.14, 0], "glass", 24);
  lens.rotation.z = -Math.PI / 3;
  const balcony = k.part(
    "gallery",
    "Circular observatory gallery",
    0,
    [0, 3.3, 0],
    topPair(1.1, 0.18, 1.22),
  );
  k.cyl(balcony, 2.1, 2.1, 0.24, [0, 0, 0], "cream", 40);
  k.box(balcony, [3.20, 0.26, 3.20], [0, -0.13, 0], 'cream');
  k.torus(balcony, 1.99, 0.045, [0, 0.64, 0], "gold", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 24; i++) {
    const t = (i * TAU) / 24;
    k.beam(
      balcony,
      [Math.sin(t) * 1.99, 0.14, Math.cos(t) * 1.99],
      [Math.sin(t) * 1.99, 0.63, Math.cos(t) * 1.99],
      0.038,
      "dark",
    );
  }
  for (let side = 0; side < 4; side++) {
    const t = (side * Math.PI) / 2,
      wall = k.part(
        `wall-${side}`,
        `${["South", "East", "North", "West"][side]} laboratory facade`,
        1,
        [Math.sin(t) * 1.44, 1.61, Math.cos(t) * 1.44],
        frontPair(1.0, 0.78, 0.23),
      );
    wall.rotation.y = t;
    k.box(wall, [2.96, 2.94, 0.32], [0, 0, 0], "cream", 0.055);
    for (const x of [-0.78, 0.78])
      k.window(wall, x, -0.03, 0.22, 0.59, 1.31, true);
    k.box(wall, [3.08, 0.16, 0.46], [0, 1.4, 0], "gold", 0.025);
    k.box(wall, [3.08, 0.24, 0.48], [0, -1.37, 0], "stone", 0.025);
  }
  const inner = k.part(
    "instruments",
    "Astronomer instruments",
    2,
    [0, 1.65, 0],
    frontPair(0.64, 0, 0.27),
  );
  k.box(inner, [1.8, 0.4, 0.42], [0, 0, 0], "wood", 0.045);
  k.torus(inner, 0.7, 0.045, [0, 0.8, 0], "gold");
  k.torus(inner, 0.7, 0.045, [0, 0.8, 0], "gold", [Math.PI / 2, 0, 0]);
  k.mesh(inner, new THREE.SphereGeometry(0.43, 24, 16), "glass", [0, 0.8, 0]);
  k.cyl(inner, 0.1, 0.1, 1.38, [0, -0.7, 0], "gold");
  const floor = k.part(
    "foundation",
    "Observatory mosaic floor",
    2,
    [0, 0.15, 0],
    topPair(1.1, 0.23, 0.7),
  );
  k.box(floor, [3.76, 0.3, 3.76], [0, 0, 0], "stone", 0.075);
  k.torus(floor, 1.35, 0.045, [0, 0.18, 0], "gold", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const t = (i * TAU) / 8;
    k.beam(
      floor,
      [Math.sin(t) * 0.55, 0.19, Math.cos(t) * 0.55],
      [Math.sin(t) * 1.28, 0.19, Math.cos(t) * 1.28],
      0.03,
      "gold",
    );
  }
}

/** Functional interior assemblies are revealed by removing the surrounding shell. */
function furnishInterior(k: Kit, index: number): void {
  const shipStage = [5, 8, 10].includes(index);
  const home = index === 0 || index === 9;
  const pavilion = [3, 7, 11].includes(index);
  const piece = (id: string, name: string, pos: V3): THREE.Group => {
    const g = k.part(`inside-${id}`, name, 8, pos, []);
    g.userData.keepAssembly = true;
    return g;
  };
  if (home) {
    for (let i = 0; i < 3; i++) {
      const x = -1.04 + i * 0.88;
      const cabinet = piece(`cupboard-${i}`, 'Kitchen cupboard', [x, 0.76, -1.03]);
      k.box(cabinet, [0.78, 0.99, 0.64], [0, 0, 0], 'teal', 0.045);
      k.box(cabinet, [0.81, 0.10, 0.71], [0, 0.54, 0], 'cream', 0.025);
      k.box(cabinet, [0.58, 0.73, 0.07], [0, -0.01, 0.35], 'jade', 0.035);
      k.box(cabinet, [0.18, 0.045, 0.06], [0, 0.18, 0.41], 'gold');
      const shelf = piece(`shelf-${i}`, 'Wall-mounted kitchen shelf', [x, 1.94, -1.10]);
      k.box(shelf, [0.78, 0.16, 0.53], [0, 0, 0], 'wood', 0.025);
      for (const dx of [-0.25, 0.25]) k.box(shelf, [0.10, 0.45, 0.14], [dx, -0.17, -0.17], 'gold', 0.02);
      for (const dx of [-0.19, 0.19]) k.cyl(shelf, 0.12, 0.10, 0.25, [dx, 0.22, 0.03], 'cream', 12);
    }
    const basin = piece('sink', 'Ceramic sink and tap', [-0.17, 1.38, -0.99]);
    k.box(basin, [0.62, 0.13, 0.48], [0, 0, 0], 'white', 0.055);
    k.box(basin, [0.43, 0.025, 0.29], [0, 0.079, 0.025], 'glass', 0.05);
    k.beam(basin, [0, 0.06, -0.18], [0, 0.43, -0.18], 0.055, 'gold');
    k.beam(basin, [0, 0.43, -0.18], [0, 0.43, 0.06], 0.055, 'gold');
    const table = piece('table', 'Oak dining table', [0.36, 1.08, 0.48]);
    k.box(table, [1.29, 0.16, 0.85], [0, 0, 0], 'wood', 0.045);
    for (const x of [-0.48, 0.48]) for (const z of [-0.26, 0.26]) k.box(table, [0.11, 0.74, 0.11], [x, -0.42, z], 'wood', 0.025);
    for (const s of [-1, 1]) {
      const chair = piece(`chair-${s}`, 'Little dining chair', [0.36 + s * 0.93, 0.66, 0.48]);
      k.box(chair, [0.50, 0.13, 0.49], [0, 0, 0], 'coral', 0.03);
      k.box(chair, [0.48, 0.56, 0.10], [0, 0.31, -0.21], 'coral', 0.03);
      for (const x of [-0.18, 0.18]) for (const z of [-0.17, 0.17]) k.box(chair, [0.075, 0.39, 0.075], [x, -0.23, z], 'wood');
    }
    for (let i = 0; i < 5; i++) {
      const stair = piece(`stair-${i}`, 'Loft stair tread', [1.58, 0.35 + i * 0.29, 0.92 - i * 0.34]);
      k.box(stair, [0.60, 0.15, 0.43], [0, 0, 0], 'wood', 0.025);
      k.box(stair, [0.54, 0.26, 0.07], [0, -0.17, -0.15], 'cream', 0.015);
    }
    const hearth = piece('hearth', 'Hearth and chimney flue', [-1.64, 0.78, -0.08]);
    k.box(hearth, [0.48, 0.87, 0.72], [0, 0, 0], 'coral', 0.04);
    k.box(hearth, [0.50, 0.32, 0.38], [0, -0.10, 0.28], 'dark', 0.045);
    k.cyl(hearth, 0.12, 0.15, 1.37, [0, 0.98, -0.15], 'dark', 12);
    return;
  }
  if (shipStage) {
    const liner = index === 10, cargo = index === 8;
    const length = liner ? 10.7 : cargo ? 9.8 : 8.4, h = liner ? 1.45 : 1.25;
    // A continuous bilge deck above the keel, with seams at the removable bays.
    // The narrow lower deck stays inside the sloping ribs instead of penetrating them.
    for (let bay = -2; bay <= 2; bay++) {
      const floor = piece(`bilge-floor-${bay}`, 'Lower hold floor plate', [bay * length * 0.14, 0.50, 0]);
      k.box(floor, [length * 0.137, 0.08, 1.40], [0, 0, 0], 'dark', 0.015);
      for (const z of [-0.62, 0.62]) k.box(floor, [length * 0.13, 0.018, 0.035], [0, 0.05, z], 'gold');
    }
    const bulkhead = (id: string, x: number, y: number, depth: number, height: number) => {
      const g = piece(id, 'Watertight bulkhead with closed door', [x, y, 0]);
      const jamb = (depth - 0.42) / 2;
      for (const side of [-1, 1]) k.box(g, [0.085, height, jamb], [0, 0, side * (0.21 + jamb / 2)], 'cream', 0.014);
      k.box(g, [0.085, 0.11, 0.42], [0, height / 2 - 0.055, 0], 'cream', 0.014);
      k.box(g, [0.09, height - 0.075, 0.45], [0, -0.035, 0], 'teal');
      return g;
    };
    for (const x of [-length * 0.35, -length * 0.06, length * 0.35]) bulkhead(`hold-bulkhead-${x}`, x, 0.95, 1.42, 0.78);
    // Each complete piece is a functional, removable assembly, not decorative
    // geometry fused to the shell. Keep the center passage open between machines.
    for (const side of [-1, 1]) {
      const engine = piece(`diesel-${side}`, side < 0 ? 'Port marine diesel engine' : 'Starboard marine diesel engine', [-length * 0.22, 0.69, side * 0.40]);
      k.box(engine, [1.12, 0.25, 0.42], [0, 0, 0], 'teal', 0.04);
      k.box(engine, [1.20, 0.08, 0.46], [0, -0.11, 0], 'dark', 0.02);
      for (const x of [-0.36, 0, 0.36]) {
        k.cyl(engine, 0.13, 0.15, 0.20, [x, 0.20, 0], 'stone', 10);
        k.box(engine, [0.23, 0.06, 0.27], [x, 0.32, 0], 'coral', 0.025);
      }
      const shaft = k.cyl(engine, 0.08, 0.08, 0.30, [-0.69, -0.01, 0], 'gold', 12); shaft.rotation.z = Math.PI / 2;
      const manifold = k.cyl(engine, 0.048, 0.048, 0.96, [0, 0.22, side * 0.18], 'gold', 10); manifold.rotation.z = Math.PI / 2;
      const generator = piece(`generator-${side}`, 'Auxiliary generator and switchboard', [-length * 0.10, 0.76, side * 0.45]);
      const motor = k.cyl(generator, 0.16, 0.16, 0.46, [0, 0, 0], 'navy', 12); motor.rotation.z = Math.PI / 2;
      k.box(generator, [0.49, 0.08, 0.37], [0, -0.18, 0], 'dark', 0.015);
      k.box(generator, [0.30, 0.17, 0.27], [0, 0.18, 0], 'cream', 0.015);
      for (const x of [-0.08, 0.08]) k.box(generator, [0.055, 0.055, 0.035], [x, 0.20, side * 0.15], 'glass');
      const pipe = piece(`cooling-main-${side}`, 'Cooling main with shutoff valve', [-length * 0.22, 1.14, side * 0.87]);
      const run = k.cyl(pipe, 0.055, 0.055, 1.22, [0, 0, 0], 'gold', 12); run.rotation.z = Math.PI / 2;
      for (const x of [-0.48, 0.48]) k.box(pipe, [0.09, 0.24, 0.22], [x, -0.09, 0], 'cream', 0.012);
      k.cyl(pipe, 0.052, 0.052, 0.18, [0, 0.08, 0], 'dark', 10);
      k.torus(pipe, 0.12, 0.026, [0, 0.18, 0], 'coral', [Math.PI / 2, 0, 0]);
    }
    const cargoCrate = (id: string, x: number, z: number, role: Role, tall = false) => {
      const crate = piece(id, cargo ? 'Lashed cargo crate on pallet' : 'Luggage trunk and stowage rack', [x, 0.79, z]);
      const height = tall ? 0.55 : 0.40;
      k.box(crate, [0.63, height, 0.50], [0, height / 2 - 0.22, 0], role, 0.025);
      for (const xx of [-0.23, 0.23]) k.box(crate, [0.08, height + 0.03, 0.53], [xx, height / 2 - 0.22, 0], 'wood', 0.01);
      k.box(crate, [0.69, 0.065, 0.56], [0, -0.22, 0], 'wood', 0.01);
    };
    if (cargo) {
      for (const x of [0.30, 1.14, 1.98]) for (const side of [-1, 1]) cargoCrate(`freight-${x}-${side}`, x, side * 0.40, x < 1 ? 'coral' : 'wood', x === 1.14);
      const winch = piece('hold-winch', 'Cargo winch with cable drum', [2.84, 0.82, 0]);
      const drum = k.cyl(winch, 0.20, 0.20, 0.54, [0, 0, 0], 'gold', 16); drum.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) k.box(winch, [0.55, 0.39, 0.10], [0, -0.05, side * 0.34], 'teal', 0.025);
      k.box(winch, [0.65, 0.07, 0.82], [0, -0.24, 0], 'dark', 0.015);
    } else {
      for (const side of [-1, 1]) {
        cargoCrate(`luggage-${side}`, length * 0.22, side * 0.39, 'wood');
        const tank = piece(`freshwater-${side}`, 'Fresh water tank and filler', [length * 0.10, 0.88, side * 0.40]);
        const body = k.cyl(tank, 0.22, 0.22, 0.66, [0, 0, 0], 'cream', 16); body.rotation.z = Math.PI / 2;
        for (const x of [-0.25, 0.25]) k.box(tank, [0.07, 0.29, 0.45], [x, -0.20, 0], 'navy', 0.015);
        k.cyl(tank, 0.065, 0.065, 0.10, [0, 0.27, 0], 'gold', 10);
      }
      if (liner) {
        const boiler = piece('steam-boiler', 'Steam boiler and pressure manifold', [length * 0.30, 0.92, 0]);
        const drum = k.cyl(boiler, 0.28, 0.28, 0.68, [0, 0, 0], 'coral', 16); drum.rotation.z = Math.PI / 2;
        for (const x of [-0.24, 0.24]) k.box(boiler, [0.11, 0.30, 0.58], [x, -0.24, 0], 'dark', 0.015);
        k.cyl(boiler, 0.08, 0.08, 0.17, [0, 0.35, 0], 'gold', 10);
      }
    }
    const seat = (id: string, x: number, floor: number, z: number, side: number, role: Role = 'teal') => {
      const g = piece(id, 'Passenger bench with backrest', [x, floor + 0.16, z]);
      k.box(g, [0.58, 0.09, 0.35], [0, 0, 0], role, 0.025);
      k.box(g, [0.58, 0.24, 0.075], [0, 0.10, side * 0.15], role, 0.018);
      for (const dx of [-0.20, 0.20]) k.box(g, [0.075, 0.13, 0.26], [dx, -0.095, 0], 'gold', 0.01);
    };
    const berth = (id: string, x: number, floor: number, z: number, side: number) => {
      const g = piece(id, 'Cabin berth, pillow and headboard', [x, floor + 0.11, z]);
      k.box(g, [0.84, 0.15, 0.41], [0, 0, 0], 'wood', 0.022);
      k.box(g, [0.79, 0.08, 0.38], [0, 0.115, 0], 'cream', 0.025);
      k.box(g, [0.18, 0.045, 0.30], [-0.26, 0.18, 0], 'white', 0.017);
      k.box(g, [0.32, 0.02, 0.39], [0.20, 0.165, 0], 'coral', 0.006);
      k.box(g, [0.06, 0.33, 0.45], [-0.42, 0.08, 0], 'wood', 0.012);
      if (!cargo) k.box(g, [0.19, 0.25, 0.18], [0.55, 0.01, side * 0.10], 'teal', 0.017);
    };
    const helm = (id: string, x: number, floor: number, z: number) => {
      const g = piece(id, 'Navigation console and helm wheel', [x, floor + 0.16, z]);
      k.box(g, [0.48, 0.29, 0.59], [0, 0, 0], 'teal', 0.025);
      k.box(g, [0.52, 0.055, 0.65], [0, 0.17, 0], 'wood', 0.015);
      for (const zz of [-0.17, 0.17]) k.box(g, [0.23, 0.022, 0.15], [0.03, 0.21, zz], 'glass', 0.008);
      k.torus(g, 0.14, 0.027, [-0.31, 0.13, 0], 'gold', [0, Math.PI / 2, 0]);
      k.beam(g, [-0.31, 0.02, 0], [-0.31, 0.24, 0], 0.022, 'gold');
    };
    if (cargo) {
      const crewFloor = h + 0.50, bridgeFloor = h + 1.38;
      // Bunks and galley occupy opposite sides of the compact aft house.
      berth('crew-berth', -3.50, crewFloor, -0.53, -1);
      const galley = piece('crew-galley', 'Crew galley and mess shelf', [-3.53, crewFloor + 0.18, 0.57]);
      k.box(galley, [0.69, 0.32, 0.34], [0, 0, 0], 'teal', 0.025);
      k.box(galley, [0.74, 0.055, 0.40], [0, 0.19, 0], 'cream', 0.015);
      k.cyl(galley, 0.10, 0.10, 0.025, [-0.17, 0.23, 0], 'dark', 12);
      helm('cargo-helm', -3.36, bridgeFloor, 0);
      const chart = piece('cargo-chart', 'Bridge chart locker', [-3.60, bridgeFloor + 0.19, -0.60]);
      k.box(chart, [0.57, 0.33, 0.26], [0, 0, 0], 'wood', 0.018);
      k.box(chart, [0.51, 0.022, 0.23], [0, 0.18, 0], 'cream');
    } else {
      const floor = h + 0.50;
      if (liner) {
        // Restaurant forward; cabins aft, with a central longitudinal corridor.
        for (const side of [-1, 1]) for (const x of [-2.38, -0.90]) berth(`passenger-berth-${x}-${side}`, x, floor, side * 0.65, side);
        for (const x of [-1.66, -0.08]) bulkhead(`cabin-divider-${x}`, x, floor + 0.23, 1.98, 0.46);
        for (const x of [0.73, 1.67, 2.61]) {
          const table = piece(`dining-table-${x}`, 'Ocean restaurant table', [x, floor + 0.24, 0]);
          k.box(table, [0.61, 0.07, 0.64], [0, 0, 0], 'cream', 0.035);
          k.cyl(table, 0.055, 0.09, 0.19, [0, -0.13, 0], 'gold', 10);
          k.cyl(table, 0.19, 0.19, 0.035, [0, -0.235, 0], 'wood', 12);
          for (const side of [-1, 1]) seat(`dining-seat-${x}-${side}`, x, floor, side * 0.65, side, 'coral');
        }
      } else {
        for (const x of [-1.96, -0.98, 0, 0.98]) for (const side of [-1, 1]) seat(`ferry-seat-${x}-${side}`, x, floor, side * 0.65, side);
        const kiosk = piece('ferry-kiosk', 'Passenger snack counter', [2.06, floor + 0.19, -0.38]);
        k.box(kiosk, [0.56, 0.33, 0.86], [0, 0, 0], 'wood', 0.025);
        k.box(kiosk, [0.63, 0.06, 0.92], [0, 0.20, 0], 'cream', 0.02);
        k.cyl(kiosk, 0.085, 0.085, 0.12, [0, 0.29, -0.20], 'gold', 10);
      }
      const upperFloor = floor + 0.72;
      for (const side of [-1, 1]) {
        const x = liner ? -2.01 : -1.47;
        berth(`crew-berth-${side}`, x, upperFloor, side * 0.57, side);
      }
      bulkhead('upper-accommodation-divider', liner ? -1.16 : -0.59, upperFloor + 0.23, liner ? 1.79 : 1.69, 0.46);
      for (const side of [-1, 1]) seat(`upper-lounge-${side}`, liner ? 0 : 0.18, upperFloor, side * 0.54, side, 'coral');
      if (liner) {
        const lounge = piece('piano', 'Promenade piano and keyboard', [1.77, upperFloor + 0.20, -0.42]);
        k.box(lounge, [0.72, 0.35, 0.61], [0, 0, 0], 'wood', 0.045);
        k.box(lounge, [0.62, 0.045, 0.18], [0, 0.08, 0.37], 'cream', 0.012);
        for (let key = 0; key < 6; key++) k.box(lounge, [0.027, 0.025, 0.10], [-0.25 + key * 0.09, 0.115, 0.33], 'dark');
        const bridgeFloor = floor + 1.44;
        helm('liner-helm', 1.96, bridgeFloor, 0);
        for (const side of [-1, 1]) {
          const chart = piece(`navigation-${side}`, side < 0 ? 'Chart table and map' : 'Radio communications desk', [-0.55, bridgeFloor + 0.20, side * 0.51]);
          k.box(chart, [1.07, 0.32, 0.38], [0, -0.025, 0], side < 0 ? 'wood' : 'teal', 0.02);
          k.box(chart, [1.11, 0.065, 0.42], [0, 0.17, 0], 'cream', 0.015);
          k.box(chart, [0.48, side < 0 ? 0.023 : 0.13, 0.25], [0, side < 0 ? 0.217 : 0.27, 0], side < 0 ? 'glass' : 'dark', 0.01);
        }
      } else helm('ferry-helm', 1.49, upperFloor, 0);
    }
    return;
  }
  if (pavilion) {
    const stories = index === 11 ? 3 : 2;
    for (let t = 0; t < stories; t++) {
      const y = 0.56 + t * 1.53, scale = 1 - t * 0.16;
      for (const x of [-0.72, 0.72]) for (const z of [-0.42, 0.42]) {
        const mat = piece(`mat-${t}-${x}-${z}`, 'Woven floor panel', [x * scale, y, z * scale]);
        k.box(mat, [1.30 * scale, 0.10, 0.72 * scale], [0, 0, 0], 'jade', 0.03);
        for (const dx of [-0.59, 0.59]) k.box(mat, [0.045, 0.015, 0.67 * scale], [dx * scale, 0.061, 0], 'gold');
      }
      const altar = piece(`altar-${t}`, 'Lacquer altar table', [0, y + 0.40, -0.46]);
      k.box(altar, [1.18 * scale, 0.15, 0.56], [0, 0, 0], 'red', 0.04);
      for (const x of [-0.43, 0.43]) k.box(altar, [0.10, 0.30, 0.35], [x * scale, -0.22, 0], 'gold', 0.02);
      for (const x of [-0.74, 0.74]) {
        const lantern = piece(`lantern-${t}-${x}`, 'Paper lantern and bracket', [x * scale, y + 0.78, 0]);
        k.box(lantern, [0.45, 0.58, 0.42], [0, 0, 0], 'cream', 0.065);
        for (const h of [-0.3, 0.3]) k.box(lantern, [0.50, 0.075, 0.47], [0, h, 0], 'gold', 0.025);
      }
    }
    return;
  }
  // Towers conceal a winding service stair and separately removable instruments.
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 3, r = index === 6 ? 0.91 : 0.51;
    const tread = piece(`service-stair-${i}`, 'Spiral service stair', [Math.sin(angle) * r, 0.35 + i * 0.23, Math.cos(angle) * r]);
    tread.rotation.y = angle;
    k.box(tread, [0.62, 0.12, 0.46], [0, 0, 0], 'wood', 0.025);
    k.box(tread, [0.08, 0.41, 0.08], [0, 0.17, -0.16], 'gold', 0.01);
  }
  for (let i = 0; i < 4; i++) {
    const gauge = piece(`instrument-${i}`, 'Brass service instrument', [(i % 2 ? 1 : -1) * 0.32, 0.72 + Math.floor(i / 2) * 1.04, 0]);
    k.box(gauge, [0.53, 0.38, 0.43], [0, 0, 0], 'teal', 0.055);
    k.torus(gauge, 0.12, 0.025, [0, 0, 0.23], 'gold');
    k.mesh(gauge, new THREE.CircleGeometry(0.10, 16), 'cream', [0, 0, 0.235]);
  }
}

type AssemblyMesh = { geometry: THREE.BufferGeometry; material: THREE.Material };
type PanelLeaf = { source: StructurePart; meshes: AssemblyMesh[]; bounds: THREE.Box3; serial: string; keep: boolean };

const SOLID_EPSILON = 1e-7;
const pointKey = (p: number[]) => p.map(v => Math.round(v / SOLID_EPSILON)).join(',');
type SolidVertex = { p: number[]; n: number[] };

function geometryFromTriangles(positions: number[], normals?: number[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(new Float64Array(positions), 3));
  if (normals) result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  else result.computeVertexNormals();
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

/** Translate a skin inward, reverse its back, and join every boundary edge.
 * Welding positions (not normals/UVs) preserves hard corners and sphere seams. */
export function thickenSurface(geometry: THREE.BufferGeometry, inset: (p: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = flat.getAttribute('position'), out: number[] = [];
  const boundary = new Map<string, { a: number[]; b: number[]; count: number }>();
  const inner = (p: number[]) => inset(new THREE.Vector3(...p as V3)).toArray();
  for (let i = 0; i < positions.count; i += 3) {
    const tri = [0, 1, 2].map(j => [positions.getX(i+j), positions.getY(i+j), positions.getZ(i+j)]);
    const ab = new THREE.Vector3(...tri[1] as V3).sub(new THREE.Vector3(...tri[0] as V3));
    const ac = new THREE.Vector3(...tri[2] as V3).sub(new THREE.Vector3(...tri[0] as V3));
    if (ab.cross(ac).lengthSq() < 1e-20) continue;
    out.push(...tri[0], ...tri[1], ...tri[2], ...inner(tri[0]), ...inner(tri[2]), ...inner(tri[1]));
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j+1)%3], key = [pointKey(a), pointKey(b)].sort().join('/');
      const edge = boundary.get(key);
      if (edge) edge.count++; else boundary.set(key, { a, b, count: 1 });
    }
  }
  for (const { a, b, count } of boundary.values()) if (count === 1) {
    const ai = inner(a), bi = inner(b);
    out.push(...a, ...ai, ...b, ...b, ...ai, ...bi);
  }
  if (flat !== geometry) flat.dispose();
  geometry.dispose();
  return geometryFromTriangles(out);
}

function closeTubeEnds(geometry: THREE.TubeGeometry): THREE.BufferGeometry {
  const flat = geometry.toNonIndexed(), positions = Array.from(flat.getAttribute('position').array), normals = Array.from(flat.getAttribute('normal').array);
  const indexed = geometry.getAttribute('position'), { tubularSegments, radialSegments } = geometry.parameters;
  for (const end of [0, tubularSegments]) {
    const ring = Array.from({ length: radialSegments }, (_, j) => new THREE.Vector3().fromBufferAttribute(indexed, end * (radialSegments + 1) + j));
    const center = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    const normal = geometry.tangents[end].clone().multiplyScalar(end === 0 ? -1 : 1);
    for (let j = 0; j < ring.length; j++) {
      let a = ring[j], b = ring[(j+1)%ring.length];
      if (a.clone().sub(center).cross(b.clone().sub(center)).dot(normal) < 0) [a, b] = [b, a];
      positions.push(...center.toArray(), ...a.toArray(), ...b.toArray());
      for (let k = 0; k < 3; k++) normals.push(...normal.toArray());
    }
  }
  geometry.dispose(); flat.dispose();
  return geometryFromTriangles(positions, normals);
}

/** Clip one authored solid, then triangulate its section with nested holes.
 * Each cap faces out of its retained half; no double-sided rendering is needed. */
export function cutGeometry(geo: THREE.BufferGeometry, axis: number, cut: number, positive: boolean): THREE.BufferGeometry | null {
  geo.computeBoundingBox();
  const minimum = geo.boundingBox!.min.getComponent(axis), maximum = geo.boundingBox!.max.getComponent(axis);
  // A coincident end face has no volume on the discarded side. Do not leave
  // that face behind as a paper-thin component, or recut untouched trim solids.
  if (positive ? maximum <= cut + SOLID_EPSILON : minimum >= cut - SOLID_EPSILON) return null;
  if (positive ? minimum >= cut : maximum <= cut) return geo.clone();
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const p = flat.getAttribute('position'), n = flat.getAttribute('normal');
  const outP: number[] = [], outN: number[] = [];
  const edges = new Map<string, { a: number[]; b: number[]; count: number }>();
  const weldBuckets = new Map<string, number[][]>();
  const exactPoints = new Map<string, number[]>();
  const weld = (point: number[]): number[] => {
    if (Math.abs(point[axis]-cut)>SOLID_EPSILON) return point;
    const exactKey=point.join(','); const exact=exactPoints.get(exactKey);if(exact)return exact;
    const cell=point.map(v=>Math.floor(v/SOLID_EPSILON));
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
      const candidates=weldBuckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','));
      const match=candidates?.find(p=>p.every((v,i)=>Math.abs(v-point[i])<SOLID_EPSILON));
      if(match){exactPoints.set(exactKey,match);return match;}
    }
    const key=cell.join(',');if(!weldBuckets.has(key))weldBuckets.set(key,[]);weldBuckets.get(key)!.push(point);exactPoints.set(exactKey,point);return point;
  };
  const pushTriangle = (a: SolidVertex, b: SolidVertex, c: SolidVertex) => {
    for (const vertex of [a,b,c]) vertex.p=weld(vertex.p);
    const ab = new THREE.Vector3(...b.p as V3).sub(new THREE.Vector3(...a.p as V3));
    const ac = new THREE.Vector3(...c.p as V3).sub(new THREE.Vector3(...a.p as V3));
    if (ab.cross(ac).lengthSq() < 1e-30) return;
    for (const v of [a, b, c]) { outP.push(...v.p); outN.push(...v.n); }
    for (const [v, w] of [[a, b], [b, c], [c, a]]) {
      if (Math.abs(v.p[axis]-cut)>SOLID_EPSILON || Math.abs(w.p[axis]-cut)>SOLID_EPSILON) continue;
      const ka = pointKey(v.p), kb = pointKey(w.p); if (ka === kb) continue;
      const key = [ka, kb].sort().join('/'), edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { a: v.p, b: w.p, count: 1 });
    }
  };
  const distance = (v: SolidVertex) => (v.p[axis] - cut) * (positive ? 1 : -1);
  for (let i = 0; i < p.count; i += 3) {
    const tri: SolidVertex[] = [0, 1, 2].map(j => ({ p: [p.getX(i+j), p.getY(i+j), p.getZ(i+j)], n: [n.getX(i+j), n.getY(i+j), n.getZ(i+j)] }));
    // Snap a near-coplanar vertex consistently in both children.
    for (const v of tri) if (Math.abs(v.p[axis]-cut) < SOLID_EPSILON) v.p[axis] = cut;
    const clipped: SolidVertex[] = [];
    for (let j = 0; j < 3; j++) {
      const v = tri[j], next = tri[(j+1)%3], d = distance(v), dn = distance(next);
      if (d >= 0) clipped.push(v);
      if ((d > 0 && dn < 0) || (d < 0 && dn > 0)) {
        const t = d / (d - dn);
        const position = v.p.map((v0,k) => v0 + (next.p[k] - v0) * t); position[axis] = cut;
        const normal = new THREE.Vector3(...v.n.map((v0,k) => v0 + (next.n[k] - v0) * t) as V3).normalize().toArray();
        clipped.push({ p: position, n: normal });
      }
    }
    for (let j = 1; j + 1 < clipped.length; j++) pushTriangle(clipped[0], clipped[j], clipped[j+1]);
  }
  if (flat !== geo) flat.dispose();
  if (!outP.length) return null;
  const boundary = [...edges.values()].filter(e => e.count === 1);
  const neighbors = new Map<string, number[]>();
  boundary.forEach((edge, index) => { for (const point of [edge.a, edge.b]) { const key=pointKey(point); if (!neighbors.has(key)) neighbors.set(key, []); neighbors.get(key)!.push(index); } });
  const used = new Set<number>(), loops: number[][][] = [];
  for (let start = 0; start < boundary.length; start++) {
    if (used.has(start)) continue;
    const first = boundary[start].a, loop = [first]; let cursor = boundary[start].b;
    used.add(start);
    while (pointKey(cursor) !== pointKey(first)) {
      loop.push(cursor);
      const next = neighbors.get(pointKey(cursor))?.find(index => !used.has(index));
      if (next === undefined) { throw new Error(`Open source volume encountered while closing a panel: axis=${axis} cut=${cut} at=${pointKey(cursor)} edges=${boundary.length}`); }
      used.add(next); const edge = boundary[next]; cursor = pointKey(edge.a) === pointKey(cursor) ? edge.b : edge.a;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  const u = (axis+1)%3, v = (axis+2)%3;
  const contours = loops.map(loop => loop.map(p => new THREE.Vector2(p[u], p[v])));
  const contains = (polygon: THREE.Vector2[], point: THREE.Vector2) => {
    let inside = false;
    for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const a=polygon[i],b=polygon[j];
      if ((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  };
  const areas=contours.map(c=>Math.abs(THREE.ShapeUtils.area(c)));
  const parents=contours.map((c,i)=> {
    let parent=-1;
    for(let j=0;j<contours.length;j++) if(areas[j]>areas[i] && contains(contours[j],c[0]) && (parent<0||areas[j]<areas[parent])) parent=j;
    return parent;
  });
  const depth=(i:number):number=>parents[i]<0?0:1+depth(parents[i]);
  const capNormal=[0,0,0]; capNormal[axis]=positive?-1:1;
  const addCap = (a: number[], b: number[], c: number[]) => {
    const cross=(b[u]-a[u])*(c[v]-a[v])-(b[v]-a[v])*(c[u]-a[u]);
    if(Math.abs(cross)<1e-24)return;
    for(const point of [a,b,c]) { outP.push(...point);outN.push(...capNormal); }
  };
  for(let i=0;i<loops.length;i++) {
    if(depth(i)%2)continue;
    const holes=loops.map((_,j)=>j).filter(j=>parents[j]===i && depth(j)%2===1);
    const simplify = (loop: number[][]) => {
      const points=[...loop]; let changed=true;
      while(changed && points.length>3) {
        changed=false;
        for(let j=0;j<points.length;j++) {
          const a=points[(j+points.length-1)%points.length],b=points[j],c=points[(j+1)%points.length];
          const dx=c[u]-a[u],dy=c[v]-a[v],length=Math.hypot(dx,dy);
          const projection=(b[u]-a[u])*dx+(b[v]-a[v])*dy;
          if(length>0 && projection>=0 && projection<=length*length && Math.abs((b[u]-a[u])*dy-(b[v]-a[v])*dx)<1e-7*length) {
            points.splice(j,1);changed=true;break;
          }
        }
      }
      return points;
    };
    const rings=[loops[i],...holes.map(j=>loops[j])], simple=rings.map(simplify);
    const points=simple.flat(), boundaryPoints=rings.flat();
    const projected=simple.map(ring=>ring.map(p=>new THREE.Vector2(p[u],p[v])));
    const faces=THREE.ShapeUtils.triangulateShape(projected[0],projected.slice(1));
    for(const face of faces) {
      // Earcut can omit collinear boundary vertices. Reinsert them along each
      // triangle edge so later cuts still see a watertight, conforming mesh.
      const triangle=face.map(index=>points[index]), outline:number[][]=[];
      const [a,b,c]=triangle;
      if(((b[u]-a[u])*(c[v]-a[v])-(b[v]-a[v])*(c[u]-a[u]))*capNormal[axis]<0)triangle.reverse();
      for(let e=0;e<3;e++) {
        const a=triangle[e],b=triangle[(e+1)%3],dx=b[u]-a[u],dy=b[v]-a[v],length=dx*dx+dy*dy;
        outline.push(a);
        const intermediate=boundaryPoints.map(p=>({p,t:((p[u]-a[u])*dx+(p[v]-a[v])*dy)/length})).filter(({p,t})=>t>1e-7&&t<1-1e-7&&Math.abs((p[u]-a[u])*dy-(p[v]-a[v])*dx)<1e-6*Math.sqrt(length)).sort((a,b)=>a.t-b.t);
        for(const item of intermediate) if(pointKey(outline[outline.length-1])!==pointKey(item.p))outline.push(item.p);
      }
      if(outline.length===3)addCap(...triangle as [number[],number[],number[]]);
      else {
        const center=[0,0,0]; for(const p of triangle)for(let k=0;k<3;k++)center[k]+=p[k]/3;
        for(let j=0;j<outline.length;j++)addCap(center,outline[j],outline[(j+1)%outline.length]);
      }
    }
  }
  const result = geometryFromTriangles(outP, outN);
  result.userData = { ...geo.userData };
  return result;
}

function leafBounds(meshes: AssemblyMesh[]): THREE.Box3 {
  const result = new THREE.Box3();
  for (const m of meshes) { m.geometry.computeBoundingBox(); result.union(m.geometry.boundingBox!); }
  return result;
}

function componentize(definition: StructureDefinition, index: number): StructureDefinition {
  const target = [78, 84, 90, 96, 102, 126, 110, 116, 145, 126, 168, 138, 300, 240, 260, 320, 320, 400, 280, 360][index];
  const leaves: PanelLeaf[] = [];
  for (const source of definition.parts) {
    const components = new Map<string, AssemblyMesh[]>();
    for (const child of source.group.children) if (child instanceof THREE.Mesh) {
      const component = String(child.userData.component ?? '');
      if (!components.has(component)) components.set(component, []);
      components.get(component)!.push({ geometry: child.geometry, material: child.material as THREE.Material });
    }
    for (const [name, meshes] of components) leaves.push({ source, meshes, bounds: leafBounds(meshes), serial: name || 'panel', keep: !!name || !!source.group.userData.keepAssembly });
  }
  while (leaves.length < target) {
    let best = -1, bestScore = 0, splitAxis = 0;
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]; if (leaf.keep) continue;
      const size = leaf.bounds.getSize(new THREE.Vector3()).toArray();
      const axes = [0,1,2].sort((a,b) => size[b] - size[a]);
      const score = size[axes[0]] * Math.max(0.28, size[axes[1]]);
      if (size[axes[0]] > 0.45 && score > bestScore) { best = i; bestScore = score; splitAxis = axes[0]; }
    }
    if (best < 0) break;
    const leaf = leaves[best], cut = (leaf.bounds.min.getComponent(splitAxis) + leaf.bounds.max.getComponent(splitAxis)) / 2;
    const children: PanelLeaf[] = [];
    for (const positive of [false, true]) {
      const meshes: AssemblyMesh[] = [];
      for (const item of leaf.meshes) { let geometry: THREE.BufferGeometry | null; try { geometry = cutGeometry(item.geometry, splitAxis, cut, positive); } catch (error) { throw new Error(`${leaf.source.id}/${leaf.serial}/${item.material.name}: ${error}`); } if (geometry) meshes.push({ geometry, material: item.material }); }
      if (meshes.length) children.push({ ...leaf, meshes, bounds: leafBounds(meshes), serial: `${leaf.serial}${positive?'b':'a'}` });
    }
    if (children.length < 2) { leaf.keep = true; continue; }
    leaves.splice(best, 1, ...children);
    for (const item of leaf.meshes) item.geometry.dispose();
  }
  definition.root.clear();
  // One PBR draw per detachable component. Vertex attributes preserve the exact
  // original material roles, including matte plaster, blue glass and brass.
  const surfaceMaterial = createSurfaceMaterial();
  definition.parts = leaves.map((leaf, i) => {
    const center = leaf.bounds.getCenter(new THREE.Vector3());
    const group = new THREE.Group(); group.name = `${leaf.source.name} · ${leaf.serial}`;
    group.position.copy(center).applyQuaternion(leaf.source.group.quaternion).add(leaf.source.group.position);
    group.quaternion.copy(leaf.source.group.quaternion);
    const id = `${leaf.source.id}-${leaf.serial}-${i}`; group.userData.partId = id;
    group.userData.isFoundation = !!leaf.source.isFoundation;
    const componentGeometry: THREE.BufferGeometry[] = [];
    for (const item of leaf.meshes) {
      const geometry = item.geometry.clone(); geometry.translate(-center.x,-center.y,-center.z);
      // Cut components retain their exact adjoining surfaces. Shrinking each
      // panel opens seams that reveal rooms and allow access to hidden screws.
      // Keep clipping in double precision; upload ordinary Float32 vertices only once.
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometry.getAttribute('position').array, 3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const material = item.material as THREE.MeshStandardMaterial, count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3), surfaces = new Float32Array(count * 4), materialPositions = new Float32Array(count * 3);
      const woodColor = new THREE.Color(C.wood), normals = geometry.getAttribute('normal');
      const profile = materialProfile(material.name, leaf.source.name, index), originalPositions = item.geometry.getAttribute('position');
      for (let v=0;v<count;v++) {
        const underside = geometry.userData.woodUnderside && normals.getY(v) < -0.05;
        const color = underside ? woodColor : material.color;
        colors[v*3]=color.r; colors[v*3+1]=color.g; colors[v*3+2]=color.b;
        surfaces.set(underside ? materialProfile('wood', leaf.source.name, index) : profile, v * 4);
        materialPositions[v*3] = originalPositions.getX(v) + leaf.source.group.position.x;
        materialPositions[v*3+1] = originalPositions.getY(v) + leaf.source.group.position.y;
        materialPositions[v*3+2] = originalPositions.getZ(v) + leaf.source.group.position.z;
      }
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3)); geometry.setAttribute('surface',new THREE.BufferAttribute(surfaces,4));
      geometry.setAttribute('materialPosition',new THREE.BufferAttribute(materialPositions,3));
      componentGeometry.push(geometry);
    }
    const combined = mergeGeometries(componentGeometry,false)!; combined.computeBoundingBox();combined.computeBoundingSphere();componentGeometry.forEach(g=>g.dispose());
    const mesh = new THREE.Mesh(combined,surfaceMaterial);mesh.name=group.name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.partId=id;group.add(mesh);
    definition.root.add(group);
    const size = leaf.bounds.getSize(new THREE.Vector3()).toArray().sort((a,b)=>b-a);
    return { id, name: group.name, group, screws: [], layer: leaf.source.layer, isFoundation: leaf.source.isFoundation, boltScale: Math.max(0.38,Math.min(0.64,size[1]*0.55)) };
  });
  definition.root.updateMatrixWorld(true);
  planVisibleFasteners(definition);
  return definition;
}

type FastenerCandidate = { local: THREE.Vector3; normal: THREE.Vector3; world: THREE.Vector3; blockers: Set<string> };

/** A geometric witness order only: the engine may remove ANY currently visible screw. */
function planVisibleFasteners(definition: StructureDefinition): void {
  const meshes: THREE.Object3D[] = definition.parts.flatMap(p => p.group.children);
  const candidateMap = new Map<string, FastenerCandidate[]>();
  const ray = new THREE.Raycaster();
  for (const part of definition.parts) {
    const inverse = part.group.matrixWorld.clone().invert(), bounds = new THREE.Box3();
    for (const child of part.group.children) if (child instanceof THREE.Mesh) bounds.union(child.geometry.boundingBox!);
    const size = bounds.getSize(new THREE.Vector3()), list: FastenerCandidate[] = [];
    for (const axis of [2,0,1]) for (const sign of [1,-1]) {
      if (axis===1 && sign===-1) continue;
      const other = [0,1,2].filter(a=>a!==axis);
      for (const u of [0.18,0.36,0.64,0.82]) for (const v of [0.23,0.5,0.77]) {
        const origin = bounds.min.clone(); origin.setComponent(axis, sign>0?bounds.max.getComponent(axis)+0.2:bounds.min.getComponent(axis)-0.2);
        origin.setComponent(other[0],bounds.min.getComponent(other[0])+size.getComponent(other[0])*u);
        origin.setComponent(other[1],bounds.min.getComponent(other[1])+size.getComponent(other[1])*v);
        const direction = new THREE.Vector3().setComponent(axis,-sign).transformDirection(part.group.matrixWorld);
        ray.set(origin.applyMatrix4(part.group.matrixWorld),direction);ray.near=0;ray.far=30;
        const hit = ray.intersectObjects(part.group.children,false)[0];if(!hit||!hit.face)continue;
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(normal.y < -0.25)continue;
        const point = hit.point.clone().addScaledVector(normal,0.024);
        if(list.some(c=>c.world.distanceToSquared(point)<0.007))continue;
        const outward = normal.clone();
        if(outward.y>0.80)outward.add(new THREE.Vector3(0.23,0,0.39));else outward.add(new THREE.Vector3(0,0.48,0));
        outward.normalize();
        // Cast FROM the eye toward the head. An outward ray starting inside a
        // cabinet would miss its backfaces and incorrectly certify a buried bolt.
        const headPoint=point.clone().addScaledVector(normal,0.10*(part.boltScale??0.6));
        ray.set(headPoint.clone().addScaledVector(outward,30),outward.clone().negate());ray.near=0;ray.far=29.995;
        const intersections=ray.intersectObjects(meshes,false);
        if(intersections.some(h=>h.object.userData.partId===part.id))continue;
        const blockers=new Set(intersections.map(h=>String(h.object.userData.partId)));
        // A visible head is insufficient: the shaft must physically leave its
        // recess. Keep these dimensions in sync with the engine extraction guard.
        const scale=part.boltScale??0.6, extractionStart=point.clone().addScaledVector(normal,SCREW_HEAD_TOP*scale);
        const obstructions = extractionBlockers(extractionStart, normal, EXTRACTION_RADIUS*scale,
          meshes as THREE.Mesh[], SCREW_FULL_LENGTH*scale);
        // The mounting surface clears the head. Another face of the same fused
        // part may cover it, in which case this placement could never be removed.
        if(obstructions.some(mesh=>mesh.userData.partId===part.id))continue;
        for(const obstruction of obstructions)blockers.add(String(obstruction.userData.partId));
        list.push({local:point.clone().applyMatrix4(inverse),normal:normal.clone().transformDirection(inverse),world:point,blockers});
      }
    }
    candidateMap.set(part.id,list);
  }
  const removed = new Set<string>(), ordered: StructurePart[] = [];
  const pending=[...definition.parts].sort((a,b)=>Number(!!a.isFoundation)-Number(!!b.isFoundation)||a.layer-b.layer);
  while(pending.length){
    let chosen=-1,pair:FastenerCandidate[]=[];
    const foundationsOnly = pending.every(part => part.isFoundation);
    for(let i=0;i<pending.length;i++){
      const part=pending[i];
      if (part.isFoundation && !foundationsOnly) continue;
      const available=candidateMap.get(part.id)!.filter(c=>[...c.blockers].every(id=>removed.has(id)));
      let best=-1;
      for(let x=0;x<available.length;x++)for(let y=x+1;y<available.length;y++){
        const distance=available[x].world.distanceToSquared(available[y].world);
        // Favour pairs sharing a visible face; avoid opposite sides of a very small piece.
        const alignment=available[x].normal.dot(available[y].normal);
        const score=distance*(alignment>0.5?1:0.3);
        const minimumSpacing=0.50*(part.boltScale??0.6)+0.05;
        if(distance>minimumSpacing*minimumSpacing&&score>best){best=score;pair=[available[x],available[y]];chosen=i;}
      }
      if(chosen>=0)break;
    }
    if(chosen<0){
      const unresolved=pending.map(p=>`${p.id}:${candidateMap.get(p.id)!.length}`).join(', ');
      throw new Error(`No physical dismantling witness: ${unresolved}`);
    }
    const part=pending.splice(chosen,1)[0];
    part.screws=pair.map(c=>({position:c.local.toArray() as V3,normal:c.normal.toArray() as V3}));
    part.group.userData.witnessIndex=ordered.length;
    removed.add(part.id);ordered.push(part);
  }
  definition.parts=ordered;
  definition.root.userData.witnessPartIds=ordered.map(p=>p.id);
  definition.root.userData.screwCount=ordered.reduce((n,p)=>n+p.screws.length,0);
}

export function buildStructure(index: number): StructureDefinition {
  const i =
      ((Math.floor(index) % STAGES.length) + STAGES.length) % STAGES.length,
    k = new Kit();
  k.root.name = STAGES[i].name;
  switch (i) {
    case 0:
      house(k);
      break;
    case 1:
      lighthouse(k);
      break;
    case 2:
      windmill(k);
      break;
    case 3:
      pagoda(k, 2);
      break;
    case 4:
      clockTower(k);
      break;
    case 5:
      ship(k, "ferry");
      break;
    case 6:
      observatory(k);
      break;
    case 7:
      pagoda(k, 2, true);
      break;
    case 8:
      ship(k, "cargo");
      break;
    case 9:
      house(k, true);
      break;
    case 10:
      ship(k, "liner");
      break;
    case 11:
      pagoda(k, 3, true);
      break;
    case 12: buildStarDestroyer(k); break;
    case 13: buildLiberty(k); break;
    case 14: buildArchBridge(k); break;
    case 15: buildEiffel(k); break;
    case 16: buildEnterprise(k); break;
    case 17: buildCarrier(k); break;
    case 18: buildDestroyer(k); break;
    case 19: buildBattleship(k); break;
  }
  if (i < 12) furnishInterior(k, i);
  return componentize(k.finish(i), i);
}
