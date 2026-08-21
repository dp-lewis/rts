# Phase Digest — Implement (M0 only)

**Phase:** 6 · Implement · **Scope:** M0 — Enforcement skeleton · M1 — Determinism harness
**Date:** 2026-08-22 · **Tasks:** T001–T025 complete (25 / 82)
**Status:** M0 and M1 complete

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

1. **The cross-platform half of Constitution IV is still unexercised.** The corpus is
   green on one machine. Exact-bit hash agreement across engines — the entire reason
   ADR-001 rejects rounding — is untested until the matrix runs with a real case. A red
   first run is expected and is a *finding*, never a reason to loosen the hash.
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
