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
- **FR-032** When every ore node is depleted, sudden death arms; after a grace period all Bases take escalating damage until the match resolves — Priority: Must — Source: US-008 <!-- CR-001 -->
- **FR-033** Sudden-death damage shows a distinct indicator and does NOT trigger the under-attack indicator — Priority: Must — Source: US-008, FR-023 <!-- CR-001 -->

## MODIFIED Requirements

<!-- CR-001 -->
- **FR-016** Ore nodes hold finite amounts and visibly deplete — **and their global depletion is now the arming condition for sudden death.** Previously implied that exhaustion resolved the match; it only halts production.
- **FR-017** Destroying the enemy Base wins; losing own Base loses — **sudden death adds no new verdict**, it forces one of the existing three.

## Domain notes

**FR-016 is the match-length pressure valve**, not merely an economy detail — but on
its own it is **not sufficient**, which the Phase 5C review established (F-1). Ore
exhaustion halts *production*; it does not force *resolution*. Two players who turtle
to a rough stalemate after ore is gone have no terminator, and mutual attrition to a
stalemate is a normal RTS outcome that becomes *more* likely once production stops.

**FR-032 closes that gap with a backstop, not a second valve.** It is invisible in a
normal match, so Phase 2's rejection of a visible soft timer still stands — a
countdown would make the clock the opponent. Escalating damage guarantees termination
in bounded time for any finite Base hit points, and reuses the existing Draw rule
(FR-028) when both Bases fall on the same tick.

**FR-012 carries the entire "build" pillar of the RTS arc** at the cost of exactly one
new interaction, and creates the match's central economic decision: more production
capacity, or more units right now?

The v1 budget this domain must respect: **one resource, four unit types (Worker +
three combat on a strict cost/power ladder with no counter matrix), two structure
types, one buildable.** Unit balance numbers are deliberately unspecified — feel is
tuned by playing, not specified by writing.
