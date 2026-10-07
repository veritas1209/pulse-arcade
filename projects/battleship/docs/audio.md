# Battleship naval audio

The final mix ships 22 licensed cues with distinct shell, missile and torpedo identities. Primary-source credits, licenses, edits and exact reproduction recipes are in [audio-sources.md](audio-sources.md), `public/audio/LICENSE.txt`, and `public/audio/source-manifest.json`.

The audio skill and required `threejs-audio-generator/references/audio-workflows.md` were loaded on 2026-10-02. The user's free, copyright-permitted asset requirement was followed through sourced recordings and an action-specific CC0 sonar design; no paid generator or account credential was used.

| Event | Sound family and files | Duration / loop |
| --- | --- | --- |
| Missile launch / travel | Recorded military rocket, reinforced initial pressure transient; `missile-launch.wav`, `missile-flight-loop.wav` | 2.30 s / 4.00 s loop |
| Cannon launch / shell travel | Lower, heavy recorded blast; restrained air rush without rocket motor; `battleship-cannon.wav`, `cannon-flight-loop.wav` | 3.30 s / 2.50 s loop |
| Torpedo launch / travel | Water entry, submerged propulsion and recorded bubbles; `torpedo-launch.wav`, `torpedo-flight-loop.wav` | 1.80 s / 5.00 s loop |
| Interception | Short airburst and fragment transient; `air-intercept.wav` | 1.45 s |
| Hull hit / water miss | Pressure blast, metal strike and structure resonance / close splash; `metal-impact.wav`, `water-splash.wav` | 2.80 s / 3.00 s |
| Moving vessels | Diesel engine with independent water wash; `ship-engine-loop.wav`, `ship-wake-loop.wav` | 6.00 s loops |
| Aircraft deployment / flight | Audible portion of recorded F-16 takeoff / flyover; `f22-takeoff.wav`, `f22-flight-loop.wav` | 5.00 s / 6.00 s loop |
| Fire / hull stress / sinking | Fireplace crackle, longer metallic creaks, structure collapse and bubbles; `damage-fire-loop.wav`, `metal-stress-loop.wav`, `sinking.wav` | 6.00 / 7.00 s loops; 7.00 s one-shot |
| Sonar action | One quiet submarine scan ping, with its natural tail; `sonar-ping.wav` | 2.20 s |
| Interface / results | Restrained recorded mechanism trims and layered clicks; `ui-click.wav`, `turn-cue.wav`, `victory.wav`, `defeat.wav` | 0.14 / 0.38 / 0.70 / 0.80 s |
| Sea | Longer ocean field section; `sea-loop.wav` | 8.00 s loop |

All asset paths are under `public/audio`. The 22 WAVs total 5,208,648 bytes (4.97 MiB), mono 32 kHz / 16-bit PCM. File peaks stay at or below 0.88. Every ambient loop uses an overlapping 250 ms seam. Runtime URLs use `?v=naval-recorded-v2-20261002` to invalidate the older audio under retained filenames.

`BattleAudio.unlock()` creates/resumes the context on a user gesture. A four-request preload pool fetches through Vite's `BASE_URL`, including hosted subpaths; requests have bounded timeouts and one retry, failed loads remain visible in `diagnostics()`, and disposal aborts pending fetches. There is no synthetic fallback that would conceal a missing asset.

`startShot()` owns the specific sequence's cannon rush, missile motor or torpedo travel voice; `finishShot()` fades that exact flight and plays a single hit/miss/intercept family at the visual arrival callback. Duplicate resolution callbacks do not replay an impact. Deferred loading cannot start a projectile already resolved or cancelled. Sinking combines creaking metal and water without replaying the launch cannon.

`syncListener(position,target)` follows the free camera. Spatial launches use the firing cell, impacts use the arrival or interceptor cell, and optional `sink(cell)`, `torpedoLaunch(cell)` and `sonar(cell)` use their world cell. Equal-power stereo panning, gentle inverse-distance attenuation and distance-dependent high-frequency filtering preserve readability across the large board. The listener builds orthogonal forward/up vectors for overhead views and keeps its last valid direction if camera position equals target.

SFX, UI and ambience use separate gain buses. Transient events briefly lower the activity bed, while a fast master compressor provides headroom. Fleet activity scales with the square root of count to avoid an overwhelming sum: one engine, wake, fighter, fire, hull-stress and optional torpedo loop per family. Repeated syncs cannot stack loop sources or cleanup timers. Inactive activity fades combat tails and flight/ambient sources; result/UI cues can complete. Mute ramps every bus through the master; context suspension freezes playback; disposal stops all sources, disconnects nodes, aborts fetches and closes the context. `shot()`, `click()`, `turn()`, `result()`, `toggle()`, `suspend()`, `resume()` and the previous gameplay calls remain compatible.

Verification on 2026-10-02:

- `tsc --noEmit`: pass.
- `playwright test tests/audio-quality.spec.ts --project=desktop-chrome`: 3 CPU tests passed (22 exact file hashes, permitted source mapping/credit links, sample headroom, loop seams, event onset energy and distinct flight sounds).
- `node docs/audio-quality-qa.mjs`: 13 checks passed using actual Chrome Web Audio in an isolated audio-only page. All 22 cues fetched/decoded in 328 ms; shell/missile ownership, duplicate resolution and deferred sequence reuse passed; 100 activity updates kept seven unique loops; full combat/ambience output peak was 0.746; mute reached zero samples; pause/resume, overhead/coincident listener vectors, inactivity and disposal passed. Evidence: `artifacts/audio/quality-runtime.json`.
- `node docs/audio-qa.mjs http://127.0.0.1:5195/`: all 9 checks passed in the actual Vite game. All 22 cues fetched/decoded in 753 ms, no errors, simultaneous shot ownership and six non-torpedo loops stayed correct, and mute/suspend/resume/inactivity/disposal passed. This run did not reproduce the earlier Vite streaming stall.

These checks measure correct playback, timing ownership, file provenance and headroom. Loudspeaker/headphone taste remains subjective; the assets deliberately use grounded recordings and restraint instead of exaggerated interface bleeps. The action-specific authored sonar source is the intentional tonal signal exception.
