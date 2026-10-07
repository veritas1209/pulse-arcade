# Battleship design brief

The user's confirmed shared-map naval combat design supersedes the previous stationary Battleship board-game adaptation. Inspiration: World of Warships visual atmosphere and Civilization-style turn-based unit movement, with user-defined AP, HP, attack and scouting rules. This is an original tactical game, not an implementation claim about those products' exact mechanics.

Core loop: scout hidden enemies with the carrier; move each ship along water routes; spend AP launching global destroyer missiles or battleship shells within a25-cell diameter; defend carriers probabilistically; finish the team's actions, then alternate turns. Sink all seven opposing ships to win. Enemy silhouettes, HP, wakes and ongoing fires appear only inside live friendly reconnaissance.

One30×30 map, three deterministic irregular islands, opposite-edge spawn zones. One tactical cell per ship,8-neighbor pathfinding without corner cutting, uniform model scaling preserves original authored proportions. Movement traverses the real legal route in the renderer. Projectiles arc over islands; land and friendly ships cannot be attacked. Exact confirmed values and implementation defaults are separated in fleet-combat-spec.md.

Presentation: licensed imported Gerald Ford/Bismarck/USS Arleigh Burke DDG-51 models and user-supplied F22 Raptor and PBR maps; animated ocean/sky, coastal sand/rock/palms, flight reconnaissance, wakes, projectile impacts, hull damage, sustained flames/smoke and sinking. Camera supports close inspection as well as map overview. This pass targets desktop only, as requested.

Assets: user explicitly authorized external free naval models; source creator/current CC-BY4.0 permissions and SHA records are preserved. Existing source attribution is retained in the material atlas metadata. Prior credential probes reported Tripo/Gemini/ElevenLabs unavailable; no secret values were stored. Reuse plus procedural terrain/ocean/VFX and Web Audio is the implemented fallback. No claim of World of Warships or AAA visual parity.

Release: update only the Battleship game and its authoritative ephemeral room backend. Keep Screw Harbor separate. Preserve existing Pulse games, database, reverse proxy, TLS and unrelated services. Publish only after meaningful rules/backend, real-browser, privacy, graphics-budget and static asset checks.


Current asset correction: source face-corner UV/normal seams are retained. Painted hulls use matte dielectric response; runtime exterior meshes use balanced LOD (Ford 2,680 / Bismarck 84,214 / DDG-51 27,833 triangles) and source-fitted internal decks, bulkheads and machinery. Selected replacement fighter: TopNotch Assets F22 Raptor (ec44bd6cffa649b4927799a7b19c703b); the user supplied the exact GLB, now integrated with original source UVs/textures and separate flight/parked geometry.
