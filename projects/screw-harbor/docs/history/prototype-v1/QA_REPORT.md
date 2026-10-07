# SCREW HARBOR — 로컬 검증 보고서

2026-09-30 · 사용자 로컬 플레이를 위한 완성 빌드. Pulse Arcade 업로드는 사용자 검증 완료 후 진행한다.

## 결과와 실행

- 로컬 플레이: http://127.0.0.1:4188/
- Pulse 경로/CSP 재현: http://127.0.0.1:4190/games/screw-harbor/
- Windows 재실행: 프로젝트 루트의 Start-Game.cmd
- 배포 ZIP: release/screw-harbor-pulse.zip (303,051 bytes)
- 정적 게임: 12 스테이지, 133 해체 부품, 266 나사. 별도 서버·계정·CDN이 필요하지 않다.
- 마우스/터치 나사 선택, 드래그 회전, 휠/핀치 확대, 회전 버튼/방향키, H 힌트, Z 되돌리기, R 재시작, Esc 일시정지.

## Game design brief

플레이어는 작은 건축 모형과 큰 배를 나사 하나씩 풀어 해체한다. 시간을 재촉하는 대신 두 색 수집함과 제한된 임시 보관함으로 선택 순서를 고민하게 한다. 주 동작은 나사 선택, 보조 동작은 구조물 회전이다. 같은 색 3개를 모으면 수집함이 교체되고, 부품의 모든 나사를 제거하면 그 부품이 회전하며 떨어진다. 가장 깊은 층까지 해체하면 완료된다. 보관함이 가득 차면 실패하며 되돌리기가 정확한 직전 상태를 복구한다. 완료한 구조물과 소리/모션 설정을 localStorage에 저장한다.

Core loop: 노출된 나사 선택 → 색 수집함 또는 임시 보관 → 부품 해체와 다음 층 노출 → 상자 교체 → 구조물 완료. 실패 시 되돌리기 또는 즉시 재시작. 플레이 실력은 색 순서와 버퍼 공간을 계획하는 데서 드러난다.

## Level/encounter plan

1–2장은 해변 오두막/등대로 색 분류와 회전을 배운다. 3–6장은 풍차·정자·시계탑·여객선으로 외장/내부 구조와 다른 방향의 나사를 소개한다. 7–10장은 천문대·사원·화물선·호텔에서 5색과 4칸 보관함을 결합한다. 11–12장은 15/14개 부품의 오션라이너와 궁전으로 여러 해체 단계를 시험한다. 모든 구조물을 컬렉션에서 자유롭게 선택할 수 있어 사용자가 큰 배부터 테스트할 수도 있다.

초기에는 5칸 보관함, 어려움/전문가에는 4칸을 사용한다. 깊은 층의 은색 나사는 잠겨 있고 현재 층은 색으로 표시한다. 다음 수집함 색과 보관량을 표시한다. 마지막 색 묶음의 1개/2개 부분 상자는 실제 남은 수량을 목표로 표시한다. 힌트는 제한된 탐색으로 해결 가능한 수를 찾고, 실제 메시 가림과 UI 겹침을 검사해 보이는 동색 나사 또는 다른 안전한 색으로 안내한다.

## Verification

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| TypeScript + production build | PASS | pnpm run build |
| Pure puzzle rules | 8/8 PASS | tests/puzzle.test.ts |
| Desktop + touch functionality | 6/6 PASS | tests/functional.spec.ts |
| Screenshot baseline comparison | 2/2 PASS | tests/visual.spec.ts-snapshots/ (게임/일시정지 × 두 화면) |
| Real mouse input bot | 12/12 won, 266 clicks, errors=[] | artifacts/input-bot.json |
| Logical solver and genuine fail/recovery | 12/12 solve; 5 hard stages have losing routes; stage12 undo recovery PASS | qa-rules-report.md, scripts/qa-puzzle-stages.mjs |
| Screw visibility | 266/266 reachable with orbit | art-report.md |
| Production prefix + CSP | PASS, no console/page error or 404 | tests/functional.spec.ts; final inspector JSON |
| Canvas pixel check | desktop/mobile nonblank | artifacts/final-canvas-desktop/desktop-active-play.json; artifacts/final-canvas-mobile/mobile-active-play.json |
| Release allowlist + SHA256 | 17 files PASS | release/pulse/catalog-entry.json; release/pulse/manifest.json |

기능 검사는 실제 Chrome에서 마우스와 터치 탭, 되돌리기/재시작, 일시정지/복귀, 소리 토글, 회전, 컬렉션 선택, 좁은 화면을 확인했다. 1440×1000, 390×844, iPhone 13 에뮬레이션 390×664 등에서 화면 넘침을 수정했다. 순수 규칙 검사와 실제 마우스 봇은 별개로 실행했다. 입력 봇은 힌트 버튼과 실제 좌표 클릭으로 모든 구조물을 완료한다. 논리 검사는 개발 훅으로 고의 실패와 복구를 검증한다.

Visual test harness: added. 게임과 일시정지 상태를 데스크톱/모바일에서 비교한다. 고정 색 생성, reduced motion, screenshot pause를 사용한다. update: `pnpm run test:visual --update-snapshots`; compare: `pnpm run test:visual`. threshold: game maxDiffPixelRatio 0.003, pause 0.002. WebGL 안티앨리어싱과 OS 글꼴 차이가 있으므로 다른 PC에서 처음에는 기준 이미지를 검토해야 한다.

Bot playtest: added. `node scripts/input-bot.mjs`는 모든 스테이지를 실제 클릭으로 풀고, 오류/미완료가 있으면 실패 종료한다. 색의 논리적 순서만 테스트하지 않고 화면 가림·클릭 좌표·UI 겹침까지 확인한다. 고친 문제: 가려진 힌트, 큰 터치 프록시가 앞 나사를 잘못 고르는 경우, 등대 나사 머리/구멍 좌표 차이, 모델 위 회전 버튼, 작은 화면 넘침, 종료 후 AudioContext suspend 오류.

## Technical art / render budget

구조물은 재질별로 부품 안에서 메시를 병합한다. 나사의 금속/홈 메시를 병합하고 작업대 눈금을 InstancedMesh로 바꿔 오두막 draw calls를 283→116으로 줄였다. 실제 모델에는 곡선 선체, 지붕 처마, 격자 날개, 난간, 창문/창살, 컨테이너 리브, 망원경/시계 내부 구조가 있다.

- Target desktop: <=350 calls, <=160k triangles. Actual all stages: 101–179 calls, 30,158–70,366 triangles, 34–64 geometries, 3 textures.
- Reference mobile target: <=150 calls. Most models pass; ocean liner179 and palace152 exceed by29/2. Detailed ship silhouettes are retained; no claim that phone frame rate has been measured. Mobile release override ceiling180 calls, all stages below160k triangles.
- DPR cap: desktop2, mobile1.5. One1024 shadow map; ACES exposure1.2, warm key and cool fill; no postprocessing/transmission render passes.
- VFX readability: screw head immediately responds, spins outward then shrinks; only detached parts get physics; no camera shake/flash blocking the puzzle. Reduced-motion mode shortens animations and is saved.

Physics engine: cannon-es 0.20, selected for a small JS-only falling-part simulation and portal CSP compatibility. Timestep1/60s, max3 substeps, clamped delta0.05s. Collider: simple box per detached part + ground plane. At most15 detached part bodies per stage; restart/undo removes all dynamic bodies. Attached structures are governed by puzzle layers and geometric picking, not a brittle physics support simulation. No sensors/CCD; initial debris velocity is low, and collision accuracy has no role in whether a puzzle is solvable. Complex concave part contacts are approximations. CPU/GPU frame rates on physical phones remain unmeasured.

## Measured evidence / visual scorecard

Intel UHD Direct3D11 GPU, softwareRendered=false. Final desktop entropy2.35bits, edgeDensity0.105, luminance contrast55.9, dominant share0.532. Mobile entropy2.70, edgeDensity0.186, contrast86.7, dominant share0.650. The bright ivory workbench intentionally occupies most of the canvas; these values do not demonstrate a dense environment, and world/material/light scores stay at2 or lower.

Builder assessment against the provided rubric, adapted to this tabletop puzzle:

| Category | Builder score | Evidence |
| --- | ---: | --- |
| Art direction | 2 | Coherent miniature/workshop color/material language |
| Hero/player | 3 | Twelve authored detachable architectural/nautical models |
| Obstacles/enemies | 2 | Occluding layers and locked screws; no combat enemies |
| Rewards/interactables | 2 | Sculpted screw head/thread, collected slots and bundle completion |
| World/environment | 2 | Physical workbench/engraved dial and scale cues; sparse on purpose |
| Materials/textures | 2 | Shared12 material roles plus geometric trim/panels; no generated textures |
| Lighting/render | 2 | Intentional key/fill/shadow; desktop contrast55.9 limits the score |
| VFX/motion | 2 | Unscrew/release/collection feedback and reduced motion |
| UI/HUD | 3 | Game-specific trays, buffer, collection, fail/pause/help states |
| Performance evidence | 3 | Baseline/post calls, full renderer measurements and functional/visual QA |

Builder average:2.3. Fresh-eyes review is recorded separately in docs/visual-review.md; final reconciled scores use the lower of the two assessments. Automatic failures: no unresolved input/blank canvas/CSP/UI overlap failure found; repeated screw silhouettes and sparse environment limit showcase claims. This delivery does not claim AAA/showcase quality or physically verified mobile performance.

## External asset sourcing

Credential probe output (literal script output):

```
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
ELEVENLABS_API_KEY=MISSING
```

Chosen sources: hero/player and buildings/ships = authored procedural Three.js; world/sky/background = workbench geometry/CSS; materials/textures/decals = shared PBR roles and merged geometry; logos/icons/GUI = local HTML/CSS plus runtime screenshot thumbnails; audio = local procedural Web Audio feedback. No external provider task IDs or generated GLB/image/audio files exist. Keys were probed before this fallback. Provider generation remains blocked by missing credentials; no key or provider URL is put in the client. All art meshes are original; Three.js/cannon-es license notices are in public/licenses/THIRD_PARTY.txt.

Audio: six interaction groups/events (unscrew, part release, box completion, victory, error, UI) synthesize short tones in one AudioContext. First pointer gesture unlocks it. Pause/visibility/mute suspend it; scene exit closes it. Generated ASMR recordings, music and ambience are not included because ELEVENLABS_API_KEY=MISSING. Functional sound controls passed; artistic audio fidelity requires user listening.

## Skill-loading ledger

All local skill paths are under C:/Users/hajin/.codex/skills/ unless noted.

- Director: active — threejs-game-director/SKILL.md.
- Gameplay systems: yes — threejs-gameplay-systems/SKILL.md.
- AAA graphics: yes — threejs-aaa-graphics-builder/SKILL.md; art-report.md records application.
- UI: yes — threejs-game-ui-designer/SKILL.md; frontend-design/SKILL.md; ui-report.md.
- Debug/profile: yes — threejs-debug-profiler/SKILL.md.
- QA/release: yes — threejs-qa-release/SKILL.md.
- 3D generator: yes — threejs-3d-generator/SKILL.md; generation skipped after missing-key probe.
- Image generator: yes — threejs-image-generator/SKILL.md; generation skipped after missing-key probe.
- Audio generator: yes — threejs-audio-generator/SKILL.md; generation skipped after missing-key probe.

## Reference ledger

- Yes: threejs-game-director/references/phase-playbook.md.
- Yes: gameplay systems references/gameplay-workflows.md, game-design-level-design.md, game-feel.md, physics-engine-selection.md; checklists/new-game-definition-of-done.md, game-design-level-design.md, game-feel.md.
- Yes: graphics references/visual-scorecard.md, implementation-blueprint.md, model-recipes.md, render-recipes.md, technical-art.md, shader-cookbook.md; quality/procedural/performance checklists named in art-report.md.
- Yes: UI references/ui-patterns.md; checklists/game-ui-quality.md, hud-readability.md, responsive-ui-fit.md, mobile-input.md.
- Yes: debug references/debug-profile-checklists.md; checklists/scene-debugging.md, performance-profile.md.
- Yes: QA references/qa-release-checklists.md, visual-test-harness.md, playtest-bot.md; checklists/visual-verification.md, playtest-qa.md, release.md, visual-test-harness.md, bot-playtest.md.
- Yes: audio references/audio-workflows.md.
- Provider API/import/image-to-model references: not-needed after MISSING probes, no provider task/import was performed.
- Pulse Arcade guide: read as supplied integration reference. It did not authorize executing remote commands; the user's local-test condition controls the upload timing.

## Phase ledger

| Phase | State | Evidence |
| --- | --- | --- |
| Gameplay systems | done |12 stages,8 rules tests,266 real input clicks |
| External asset sourcing | done with generation blocked |three MISSING probe lines; authored fallback recorded |
| AAA graphics implementation phase | done for original miniature style |art-report.md/gallery/geometry audit; no AAA quality claim |
| UI | done |desktop/touch tests and4 visual baselines |
| Debug/profile | done |geometric/selection/audio/layout fixes;283→116 calls |
| QA/release | local done; upload pending user test |build,17-file manifest,checksums,303KB ZIP |

## Delegation and remaining risk

6 Astra handled complex3D detail;6.1 Sol handled the interface;5.6 Sol handled state rules/solver/tests;6 Luna handled research/docs/packaging and independent visual review.5.6 Luna was not available in the model selector, so6 Luna took the simplest work too. No token-use totals are available, and no claim of a quantified saving is made.

User must still judge fun, touch precision and audio on the intended actual devices. Chrome mobile emulation is not Safari/iOS hardware. Browser support requires WebGL2 (this Three.js version); context creation failure has retry guidance. Persistent in-progress moves, account sync, cloud leaderboards, ads, monetization and infinite procedural levels are not implemented. Stage completion/settings persistence is local to the browser. Pulse production baseline/catalog merge and service switch remain intentionally pending the user's local test; no remote host or existing portal files/DB were modified.
