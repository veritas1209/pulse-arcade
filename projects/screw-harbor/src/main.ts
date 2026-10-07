import "./styles.css";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { surfaceResources } from './materials';
import { buildStructure, STAGES, type StructureDefinition } from "./structures";
import { Puzzle, assignColors, type ScrewColor } from "./puzzle";
import { extractionBlocker, EXTRACTION_RADIUS, SCREW_HEAD_TOP, SCREW_FULL_LENGTH } from "./extraction";
import { clearCameraAndTargetPosition, CAMERA_CLEARANCE } from './camera-clearance';

const COLORS: Record<
  ScrewColor,
  { hex: number; css: string; name: string; mark: string }
> = {
  coral: { hex: 0xef3d3d, css: "#ef3d3d", name: "빨강", mark: "✚" },
  gold: { hex: 0xf5ce28, css: "#f5ce28", name: "노랑", mark: "◆" },
  mint: { hex: 0x35b64b, css: "#35b64b", name: "초록", mark: "●" },
  blue: { hex: 0x3283eb, css: "#3283eb", name: "파랑", mark: "■" },
  violet: { hex: 0x9749db, css: "#9749db", name: "보라", mark: "▲" },
};
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div class="workspace">
<header class="topbar"><a class="brand" href="#" aria-label="스크루 하버"><span class="brand-mark">✚</span><span>SCREW <b>HARBOR</b></span></a><div class="top-actions"><a class="hub-link" href="/" aria-label="Pulse Arcade로 이동">허브</a><button id="restart" class="icon-button" aria-label="다시 시작" title="다시 시작">⟳</button><button id="sound" class="icon-button" aria-label="소리 끄기" title="소리">♪</button><button id="pause" class="icon-button" aria-label="일시 정지">Ⅱ</button></div></header>
<main class="playroom"><div class="scene-heading"><div><h1 id="stage-name"></h1></div><button id="stages" class="stage-button"><span>구조물</span><b id="collection"></b> ↗</button></div>
<section class="sorting" aria-label="나사 수집함"><div class="sorting-label"><span>수집함</span><small>같은 색 3개</small></div><div class="buffer-section"><div class="buffer-title"><b>임시 보관</b><span id="buffer-label"></span></div><div id="buffer" class="buffer"></div></div><div id="boxes" class="boxes"></div><div class="next-box"><span>다음</span><div id="queue"></div></div></section>
<div class="scene-wrap"><div id="viewport" aria-label="드래그 회전, 오른쪽 드래그 이동, 휠 확대, 나사 클릭" role="application"></div><div class="scene-meta"><span id="difficulty"></span></div><div class="progress-note"><span id="progress-count"></span><small>나사</small><div class="progress-track"><span id="progress-bar"></span></div></div><p class="scene-instruction" id="instruction">회전 · 이동 · 확대</p><div id="toast" class="toast" role="status" aria-live="polite"></div></div>
<footer class="game-footer"><button id="help">도움말</button></footer></main>
<div class="modal-shade" id="modal" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><button id="close-modal" class="modal-close" aria-label="닫기">×</button><div id="modal-content"></div></section></div></div>`;
const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
function bolt(color: ScrewColor, filled = true) {
  const c = COLORS[color];
  return `<span class="bolt ${filled ? "filled" : ""}" style="--bolt:${c.css}" aria-label="${c.name}"><span>${c.mark}</span></span>`;
}
function readSave(): { completed: number[]; sound: boolean; reduced: boolean } {
  try {
    const d = JSON.parse(localStorage.getItem("screw-harbor-v1") || "{}");
    return {
      completed: Array.isArray(d.completed)
        ? d.completed.filter((n: unknown) => Number.isInteger(n))
        : [],
      sound: d.sound !== false,
      reduced:
        d.reduced === true ||
        matchMedia("(prefers-reduced-motion:reduce)").matches,
    };
  } catch {
    return { completed: [], sound: true, reduced: false };
  }
}
const save = readSave();
function persist() {
  try {
    localStorage.setItem("screw-harbor-v1", JSON.stringify(save));
  } catch {
    /* Optional private-mode persistence. */
  }
}
class AudioFeedback {
  ctx: AudioContext | null = null;
  unlock() {
    if (!save.sound) return;
    this.ctx ??= new AudioContext();
    void this.ctx.resume().catch(() => {});
  }
  pause() {
    if (this.ctx?.state === "running") void this.ctx.suspend().catch(() => {});
  }
  dispose() {
    if (this.ctx && this.ctx.state !== "closed")
      void this.ctx.close().catch(() => {});
    this.ctx = null;
  }
  play(event: "unscrew" | "release" | "box" | "win" | "error" | "ui") {
    if (!save.sound || !this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx,
      now = ctx.currentTime;
    const notes =
      event === "win"
        ? [523, 659, 784, 1046]
        : event === "box"
          ? [660, 880]
          : event === "error"
            ? [150]
            : event === "release"
              ? [100, 72]
              : event === "ui"
                ? [420]
                : [720, 480];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = event === "release" ? "triangle" : "sine";
      o.frequency.setValueAtTime(f, now + i * 0.07);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, f * 0.72),
        now + i * 0.07 + 0.11,
      );
      g.gain.setValueAtTime(0, now + i * 0.07);
      g.gain.linearRampToValueAtTime(
        event === "release" ? 0.07 : 0.04,
        now + i * 0.07 + 0.008,
      );
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.19);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.07);
      o.stop(now + i * 0.07 + 0.2);
    });
  }
}
const audio = new AudioFeedback(),
  viewport = byId("viewport");
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
} catch {
  viewport.innerHTML =
    '<div class="webgl-error"><h2>3D 화면을 열 수 없어요</h2><p>브라우저의 하드웨어 가속을 켠 뒤 다시 시도해 주세요.</p><button id="retry-webgl">다시 시도</button></div>';
  byId("retry-webgl").onclick = () => location.reload();
  throw Error("WebGL context unavailable");
}
renderer.domElement.id = "game-canvas";
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
viewport.append(renderer.domElement);
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(34, 1, 0.035, 140);
const pmrem = new THREE.PMREMGenerator(renderer), studio = new RoomEnvironment();
scene.environment = pmrem.fromScene(studio, 0.04).texture;
scene.environmentIntensity = 0.65;
studio.dispose();
pmrem.dispose();
const controls = new OrbitControls(camera, renderer.domElement);
const previousCameraPosition = new THREE.Vector3();
const previousControlsTarget = new THREE.Vector3();
let cameraSweepEnabled = false;
controls.addEventListener('change', keepCameraOutsideWalls);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.panSpeed = 1.6;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 1.4;
scene.add(new THREE.HemisphereLight(0xfffaf2, 0x71878c, 2));
const sun = new THREE.DirectionalLight(0xfff4dc, 3);
sun.position.set(-8, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -12,
  right: 12,
  top: 12,
  bottom: -12,
  near: 0.5,
  far: 40,
});
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xd2e8ff, 1.4);
fill.position.set(9, 6, -7);
scene.add(fill);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.ShadowMaterial({ opacity: 0.12 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.53;
floor.receiveShadow = true;
scene.add(floor);
const physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -7, 0) });
physics.allowSleep = true;
const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
ground.position.y = -0.5;
physics.addBody(ground);
physics.defaultContactMaterial.friction = 0.5;
physics.defaultContactMaterial.restitution = 0.12;
interface ScrewVisual {
  id: string;
  group: THREE.Group;
  original: THREE.Vector3;
  quaternion: THREE.Quaternion;
  normal: THREE.Vector3;
  index: number;
  scale: number;
  time: number | null;
  blockedTime: number | null;
  color: ScrewColor;
}
interface ReleaseVisual {
  group: THREE.Group;
  body: CANNON.Body;
  offset: THREE.Vector3;
  time: number;
}
let structure: StructureDefinition,
  puzzle: Puzzle,
  stageIndex = 0,
  paused = false,
  modalKind = "",
  total = 0,
  elapsed = 0,
  lastTime = 0,
  wonShown = false,
  lastCompleted = 0,
  raf = 0,
  toastTimer = 0,
  runSeed = 1709,
  diagnosticTimer = 0;
const screws = new Map<string, ScrewVisual>(),
  releases = new Map<string, ReleaseVisual>();
const pendingFoundations = new Set<string>();
const capGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.165, 0),
      new THREE.Vector2(0.205, 0.027),
      new THREE.Vector2(0.212, 0.083),
      new THREE.Vector2(0.175, 0.118),
      new THREE.Vector2(0, 0.118),
    ],
    16,
  ),
  shaftGeo = new THREE.CylinderGeometry(0.074, 0.074, 0.24, 8),
  washerGeo = new THREE.TorusGeometry(0.225, 0.025, 4, 16),
  threadGeo = new THREE.TorusGeometry(0.079, 0.014, 3, 8),
  slotGeo = new THREE.BoxGeometry(0.19, 0.015, 0.037),
  holeGeo = new THREE.CylinderGeometry(0.107, 0.107, 0.017, 10),
  pickGeo = new THREE.SphereGeometry(0.29, 12, 8);
const metal = new THREE.MeshStandardMaterial({
    color: 0xc7d4d8,
    metalness: 0.75,
    roughness: 0.29,
  }),
  dark = new THREE.MeshStandardMaterial({
    color: 0x334952,
    metalness: 0.38,
    roughness: 0.5,
  }),
  pickMat = new THREE.MeshBasicMaterial({ visible: false });
const headMats = Object.fromEntries(
  Object.entries(COLORS).map(([key, c]) => [
    key,
    new THREE.MeshStandardMaterial({
      color: c.hex,
      metalness: 0.22,
      roughness: 0.28,
    }),
  ]),
) as Record<ScrewColor, THREE.MeshStandardMaterial>;
const metalBits: THREE.BufferGeometry[] = [
  shaftGeo.clone().translate(0, -0.1, 0),
  washerGeo
    .clone()
    .rotateX(Math.PI / 2)
    .translate(0, 0.006, 0),
];
for (let i = 0; i < 3; i++)
  metalBits.push(
    threadGeo
      .clone()
      .rotateX(Math.PI / 2)
      .translate(0, -0.18 + i * 0.046, 0),
  );
const screwMetalGeo = mergeGeometries(metalBits)!,
  screwDarkGeo = mergeGeometries([
    slotGeo.clone().translate(0, 0.15, 0),
    slotGeo
      .clone()
      .rotateY(Math.PI / 2)
      .translate(0, 0.15, 0),
  ])!;
metalBits.forEach((g) => g.dispose());
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.22, roughness: 0.28 });
let screwBatch: THREE.Group | null = null;
let capInstances: THREE.InstancedMesh, metalInstances: THREE.InstancedMesh,
    slotInstances: THREE.InstancedMesh, holeInstances: THREE.InstancedMesh;
const instanceIds: string[] = [];
const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const capOffset = new THREE.Matrix4().makeTranslation(0, 0.035, 0);
function createScrewBatch(count: number) {
  screwBatch = new THREE.Group();
  capInstances = new THREE.InstancedMesh(capGeo, headMaterial, count);
  metalInstances = new THREE.InstancedMesh(screwMetalGeo, metal, count);
  slotInstances = new THREE.InstancedMesh(screwDarkGeo, dark, count);
  holeInstances = new THREE.InstancedMesh(holeGeo, dark, count);
  for (const mesh of [capInstances, metalInstances, slotInstances, holeInstances]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    screwBatch.add(mesh);
  }
  scene.add(screwBatch);
  instanceIds.length = 0;
}
function buildScrew(
  id: string, color: ScrewColor, pos: [number, number, number],
  normal: [number, number, number], parent: THREE.Group, scale = 0.6,
) {
  const group = new THREE.Group(), n = new THREE.Vector3(...normal).normalize();
  group.userData.screwId = id;
  group.position.fromArray(pos);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  group.scale.setScalar(scale);
  parent.add(group);
  const index = instanceIds.length;
  instanceIds.push(id);
  capInstances.setColorAt(index, new THREE.Color(COLORS[color].hex));
  screws.set(id, { id, group, original: group.position.clone(),
    quaternion: group.quaternion.clone(), normal: n, index, scale, time: null, blockedTime: null, color });
}
function updateScrewBatch() {
  structure.root.updateMatrixWorld(true);
  const m = new THREE.Matrix4(), hole = new THREE.Object3D();
  for (const s of screws.values()) {
    const visible = effectivelyVisible(s.group);
    if (visible) {
      m.multiplyMatrices(s.group.matrixWorld, capOffset);
      capInstances.setMatrixAt(s.index, m);
      metalInstances.setMatrixAt(s.index, s.group.matrixWorld);
      slotInstances.setMatrixAt(s.index, s.group.matrixWorld);
    } else {
      for (const mesh of [capInstances, metalInstances, slotInstances]) mesh.setMatrixAt(s.index, hideMatrix);
    }
    const parent = s.group.parent!;
    hole.position.copy(s.original);
    hole.quaternion.copy(s.quaternion);
    hole.scale.setScalar(s.scale);
    hole.updateMatrix();
    m.multiplyMatrices(parent.matrixWorld, hole.matrix);
    holeInstances.setMatrixAt(s.index, effectivelyVisible(parent) ? m : hideMatrix);
  }
  for (const mesh of [capInstances, metalInstances, slotInstances, holeInstances]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}
function screwIdAtHit(hit: THREE.Intersection | undefined) {
  return hit && hit.instanceId !== undefined &&
    [capInstances, metalInstances, slotInstances].includes(hit.object as THREE.InstancedMesh)
    ? instanceIds[hit.instanceId] : undefined;
}
function opaqueMeshes() {
  const meshes: THREE.Object3D[] = [];
  structure.root.traverse(o => {
    if (o instanceof THREE.Mesh && effectivelyVisible(o)) meshes.push(o);
  });
  meshes.push(capInstances, metalInstances, slotInstances);
  return meshes;
}
function clearBodies() {
  for (const r of releases.values()) physics.removeBody(r.body);
  releases.clear();
  pendingFoundations.clear();
}
function disposeStructure() {
  if (!structure) return;
  scene.remove(structure.root);
  if (screwBatch) { scene.remove(screwBatch); for (const o of screwBatch.children) (o as THREE.InstancedMesh).dispose(); screwBatch = null; }
  const gs = new Set<THREE.BufferGeometry>(),
    ms = new Set<THREE.Material>();
  const shared = [
    capGeo,
    shaftGeo,
    washerGeo,
    threadGeo,
    slotGeo,
    holeGeo,
    pickGeo,
    screwMetalGeo,
    screwDarkGeo,
  ];
  structure.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      if (!shared.includes(o.geometry)) gs.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (![metal, dark, pickMat, ...Object.values(headMats)].includes(m))
          ms.add(m);
    }
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => m.dispose());
  screws.clear();
  clearBodies();
}
function loadStage(index: number) {
  cameraSweepEnabled = false;
  closeModal();
  disposeStructure();
  stageIndex = Math.max(0, Math.min(index, STAGES.length - 1));
  structure = buildStructure(stageIndex);
  scene.add(structure.root);
  const specs = assignColors(
    structure.parts,
    structure.difficulty,
    runSeed + stageIndex * 53,
  );
  puzzle = new Puzzle(specs, structure.difficulty);
  total = specs.length;
  lastCompleted = 0;
  wonShown = false;
  createScrewBatch(total);
  for (const p of structure.parts) {
    const ps = specs.filter((s) => s.partId === p.id);
    p.screws.forEach((s, i) => {
      if (ps[i])
        buildScrew(ps[i].id, ps[i].color, s.position, s.normal, p.group, (p as typeof p & { boltScale?: number }).boltScale ?? 0.6);
    });
  }
  updateScrewBatch();
  const bottom = new THREE.Box3().setFromObject(structure.root).min.y;
  ground.position.y = bottom - 0.15;
  floor.position.y = ground.position.y - 0.03;
  camera.far = Math.max(140, structure.radius * 12);
  sun.target.position.copy(structure.center);
  sun.position.copy(structure.center).addScaledVector(new THREE.Vector3(-8,14,9).normalize(), structure.radius * 4);
  const shadowExtent = Math.max(12, structure.radius * 1.3);
  Object.assign(sun.shadow.camera, { left:-shadowExtent, right:shadowExtent, top:shadowExtent, bottom:-shadowExtent, far:structure.radius * 8 });
  sun.shadow.camera.updateProjectionMatrix();
  byId("stage-name").textContent = structure.name;
  byId("collection").textContent =
    `${String(stageIndex + 1).padStart(2, "0")} / ${STAGES.length}`;
  byId("difficulty").textContent =
    ["", "보통", "어려움", "매우 어려움", "전문가", "전문가"][
      Math.min(structure.difficulty, 5)
    ] || "보통";
  refreshUI();
  resize();
  resetView(); // Fit the final HUD layout, including mobile collection rows.
}
function resetView() {
  const box = new THREE.Box3().setFromObject(structure.root);
  const center = box.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(1.08, 0.75, 1.8).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y])
    for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x,y,z).sub(center);
      distance = Math.max(distance, p.dot(direction) + Math.abs(p.dot(right)) / (tangent * aspect),
        p.dot(direction) + Math.abs(p.dot(up)) / tangent);
    }
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update(); // Drain gesture inertia before replacing the view.
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance * 1.08);
  controls.minDistance = Math.max(0.2, structure.radius * 0.025);
  controls.maxDistance = structure.radius * 10;
  controls.update();
  controls.enableDamping = damping;
  previousCameraPosition.copy(camera.position);
  previousControlsTarget.copy(controls.target);
  cameraSweepEnabled = true;
}
function keepCameraOutsideWalls() {
  if (!cameraSweepEnabled) return;
  if (previousCameraPosition.distanceToSquared(camera.position) < 1e-14) {
    previousControlsTarget.copy(controls.target);
    return;
  }
  scene.updateMatrixWorld(true);
  const walls: THREE.Mesh[] = [];
  for (const part of structure.parts) {
    if (!effectivelyVisible(part.group) || releases.has(part.id)) continue;
    part.group.traverse(object => {
      if (object instanceof THREE.Mesh && effectivelyVisible(object)) walls.push(object);
    });
  }
  const cleared = clearCameraAndTargetPosition(previousCameraPosition, camera.position,
    previousControlsTarget, controls.target, walls);
  camera.position.copy(cleared.camera);
  controls.target.copy(cleared.target);
  previousCameraPosition.copy(camera.position);
  previousControlsTarget.copy(controls.target);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
}
function refreshUI() {
  byId("boxes").innerHTML =
    puzzle.boxes
      .map(
        (b) =>
          `<div class="collection-box" style="--box:${COLORS[b.color].css}"><div class="box-caption"><b>${COLORS[b.color].name}</b><span>${b.count} / ${b.target ?? 3}</span></div><div class="box-slots">${Array.from({ length: b.target ?? 3 }, (_, i) => bolt(b.color, i < b.count)).join("")}</div></div>`,
      )
      .join("") || '<div class="all-sorted">모두 정리했어요 ✓</div>';
  byId("queue").innerHTML =
    puzzle.queue
      .slice(0, 3)
      .map(
        (c) =>
          `<i style="--bolt:${COLORS[c].css}" title="${COLORS[c].name}">${COLORS[c].mark}</i>`,
      )
      .join("") || "<span>✓</span>";
  byId("buffer").innerHTML = Array.from(
    { length: puzzle.bufferCapacity },
    (_, i) =>
      `<div class="buffer-slot">${puzzle.buffer[i] ? bolt(puzzle.buffer[i]) : '<span class="empty-hole"></span>'}</div>`,
  ).join("");
  byId("buffer-label").textContent =
    `${puzzle.buffer.length} / ${puzzle.bufferCapacity}`;
  byId("buffer").classList.toggle(
    "almost-full",
    puzzle.buffer.length >= puzzle.bufferCapacity - 1,
  );
  byId("progress-count").textContent = `${total - puzzle.remaining} / ${total}`;
  byId("progress-bar").style.width =
    `${((total - puzzle.remaining) / total) * 100}%`;
  if (puzzle.completedBoxes > lastCompleted) {
    audio.play("box");
    lastCompleted = puzzle.completedBoxes;
    if (!save.reduced)
      byId("boxes").animate(
        [{ transform: "translateY(-4px)" }, { transform: "translateY(0)" }],
        { duration: 250 },
      );
  }
  if (puzzle.status === "won" && !wonShown) {
    wonShown = true;
    if (!save.completed.includes(stageIndex)) {
      save.completed.push(stageIndex);
      persist();
    }
    audio.play("win");
    const stage = stageIndex, completedPuzzle = puzzle;
    const showWhenCleared = () => {
      if (stageIndex !== stage || puzzle !== completedPuzzle || puzzle.status !== 'won') return;
      if (structure.parts.some(p => p.isFoundation && p.group.visible)) {
        setTimeout(showWhenCleared, 100);
        return;
      }
      if (modalKind !== 'stages') showResult(true);
    };
    setTimeout(
      showWhenCleared,
      save.reduced ? 180 : 1900,
    );
  }
  if (puzzle.status === "lost" && !modalKind) {
    const failedPuzzle = puzzle;
    // Complete the canvas tap before adding buttons under the pointer. A touch
    // compatibility click must not hit the newly mounted restart button.
    setTimeout(() => {
      if (puzzle === failedPuzzle && puzzle.status === 'lost' && !modalKind) showResult(false);
    }, 150);
  }
}
function toast(text: string) {
  clearTimeout(toastTimer);
  byId("toast").textContent = text;
  byId("toast").classList.add("visible");
  toastTimer = window.setTimeout(
    () => byId("toast").classList.remove("visible"),
    2400,
  );
}
function releasePart(id: string) {
  const part = structure.parts.find((p) => p.id === id);
  if (!part || releases.has(id)) return;
  // The base supports the assembly until the other pieces have disappeared.
  // Its screws can still be selected whenever their real extraction path is clear.
  if (part.isFoundation && structure.parts.some(p => !p.isFoundation && p.group.visible)) {
    pendingFoundations.add(id);
    return;
  }
  pendingFoundations.delete(id);
  structure.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(part.group),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3()),
    q = part.group.getWorldQuaternion(new THREE.Quaternion()),
    origin = part.group.getWorldPosition(new THREE.Vector3());
  const body = new CANNON.Body({
    mass: 2,
    shape: new CANNON.Box(
      new CANNON.Vec3(
        Math.max(0.15, size.x / 2),
        Math.max(0.15, size.y / 2),
        Math.max(0.15, size.z / 2),
      ),
    ),
    linearDamping: 0.3,
    angularDamping: 0.5,
  });
  body.position.set(center.x, center.y, center.z);
  body.quaternion.set(q.x, q.y, q.z, q.w);
  const direction = center.clone().sub(structure.center);
  direction.y = 0.3;
  if (direction.length() < 0.5) direction.set(1, 0.3, 0.4);
  direction.normalize();
  body.velocity.set(direction.x * 2.6, 1.8, direction.z * 2.6);
  body.angularVelocity.set(0.35, 0.28, 0.2);
  physics.addBody(body);
  releases.set(id, {
    group: part.group,
    body,
    offset: center.sub(origin).applyQuaternion(q.clone().invert()),
    time: 0,
  });
  audio.play("release");
}
function blockingPart(s: ScrewVisual): string | null {
  scene.updateMatrixWorld(true);
  const owner = s.group.parent!;
  const obstacles: THREE.Mesh[] = [];
  for (const part of structure.parts) {
    if (!effectivelyVisible(part.group)) continue;
    part.group.traverse(o => { if (o instanceof THREE.Mesh && effectivelyVisible(o)) obstacles.push(o); });
  }
  const start = s.group.localToWorld(new THREE.Vector3(0, SCREW_HEAD_TOP, 0));
  const normal = s.normal.clone().transformDirection(owner.matrixWorld);
  const blocked = extractionBlocker(start, normal, EXTRACTION_RADIUS * s.scale, obstacles, SCREW_FULL_LENGTH * s.scale);
  if (!blocked) return null;
  let ancestor: THREE.Object3D | null = blocked;
  while (ancestor && ancestor.parent !== structure.root) ancestor = ancestor.parent;
  return structure.parts.find(p => p.group === ancestor)?.name ?? "다른 부품";
}
function removeScrew(id: string) {
  if (paused || modalKind || puzzle.status !== "playing") return;
  const visual = screws.get(id);
  if (visual && puzzle.canRemove(id)) {
    const blocker = blockingPart(visual);
    if (blocker) {
      visual.blockedTime = 0;
      visual.group.quaternion.copy(visual.quaternion);
      toast("막혀 있어요.");
      audio.play("error");
      return;
    }
  }
  const result = puzzle.remove(id);
  if (!result.ok) {
    refreshUI();
    audio.play("error");
    toast("이 나사는 이미 풀었어요.");
    return;
  }
  audio.unlock();
  audio.play("unscrew");
  const s = screws.get(id);
  if (s) { s.blockedTime = null; s.group.quaternion.copy(s.quaternion); s.time = 0; }
  if (result.partReleased) releasePart(result.partReleased);
  refreshUI();
}
function effectivelyVisible(object: THREE.Object3D) {
  let p: THREE.Object3D | null = object;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}
function focusCenter() {
  const box = new THREE.Box3();
  for (const part of structure.parts)
    if (
      puzzle.screws.some(
        (s) => s.partId === part.id && !puzzle.removed.has(s.id),
      )
    )
      box.union(new THREE.Box3().setFromObject(part.group));
  return box.isEmpty()
    ? structure.center.clone()
    : box.getCenter(new THREE.Vector3());
}
function aimCameraForQA(s: ScrewVisual): boolean {
  updateScrewBatch();
  scene.updateMatrixWorld(true);
  const target = s.group.localToWorld(new THREE.Vector3(0, 0.1, 0)),
    normal = s.normal.clone().transformDirection(s.group.parent!.matrixWorld),
    distance = Math.max(
      structure.radius * 2.8,
      camera.position.distanceTo(controls.target),
    );
  const meshes = opaqueMeshes();
  const focus = focusCenter();
  const preferred = normal
      .clone()
      .add(new THREE.Vector3(0.35, 0.38, 0.3))
      .normalize(),
    directions = [preferred, normal.clone(),
      normal.clone().add(normal.y > .80 ? new THREE.Vector3(.23,0,.39) : new THREE.Vector3(0,.48,0)).normalize()];
  for (const elevation of [0.55, 0.9, 0.25, 1.25, -0.25, -0.7, -1.2])
    for (let i = 0; i < 24; i++) {
      const yaw = (i * Math.PI) / 12;
      directions.push(
        new THREE.Vector3(
          Math.sin(yaw) * Math.cos(elevation),
          Math.sin(elevation),
          Math.cos(yaw) * Math.cos(elevation),
        ),
      );
    }
  const probe = new THREE.Raycaster();
  let eye: THREE.Vector3 | null = null;
  for (const direction of directions) {
    const candidate = focus.clone().addScaledVector(direction, distance),
      towardEye = candidate.clone().sub(target).normalize();
    if (normal.dot(towardEye) < 0.12) continue;
    probe.set(candidate, target.clone().sub(candidate).normalize());
    const blocker = probe.intersectObjects(meshes, false)[0];
    if (screwIdAtHit(blocker) === s.id) {
      camera.position.copy(candidate);
      camera.lookAt(focus);
      camera.updateMatrixWorld();
      const screen = target.clone().project(camera),
        rect = renderer.domElement.getBoundingClientRect(),
        sx = rect.left + ((screen.x + 1) * rect.width) / 2,
        sy = rect.top + ((-screen.y + 1) * rect.height) / 2;
      if (document.elementFromPoint(sx, sy) !== renderer.domElement) continue;
      eye = candidate;
      break;
    }
  }
  // Free panning can center a narrow opening instead of orbiting the whole model.
  if (!eye) {
    for (const direction of directions) {
      if (normal.dot(direction) < 0.12) continue;
      const candidate = target.clone().addScaledVector(direction, distance);
      probe.set(candidate, direction.clone().negate());
      if (screwIdAtHit(probe.intersectObjects(meshes, false)[0]) !== s.id) continue;
      focus.copy(target);
      camera.position.copy(candidate);
      camera.lookAt(focus);
      camera.updateMatrixWorld();
      eye = candidate;
      break;
    }
  }
  if (!eye) return false;
  controls.target.copy(focus);
  camera.position.copy(eye);
  // The QA framing helper relocates between distant exterior viewpoints. Actual
  // OrbitControls movement always passes through the continuous wall guard.
  previousCameraPosition.copy(eye);
  previousControlsTarget.copy(controls.target);
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
  camera.updateMatrixWorld();
  return true;
}
function openModal(kind: string, content: string) {
  modalKind = kind;
  paused = true;
  controls.enabled = false;
  audio.pause();
  byId("modal-content").innerHTML = content;
  byId("modal").hidden = false;
  document.querySelector<HTMLElement>(".modal")!.focus();
}
function closeModal() {
  modalKind = "";
  paused = false;
  controls.enabled = true;
  byId("modal").hidden = true;
  if (audio.ctx) audio.unlock();
}
function showResult(win: boolean) {
  openModal(
    win ? "win" : "lost",
    `<div class="result-symbol ${win ? "" : "fail"}">${win ? "✧" : "!"}</div><h2 id="modal-title">${win ? "해체 완료" : "보관함이 찼어요"}</h2><p>${win ? `나사 ${total}개` : "다시 시작하세요."}</p><div class="modal-actions">${win ? `<button class="primary" id="next-stage">${stageIndex === STAGES.length - 1 ? "구조물" : "다음"}</button><button id="replay">다시 시작</button>` : '<button class="primary" id="replay">다시 시작</button>'}</div>`,
  );
  byId("replay").onclick = () => loadStage(stageIndex);
  if (win)
    byId("next-stage").onclick = () =>
      stageIndex === STAGES.length - 1
        ? showStages()
        : loadStage(stageIndex + 1);
}
function showStages() {
  openModal(
    "stages",
    `<h2 id="modal-title">구조물</h2><div class="stage-grid">${STAGES.map((s, i) => `<button class="stage-card ${i === stageIndex ? "selected" : ""}" data-stage="${i}"><span class="stage-number">${String(i + 1).padStart(2, "0")}<i>${save.completed.includes(i) ? "✓" : ""}</i></span><b>${s.name}</b><span class="stage-illustration"><img src="./thumbs/${i + 1}.webp" alt="" loading="lazy"></span><small>${["", "쉬움", "보통", "어려움", "전문가", "전문가"][Math.min(s.difficulty, 5)] || "보통"}</small></button>`).join("")}</div>`,
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-stage]")
    .forEach((b) => (b.onclick = () => loadStage(Number(b.dataset.stage))));
}
function showPause() {
  openModal(
    "pause",
    `<h2 id="modal-title">일시 정지</h2><div class="settings"><button id="toggle-motion">움직임 줄이기 <b>${save.reduced ? "켜짐" : "꺼짐"}</b></button></div><div class="modal-actions"><button class="primary" id="resume">계속</button><button id="pause-restart">다시 시작</button></div>`,
  );
  byId("resume").onclick = () => {
    closeModal();
    audio.unlock();
  };
  byId("pause-restart").onclick = () => loadStage(stageIndex);
  byId("toggle-motion").onclick = () => {
    save.reduced = !save.reduced;
    persist();
    showPause();
  };
}
function showHelp() {
  openModal(
    "help",
    `<h2 id="modal-title">도움말</h2><ol class="help-list"><li>현재 수집함과 같은 색 → 수집함</li><li>다른 색 → 임시 보관 · 5칸이 차면 실패</li><li>뽑힐 공간이 부족한 나사는 막힘</li><li>부품의 나사를 모두 풀면 해체</li><li>드래그 회전 · 오른쪽/Shift 드래그 이동 · 휠 확대</li><li>터치: 한 손가락 회전 · 두 손가락 이동/확대</li><li>R 다시 시작 · Esc 일시 정지</li></ol><button class="primary" id="got-it">확인</button>`,
  );
  byId("got-it").onclick = () => {
    closeModal();
    audio.unlock();
  };
}
byId("stages").onclick = showStages;
byId("pause").onclick = () => (modalKind ? closeModal() : showPause());
byId("close-modal").onclick = closeModal;
byId("restart").onclick = () => loadStage(stageIndex);
byId("help").onclick = showHelp;
byId("sound").onclick = () => {
  save.sound = !save.sound;
  persist();
  byId("sound").textContent = save.sound ? "♪" : "♩";
  byId("sound").setAttribute(
    "aria-label",
    save.sound ? "소리 끄기" : "소리 켜기",
  );
  if (save.sound) {
    audio.unlock();
    audio.play("ui");
  } else audio.pause();
};
byId("sound").textContent = save.sound ? "♪" : "♩";
function rotate(angle: number) {
  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}
byId("modal").addEventListener("click", (e) => {
  if (e.target === byId("modal")) closeModal();
});
const pointer = new THREE.Vector2(),
  raycaster = new THREE.Raycaster();
let pointerStart: { x: number; y: number; id: number } | null = null;
const activePointers = new Set<number>();
renderer.domElement.addEventListener("pointerdown", (e) => {
  audio.unlock();
  activePointers.add(e.pointerId);
  pointerStart = activePointers.size === 1 && e.isPrimary && e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
    ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
});
renderer.domElement.addEventListener("pointercancel", (e) => {
  activePointers.delete(e.pointerId);
  pointerStart = null;
});
window.addEventListener("blur", () => { activePointers.clear(); pointerStart = null; });
renderer.domElement.addEventListener("pointerup", (e) => {
  activePointers.delete(e.pointerId);
  if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) { pointerStart = null; return; }
  if (!pointerStart || pointerStart.id !== e.pointerId) return;
  const distance = Math.hypot(
    e.clientX - pointerStart.x,
    e.clientY - pointerStart.y,
  );
  pointerStart = null;
  if (distance > 7 || paused || modalKind) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    (-(e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  scene.updateMatrixWorld(true);
  updateScrewBatch();
  const opaqueHit = raycaster.intersectObjects(opaqueMeshes(), false)[0];
  let selected = screwIdAtHit(opaqueHit);
  // A small touch target surrounds the real head, but never reaches through a panel.
  if (!selected) {
    const candidates: { id: string; distance: number }[] = [];
    for (const s of screws.values()) {
      if (!puzzle.canRemove(s.id) || !effectivelyVisible(s.group) || s.time !== null) continue;
      const center = s.group.localToWorld(new THREE.Vector3(0, 0.1, 0));
      const normal = s.normal.clone().transformDirection(s.group.parent!.matrixWorld);
      if (normal.dot(camera.position.clone().sub(center).normalize()) < 0.05) continue;
      const sphere = new THREE.Sphere(center, 0.255 * s.scale);
      const hit = raycaster.ray.intersectSphere(sphere, new THREE.Vector3());
      if (!hit) continue;
      const distance = hit.distanceTo(camera.position);
      if (opaqueHit && opaqueHit.distance < distance - 0.055) continue;
      candidates.push({ id: s.id, distance });
    }
    candidates.sort((a,b) => a.distance - b.distance);
    selected = candidates[0]?.id;
  }
  if (!selected) return;
  const screw = screws.get(selected)!;
  if (screw.time !== null || puzzle.removed.has(selected)) return;
  removeScrew(selected);
});
window.addEventListener("blur", () => {
  pointerStart = null;
});
document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "Escape") {
    e.preventDefault();
    modalKind ? closeModal() : showPause();
    return;
  }
  if (modalKind) {
    if (e.key === "Tab") {
      const buttons = [
          ...document.querySelectorAll<HTMLButtonElement>(".modal button"),
        ].filter((b) => !b.disabled),
        first = buttons[0],
        last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    rotate(-0.25);
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    rotate(0.25);
  }
  if (e.key.toLowerCase() === "r") loadStage(stageIndex);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.pause();
    lastTime = 0;
  } else if (!paused) audio.unlock();
});
function resize() {
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  camera.aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
  camera.updateProjectionMatrix();
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(viewport);
function update(delta: number) {
  elapsed += delta;
  controls.enabled = !paused;
  controls.update();
  floor.visible = camera.position.y > floor.position.y;
  physics.step(1 / 60, delta, 3);
  for (const s of screws.values()) {
    if (s.blockedTime !== null) {
      s.blockedTime += delta;
      const t = Math.min(1, s.blockedTime / (save.reduced ? 0.12 : 0.32));
      const shake = Math.sin(t * Math.PI * 4) * (1-t) * (save.reduced ? 0.07 : 0.18);
      s.group.quaternion.copy(s.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), shake));
      if (t === 1) { s.blockedTime = null; s.group.quaternion.copy(s.quaternion); }
    }
    if (s.time !== null) {
      s.time += delta;
      const t = Math.min(1, s.time / (save.reduced ? 0.08 : 0.52));
      s.group.position.copy(s.original).addScaledVector(s.normal, t * SCREW_FULL_LENGTH * s.scale);
      s.group.rotateY(delta * 17);
      s.group.scale.setScalar(s.scale * (1 - Math.max(0, t - 0.6) / 0.4));
      if (t === 1) {
        s.group.visible = false;
        s.time = null;
      }
    } else if (!puzzle.removed.has(s.id)) s.group.scale.setScalar(s.scale);
  }
  for (const r of releases.values()) {
    if (!r.group.visible) continue;
    r.time += delta;
    const t = Math.min(1, r.time / (save.reduced ? 0.12 : 1.8)),
      q = new THREE.Quaternion(
        r.body.quaternion.x,
        r.body.quaternion.y,
        r.body.quaternion.z,
        r.body.quaternion.w,
      );
    r.group.quaternion.copy(q);
    r.group.position
      .set(r.body.position.x, r.body.position.y, r.body.position.z)
      .sub(r.offset.clone().applyQuaternion(q));
    r.group.scale.setScalar(1 - Math.max(0, t - 0.5) * 1.8);
    if (t === 1) {
      r.group.visible = false;
      physics.removeBody(r.body);
    }
  }
  for (const id of pendingFoundations) releasePart(id);
  updateScrewBatch();
}
function frame(t: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) {
    lastTime = 0;
    return;
  }
  const delta = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0;
  lastTime = t;
  if (!paused) update(delta);
  renderer.render(scene, camera);
}
function diagnostics() {
  scene.updateMatrixWorld(true);
  return {
    frame: Math.round(elapsed * 60),
    elapsed,
    score: total - puzzle.remaining,
    targetScore: total,
    complete: puzzle.status === "won",
    state: puzzle.status,
    blockedFeedback: [...screws.values()].filter(s => s.blockedTime !== null).map(s => s.id),
    stage: stageIndex,
    remaining: puzzle.remaining,
    moves: puzzle.moves,
    buffer: puzzle.buffer,
    boxes: puzzle.boxes,
    player: { position: { x: 0, y: 0, z: 0 }, speed: 0 },
    renderer: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    canvas: {
      clientWidth: viewport.clientWidth,
      clientHeight: viewport.clientHeight,
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      dpr: renderer.getPixelRatio(),
    },
    camera: { position: camera.position.toArray(), target: controls.target.toArray(), distance: camera.position.distanceTo(controls.target), minDistance: controls.minDistance, maxDistance: controls.maxDistance, clearance: CAMERA_CLEARANCE },
    foundation: { pending: [...pendingFoundations], visible: structure.parts.filter(p => p.isFoundation && p.group.visible).map(p => p.id) },
    materials: { ready: surfaceResources()?.ready ?? false, failed: surfaceResources()?.failed ?? false, maps: 3 },
    physics: {
      engine: "cannon-es",
      bodies: physics.bodies.length,
      colliders: physics.bodies.length,
      timestep: 1 / 60,
    },
    screws: [...screws.values()]
      .filter((s) => puzzle.canRemove(s.id))
      .map((s) => {
        const p = s.group
            .localToWorld(new THREE.Vector3(0, 0.1, 0))
            .project(camera),
          rect = renderer.domElement.getBoundingClientRect();
        return {
          id: s.id,
          color: s.color,
          x: rect.left + ((p.x + 1) * rect.width) / 2,
          y: rect.top + ((-p.y + 1) * rect.height) / 2,
        };
      }),
  };
}
loadStage(0);
raf = requestAnimationFrame(frame);
const localQA =
  import.meta.env.DEV ||
  (["127.0.0.1", "localhost"].includes(location.hostname) &&
    new URLSearchParams(location.search).has("qa"));
if (localQA) {
  Object.assign(window, {
    __SCREW_HARBOR__: {
      loadStage,
      removeScrew,
      viewScrew: (id: string) => { const s = screws.get(id); return !!s && !puzzle.removed.has(id) && aimCameraForQA(s); },
      showStages,
      showPause,
      closeModal,
      getPuzzle: () => puzzle,
      getExtractionBlocker: (id: string) => { const s = screws.get(id); return s && puzzle.canRemove(id) ? blockingPart(s) : null; },
      getStructure: () => structure,
      setCameraPose: (position: number[], target: number[]) => {
        camera.position.fromArray(position);
        controls.target.fromArray(target);
        controls.update();
        renderer.render(scene, camera);
      },
      getDiagnostics: diagnostics,
      stageCount: STAGES.length,
    },
    __THREE_GAME_TEST_HOOKS__: {
      seed: (value: number) => {
        runSeed = value;
        loadStage(stageIndex);
      },
      setReducedMotion: (v: boolean) => {
        save.reduced = v;
      },
      setPausedForScreenshot: (v: boolean) => {
        paused = v;
      },
      hideDebugUi: () => {},
      setState: (name: string) => {
        if (name === "active-play") loadStage(stageIndex);
        if (name === "fail") showResult(false);
        if (name === "pause") showPause();
      },
      advanceFrames: (count: number) => {
        for (let i = 0; i < count; i++) update(1 / 60);
        renderer.render(scene, camera);
      },
    },
  });
  diagnosticTimer = window.setInterval(() => {
    window.__THREE_GAME_DIAGNOSTICS__ = diagnostics();
  }, 250);
}
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(raf);
  clearInterval(diagnosticTimer);
  clearTimeout(toastTimer);
  resizeObserver.disconnect();
  controls.dispose();
  disposeStructure();
  audio.dispose();
  renderer.dispose();
});
