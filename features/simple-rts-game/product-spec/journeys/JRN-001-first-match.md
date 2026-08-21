# JRN-001: First match — load to victory

> Feature: `simple-rts-game` | Actor: Casual browser player (first visit)
> Stories: US-001, US-002, US-003, US-004, US-005, US-006, US-007, US-008, US-009, US-012
> Entry: Game URL, cold load, no prior session | Success: Victory screen after destroying the enemy Base
> Related: [Product Spec](../product-spec.md) · [journeys.yml](./journeys.yml)

> **This is the journey that decides whether the product works.** Research found
> that in a ten-minute game the first-run experience and the game are the same
> thing. Every step below is either legible without instruction or the design has
> failed. `CMP-` fields are null throughout — canvas game, no component library
> (`design_system_harvest: not_applicable`); UI steps carry stable `data-testid`
> hooks instead. `API-` fields are null — v1 has no backend.

## Preconditions
- No account, no stored state, no prior session
- Browser supports WebGL (Phaser 4 deprecated the Canvas renderer)

## Happy path

| Step | Action | UI | Expected result | Contract |
|------|--------|-----|-----------------|----------|
| STEP-001 | Load the game URL | `[data-testid=difficulty-gate]` | Difficulty gate visible with exactly 3 options and nothing else; first render < 3 s | — |
| STEP-002 | Click "New to this" | `[data-testid=difficulty-easy]` | Gate dismissed; match canvas visible; simulation tick 0 begins | — |
| STEP-003 | Wait 5 s without acting | `[data-testid=ore-counter]` | Ore counter rises with **no player input** — workers auto-gather from tick 0 | — |
| STEP-004 | Look for the enemy | `canvas[data-testid=game-canvas]` | Both bases on screen; no scroll, no minimap, no fog | — |
| STEP-005 | Drag-select own units | `canvas[data-testid=game-canvas]` | All own units intersecting the rectangle show selection; enemy units unaffected | — |
| STEP-006 | Right-click empty ground | `canvas[data-testid=game-canvas]` | Move marker appears **within one rendered frame**; units path toward it | — |
| STEP-007 | Click a build-bar unit | `[data-testid=build-trooper]` | Ore deducted; unit enters production; bar stays visible and unnested | — |
| STEP-008 | Place another Factory | `[data-testid=build-factory]` | Ghost follows cursor; click on valid ground commits and deducts ore | — |
| STEP-009 | Send army at enemy Base | `canvas[data-testid=game-canvas]` | Units path to and attack; damage feedback visible | — |
| STEP-010 | Finish the enemy Base | `[data-testid=result-screen]` | Victory screen with duration; **Rematch is the primary action** | — |

> STEP-006's "within one rendered frame" is a **presentation-layer** guarantee.
> Perceived responsiveness must never be achieved by reaching into simulation
> state or altering tick timing (Constitution §II).

## Alternate flows

| Edge | Of step | Case | Given / When / Then | Priority |
|------|---------|------|---------------------|----------|
| EDGE-002 | STEP-002 | Keyboard-only selection | GIVEN a keyboard-only player / WHEN they tab to an option and press Enter / THEN it activates and the match starts, with focus visible throughout | P2 |
| EDGE-003 | STEP-003 | Player idle 60 s | GIVEN no commands for 60 s / WHEN the AI advances / THEN the match is still recoverable — the player is not already defeated | P1 |
| EDGE-006 | STEP-003 | Own ore exhausted | GIVEN every own ore node is depleted / WHEN workers finish their trip / THEN they idle at the Base without thrashing, production halts, and the match resolves with forces on the field | P1 |
| EDGE-007 | STEP-009 | Own Base destroyed first | GIVEN the AI reaches the player's Base first / WHEN its HP hits zero / THEN the Defeat screen shows, with Rematch still primary | P0 |

## Error / boundary cases

| Edge | Of step | Case | Given / When / Then | Priority |
|------|---------|------|---------------------|----------|
| EDGE-001 | STEP-001 | WebGL unavailable | GIVEN no WebGL context can be created / WHEN the renderer starts / THEN a plain human-readable message replaces the canvas — no blank rectangle, no silent failure | P1 |
| EDGE-004 | STEP-007 | Insufficient ore | GIVEN ore below the unit cost / WHEN the entry is clicked / THEN it is greyed with cost shown inline — no dialog, no toast, nothing hidden | P1 |
| EDGE-005 | STEP-008 | Invalid placement | GIVEN the cursor is over terrain, a structure, or a unit / WHEN placement is attempted / THEN the ghost shows invalid and the click is refused inline | P2 |
| EDGE-008 | STEP-005 | Colour-independent ownership | GIVEN a viewer who cannot distinguish the team colours / WHEN friendly and enemy units are adjacent / THEN friendlies are identifiable by the underglow ring alone (WCAG 1.4.1) | P1 |

## E2E
- Runner: `playwright-cli`
- Smoke: **yes** — this is the smoke journey
- Test cases: *(filled by test-plan, Phase 8A)*
