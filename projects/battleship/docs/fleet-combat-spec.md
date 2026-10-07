# Battleship: shared-map fleet combat

This replaces the earlier hidden stationary 10×10 fleet game. User-approved rules take precedence over former design documents.

## Current October 4 authority

Each fleet has one carrier, three numbered destroyers and three numbered battleships. Battleship AP is 4. The retained aircraft is the user-supplied external F22. Attacks are reserved in the action phase and execute only after End, in carrier → D1 → D2 → D3 → B1 → B2 → B3 order. Each attack includes actual model-origin launch, defense/impact and camera presentation before the next starts; the opposing action phase follows completion. AP exhaustion does not automatically end the turn. Current enemy firing sources are transient cinematic actors without adding tactical sight; archived shots retain fog filtering. Canonical details are in rules.md. The older entries below record superseded decisions.

Carrier AP4 / reconnaissance1AP / one sortie perturn beforemovement; movement remainspossible afterlaunch. A sortie reveals21tiles and, afterbothopeningturns, attacks nearest enemy inthatmask for200HP. Four user-supplied F22 actors use the retained source asset. Every ship may spend2AP once perturn on command-bridge sonar, immediately revealing ocean around itself in radius12.5 / diameter25 for2ownturns while its bridge remains alive. Destroyers may spend1AP once perturn to launch a300-damage torpedo within radius15 / diameter30 while weapons remain alive; torpedoes bypass defense and travel5tiles perround. Destroyer21-cell escort uses one50% missile defense roll (never stacked), disabled byradar/AA damage; shells bypassescort. SubsystemHP200: propulsion/weapon/deck failure disablesmovement/fire/sortie, bridge failure disables sonar, radar shrinks21sightto9, AA disablesitsdefense. Unsuppressed damaged ships take fire damage at the start of their own turn equal to5% of missingHP rounded up, minimum5 and maximum50. Damagecontrol1AP restores50hull/partialpartHP, twice perbattle/onceperturn, suppressesfireuntilanotherhit; destroyedcomponentsstaydestroyed. Hiddenoccupancy no longer rejects publiclyvalidroutes: stepwise movement acquirespassivecontact and stops, chargingplannedAP. Client-only red last-seen tiles carry nohiddenupdates. Unsupported partsfallwithgravity. Bothfullyincapablefleetsdraw. Setupviewstartsnearourfleet; unrestrictedcurrent-viewzoom overrides historicalcamera caps.

## Earlier confirmed baseline (changes above take precedence)

- One shared30×30 map, two teams, three natural islands.
- Each team: carrier ×1 (HP1000/AP4), destroyer ×2 (HP500/AP4), battleship ×2 (HP800/AP3).
- Both teams cannot attack during their first own turn (global turns1and2); movement and scouting remain available. The authoritative server enforces this and rematches reset it.
- Every living ship refreshes AP on its team's turn. Each ship can act independently.
- Move one cell costs1 AP. Destroyer/battleship attack costs1 AP, at most once per ship per turn. Moving before/after attack is allowed while AP remains.
- Carrier cannot attack. Recon costs all2 AP and cannot share a turn with movement.
- Destroyer missile: any water cell on map, damage200. Battleship shell: any water cell within Euclidean radius12.5 (diameter25 tiles), damage200.
- Attack targets one cell with certain hit if occupied. Carrier defense is the explicit damage exception: first random <.33 cancels every attack type; if not canceled, second independent random <.33 halves damage.
- Carrier reconnaissance selects any center on map. Its5×5 region omits four corners:21 cells (rows3,5,5,5,3). Clip at map edge.
- Every living friendly ship supplies a passive21-cell local sight mask (diameter5); active carrier reconnaissance extends the union. Enemies appear only within that current union. Recon from team turn N lasts through its turn N+1, then expires when that turn ends.
- A carrier's death destroys its reconnaissance fighter and immediately removes its active sight.

## Implementation defaults

- Team turns alternate, all five ships act per turn. An explicit end-turn action or exhaustion of all living friendly ships’ AP advances play. Destroy all five opposing ships to win.
- A ship occupies one tactical cell. The model is uniformly scaled, with original proportions retained; grid dimensions never stretch models.
- Eight neighboring movement directions each cost1 AP. Islands and living ships block movement. Diagonal corner-cutting between blocked cells is prohibited.
- Opposite corner 7×7 deployment zones. Place all five ships freely before ready; one cell per ship, rotation45°; no overlap or out-of-zone coordinates. Single deterministic map, no map selector. Islands have irregular shorelines corresponding to blocked cells.
- Missiles and arcing shells can cross islands. Islands cannot be selected as attack targets. Blind shots at water are allowed.
- Passive local vision costs no AP and updates with movement/sinking; there is no permanent revelation on hit. Own ships are always visible to their owner. Successful own shots carry before/after victim snapshots solely for contact presentation. A hidden struck hull appears at actual projectile contact and is removed after the attack batch; no persistent tactical vision or minimap contact is granted.
- PvE uses only the same filtered snapshot that a human receives. Online room snapshots never serialize hidden enemy ships, enemy reconnaissance, or hidden enemy attack origins.
- Aimed local model damage marks persist through reconnect; attack damage remains assigned to one tactical cell. Small torn holes, scorching and flames/smoke follow the actual impacted part. Clicking currently visible enemies opens a live damaged-model/remaining-HP inspector, which clears immediately when visibility is lost. Only carriers expose reconnaissance, only destroyers expose torpedoes, and every ship exposes sonar. A persistent yellow square marks the selected cell. The camera never follows actions or selection; free orbit, view-plane pan and cursor zoom stay user-controlled. Explicit Home returns to the full map with a small margin.
- Continuous flames/smoke and localized visible damage; sunk ships become wrecks and clear movement occupancy.

## Release

Keep Battleship separate from Screw Harbor and preserve Pulse Arcade's other games and score database. Validate authoritative actions, AP/turn boundaries, reconnaissance lifetime/death, defense branches, privacy, pathfinding, browser inputs, and original model proportions before publishing.


## 2026-10-04 movement concurrency, immediate torpedoes and surface VFX

Idle vessels remain actionable during another ship's movement. Only the moving vessel's own commands are locked; its speed is unchanged. End is allowed during movement, but local resolution waits for arrival, and actual online weapon launch also waits for animated arrivals. Reserved surface/air attacks still follow the fleet order. Commands charge AP immediately once; presentation charges no additional AP.

Torpedoes now spawn at command-time launcher coordinates immediately for 1AP, without a queued launch. Every side's End advances all due projectiles by up to five navigable cells. Rules and Python server agree; visibility and impact presentation gates are retained.

The thin white dotted rectangle was a crack between independently tessellated pressure-wave and base ocean meshes. Aligned grids plus a narrow quiet edge overlap remove the holes. It is separate from the white reachable-cell perimeter.

Actual shell/missile position anchors the flight camera; the last part of flight widens toward the target hull, then impact holds on the victim. Surface shockwaves use anti-aliased radial profiles with foam breakup and a secondary front; sonar uses clean translucent fronts at the actual 12-cell radius. Both follow the same ocean height function.

Sinking water: one shared 640-instance draw (max1280 triangles), no textures or extra post passes. Hull-aligned initial displacement and smaller continuing spray use compressed-time gravity and horizontal drag; falling droplets meet the current water surface and leave drifting foam. Foam fades over nine seconds. Large secondary flames were reduced so submersion reads clearly. This is presentation physics, not a CFD simulation. Pools reset without replay on new games.

References: graphics-builder implementation-blueprint.md, technical-art.md, shader-cookbook.md and performance-safe-visual-detail.md; gameplay-workflows.md. Scoped asset decision: existing imported ship/projectile assets retained; radial masks, spray and foam are procedural event-driven support VFX, requiring no new hero models or bitmap assets. Technical-art target: <=750k triangles /300 calls /300 geometries /60 textures, PC only, same shadow/refraction pipeline.

Official reference material: DVIDS Dubuque RIMPAC2024 impact photograph https://www.dvidshub.net/image/8526567/dubuque-smokes-missile-strikes-during-rimpac-2024-sinkex and official SINKEX footage page https://www.dvidshub.net/video/931954/27th-special-operations-wing-conducts-sinking-exercise-during-rimpac-2024 . These are references only, no media was redistributed. The photo supports localized smoke; timed falling spray and foam are authored simulation choices.


### Visible launch and contact presentation

An attack first establishes the firing ship and animated mount. Actual launch remains in that shot for up to0.6seconds, followed by up to1second blended transfer into the live projectile shot; neither the launch callback nor aircraft missile separation cuts directly to projectile view. Normal impact framing holds1.8seconds. CIWS detonation follows lead-round contact; blocked shell outcomes use their own timing. Torpedo contact renders before damage/sinking commits and uses a waterline close shot. Missiles/shells leave white finite smoke trails; ship impacts use a bounded 48-step three-dimensional emission/absorption density field with asymmetric pressure lobes, soot-covered narrow fire jets, cooling gray smoke and gravity-driven spray/debris; the shared CC0 external30frame atlas is retained only for small interception bursts. Persistent breach fires keep their separate local scale. The action is named 대미지 컨트롤 in UI, logs and client/server validation messaging.


### Contact smoke and hit reveal — 2026-10-04
Contact pressure smoke retains its initial appearance, stays anchored, changes density and shrinks over1.5seconds. Small overlapping launch/CIWS-style puffs replace the dissolving bulk; breach fires emit slender upward columns with fixed offsets rather than orbiting centres. Pools remain bounded and use existing shaders/noise.

Aircraft missiles preserve launch framing and handoff, then remain in projectile view through contact. The victim framing starts after contact. Hidden victims are staged invisibly, with health/contact overlays suppressed; actual contact reveals the hull, commits prepared damage and preserves the full sinking/result gate. This temporary actor never enters authoritative vision, recon, enemy inspector or minimap contacts and clears on batch end/reset.

Torpedo impact water begins at the ray intersection with the actual waterline hull, recalculated at launch after movements finish. Authored intact hull is the fallback if a damage opening removed the entry triangle; a grid centre is not used as the contact. The final authoritative route segment supplies approachFrom, so island detours do not change the arrival side. Local falling spray uses the existing shared640-instance water pool; it does not create a large cut-off wet smoke volume. Impact smoke/flash/debris/camera use the same contact coordinates; sinking displacement remains hull-aligned.


### Local breach clusters and visual fleet CIWS — 2026-10-04
Each active supported damage scar has one dominant fire (1.25 scale) and six smaller fires (.36–.59 scale), individually projected onto surviving structure below the original impact lip. Candidates search inward if the initial patch lacks support. Seeds and origins remain stable in the hull's local frame through motion/LOD; damage control suppresses the whole repaired prefix, so later hits create only new clusters. Each emitter scales its smoke envelope with its flame. Persistent smoke uses up to96 overlapping stratified puffs per main fire, proportional smaller plumes, increased width/opacity and continuous upward motion; this replaces sparse isolated puffs with a visibly denser column. The finite contact cloud still ends at1.5seconds.

Missile/airstrike CIWS animation runs on hits, misses, partial defenses and interceptions. The target and neighboring defending-team ships within12world units fire from their actual surviving model-mounted CIWS barrels. The struck hidden cinematic actor may emit defensive tracers but stays hidden until contact; no new tactical contact is created. Destroyed hulls, distant ships and attacker-team ships do not participate. Only an authoritative blocked missile has the lead-round contact gate and airburst; all other firing is visual and preserves server outcome/AP/damage. The128-tracer pool reserves active contact rounds against eviction. Existing SFX are reused with per-shot audio deduplication.

Rendering remains bounded:392 instanced flame bodies cover14ships ×4 scars ×7fires in one draw, at most640 persistent smoke points shared with finite particles in the existing1200-point draw, and one CIWS instanced draw. No extra textures or postprocessing were added. Reference/asset decision: extend the previously sourced ship mounts, smoke shaders and sound assets; no new hero asset is needed for this change.
