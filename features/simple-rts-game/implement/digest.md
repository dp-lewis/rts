# Phase Digest — Implement (M0 only)

**Phase:** 6 · Implement · **Scope:** M0 — Enforcement skeleton
**Date:** 2026-08-22 · **Tasks:** T001–T006 complete
**Status:** M0 complete — the run was user-scoped to M0 at the Phase 6 kickoff gate

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
