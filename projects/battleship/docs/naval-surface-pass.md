# Naval and coastal surface pass — 2026-10-03

## Art and scale contract

World of Warships is a reference for layered naval construction, surface scale, restrained worn paint, readable non-skid decks and rocky coastal terrain. This browser pass does not claim equivalent content density or photorealism. Authored hulls, interiors, source bounds, one-scalar fitting and gameplay weapon regions are retained.

The carrier is still 3.6 world units long. A 332.85 m carrier reference gives approximately 92.5 m/world-unit as an art comparison, not a new gameplay unit system. Palms now stand 0.22–0.42 units high with 0.20–0.34-unit crowns instead of 1.8–3.3-unit trunks and almost ship-sized crowns. Ship material repeats are 12/world-unit, about 7.7 m per tile at that comparison scale. Small painted plate seams and flight-deck tie-downs provide fine scale without adding render calls.

## Required reference and source ledger

Read: threejs-aaa-graphics-builder SKILL.md and implementation-blueprint, model-recipes, render-recipes, technical-art, shader-cookbook, material-lighting-quality and performance-safe-visual-detail references. Also read threejs-3d-generator and threejs-image-generator SKILL.md before choosing sources. Source geometry already contains rails, antennas, vents, weapons, support foundations, aircraft and rooms.

Credential probes, literal outputs:

```
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
```

- Coastal surfaces: hybrid authored terrain/instanced outcrops plus photographed CC0 PBR maps from [Coast Land Rocks 01](https://polyhaven.com/a/coast_land_rocks_01), photography/processing by Rob Tuytel and tiling/adjustments by Rico Cilliers. [Poly Haven license](https://polyhaven.com/license) permits use and redistribution under CC0. Actual source URLs, SHA-256 hashes and output byte counts are in `public/materials/surface-v2-sources.json`.
- Ships: retained authored hull and damage model plus a deterministic eight-role PBR atlas. Generator keys missing; no paid generation attempted. Runtime files are `naval-v2-{color,normal,roughness}.webp`.
- Trees/rocks/scrub: bounded support geometry, four shared instance draws. No separate per-object material or texture allocation.
- Visual reference: [World of Warships Update 0.10.10](https://worldofwarships.com/news/game-updates/update-01010-superships/) describes the seafoam/wake and tree shading upgrades; official ship screenshots establish weathered military finishes and human scale equipment.

## Surface and resource decisions

Six maps: three 1024×1024 coast maps, three 2048×1024 naval maps. Approximately 1.94 MiB total transfer, 48 MiB estimated RGBA8 GPU storage including mipmaps. WebP reduces transfer; it is not GPU block compression. Albedo is sRGB; actual OpenGL normal and roughness maps remain NoColorSpace. Maps share anisotropy 4 and mipmap filtering.

Naval atlas: 4×2, 512px cells with a 12px wrapped gutter. Roles are painted steel, non-skid deck, teak, bare machinery, glass, trim, anti-fouling and internal steel. Continuous planar UVs are interpolated across triangles; wrapping is performed per fragment. Explicit textureGrad gradients come from the continuous coordinates, avoiding derivative seams at atlas repeats. Geometry carries aSurface through clipping, damage, detached parts and whole-hull fracture. One material/draw per vessel remains. Existing high/low geometry selection remains intact.

Terrain: slope-dependent exposed rock, brighter dry sand and dark wet margins; memoized continuous height field with eroded ribs/gullies. The submerged edge and authoritative occupied-cell union still constrain the coastline. Angular stratified rocks, narrow feathered palm leaflets, curved trunks and low scrub supply layered detail. All instance matrices/colors and bounds are computed after batching. All geometry, materials and texture resources are disposed by the island factory.

Budget: mobile <=150 draw calls, <=300k triangles, <=40 textures, <=128MiB estimated texture storage, one 1024 shadow map. Island pass adds one draw compared with the previous terrain/palms/rock set. Palms use 3 instances per eligible cell and 84 leaf triangles per tree; rock instances use 80 triangles and scrub instances 20. Distant vessel LOD remains necessary for fourteen visible vessels. GPU measurements and screenshot validation are owned by the integrating task.

## Validation before GPU integration

- TypeScript noEmit passed.
- Existing weapon-region verifier passed: 16 authored weapon regions, both geometry LODs, HP/disabled guards and visual parity.
- Existing fracture-source verifier passed: 9 cuts across all 3 kinds, finite vertices, original bounds, no scaling/stretching.
- No ship source scale, fit size, weapon bounds, source surface position, hull interior or system membership changed.

GPU shader compile, near-view ships, island coastline views, mobile budgets and integrated effects remain the visual integration gate. Do not infer a premium/AAA score from these CPU checks.

## External F/A-18E follow-on

The user authorized free external aircraft, and an accessible original-asset redistribution was found. Active `buildSuperHornet()` now decodes the KOG_THORNS F/A-18E, licensed CC-BY 4.0, from packed source-derived vertex streams. [Creator model](https://sketchfab.com/3d-models/boeing-fa-18e-super-hornet-9e852037bf2141dcb3fda17013958131), [redistribution license](https://github.com/cinascorp/opensky/blob/main/boeing-f18/license.txt). The public Sketchfab API independently confirmed attribution license, commercial reuse, downloadable status and 77,840 source triangles.

Source has 220 meshes and 14 materials/12 color textures. Source node transforms and normals were baked, texture colors converted to linear vertex color, transparent canopy approximated as opaque blue glass, geometry uniformly normalized/rotated to nose -Z. Deployed gear source parts are retained only in the parked variant. Flight variant keeps thin wing/body panels and uses bounded vertex clustering: 20,059 triangles. Parked variant uses more conservative per-part quadric reduction plus clustering: 5,616 triangles. Both remain one draw/material in the existing instanced/merged game architecture. Packed attribute payload is 924,300 bytes before base64/build gzip, no extra runtime textures.

A first 3,993-triangle aggressive reduction was visually rejected because it removed thin wing skins. The retained flight variant was inspected in `artifacts/surface-v2/f18-external.png` and has closed wings and the proper pointed nose, twin tails, inlets, canopy and stores. CPU validation (`scripts/verify-external-aircraft.mjs`) passes finite attributes, unit normals, exact target length and uniform scaling for flight/parked at 0.5 and 2.8 lengths. Attribution and conversion metadata ship under `public/models/f18-source-notice.txt` and `public/models/f18-import-report.json`.

Standalone GPU surface fixture: zero console/page errors; coastal 37-cell sample has 38 palms, 61 rocks, 44 scrubs, 16,424 terrain/detail triangles and five terrain/detail calls. This is a focused surface validation, not a substitute for final active-game/mobile budget measurement. Material atlas uses the same configureFleetMaterial function as production. Negative aSurface values preserve original imported albedo and normals with neutral roughness .65/metalness .25.


## 2026-10-03 water optics and unified tactical surface

The user screenshots showed large bright triangular patches at map distance and solid visibility/deployment sheets beneath vessels. The correction removes rendered fog, grid and filled tile sheets: the same animated ocean shader now draws thin antialiased grid lines and soft tactical edge tints. The 30x30 authoritative visibility/action mask stays separate from geometry and uses bilinear filtering; hidden enemy meshes remain absent. Selected yellow outline and team rings still depth-test against hulls at the wave surface. The board no longer has competing raised colored planes.

Research source: [NVIDIA GPU Gems 2, Chapter 19, Generic Refraction Simulation](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-19-generic-refraction-simulation). Adopted the scene-color/depth capture, perturbed screen-space lookup and foreground rejection idea. This implementation uses a small WebGL capture, not a WebGPU migration. Reference skills: Three.js game director, AAA graphics builder (render recipes, technical art, shader cookbook, performance-safe detail) and QA release. Existing authored ship assets and surface maps retained; no new assets or generation required for this shader bug fix.

Astra owned ocean.ts, islands.ts and ship-overlays.ts; root owned scene integration, water-refraction.ts, formation parity and serial hardware-PC verification. Macro wave normals and blue-grey environmental response remain at distance, while high-frequency waves filter smoothly with pixel footprint. Narrow sun response is replaced by broad restrained response. Wake support remains exact, with inactive and distant-pixel rejection before expensive distance/exponential work.

Refraction uses one half-resolution linear half-float color target plus depth, longest side <=1024 pixels. Only visible opaque nearby low-detail ship geometry, fracture chunks and coast enter it; main ship LOD is restored afterwards. The overview above y=75 skips capture. Ocean remains depth-writing and opaque as a composed result, with shallow actual hull geometry transmitted and tinted via depth-dependent absorption; indiscriminate alpha blending would expose the whole ship rather than model real water. Clear depth and foreground silhouettes are rejected to prevent ghost hulls. Target, layers, geometry, shadow auto-update and tone-mapping state are restored. One extra bounded pass is a quality/performance tradeoff, not a free effect.

Coast shelf and shadow masks are softened and desaturated. Under-hull contact darkening is narrower and lighter; actual submerged hull visibility provides the waterline instead of a dark block. No additional ocean geometry or map textures: ocean remains 18,432 triangles, existing cached warped normal map is reused.

Default fleet now places battleship-3 at (1,3), beside carrier (3,3), matching the fifth user screenshot; other six slots remain unchanged and opposing team mirrors coordinates. TS and Python defaults match. Historical combat scenario fixtures retain their original coordinates so this layout change does not redefine test encounters.

Validation: strict TypeScript, 54 TS rule tests, 48 Python server/room tests, and four hardware desktop fracture/contact/fire/victory tests pass. Ocean CPU report checks 900 wave samples and 48 depth reconstructions. GPU optics fixture uses actual imported destroyer geometry: 3,669 pixels change when transmission is enabled; map-range frame comparison has only 1.085e-6 fraction with RGB change >25. Clear/foreground rejection and skip-at-overview are exercised. Formation/coast/close-DDG screenshots reviewed in artifacts/sea-v2; no console/page errors. Mobile explicitly excluded by user. Final package, performance and public deployment results are recorded in docs/ledgers.md.


## 2026-10-03 Iowa, daylight and command routes

The requested seven-ship tactical fleet uses the supplied USS Iowa 1984 ZIP for battleships, preserving the existing physical scale (304.5m = 3.6 world units). Original hull Y0 is its waterline. Canonical GLB has 684,071 triangles; source-index runtime near/far variants have 73,006/53,908. Retained original position/normal/UV tuples have zero unknown source corners; 14 interior bays fill 90.37% of length without source-face overlap. Ford/DDG payload hashes remain unchanged. ZIP/GLB contains no author or license metadata; the user-supplied provenance is recorded without inventing a license. Source SHA and audit are under artifacts/external-assets/us-fleet/iowa-1984.

Iowa's named ancestors identify 3 Mark7 turrets, 4 Harpoon, 8 SLAM launchers and 4 Phalanx assemblies. Broad whole-length heuristic weapon strips were rejected. Matching TS/Python regions reduce the unbiased weapon footprint classification from 214/256 to 52/256 samples. All battleships start and refresh to4AP. Fleet UI order is carrier, destroyers1–3, battleships1–3; seven stable digit slots1–7 include sunk entries so remaining ships never shift numbers. WASD shares view-relative pan with middle/right drag and cancels autofocus, respecting text fields, paused/help/result overlays, blur and browser modifiers.

Torpedoes use deterministic eight-neighbor shortest sea routes around public island cells, forbid diagonal corner cuts, reject land/unreachable targets before charging AP, retain radius15 target range and five steps per global turn. The owner alone receives a copied remaining route; enemies receive only currently visible position/heading. One shared dashed water-following line displays planned/fired friendly routes. Visual motion follows every traversed waypoint rather than cutting an island chord. Route lengths may exceed target displacement after detouring. CPU parity covers52 terrain cases and actual WebSocket route override/privacy checks.

The sky is cloudless blue daytime with matched sun direction and output color conversion. Coast foam/shallows/contact now derive from the exact triangulated terrain height at sea level; the former underwater-distance foam contour and double dark rim caused the convex-sea/concave-land illusion. No new terrain triangles, texture allocations or render passes are added. ShoreCPU report:90 cells/11,520 terrain triangles, zero inverted faces, mean foam-height distance .0467world, alpha quantization error below1/255.

PC-only gates: rules57TS/50Python, four input/motion CPU tests, real command-order/WASD focus/blur/help/input browser tests, launched path/routed movement browser test, carrier fracture/reveal/extinguished-scar tests, and Iowa final victory test. Victory timing starts after initial textures and fixture damage-worker preparation, retaining the15second post-shot explosion bound and requiring the full sink before the result. The original immediate fixture measured startup work as shot latency. Scale audit explicitly requested from6.1Sol is artifacts/scale-audit-sol.md; actual ship ratios are coherent, with camera height, default LOD, oversized optical wave bands and dominant board markers contributing to miniature perception. The audit is read-only and does not certify AAA quality.


Iowa-specific display grading dims neutral untextured linear paint and lightly desaturates original teak, preserving packed source albedo/UV/maps, excluding keel and dark trim and leaving Ford/DDG unchanged. Final daylight gallery has zero shader/page errors. Native2560×1440DPR1 source profile measured far38.35FPS, near27.07, near pan27.87 on the available GPU; new Iowa runtime is heavier than the prior battleship. This is a measured limitation, not a60FPS or AAA claim. Main embedded geometry JS drops from prior~56.1MBraw/10.07MBgzip to40.40MBraw/6.28MBgzip. Packaged PC browser online/reconnect/inspector/opening/audio/private snapshots passes35snapshots/22SFX/errors0. Packaged authoritative rooms also pass. Mobile deliberately omitted.


Final daylight horizon review found the first pale sky too washed out after ACES and the dark CSS vignette. Adjusted blue horizon/zenith gradients and softened top/edge shade; final packaged low-angle image reviewed at artifacts/iowa-daylight-final/clear-horizon.png, shader/page errors0. Public release20261003-battleship-064958 is active. All57 public SHA256 files and8 catalog entries pass;97 unrelated files preserved. Public room guards and PC browser multiplayer/reconnect/opening/inspector/private payload/audio validation pass35snapshots/22SFX/errors0. Temporary19096 preview stopped, local5195 and freshly restarted19095 remain healthy. No mobile validation.
