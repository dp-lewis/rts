# Delta spec: simulation — simple-rts-game

> Delta against canonical `specs/simulation/spec.md`. Keys: `FR-*` minted in
> [spec.md § Functional Requirements](../../spec.md). Folded by `spec-merge` (Phase 10).
>
> **New domain — canonical `specs/simulation/` does not yet exist**, so every
> requirement is ADDED. This delta creates the domain.

## ADDED Requirements

- **FR-003** Simulation advances in fixed-timestep ticks, decoupled from render frames — Priority: Must — Source: Constitution §I
- **FR-004** All player intent enters the simulation as commands queued for a future tick — Priority: Must — Source: Constitution §II
- **FR-005** All randomness derives from a seed held inside simulation state — Priority: Must — Source: Constitution §I
- **FR-021** Target acquisition ties resolve by stable entity id — Priority: Must — Source: Constitution §I
- **FR-022** A* open-set ties resolve by stable entity id — Priority: Must — Source: Constitution §I
- **FR-027** Ore-node selection resolves by least squared distance, ties by ascending node id — Priority: Must — Source: US-003, Constitution §I
- **FR-028** Simultaneous Base destruction on one tick resolves as an explicit Draw — Priority: Must — Source: US-008
- **FR-029** Difficulty is a field of initial simulation state and appears in the replay header — Priority: Must — Source: US-002

## Domain notes

**FR-021, FR-022, and FR-027 are one defect class in three places:** unspecified
ordering breaking determinism. FR-027 was found during revalidation, not authoring.
A fourth instance should be expected during planning — any new "pick the nearest /
first / best X" in simulation code needs an explicit tie-break before it is written.

This domain owns the constitution's two NON-NEGOTIABLE principles. It must not import
rendering, audio, input, windowing, or UI (§II), and must run headless under plain
Node. That boundary should be enforced by lint rather than review, because it is the
property everything else rests on: §I is only testable because of §II, and §IV is only
affordable because of it.
