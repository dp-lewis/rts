# Codebase Analysis: Simple Browser RTS

> Generated: 2026-08-21 · Codebase: `.` (project root)

## Architecture Overview

**There is no codebase.** This dimension is mandatory, but the repository is
greenfield — a single commit (`2ac8aa0 Initial commit`) containing a 5-byte
`README.md`, tooling directories (`.specify/`, `.product-forge/`, `.claude/`),
and no source, no `package.json`, no build config, no tests, no CI.

```
rts/
├── README.md            5 bytes — "# rts"
├── .specify/            SpecKit templates, scripts, constitution
├── .product-forge/      Product Forge config
└── .claude/             agent config
```

So this document cannot do what it normally does — find reusable code, reference
implementations, and integration points. **It has exactly one job instead: extract
the binding architectural constraints, because on a greenfield project those are
the only pre-existing facts, and they are unusually strong here.**

## Reusable Existing Code

| Component/Service | Location | How to Reuse |
|---|---|---|
| — | — | None. Greenfield. |

## Reference Implementations (Similar Features)

| Feature | Location | Key Pattern |
|---|---|---|
| — | — | None in-repo. External references are in [competitors.md](./competitors.md) (`cncjs`, C&C HTML5, 0 A.D.). |

## Integration Points

| Layer | Location | Change Type | Description |
|---|---|---|---|
| Everything | — | **New** | Every layer is new: build tooling, sim core, renderer, input, AI, test harness, CI. |

There are no integration points and therefore no integration risk. The
corresponding cost is that **every foundational decision is still open and will
be made in Phase 5** — there are no existing patterns to inherit or defer to.

## Codebase Constraints

> The project constitution (`.specify/memory/constitution.md`, v1.0.0, ratified
> 2026-08-21) is the *only* source of binding constraints, and it is
> exceptionally prescriptive for a greenfield game. Two of its five principles
> are marked **NON-NEGOTIABLE**. Phase 0 resolved the resulting tension in favour
> of **full compliance** (gate `problem_discovery`, condition R1).

| Constraint | Source | Impact on feature design |
|---|---|---|
| Simulation advances in **fixed-timestep ticks**; every state transition is a pure function of `(previous state, ordered commands for that tick)` and nothing else | Constitution §I | Rules out a variable-delta `update(dt)` loop — i.e. rules out the default Phaser idiom. Requires an accumulator loop decoupled from the render frame. |
| **Forbidden inside sim code:** wall-clock/frame-delta time, unseeded or ambient randomness, iteration over collections with unspecified order, any machine/locale/thread dependency | Constitution §I | No `Date.now()`, `performance.now()`, `Math.random()`. **No `for...in` over objects and no bare `Map`/`Set` iteration where insertion order is not provably identical across runs.** Entity iteration must be over an explicitly sorted, stable-id-ordered collection. |
| All randomness derives from a **seed carried inside simulation state** | Constitution §I | Requires a seeded PRNG whose state is part of the serialised sim state and advances only via sim calls — not a module-level singleton. See [tech-stack.md](./tech-stack.md). |
| Same seed + same command log ⇒ **bit-identical state hash on every supported platform**, proven by automated test | Constitution §I | Requires (a) a canonical state-hash function, (b) a defined set of "supported platforms" — **currently undefined and needed before Phase 5**, (c) a CI matrix that actually exercises more than one. A single-runner CI cannot verify a cross-platform claim. |
| Simulation MUST NOT depend on rendering, audio, input, windowing, or UI; presentation reads sim state and MUST NOT mutate it | Constitution §II | Hard module boundary. The sim package must not import Phaser at all. Enforceable by lint (import restrictions) rather than review — strongly recommended. |
| Player intent enters the sim **only as commands queued for a future tick** | Constitution §II | Input handlers may not mutate sim state. Mandates a command queue with explicit target-tick scheduling, even in single-player where no network delay exists. |
| Simulation MUST be runnable **headless**, with no graphics context, decoupled from real time | Constitution §II | The sim must run under plain Node with no DOM/canvas — this is what makes the determinism tests cheap. Drives a multi-package or clearly-separated-entry-point layout. |
| **Red-Green-Refactor mandatory and strictly ordered**; no production code merged without a test that fails in its absence | Constitution §III | Test tasks are **never optional** in `tasks.md`. Phase 6's `Test-first: true` red gate is constitutionally required here, not merely available. |
| Simulation logic covered by **headless tests asserting on state, not rendered output** | Constitution §III | Test strategy is state-hash and sim-assertion driven. Playwright E2E (Phase 8A/8B) covers presentation and journeys only — it cannot discharge this requirement. |
| Every fixed gameplay/sim defect lands with a **recorded command log + expected terminal state hash**, committed as a regression case | Constitution §IV | Needs a replay-corpus format and harness *before* the first bug fix, or the requirement is unmeetable in practice. Ongoing per-defect cost. |
| **CI replays the full corpus on every run**; any divergence fails the build | Constitution §IV | CI is a hard v1 deliverable, not a later nicety. Corpus runtime growth must be watched. |
| Abstractions, indirection, config points and third-party deps each require a **demonstrated present need**; speculative generality rejected | Constitution §V | Directly constrains dependency selection in [tech-stack.md](./tech-stack.md) — prefer a vendored 8-line PRNG over a package. Also argues against a monorepo/multi-package layout unless justified. |
| Genuine added complexity MUST be recorded in the plan's **Complexity Tracking** table with the simpler alternative named | Constitution §V | `plan.md` must carry this table. Phase 0 recorded zero accepted violations — the table starts empty and every later entry is a deliberate, visible decision. |
| Every `/speckit-plan` run MUST evaluate the Constitution Check gate **before Phase 0 research and again after Phase 1 design** | Constitution, Governance | Two explicit checkpoints inside Phase 5, not one. |

## Event / Message Patterns

**N/A — no EDA patterns detected.** No existing events, topics, or message
contracts. The sim's internal command queue is an application-level construct to
be designed in Phase 5, not an inherited pattern.

## Data Model Impact

No database in v1 scope (`scope.out_of_scope_v1`: Express, MongoDB). The only
persistent-shaped artifacts are **file-based**, and both are constitutionally
required:

- **Command log** — ordered commands with target ticks + initial seed. Must be serialisable, diffable, and committed as test fixtures.
- **State hash** — canonical digest of sim state at a given tick. Its exact definition (field order, float handling, precision) is a **determinism-critical design decision** and belongs in the plan, not in implementation.

No migrations. Phase 5.5 (Migration Plan) should resolve to `not_applicable`.

## Technical Complexity

- **Overall: High** — not because any single system is hard, but because the constitution mandates properties (bit-identical cross-platform determinism, replay-verified regression, headless sim) that are architecture-level and cannot be added later.
- **New modules:** simulation core, command/queue system, seeded PRNG, state hashing, replay harness, pathfinding, AI, renderer, input, HUD, build tooling, test infra, CI.
- **Breaking change risk:** None — nothing exists to break.
- **Estimated touch points:** entire repository (~all files new).

## Current Tech Capabilities

None. Every capability is to be established. The *only* inherited assets are the
constitution, the SpecKit/Product Forge tooling, and the declared intent to use
Phaser 4.

## Implementation Guidance

1. **Separate sim from presentation physically, not by convention.** The sim must live where it *cannot* import Phaser — enforced by build/lint config. Constitution §II is the load-bearing principle: §I is only testable because of it, and §IV only affordable because of it. If one thing is got right first, it is this boundary.
2. **Build the determinism harness before the game.** Tick loop, command queue, seeded PRNG, state hash, and replay runner are the foundation, and the constitution's Red-Green ordering (§III) means their tests come first. A replay corpus retrofitted after gameplay exists will not be trustworthy.
3. **Define "supported platforms" explicitly in `plan.md`.** §I promises bit-identical hashes "on every supported platform" — an unbounded claim until that set is named. Recommend narrowing it to the CI matrix (e.g. Node LTS on Linux + macOS) and stating it plainly. **This is currently the single largest unspecified obligation in the constitution and must not reach implementation unresolved.**
4. **Resist the monorepo reflex.** §V (YAGNI) argues against a multi-package workspace for a solo browser game. A single package with a hard-enforced internal boundary is the simpler thing that satisfies §II; if it proves insufficient, escalating is cheap.
