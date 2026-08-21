# Tech Stack Research: Simple Browser RTS

> Generated: 2026-08-21
> Tests hypothesis **H3** — "a deterministic fixed-timestep sim with seeded RNG and a command log is viable in Phaser 4 **without fixed-point math**."
> De-risks **R1** (the determinism mandate) from [problem-statement.md](../problem-discovery/problem-statement.md).

## Verdict on H3

**H3 is CONFIRMED, conditionally — and the condition is precise and cheap.**

JavaScript numbers are IEEE 754 doubles with well-defined semantics. The split
that matters is exact:

| Operation class | Determinism | Safe in sim? |
|---|---|---|
| `+ - * /`, comparison, `%` | IEEE 754 **requires** correct rounding | ✅ **Yes** |
| `Math.sqrt` | IEEE 754 **requires** correct rounding | ✅ **Yes** |
| `Math.sin/cos/tan/atan2/asin/acos/log/exp/pow` | IEEE 754 only **recommends** correct rounding → **implementation-dependent** | ❌ **No** |
| `Math.round/floor/ceil/abs/min/max` | Exactly specified | ✅ Yes |

> Transcendental functions are documented sources of non-determinism across
> browsers, and *even across OS/architecture for the same engine*. This is not a
> theoretical risk — it is the specific mechanism by which JS lockstep games break.

**So fixed-point arithmetic is not required.** Plain doubles are deterministic
provided the simulation never calls a transcendental. That is an easily-honoured
constraint for an RTS — and it is *enforceable by lint*, which converts a
discipline problem into a build-time error.

The two places an RTS naively reaches for transcendentals are both avoidable:

- **Distance checks** → compare *squared* distances (`dx*dx + dy*dy < r*r`). No `sqrt` at all, and faster. Where an actual length is needed, `Math.sqrt` is safe anyway.
- **Angles / rotation** → keep facing as an integer index into a fixed direction table (the classic sprite-RTS approach — C&C-era games did exactly this), or as a normalised vector updated by arithmetic. Never `Math.atan2` in sim. **Rotation for rendering is presentation-layer and may use whatever it likes** (Constitution §II makes this legal precisely because presentation cannot feed back).

This is the answer to R1: the determinism mandate costs us **a lint rule, a
squared-distance habit, and a direction table** — not a fixed-point math library.
That is a materially smaller bill than R1 assumed, and it should be recorded as
such.

## Sub-problems to Solve

### 1. Rendering / game framework

Already decided by project config (Phaser 4). Confirming its state:

- **Phaser 4.0 released 10 April 2026**; **stable v4.1.0 since 30 April 2026.** Mature enough to build on, new enough that third-party Phaser-4-specific plugins are scarce — assume you write your own.
- The **entire v3 WebGL pipeline was replaced** with a node-based render architecture: one responsibility per node, proper WebGL state management, graceful context-loss handling, and significantly faster.
- **Phaser 4 is effectively WebGL-only.** Canvas is deprecated; the new filter system, real-time lighting, `SpriteGPULayer` and `TilemapGPULayer` are WebGL-exclusive.

**Implications for us:**
- ✅ `SpriteGPULayer` is a strong fit for many small units — exactly our load profile.
- ⚠️ **A WebGL-unsupported path is now a reachable failure state.** Add it to the state inventory (done — see [ux-patterns.md](./ux-patterns.md)).
- ⚠️ Phaser's idiomatic `update(time, delta)` loop is **constitutionally unusable for simulation** (§I forbids frame-delta time in sim). Phaser drives an accumulator that steps the sim a whole number of fixed ticks; the sim never sees `delta`. This is a well-trodden pattern, but it is a deliberate departure from every Phaser tutorial and must be written down in the plan or it will be "fixed" back by habit.

### 2. Seeded PRNG

| Option | Notes | Verdict |
|---|---|---|
| **Vendored `mulberry32`** (~8 lines) | 32-bit state, fast, passes gjrand per its author. Trivially serialisable — the whole state is one integer. | ✅ **Recommended** |
| Vendored `sfc32` (~12 lines) | 128-bit state, very fast in JS, widely called the JS PRNG of choice. Better statistical quality; 4 integers of state. | ✅ Good alternative if quality matters |
| `rand-seed` (npm) | TS library; `sfc32` default, plus `mulberry32`, `xoshiro128**`. | ⚠️ A dependency for ~10 lines of code |
| `seedrandom` (David Bau) | The long-standing seeded-RNG library. | ⚠️ Heavier; more than we need |

**Recommendation: vendor `mulberry32` (or `sfc32`) directly.** Constitution §V
demands a *demonstrated present need* for every third-party dependency, and an
8-line function does not clear that bar. Vendoring also gives us what a library
cannot: the PRNG state lives **inside** simulation state and is serialised with
it, as §I requires. A module-level singleton RNG — which is how these libraries
are typically consumed — would actively violate the constitution.

### 3. Pathfinding

| Option | Fit | Verdict |
|---|---|---|
| **A\* on a grid** | Standard single-agent pathfinding; well understood; easy to make deterministic (fixed tie-breaking, sorted open set). Degrades with crowds. | ✅ **Recommended for v1** |
| **Flow field** | Designed for many agents to a shared destination — the canonical RTS crowd solution. One field serves N units. | ⏭ Consider if unit counts grow |
| npm pathfinding libs | Rarely document tie-breaking behaviour. | ❌ Determinism risk not worth it |

**Recommendation: hand-rolled A\* on a grid for v1.** At H2's scale (~3 unit
types, small single-screen map) crowd pathfinding is a solution to a problem we
have chosen not to have — §V rejects it as speculative. **Determinism caveat:**
A\*'s output depends on open-set ordering, so the priority queue must break ties
by a stable rule (e.g. entity id), never by insertion accident. This is the single
most likely source of a determinism bug in the whole project, and deserves a
dedicated test.

### 4. State hashing

No library needed. A canonical serialisation (fields in fixed order, entities in
stable-id order) fed to a small hash (FNV-1a or xxhash-style, ~15 lines).
**Design decision for the plan:** how floats enter the hash. Hashing raw float
bits is exact and correct — and will also catch genuine cross-platform divergence
rather than masking it, which is the point of §I. Rounding before hashing would
hide precisely the bugs the principle exists to detect. Recommend hashing exact
bits via `DataView`/`Float64Array`.

### 5. Test + build tooling

- **Vitest** — fast, ESM-native, runs the headless sim in plain Node with no DOM. Directly serves §II ("runnable headless") and §III (state-asserting tests).
- **Vite** — Phaser 4's natural dev/build pairing.
- **ESLint with `no-restricted-properties` / import boundaries** — the enforcement mechanism for §I and §II. Ban `Math.random`, `Date.now`, `performance.now`, and every transcendental inside the sim directory; ban Phaser imports there entirely. **This is the highest-leverage 20 lines of config in the project** — it converts two NON-NEGOTIABLE principles from review-time vigilance into build-time failure.
- **CI (GitHub Actions)** — required by §IV to replay the corpus every run. **Must be a matrix** (≥2 OS) or the "bit-identical on every supported platform" claim is untested. See the open question below.

## Final Recommendation Stack

| Need | Choice | Dependency? |
|---|---|---|
| Rendering / framework | Phaser 4 (v4.1.0+, WebGL) | dep (already decided) |
| Sim arithmetic | Plain IEEE-754 doubles, **no transcendentals** | none |
| Seeded RNG | Vendored `mulberry32`, state inside sim state | **none** |
| Pathfinding | Hand-rolled grid A\*, stable tie-breaking | **none** |
| State hash | Hand-rolled FNV-1a over canonical bytes | **none** |
| Determinism enforcement | ESLint restricted globals + import boundary | dev dep |
| Tests | Vitest (headless sim) | dev dep |
| E2E | Playwright (per config `e2e_runner`) + `@axe-core/playwright` (per `a11y_gate: axe`) | dev dep |
| Build | Vite | dev dep |

Runtime dependencies: **Phaser alone.** Everything the constitution demands is
built from ~50 lines of vendored code. That is a genuinely good outcome for §V,
and it means the licence audit in Phase 9 is trivial.

## Integration Notes

- Sim code sits in a directory that lint forbids from importing Phaser; Phaser code reads sim state and never writes it.
- The accumulator lives in the Phaser scene, stepping the sim by whole fixed ticks and passing an interpolation alpha to the renderer only. The sim never receives `delta`.
- Commands are queued from input handlers with an explicit target tick — even in single-player, where the delay could be zero — because §II requires it and because it is the seam multiplayer would later use.

## Open questions for the plan

- **What is the "supported platform" set for §I's bit-identical guarantee?** Recommend: Node LTS on `ubuntu-latest` + `macos-latest`, plus one browser engine. Left unbounded, the principle is unfalsifiable. **This is the top unresolved constitutional obligation.**
- Does the browser runtime participate in the hash-equality test, or is the guarantee scoped to the headless Node sim? (The sim is platform-independent by §II, so testing it headless across OSes is the affordable and meaningful check.)
- `mulberry32` (32-bit state, simplest) or `sfc32` (128-bit, better quality)? Both satisfy the constitution; this is a quality-vs-simplicity call for Phase 5.

## Sources

- https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know
- https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games
- https://phaser.io/news/2026/05/phaser-3-vs-phaser-4 · https://github.com/phaserjs/phaser/releases
- https://www.gamedev.net/forums/topic/609592-is-javascript-floating-point-math-deterministic/
- https://deterministic.js.org/ · https://developers.rune.ai/blog/making-js-deterministic-for-fun-and-glory
- https://www.4rknova.com/blog/2026/03/01/mulberry32-rng · https://www.npmjs.com/package/rand-seed · https://github.com/gre/seedrandom
- https://howtorts.github.io/2014/01/04/basic-flow-fields.html · https://www.jdxdev.com/blog/2020/05/03/flowfields/
- https://github.com/pietrobassi/deterministic-lockstep-demo
