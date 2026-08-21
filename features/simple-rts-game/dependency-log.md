# Dependency Log — Ten Minute War

Install-time supply-chain vetting (Product Forge W5-C2). Every package added during
Phase 6 is resolved against the live registry **before** installation, never after.

Thresholds: `min_age_days: 30`, `min_downloads: 1000` (defaults — no
`security.dependency_vetting` block in `.product-forge/config.yml`). Allowlist and
denylist both empty.

## M0 (T001–T006)

There was no pre-existing lockfile, so every package below is a new dependency and was
vetted. All ten resolve on the npm registry and every one was first published years ago
— far past the 30-day floor — and all are high-traffic ecosystem packages well past the
1000/month floor.

| Package | Version | Kind | Registry | First published | Verdict |
|---|---|---|:--:|---|:--:|
| `phaser` | 4.2.1 | **runtime** | ✅ exists | 2014-02-17 | pass |
| `vite` | 8.2.2 | dev | ✅ exists | 2020-04-21 | pass |
| `vitest` | 4.1.11 | dev | ✅ exists | 2021-12-03 | pass |
| `typescript` | 5.9.3 | dev | ✅ exists | 2012-10-01 | pass |
| `eslint` | 10.9.0 | dev | ✅ exists | 2013-07-04 | pass |
| `typescript-eslint` | 8.67.0 | dev | ✅ exists | 2019-01-19 | pass |
| `@eslint/js` | 10.0.1 | dev | ✅ exists | 2023-01-31 | pass |
| `@types/node` | 22.20.1 | dev | ✅ exists | — (DefinitelyTyped) | pass |
| `@playwright/test` | 1.62.1 | dev | ✅ exists | 2020-09-24 | pass |
| `@axe-core/playwright` | 4.13.0 | dev | ✅ exists | 2021-06-02 | pass |

**Added: 10 · Vetted: 10 · Warned: 0 · Blocked: 0**

`npm audit`: **0 vulnerabilities** across 163 packages.

### Notes

- **`phaser` is the only runtime dependency**, as plan.md requires. Verified:
  `npm ls --omit=dev --all` → `phaser@4.2.1 └── eventemitter3@5.0.4`. The single
  transitive is Phaser's own, not ours.
- **`@eslint/js` was promoted from transitive to explicit.** `eslint.config.js` imports
  it directly, and depending on a package that merely happens to be hoisted is how a
  build breaks on a minor bump of something else.
- **`typescript` deliberately held at 5.x.** 7.0.2 is published, but
  `typescript-eslint@8.67` declares `typescript >=4.8.4 <6.1.0`. Taking TS 7 today means
  losing the `src/sim` boundary rules — the one thing M0 exists to establish.
- **`@types/node` pinned to the 22 line**, matching the lower Node LTS in the CI matrix,
  so a Node 24-only API cannot be used locally and then fail on the 22 runners.

## M1 (T007–T025)

| Package | Version | Kind | Registry | First published | Downloads/mo | Verdict |
|---|---|---|:--:|---|--:|:--:|
| `tsx` | 4.23.12 | dev | ✅ exists | 2015-08-20 | 348,163,294 | pass |

**Added: 1 · Vetted: 1 · Warned: 0 · Blocked: 0** — `npm audit`: 0 vulnerabilities.

`tsx` runs `scripts/corpus-regen.ts`. ADR-002 requires regeneration to be a
TypeScript script that is **never** part of a test or CI command, so it cannot ride
on Vitest's transform. The zero-dependency alternative — Node's `--experimental-strip-types`
— requires explicit `.ts` extensions on every import in the transitive graph, which
would have meant changing the import style across all of `src/sim/` to avoid one dev
dependency. Not worth it.

Runtime dependencies remain exactly one: `phaser@4.2.1`.

## Corrective pass (post code-review)

| Package | Version | Kind | Registry | Verdict |
|---|---|---|:--:|:--:|
| `@vitest/coverage-v8` | 4.1.11 | dev | ✅ exists | pass |

Pinned to the same version as `vitest` (its peer requirement is exact). Added to
measure the code-review coverage machine gate. **Added: 1 · Blocked: 0 · Audit: 0 vulns.**
Runtime dependencies remain exactly one: `phaser@4.2.1`.
