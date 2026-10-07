# Screw Harbor — dense playable-ad structures

## Current implementation

The collection follows the user's clarified **Screwdom playable-ad** reference. It contains 12 architectural/nautical miniature models, **1,379 independently detachable components and 2,758 screws**. Every component has exactly two fasteners. The first cottage has 156 screws; ships have 252, 290 and 336. This replaces the earlier low-count, globally phased model implementation.

`src/structures.ts` owns models, real component boundaries, screw mounting coordinates, a geometric removal witness and Korean stage names. `layer` is retained only as an authoring preference when finding a witness; it does not determine runtime eligibility. There are no `dependsOn` locks. The engine may select any screw currently exposed by actual geometry and route its color to a current box or temporary buffer.

## Art and construction

The original hand-painted miniature silhouettes remain: cream plaster, oxidized teal roofs, coral painted metal, warm brass, oak framing and pale blue glazing. The collection includes a cottage, lighthouse, lattice windmill, curved-roof pavilion, four-sided clock tower, ferry, observatory, temple, working freighter, seaside hotel, three-funnel ocean liner, and three-tier palace.

Authored exterior assemblies are physically divided into small boards, roof strips, masonry courses, gable sections, façade panels, deck bays, hull plates, cabins and framing sections. Triangle clipping preserves their curved silhouettes and secondary ornament. A 0.5% contraction creates hairline construction seams. These are independently transformed/detached pieces, not extra screw heads attached to a handful of large props. Complete arched window assemblies are extracted before subdivision so their panes/mullions/sills remain coherent removable objects.

Concealed functional interiors have their own independent geometry:

- Cottage/hotel: three cupboards, three stocked shelves, ceramic sink and tap, oak table, two chairs, five loft stair treads, hearth and chimney flue.
- Ships: eight engine/pump assemblies, ten individually bracketed pipe sections, existing keel and shaped inner ribs.
- Pavilion/temples: woven floor panels, lacquer altar tables and paper lantern assemblies on each floor.
- Lighthouse/windmill/clock/observatory: twelve spiral service stair treads and four brass service instruments, alongside existing clockworks, gearing, telescope or armillary sphere.

The complete model disappears after all parts are removed. Every decorative triangle belongs to a removable piece; no static cover remains over internal screws.

## Fastener placement and physical witness

Each component receives two surface-mounted fasteners, with a minimum separation of `0.5 × boltScale + 0.05` world units (0.24–0.37). Their positions and normals are local to their component. `boltScale` is 0.38–0.64 of the engine's normal bolt dimensions, selected from local panel size. The engine retains independent hit targets, instanced bolt rendering and remaining-bolt hinge motion.

The factory constructs candidate fastener locations by raycasting onto five faces of each component. It rejects downward surfaces and self-obstructed rays, casts from an outward/upward camera position toward the actual scaled bolt head, and records the exact blocker set per candidate. Camera-to-head direction is essential: a ray starting inside a solid cupboard and travelling outward would incorrectly miss its one-sided exit faces. It then greedily chooses a component with two exposed candidates, removes that component from the planning set, and repeats. The resulting `parts` array is a complete, physically validated exterior-to-interior witness. `root.userData.witnessPartIds` duplicates this order, and each group stores its `witnessIndex`.

The witness additionally proves **physical extraction clearance**, not merely line of sight. For every candidate it casts five double-sided rays along the world screw normal: one center ray and four radial rays at radius `0.16 × boltScale`. Rays start at the mounting point plus `normal × 0.153 × boltScale`, the actual cap top. The actual screw spans from shaft bottom -0.22 to head top 0.153, so its full withdrawal length is `0.373 × boltScale`. Rays use near 0.0005 and far `0.373 × boltScale - 0.0005`, allowing exact-equality clearance. These dimensions mirror `src/extraction.ts`; there is no arbitrary fixed pull distance. The owning component is excluded because the shaft is intentionally embedded in that part. Every other component that intersects this withdrawal corridor is added to the candidate's blocker set. Both fasteners must have a free viewing ray AND a free extraction corridor before a component is selected for the witness.

No global layer or phase is used to force that order during play. The witness guarantees one possible route while actual visible, physically extractable screws remain freely selectable. Occluded interior points become visible when the covering geometry falls. An unresolved cycle or component with no reachable/extractable fastener pair causes a factory error rather than silently placing floating or unreachable screws. All twelve factories currently complete this witness successfully.

The witness selects both fasteners of one component consecutively. A small hinge swing around the remaining bolt's world normal preserves that bolt's point/normal and therefore remains compatible, provided the engine preserves the exact pivot and does not rotate the bolt away from its panel.

## PBR surface batching and performance

The original twelve material roles are baked into per-vertex color plus roughness/metalness attributes. A shared `MeshStandardMaterial` injects only these two surface values into the standard lighting shader and uses an explicit program cache key. This retains matte plaster, painted surfaces, blue glazing and metallic brass while merging every component into **one draw call**. There are no transmission passes, per-object textures or permanent glow effects.

| Stage | Components / model meshes | Screws | Model triangles |
| --- | ---: | ---: | ---: |
| 해변 오두막 | 78 | 156 | 14,700 |
| 산호빛 등대 | 84 | 168 | 12,946 |
| 황금빛 풍차 | 90 | 180 | 19,384 |
| 비취 정자 | 96 | 192 | 20,360 |
| 구시가지 시계탑 | 102 | 204 | 32,361 |
| 섬마을 여객선 | 126 | 252 | 45,124 |
| 별빛 천문대 | 110 | 220 | 22,901 |
| 붉은 처마 사원 | 116 | 232 | 22,480 |
| 항구의 화물선 | 145 | 290 | 34,337 |
| 리비에라 호텔 | 126 | 252 | 17,780 |
| 그랜드 오션라이너 | 168 | 336 | 53,568 |
| 구름 위 궁전 | 138 | 276 | 29,760 |

Measured Node factory time including clipping, PBR merge, corrected eye-to-head surface raycasts, five-ray extraction clearance and witness planning: 0.42–1.96 seconds across the twelve stages; cottage 0.64 seconds and liner 1.96 seconds in the latest sample. The engine owns instanced bolts (four shared batches), platform, shadows, physics and camera. Current model-only costs are below 300 calls / 160k triangles; integrated live metrics must include those engine surfaces. Real shadows should remain one directional caster, with device DPR/shadow resolution adjusted before removing authored detail.

## Asset sourcing and credential evidence

Both generator skills were read before choosing the procedural fallback. Their own Python probe commands returned:

```text
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
```

| Surface | Source | Evidence / reason |
| --- | --- | --- |
| Twelve high-value hero structures | Authored Three.js geometry | Tripo probe returned MISSING. Exact detachable panels and local screw ownership are implemented directly. |
| Trim, tile ribs, windows, lattice, portholes, clocks, cargo corrugation | Authored geometry merged per component | Gemini probe returned MISSING. Geometry provides real contours and remains attached to the correct falling piece. |
| UI, background, audio | Parent game ownership | Not changed by this module. |

No provider generation, downloaded GLB, task ID or generated image is claimed. API/polling/import/image-to-model references were not applicable because no provider task or asset import was attempted after missing-key evidence.

## Reference ledger

Paths are relative to `C:/Users/hajin/.codex/skills/`. All listed references were read; none failed.

| Read | Reference |
| --- | --- |
| Yes | threejs-aaa-graphics-builder/SKILL.md |
| Yes | threejs-aaa-graphics-builder/references/visual-scorecard.md |
| Yes | threejs-aaa-graphics-builder/references/implementation-blueprint.md |
| Yes | threejs-aaa-graphics-builder/references/model-recipes.md |
| Yes | threejs-aaa-graphics-builder/references/render-recipes.md |
| Yes | threejs-aaa-graphics-builder/references/technical-art.md |
| Yes | threejs-aaa-graphics-builder/references/shader-cookbook.md |
| Yes | threejs-aaa-graphics-builder/references/checklists/procedural-model-quality.md |
| Yes | threejs-aaa-graphics-builder/references/checklists/performance-safe-visual-detail.md |
| Yes | threejs-aaa-graphics-builder/references/checklists/aaa-game-quality-gate.md |
| Yes | threejs-aaa-graphics-builder/references/checklists/aaa-visual-scorecard.md |
| Yes | threejs-3d-generator/SKILL.md |
| Yes | threejs-image-generator/SKILL.md |

## Validation state

- Full project `tsc --noEmit` passes with the dense structures, shared PBR shader and exact-length extraction witness.
- All twelve current factories instantiate and prove complete geometric witness orders, totaling 2,758 reachable screws.
- All stages have at least 150 screws; each has 78–168 separately detachable pieces with two fasteners apiece.
- The earlier 266-screw orbit report, low-count screenshots and `structure-render-metrics.json` described the superseded first implementation. They must not be used as evidence of current gameplay counts or rendering performance.
- Earlier silhouette review caught and fixed protruding ship ribs, misaligned observatory dome trim, roof collar gaps and floating windmill screw mounts; the dense models inherit those fixes.
- The current custom PBR surface shader compiled in actual Chrome without page or console errors. Initial dense cottage and liner frames (`artifacts/dense-stage-0.png`, `dense-stage-10.png`) were inspected and retained the original palette and silhouettes.
- The first real mouse pass found two buried mounting points (cottage after 117 removals and liner after 70). The eye-to-head correction above fixed that false-positive visibility test. An additional static audit mirrored all 120 discrete camera orbits used by the real-input bot at every witness step: corrected cottage 156/156 and liner 336/336 points each have a valid camera view.
- Mobile real-touch completion passed cottage 156/156 and liner 336/336 with no failures both before and **after** the exact-length physical extraction guard. The guarded run used the built `/games/screw-harbor/` preview, 390×844 touch viewport, actual touchscreen taps, ID-specific removal assertions and the engine's 12-degree remaining-bolt hinge motion. `artifacts/input-bot-mobile.json` records both stages as `won`, every expected screw removed, no failures and no browser errors.
- Current initial-stage frames are `artifacts/dense-structure-01.png` through `dense-structure-12.png`; the complete current collection was inspected in `dense-structure-collection.png` / `.webp`, labelled with each stage's exact screw/component count. These replace the old low-count gallery as current evidence.
- `artifacts/dense-structure-render-metrics.json` records complete initial scenes: 86–176 calls and 99,246–233,154 triangles, no page errors. Cottage: 86 calls / 99,246 triangles. Liner: 176 calls / 233,154 triangles. Cargo: 153 calls / 189,635 triangles. Dense ship scenes exceed the earlier 160k total-triangle target but remain below the reference 300k mobile starting budget; model geometry itself remains below 54k triangles. Zero-scale hidden bolt instances still contribute submitted-triangle counts, so won-state metrics must not be mistaken for visible geometry.
- All twelve updated factories prove extraction-safe witness orders using the same five-ray corridor constants as the engine. The parent's complete desktop exact-ID pointer run and independent final visual scorecard remain integrated QA. No premium/AAA/showcase completion claim is made by this module alone.

