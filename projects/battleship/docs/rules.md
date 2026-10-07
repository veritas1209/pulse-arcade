# Battleship rules

Canonical engines: `src/rules.ts` for PvE/preview and `server/battleship_rooms.py` for authoritative online play. Both use a 30×30 board, three fixed irregular islands, opposite 7×7 deployment zones, and one tactical cell per ship. Visual models retain original proportions through uniform scaling.

| Ship | Per team | HP | AP | Attack |
|---|---:|---:|---:|---|
| Carrier | 1 | 1000 | 4 | One sortie per turn; nearest enemy in its scout region receives 200 damage |
| Destroyer | 3 | 500 | 4 | Missile, unrestricted board range, 200 damage |
| Battleship | 3 | 800 | 4 | Shell, radius 12.5 / diameter 25 tiles, 200 damage |

## Deployment and turns

Team0 deploys in x/z0..6; team1 in x/z23..29. Exactly five canonical own IDs are required, without overlap. Optional heading is radians; client HP/AP/kind/parts fields never override the server. Ready locks deployment; both ready begins the host turn. Local setup uses `createBattle(false)`, `applyPlacement`, `startBattle`.

Both teams' first own turn (global turnNumber1/2) forbids attacks. Scouting is allowed, but its automatic airstrike is suppressed without consuming attack RNG or creating a shot. Rematch restores this opening restriction.

Eight-direction BFS movement costs 1 AP per step; islands/living known ships block routes, diagonals cannot cut blocked orthogonal corners, wrecks clear occupancy. Previews use only filtered knowledge. Authority executes the public route one cell at a time; discovering a previously hidden enemy in actual passive sight stops movement before collision and returns success. It charges the full planned path AP and reveals only the contact justified by that new sight. No hidden-occupancy error or hidden destination detail is returned.

Destroyer/battleship attacks cost 1 AP, once per ship per turn. Movement before/after firing is allowed. Friendly occupied cells and islands are invalid targets; empty water misses. Weapons may cross islands. Exact battleship range boundaries use Euclidean distance, inclusive at12.5.

A carrier sortie costs 1 AP, once per turn, before movement. It can move with remaining AP afterward. Its 21-cell region is a 5×5 square minus four corners (rows3/5/5/5/3), clipped at edges. From the second own turn it attacks exactly one living enemy in that region, nearest to the selected center; ID breaks distance ties. The region lasts through the owner's next turn end (expiresAt=N+2). Renewal replaces that carrier's prior region; carrier death or destroyed flight deck immediately removes it.

Once per turn, every living ship with an intact command bridge may spend2 AP on sonar. It immediately reveals the radius12.5 / diameter25 ocean area centered on that ship for2 own turns. Once per turn, destroyers with an intact weapon system may spend1 AP to launch a torpedo at a target within radius15 / diameter30, independently of their normal missile attack. A torpedo travels5 tiles per owning attack phase, deals300 damage on arrival, and bypasses escort and carrier defense.

Attack commands reserve AP and a fixed target during the action phase. Damage is resolved only after an explicit End declaration, even when AP reaches zero. The attack phase runs carrier aircraft → destroyers 1–3 → battleships 1–3, keeping reservation order within each ship. Existing torpedoes resolve in their launcher's slot. One attack's flight, defense, impact and sinking presentation completes before the next begins. The opposing action phase starts only after the whole attack phase finishes; it never shares the same volley.

The online server resolves damage and random outcomes. Both connected clients acknowledge the exact current presentation step; a 60-second connected-time fallback prevents a silent client from stalling. Disconnection pauses advancement and reconnection requires fresh acknowledgments. During a current attack, the firing ship snapshot is available solely for its cinematic actor; it does not extend basic sight, reveal the rest of the enemy fleet or disclose future reservations. Archived shots resume ordinary fog filtering.

End-of-resolution refreshes the incoming team's AP/attacked/moved/scouted/repaired flags and applies its fire damage. Wreck AP is ignored; disabled ships retain only AP for usable actions. Incapable teams are skipped and two incapable fleets draw. All seven opposing ships sunk wins, after the final destruction presentation.

## Localized systems and damage control

`src/parts.ts` defines `{engine,weapon,radar,flightDeck,airDefense}` entries applicable to each kind, each `{hp:200,maxHp:200,disabled:false}`. Carrier has engine/radar/deck/AA; destroyer engine/weapon/radar/AA; battleship engine/weapon/radar. Ordinary positive damage also reduces only the struck applicable subsystem by the same amount; hull damage remains200 or100, without a second damage charge. AA-blocked hits do not damage systems or append marks.

`localHit{x,z}` is normalized model-local position about the fitted original bounding-box center, per-axis half extent; values must be finite within[-1,1]. Source bow is−Z. Mapper priority follows authored physical groups: carrier starboard island radar x.35..85/z−.2...25, side AA abs(x)≥.66/z−.55...8, stern propulsion z≥.55, central flight deck abs(x)≤.65/z<.55. Noncarrier radar abs(x)≤.35/z−.15...4, DD side AA abs(x)≥.66/z−.5...5, stern propulsion z≥.55, actual weapon attachment footprints in `WEAPON_REGIONS` take priority over bridge/propulsion; remaining bow and other positions damage hull only. Aft VLS/turrets and side launchers use their original normalized model bounds. Stern damage represents propellers/shafts, not disappearance of central engine rooms. Graphics owns matching physical collapse/removal.

Disabled engine prohibits movement, disabled weapon prohibits attack and torpedo launch, disabled deck prohibits sorties and removes planes, disabled bridge prohibits sonar, disabled radar reduces passive sight to3×3/9cells, disabled AA removes its defense. Positive hits append `damageMarks{x,z,seed}` and `lastShot.localHit`; a sequence-derived uint32 hash independently samples both fallback coordinates within[−.8,.8] without consuming defense RNG. Marks follow the ship and persist as scars.

An unsuppressed damaged ship takes fire damage at the beginning of its own turn. Damage equals5% of missingHP rounded up, with a minimum of5 and maximum of50; it applies before the refreshed turn's actions. Repair/damage control costs1 AP, once per own turn, with2 total charges per ship. It restores hull50 up to original maxHP and each partially damaged living subsystem50 up to maxHP. Destroyed systems and sunk ships cannot be restored. It preserves scars, sets `damageControl:true` to suppress fire until another positive hit, resets `repaired` only on the next own turn, and exposes `repairCharges`. Fully disabled ships may spend their remaining repair AP, then become actionless once charges run out.

## Defense

A living destroyer with intact radar and AA escorts allied targets inside the same21-cell mask. Missiles and airstrikes receive exactly one50% interception draw even with multiple overlapping escorts; shells bypass escort interception. On successful interception, damage0, blockedtrue; `interceptedBy` contains the chosen guard's cell only if the recipient saw it at fire time and still sees it.

If not intercepted, an intact carrier AA system draws33% to block; only after that fails, a second independent33% draw halves damage to100. Exact .33 does not trigger a branch. Destroyed carrier AA consumes no defense RNG. Misses draw no defense RNG. Shot.kind always identifies the visible projectile as missile/shell/airstrike without disclosing a hidden firing ship.

## Fog and privacy

All living own ships have free passive21-cell sight, reduced to9 by destroyed radar. The current visible union includes own ship masks and active planes, follows movement and loses sunk/disabled sources immediately. Enemy identity/HP/AP/parts/coordinates appear only within current sight; no history maintains scene visibility. Snapshots deep-copy nested parts/marks and never serialize enemy planes, private history, action logs or global ship arrays.

Shot.source is always available to its firing player; opponents need both visibility at fire time and current visibility. Later scouting cannot retroactively reveal an originally hidden source. Victim shipId requires ownership or current reveal. Optional targetBefore is an exact deep-copied pre-impact ship for animation, requiring target visibility at fire time AND currently visible target; newly inserted plane sight legitimately qualifies. Fog loss removes it, and a blind hit never grants it retroactively. This keeps newly scouted vessels intact during incoming projectile travel without exposing hidden models. Private source/target/interceptor visibility flags are never sent.

## API and fair AI

Rules exports BOARD_SIZE, SHIPS, ISLANDS, cellKey, createBattle, deploymentCells, placementValid, applyPlacement, startBattle, snapshot, applyAction, reachableCells, isOpeningTurn, canAttack and chooseAIAction. Pure parts exports createParts/partAt/partDisabled/canMoveShip/canFireShip/canReconShip/canRepairShip/repairEligible. BattleCommand is move/attack/recon with shipId/target (attack optionally localHit), repair with shipId, or end.

AI uses only recipient-filtered snapshots and separate observed-memory per side. It never reads hidden state. Carrier scouts once then follows moving screens, retreats from visible threats and respects destroyed systems. Weapon ships flank islands, advance multiple cells while reserving shot AP, and attack visible or remembered contacts. Destroyed scout capability enables persistent patrol destinations and aging blind-water search; destination persistence prevents endgame oscillation. Repair uses the same limited charges. Difficulty changes decisions, not damage/AP. Memory resets on rematch.

## Online protocol and checks

`setup_battleship(app,origin=None)` registers create/join REST routes and `/ws/battleship/{code}?token=private-token`. Commands include placement/ready fleets, direct BattleCommand, action wrappers, rematch and leave. State/error envelopes remain `{type:'state',state}` / `{type:'error',message}`. Generated high-entropy tokens, exact configured Origin checks,4096-byte message bounds,12commands/second, creation/join40/minute/IP,200-room cap and memory TTL remain. Disconnect pauses actions; same token reconnects/takes over its seat. Both sides approve rematch. State remains memory-only and does not touch Pulse scores.

Verified:38 TS tests plus strict TS checking;37 Python core and actual two-client WebSocket tests. Coverage includes shared map/actions/snapshots parity, opening guards/no mutation, automatic turns/privacy expiry/victory priority,21/9sight, subsystem locations/penalties/partial damage, escort probability/type/range/no stacking/disabled defense, sortie nearest target/AP/order/one-per-turn, repair caps/no resurrection/scars/fire/charges, actionless skip/draw, stepwise hidden contact acquisition, targetBefore privacy/copy, client override rejection, auth/Origin/ownership/disconnect/reconnect/rematch. All12 seeded fair-AI self-play matches finish within90rounds; this is a sanity check rather than a guarantee for every player strategy.

Commands: `node node_modules/@playwright/test/cli.js test --config=tests/rules.config.ts --output artifacts/rules-test-results`; `python -m unittest discover -s tests -p test_rooms.py -v`. External staging helper `scripts/remote-room-smoke.py` accepts BATTLESHIP_TEST_BASE/ORIGIN, handles sortie+escort outcomes and prints no tokens. Root owns browser/graphics QA and deployment.


## Sonar and travelling torpedoes

All living ship kinds can cast ship-centered sonar with an intact bridge/command system:2AP, once per own turn. The circle has Euclidean radius12 (diameter25 grid cells including the center), includes only ocean cells and clips board edges. It unions with passive/plane vision. Sonar is private to its owner; the cast turn and next own turn are covered (expiresAt=N+2, removed on that next own-turn end). A destroyed bridge or sunk source immediately removes its sonar. Moving does not move an already cast region. Sonared resets at the owner's next turn.

Destroyers with intact weapons can launch a torpedo for1AP, once per own turn, independently of their missile shot. Both opening own turns forbid launch. Target range is Euclidean radius15 / diameter30, inclusive. The launch fixes the target, source and deterministic eight-connected shortest navigable route around public island cells; same-cell target is invalid. At every global turn transition, beginning immediately on the next turn, all active torpedoes advance up to5 route steps. Each traversed actual coordinate checks living enemy occupancy, so fast movement cannot tunnel. Friendly ships and wrecks are passed. The launch planner excludes island cells and diagonal corner cutting. Unreachable or land destinations reject before consuming AP. Swept land guards remain authoritative for malformed legacy routes. Empty destination ends travel. Adjoining corner ship coordinates are not hits.

The first enemy collision deals300, bypassing carrier AA and DD escort RNG, through the same hull/subsystem/scar/fire/victory path. Launch consumes no damage sequence or RNG; impact emits kind:torpedo with projectileId. A launched torpedo survives launcher loss; remaining torpedoes disappear when the match ends. Pending projectiles prevent an otherwise actionless draw before their deterministic impacts resolve. Incoming turn order is hull fire, all due projectile sweeps, whole-batch victory evaluation, then living-ship AP/flags refresh.

Snapshots expose all own torpedoes (including their target and remaining route), but only currently visible enemy wakes with id/team/x/z/heading. Enemy source/launcher/target/route/index/timing are never transmitted. Hidden launcher origin requires visibility both at launch and now; a later visible wake cannot retroactively reveal it. Projectile IDs on impacts are exposed for the firing player or a currently visible target, without trajectory details.

`ViewState.shots` is the current successful action or turn-transition impact batch, with each event individually filtered using its fire-time and current visibility. It is not historical history; a later successful non-impact action clears it, rejected actions preserve state. It retains simultaneous torpedo hits that lastShot alone could overwrite. Reconnection/animation gating is owned by main/scene. Sonar/torpedo ability flags and bridge200HP mirror TS/Python; an immobile/unarmed bridge-alive ship retains sonar AP. The AI uses useful sonar expansion and launches toward observed/remembered contacts without reading hidden state; it avoids duplicate known-target launches and routes around public terrain while retaining carrier retreat/scouting priorities.

Additional verification:47 TS rules tests and44 Python tests cover sonar kinds/ocean boundary/AP/bridge/privacy/lifetime, first-turn torpedo guards, DD weapons/radius/cost/independent missile limits, every-global-turn5-step timing, path collision/destination/island/diagonal shore,300 defense bypass, nested parts/fire, launch-origin redaction, multi-impact batches/projectile identifiers, launcher loss, final sinking, pending-projectile deadlocks, bridge sonar AP, fair AI and cross-language snapshots. External staged/public smoke additionally exercises opening sonar2AP/private masks, opening launch rejection, torpedo1AP/own-only wake and next-turn despawn. References loaded for this patch: gameplay-workflows.md, game-design-level-design.md and physics-engine-selection.md from the gameplay skill. Custom deterministic grid sweeps are used; no runtime rigid-body engine or render-loop collision dependency is needed. Browser controls/VFX/deployment are root-owned.


Destroyed-system action guard: a present subsystem with HP≤0 is unavailable even if its legacy `disabled` flag is stale. Explicit `disabled:true` remains unavailable regardless of HP. This applies to authoritative missile/shell/torpedo launches and carrier sorties, and the filtered-snapshot AI uses the same predicate. Already launched torpedoes retain their independent trajectory.

All AI difficulties send coordinate-only attacks and never provide subsystem `localHit` aims. Hit regions are determined by the shared deterministic impact sampler. AI sees only its recipient-filtered snapshot and memory of previously observed contacts; current hidden ship positions never enter its decisions.


2026-10-03: all battleships now have4AP in local and authoritative multiplayer, matching carrier/destroyer movement allowance. Torpedo target range staysradius15; detours can exceed15 pathsteps but advance5cells at each global turn. Hidden ships never affect the planner. Only friendly remainingroutes render as water-following dashedlines; targeting previews use the identical terrainrouter. Visual motion traverses each advancedwaypoint instead of drawing a chord through islands.


2026-10-04 authoritative update: command-time torpedo launch spends1AP and creates index0 at the current launcher coordinate immediately. It is not a reservation. All due torpedoes advance up to5 navigable routecells at either side End. Surface/air reservations spend their AP once at command-time and never again during resolution. Movement animations permit commands to other idle vessels; a moving vessel itself remains locked until arrival.
