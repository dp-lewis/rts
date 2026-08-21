# Delta spec: gameplay — simple-rts-game

> Delta against canonical `specs/gameplay/spec.md`. Keys: `FR-*` minted in
> [spec.md § Functional Requirements](../../spec.md). Folded by `spec-merge` (Phase 10).
>
> **New domain** — every requirement is ADDED.

## ADDED Requirements

- **FR-006** Starting workers auto-gather from tick 0 with no player input — Priority: Must — Source: US-003
- **FR-012** Player may place additional Factories on valid ground — Priority: Must — Source: US-006
- **FR-016** Ore nodes hold finite amounts and visibly deplete — Priority: Must — Source: US-008
- **FR-017** Destroying the enemy Base wins; losing own Base loses — Priority: Must — Source: US-008
- **FR-020** Units auto-acquire enemies in range; explicit orders override — Priority: Must — Source: US-004
- **FR-031** Valid placement = full footprint passable, in-bounds, unoccupied by structure or unit — Priority: Must — Source: US-006

## Domain notes

**FR-016 is the match-length pressure valve**, not merely an economy detail. Finite
ore is what turns "roughly ten minutes" from a hope into a structural guarantee: when
ore is gone, production halts and the match resolves with whatever is on the field. It
is diegetic, needs no UI, needs no timer, and is the cheapest valve to make
deterministic — a counter in simulation state.

**FR-012 carries the entire "build" pillar of the RTS arc** at the cost of exactly one
new interaction, and creates the match's central economic decision: more production
capacity, or more units right now?

The v1 budget this domain must respect: **one resource, four unit types (Worker +
three combat on a strict cost/power ladder with no counter matrix), two structure
types, one buildable.** Unit balance numbers are deliberately unspecified — feel is
tuned by playing, not specified by writing.
