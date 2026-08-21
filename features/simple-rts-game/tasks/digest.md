# Phase Digest — Phase 5B: Tasks

> Feature: `simple-rts-game` ("Ten Minute War") · Phase: tasks · Completed: 2026-08-21

## Key Decisions

**77 tasks across 10 milestones (M0–M9).** Sizes: 4 XS · 28 S · 37 M · 8 L · **0 XL**
— nothing needs decomposition, and nothing trips the lite→standard escalation trigger
(we are already standard).

**Grouped by milestone, not by user story — deliberately.** The tasks template asks for
story-first grouping so each story ships as an independent MVP increment. That
decomposition does not survive contact with this feature: US-001 ("playable within
seconds of loading") requires the entire game to exist, and Constitution §I/§II force
the enforcement config and determinism harness to precede all gameplay. Story-first
grouping would have produced fiction. Milestones are a genuine dependency chain, and
every task carries its story/requirement tag so traceability is unaffected — only the
grouping axis differs.

**24 tasks marked `Test-first: true`** — the Red gate `implement` checks at the 5B→6
boundary. The nine M7 browser E2E tasks are deliberately *unmarked*: per the tasks
contract that marker scopes to unit/contract tests, not the Phase 8 E2E suite. They
still precede their implementation tasks.

**Dependency shape:** strictly linear across milestones (`M0 → M1 → … → M9`), with four
parallelisable groups inside them — M1 tests (T007–T009), M2 tests (T026–T028), M3
tests (T034–T036), and the nine M7 E2E specs (T058–T066). Not parallelisable:
T032/T033 (economy calls pathfind) and T039/T040 (production and combat both mutate
entity state inside the same tick pipeline).

## Artifacts Produced

| File | Description |
|---|---|
| `tasks.md` | 77 tasks, 10 milestones, dependency graph, parallel-opportunity table, three coverage matrices (FR→tasks, O-hazards→tests, stories→milestones) |
| `traceability.yml` | **`requirements:` block seeded** — 31 rows, each with its stories and owning tasks. `code` and `tests` left for implement and test-plan |
| `tasks/digest.md` | This file |

## Validation

| Check | Result |
|---|---|
| Task ID uniqueness | ✅ 77 unique, contiguous T001–T077 |
| Every task has `Paths:` and `Size:` | ✅ 77/77 |
| Workspace prefixes | ✅ none — single-root project, correctly unprefixed |
| FR coverage | ✅ 31/31, every FR tagged on a real task line |
| Ordering hazards | ✅ 7/7 have a dedicated test task |
| Story coverage | ✅ 12/12 Must+Should |
| Orphan tasks | ✅ none |
| XL tasks | ✅ none |
| Test-before-implementation within each milestone | ✅ after one fix (below) |

**One real violation found and fixed.** The adversarial ordering pass caught that the
ESLint boundary *config* (originally T003) preceded the test verifying it fires
(originally T004) — an inverted Red-Green cycle in the very milestone whose whole point
is that guards must be verified. The two were swapped: **T003 is now the test**, which
fails because no rules exist yet (ESLint reports nothing, so the assertions fail), and
**T004 is the config** that turns it green. Config deserves a Red-Green cycle like any
other code.

## Open Risks

| Risk | Note |
|---|---|
| **Eight L-sized tasks** (T032 A\*, T033 economy, T039 production, T040 combat, T044 AI, T050 render, T073 tuning, T077 playtest follow-up) | All are genuinely cohesive units rather than hidden mega-tasks, but T040 (combat) is the one to watch — it carries **two** ordering hazards (O-1 acquisition and O-6 atomic damage) and is where a split would be least surprising if it grows. |
| **T073 balance tuning is unbounded by nature** | Timeboxed by the plan. Ship at "beatable and legible", not "perfectly balanced". |
| **T076/T077 have `Paths: unknown`** | Correct and deliberate — a playtest touches no files. Written explicitly rather than omitted, so `portfolio` reads it as intentional. |
| **T075 requires a deliberate `simVersion` bump and corpus regeneration** | Tuning changes simulation behaviour, so hashes go stale by design. This is the first real exercise of ADR-002's manual regeneration procedure, and the moment its discipline is either established or quietly abandoned. |
| **Nothing is visible until M5** | ~51 of 77 tasks complete before a single pixel renders. Accepted in `plan.md`; worth restating because it will feel wrong during implementation. |

## Handoff Notes

**Start with T001–T006 (M0), in order.** The milestone's acceptance criterion is that
lint *fails* on a planted `Math.random()` in `src/sim/`. Do not proceed to M1 until
T003 has been observed failing and then passing.

**The first real gate is M1 exit**, not M0. If the same seed and command log do not
produce an identical hash across `ubuntu-latest`, `macos-latest`, and Chromium, stop
there. Every later milestone compounds on that property and M1 is the cheapest possible
moment to find it broken. A red CI at M1 is a success of the process, not a setback.

**Commit granularity:** one commit per task through M0–M1 so the foundation stays
bisectable; one commit per test/implementation pair from M2 onward.

**Watch for an eighth ordering hazard.** Seven are catalogued and tested. The plan
predicted more would appear as gameplay grows, and that prediction has already been
right once. Any new "pick the nearest / first / best X" in `src/sim/` needs a tie-break
rule written *before* the code.

**FR-012 stays split.** T039 owns the placement *rules* (simulation) and T055 owns the
placement *interaction* (presentation). That split follows the §II boundary — do not
merge them into one task for convenience.
