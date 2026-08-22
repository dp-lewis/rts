# Implementation Plan: Ten Minute War

**Branch**: `spec/simple-rts-game` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `features/simple-rts-game/spec.md`

---

## Summary

Build a deterministic, fixed-timestep RTS simulation that runs headless under plain
Node, and a Phaser 4 presentation layer that reads it and never writes to it. The
simulation is the product's hard part; the game is a thin, legible surface over it.

The build order is deliberately inverted from instinct: **the enforcement mechanisms
and the determinism harness come first**, before any gameplay. Lint boundaries, the
tick loop, the seeded PRNG, the state hash, and the replay runner are the foundation,
because Constitution §I and §II cannot be retrofitted and §IV is unmeetable without
the harness existing before the first bug fix.

---

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js LTS (22.x), ES2022 modules

**Primary Dependencies**: **Phaser 4.1.0 — the only runtime dependency.** Dev only:
Vite, Vitest, ESLint (+ `@typescript-eslint`), Playwright, `@axe-core/playwright`.

**Storage**: None. No database, no backend, no network (explicit v1 non-goals). Two
file-shaped artifacts: the replay corpus (committed test fixtures) and local
in-memory counters.

**Testing**: Vitest for headless simulation unit and integration tests; the replay
corpus runner inside the same suite; Playwright for the three DOM surfaces and the
nine E2E scenarios; `@axe-core/playwright` for the WCAG-AA floor (`a11y_gate: axe`).

**Target Platform**: Desktop browsers with WebGL (Phaser 4 deprecated Canvas). The
**determinism guarantee** covers Node LTS on `ubuntu-latest` and `macos-latest` plus
Chromium — the set enumerated in Constitution §I v1.1.0.

**Project Type**: Single-project browser game. Not a monorepo — see Structure Decision.

**Performance Goals**: First render < 3 s on a mid-tier laptop. Stable frame rate at
~60 simultaneous units. Simulation at **20 Hz** (50 ms tick).

**Constraints**: No transcendental math in simulation. No wall-clock or frame-delta
time in simulation. No unordered iteration anywhere in simulation. Simulation must not
import Phaser or touch the DOM.

**Scale/Scope**: One fixed-screen map (~20×11 tiles at 64 px). 4 unit types, 2
structure types, 1 resource, 3 difficulty levels, 3 screens. A 10-minute match is
~12,000 ticks.

### Why TypeScript

Not a reflex. The core risk in this codebase is the simulation/presentation boundary
and the exact shape of simulation state — both are precisely what a type system makes
checkable, and `tsc` catches boundary violations that lint rules would miss (e.g. a
sim function accepting a Phaser object structurally). Phaser 4 ships its own types.
The cost is a build step Vite provides anyway. Recorded as a considered decision under
Constitution §V, not an assumed default.

### Simulation tick rate: 20 Hz

Fast enough that interpolated rendering feels responsive, slow enough that a
10-minute match is ~12,000 ticks — a tractable size for replay corpus files and CI
runtime. RTS simulations conventionally run 10–25 Hz for exactly this reason.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Each gate maps to a principle in `.specify/memory/constitution.md` (**v1.1.0**).

### Gate 1 — before research (retrospective; research completed in Phase 1)

| Principle | Verdict | Justification |
|---|---|---|
| I. Deterministic Simulation Core | ✅ PASS | Research explicitly tested feasibility (H3) and established that plain IEEE-754 doubles suffice provided transcendentals are excluded. No fixed-point library needed. |
| II. Simulation–Presentation Separation | ✅ PASS | Research identified this as the load-bearing principle and recommended physical, lint-enforced separation over convention. |
| III. Test-First Development | ✅ PASS | Research recorded that test tasks are never optional here and that simulation must be state-asserted headless. |
| IV. Replay-Verified Regression | ✅ PASS | Research flagged that the corpus format must exist before the first defect fix; this plan defines it ([ADR-002](./plan/adr/ADR-002-replay-corpus.md)). |
| V. Simplicity and YAGNI | ✅ PASS | Research recommended vendoring ~50 lines (PRNG, A\*, hash) over packages, and argued against a monorepo. |

### Gate 2 — after design (this plan)

| Principle | Verdict | Justification |
|---|---|---|
| **I. Deterministic Simulation Core** | ✅ PASS | Fixed 20 Hz tick; `step(state, commands) → state` is pure. PRNG state lives inside simulation state. Transcendentals, `Date.now`, `performance.now`, `Math.random` banned by lint in `src/sim/`. **Seven ordering hazards identified and each given an explicit rule** (see Ordering Audit). Hash defined in [ADR-001](./plan/adr/ADR-001-canonical-state-hash.md); verified across all three supported platforms in CI. |
| **II. Simulation–Presentation Separation** | ✅ PASS | `src/sim/` is forbidden by ESLint from importing Phaser, the DOM, or `src/game/`. Dependency arrow is one-way and machine-checked. Player intent enters only as commands scheduled to a future tick. Simulation runs headless under plain Node (TC-INT-003). |
| **III. Test-First Development** | ✅ PASS | Every milestone lists its test tasks before implementation tasks. Phase 6's red gate is treated as constitutionally required, not optional. Simulation coverage target ≥90%, asserted on state rather than rendered output. |
| **IV. Replay-Verified Regression** | ✅ PASS | Corpus format, runner, checkpoints, and a deliberately manual regeneration procedure defined in [ADR-002](./plan/adr/ADR-002-replay-corpus.md). CI replays the full corpus on every run across three platforms. The harness ships in **M1**, before any gameplay exists. |
| **V. Simplicity and YAGNI** | ✅ PASS | One runtime dependency. PRNG, A\*, and hash are vendored (~50 lines total). Single package, not a monorepo. One map, defined as data with no map system. **Complexity Tracking is empty.** |

**Result: 5/5 PASS at both gates. Zero accepted violations.**

> That the Complexity Tracking table below is empty is itself a finding worth
> preserving. Four phases in, nothing has required a justified deviation. Every
> future entry will therefore stand out as a deliberate decision rather than
> disappear into accumulated drift.

---

## Ordering Audit

> **Discharging bridge-gate obligation 4.** The gate predicted a fourth
> unspecified-ordering determinism defect after FR-021, FR-022, and FR-027.
> **The prediction was correct, and there are three more, not one.**

Constitution §I forbids "iteration over collections with unspecified order". In
practice that principle bites wherever the simulation picks *the* something —
nearest, first, best — or resolves two things happening on the same tick. Every such
site is a divergence waiting to happen, and each needs a rule written before the code
is.

| # | Site | Hazard | Rule | Status |
|---|------|--------|------|--------|
| O-1 | Target acquisition | Two enemies equidistant and in range | Lowest entity id wins | **FR-021** (in spec) |
| O-2 | A\* open set | Two nodes of equal `f` cost | Tie by lowest cell index, then lowest entity id | **FR-022** (in spec) |
| O-3 | Ore node selection | Two nodes equidistant from a worker | Least squared distance, ties by lowest node id | **FR-027** (in spec) |
| **O-4** | **Command application within a tick** | Player and AI commands both land on tick T; applying them in arrival order is non-deterministic across runs | **Sort by `(issuer, seq)` before applying**, `issuer` being a fixed enum (`player` < `ai`), `seq` a per-issuer monotonic counter | 🆕 **NEW — this plan** |
| **O-5** | **Production completion vs. insufficient ore** | Two Factories complete on tick T; ore covers only one | **Resolve in ascending factory-entity-id order**; the later one stays queued rather than failing | 🆕 **NEW — this plan** |
| **O-6** | **Simultaneous lethal damage** | A and B kill each other on tick T; whether either gets to fire depends on iteration order | **Damage is collected for the whole tick, then applied atomically at end of tick.** Both die. Generalises FR-028's Draw rule from Bases to all entities | 🆕 **NEW — this plan** |
| **O-7** | **Entity iteration in the tick function** | The root of the class — any traversal of entities during `step()` | **Entities are stored in an array kept sorted by id**; traversal is index order. Never `Map`/`Set`/object-key iteration in `src/sim/` | 🆕 **NEW — this plan** |

**O-7 is the general case and the other six are instances of it.** Fixing O-7
structurally — one sorted array, one traversal order, enforced by lint against
`for...in` and bare `Map`/`Set` iteration in `src/sim/` — removes the whole class
rather than playing whack-a-mole with each site.

**O-6 deserves emphasis.** Collecting damage across the tick and applying it
atomically at the end is not merely a determinism fix; it changes observable
gameplay. Mutual destruction becomes possible and correct, which is what makes
FR-028's Draw verdict reachable rather than theoretical. Applying damage immediately
would make the first-iterated unit win, silently, based on array position.

> **These four are design decisions implementing an already-locked NFR (Constitution
> §I), not new requirements.** No spec amendment is needed — §I already demands
> deterministic ordering; this plan specifies *how*. They are recorded here so that
> `tasks` can create a test for each, and so a reviewer can check them.

---

## Project Structure

### Documentation (this feature)

```text
features/simple-rts-game/
├── spec.md                    # Phase 4 — the SpecKit spec
├── plan.md                    # This file
├── plan/
│   ├── digest.md              # Phase digest
│   └── adr/
│       ├── ADR-001-canonical-state-hash.md
│       └── ADR-002-replay-corpus.md
├── product-spec/              # Phase 2 — LOCKED
├── research/                  # Phase 1
├── problem-discovery/         # Phase 0
├── specs/{simulation,gameplay,interface}/spec.md   # delta specs
├── contracts/README.md        # not applicable, and why
├── review.md · traceability.yml · .forge-status.yml
```

### Source Code (repository root)

Single project. **Not** a monorepo, and not a web-app split — there is no backend.

```text
├── index.html
├── package.json               # exactly ONE runtime dependency: phaser
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js           # ← enforces Constitution §I and §II at build time
├── .github/workflows/ci.yml   # ← 3-platform matrix, replays the corpus every run
│
├── src/
│   ├── sim/                   # ★ NO Phaser. NO DOM. Headless. Pure.
│   │   ├── version.ts         #   simVersion integer — bumped by hand (ADR-002)
│   │   ├── state.ts           #   SimState shapes; entities as an id-sorted array
│   │   ├── constants.ts       #   TICK_HZ, costs, speeds, hp — the tuning surface
│   │   ├── rng.ts             #   vendored mulberry32; state lives IN SimState
│   │   ├── hash.ts            #   canonical state hash (ADR-001)
│   │   ├── commands.ts        #   command types + (issuer, seq) ordering — O-4
│   │   ├── step.ts            #   the pure tick function; orchestrates systems
│   │   ├── grid.ts            #   64px tile grid, passability
│   │   ├── pathfind.ts        #   A* with stable tie-break — O-2
│   │   ├── economy.ts         #   ore nodes, worker gather loop — O-3
│   │   ├── production.ts      #   build queue, placement validation — O-5
│   │   ├── combat.ts          #   acquisition O-1, atomic end-of-tick damage O-6
│   │   ├── victory.ts         #   win / lose / draw resolution (FR-017, FR-028)
│   │   ├── ai.ts              #   deterministic opponent; emits commands, uses sim RNG
│   │   └── replay.ts          #   command-log record + playback
│   │
│   ├── game/                  # ★ Phaser 4 presentation. Reads sim, never writes it.
│   │   ├── main.ts            #   Phaser boot
│   │   ├── loop.ts            #   accumulator: whole ticks only; alpha to renderer
│   │   ├── scenes/{Gate,Match,Result}.ts
│   │   ├── render/            #   sprite layers, interpolation, underglow ring (FR-018)
│   │   ├── input/             #   drag-select O-7-safe, right-click, placement ghost
│   │   └── hud/               #   ore counter, 5-entry build bar, alert band, counters
│   │
│   └── assets/                # sprite key map → images/PNG/... (Kenney, CC0)
│
├── tests/
│   ├── sim/                   # headless unit tests, state assertions
│   ├── replay/
│   │   ├── run-corpus.ts      #   the corpus runner
│   │   └── corpus/            #   NNN-slug.json — one file per fixed defect
│   └── e2e/                   # Playwright: 9 scenarios + axe floor
│
└── images/                    # Kenney RTS Sci-Fi pack (CC0) — already committed
```

**Structure Decision.** A single package with a hard, lint-enforced internal boundary
between `src/sim/` and `src/game/`. Constitution §V argues against a workspace for a
solo browser game, and §II's requirement is about the *dependency arrow*, not about
package boundaries — a lint rule enforces it just as strictly as a package would, at a
fraction of the ceremony. If it proves insufficient, promoting `src/sim/` to its own
package later is mechanical.

---

## Architecture

### The loop (and why it looks unusual)

```ts
// src/game/loop.ts — presentation layer
update(_time: number, delta: number) {          // Phaser hands us wall-clock delta
  this.accumulator += delta;                     // ...used ONLY to count whole ticks
  let steps = 0;
  while (this.accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
    const due = this.queue.drain(this.sim.tick);       // commands FOR this tick
    this.sim = step(this.sim, due);                    // pure; never sees `delta`
    this.accumulator -= TICK_MS;
    steps++;
  }
  this.renderer.draw(this.sim, this.accumulator / TICK_MS);  // alpha = interpolation only
}
```

> **Corrected 2026-08-22 (code review REV-009).** This sketch originally drained
> `this.sim.tick + 1`. That is wrong and M5 inherited the bug from it: `applyCommands`
> skips any command whose `tick !== state.tick`, and `step` applies commands *before*
> advancing the tick, so draining ahead hands `step` commands it is guaranteed to skip
> — while `drain` has already removed them from the queue. Every player order would be
> silently discarded. Commands are drained **for the current tick**; the one-tick
> latency comes from `issue()` scheduling at `tick + 1`, not from the drain.

**`delta` never crosses into `step()`.** It decides *how many* whole ticks to run and
nothing else; the simulation is a pure function of `(previous state, commands for this
tick)`. `MAX_STEPS_PER_FRAME` guards the spiral of death — under load the simulation
falls behind wall-clock time, which is correct and does not change results.

**Background-tab policy** *(pre-impl F-4)*: the accumulator is additionally **clamped
to ~250 ms with the excess dropped**. Browsers suspend `requestAnimationFrame` in
background tabs, so a player returning after five minutes would otherwise watch the
simulation fast-forward through the match they just lost. In single-player, wall-clock
time carries no meaning — the simulation is authoritative and simply continues. A
presentation decision; it does not touch determinism.

> **This departs from every Phaser tutorial**, all of which pass `delta` into game
> logic. RF-3 identified that habit as an active hazard. The lint rule banning
> frame-delta in `src/sim/` is what makes the departure stick; a comment would not.

### Command flow

```
input handler → Command{type, tick: sim.tick + LATENCY, issuer: 'player', seq: n++}
                                    ↓
                              CommandQueue
                                    ↓
        drain(tick) → sort by (issuer, seq)  ← O-4
                                    ↓
   step(state, commands) ──→ new SimState ──→ renderer reads it
              ↑
        ai.ts emits Commands too — same queue, same ordering
```

`LATENCY` is `1` tick in single-player. It is not zero, deliberately: commands must
schedule to a *future* tick per Constitution §II, and this is the exact seam a
multiplayer feature would widen. Keeping it structural now costs nothing.

### Tick pipeline (order is fixed and is part of the contract)

```
step(state, commands):
  1. apply commands        (sorted by issuer, seq)          — O-4
  2. ai.think()            (emits commands for tick+1; uses sim RNG)
  3. economy               (gather, deposit, deplete nodes)  — O-3
  4. production            (advance queues, spend ore)       — O-5
  5. movement              (pathfind + step positions)       — O-2
  6. combat.acquire()      (choose targets)                  — O-1
  7. combat.collectDamage()(accumulate, do NOT apply)
  8. combat.applyDamage()  (atomic, end of tick)             — O-6
  9. victory.resolve()     (win / lose / draw; sudden death)               — FR-017, FR-028
 10. tick += 1
```

All entity traversal within these steps is index order over the id-sorted array (O-7).

### Data model (simulation state)

```ts
interface SimState {
  tick: number;
  rng: number;                    // mulberry32 state — inside state, not a singleton
  difficulty: 0 | 1 | 2;          // FR-029: a field, not encoded into the seed
  verdict: 0 | 1 | 2 | 3;         // none | victory | defeat | draw
  players: [PlayerState, PlayerState];   // fixed length; index IS player id
  nodes: OreNode[];               // sorted by id, ascending
  entities: Entity[];             // sorted by id, ascending — O-7
  nextEntityId: number;
}
interface Entity {
  id: number; kind: Kind; owner: 0 | 1;
  x: number; y: number;           // world px, doubles — hashed as exact bits
  hp: number; state: EntityState;
  targetId: number;               // -1 = none, never null
  cooldown: number; progress: number;
}
```

Design notes that matter for determinism: **fixed-length arrays and sentinel values
rather than optionals** (`targetId: -1`, not `null | number`) keep the hash encoding
uniform and remove a branch. Player id *is* the array index, so there is no player
lookup and therefore no player-ordering hazard.

Persistence: none. Serialisation exists only for the replay corpus and the hash.

---

## Enforcement (the part that makes the constitution real)

`eslint.config.js`, scoped to `src/sim/**`:

| Rule | Bans | Enforces |
|---|---|---|
| `no-restricted-imports` | `phaser`, `src/game/*`, any DOM lib | §II layering |
| `no-restricted-globals` | `Date`, `performance`, `window`, `document`, `navigator` | §I no wall-clock |
| `no-restricted-properties` | `Math.random`, `Math.sin/cos/tan/atan2/asin/acos/log/exp/pow` | §I no transcendentals, no ambient randomness |
| `no-restricted-syntax` | `ForInStatement`, `for...of` over `Map`/`Set` | §I no unordered iteration — O-7 |

**This is roughly twenty lines of configuration and it is the highest-leverage code in
the project.** It converts two NON-NEGOTIABLE principles from review-time vigilance
into build-time failure. Written in M0, before any simulation code exists.

CI (`ubuntu-latest` + `macos-latest`, Node LTS; plus Chromium via Playwright):
lint → typecheck → unit tests → **replay corpus** → build → E2E + axe. The corpus step
compares hashes across the matrix; divergence fails the build (§IV).

---

## Milestones

Test tasks precede implementation tasks throughout (Constitution §III).

| # | Milestone | Contents | Exit criterion |
|---|-----------|----------|----------------|
| **M0** | **Enforcement skeleton** | `package.json`, TS, Vite, Vitest, **eslint boundary rules**, CI matrix, empty `src/sim` + `src/game` | Lint fails on a deliberately planted `Math.random()` in `src/sim/`. CI green on all 3 platforms. |
| **M1** | **Determinism harness** | `rng`, `hash` (ADR-001), `commands` + ordering, `step` skeleton, `replay` + corpus runner (ADR-002), `simVersion` | Same seed + log ⇒ identical hash on all 3 platforms. Corpus runner green with 1 trivial case. TC-UNIT-001/002, TC-INT-001/003. |
| **M2** | **Grid, movement, economy** | `grid`, `pathfind` (O-2), `economy` (O-3), worker gather loop | Headless: workers gather, nodes deplete, ore rises. Tie-break tests TC-UNIT-003/004 pass. |
| **M3** | **Production & combat** | `production` (O-5), `combat` (O-1, O-6 atomic damage), `victory` (draw + **sudden death, CR-001**) | Headless full match runs to a verdict. TC-UNIT-005/006/007/008/011/012 pass. **A deliberate stalemate scenario terminates in bounded ticks.** |
| **M4** | **AI opponent** | `ai.ts`, 3 difficulty levels, deterministic via sim RNG | Headless AI-vs-AI match completes identically across runs and platforms. |
| **M5** | **Presentation** | Phaser boot, accumulator loop, sprite render, interpolation, underglow ring | A match is watchable. Lint still reports zero boundary violations. |
| **M6** | **Input & HUD** | drag-select (FR-030 circles), right-click orders, 5-entry build bar, placement ghost, ore counter, alert band | JRN-001 playable end to end by hand. |
| **M7** | **Screens & edges** | Difficulty gate, result screen (victory/defeat/draw), rematch, WebGL fallback, keyboard operability, local counters | All 9 E2E scenarios pass; axe reports zero critical violations. |
| **M8** | **Balance tuning pass** ⏱ | Tune `constants.ts`: unit costs/speed/hp, ore per node, node count, AI aggression, **sudden-death grace and damage ramp (CR-001)**. Also tune toward a **legibility** ceiling of ~25–30 units per side rather than the ~60 performance allows *(pre-impl F-5)* | **Median match duration lands in 6–10 min; p90 < 15 min.** Timeboxed. |
| **M9** | **K1 comprehension playtest** 🚦 | 3–5 first-time players, cold, unaided, observed | **≥4 of 5 understand what to do without being told**, AND **≥3 of 5 win at least one match on "New to this"** *(pre-impl F-3 — comprehension alone does not prove the game is beatable)*. Blocking. |

### Requirement coverage by milestone

Every `FR-*` from [spec.md](../spec.md) maps to exactly one owning milestone. This is
the handle `tasks` uses to generate work and `verify-full` uses to check coverage —
without it, milestones describe features by name and nothing machine-checks that all
31 requirements landed somewhere.

| Milestone | Requirements owned |
|---|---|
| **M1** Determinism harness | FR-003, FR-004, FR-005, FR-029 |
| **M2** Grid, movement, economy | FR-006, FR-016, FR-022, FR-027 |
| **M3** Production & combat | FR-012 *(rules)*, FR-017, FR-020, FR-021, FR-028, FR-031, **FR-032** *(CR-001)* |
| **M4** AI opponent | *(no new FRs — implements difficulty behaviour behind FR-002/FR-029)* |
| **M5** Presentation | FR-014, FR-015, FR-018 |
| **M6** Input & HUD | FR-007, FR-008, FR-009, FR-010, FR-011, FR-012 *(placement UX)*, FR-013, FR-030 |
| **M7** Screens & edges | FR-001, FR-002, FR-019, FR-023, FR-024, FR-025, FR-026, **FR-033** *(CR-001)* |
| **M8** Balance tuning | *(no FRs — tunes `constants.ts` against the FR-008/US-008 duration band)* |
| **M9** Comprehension playtest | *(no FRs — validates the whole against success criterion K1)* |

**Coverage: 33/33** (31 original + FR-032/FR-033 from CR-001). FR-012 is split deliberately — the placement *rules* (what is
legal) belong to the simulation in M3, and the placement *interaction* (ghost preview,
click) belongs to presentation in M6. Splitting it across the §II boundary is the
correct decomposition, not a duplication.

### M8 and M9 are scheduled work, not polish

> **Discharging bridge-gate obligation 3.** RF-4 warned that "fun" cannot be verified
> by the traceability chain, and that the six machine-checkable success criteria would
> crowd out the one human criterion unless it was protected.
>
> M8 and M9 are therefore **numbered milestones with exit criteria**, identical in
> standing to M0–M7. M9 **blocks completion**: a build that passes every test and
> fails M9 has failed. This is the only mechanism preventing the project from
> shipping something provably correct and unenjoyable.
>
> `constants.ts` exists as a single file precisely so M8 has one surface to tune.
> Balance numbers are deliberately absent from the spec — feel is tuned by playing,
> not specified by writing.

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | — | — |

**Deliberately empty.** Five phases in, the design has required no justified deviation
from the constitution. One runtime dependency, one package, vendored primitives, one
map with no map system. Any future entry should be read as a real decision, and should
be argued for rather than assumed.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Cross-platform float divergence appears in M1** | High | Expected and *wanted* — exact-bit hashing exists to surface it. Fix the divergence; **never loosen the hash** (ADR-001). Surfacing it in M1, before gameplay, is the cheapest possible time. |
| **Corpus hashes go stale on intentional behaviour changes** | High | `simVersion` + manual `corpus:regen` + PR-visible hash diffs (ADR-002). Auto-update is explicitly rejected. |
| **O-4…O-7 ordering bugs slip through** | High | Each has a dedicated unit test; O-7 is additionally enforced by lint syntax rules. Expect more sites as gameplay grows — audit any new "pick the nearest/first/best". |
| **Phaser `delta` leaks into sim by habit** (RF-3) | High | Lint ban + the loop is isolated in one file (`loop.ts`) that is easy to review. |
| **M8 tuning runs unbounded** | Med | Timeboxed. Ship at "beatable and legible", not "perfectly balanced". |
| **M9 fails and the design must change** | Med | Better discovered at M9 than after launch. Most likely remedies are cheap: clearer first-frame framing, slower AI opening, larger build-bar affordances. A failure implicating fixed-single-screen would be expensive — that is the known bet. |
| **Fixed screen feels cramped (~20×11)** | Med | M9 decides. A scrolling map would be a change request, not a fix. |
| **CI corpus runtime grows** | Low | Full corpus in CI, fast subset pre-commit. **Never prune cases.** |
| **WebGL unavailable** (RF-6) | Low | FR-024 fallback, TC-E2E-004. |
| **F-2** Unit crowding illegible; collision unspecified | Med | **Decision: units do not collide in v1.** No separation system — A\* stays a pure grid search and determinism is preserved. Render-only visual jitter that never touches sim state. Whether the pile is legible becomes an explicit M9 question. *(A separation system would almost certainly be ordering hazard O-8.)* |
| **F-6** Worker wipeout soft-lock | Low | A Base with no surviving Workers affords one at zero cost. Small rule; removes a dead state in which a player can neither act nor lose. |

---

## Open Questions

Carried from the locked spec, all still deliberate:

1. **Unit balance numbers** — resolved in M8 by playing, not here.
2. **Map layout and ore-node placement/count** — the primary M8 tuning lever, since it sets match length most directly. Starting point: mirrored bases, 2 nodes per side.
3. **Final sprite ids** — chosen visually in M5 from the 48 available. Roster is fixed by role.
4. ~~Project name~~ — **resolved: Ten Minute War.**
5. **Audio scope** — M7 ships the two functional cues (FR-023). Anything further is post-v1.

Plus one raised by this plan:

6. **`mulberry32` or `sfc32`?** Both satisfy the constitution. `mulberry32` is simpler (32-bit state, one integer to serialise); `sfc32` has better statistical quality (128-bit state, four integers). **Recommendation: `mulberry32`** — a match needs a few thousand draws, not cryptographic quality, and a single-integer state is materially simpler to hash and serialise. Decide in M1.
