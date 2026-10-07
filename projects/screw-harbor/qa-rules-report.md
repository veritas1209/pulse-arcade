# AD Puzzle Rules QA Report

## Result

PASS for the pure engine. The focused strict TypeScript check and all 7 AD rule tests pass, including authored winning routes with 150 and 360 screws.

## Runtime contract

- Every known, unremoved screw is eligible while the puzzle is playing. Color and `layer` never gate selection.
- `canRemove(id)` is a compatibility predicate for picking and diagnostics. It checks only playing state, ID existence, and prior removal.
- A screw matching either current box increments that box. Every other color enters the temporary buffer.
- Exactly two boxes are active when at least two remain. Normal boxes require three screws; the final box may declare a target of one or two.
- Completing a box replaces it from `queue`, then matching buffered screws drain recursively.
- Every stage has five buffer slots, matching the reference ads. Difficulty comes from dense geometry, occlusion, and the seeded color sequence. Filling the buffer loses immediately.
- Removing the final screw of a part returns `partReleased`.
- Runtime undo, hint, history, and active-layer concepts were removed.

The minimal public state is `screws`, `removed`, `buffer`, `bufferCapacity`, `boxes`, `queue`, `status`, `moves`, `completedBoxes`, `remaining`, `canRemove(id)`, and `remove(id)`.

## Authored winning witness

`assignColors(parts, difficulty, seed)` preserves the supplied part order and each part's screw order. Callers provide parts from exterior to interior; the returned screw array is therefore a geometry-safe winning witness.

The allocator groups that witness into three-screw monochrome batches. Every stage uses all five ad-reference colors; batch colors use seeded, shuffled palette cycles and avoid adjacent duplicate batches. `Puzzle` derives its box queue directly from those ordered batches. Removing the returned screw array from first to last always wins without using the buffer.

This scheme has linear generation and play cost apart from part-release checks. It does not impose the former small-stage or bounded-solver limits and was verified at 150, 151, and 360 screws.

## Verification

- Focused strict typecheck: PASS.
- Focused Playwright rules: 7/7 PASS.
- Full `pnpm run build`: PASS (TypeScript and Vite production build; 12 modules transformed).
- Arbitrary eligibility: a layer-99 screw with a nonmatching color removes successfully and enters the buffer.
- Buffer drain: two pre-buffered future-color screws automatically enter their box when it replaces a completed box.
- Failure: five nonmatching removals fill the buffer, set `lost`, disable `canRemove`, and reject later removals.
- Part release: emitted only after every screw belonging to the part is removed.
- Scale: deterministic authored routes win at 150 and 360 screws with the expected 50 and 120 completed boxes.
- Partial quota: a 151-screw route wins with 51 completed boxes and no padding screw.

## Reference ledger

| Loaded | Reference | Applied to |
| --- | --- | --- |
| yes | `threejs-gameplay-systems/SKILL.md` | Small pure-state boundary and explicit objective/failure loop |
| yes | `references/gameplay-workflows.md` | State transition and test separation |
| yes | `references/game-design-level-design.md` | Player choice, buffer pressure, authored progression |
| yes | `references/checklists/game-design-level-design.md` | Winning witness and failure-path coverage |
| yes | `threejs-qa-release/SKILL.md` | Verification evidence and risky-path tests |
| yes | `references/qa-release-checklists.md` | Focused typecheck and production integration boundary |
| yes | `references/checklists/playtest-qa.md` | Objective, progression, loss, and large-stage cases |

## Integration note

Renderer and UI code must no longer call `hint()`, `undo()`, or `activeLayer`. `layer` remains optional metadata on `ScrewSpec` only to ease structure-data migration. The previous browser audit script targeted hint and undo hooks and must not be used as evidence for this rewritten contract until its app hooks are migrated.
