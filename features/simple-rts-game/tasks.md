# Tasks: Ten Minute War

**Feature**: `simple-rts-game` | **Date**: 2026-08-21 | **Plan**: [plan.md](./plan.md)

**Tests**: Test tasks are **MANDATORY** (Constitution Principle III, Test-First
Development). Every implementation task is preceded by the test tasks that cover it,
written and observed failing first. Simulation logic is covered by **headless** tests
asserting on state, not rendered output (Principle II).

## Format: `[ID] [P?] [Story/Req] Description`

- **[P]** — can run in parallel (different files, no dependencies)
- **[Story/Req]** — the user story or requirement this serves; `[INFRA]` for tooling
- `Paths:` — files the task touches (single-root project; no workspace prefixes)
- `Size:` — XS ≤1h · S ≤half-day · M ≤1 day · L ≤2 days · XL >2 days (decompose)
- `Test-first: true` — Red-gate test task; must be failing before its implementation runs

## Organisation: by milestone, not by user story

> The tasks template groups by user story so each story ships as an independent MVP
> increment. **That decomposition does not fit this feature and would be fiction here.**
> US-001 ("playable within seconds of loading") requires the entire game to exist;
> there is no slice in which one story is independently deliverable. More decisively,
> Constitution §I and §II force the enforcement config and determinism harness to
> precede all gameplay — an ordering no story-first grouping can express.
>
> Tasks are therefore grouped by the **milestones** established in `plan.md`, which are
> a genuine dependency chain. Every task is annotated with the story and requirement it
> serves, and the coverage matrix at the foot of this file proves 31/31 requirement and
> 12/12 story coverage. Traceability is preserved; only the grouping axis differs.

---

## M0 — Enforcement skeleton

**Purpose**: the guards, before anything they guard. Nothing here is game code.

- [x] T001 [INFRA] Initialise `package.json` (Phaser as the ONLY runtime dependency), TypeScript config, and Vite build
      Paths: package.json, tsconfig.json, vite.config.ts, index.html
      Size: S
- [x] T002 [INFRA] Vitest config + `src/sim`, `src/game`, `tests/` directory skeleton
      Paths: vitest.config.ts, src/sim/.gitkeep, src/game/.gitkeep, tests/.gitkeep
      Size: XS
- [x] T003 [INFRA] **Test: the guard actually fires.** Run ESLint programmatically against fixture files containing a planted `Math.random()`, `Date.now()`, `Math.atan2()`, a `for...in`, and a `phaser` import inside `src/sim` — assert each produces a violation. **Written first, and it must FAIL** (with no rules configured ESLint reports nothing, so the assertions fail) — that failure is the Red step
      Paths: tests/lint/boundary.test.ts, tests/lint/fixtures/*.ts
      Test-first: true
      Size: M
- [x] T004 [INFRA] ESLint boundary config — the four rule groups over `src/sim/**`: `no-restricted-imports` (phaser, src/game, DOM libs), `no-restricted-globals` (Date, performance, window, document, navigator), `no-restricted-properties` (Math.random + all transcendentals), `no-restricted-syntax` (ForInStatement, for-of over Map/Set). Turns T003 green
      Paths: eslint.config.js
      Size: M
- [x] T005 [INFRA] CI workflow — matrix over `ubuntu-latest` + `macos-latest` (Node LTS): lint → typecheck → unit → corpus → build → E2E
      Paths: .github/workflows/ci.yml
      Size: M
- [x] T006 [INFRA] Verify CI green on both OS runners; confirm the planted-violation fixtures do not leak into the real lint pass
      Paths: .github/workflows/ci.yml
      Size: XS

> **T003 is the point of M0.** A guard nobody verified is a guard nobody has, so the
> guard gets a Red-Green cycle like any other code: T003 asserts the violations, fails
> because no rules exist yet, and T004 makes it pass. The milestone's acceptance
> criterion is that lint *fails* on a deliberately planted `Math.random()` in `src/sim/`.

---

## M1 — Determinism harness

**Purpose**: discharge Constitution §I and §IV before gameplay exists. Per ADR-001 and ADR-002.

### Tests (Red first)

- [x] T007 [P] [FR-005] Test: `mulberry32` produces a fixed sequence from a fixed seed, and its state round-trips through serialise/deserialise
      Paths: tests/sim/rng.test.ts
      Test-first: true
      Size: S
- [x] T008 [P] [FR-005] Test: state hash is stable for identical state, and **changes** when any hashed field changes — including a field-order swap
      Paths: tests/sim/hash.test.ts
      Test-first: true
      Size: M
- [x] T009 [P] [FR-005] Test: hash normalises `-0` to `0`, and **throws** on `NaN` rather than hashing it
      Paths: tests/sim/hash.test.ts
      Test-first: true
      Size: S
- [x] T010 [FR-004] Test **O-4**: commands landing on the same tick apply in `(issuer, seq)` order regardless of arrival order; player before AI
      Paths: tests/sim/commands.test.ts
      Test-first: true
      Size: M
- [x] T011 [FR-003] Test **TC-UNIT-001**: same seed + same command log ⇒ identical terminal state hash across repeated runs
      Paths: tests/sim/determinism.test.ts
      Test-first: true
      Size: M
- [x] T012 [FR-005] Test **TC-UNIT-002**: PRNG state lives inside sim state — serialise mid-match, restore, and subsequent draws match an uninterrupted run
      Paths: tests/sim/determinism.test.ts
      Test-first: true
      Size: S
- [x] T013 [FR-003] Test **TC-INT-001**: replay round-trip — record a run, replay from seed + log, terminal hash matches
      Paths: tests/replay/roundtrip.test.ts
      Test-first: true
      Size: M
- [x] T014 [FR-003] Test **TC-INT-003**: the simulation runs under plain Node with no DOM and no graphics context
      Paths: tests/sim/headless.test.ts
      Test-first: true
      Size: S

### Implementation

- [x] T015 [FR-003] `simVersion` integer, bumped by hand when simulation behaviour changes (ADR-002)
      Paths: src/sim/version.ts
      Size: XS
- [x] T016 [FR-005] Vendored `mulberry32` — state held in `SimState`, never a module singleton
      Paths: src/sim/rng.ts
      Size: S
- [x] T017 [FR-003] `SimState` shapes — entities and nodes as **id-sorted arrays**, player id as array index, sentinels (`targetId: -1`) rather than optionals
      Paths: src/sim/state.ts
      Size: M
- [x] T018 [INFRA] `constants.ts` — `TICK_HZ = 20` plus the full tuning surface (costs, speeds, hp, ore per node). **Single file by design so M8 has one place to work**
      Paths: src/sim/constants.ts
      Size: S
- [x] T019 [FR-005] Canonical state hash per ADR-001 — fixed field order, id-ordered traversal, exact IEEE-754 bits via `DataView`, FNV-1a in two 32-bit lanes
      Paths: src/sim/hash.ts
      Size: M
- [x] T020 [FR-004] Command types, queue, and `(issuer, seq)` ordering — **O-4**
      Paths: src/sim/commands.ts
      Size: M
- [x] T021 [FR-003] `step(state, commands) → state` — pure tick function, the 10-stage pipeline skeleton
      Paths: src/sim/step.ts
      Size: M
- [x] T022 [FR-003] Replay record + playback
      Paths: src/sim/replay.ts
      Size: M
- [x] T023 [FR-003] Corpus runner with **mandatory checkpoint hashes**; reports the FIRST failing checkpoint, not just the terminal mismatch (ADR-002)
      Paths: tests/replay/run-corpus.ts
      Size: M
- [x] T024 [FR-003] `corpus:regen` script + `simVersion` staleness gating — stale cases FAIL with a distinct message; **never auto-update** (ADR-002)
      Paths: scripts/corpus-regen.ts, package.json
      Size: M
- [x] T025 [FR-003] First corpus case + wire the corpus step into CI across all three platforms
      Paths: tests/replay/corpus/001-baseline.json, .github/workflows/ci.yml
      Size: S

---

## M2 — Grid, movement, economy

### Tests (Red first)

- [x] T026 [P] [FR-022] Test **O-2 / TC-UNIT-004**: two equal-cost A\* paths resolve identically every run, tie broken by cell index then entity id
      Paths: tests/sim/pathfind.test.ts
      Test-first: true
      Size: M
- [x] T027 [P] [FR-027] Test **O-3 / TC-UNIT-003**: two ore nodes equidistant from a worker — the **lower node id** wins, every run
      Paths: tests/sim/economy.test.ts
      Test-first: true
      Size: S
- [x] T028 [P] [FR-003] Test **O-7**: entity traversal during `step()` is id-sorted index order; adding entities out of order does not change results
      Paths: tests/sim/ordering.test.ts
      Test-first: true
      Size: M
- [x] T029 [FR-006] Test: starting workers gather from tick 0 with **no player input**
      Paths: tests/sim/economy.test.ts
      Test-first: true
      Size: S
- [x] T030 [FR-016] Test **TC-UNIT-007**: nodes deplete; on exhaustion workers idle at Base **without repath thrashing**; worker en route to an exhausted node retargets deterministically
      Paths: tests/sim/economy.test.ts
      Test-first: true
      Size: M

### Implementation

- [x] T031 [FR-014] 64 px tile grid + passability
      Paths: src/sim/grid.ts
      Size: S
- [x] T032 [FR-022] A\* with stable tie-breaking — **O-2**
      Paths: src/sim/pathfind.ts
      Size: L
- [x] T033 [FR-006, FR-016, FR-027] Ore nodes, worker gather loop, depletion — **O-3**
      Paths: src/sim/economy.ts
      Size: L

---

## M3 — Production & combat

### Tests (Red first)

- [x] T034 [P] [FR-021] Test **O-1 / TC-UNIT-005**: two enemies equidistant and in range — lowest entity id is targeted, every run
      Paths: tests/sim/combat.test.ts
      Test-first: true
      Size: S
- [x] T035 [P] [FR-012] Test **O-5**: two Factories complete on one tick with ore for only one — ascending factory id wins; the loser stays **queued**, not failed
      Paths: tests/sim/production.test.ts
      Test-first: true
      Size: M
- [x] T036 [P] [FR-028] Test **O-6**: two units deal mutually lethal damage on one tick — **both die**. Damage is collected across the tick and applied atomically at its end
      Paths: tests/sim/combat.test.ts
      Test-first: true
      Size: M
- [x] T037 [FR-031] Test: valid placement — full 64 px footprint passable, in bounds, unoccupied by structure or unit
      Paths: tests/sim/production.test.ts
      Test-first: true
      Size: S
- [x] T038 [FR-017, FR-028] Test **TC-UNIT-006**: victory, defeat, and **Draw** on simultaneous Base destruction
      Paths: tests/sim/victory.test.ts
      Test-first: true
      Size: M
- [x] T078 [FR-032] Test **TC-UNIT-011** *(CR-001)*: sudden death arms when every ore node is depleted; after the grace period escalating damage resolves the match in **bounded ticks**. Includes a deliberate stalemate scenario — both sides alive, neither able to win — which must terminate
      Paths: tests/sim/victory.test.ts
      Test-first: true
      Size: M
- [x] T079 [FR-033] Test **TC-UNIT-012** *(CR-001)*: sudden-death damage sets the distinct sudden-death flag and does **NOT** set the under-attack flag — a base dying with no attacker must not be reported as under attack
      Paths: tests/sim/victory.test.ts
      Test-first: true
      Size: S
- [x] T080 [FR-006] Test *(pre-impl F-6)*: a player with zero surviving Workers and less ore than a Worker costs can still produce one — the Base affords a Worker at zero cost. Removes a dead state in which a player can neither act nor lose
      Paths: tests/sim/production.test.ts
      Test-first: true
      Size: S

### Implementation

- [x] T039 [FR-012, FR-031, FR-006] Build queue, ore spend, placement validation — **O-5**. Includes the zero-cost Worker rule when a player has none surviving *(pre-impl F-6)*
      Paths: src/sim/production.ts
      Size: L
- [x] T040 [FR-020, FR-021] Target acquisition, damage collection, **atomic end-of-tick application** — O-1, O-6
      Paths: src/sim/combat.ts
      Size: L
- [x] T041 [FR-017, FR-028, FR-032, FR-033] Victory / defeat / draw resolution **+ sudden-death backstop** *(CR-001)* — arms on global node depletion, grace period, escalating Base damage, distinct sudden-death flag. **Adds no new verdict**: it forces one of the existing three, and reuses the Draw rule when both Bases fall on the same tick
      Paths: src/sim/victory.ts, src/sim/constants.ts
      Size: M

---

## M4 — AI opponent

### Tests (Red first)

- [x] T042 [FR-002] Test: AI-vs-AI match produces an identical terminal hash across repeated runs and all three platforms
      Paths: tests/sim/ai.test.ts
      Test-first: true
      Size: M
- [x] T043 [FR-029] Test: difficulty is a field of initial sim state and appears in the replay header; a replay reproduces AI behaviour exactly
      Paths: tests/sim/ai.test.ts, tests/replay/roundtrip.test.ts
      Test-first: true
      Size: S

### Implementation

- [x] T044 [FR-002, FR-029] Deterministic AI with three difficulty levels; emits commands into the shared queue and draws only from the sim PRNG
      Paths: src/sim/ai.ts
      Size: L
- [x] T045 [FR-003] Record an AI-vs-AI match as corpus case 002 — the first case with real gameplay
      Paths: tests/replay/corpus/002-ai-vs-ai.json
      Size: S

---

## M5 — Presentation

### Tests

- [x] T046 [INFRA] Regression: lint boundary still reports zero violations after Phaser enters the tree
      Paths: tests/lint/boundary.test.ts
      Size: XS

### Implementation

- [x] T047 [FR-014] Phaser 4 boot + scene registration
      Paths: src/game/main.ts, src/game/scenes/Match.ts
      Size: M
- [x] T048 [FR-003] **Accumulator loop** — steps whole ticks only, passes interpolation alpha to the renderer, `MAX_STEPS_PER_FRAME` spiral guard. **`delta` never crosses into `step()`**. Additionally **clamp the accumulator to ~250 ms and drop the excess** *(pre-impl F-4)* — otherwise a player returning from a backgrounded tab watches the simulation fast-forward through the match they just lost
      Paths: src/game/loop.ts
      Size: M
- [x] T049 [FR-015] Sprite key map — select the v1 roster from the 48 Kenney unit sprites and 16 structures (resolves open question 3)
      Paths: src/assets/sprites.ts
      Size: S
- [x] T050 [FR-014, FR-015] Render layer — fixed single screen, tile background, sprite draw with interpolation, both bases visible from frame one
      Paths: src/game/render/world.ts
      Size: L
- [x] T081 [FR-018] **Spike** *(pre-impl F-7)*: render ~12 mixed friendly/enemy units at real scale and confirm the underglow ring reads at a glance, **including in greyscale**. The ring is the entire WCAG 1.4.1 mitigation and the drawn sprite is materially smaller than its 64 px canvas. Timebox 30 min; do before T051
      Paths: unknown
      Size: XS
- [x] T082 [FR-014] Render-only unit jitter *(pre-impl F-2)* — a small deterministic-per-entity visual offset so co-located units do not perfectly overlap. **Presentation layer only; must never touch sim state.** Units do not collide in v1
      Paths: src/game/render/world.ts
      Size: S
- [x] T051 [FR-018] **Underglow ring** on friendly units — the non-colour ownership cue (WCAG 1.4.1); doubles as the selection affordance
      Paths: src/game/render/ownership.ts
      Size: M

---

## M6 — Input & HUD

### Tests (Red first)

- [x] T052 [FR-030] Test: drag-select tests unit **collision circles**, not sprite bounds — changing a sprite must not change what is captured
      Paths: tests/sim/selection.test.ts
      Test-first: true
      Size: S

### Implementation

- [x] T053 [FR-007, FR-030] Drag-rectangle selection against collision circles
      Paths: src/game/input/select.ts
      Size: M
- [x] T054 [FR-008, FR-009] Right-click orders → commands queued to `tick + 1`; move marker acknowledged **within one rendered frame** (presentation only — must not touch sim timing)
      Paths: src/game/input/orders.ts
      Size: M
- [x] T055 [FR-012, FR-013] Placement ghost — live preview, valid/invalid state shown inline, never an error dialog *(presentation half of FR-012; the rules live in T039)*
      Paths: src/game/input/placement.ts
      Size: M
- [x] T056 [FR-010, FR-011] Build bar — **exactly 5 entries** (4 unit + 1 structure, visually separated), always visible, never nested; unaffordable greyed with cost shown
      Paths: src/game/hud/buildbar.ts
      Size: M
- [x] T057 [FR-016] Ore counter + node depletion display
      Paths: src/game/hud/resources.ts
      Size: S

---

## M7 — Screens & edges

### Tests (E2E — from `journeys.yml`, which is authoritative)

- [x] T058 [P] [JRN-001] E2E **TC-E2E-001**: first match, cold load → victory *(smoke)*
      Paths: tests/e2e/first-match.spec.ts
      Size: M
- [x] T059 [P] [JRN-002] E2E **TC-E2E-002**: rematch loop, same difficulty, no state leak *(smoke)*
      Paths: tests/e2e/rematch.spec.ts
      Size: S
- [x] T060 [P] [JRN-003] E2E **TC-E2E-003**: under-attack indicator + audio cue on first damage
      Paths: tests/e2e/under-attack.spec.ts
      Size: S
- [x] T061 [P] [FR-024] E2E **TC-E2E-004**: WebGL unavailable → plain readable message, not a blank rectangle
      Paths: tests/e2e/webgl-fallback.spec.ts
      Size: S
- [x] T062 [P] [FR-026] E2E **TC-E2E-005**: keyboard-only difficulty selection with visible focus
      Paths: tests/e2e/keyboard-gate.spec.ts
      Size: S
- [x] T063 [P] [FR-011] E2E **TC-E2E-006**: insufficient ore → greyed entry with cost, no dialog
      Paths: tests/e2e/insufficient-ore.spec.ts
      Size: S
- [x] T064 [P] [FR-013] E2E **TC-E2E-007**: invalid placement → invalid ghost, click refused inline
      Paths: tests/e2e/invalid-placement.spec.ts
      Size: S
- [x] T065 [P] [FR-017] E2E **TC-E2E-008**: defeat path — Rematch still primary
      Paths: tests/e2e/defeat.spec.ts
      Size: S
- [x] T066 [P] [FR-018] E2E **TC-E2E-009**: `@axe-core/playwright` WCAG-AA floor on gate, result, and fallback — zero critical violations
      Paths: tests/e2e/a11y.spec.ts
      Size: M

### Implementation

- [x] T067 [FR-001, FR-002, FR-026] Difficulty gate scene — three self-declaring options, nothing else on screen, fully keyboard operable with visible focus
      Paths: src/game/scenes/Gate.ts
      Size: M
- [x] T068 [FR-019] Result scene — Victory / Defeat / **Draw**, duration shown, Rematch primary and largest; "change difficulty" deliberately secondary
      Paths: src/game/scenes/Result.ts
      Size: M
- [x] T069 [FR-019] Rematch — fresh sim constructed from a new seed, same difficulty, **no state leak** from the prior match
      Paths: src/game/scenes/Result.ts, src/game/main.ts
      Size: S
- [x] T070 [FR-023, FR-033] Under-attack screen-edge indicator + audio cue; **rate-limited in presentation only, never in simulation**. Fires **only on damage from an enemy entity**. Sudden death gets its own distinct persistent indicator *(CR-001)* — a base dying with no attacker on screen, flagged "under attack", reads as a bug rather than a rule
      Paths: src/game/hud/alert.ts
      Size: M
- [x] T071 [FR-024] WebGL-unavailable fallback message
      Paths: src/game/main.ts, index.html
      Size: S
- [x] T072 [FR-025] Local counters (time-to-first-action, duration, completion, rematch) + debug overlay
      Paths: src/game/hud/counters.ts
      Size: M

---

## M8 — Balance tuning pass ⏱

**Exit criterion: median match duration 6–10 min, p90 < 15 min.** Timeboxed.

- [x] T073 [US-008, FR-032] Tuning pass over `constants.ts` — unit costs, speeds, hp, ore per node, node count, AI aggression, **sudden-death grace and damage ramp** *(CR-001)*. Tune toward a **legibility** ceiling of ~25–30 units per side, not the ~60 performance permits *(pre-impl F-5: "~60 units" arrived as a performance NFR and was never a design decision)*. Iterate by **playing**, not by specifying
      Paths: src/sim/constants.ts
      Size: L
- [x] T074 [US-008] Instrument and record 20+ match durations from the tuned build; confirm the 6–10 min median and p90 < 15 min
      Paths: tests/sim/duration.test.ts
      Size: M
- [x] T075 [FR-003] Record the tuned baseline as corpus case 003 — tuning changed simulation behaviour, so bump `simVersion` and regenerate stale cases **deliberately**, showing hash diffs in the PR
      Paths: tests/replay/corpus/003-tuned-baseline.json, src/sim/version.ts
      Size: M

---

## M9 — K1 comprehension playtest 🚦 BLOCKING

**Exit criteria: (1) ≥4 of 5 first-time players understand what to do, unaided; (2) ≥3 of 5 win at least one match on "New to this"** *(pre-impl F-3)*.

- [~] T076 [K1] Run the comprehension playtest — 3–5 first-time players, cold, no instruction. Say nothing. Record time-to-first-action, whether they understood the goal, **and whether they won** *(pre-impl F-3: comprehension alone does not prove the game is beatable, and an AI written by someone who knows the game is the most common way a solo project ships something unwinnable)*
      Paths: unknown
      Size: M
- [ ] T077 [K1] Address playtest findings and re-run. Cheap remedies first: first-frame framing, AI opening pace, affordance size
      Paths: unknown
      Size: L

> **M9 blocks completion.** A build that passes every automated test and fails M9 has
> failed. This is the only mechanism preventing the project from shipping something
> provably correct and unenjoyable (RF-4).

---

## Dependencies & Execution Order

### Milestone dependencies (strict)

```
M0 ──→ M1 ──→ M2 ──→ M3 ──→ M4 ──→ M5 ──→ M6 ──→ M7 ──→ M8 ──→ M9
```

**M0 before M1 before all gameplay is non-negotiable.** Constitution §I and §II cannot
be retrofitted, and §IV is unmeetable if the corpus format arrives after the first bug
fix. The cost is that nothing is visible on screen until M5; that trade was accepted
knowingly in `plan.md`.

### Within each milestone

- **Test tasks run and are observed FAILING before their implementation tasks** (Principle III). Tasks marked `Test-first: true` are the Red gate that `implement` checks at the Phase 5B→6 boundary.
- Within implementation, sim modules precede the presentation that reads them.

### Parallel opportunities

| Group | Tasks | Why safe |
|---|---|---|
| M1 tests | T007, T008, T009 | Different test files, no shared source |
| M2 tests | T026, T027, T028 | Different test files |
| M3 tests | T034, T035, T036 | Different test files |
| M7 E2E | T058–T066 | Nine independent spec files |

**Not parallelisable:** T032/T033 (economy calls pathfind), T039/T040 (production and
combat both mutate entity state in the same tick pipeline), and anything sharing
`src/sim/state.ts`.

---

## Coverage Matrix

### Requirements → tasks (33/33)

| FR | Tasks | | FR | Tasks |
|---|---|---|---|---|
| FR-001 | T067 | | FR-017 | T038, T041, T065 |
| FR-002 | T042, T044, T067 | | FR-018 | T051, T066 |
| FR-003 | T011, T013, T014, T015, T021, T022, T023, T024, T025, T028, T045, T048, T075 | | FR-019 | T068, T069 |
| FR-004 | T010, T020 | | FR-020 | T040 |
| FR-005 | T007, T008, T009, T012, T016, T019 | | FR-021 | T034, T040 |
| FR-006 | T029, T033 | | FR-022 | T026, T032 |
| FR-007 | T053 | | FR-023 | T070 |
| FR-008 | T054 | | FR-024 | T061, T071 |
| FR-009 | T054 | | FR-025 | T072 |
| FR-010 | T056 | | FR-026 | T062, T067 |
| FR-011 | T056, T063 | | FR-027 | T027, T033 |
| FR-012 | T035, T039, T055 | | FR-028 | T036, T038, T041 |
| FR-013 | T055, T064 | | FR-029 | T043, T044 |
| FR-014 | T031, T047, T050 | | FR-030 | T052, T053 |
| FR-015 | T049, T050 | | FR-031 | T037, T039 |
| FR-016 | T030, T033, T057 | | FR-032 | T078, T041, T073 *(CR-001)* |
| | | | FR-033 | T079, T041, T070 *(CR-001)* |

### Ordering hazards → tests (7/7)

| Hazard | Test task | Implementation |
|---|---|---|
| O-1 target acquisition ties | T034 | T040 |
| O-2 A\* open-set ties | T026 | T032 |
| O-3 ore node ties | T027 | T033 |
| O-4 command order within a tick | T010 | T020 |
| O-5 production ore contention | T035 | T039 |
| O-6 simultaneous lethal damage | T036 | T040 |
| O-7 entity iteration order | T028 | T017 (id-sorted structure) + T032/T033 (traversal) + T004 (lint) |

### Stories → milestones (12/12)

US-001 → M7 · US-002 → M4, M7 · US-003 → M2 · US-004 → M6 · US-005 → M6 ·
US-006 → M3, M6 · US-007 → M5 · US-008 → M3, M8 · US-009 → M5 · US-010 → M7 ·
US-011 → M7 · US-012 → M7

---

## Implementation Strategy

**There is no MVP slice before M5.** M0–M4 produce a headless, fully tested,
provably deterministic simulation with an AI opponent and zero pixels. That is the
constitution's price and it was paid deliberately.

**Commit granularity:** one commit per task for M0–M1 (the foundation should be
bisectable), then one commit per test/implementation pair for M2 onward.

**First real milestone gate:** M1 exit. If the same seed and command log do not produce
an identical hash on all three platforms, stop and fix it there. Every later milestone
compounds on that property, and M1 is the cheapest possible moment to discover it is
broken.
