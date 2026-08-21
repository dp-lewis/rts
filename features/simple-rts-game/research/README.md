# Research Index: Simple RTS Game (Ten Minute War)

> Generated: 2026-08-21 · Feature: `simple-rts-game`
> Input richness: **6/8** · Interview mode: **CONFIRM**
> Dimensions run: competitors ✅ · UX/UI ✅ · codebase ✅ · tech-stack ✅ · metrics ✅
> *(tech-stack and metrics were opted in over config defaults because H3 and H4 depend on them)*
> Prior lessons: **no prior lessons log yet** (`.product-forge/lessons.md` absent)

## Executive Summary

All four Phase 0 hypotheses survived research, but two of them changed shape in
ways that matter. **H1 holds with a correction:** the browser RTS space is
populated, not empty — what is genuinely vacant is the *short session*, because
every credible competitor competes on scale, persistence, and multiplayer.
**H3 is confirmed and the cost is far lower than feared:** JavaScript doubles are
deterministic for arithmetic and `Math.sqrt`; only transcendental functions
(`sin`/`cos`/`atan2`/`pow`/`log`) are implementation-dependent — so determinism
costs a lint rule and a squared-distance habit, **not a fixed-point math library**.

The most useful single datapoint came from a competitor: **Littlewargame ships
with gold as its only resource, and reviewers cite that reduction as a virtue.**
That is independent empirical support for H2 from a game that actually shipped.

The dominant *risk* finding is that our real competitor is not StarCraft but the
territory-control `.io` game — instantly legible, strategically thin — and, for
the target player, doing nothing at all. Combined with the rule that most players
quit inside ten minutes, this yields the central design constraint: **in a
ten-minute game, the first-run experience and the game are the same thing.**

## Key Findings

| Dimension | Top insight |
|---|---|
| 🏆 Competitors | **H1 confirmed with a correction** — browser RTS is contested at the *large/multiplayer* end and vacant at the *short/finishable* end. Littlewargame's single-resource design independently validates H2. |
| 🎨 UX/UI | **H2 supported.** In a 10-minute game there is no "later" in which to teach — every mechanic must be immediately legible or cut. Auto-gather, no fog, flat build bar, rematch-first result screen. |
| 🔧 Codebase | **Greenfield — zero reusable code.** The constitution is the only pre-existing fact, and it is unusually binding: 2 of 5 principles are NON-NEGOTIABLE and dictate architecture before a line is written. |
| 🔒 Constraints | **Phaser's idiomatic `update(time, delta)` loop is constitutionally unusable for simulation** (§I forbids frame-delta time in sim). An accumulator must step whole fixed ticks. This departs from every Phaser tutorial and will be "fixed" back by habit unless written down. |
| 📦 Tech Stack | **H3 confirmed.** `+ - * /` and `Math.sqrt` are IEEE-required correctly-rounded; transcendentals are not. Ban them in sim via lint. Runtime dependencies: **Phaser alone** — PRNG, A\*, and state hash are ~50 vendored lines, satisfying §V. |
| 📊 Metrics | **H4 supported as a principle, unverifiable as stated.** No external benchmark exists for time-to-first-action, and mobile retention benchmarks do not transfer to a no-install browser game. Nothing is instrumented (`telemetry.*: none`). |

## Research Documents

| Document | Status | Key insight |
|---|---|---|
| [competitors.md](./competitors.md) | ✅ | Short, finishable matches are the white space; every competitor leads with multiplayer, making our single-player choice a knowing trade-off — retention weakness, cold-start strength. |
| [ux-patterns.md](./ux-patterns.md) | ✅ | Map the first five minutes step by step and delete every mechanic not on that path. Tutorial-before-play is fatal at this session length. |
| [codebase-analysis.md](./codebase-analysis.md) | ✅ | 13 binding constitutional constraints extracted. Sim/presentation separation (§II) is the load-bearing one — §I is only testable and §IV only affordable because of it. |
| [tech-stack.md](./tech-stack.md) | ✅ Optional | Phaser 4.1.0 stable since Apr 2026, effectively WebGL-only. Determinism needs a lint rule, not fixed-point math. |
| [metrics-roi.md](./metrics-roi.md) | ✅ Optional | No revenue model and no valid external benchmarks; measure against ourselves. The comprehension playtest is the *only* proposed check on the "fun" goal. |
| [assets.md](./assets.md) | ✅ Addendum | Kenney RTS Sci-Fi pack (CC0) added to the repo mid-session: 48 units / 16 structures / 42 tiles, uniform **64×64**. Settles art direction and hands the sim a natural grid module. |

## Synthesis: Recommended Approach

Open the player directly into a live match — no menu, no account, no tutorial —
with the base placed, workers already auto-gathering, and the enemy base visible
from the first frame. Hold the design to one resource, a flat roster of roughly
three units, and no fog of war, keeping the entire strategic surface legible
inside the first minute, and use the universal RTS control grammar unchanged.
Build the determinism harness first — fixed-tick accumulator, command queue,
vendored seeded PRNG whose state lives inside sim state, canonical state hash, and
replay runner — behind a lint-enforced boundary that forbids the sim directory
from importing Phaser or calling `Math.random`, `Date.now`, or any transcendental.
Guarantee the match ends inside the session budget with an explicit pressure
valve, and land on a result screen whose primary action is *Rematch*. Prioritise,
in order: the sim/presentation boundary, the determinism harness, the legible
first minute, and only then any strategic depth.

## Open Questions for Product Spec

1. **What is the match-length pressure valve** — finite resource nodes, escalating AI, or a soft timer? It affects sim design directly and no competitor pattern settles it.
2. **Are the three units a rock-paper-scissors triangle or a cost/power ladder?** The former adds depth at real comprehension cost. H2 does not resolve this.
3. **Is there any tutorialisation at all**, or does legibility carry the entire load?
4. **Difficulty selection at cold start, or one beatable default?** A selection screen costs seconds from the 30-second budget; an unbeatable default costs the player entirely.
5. **How is anything measured?** With `telemetry.*: none` and no backend, is v1 local counters + playtest observation (recommended), or is an analytics dependency justified against §V?
6. **Is "share this match seed / replay" surfaced as a player-facing feature?** The machinery is constitutionally mandatory anyway; exposing it is differentiation obtained nearly free. Speculative — spec's call.

## Red Flags / Risks Identified

| # | Risk | Severity | Notes |
|---|---|---|---|
| **RF-1** | **"Supported platforms" is undefined in the constitution.** §I promises bit-identical hashes "on every supported platform" — an unfalsifiable claim until that set is named, and a single-runner CI cannot test it. | **High** | **Top unresolved constitutional obligation.** Must be settled in `plan.md`. Recommend narrowing to the CI matrix (Node LTS on Linux + macOS). |
| **RF-2** | **A\* tie-breaking is the most likely determinism bug in the project.** Path output depends on open-set ordering; ties broken by insertion accident diverge silently. | **High** | Needs a stable tie-break rule (entity id) and a dedicated test. |
| **RF-3** | **Phaser's `update(time, delta)` idiom actively fights §I.** Habit and every tutorial pull toward frame-delta simulation. | Medium | Mitigate with lint + an explicit plan note, not vigilance. |
| **RF-4** | **The "fun" goal has exactly one proposed check, and it is manual.** Machine-checkable criteria will crowd it out (this is R4 from Phase 0, now concrete). | Medium | The comprehension playtest needs a protected slot in the plan or it will not happen. |
| **RF-5** | **Single-player-only forgoes the retention mechanism the entire category relies on.** Every competitor leads with multiplayer. | Medium | Defensible for v1 and a cold-start advantage — but should be a recorded decision, not an oversight. |
| **RF-6** | **WebGL-unsupported is now a reachable failure state** (Phaser 4 deprecated Canvas). | Low | Needs an honest fallback message; cheap to handle, ugly if missed. |
| **RF-7** | **Nothing is instrumented and no external benchmark applies.** Most published games metrics come from installed mobile apps with funnels we do not have. | Low | Measure against ourselves; do not import mobile D1 targets. |

## Sources

Full source lists are at the foot of each dimension document. Principal
references: Phaser 4 release/migration notes (phaser.io, Apr–May 2026); IEEE 754
/ ECMAScript determinism analysis (gamedev.net, deterministic.js.org,
developers.rune.ai); Littlewargame, BrowserRTS, Honest War, `cncjs`, C&C HTML5;
game-onboarding UX literature (Celia Hodent, UX Collective, Game Wisdom);
GameAnalytics / Countly / Segwise metrics benchmarks.
