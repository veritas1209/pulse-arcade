# Shared 30×30 naval renderer

This document supersedes the earlier stationary 10×10 implementation notes. The current authoritative design is `docs/fleet-combat-spec.md`.

## Current scene contract

`createNavalScene(canvas,onCell,onHover?)` implements the current `NavalScene` interface, including smooth `focus(cell)` and overview `home()`. A single120×120-world-unit ocean represents30×30 cells. The scene renders `own` plus the current `revealed` list only. Contacts removed from `revealed` are immediately removed from geometry, HP markers, persistent fire and wakes; no hidden-fleet cache exists. An impact without `source` descends locally above its target and cannot disclose a hidden origin.

Each ship has one tactical cell. All authored hulls, superstructures, weapons, aircraft and interiors are preserved by a uniform XYZ scale; there is no stretching, widening or bow remapping. Heading is radians, with an addedPI because original models face−Z. Movement animates through water waypoints with eight-neighbor movement and blocked diagonal corners. Persisted local hit coordinates cut small irregular holes in the struck upper surface, with scorched surrounding material and recessed torn metal. Full longitudinal deck bands are never deleted. Small fire/smoke emitters follow the actual struck surface on visible damaged ships; sinking settles and rolls wrecks under water, extinguishes the plume and leaves occupancy decisions to rules.

## Technical art brief

- Art direction: blue open ocean, warm reflection, restrained naval steel, warm sand, green island vegetation, cyan friendly signals and amber/red contact signals.
- Hero assets: the reused carrier, battleship and destroyer, maintaining original proportions and detailed source geometry.
- Terrain: three connected island masks,90 blocked cells,60 instanced palms and29 instanced rock clusters. Terrain triangles are confined to authoritative blocked cells. Rounded shoreline corners, wet beaches, textured smooth ridges, rock grain and wind-animated fronds soften the grid boundary.
- Ocean: broad moving swell, warped multiscale normal detail, Fresnel/specular reflection, distance filtering, shoreline foam/shallow tint and visible-ship wakes. Gradient sky/cloud/sun dome remains available at low orbit angles.
- Visibility: a transparent sea-level fog overlay marks unseen cells while land and the underlying ocean/map remain readable. Enemy model/HP/fire/wake visibility comes exclusively from supplied revealed contacts.
- Interaction: selected-vessel ring, team rings, camera-facing HP bars, cyan reachable cells, mode-colored target cell and21-cell reconnaissance preview. A friendly reconnaissance fighter orbits its scan center only while its carrier is alive.
- Render: ACES/sRGB, PMREM environment, warm key/cool rim/hemisphere fill, one1024 shadow light, no post-processing, DPR≤1.5 touch and≤2 desktop.
- Performance: original source meshes are merged per ship/damage state. Far ships retain authored outer structure at5.1–5.7k triangles. At most four desktop/two touch ships use high-detail geometry. Fixed-capacity particle buffers are reused; transient particles≤300, debris≤27, rings≤24.

## Proportion measurements

Dimensions are X/Y/Z. Float32 relative ratio error remains below9×10^-8; normalized axis ratios are effectively1.0.

| Ship | Source dimensions | Render dimensions | Uniform scale | High / low triangles |
| --- | --- | --- | --- | --- |
| Carrier |13.350 /12.070 /43.693 |1.100 /.994 /3.600 |.0823925825 |45660 /5248 |
| Battleship |8.095 /13.570 /43.693 |.602 /1.009 /3.250 |.0743821926 |49004 /5076 |
| Destroyer |6.395 /12.420 /37.693 |.492 /.956 /2.900 |.0769368448 |40984 /5680 |

The carrier is larger than the destroyer without changing any model's internal proportions. Detailed source attribution remains `screw-harbor/src/large-ships.ts`; only naval builders and a minimal geometry Kit were extracted. No screws or unrelated landmarks were copied. Original PBR atlas roles/colors are reused through `public/materials`.

## Asset and reference ledger

Relevant AAA,3D-generator and image-generator skills were loaded before source selection. Fresh process probes in this session reported only status names:

```text
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
ELEVENLABS_API_KEY=MISSING
```

Ships/PBR maps reuse the user-requested authored local assets. Ocean, sky, island terrain/material grain, palms, recon aircraft and VFX use local procedural fallback because generator credentials are unavailable. No provider/API calls or keys exist in browser code.

All required references were read from `C:/Users/hajin/.codex/skills/threejs-aaa-graphics-builder/references`: implementation-blueprint, model-recipes, render-recipes, technical-art, shader-cookbook, visual-scorecard, and checklists aaa-game-quality-gate, aaa-visual-scorecard and technical-art-quality. Both generator SKILL.md files were read; all three visual-scorecard calibration anchor images were inspected. References were retained across the scope change.

## Verified evidence

Current reports: `shore-final-qa.json` (final shoreline), `shared-final-qa.json`, `shared-scene-qa.json`, `shared-touch-qa.json`.

- Full-project TypeScript no-emit check passed after the shared-map integration.
- Isolated Chrome scene runs: zero page, console or shader errors.
- Exactly three island components;90/90 blocked-cell centers are dry; zero terrain triangles extend outside the authoritative mask.
- Ten visible ships with four high-detail models:27 draws,278142 triangles,23 GPU geometries,11 textures.
- Ten-ship burning view:26 draws,215121 triangles, one sustained emitter, one friendly reconnaissance fighter.
- Touch DPR is1.5 and high-detail count is capped at two; measured touch close view114202 triangles.
- Real emulated pinch changed camera distance524.40→309.06 and produced zero cell callbacks. Desktop click followed by a70px drag produced exactly one callback.
- Recon target preview contains21 cells. Killing its carrier removes the fighter. Removing enemy contacts immediately removes their render instances.
- The underlying terrain/ocean remains visible outside scan areas. Blind-shot VFX does not create a persistent hidden ship or plume.

Current captures:

- `shared-map-overview.png`: whole map and three islands.
- `shared-island-final.png`: smooth terrain, beach, palms and textured rock.
- `shared-ten-ships-final.png`: tactical vessel view and original proportions.
- `shared-carrier-intact.png` / `shared-carrier-burning.png`: intact/damaged source geometry and layered impact/persistent fire.
- `shared-map-touch.png`, `shared-ships-touch.png`, `shared-touch-pinch.png`: touch framing and zoom evidence.

Integrated app captures from the first shared-map pass are `fleet-map-desktop.png` and `fleet-map-mobile.png`; root owns the evolving HUD and its final complete desktop/mobile capture set. The isolated ship/island captures are graphics evidence, not a substitute for complete game QA. Final integrated canvas metrics and independent fresh-eyes scoring belong with that complete root capture set; no unverified showcase claim is made here.


## Final shoreline correction - 2026-10-01

The final pass replaces discontinuous cell-corner heights with a continuous Gaussian density coastline constrained inside the authoritative cell union. The outer border is submerged, sand is warmer, and the shore texture follows the same continuous field. Fog fades at the beach so its raised water overlay no longer produces an apparent vertical skirt. Smooth normals are shared across cell seams. Terrain subdivision is eight per cell edge.

Only `src/naval/islands.ts` and the coastal fog shader in `src/scene.ts` changed after the parent's `index-pU9g5shh.js` build. A fresh production build is required. Source ship geometry and scale factors did not change.

Final Chrome evidence: `shared-island-final.png` shows the corrected beach with no vertical slab rim. `fleet-map-close.png` captures sustained licking flame and rising dark smoke 5.2 seconds after impact, with zero remaining transient debris. `shared-carrier-intact.png` provides the matching original-proportion intact model. These are direct renderer captures with a deterministic ten-ship fixture.

`shore-final-qa.json` verifies 90/90 dry blocked-cell centers (minimum height 0.23034), zero terrain triangle centroids outside the blocked mask, zero browser/console/shader errors, one persistent damage emitter, 22 visible draw calls, 174105 triangles and 11 textures in the close damage capture. All three original-to-fitted axis scale ratios remain equal within Float32 tolerance; the earlier ratio measurements remain valid. Full-project TypeScript no-emit check passed after this correction.


## Local damage and free inspection camera - current patch

This section supersedes previous damage/camera captures and measurements. One ship still occupies one tactical cell. Original XYZ scale and silhouette remain unchanged. `ShipView.damageMarks` persists normalized local X/Z and seed. Mesh ray picking returns `onCell(cell,localHit?)`; two real clicks on separated deck points returned local Z -0.5467 and +0.5552 in the same correct cell. Geometry cuts only an irregular approximately 0.25 by 0.35 world-unit patch, retains nearby source geometry, and adds a rough dark torn rim/recess. Fire originates at the interpolated source surface; failed empty-space fallback points snap to actual source vertices.

At 15% carrier damage, persistent flame height is 0.2241 world units, maximum flame sprite width 0.2284, smoke height 0.5532, versus carrier length 3.6. `local-hit-burning.png` and `fleet-map-close.png` show this 5.6 seconds after impact; `local-hit-intact.png` is the matching intact 1920px view. Ship silhouette exceeds 400px at inspection zoom. Old `shared-carrier-burning.png` is historical and not representative of current damage.

Camera uses cursor-centered wheel zoom and screen-plane panning, with no forced target-height reset. Tested pan changed target Y from zero to 0.233. Camera position and target were exactly unchanged after damage state and impact. Current wheel/pinch dolly has no orbit-radius limits. Home fits the map at205 desktop, scaled by inverse portrait aspect; this is an explicit framing command, not a zoom cap. Home is explicit, except initial scene initialization. Parent UI owns removal of action/selection auto-focus. `free-camera-map.png` and `free-camera-mobile.png` show the current overview and 49-cell placement zone.

`local-hit-final-qa.json` records two-point ray aiming, unchanged damage camera, freely panned target Y, proportional flame/smoke dimensions, zero browser/shader errors, and desktop/mobile overview render cost of 22 calls / 94572 triangles / 11 textures. Cache cycling confirms only current damage LODs and reusable intact assets survive; unused prior geometry is disposed after checking live mesh references, and obsolete hit-surface points are pruned. Damage stays visible only for own or currently revealed ships.


Final cache-cycle result: 15 distinct damage states held geometry cache at 4, surface-point cache at 1, GPU geometry count at 21. Reset returned 3 / 0 / 20 and zero emitters. Ocean coverage expanded from 760 to 1200 units using the same 144 subdivisions, removing the distant water boundary at the mobile maximum zoom without adding triangles. Refreshed `free-camera-mobile.png` was inspected; 22 draws / 94572 triangles / 11 textures, zero page errors. Final code touched by this patch: `src/scene.ts`, `src/naval/fleet.ts`, `src/naval/effects.ts`, `src/naval/ocean.ts`.


## Camera collision, selection, F-22 and enemy inspection - 2026-10-02

The camera now applies a swept clearance check on every OrbitControls change, including wheel events before the animation frame. Seven offset rays test the movement segment against visible ship and island meshes. Water contact slides the proposed camera and target together; it never clamps camera height alone. Model contact clips the camera and target to the same segment fraction, then validates the orbit distance. Right mouse is explicitly PAN, screen-plane panning remains enabled, and sky/water coverage follows distant panning. Main camera uses unrestricted current-view dolly, with physical sea clearance at Y0.46. A separate yellow selected-cell square persists independently of hover, rendered above transient overlays.

`createEnemyPreview(canvas)` provides `setShip`, `update`, `resize`, `dispose`, and `diagnostics`. It uses the same authored fleet geometry, uniform scale, PBR atlas, damage marks and proportional persistent plumes. It draws only while a supplied currently revealed ship exists; setting undefined immediately removes its geometry, marks and particle emitters. The miniature has full above/below orbit, screen-plane right-drag pan, unrestricted wheel/pinch dolly, mesh collision and no water-plane constraint. Changed-kind placement recovers an overlapping camera without resetting normal inspection. Root UI supplies only selected revealed contacts.

Fresh required generator probes:

```text
TRIPO_API_KEY=MISSING
GEMINI_API_KEY=MISSING
```

The authored F-22 fallback uses the USAF's [official fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/) proportions (18.9m length and13.6m span), with chined fuselage, swept trapezoidal wings, twin canted stabilizers, gold canopy, twin intake throats, rectangular vectoring nozzles, RAM strips and service panels. Tactical model bounds are0.5046 length/0.3598 span, 856 triangles, one merged PBR draw. It banks into its flight path and points in its direction of motion. `f22-close.png` was rendered and inspected.

References loaded this pass: debug-profile-checklists, scene-debugging, mobile-input, QA/release checklists, model-recipes, and both generator skills. Previous render/technical-art/shader/scorecard reference work remains applicable. Initial Chrome launch failed before navigation; retry succeeded and dev5198 was restarted. No generator request was made without credentials.

Browser regression evidence in `naval-patch-qa.json`: repeated ±30000 wheel deltas and right drags stayed within the main [1.6,205] and preview[1.1,6] distance caps; main Y never fell below0.46. Terrain approach stopped at7.4085 on an actual mesh. A direct8-unit sweep through original carrier geometry stopped at Z1.8941 with lastObstacle authored-carrier, before crossing its hull. Preview orbit reached Y-4.7119 beneath the model with no sea constraint. Drag gestures emitted zero cell callbacks. Hidden preview ended with zero damage marks, emitters, particles and debris. Console/page/shader errors were zero. Full TypeScript no-emit check passed.

Captures: `selected-cell-enemy-preview.png`, `camera-island-collision.png`, `camera-collision-extremes.png`, `enemy-preview-orbit.png`, `f22-close.png`. The deterministic renderer harness `naval-patch-qa.mjs` covers extreme controls, persistent selection and hidden-preview clearing; root owns final integrated production/mobile UI QA and deployment. Code added: `naval/camera.ts`, `naval/f22.ts`, `enemy-preview.ts`; scene/effects/ocean integration updated.


Final refinement: selection uses Line2/LineMaterial with a constant 3px yellow stroke and resize-aware resolution. Both controls use panSpeed1.5 and zoomSpeed1.15. Swept collision ignores exit-facing triangles so zooming away from terrain remains unobstructed. Final rerun reached far205 repeatedly after land contact, maintained near limits and sea clearance, and repeated the original-carrier sweep stop at Z1.894083. The selected-cell/preview capture was refreshed and visually inspected; TypeScript passed again. Graphics code is frozen for the parent production rebuild.

## 2026-10-02 camera, waterline, flight and breach correction

Graphics implementation frozen after TypeScript and actual Chrome checks. `scene.ts` accepts fourth optional `(phase, shot, kind)` callback, where launch fires when queued and impact fires at physical arrival. `visualShip(id)` provides the currently displayed damage stage; `clearEffects()` cancels pending visual changes and all transient effects for a rematch. Source kind and launch position are derived only from a currently known source. Both projectile types take 1.3 seconds; blocked shots burst in air at 70% (0.91 seconds), with no water rings. Missile mesh includes cylindrical body, cone nose and four fins; cannon uses a compact shell.

Orbit navigation retained rotation and distance caps. A floor of 8 world units (3 in inspector) governs translation sensitivity when the pivot is near the eye. Same viewport/camera, 60px pan: distance40 remained3.18356, distance12 remained0.95507, distance4 changed0.31836→0.63671, distance2 changed0.15918→0.63671. Middle and right drag match exactly. Wheel−120 atdistance4 changed0.27335→0.54670; atdistance2 moves0.4 then stops at the1.6 hardlimit. World extremes1.6..205, preview1.1..6, no sea crossing, no drag-shot callbacks, zero browser errors. Mesh contacts slide tangentially using swept camera radius0.22 and coherent camera/target movement. See navigation-baseline-matched.json, navigation-after.json and naval-patch-qa.json.

Living ships now sample the actual tessellated ocean surface and ride at +0.035±0.006 world units. Source hull minimumY carrier−0.01598, battleship0.00404, destroyer−0.00234 is unchanged; no scale axis altered. Occupied-cell hover/deployment fills no longer cut visually across the hull. Sinking starts from the wave-adjusted pose; attached fire follows that pose. Waterline-current.png shows the result.

Damage removes localized irregular star-shaped regions, keeps the original authored interior geometry and adds separated bent rim shards. No fabricated crater floor or continuous polygon cup remains. Two HP200 hits leave HP600 and preserve the entire original hull silhouette. Exact sorted interior vertex equality checked across all three models: carrier86340, battleship83688, destroyer81912 vertices before and after. High-detail two-hit triangles52758/59228/47985. All uniform scales and fitted dimensions match original-proportion evidence. See interior-preservation.json and jagged-interior-enlarged.png (enlarged inspector shows transverse ribs/rooms beneath the breaches); jagged-two-hits-current.png and jagged-two-hits-close.png show sustained fire and smoke after5seconds.

Visual queue regression: before first arrivalHP1000, first arrival800, second arrival600; clearing during flight then resetting same ID remains1000; enemy contact removed during flight remains absent. See visual-queue-qa.json. Fresh browser measured launch→impact1.3008/1.3017 seconds and blocked0.9208 seconds (one-frame discretization), no runtime errors. Flight screenshot and intercept screenshot are missile-flight-current.png and intercept-current.png. Particle/mesh pools stay bounded; hidden inspector clears all emitters.

## 2026-10-02 unsupported parts and subsystem destruction

Used debug-profiler references/debug-profile-checklists.md, checklists/scene-debugging.md and checklists/performance-profile.md. Reproduced an unsupported exhaust box in a close carrier view as well as fabricated static peeled triangles. Removed the synthetic rim triangles completely. Source-authored groups now retain an aPart attribute; small struck attachments detach as whole source components, and destroyed bridge tiers propagate loss to their supported upper tiers/masts. Thin chimney trunks connect originally unsupported exhaust/stacks/funnels down to their deck without changing model bounds or uniform scale. Original hull/internal rooms remain.

fleetGeometry(asset, marks, low, parts?) accepts disabled subsystem state. Radar removes mast/radome assemblies; weapon removes main/aft turrets, VLS and launchers; airDefense removes CIWS/AA mounts; engine removes actual stern propellers/shafts. Flight deck retains the localized cut at the hit coordinate. fleetDetachedGeometry returns newly removed, centered source geometry; effects.detach owns it and applies world transform, rotation, gravity, sea entry drag, submergence and final disposal. Shared transient debris cap remains27. damagePoint optionally accepts the actual damaged geometry so fire can anchor to the remaining structure rather than a removed mast's former height.

Chrome1440×960 direct graphics harness: all27 retained fragments moved and rotated from0.05 to0.65seconds; all entered water and all were removed by5.65seconds. Renderer31calls/136208tri/33geometries during fragments,4calls/128288tri/6geometries after removal across three detailed ships. No console/page errors; TypeScript passes. Evidence: parts-physics-qa.json, parts-detached-launch.png, parts-falling.png, parts-destroyed-settled.png; close carrier screenshot parts-carrier-settled-close.png verifies connected exhaust and no suspended bridge fragments. Root owns scene/inspector integration, part state cache and delayed phase application; these files were not edited in this patch.

## 2026-10-02 carrier aviation correction

Replaced the F-22 recon geometry with F/A-18E/F Super Hornet geometry. Official references: https://www.navair.navy.mil/product/FA-18EF-Super-Hornet and https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2383479/fa-18a-d-hornet-and-fa-18ef-super-hornet-strike-fighter/ (direct Navy fetch403, indexed official text available). Source dimensions18.5m length/13.68m span and carrier/Harpoon role inform the model. Fresh credential presence probe: TRIPO_API_KEY=MISSING, GEMINI_API_KEY=MISSING; procedural source fallback. No image or remote asset generation used.

New buildSuperHornet({length?,parked?}) from naval/aviation.ts returns one merged geometry, nose -Z. Default bounds0.3697297×0.1320270×0.5,1460triangles. Four aircraft add5840triangles in one scene-owned instance draw. LEX extensions, swept wings/fold seams, twin circular engine exhausts, canted twin tails, rectangular intakes, canopy, pylon missiles, undercarriage doors and arresting hook are modeled. Parked variant adds gear, and replaces all10 deck aircraft in the carrier asset while preserving its exact source/fitted bounds and uniform scale0.08239258. Carrier now57720high/20748lowtriangles.

Airstrike effects recognize Shot.kind='airstrike', use carrier missile visuals from provided airborne release position, descend into a low anti-ship approach, and impact after2seconds. Interception occurs at1.4seconds as an airburst; surface flight remains1.3seconds. Air-launched missile geometry scales to0.35 of surface projectile size. Root owns the four-plane formation, lead-plane release point and gameplay targeting. DD CIWS already maps to airDefense for newly enabled destroyer escort defense.

Actual Chrome gallery screenshots: super-hornet-close.png, super-hornet-underside.png, super-hornet-carrier-deck.png. aviation-qa.json records exactbounds,2.0000second impact,1.4000second interception, no errors; TypeScript passes. Legacy f22.ts export is only a compatibility alias to the Super Hornet builder.

## 2026-10-02 intact fitting support audit

Source audit corrected the intact destroyer's four-tube launchers with welded deck pads, two braced cradle stations and eight collar clamps per launcher. All added pieces are children of dd-antiship-* and carry its aPart index. Mast diagonal arms now close into a triangular brace. attachNavalSupports connects turrets, CIWS/AA mounts, VLS bases, radar/mast bases, stepped bridges, boat cradles, catapults and exhausts to the actual surface below. Pedestals are owned by their equipment group. Structural support meshes are retained in low LOD. Destroyer helicopter skids now rest on the deck. No unrelated scene/effects/navigation files changed.

Chrome1440x960:18 screenshots across three intact models (port/starboard/bow/aft), low LOD and destroyed variants. fitting-support-qa.json records7 carrier/37 battleship/14 destroyer automatic foundation corrections in addition to manual launcher/brace connections. All three model source bounds remain exactly equal before/after; uniform scaling is unchanged. Disabling weapon/radar/AA leaves0 vertices belonging to those removed part IDs, including support geometry. TypeScript and browser runtime checks pass,0 errors. High/low triangles: carrier58116/21144, battleship51852/7924, destroyer43962/6738; all remain merged into one vessel draw.

Representative close evidence: support-destroyer-port.png clearly shows launcher cradles and deck pads, support-carrier-port.png shows seated mast/radome/island layers, support-battleship-starboard.png shows gun/AA/boat foundations. support-destroyer-destroyed.png confirms launcher pedestals and radar bases leave with the destroyed system. Remaining port/bow/aft and low-LOD images share the support-{kind}-{view}.png naming. Browser closed before root resumed GPU profiling.

## Current imported fleet correction
Current fleet is Gerald Ford (Usman Zia/Uxxman CC BY4), Bismarck and USS Arleigh Burke DDG51. The selected F22 Raptor is the user's supplied Sketchfab Free Standard asset by sxnneh. Original indexed UV/normal seams are retained, source normal maps are sampled, painted hulls are matte, and balanced source LOD preserves structural surfaces. Interiors are fitted against actual hull sections, with floors/rooms/machinery along the vessel. Current conversion and PC evidence are recorded in docs/ledgers.md; earlier procedural model counts above are historical.


## Current carrier deck actor pipeline (2026-10-03)
World assets use buildFleetAssets({carrierAircraft:'animated'}); the default offline/gallery asset still includes baked parking geometry. createCarrierAircraft owns four actors per filtered carrier, two instanced draw batches, shared near/far parked/air geometries and source textured material supplied by scene. Ground curves use arc-length progression, acceleration/braking and tangent yaw; wheel base rests on the actual Ford deckY .19625. Recon updates redirect current aircraft; recon removal recovers from astern and taxis back. Early cancellation parks queued craft and safely returns moving ground craft before clearing recovery traffic. Reset/dispose clears actors and owned geometry, preserving caller material ownership. Tests cover partial launch, moving deck, destroyed flightDeck, visibility removal and delta independence. Simple interior structure uses inward liners, rooms/floors/ceilings plus engine blocks/fuel cylinders; no separate full interior physics simulation.
