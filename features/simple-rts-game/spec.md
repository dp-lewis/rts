# Spec: Ten Minute War — Simple Browser RTS

> **Product Forge Feature** | Generated: 2026-08-21
> Feature slug: `simple-rts-game` | SpecKit mode: `classic` | Feature mode: `standard`
>
> **Source artifacts:**
> - Product Spec (LOCKED): [product-spec/README.md](./product-spec/README.md)
> - Research: [research/README.md](./research/README.md)
> - Review log: [review.md](./review.md) — approved after 1 revision
> - Problem statement: [problem-discovery/problem-statement.md](./problem-discovery/problem-statement.md)

---

## Overview

### What We're Building

A single-screen browser RTS that opens straight into a playable match and reaches a
definitive win, loss, or draw in roughly ten minutes. One resource, three combat
units on a plain cost/power ladder, no fog of war, no camera, no tutorial — the
entire strategic surface is visible at once. The match is guaranteed to end because
the ore runs out.

### Why We're Building It

A casual player wanting a real-time strategy fix in a spare fifteen minutes has no
maintained browser RTS that delivers a complete match arc. The credible options are
a multi-gigabyte install with 30–60 minute matches, or a dead Flash-era clone.

Problem severity is honestly modest — **4/10, validation Weak**. The competing-forces
analysis found Push + Pull ≈ Inertia + Anxiety: the problem is not painful enough to
pull players in on its own, because the alternative (playing something else) is free
and works fine. **The go decision rests on craft goals — a playable, fun ten-minute
match and a clean, extensible codebase — not on validated market pain.** Every design
choice below follows from that.

### Research Backing

- **Competitor analysis:** Browser RTS is contested at the *large / persistent / multiplayer* end and vacant at the *short, finishable* end. Decisively, **Littlewargame ships with a single resource and reviewers cite that reduction as a strength** — shipped precedent for the economy design.
- **UX/UI patterns:** Most players quit within the first ten minutes. In a ten-minute game that collapses into a rule: **the first-run experience and the game are the same thing.** There is no "later" in which to teach.
- **Codebase analysis:** Greenfield. The constitution (v1.1.0) is the only pre-existing fact and supplies 13 binding constraints, two of them from NON-NEGOTIABLE principles.
- **Tech stack:** Determinism costs a lint rule and a squared-distance habit, **not fixed-point math**. IEEE 754 requires correct rounding for `+ - * /` and `sqrt` but only *recommends* it for transcendentals.

> Deep dive: [research/README.md](./research/README.md)

---

## Goals

### Primary Goal

A first-time player, given no instruction, starts a match, understands what to do,
plays it to a definitive result inside about ten minutes, and immediately plays
again.

### Secondary Goals

1. A codebase whose simulation/presentation boundary is clean enough that
   multiplayer, new units, or new maps could be added later without rework.
2. A deterministic simulation whose replays are provably reproducible across three
   platforms — a constitutional obligation that also serves goal 1.
3. Zero-friction cold start: no install, no account, no lobby, no tutorial.

### Non-Goals (v1 scope)

These are **non-goals, not backlog**. Adding one back is a change request.

**Gameplay:** fog of war · unit counters / rock-paper-scissors · upgrades, tech tree,
veterancy · abilities · formations or stances · a second resource · more than 3
combat unit types · more than 2 structure types · buildable Bases · unit repair or
healing · terrain height or cover · naval or air units · campaign or story.

**Interface:** camera control, scrolling, or zoom · minimap · control groups · build
queues beyond one item · replay viewer UI · settings menu · pause.

**Platform:** multiplayer of any kind · accounts, profiles, or persistence ·
leaderboards · mobile or touch · monetisation · backend, API, or database (Express
and MongoDB are out of v1 scope despite appearing in project config) · localisation ·
analytics provider.

---

## Users

### Primary Persona

**"The lapsed strategist"** — a casual desktop browser player with 10–20 spare
minutes. Has played or watched an RTS at some point; does not currently play one.

**Key need:** the genre's build-up-and-win arc, in a session they actually have.

**Why this matters technically:** they arrive already knowing drag-select and
right-click-to-move. That pre-training is the single most valuable fact about them
and is the entire reason no tutorial is needed.

**Will not tolerate:** an account wall, a load that reads as broken, or being
confused at second 45 — closing the tab costs them nothing.

No secondary persona. Competitive RTS players are explicitly not served.

---

## User Stories

> Full structured journeys: [product-spec/journeys/](./product-spec/journeys/journeys.yml)

### Must Have (MVP)

- [ ] **US-001** As a player, I want the game playable within seconds of loading, so that I never invest before knowing if I like it.
  - **AC:** Page load → interactive match (commands issuable) ≤ **10 s** including the difficulty gate; no account, no lobby, no tutorial.
  - **Journey:** JRN-001 STEP-001/002 · **Wireframe:** [difficulty gate](./product-spec/wireframes/wireframe-difficulty-gate.html)

- [ ] **US-002** As a player, I want to declare my experience level before starting, so that the match is winnable for someone at my level.
  - **AC:** A one-tap, three-option gate is the only thing between load and match. Difficulty is a **field of the match's initial simulation state**, stored alongside the RNG seed (not encoded into it) and written to the replay header.
  - **Journey:** JRN-001 STEP-002, EDGE-002

- [ ] **US-003** As a player, I want my workers gathering automatically from the start, so that I am never doing chores in the first thirty seconds.
  - **AC:** Starting workers move to the nearest own-side ore node and gather from tick 0 with no player input. **"Nearest" = least squared Euclidean distance; ties resolve by ascending ore-node id** — never by iteration order.
  - **Journey:** JRN-001 STEP-003, EDGE-006

- [ ] **US-004** As a player, I want drag-select and right-click orders, so that I can play immediately using what I already know.
  - **AC:** Drag-rectangle selects every own unit whose **collision circle** intersects it (not sprite bounds). Right-click issues move (ground) or attack (enemy). Both acknowledged visually within one rendered frame.
  - **Journey:** JRN-001 STEP-005/006

- [ ] **US-005** As a player, I want to train units from a permanently visible build bar, so that I never hunt through menus.
  - **AC:** Exactly **five** entries — four units (Worker, Scout, Trooper, Tank) plus one structure (Factory), visually separated. Always on screen, never nested. Unaffordable entries greyed with cost shown — never hidden, never a dialog.
  - **Journey:** JRN-001 STEP-007, EDGE-004 · **Wireframe:** [match](./product-spec/wireframes/wireframe-match.html)

- [ ] **US-006** As a player, I want to build additional factories, so that I can trade economy now for production later.
  - **AC:** One placeable structure type; click placement with live ghost preview. **Valid ground** = full 64 px footprint passable, wholly in bounds, unoccupied by structure or unit. Invalid placement shown inline, not as an error.
  - **Journey:** JRN-001 STEP-008, EDGE-005

- [ ] **US-007** As a player, I want the whole battlefield visible at once, so that I never search for the enemy or manage a camera.
  - **AC:** Fixed single-screen map. No scrolling, no minimap, no fog. Both bases visible from the first frame.
  - **Journey:** JRN-001 STEP-004

- [ ] **US-008** As a player, I want the match to end decisively in about ten minutes, so that it fits the time I have.
  - **AC:** Destroying the enemy Base wins; losing your own loses. **Both Bases at zero HP on the same tick is a Draw** — an explicit third verdict, not an arbitrary tie-break. Finite ore nodes force production to halt, and <!-- CR-001 --> **when every node is depleted a sudden-death backstop arms: after a grace period all Bases take escalating damage until one falls.** Median duration 6–10 min; p90 < 15 min.
  - **Journey:** JRN-001 STEP-010, EDGE-007, EDGE-009

- [ ] **US-009** As a player, I want to tell my units from the enemy's without relying on colour, so that the game is readable regardless of colour vision.
  - **AC:** Every friendly unit carries a persistent non-colour ownership cue (underglow ring); enemies do not. Verified against WCAG 2.1 AA §1.4.1.
  - **Journey:** JRN-001 EDGE-008

- [ ] **US-010** As a player, I want to restart instantly when the match ends, so that the good outcome is "again", not "leave".
  - **AC:** Result screen's primary and largest action is Rematch; one click returns to a fresh match at the same difficulty, without returning to the gate.
  - **Journey:** JRN-002 · **Wireframe:** [result](./product-spec/wireframes/wireframe-result.html)

### Should Have

- [ ] **US-011** As a player, I want to know when my base is under attack, so that I do not lose without noticing.
  - **AC:** Screen-edge indicator plus audio cue on the first damage event to any owned entity. **Journey:** JRN-003

- [ ] **US-012** As a player without WebGL, I want an honest explanation, so that I am not staring at a blank rectangle.
  - **AC:** A plain, human-readable message replaces the canvas when renderer init fails. **Journey:** JRN-001 EDGE-001

### Could Have (post-v1)

- [ ] **US-013** Share a match by seed. *(Replay machinery is constitutionally mandatory anyway — surfacing it is nearly free differentiation.)*
- [ ] **US-014** Difficulty change from the result screen without returning to the gate.
- [ ] **US-015** Sound and music beyond the two functional cues.

---

## Functional Requirements

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-001 | Page load presents the difficulty gate and nothing else | Must | US-002 |
| FR-002 | Selecting a difficulty starts a match immediately | Must | US-002 |
| FR-003 | Simulation advances in fixed-timestep ticks, decoupled from render frames | Must | Constitution §I |
| FR-004 | All player intent enters the simulation as commands queued for a future tick | Must | Constitution §II |
| FR-005 | All randomness derives from a seed held inside simulation state | Must | Constitution §I |
| FR-006 | ~~Starting workers auto-gather from tick 0~~ → **Workers gather from the moment they exist; a match starts with none** *(CR-002)* | Must | US-003 |
| FR-007 | Drag-rectangle selects all own units intersecting it | Must | US-004 |
| FR-008 | Right-click issues move on ground, attack on enemy entity | Must | US-004 |
| FR-009 | Command issue is visually acknowledged within one rendered frame | Must | Presentation-layer only; must not affect sim timing |
| FR-010 | ~~Exactly 5 entries — 4 unit + 1 structure~~ → **Permanent bar carries the placeable structures, always visible and never nested; units appear on the building that trains them** *(CR-002)* | Must | US-005 |
| FR-011 | Unaffordable build entries are greyed inline with cost shown | Must | US-005 |
| FR-012 | Player may place additional **Barracks and Factories** on valid ground *(CR-002)* | Must | US-006 |
| FR-013 | Invalid placement is indicated by ghost state, not an error dialog | Must | US-006 |
| FR-014 | Map is a fixed single screen: no scrolling, no camera, no minimap | Must | US-007 |
| FR-015 | No fog of war; both bases visible from the first frame | Must | US-007 |
| FR-016 | Ore nodes hold finite amounts and visibly deplete | Must | US-008 |
| FR-032 | When every ore node is depleted, sudden death arms; after a grace period all Bases take escalating damage until the match resolves *(CR-001)* | Must | US-008 |
| FR-033 | Sudden-death damage shows a distinct indicator and does NOT trigger the under-attack indicator *(CR-001)* | Must | US-008, FR-023 |
| FR-017 | Destroying the enemy Base wins; losing own Base loses. Sudden death adds no new verdict — it forces one of the existing three *(CR-001)* | Must | US-008 |
| FR-018 | Every friendly unit carries a persistent non-colour ownership cue | Must | US-009 |
| FR-019 | Result screen's primary action is Rematch | Must | US-010 |
| FR-020 | Units auto-acquire enemies in range; explicit orders override | Must | US-004 |
| FR-021 | Target acquisition ties resolve by stable entity id | Must | Constitution §I |
| FR-022 | A* open-set ties resolve by stable entity id | Must | Constitution §I |
| FR-023 | Screen-edge indicator + audio cue when an owned entity takes damage | Should | US-011 |
| FR-024 | Honest fallback message when WebGL is unavailable | Should | US-012 |
| FR-025 | Local counters record time-to-first-action, duration, completion, rematch | Should | US-001, US-008, US-010 |
| FR-026 | Difficulty gate is operable by keyboard alone | Should | US-002 |
| FR-027 | Ore-node selection resolves by least squared distance, ties by ascending node id | Must | US-003, Constitution §I |
| FR-028 | Simultaneous Base destruction on one tick resolves as an explicit Draw | Must | US-008 |
| FR-029 | Difficulty is a field of initial simulation state and appears in the replay header | Must | US-002 |
| FR-030 | Selection tests against unit collision circles, not sprite bounds | Must | US-004 |
| FR-031 | Valid placement = full footprint passable, in-bounds, unoccupied by structure or unit | Must | US-006 |

> **CR-001 (sudden death)** was raised by the Phase 5C pre-implementation review:
> ore exhaustion halts *production* but does not force *resolution*, so a
> post-exhaustion stalemate had no terminator and the "ten minutes" promise was not
> actually guaranteed by anything in the simulation. Escalating damage bounds the
> match length regardless of Base hit points. All timing and damage constants are M8
> tuning variables, deliberately unfixed here.
>
> **Three of these — FR-021, FR-022, FR-027 — are the same defect class:** unspecified
> ordering breaking determinism. Revalidation found FR-027 as the third instance.
> **Expect a fourth during planning.** Each is numbered separately so the plan cannot
> quietly skip one.

---

## Non-Functional Requirements

Inherited from the project constitution **v1.1.0** and **not negotiable at feature
level**. Full 13-row derivation: [research/codebase-analysis.md](./research/codebase-analysis.md).

| Category | Requirement | Source |
|----------|-------------|--------|
| Determinism | Same seed + same command log ⇒ bit-identical state hash on `ubuntu-latest` (Node LTS), `macos-latest` (Node LTS), and Chromium | Constitution §I |
| Forbidden in sim | Wall-clock/frame-delta time, unseeded randomness, unordered iteration, and all transcendentals (`sin`/`cos`/`tan`/`atan2`/`asin`/`acos`/`log`/`exp`/`pow`) | Constitution §I |
| Layering | Simulation must not import rendering, audio, input, windowing, or UI; presentation reads sim state and never mutates it | Constitution §II |
| Headless | Simulation runs under plain Node with no graphics context, decoupled from real time | Constitution §II |
| Test-first | Red-Green-Refactor, strictly ordered. No production code without a test that fails in its absence | Constitution §III |
| Regression | Every fixed sim/gameplay defect lands with a command log + expected terminal state hash; CI replays the full corpus every run | Constitution §IV |
| Simplicity | Every abstraction, config point, and dependency requires a demonstrated present need. Runtime dependency target: **Phaser alone** | Constitution §V |
| Performance | Time to first render < 3 s on a mid-tier laptop; stable frame rate with ~60 simultaneous units | research/ux-patterns |
| Accessibility | WCAG 2.1 AA for DOM surfaces; ownership never conveyed by colour alone. **The canvas is not screen-reader accessible — stated, not papered over** | research/ux-patterns |
| Licensing | Art is CC0 (Kenney); credit given though not required | research/assets |

## NFR Measurement Contract

Every NFR needs a measurable signal. Where an NFR cannot be measured, that is stated
rather than hidden.

| NFR | How to Measure | Signal / Query | Threshold |
|-----|----------------|----------------|-----------|
| Determinism across platforms | CI replays the corpus on each platform and compares terminal state hashes | CI matrix job exit code; hash equality assertion | **100%**, every run |
| No forbidden sim constructs | Lint rule over the simulation directory | ESLint `no-restricted-globals` / `no-restricted-properties` violation count | **0** |
| Layering (no Phaser in sim) | Lint import-boundary rule | ESLint `no-restricted-imports` violation count | **0** |
| Headless sim | Sim test suite runs under plain Node with no DOM | Vitest suite exit code in a non-browser environment | Pass |
| Test-first | Test task precedes implementation task in `tasks.md`; red gate confirms failure first | `phases.implement.red_gate.status` | `confirmed_failing` |
| Runtime dependencies | Count of non-dev dependencies in `package.json` | `jq '.dependencies \| length'` | **1** (Phaser) |
| Time to first render | Manual timing / Lighthouse on a mid-tier laptop | Lighthouse FCP | **< 3 s** |
| Frame rate under load | Manual observation with ~60 units on the field | Frame time in the debug overlay | Stable, no sustained drops |
| WCAG 2.1 AA (DOM surfaces) | `@axe-core/playwright` per journey, per `a11y_gate: axe` | axe violation count on gate / result / fallback | **0** critical |
| Ownership not colour-only | Manual review + greyscale screenshot check | Underglow ring present on friendlies, absent on enemies | Pass |
| Canvas screen-reader access | **Not measurable — and not claimed.** A canvas game cannot be made screen-reader accessible by markup alone | — | Declared limitation |

---

## Technical Context

> Detailed analysis: [research/codebase-analysis.md](./research/codebase-analysis.md) · [research/tech-stack.md](./research/tech-stack.md)

### Integration Points

**None — the repository is greenfield.** A single initial commit, a 5-byte README,
and tooling directories. There is no source, no `package.json`, no build config, no
tests, no CI. Every layer is new, so integration risk is zero; the corresponding cost
is that every foundational decision is still open and lands in Phase 5.

### Reusable Components

None in-repo. External references worth studying (not dependencies):
`andersevenrud/cncjs` (open-source JS RTS — selection, ordering, unit state machines),
Aditya Ravi Shankar's C&C HTML5 demo, 0 A.D. (simulation architecture).

### New Modules Required

| Module | Responsibility | Layer |
|--------|----------------|-------|
| Simulation core | Fixed-tick loop, entity state, state transitions | sim (no Phaser) |
| Command queue | Player intent scheduled to future ticks | sim |
| Seeded PRNG | `mulberry32` or `sfc32`, vendored; state lives **inside** sim state | sim |
| State hashing | Canonical serialisation → FNV-1a over exact float bits | sim |
| Replay harness | Command-log record/playback; corpus runner | sim + test |
| Pathfinding | Grid A\* with stable tie-breaking | sim |
| AI | Deterministic opponent, difficulty-parameterised, uses sim PRNG | sim |
| Renderer | Phaser 4 scene, sprite layers, interpolation | presentation |
| Input | Drag-select, right-click orders, placement ghost → emits commands | presentation |
| HUD | Ore counter, build bar, alert band, result screen | presentation |
| Lint boundary config | Enforces §I and §II at build time | tooling |
| CI | 3-platform matrix, replays the corpus every run | tooling |

### Data Model Impact

No database (out of v1 scope). Two file-shaped artifacts, both constitutionally
required:

- **Command log** — ordered commands with target ticks plus the initial seed and difficulty. Serialisable, diffable, committed as test fixtures.
- **State hash** — canonical digest of sim state at a tick. Its exact definition (field order, entity ordering, float handling) is a determinism-critical design decision belonging in `plan.md`.

Phase 5.5 (Migration Plan) is expected to resolve to `not_applicable`.

### Tech Stack Notes

- **Phaser 4.1.0** (stable since April 2026). The v3 WebGL pipeline was fully replaced with a node-based render architecture. **Effectively WebGL-only** — Canvas is deprecated, which makes the WebGL-unavailable state newly reachable (FR-024).
- **`SpriteGPULayer`** suits many small units — our exact load profile.
- ⚠️ **Phaser's idiomatic `update(time, delta)` is constitutionally unusable for simulation.** The scene drives an accumulator that steps the sim by whole fixed ticks and passes only an interpolation alpha to the renderer. The sim never sees `delta`. This departs from every Phaser tutorial and **will be "fixed" back by habit unless lint prevents it.**
- Distances compare **squared** (`dx*dx + dy*dy < r*r`) — no `sqrt` needed and faster. Facing is an integer index into a fixed direction table, never `atan2`.

### Codebase Constraints

| Constraint | Source | Impact on design |
|------------|--------|------------------|
| Fixed-timestep pure state transitions | Constitution §I | Rules out variable-delta `update(dt)` — i.e. rules out the default Phaser idiom |
| No wall-clock, unseeded randomness, or unordered iteration in sim | Constitution §I | No `Date.now`, `performance.now`, `Math.random`, `for...in`, or bare `Map`/`Set` iteration where order is not provably stable |
| PRNG state carried inside sim state | Constitution §I | Rules out a module-level singleton RNG — the common way these libraries are consumed |
| Bit-identical hash on every supported platform | Constitution §I | Requires a canonical hash function and a **≥2-platform CI matrix**; a single runner cannot verify the claim |
| Sim must not depend on render/audio/input/UI | Constitution §II | Hard module boundary, enforced by lint rather than review |
| Intent enters only as future-tick commands | Constitution §II | Command queue required even in single-player where delay is zero |
| Sim runnable headless | Constitution §II | Sim must run under plain Node with no DOM — this is what makes determinism tests cheap |
| Red-Green-Refactor mandatory | Constitution §III | Test tasks are **never optional**; Phase 6's red gate is constitutionally required |
| Replay corpus committed per fixed defect | Constitution §IV | Corpus format and harness must exist **before the first bug fix** |
| CI replays corpus every run | Constitution §IV | CI is a v1 deliverable, not a later nicety |
| Dependencies need demonstrated present need | Constitution §V | Prefer ~50 vendored lines over packages; argues against a monorepo layout |
| Complexity Tracking table for accepted violations | Constitution §V | `plan.md` must carry it. **It currently starts empty** — every later entry is a visible decision |
| Constitution Check before Phase 0 research and after Phase 1 design | Constitution, Governance | Two explicit checkpoints inside Phase 5 |

---

## Acceptance Criteria

The feature is complete when:

1. All Must Have user stories are implemented, each with a test that fails in its absence (Constitution §III).
2. The three screens match their wireframes within acceptable deviation.
3. The determinism corpus passes on all three supported platforms.
4. Lint reports zero forbidden constructs and zero boundary violations in the simulation directory.
5. `@axe-core/playwright` reports zero critical violations on the DOM surfaces.
6. **A comprehension playtest with 3–5 first-time players reaches ≥4 of 5 understanding what to do unaided.** This is the only check on the "fun" goal and it is deliberately human.
7. Median match duration lands in the 6–10 minute band.
8. `package.json` has exactly one runtime dependency.

---

## Success Metrics

> Full definitions: [product-spec/metrics.md](./product-spec/metrics.md)

**Primary KPI: K1 comprehension** — ≥4 of 5 first-time playtesters understand what to
do without being told. Baseline: n/a (new).

**Hard gate: K7 determinism corpus** — 100%, every CI run, all three platforms.

Supporting: K2 observed time to first action <30 s from page load · K3 completion
≥70% · K4 median duration 6–10 min · K5 rematch ≥40% · K6 first render <3 s.

> **K1 and K7 carry the weight for opposite reasons.** K7 is machine-checked and
> absolute. K1 is human and is the only check on "fun" at all — RTS feel is tuned by
> playing, not specified by writing, and cannot be verified by the traceability chain.
> **Without a protected slot in the plan, K1 will be crowded out by the six criteria a
> machine can check.**

---

## Testing Specification

### Coverage Targets

| Module / Service | Target Coverage | Test Type |
|-----------------|----------------|-----------|
| Simulation core | **≥ 90%** | unit (headless, state assertions) |
| Command queue | ≥ 90% | unit |
| Seeded PRNG | 100% | unit |
| State hashing | 100% | unit |
| Pathfinding (A\*) | ≥ 90% | unit — including tie-break determinism |
| AI | ≥ 80% | unit (headless) |
| Replay harness | ≥ 90% | integration |
| Renderer / HUD / Input | — | E2E only (presentation is not state-asserted) |

> Coverage is highest in the simulation because Constitution §III requires simulation
> logic to be covered by headless tests asserting on **state, not rendered output**.
> Playwright E2E covers presentation and journeys; it cannot discharge that requirement.

### Critical Test Cases

| # | Scenario | Input | Expected Output | Type |
|---|----------|-------|----------------|------|
| TC-UNIT-001 | Determinism — same seed, same log | seed S, command log L | Terminal state hash identical across runs and platforms | unit |
| TC-UNIT-002 | PRNG state is inside sim state | Serialise → deserialise mid-match | Subsequent draws identical to an uninterrupted run | unit |
| TC-UNIT-003 | Ore-node tie-break | Two nodes equidistant from a worker | Worker selects the **lower node id**, deterministically (FR-027) | unit |
| TC-UNIT-004 | A\* open-set tie-break | Two paths of equal cost | Same path every run, tie broken by entity id (FR-022) | unit |
| TC-UNIT-005 | Target acquisition tie-break | Two enemies equidistant and in range | Same target every run, by stable id (FR-021) | unit |
| TC-UNIT-006 | Simultaneous Base destruction | Both Bases reach 0 HP on one tick | Verdict is **Draw** (FR-028) | unit |
| TC-UNIT-007 | Ore exhaustion | All own nodes depleted, worker en route | Worker idles at Base; no repath thrash (EDGE-006) | unit |
| TC-UNIT-008 | Command scheduling | Command issued at tick T | Applied at its target tick, not on issue (FR-004) | unit |
| TC-UNIT-011 | Sudden death arms and terminates | All nodes depleted, both sides hold surviving forces | Backstop arms; escalating damage resolves the match in bounded ticks (FR-032) | unit |
| TC-UNIT-012 | Sudden death does not misfire the alert | Sudden-death damage applied to a Base | Distinct indicator flagged; under-attack indicator NOT triggered (FR-033) | unit |
| TC-UNIT-009 | No forbidden constructs | Lint over `sim/` | Zero violations (transcendentals, `Date.now`, `Math.random`) | lint |
| TC-UNIT-010 | Layer boundary | Lint over `sim/` imports | Zero Phaser or DOM imports (FR/§II) | lint |
| TC-INT-001 | Replay round-trip | Record a full match, replay from seed + log | Terminal hash matches the recorded hash | integration |
| TC-INT-002 | Rematch state isolation | Complete a match, rematch, run | No state leaks; match 2 reproduces from its own seed (JRN-002 EDGE-002) | integration |
| TC-INT-003 | Headless execution | Run the full sim under plain Node | Completes with no DOM or graphics context | integration |
| TC-REG-001 | Replay corpus | Every committed regression case | All terminal hashes match; **any divergence fails the build** | regression |

### E2E Scenarios

| TC-ID | Scenario | Entry Point | Exit Condition |
|-------|----------|------------|----------------|
| TC-E2E-001 | JRN-001 first match → victory *(smoke)* | Cold page load | Victory screen with Rematch primary |
| TC-E2E-002 | JRN-002 rematch loop *(smoke)* | Result screen | Fresh match at same difficulty, starting values |
| TC-E2E-003 | JRN-003 under-attack alert | Match with army away from Base | Indicator + audio fire on first damage |
| TC-E2E-004 | JRN-001 EDGE-001 WebGL unavailable | Load with WebGL disabled | Plain readable message, not a blank rectangle |
| TC-E2E-005 | JRN-001 EDGE-002 keyboard-only gate | Cold load, keyboard only | Difficulty activates; focus visible throughout |
| TC-E2E-006 | JRN-001 EDGE-004 insufficient ore | Ore below unit cost | Entry greyed with cost shown; no dialog |
| TC-E2E-007 | JRN-001 EDGE-005 invalid placement | Ghost over occupied tile | Invalid ghost state; click refused inline |
| TC-E2E-008 | JRN-001 EDGE-007 defeat path | AI destroys player Base | Defeat screen, Rematch still primary |
| TC-E2E-009 | a11y floor (`a11y_gate: axe`) | Each DOM surface | Zero critical axe violations |

> `TC-*` ids are provisional here; `test-plan` (Phase 8A) owns the canonical set and
> generates Playwright specs from `journeys.yml`, which is authoritative.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **A\* tie-breaking diverges silently across platforms** (RF-2) | High | FR-022 + TC-UNIT-004. Highest-probability determinism defect in the project. |
| **"Fun" crowded out by machine-checkable criteria** (RF-4) | High | AC #6 is a blocking playtest gate; balance numbers deliberately unspecified. **The plan must schedule this as real work.** |
| **Phaser's `update(time, delta)` idiom fights §I** (RF-3) | High | Lint ban + explicit plan note. Every tutorial pulls the wrong way. |
| Player closes the tab at second 45 (R2) | High | No tutorial, no camera, no fog, auto-gather, flat build bar, both bases visible from frame one. |
| Difficulty gate erodes the cold-start advantage | Med | One tap, three buttons, nothing else. Accepted trade-off; anti-metric added. |
| Single-player forgoes the category's retention mechanism (RF-5) | Med | Accepted for v1. JRN-002 rematch is the substitute loop. |
| Fixed single screen feels cramped (~20×11 tiles) | Med | Validate in playtest. Escalating to a scrolling map is a change request. |
| Balance tuning consumes unbounded time | Med | Timebox it. Ship at "beatable and legible", not "perfectly balanced". |
| WebGL unavailable (RF-6) | Med | FR-024 + TC-E2E-004. |
| **A fourth unspecified-ordering defect appears during planning** | Med | Three found so far (FR-021, FR-022, FR-027). Treat as expected, not surprising. |

---

## Wireframes Reference

> [product-spec/wireframes/](./product-spec/wireframes/) — each carries its rationale inline.

- **[Difficulty gate](./product-spec/wireframes/wireframe-difficulty-gate.html)** — three self-declaring options, nothing else, visible focus ring.
- **[Match + HUD](./product-spec/wireframes/wireframe-match.html)** — fixed screen, ore counter, 5-entry build bar, depleting ore nodes, underglow ownership, under-attack band.
- **[Result](./product-spec/wireframes/wireframe-result.html)** — Victory / Defeat / Draw, Rematch dominant, "change difficulty" deliberately secondary.

---

## Open Questions

Five, all knowingly carried forward from the locked spec — each is a tuning
variable, a plan-level detail, or cosmetic. None block planning.

1. **Exact unit balance numbers** — resolved by the tuning pass, not by specification (R4).
2. **Map layout and ore-node placement/count** — plan-level; directly sets match length, so expect iteration.
3. **Final sprite id selection** from the 48 available — implementation-level; the roster is already fixed by *role*. Observed candidates: infantry `scifiUnit_01–04`, vehicles `05–09`, tank `11`, worker `12`; structures `scifiStructure_01` (Base), `_05` (Factory).
4. ~~**Project name**~~ — **RESOLVED 2026-08-21: "Ten Minute War".** Renamed from "8 Bit RTS", which promised pixel art the sprites do not deliver. The new name states the differentiator research identified: the vacant niche is session length, not genre.
5. **Audio scope** beyond the two functional cues.

**Two design decisions the plan must resolve concretely:** the canonical **state-hash
definition** (field order, entity ordering, exact float bits) and the **replay-corpus
format**. Both must exist before the first bug fix, or Constitution §IV is unmeetable
in practice.
