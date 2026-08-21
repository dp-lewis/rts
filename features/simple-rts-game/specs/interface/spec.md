# Delta spec: interface — simple-rts-game

> Delta against canonical `specs/interface/spec.md`. Keys: `FR-*` minted in
> [spec.md § Functional Requirements](../../spec.md). Folded by `spec-merge` (Phase 10).
>
> **New domain** — every requirement is ADDED.

## ADDED Requirements

- **FR-001** Page load presents the difficulty gate and nothing else — Priority: Must — Source: US-002
- **FR-002** Selecting a difficulty starts a match immediately — Priority: Must — Source: US-002
- **FR-007** Drag-rectangle selects all own units intersecting it — Priority: Must — Source: US-004
- **FR-008** Right-click issues move on ground, attack on enemy entity — Priority: Must — Source: US-004
- **FR-009** Command issue is visually acknowledged within one rendered frame — Priority: Must — Source: US-004
- **FR-010** Build bar shows exactly 5 entries — 4 unit + 1 structure, visually separated — always visible, never nested — Priority: Must — Source: US-005
- **FR-011** Unaffordable build entries are greyed inline with cost shown — Priority: Must — Source: US-005
- **FR-013** Invalid placement is indicated by ghost state, not an error dialog — Priority: Must — Source: US-006
- **FR-014** Map is a fixed single screen: no scrolling, no camera, no minimap — Priority: Must — Source: US-007
- **FR-015** No fog of war; both bases visible from the first frame — Priority: Must — Source: US-007
- **FR-018** Every friendly unit carries a persistent non-colour ownership cue — Priority: Must — Source: US-009
- **FR-019** Result screen's primary action is Rematch — Priority: Must — Source: US-010
- **FR-030** Selection tests against unit collision circles, not sprite bounds — Priority: Must — Source: US-004
- **FR-023** Screen-edge indicator + audio cue when an owned entity takes damage — Priority: Should — Source: US-011
- **FR-024** Honest fallback message when WebGL is unavailable — Priority: Should — Source: US-012
- **FR-025** Local counters record time-to-first-action, duration, completion, rematch — Priority: Should — Source: US-001, US-008, US-010
- **FR-026** Difficulty gate is operable by keyboard alone — Priority: Should — Source: US-002

## Domain notes

**This domain must never mutate simulation state** (Constitution §II). FR-009's
"within one rendered frame" is a presentation guarantee only — perceived
responsiveness must not be bought by reaching into sim state or altering tick timing.
The same applies to any rate-limiting of the FR-023 alert: it belongs here, never in
the simulation, or alert behaviour would depend on render cadence and break §I.

**FR-014 and FR-015 do disproportionate work.** Removing the camera removes camera
control, the search problem, and the fog question in one stroke, and makes "the enemy
is visible from the first frame" literally true. They are much of what makes the
no-tutorial decision viable, so **they should be revisited as a pair with it, never
independently.**

**FR-018 exists because the art fights us.** The Kenney sprites bake team colour in,
so colour-only ownership would fail WCAG 1.4.1 by default. The underglow ring is the
non-colour cue, and it doubles as the selection affordance.

**FR-030 keeps art out of gameplay:** testing collision circles rather than sprite
bounds means changing a sprite cannot change what a drag-select captures.
