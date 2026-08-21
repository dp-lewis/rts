# Phase Digest — Phase 5: Plan

> Feature: `simple-rts-game` ("Ten Minute War") · Phase: plan · Completed: 2026-08-21
> Mode: standard · SpecKit mode: classic

## Key Decisions

**Tech choices.** TypeScript 5.x on Node LTS. **Phaser 4.1.0 as the only runtime
dependency** — PRNG, A\*, and state hash are vendored (~50 lines total) per
Constitution §V. Dev-only: Vite, Vitest, ESLint, Playwright, `@axe-core/playwright`.
TypeScript is recorded as a *considered* decision, not a default: the core risk is the
sim/presentation boundary and the shape of simulation state, and both are exactly what
a type system makes checkable.

**Module boundary.** Single package, **not a monorepo**. `src/sim/` (pure, headless,
no Phaser, no DOM) and `src/game/` (Phaser presentation, reads sim, never writes it).
§II is about the *dependency arrow*, not package boundaries — a lint rule enforces it
as strictly as a workspace would, at a fraction of the ceremony.

**Simulation shape.** `step(state, commands) → state`, pure, at a fixed **20 Hz**.
Entities live in an **array kept sorted by id**; player id *is* the array index;
sentinel values (`targetId: -1`) replace optionals so hash encoding stays uniform.
A 10-minute match is ~12,000 ticks.

**The two bridge-gate obligations, discharged as ADRs:**
- [ADR-001](./adr/ADR-001-canonical-state-hash.md) — canonical state hash: fixed field order, id-ordered traversal, **exact IEEE-754 bits** via `DataView` (rounding explicitly rejected — it hides the divergence §I exists to detect), FNV-1a in two 32-bit lanes → 64-bit hex.
- [ADR-002](./adr/ADR-002-replay-corpus.md) — replay corpus: one JSON file per case, **mandatory checkpoint hashes** so failures localise, and a **deliberately manual, PR-visible regeneration procedure**. Auto-updating hashes on mismatch is rejected outright as converting the §IV guard into a rubber stamp.

**Top 3 NFRs by influence on design:** determinism across 3 platforms (shapes
everything), the §II layering boundary (shapes the file tree), test-first (shapes
milestone ordering).

## Artifacts Produced

| File | Description |
|---|---|
| `plan.md` | 440 lines: technical context, **both Constitution Check gates (5/5 PASS each)**, ordering audit, project structure, architecture, enforcement config, 10 milestones, FR coverage matrix, empty Complexity Tracking, 9 risks |
| `plan/adr/ADR-001-canonical-state-hash.md` | What is and isn't hashed, exact-bit float encoding, hash function choice, 5 rejected alternatives |
| `plan/adr/ADR-002-replay-corpus.md` | Corpus JSON schema, checkpoint rationale, the manual regeneration rule, 5 rejected alternatives |
| `plan/digest.md` | This file |

## Open Risks

| Risk | Note |
|---|---|
| **Cross-platform float divergence surfaces in M1** | Expected and *wanted* — exact-bit hashing exists to find it. Fix the divergence, **never loosen the hash**. M1 is the cheapest moment for it to appear. |
| **Corpus staleness on intentional behaviour change** | The part of §IV projects discover late. Mitigated by `simVersion` + manual regen + PR-visible hash diffs. |
| **More ordering hazards will appear as gameplay grows** | Seven catalogued; assume the list is incomplete. Any new "pick the nearest / first / best X" needs a tie-break rule *before* the code is written. |
| **M9 fails and implicates fixed-single-screen** | Cheap remedies exist (framing, AI opening pace, affordance size). A failure that implicates the single-screen decision is the known expensive case — that bet was made knowingly in Phase 2. |
| **M8 tuning runs unbounded** | Timeboxed. Ship at "beatable and legible", not "perfectly balanced". |

**Unresolved (all deferred to a named milestone):** unit balance numbers (M8) · map
layout and ore-node count (M8, the primary duration lever) · final sprite ids (M5) ·
audio scope beyond two cues (M7) · `mulberry32` vs `sfc32` (M1 — plan recommends
`mulberry32` for its single-integer state).

## Handoff Notes

**For tasks generation (Phase 5B):**

- **Milestones are the sequencing spine, and their order is not negotiable.** M0 (enforcement) before M1 (harness) before any gameplay is the whole bet of this plan: §I and §II cannot be retrofitted, and §IV is unmeetable if the corpus format arrives after the first bug fix.
- **Every milestone's test tasks precede its implementation tasks** (Constitution §III). This is not a preference — a plan that omits test tasks is non-compliant and must be corrected before implementation begins.
- **Use the FR coverage matrix** in `plan.md` to generate work: all 31 FRs map to exactly one owning milestone, 31/31 covered. FR-012 is deliberately split across M3 (placement *rules*, sim) and M6 (placement *interaction*, presentation) — that split follows the §II boundary and should be preserved as two tasks, not merged.
- **Each of O-1…O-7 needs its own test task.** They are individually cheap and collectively the highest-value tests in the project.
- **M0 has an unusual acceptance test:** lint must *fail* on a deliberately planted `Math.random()` in `src/sim/`. Testing that the guard works is the point; a guard nobody verified is a guard nobody has.
- **M8 and M9 are real tasks with exit criteria**, not polish. M9 blocks completion. Do not let them become checklist items.

**For implementation (Phase 6):**

- The red gate is constitutionally required here, not optional (§III).
- `src/sim/constants.ts` is the single tuning surface, deliberately isolated so M8 has one file to work in.
- `src/game/loop.ts` is the only place `delta` may be touched. It is isolated precisely so it is easy to review — every Phaser tutorial will pull toward passing `delta` into game logic (RF-3), and the lint rule plus this isolation are what make the departure stick.

**Prior lessons applied:** none — `.product-forge/lessons.md` does not exist yet and
`research/README.md` carries no "Prior lessons that apply" section. Nothing was
invented to fill the gap. A retrospective after launch would create the first entries.
