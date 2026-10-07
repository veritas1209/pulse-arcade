# Audio source and edit ledger

Primary source pages and license links were verified on 2026-10-02. The ten CC0 sources permit modification, redistribution and commercial use. The pouring-water recording by gkillhour uses CC BY 4.0; its three derivatives (`torpedo-launch.wav`, `torpedo-flight-loop.wav`, `sinking.wav`) retain that license and ship with full creator, original work, source URL, license URL and change attribution in `public/audio/LICENSE.txt`. The game exposes that file through its audio-source help link.

| Source file | Creator and primary page | License |
| --- | --- | --- |
| `cannon.mp3` | [SamsterBirdies](https://freesound.org/people/SamsterBirdies/sounds/621000/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ship-engine.mp3` | [monotraum](https://freesound.org/people/monotraum/sounds/253606/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `splash.mp3` | [felix.blume](https://freesound.org/people/felix.blume/sounds/434978/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fire.mp3` | [ceich93](https://freesound.org/people/ceich93/sounds/263864/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `metal.mp3` | [RyanKingArt](https://freesound.org/people/RyanKingArt/sounds/620077/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `jet.mp3` | [Sandermotions](https://freesound.org/people/Sandermotions/sounds/275990/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ocean.mp3` | [esh9419](https://freesound.org/people/esh9419/sounds/417797/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `rocket.mp3` | [qubodup](https://freesound.org/people/qubodup/sounds/211617/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `hull.mp3` | [Lewooz](https://freesound.org/people/Lewooz/sounds/514306/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `bubbles.mp3` | [gkillhour](https://freesound.org/people/gkillhour/sounds/267223/) | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) |
| `sonar.mp3` | [Breviceps](https://freesound.org/people/Breviceps/sounds/493162/) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

The ocean mix credits two CC0 parents: [subtyrant 132079](https://freesound.org/people/subtyrant/sounds/132079/) and [indieground 322139](https://freesound.org/people/indieground/sounds/322139/). Their licensing was verified in the preceding source audit.

These are sourced real-world recordings and recorded sound designs, rather than promises that every asset was captured from the exact modeled weapon. SamsterBirdies designed the cannon from recorded firecrackers. Sandermotions recorded an F-16 takeoff/flyover with a Zoom H1 at Leeuwarden; the `f22-*` filenames remain for runtime compatibility and do not describe the recorded aircraft. qubodup describes the rocket as an edited public-domain military recording and changed its dedication to CC0 on 2026-05-19. Lewooz provides a submerged metallic stress design. gkillhour recorded pouring water with a Yeti microphone and slowed it into underwater bubbles. Breviceps supplies an authored electronic submarine sonar cue, used only for the actual scan action; it is not claimed to be a hydrophone field recording.

| Shipped derivative | Duration | Loop | Source layers | Derivative license |
| --- | ---: | --- | --- | --- |
| `sonar-ping.wav` | 2.20 s | no | sonar | CC0-1.0 |
| `sea-loop.wav` | 8.00 s | yes | ocean | CC0-1.0 |
| `missile-launch.wav` | 2.30 s | no | rocket, cannon | CC0-1.0 |
| `missile-flight-loop.wav` | 4.00 s | yes | rocket, jet | CC0-1.0 |
| `cannon-flight-loop.wav` | 2.50 s | yes | jet | CC0-1.0 |
| `torpedo-launch.wav` | 1.80 s | no | splash, ship-engine, bubbles | CC-BY-4.0 |
| `torpedo-flight-loop.wav` | 5.00 s | yes | ship-engine, bubbles | CC-BY-4.0 |
| `air-intercept.wav` | 1.45 s | no | cannon, metal | CC0-1.0 |
| `metal-impact.wav` | 2.80 s | no | cannon, metal, hull | CC0-1.0 |
| `water-splash.wav` | 3.00 s | no | splash | CC0-1.0 |
| `battleship-cannon.wav` | 3.30 s | no | cannon | CC0-1.0 |
| `ship-engine-loop.wav` | 6.00 s | yes | ship-engine | CC0-1.0 |
| `ship-wake-loop.wav` | 6.00 s | yes | ocean | CC0-1.0 |
| `f22-takeoff.wav` | 5.00 s | no | jet | CC0-1.0 |
| `f22-flight-loop.wav` | 6.00 s | yes | jet | CC0-1.0 |
| `damage-fire-loop.wav` | 6.00 s | yes | fire | CC0-1.0 |
| `metal-stress-loop.wav` | 7.00 s | yes | hull | CC0-1.0 |
| `sinking.wav` | 7.00 s | no | hull, bubbles, splash | CC-BY-4.0 |
| `ui-click.wav` | 0.14 s | no | metal | CC0-1.0 |
| `turn-cue.wav` | 0.38 s | no | metal | CC0-1.0 |
| `victory.wav` | 0.70 s | no | metal | CC0-1.0 |
| `defeat.wav` | 0.80 s | no | metal, hull | CC0-1.0 |

The exact public high-quality MP3 preview download URL and SHA-256 for each source, and the exact SHA-256, byte size, duration, RMS, peak, layer offset, playback rate, mix weight, high/low-pass cutoff and delay for each WAV are in `scripts/audio-sources.json`. The same full ledger ships as `public/audio/source-manifest.json`. All eleven downloaded source hashes were checked against the ledger, and all 22 output hashes pass automated QA.

Outputs are mono, 32 kHz, 16-bit PCM WAV. Processing uses only samples from the credited sources: source excerpting and layering, second-order high/low-pass filters, rate shifts, DC removal, peak/RMS gain, 3 ms attack fades (120 ms for sinking), release fades, and 250 ms overlapping loop seams. No runtime oscillators or generated noise supply battle effects. The authored sonar source remains explicitly identified above. No paid generation service, API key, account purchase, voice, or music was used.

Reproduce from the project directory:

```powershell
node scripts/fetch-audio-sources.mjs
node scripts/process-recorded-audio.mjs
```

The first command downloads and verifies every licensed preview into `C:/tmp/battleship-audio-sources`. The second delegates to `scripts/decode-audio-quality.mjs` (audio-only Chrome with GPU disabled; only the used first 65 seconds of long recordings are transported), then `scripts/audio-quality-assets.py` (NumPy/SciPy CPU mixing). A direct edit loop can run `node scripts/decode-audio-quality.mjs sonar` for an individual source, then `python scripts/audio-quality-assets.py`. The browser decoder requires installed Chrome and the project's Playwright; the mixer requires NumPy and SciPy.

## 2026-10-03 defense sound update

New external downloads: [Minigun by Jim Rogers](https://soundbible.com/1920-Minigun.html), CC BY3.0; [Blow Up Sound by qubodup](https://freesound.org/people/qubodup/sounds/855896/), CC0; [Howitzer Gun Shots by qubodup](https://freesound.org/people/qubodup/sounds/67516/), CC0. Actual MP3s plus saved primary license pages are in `artifacts/audio/defense-sources`. The EOD source identifies Seaman Kelly Meyer/AFN Okinawa military footage; the howitzer source identifies public-domain US military video. The rotary-gun sample is presented as an authored sound effect, not falsely identified as exact naval CIWS field recording. No synth oscillators or arcade-pew generation added. Existing recorded military missile launch is retained.

New runtime files: `ciws-burst.wav` (.82s), `intercept-detonation.wav` (1.65s), `naval-cannon-shot.wav` (2.6s). These replace generic cannon/intercept cues and add one buffer, so23 decoded runtime assets.325KB total new WAV storage;32000Hz mono PCM16. Peaks .76/.80/.84; clipped samples0. Source and derivative licenses/hashes are appended in the shipped manifest and LICENSE.txt, which the existing user-facing audio-source link exposes. Old22 output files remain unmodified.

Reproduce the addition with `artifacts/audio/defense-sources/decode.py` (CPU miniaudio decoder installed locally under artifacts/audio/decoder) and `process.py` (NumPy/SciPy). Earlier22-file reproduction scripts do not generate these additions; run the addition processing separately. The public manifest now includes the new derivatives; keep its appended source records when regenerating legacy audio.

Integration APIs (root-owned scene/main): `ciwsBurst(shot, cell, duration=.28)` at the defense-start event; `intercept(shot, cell)` at actual interception point; optional third cell in `finishShot(shot,kind,position)` overrides defender-center positioning on blocked shots. Convert worldx/z to fractional cells `(world+60)/4-.5`. Both defense and finish may report the same interception without doubling sound. Partial intercept keeps flight voice alive. CIWS is excluded for shells/torpedoes, deduplicated by sequence, gated by active shot generation, capped at4 simultaneous voices, and never replays a visual-clock event after late audio loading. Stop/cancel/dispose removes defense voices. Existing master0–100 UI, unlock and cached buffer architecture remain unchanged.

CPU `verify-audio.mjs` passes once-per-shot, late-load suppression, actual interception position, double-detonation suppression, partial-flight continuation,4-voice cap, shell/torpedo exclusion, volume0/100 and inactive cancellation. `quality.json` checks decoded format/duration/peak/RMS/headroom and zero endpoint samples. TypeScript passed. No browser/GPU/audio-output device was run; root must check the synchronized mix and subjective sound quality.

Skill/reference ledger: read threejs-audio-generator/SKILL.md and references/audio-workflows.md. Strategy: user-requested free external downloads, no paid generation or credential requirement. No key-unavailable claim. Source waveform excerpts only; no voice synthesis.
