# Battleship shared-map UI contract

`index.html` contains the complete HUD shell and `src/style.css` is its only stylesheet. The 3D canvas remains full-screen behind narrow command rails and the bottom order dock.

## Global state

Set `document.body.dataset.phase` to `setup`, `waiting`, `battle`, or `finished`, and `document.body.dataset.mode` to `pve` or `online`. JavaScript owns the `hidden` state of `#setup-panel`, `#battle-panel`, `#help-panel`, `#minimap-panel`, `#enemy-panel`, and `#result-panel`.

The mobile `#minimap-toggle` is present in the DOM and CSS exposes it during setup, waiting and battle. Its click handler should toggle `#minimap-panel` and keep `aria-expanded` synchronized.

## DOM hooks

| Purpose | IDs |
| --- | --- |
| Scene and status | `game-canvas`, `state-label`, `target-label`, `connection-label` |
| System controls | `camera-home`, `sound-toggle`, `help-toggle`, `help-panel`, `menu`, `exit-action` |
| Match setup | `setup-panel`, `mode-select`, `difficulty`, `create-room`, `join-room`, `room-input`, `room-code`, `start-game`, `rotate-placement` |
| Battle shell | `battle-panel`, `turn-counter`, `ship-picker`, `fleet-status`, `battle-log` |
| Selected ship | `selected-name`, `selected-hp`, `selected-ap` |
| Orders | `action-attack`, `action-recon`, `action-sonar`, `action-torpedo`, `action-repair`, `confirm-action`, `end-turn` |
| Tactical map | `tactical-map`, `minimap-toggle`, `minimap-panel` |
| Enemy inspection | `enemy-panel`, `enemy-name`, `enemy-hp`, `enemy-preview`, `enemy-close` |
| Result | `result-panel`, `result-title`, `result-message`, `rematch`, `restart` |

Populate `#ship-picker` with buttons carrying `data-ship="<instance id>"`. Use `aria-selected="true"`, `aria-pressed="true"`, or `.is-selected` for the active ship. `.is-spent` and `.is-sunk` provide depleted states. A compact `strong` name and `small` AP or class label fit the authored layout.

Populate `#fleet-status` with direct child rows. Each row may include a label, numeric value, and `.integrity-track > i`; set `--hp` or the fallback `--integrity` on the fill. The selected readout expects stable `current / max` strings in `#selected-hp` and `#selected-ap`.

Action buttons use `aria-pressed` or `.is-active`. Hide `#action-recon` for every non-carrier and `#action-torpedo` for every non-destroyer selection; sonar remains visible for every ship. The action grid distributes the remaining controls evenly. Movement has no dock button: select a ship and right-click a reachable cell to issue the move immediately. Disable unavailable actions with a short reason such as `함교 파괴`, `주무장 파괴`, or `AP 부족`, and disable `#confirm-action` until a valid target exists. Both teams cannot attack on their first turn, which is also stated in the help panel. Update `#target-label` with the selected coordinate or a short command prompt. `#end-turn` remains explicit even when all AP is spent.

When the player clicks a currently visible enemy, reveal `#enemy-panel`, update `#enemy-name` and `#enemy-hp`, and render its current damaged model into the live `#enemy-preview` canvas. Hide the panel when `#enemy-close` is used, the selected enemy sinks, or recon/fog removes that enemy from the current visible set. The desktop panel replaces the log slot beneath the minimap; on mobile it stays above the action dock while the tactical map remains a higher temporary drawer.

Draw the complete shared 30×30 map into `#tactical-map`: own ships, currently visible enemies, islands, recon and sonar areas, selected ship, reachable cells, torpedo range or track, and target. The canvas is 240×240 logical pixels and scales with CSS. Pointer coordinates must account for its rendered rectangle. Sonar is an immediate self-centered action whose radius12.5 / diameter25 ocean reveal needs no target; torpedo targeting previews the destroyer's radius15 / diameter30 range.

## Responsive intent

Desktop keeps the play path open with a left fleet rail, right minimap/log or enemy-inspection rail, and centered bottom order dock. Under 760px, the fleet picker becomes a compact horizontal strip and the order dock moves into the thumb zone. The right rail is replaced by `#minimap-toggle`; the map opens above the dock and over the enemy panel when explicitly requested. Controls keep at least a 44px target, apply safe-area insets, and never introduce page scrolling.

The setup screen shows the live 3D battlefield, 49 highlighted deployment cells and the tactical map. The single shared ship picker remains available in setup and battle. Click a ship then a free cell in your 7×7 corner zone; rotate 45° with R or `#rotate-placement`; departure locks the fleet. Online readiness locks each side independently. Camera selection and combat do not recenter the view; left-drag rotates, right-click issues movement, right-drag or middle-drag pans in the view plane, and wheel/pinch zooms freely toward the pointer. Explicit Home resets the map view.


## Current PC tactical command HUD (2026-10-03)
Fleet status is docked bottom-left, MAP bottom-right and enlarged. Engagement history uses a default-closed native details dropdown. Battle/finished central turn banner is visually removed; compass shows live camera bearing and a rebased heading tape. Bottom action dock retains safe horizontal clearance at tested1280/1920/2560PC widths. Selecting a movable ship exposes a white public reachable-cell perimeter. Torpedo clicked target remains yellow solid while independent mouse hover shows yellow dashed candidate; detected enemy routes are red dashed in world and MAP. F close inspection follows rendered ship movement; WASD and manual pan release follow without changing height.
