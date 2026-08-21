# Phase Digest — Phase 1: Research

> Feature: `simple-rts-game` · Phase: research · Completed: 2026-08-21
> Mode: standard · Input richness 6/8 (CONFIRM)

## Key Decisions

1. **Ran 5 of 5 dimensions**, overriding config defaults (`default_tech_research: false`, `default_metrics_research: false`). Rationale: H3 is a tech hypothesis and H4 a metrics hypothesis; skipping those dimensions would have left the two hypotheses that de-risk R1 and R2 untested.
2. **Research performed inline, not via research subagents** — subagents were not requested by the user.
3. **All four hypotheses survived**, two with material corrections (H1 reframed, H4 split into "sound principle / unverifiable measurement").

### Top 3 findings

1. **Determinism is far cheaper than R1 assumed (H3).** IEEE 754 requires correct rounding for `+ - * /` and `Math.sqrt`; only transcendentals (`sin`/`cos`/`tan`/`atan2`/`pow`/`log`) are implementation-dependent across engines and architectures. Constitution §I is satisfiable with **plain doubles + a lint rule + squared-distance comparisons + an integer direction table** — no fixed-point library. This materially reduces the R1 cost estimate that the Phase 0 gate was approved against.
2. **The white space is session length, not the genre (H1, corrected).** Browser RTS is actively contested — but exclusively at the large/persistent/multiplayer end. Nobody targets a short, bounded, finishable match. Separately, **Littlewargame ships with one resource and reviewers call it a strength** — shipped empirical support for H2.
3. **In a ten-minute game, first-run experience and the game are the same thing.** Most players quit inside ten minutes; there is no "later" in which to teach. Every mechanic must be immediately legible or cut from v1.

## Artifacts Produced

| File | Description |
|---|---|
| `research/README.md` | Index: executive summary, key findings, synthesis, 6 open questions, 7 red flags (RF-1…RF-7) |
| `research/competitors.md` | 8 competitors + 4 open-source references; H1 verdict; differentiation opportunities |
| `research/ux-patterns.md` | H2 verdict; 8-step happy path; state inventory; WCAG-AA feature specifics; 8 anti-patterns |
| `research/codebase-analysis.md` | Greenfield confirmation; **13 binding constitutional constraints** extracted as a table |
| `research/tech-stack.md` | H3 verdict with the exact deterministic/non-deterministic operation split; Phaser 4.1.0 status; dependency recommendations |
| `research/metrics-roi.md` | H4 verdict; honest "no valid external benchmark" finding; 7 KPIs incl. the manual comprehension playtest |
| `research/digest.md` | This file |

## Open Risks (forwarded to product-spec)

| # | Risk | Severity |
|---|---|---|
| RF-1 | **"Supported platforms" undefined** in constitution §I — the bit-identical guarantee is unfalsifiable until the set is named. Top unresolved constitutional obligation; must be settled by `plan.md`. | **High** |
| RF-2 | **A\* tie-breaking** is the most probable determinism defect; needs a stable rule (entity id) and a dedicated test. | **High** |
| RF-3 | Phaser's `update(time, delta)` idiom fights §I; mitigate with lint, not vigilance. | Medium |
| RF-4 | The "fun" goal has one check and it is manual — it needs a protected slot or machine-checkable criteria will crowd it out (Phase 0 R4, now concrete). | Medium |
| RF-5 | Single-player-only forgoes the retention mechanism every competitor relies on. Defensible; should be recorded as a decision. | Medium |
| RF-6 | WebGL-unsupported is newly reachable (Phaser 4 deprecated Canvas). | Low |
| RF-7 | Nothing instrumented; mobile benchmarks do not transfer. Measure against ourselves. | Low |

Phase 0 conditions R2, R3, R4 remain open and are now sharpened by research;
**R1 is resolved** (comply fully) and its cost is now quantified rather than feared.

## Handoff Notes for Product Spec

- **Six open questions** in `research/README.md` are the spec's agenda — especially the **match-length pressure valve** (Q1) and the **three-unit relationship** (Q2), both of which shape the simulation design and cannot be deferred to implementation.
- **R3 from Phase 0 is now the spec's central job:** "simple" must become a hard written budget — exact unit count, resource count, mechanic list, and explicit non-goals. Research recommends ~3 units / 1 resource / no fog of war, with Littlewargame as precedent.
- **The 13-row constraint table in `codebase-analysis.md` is the most reusable artifact here.** It is effectively the non-functional requirements section of the spec, pre-written; bridge and plan should consume it directly rather than re-deriving from the constitution.
- **Do not let the spec cite the <30s time-to-first-action figure as an industry benchmark.** It is a self-imposed budget derived from the 10-minute session goal. `metrics-roi.md` records this distinction deliberately.
- **The measurement question (Q5) needs answering in the spec, not in Phase 9.** With `telemetry.*: none` and no backend, local counters + playtest observation is the recommendation; anything else needs to clear §V.
- **A cheap differentiation option exists** (Q6): replay/seed sharing is machinery the constitution mandates anyway. Surfacing it is nearly free. Flagged, not assumed.
