# Phase Digest — Implement

**Phase:** 6 · Implement · **Scope:** M0 Enforcement · M1 Determinism · M2 Grid/movement/economy · M3 Production/combat/victory · M4 AI opponent · M5 Presentation
**Date:** 2026-08-22 · **Tasks:** 56 / 82 complete
**Status:** M0–M5 complete · `SIM_VERSION` 7 · 266 tests green · a match is watchable in a browser

---

## Key decisions

- **The Red gate is per-milestone, not one upfront pass.** Chosen at the Phase 6 gate.
  The repo was empty, so the 27 `Test-first: true` tasks would all have failed on bare
  import errors — a vacuous Red. Instead T001/T002 scaffold the runner (pure INFRA, zero
  product code) and each milestone's test block must be seen failing before its
  implementation block runs.

- **The first Red was rejected and the test rewritten.** T003's initial draft failed with
  `ESLint returned no result`: with no config file ESLint matched nothing and returned an
  empty array. That Red would have gone green on an *empty* `eslint.config.js` — it was
  testing for the file's existence, not for the rules. The test now falls back to a
  parser-only, rule-free config, so the failure reads "expected a violation, got none"
  and only rules that genuinely fire turn it green. This is the single most important
  thing that happened in M0.

- **Fixtures are real files, linted under a synthetic path.** The five planted-violation
  fixtures live in `tests/lint/fixtures/` as type-checked TypeScript, but
  `boundary.test.ts` reads their source and lints it via `lintText` with a `filePath` of
  `src/sim/<name>.ts`. The `src/sim/**` rules apply; no violating byte lives in `src/`.
  The fixtures are also globally ignored by `eslint.config.js`, which is the second half
  of T006.

- **Map and Set are not banned in `src/sim/` — only their unordered iteration.** A* needs
  an open set. The hazard is the iteration order, not the container.

- **The M0 exit criterion is enforced in CI, not just witnessed once.** A dedicated CI
  step writes a `Math.random()` canary into `src/sim/`, asserts `npm run lint` *fails*,
  and removes it. A guard verified only on the day it was written is a guard that decays.

## Artifacts produced

| Path | Task |
|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | T001 |
| `vitest.config.ts`, `src/sim/.gitkeep`, `src/game/.gitkeep`, `tests/.gitkeep` | T002 |
| `tests/lint/boundary.test.ts`, `tests/lint/fixtures/{math-random,wall-clock,transcendental,unordered-iteration,phaser-import}.ts` | T003 |
| `eslint.config.js` | T004 |
| `.github/workflows/ci.yml` | T005 |
| `features/simple-rts-game/implementation-log.md`, `dependency-log.md` | phase |

10 dependencies added, all vetted, 0 warned, 0 blocked, 0 audit vulnerabilities.
Phaser 4.2.1 is the only runtime dependency.

## Open risks

1. **The Map/Set iteration guard is partial.** `for (const x of someMap)` on a Map-typed
   variable is not caught — a syntax selector has no type information. Covered downstream
   by the replay corpus (§IV). The escalation, if O-7 ever bites, is type-aware linting
   via `projectService`.
2. **No simulation code exists yet**, so the boundary rules have been proven against
   fixtures and a canary, never against real sim code under real pressure. M1 is the
   first honest test of whether they are livable.
3. **The matrix is green but has nothing to disagree about yet.** Run 32523481346 passed
   4/4 (ubuntu + macOS × Node 22 + 24), and each runner confirmed the boundary guard
   fires. But no simulation exists, so no hash has been compared across engines. The
   cross-platform half of §IV is unexercised until M1 lands the corpus.
4. **`index.html` has no entry script** until M5. `vite build` currently emits an HTML
   file and nothing else — the build step is real but shallow.
5. **CI matrix widened to 4 jobs** (2 OS × Node 22 and 24) beyond plan.md's wording.
   Costs CI minutes; buys the cross-engine agreement §IV depends on.

## Handoff notes

- **Code review should start at `eslint.config.js` and `tests/lint/boundary.test.ts`,
  read together.** Everything else in M0 is conventional toolchain configuration; those
  two files are the constitution made executable, and a weakness in either is invisible
  until a replay diverges months from now.
- **The M0 exit criterion is met on both halves and on all four runners** (CI 32523481346).
  What is *not* yet proven is cross-engine hash agreement — there are no hashes.
- The `no-restricted-*` rule arrays are exported as named consts specifically so a
  reviewer can diff intent against plan.md §Enforcement line by line.


---

# M1 — Determinism harness

## Key decisions

- **The vacuous Red was rejected a second time.** Eight new test files against a repo
  with no `src/sim/` produced bare `Cannot find module` errors and collected zero
  tests. Signature-only stubs — every export present, every body throwing — moved the
  failure to 43 collected tests failing on real calls. The side benefit was the real
  one: writing the stubs forced the entire M1 API surface to be settled before a line
  of logic existed, which is what test-first is actually for.

- **The hash covers `difficulty` and `nextEntityId`, which ADR-001's field list omits.**
  The ADR opens with "exactly the simulation state" and then lists fields that leave
  both out, and neither is presentational or derived — so neither is covered by the
  ADR's own exclusions. Treated as a drafting gap and implemented as a purely additive
  append after the ADR's six fields. **This is a proposed amendment awaiting a
  decision**, not a settled change; reverting is two lines plus one `corpus:regen`.

- **`move` commands are explicitly unhandled rather than silently defaulted.** The data
  model has no destination field, so a move order has nowhere to be recorded. Inventing
  `destX`/`destY` here would have added a hashed field ahead of the milestone that owns
  movement, staling every corpus hash recorded in between. The `case 'move':` sits there
  empty with a comment naming M2 — greppable, not forgotten.

- **The corpus runner has no `--update` flag, and adding one would be a mistake worth
  reverting.** It would convert Constitution IV from a regression guard into a rubber
  stamp. Regeneration lives in a separate script, refuses to touch cases at the current
  `simVersion`, and prints the hash diff for the pull request.

- **Stale and ahead are different failures with different messages.** A case from an
  older `simVersion` is regeneratable. A case from a *newer* one means the checkout is
  behind, and regenerating would overwrite a more current record with a staler one.
  Conflating them would send someone to destroy the thing they should have pulled.

- **`STAGES` is asserted in a test.** The tick order is part of the contract; pinning it
  makes a reordering a visible, deliberate diff rather than something that drifts while
  someone adds a system.

## Artifacts produced

| Path | Task |
|---|---|
| `tests/sim/{rng,hash,commands,determinism,headless}.test.ts`, `tests/replay/roundtrip.test.ts` | T007–T014 |
| `src/sim/{version,rng,state,constants,hash,commands,step,replay}.ts` | T015–T022 |
| `tests/replay/run-corpus.ts`, `tests/replay/corpus.test.ts` | T023 |
| `scripts/corpus-regen.ts`, `package.json` (`corpus:regen`) | T024 |
| `tests/replay/corpus/001-baseline.json`, `.github/workflows/ci.yml` | T025 |

86 tests green. One dependency added (`tsx`), vetted, 0 vulnerabilities. Runtime
dependencies remain exactly one.

## Open risks

1. **Cross-platform hash agreement is now demonstrated, once.** CI run 32525241752:
   hashes recorded on macOS/Node 24 reproduced byte-identically on ubuntu/Node 22 and
   all four runners (13/13 corpus tests green everywhere). This is the claim ADR-001
   exists to make and it held on first contact. The caveat is that it held for a
   400-tick skeleton doing integer-ish arithmetic; the real test comes when M2 adds
   floating-point movement and A\* distance comparisons.
2. **`step()` does not consume the RNG**, because nothing random happens until the AI
   arrives in M4. TC-UNIT-002 proves the PRNG lives in state and survives
   serialise/restore; the integration of RNG with the tick loop is unproven until M4.
3. **The corpus holds one case, and it is not a regression case.** It proves the
   machinery works before any defect needs it. Constitution IV's real value starts
   accruing at the first fixed defect.
4. **`input.setup` is a temporary superset of ADR-002's format** until M2 provides a map
   system. Its removal is a scheduled, visible `simVersion` bump.
5. **The tuning constants are placeholders**, explicitly M8's problem. Nothing in M1
   depends on their values, but M2 and M3 will start behaving according to numbers
   nobody has balanced.

## Handoff notes

- **Read `src/sim/hash.ts` first, and read it against ADR-001 line by line.** Everything
  Constitution IV claims rests on it, and the two appended fields are a deliberate
  deviation that needs a reviewer's agreement rather than a reviewer's assumption.
- **`tests/sim/hash.test.ts`'s per-field mutation sweep is the load-bearing test**, not
  the stability assertions. It is easy to write a hash that is stable; the hard part is
  one that is stable *and* sensitive to every field it claims to cover.
- The corpus failure paths were verified by deliberately breaking the case — first
  divergence reporting, stale detection, ahead detection, dry run, and refusal to
  regenerate a current case. See implementation-log.md for the transcript.


---

# M2 — Grid, movement, economy

## Key decisions

- **No path is stored anywhere.** ADR-001 Amendment 2. Units do not collide in v1
  (pre-impl F-2) and the grid is static, so a path is a pure function of (current
  cell, goal cell, grid) and A\* over ~220 cells is microseconds. Storing one would be
  a cache keyed on a position that has since moved, and it would force a
  variable-length array into an otherwise fixed-width per-entity hash encoding. Both
  costs, no benefit.

- **`EntitySeed` introduced alongside the destination field.** Adding a required field
  to `Entity` would have broken every literal construction in the tests and every
  corpus case at once. Seeds require id, kind, owner, and position; everything else
  defaults. Future field additions are now additive for callers.

- **Cells are scalar indices, not `{x, y}` pairs.** A scalar gives the open set a
  natural, total, cheap tie-break key and removes any question of how two coordinate
  pairs compare.

- **The open set is a linear scan, deliberately.** A binary heap would need its own
  tie-break to stay deterministic under equal keys — heap sift order is precisely the
  incidental ordering O-7 warns about — and a scan over ~220 cells is both trivially
  fast and obviously correct.

- **`entityId` is accepted by `findPath` and deliberately unused.** FR-022 names it as
  the second tie-break key, but two units asking for the same route should get the
  same route. The key belongs at a future point of *contention* — cell reservation or
  formation assignment — not smuggled into the heuristic, where it would silently
  degrade path quality for every unit.

- **Squared distance everywhere in comparisons.** `sqrt` is correctly rounded under
  IEEE 754 so it would be safe, but comparing squares gives the same ordering with
  fewer operations between the coordinates and the comparison — and distance
  comparison is the one place a rounding difference silently flips a tie.

## The finding that matters

**The O-2 tests were passing for the wrong reason.** Deleting the A\* tie-break
entirely left all ten pathfinding tests green, because the open set is a linearly
scanned array: among equal `f` the first-*pushed* candidate wins, and push order is
fixed. Determinism was real but came from somewhere unrelated to FR-022, so the rule
the milestone existed to enforce was untested insurance that would have evaporated the
moment anyone swapped in a heap.

This is the same class of error M0 caught, where a lint test would have gone green
against an empty config. Both were invisible from the outside and both were found by
asking "would this test fail if the thing it guards were removed?" — a question worth
asking of every guard in this project, because it has now had a positive answer twice.

Fixed by exporting the comparator and testing it against permuted candidate order.
Mutation-verified: deleting the tie-break was 10 passed before, 3 failed after.

## Artifacts produced

| Path | Task |
|---|---|
| `tests/sim/pathfind.test.ts`, `tests/sim/economy.test.ts`, `tests/sim/ordering.test.ts` | T026–T030 |
| `src/sim/grid.ts` | T031 |
| `src/sim/pathfind.ts` | T032 |
| `src/sim/economy.ts` | T033 |
| `src/sim/step.ts`, `src/sim/constants.ts`, `tests/replay/corpus/001-baseline.json` | wiring / re-authoring |

## Open risks

1. **Cross-platform agreement has still not been tested against floating-point
   movement.** M2 is the milestone that introduces it — unit positions are now doubles
   accumulated through `dx / distance * speed` every tick. The next CI matrix run is
   the first that could plausibly find real divergence, and a red result would be a
   *finding*, never a reason to loosen the hash.
2. **Recomputing A\* every tick for every moving unit is untimed.** Correct by
   construction and cheap in theory; nobody has measured it with 60 units.
3. **Workers under explicit orders skip the economy loop entirely.** This extends
   FR-020's "explicit orders override" beyond combat, which the spec does not state in
   so many words. Reasonable, but it is an interpretation.
4. **`ARRIVE_EPSILON` snapping is a float-equality shortcut.** Units snap exactly to a
   target within 1.5px. Deterministic, but it means position is quantised at
   destinations in a way M8's tuning should be aware of.
5. **M3 building placement must not create off-map entities.** `findPath` returns `[]`
   out of bounds, so such units silently stand still rather than erroring.

## Handoff notes

- **Read `chooseBestOpen` and its tests together**, and read the mutation table in
  implementation-log.md before deciding the pathfinder is fine. The interesting
  property is not what the comparator does but that anything would notice if it
  stopped doing it.
- **`runEconomy` is a single function with the whole worker state machine in it.** It
  reads linearly today; if M3 adds combat interactions to workers it will need
  splitting before it stops reading linearly.


---

# M3 — Production, combat, victory (+ CR-001)

## Key decisions

- **Ore is spent on completion, not at queue time.** Queuing should not lock up ore you
  might need for defence — and it is exactly what creates O-5. Resolved in ascending
  entity id order with the loser staying QUEUED, because a build that silently
  evaporated for being ten ore short would be maddening and, with no error surface in
  this game, completely invisible.

- **Sudden-death damage goes through the same ledger as combat.** It lands atomically
  with everything else (O-6), so a Base can be finished by a shell and the backstop on
  the same tick, and it is tagged `suddenDeath` rather than `enemy` so FR-033 holds.
  Both Bases take it, so the backstop cannot hand anyone a win by asymmetry — it
  resolves the match on the hp the players earned.

- **A settled verdict is never revised.** Without that, a Draw could be quietly
  rewritten into a Defeat on the following tick as bodies were cleaned up.

- **The indicator flags are hashed.** The one genuinely debatable call in ADR-001's
  history, since this document says presentational things are not hashed. But FR-033
  depends on sudden-death damage being distinguishable from an attack, so the flags
  encode what *happened*, not how it is drawn. A system setting the wrong one would
  replay identically and the corpus would stay green while the indicator lied.

- **Build progress is capped, not accumulated, while waiting for ore.** Late ore
  releases exactly one unit, never a backlog.

## The three findings

1. **A test hung instead of failing.** `while (verdict === NONE)` with no budget, in the
   CR-001 tests — whose entire subject is that a match must terminate in bounded time.
   Vitest's `testTimeout` cannot interrupt a synchronous loop, so in CI this would have
   burned the job timeout and reported nothing at all.
2. **The regression suite caught a real defect two milestones later.** `targetId` held
   two id spaces; M3's combat cleared it out from under M2's economy. An M2 test caught
   it. Entity ids start at 1 and the sentinel is -1, so the collision would otherwise
   have hidden and surfaced much later as a rare, seed-dependent worker stall.
3. **TC-UNIT-008 was an M3 exit criterion with no test**, and `step()` did not enforce
   FR-004 at all — commands applied whenever handed over. Both closed.

Three of my own tests were also wrong in ways that would have passed had the numbers
lined up differently: a trooper that correctly shot a nearer tank instead of the Base,
an escalation test measuring an already-dead Base, and a single-sample flag check
landing on a non-firing tick.

## Artifacts produced

| Path | Task |
|---|---|
| `tests/sim/combat.test.ts` | T034, T036 |
| `tests/sim/production.test.ts` | T035, T037, T080 |
| `tests/sim/victory.test.ts` | T038, T078, T079 |
| `src/sim/production.ts` | T039 |
| `src/sim/combat.ts` | T040 |
| `src/sim/victory.ts`, `src/sim/constants.ts` | T041 |

## Open risks

1. **🟠 Workers auto-attack, which can starve the economy.** A worker beside an enemy
   flips to ATTACKING every tick and stops gathering. Correct per the letter of FR-020,
   but a contested ore node could quietly halt a player's whole economy. For M8 tuning
   or M9 playtest to judge — not worth speculating a fix now.
2. **A Factory under construction reuses `progress`.** Safe because the uses are
   strictly sequential and distinguished by `queuedKind === -1` — but it is one field
   with two meanings, which is the exact shape of the `targetId` bug this milestone
   just fixed. Worth watching.
3. **Nothing has been tuned.** The 4.4-minute Draw in the smoke run is not a balance
   signal: no AI, the sides never meet, nodes seeded at 600 rather than 1500.
4. **Verdicts are from player 0's point of view** — a single field, fine for v1.
5. **A boxed-in producer stacks its spawn on itself** after searching four rings.
   Harmless while units do not collide.

## Handoff notes

- **Read `collectDamage` and `applyDamage` as one unit.** Their separation *is* O-6; a
  reviewer who reads only one will not see why either is shaped the way it is.
- **`runProduction` is the densest function in the codebase** — self-construction, queue
  advance, affordability, the free-Worker floor, and spawn placement. If M4 or M8 adds
  to it, split it first.
- The `sim_version_history` block on `.forge-status.yml` records why each of the five
  versions exists; read it before assuming a corpus hash changed by accident.

---

# M4 — AI opponent

> Recorded retroactively during the M5 run: the M4 pass updated
> `.forge-status.yml` and `implementation-log.md` but never appended its digest
> section, which `docs/runtime.md §8` requires before the phase can close.

## Key decisions

- **AI commands live in hashed state, not in a module queue.** `step()` is pure, so
  commands the AI decides on tick *n* for tick *n+1* have to survive between calls.
  They go in `state.pending`, and `aiSeq` — the AI's half of O-4's `(issuer, seq)`
  ordering — goes with them, so two simulations in one process cannot interleave
  their sequence numbers. Both are hashed (ADR-001 Amendment 5), which is what took
  `SIM_VERSION` to 7.
- **The AI is held to the same latency as a human.** It emits commands scheduled for a
  future tick through the same ordering rule, so it cannot act on information a player
  could not act on. Cost: nothing. Value: the fairness question never has to be argued.
- **M4 is the first milestone in which `step()` consumes the PRNG at all.** Every
  earlier corpus hash was produced by a simulation that never drew a random number.

## Artifacts produced

- `src/sim/ai.ts` — `aiThink` (pure, returns commands) and `runAi` (stage 2).
- `tests/sim/ai.test.ts`, difficulty header assertions in `tests/replay/roundtrip.test.ts`.
- `tests/replay/corpus/002-ai-vs-ai.json` — 1878 ticks, 16 units fielded, 45 commands,
  no player input. Stops one tick short of a verdict so the case exercises a live match.

## Open risks

1. **The AI never builds Factories and never places structures**, so FR-012 is
   unreachable from either side (REV-007).
2. **Difficulty tuning is unvalidated** — the three profiles differ in re-plan cadence
   and army target, and the only assertion is that harder fields an army no smaller
   than easier. Whether they *feel* different is M8/M9's question.
3. **REV-005 and REV-006 remain open** from the M3 code review.

---

# M5 — Presentation

**Tasks:** T046, T047, T048, T049, T050, T051, T081, T082 · **Tests:** 266 green (was 246)
**`SIM_VERSION`:** unchanged at 7 — M5 added no simulation behaviour.

## Key decisions

- **The accumulator is a pure function, not a scene method.** `advanceAccumulator`
  takes the accumulator as an argument and returns `{steps, accumulator, alpha,
  dropped}`. That makes frame-rate independence directly testable without booting
  Phaser, and the return type carries no field a caller could mistake for "how much
  time to simulate" — RF-3's habit becomes unrepresentable rather than discouraged.

- **A floating-point epsilon on the tick boundary, sized from the drift.** 288 frames
  of 144 Hz sum to one ulp short of 2000 ms, so an exact comparison made the tick rate
  depend on the monitor. The 1e-6 ms tolerance is derived — the accumulator is bounded,
  so each addition contributes at most ulp(250), and ten minutes at 144 Hz stays under
  1e-8 ms — not guessed.

- **Ownership is presence, not hue.** Friendly units carry a ring; enemy units carry
  nothing. Blue/orange is a redundant second channel, chosen because it is the one
  high-contrast pair that survives common colour vision deficiency. Confirmed at real
  scale in colour and greyscale by the T081 spike before T051 was finalised.

- **Jitter by golden angle, not by random offset.** Measured, not assumed: random
  offsets gave a 0.36 px worst-case separation at ±11 px and 0.66 px at ±20 px, so the
  approach could not be rescued by tuning. Fixed-radius golden angles guarantee 20.13 px
  between consecutive ids against a 16.6 px ring.

- **`src/sim/setup.ts` holds the standard opening**, in the simulation rather than the
  presentation layer, because a match must stay headlessly constructible for corpus
  cases and for M7's rematch (T069).

- **`CommandQueue` kept and wired**, resolving M4-F1 — see M5-F3 on `.forge-status.yml`.

## Artifacts produced

- `src/game/loop.ts`, `src/game/main.ts`, `src/game/index.ts`, `src/game/scenes/Match.ts`
- `src/game/render/world.ts`, `src/game/render/ownership.ts`, `src/game/render/jitter.ts`
- `src/assets/sprites.ts` — the roster, resolving plan.md open question 3
- `src/sim/setup.ts` — the standard skirmish opening
- `tests/game/{loop,jitter,ownership,manifest}.test.ts`; two cases added to `tests/lint/boundary.test.ts`
- `scripts/spike-underglow.{html,ts}`, `scripts/contact-sheet.html` — dev-only harnesses
- `vite.config.ts` art-pack copy step; `index.html` entry point; `tsconfig.json` scope

**Dependencies added: none.**

## Open risks

1. **Jitter draws units up to 18 px from their simulated position** (M5-F5). T052's
   requirement that selection test collision circles rather than sprite bounds is now
   load-bearing.
2. **`src/sim/setup.ts` and corpus 001 describe the same map twice** (M5-F6), and only
   the corpus copy is hashed.
3. **Structures carry no ownership ring** (M5-F7) — correct per FR-018, unverified
   against a first-time player until M9.
4. **The health bar has never been seen taking damage on screen** — combat is tested
   headlessly, but M5 has no input, so its in-match appearance is unverified until M6.
5. **The bundle is 364 kB gzipped, all Phaser** (M5-F8). Meets the 3 s first-render
   goal on broadband; nobody has measured cold load.

## Handoff notes

- **Read `loop.ts` before anything else in `src/game/`.** It is the only place
  wall-clock time touches the simulation, and both the epsilon and the F-4 clamp have
  reasoning that is invisible from the call site.
- **`jitter.test.ts` asserts a relationship between two files' constants.** If the ring
  radius in `ownership.ts` changes, that test is the one that will fail, and it is
  supposed to.
- **The art pack copy step in `vite.config.ts` is load-bearing.** Removing it produces a
  bundle that builds cleanly and renders nothing.
- **Verify presentation against `dist/`, not the dev server.** The missing-sprites
  defect (M5-F1) was invisible in dev by construction.
