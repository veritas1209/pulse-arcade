# Multiplayer lifecycle repair — 2026-10-03

Public baseline: `https://222.96.173.194/games/battleship/` and same-origin REST/WebSocket service are reachable. The authoritative Python smoke passed create, join, readiness, private snapshots, turn validation, disconnection/reconnection and leave. This isolates the reproduced failure to browser room lifecycle rather than the reverse proxy.

Actual public UI reproductions (`node scripts/network-reproduce.mjs`):

- Clicking Join with an empty code created an unrelated host room. The client chose the create endpoint using code truthiness.
- Delaying Create, then switching to PvE, resumed the old response and changed `body.dataset.mode` back to `online`; the selector remained `pve` and the stale room became visible.

`src/network.ts` now distinguishes create from join, validates the six-character code, aborts pending requests, and uses a generation counter to reject superseded responses. Every socket callback checks its current socket before changing state/status. Room-entry requests time out after twelve seconds. Session storage failures do not prevent live play. Invalid saved sessions are discarded; takeover and proxy failures have useful status/messages. Leaving a socket that is not open no longer announces a spurious error.

Verification:

- `node scripts/network-lifecycle-test.mjs`: seven focused checks passed (empty join, cancellation despite a fetch implementation ignoring abort, latest entry wins, storage disabled, stale socket callbacks, malformed saved seat, proxy HTML error).
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `scripts/multiplayer-qa.mjs` drives the actual UI in two browser contexts and adds cancellation and storage restrictions to the regression coverage. Its fleet assertions accept the updated roster.

Reference ledger: read `threejs-debug-profiler/SKILL.md`, `references/debug-profile-checklists.md`, and `references/checklists/scene-debugging.md`. Used triage ordering, actual public reproduction, network errors, same-origin/base paths, owner-specific fix and regression verification. Rendering/performance measurements remain owned by the graphics/release checks.

Deployment: rebuild client assets. The lifecycle patch alone does not require changing/restarting the Python room service. Combined server fleet-rule changes do require the normal service restart and end existing ephemeral rooms.
