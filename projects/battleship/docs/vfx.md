# Naval VFX correction and reference notes

## Sources checked

- NVIDIA GPU Gems, Chapter 6, Fire in the Vulcan Demo: https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-6-fire-vulcan-demo
  Applied: independent variation, smoke rolling, roots attached to emitters, alpha blending instead of additive saturation, bounded fill rate. Our implementation uses procedural rooted sheets, not the reference video atlas.
- NVIDIA GPU Gems 3, Chapter 30, Real-Time Simulation and Rendering of 3D Fluids: https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-30-real-time-simulation-and-rendering-3d-fluids
  Applied: upward advection and multi-scale turbulence as a visual approximation. This browser game does not claim fluid simulation.
- U.S. Navy, USS Zumwalt Conducts Live-Fire Missile Exercise: https://www.navy.mil/Press-Office/News-Stories/display-news/Article/3011731/uss-zumwalt-conducts-live-fire-missile-exercise/
- U.S. Pacific Fleet, Naval Strike Missile Launch Demonstration: https://www.cpf.navy.mil/Newsroom/News/Article/3943998/navy-warfare-center-drives-first-over-the-horizon-install-naval-strike-missile/
  Official launch context was available through search results. Both full-page fetches failed (Navy 403, Pacific Fleet fetch error), so their photographs were not directly inspected and are not evidence for our detailed visual/timing choices. Technical implementation is grounded in the accessible NVIDIA chapters.

## Implemented visual language

- Fire: one breach-rooted, independently seeded, upright flame sheet with irregular tongues; nine rolling smoke lobes. No ladder of flame icons. Damage scales body dimensions and smoke. Damage control removes both.
- Shell impact: brief flash, directional sparks opposing incoming projectile, dark breach smoke, bounded source-authored debris.
- Missile: launch flash and pale launch smoke; capped history of the actual flight trajectory renders a continuous pale exhaust with a compact motor. Interception leaves an airborne flash/debris and fading trail, without sea rings.
- Water miss: narrow rising spray plus wider low spray, gravity-driven droplets and surface rings. Torpedoes stay at water level and preserve their last known approach.
- Fatal damage: original damaged geometry is clipped into two hull halves at the impact longitudinal position. All source normals/colors/UVs/interior identifiers remain. Only actual cut edges receive narrow thickness strips; no solid fake cross-section conceals existing rooms/ribs. Explosion is secondary. Independently rotating halves fall under gravity and increasing flooding with water drag; fixed 1/60 substeps, no gameplay collision changes.
- Aircraft and ocean wakes retain source-authored geometry and existing instancing/ocean shader; no giant engine flames or contrails are added to low-speed reconnaissance.

## Budgets and lifecycle

1200-point buffer, 520 transient particles, 80 instanced flame bodies (one draw), 27 small debris meshes, 44 history samples per missile, at most 8 concurrent shots. Hull chunks have high and reduced detail variants; distant variants retain interior and cut surfaces while removing fine external triangles. Shared material, preserved unit scale, cut geometry disposed after 6.7 s or reset. Winner gating remains 7.25 s and hidden contacts never replay fracture. No additional post pass or texture asset.

Fracture is visual simulation, not a structural engineering/CFD solver. The final image must be checked after the three material textures have loaded; diagnostics expose texturesReady for this purpose.

## Verification artifacts

- `artifacts/fire/`: close carrier fire, independent later frame, and extinguished state on desktop/mobile.
- `artifacts/fracture/`: textured source carrier separated into two halves, later sinking, and completed state. Captures wait for actual color/normal/roughness images to load. Each half has 508 exposed cut edges and more than 46k interior vertices. Combined high detail 70,745 triangles, reduced detail 42,967 triangles.
- `artifacts/vfx/`: actual missile trail, sea impact, and interception, with effect counters and renderer diagnostics.
- Before: eight repeated flame sprites per mark formed upward columns; impacts shared one mostly isotropic burst; missile exhaust existed only at its motor; lethal damage sank an intact hull. After: one rooted body per mark, directional hit and water-specific spray, actual trajectory history, and clipped source hull halves.
- Textured fracture desktop sample: 30 draws / 116,145 triangles / 11 textures; mobile 29 draws / 116,095 triangles. After completion: 8 draws / 42,914 triangles. No post-processing passes added.
- Checks: desktop/mobile fire, fracture, missile/interception/water, sinking/no-replay/presentation gates. TypeScript checks also run. Tests are visual effect fixtures; they do not claim an accurate naval hydrodynamic simulator.
