# Feature: Ten Minute War — Simple Browser RTS

> Created: 2026-08-21 | Status: Phase 5 (Plan) approved — ready for task breakdown
> Slug: `simple-rts-game` | Mode: `standard` | Flow: `gated`

## Lifecycle Status

| Phase | Status | Documents |
|-------|--------|-----------|
| 0. Problem Discovery | ✅ Complete | [problem-discovery/](./problem-discovery/problem-statement.md) |
| 1. Research | ✅ Complete | [research/](./research/README.md) |
| 2. Product Spec | ✅ Complete | [product-spec/](./product-spec/README.md) |
| 2H. Design System Harvest | ⛔ Not applicable | canvas game, no component library |
| 3. Revalidation | ✅ Approved | [review.md](./review.md) — spec LOCKED after 1 revision |
| 4. SpecKit Bridge | ✅ Complete | [spec.md](./spec.md) · [delta specs](./specs/) · [contracts](./contracts/README.md) |
| 4.5. i18n Harvest | ⛔ Not applicable | English only |
| 5. Plan | ✅ Approved | [plan.md](./plan.md) · [ADR-001](./plan/adr/ADR-001-canonical-state-hash.md) · [ADR-002](./plan/adr/ADR-002-replay-corpus.md) |
| 5B. Tasks | ⏳ Pending | `tasks.md` |
| 5.5. Migration Plan | ⛔ Not applicable | no database, no schema, no migrations |
| 5C. Pre-Impl Review | ⏳ Pending *(optional)* | `pre-impl-review.md` |
| 6. Implementation | ⏳ Pending | — |
| 6B. Code Review | ⏳ Pending *(optional)* | `code-review.md` |
| 7. Verification | ⏳ Pending | `verify-report.md` |
| 8A. Test Plan | ⏳ Pending *(optional)* | `testing/` |
| 8B. Test Run | ⏳ Pending *(optional)* | `test-report.md` |
| 9. Release Readiness | ⏳ Pending *(optional)* | `release-readiness.md` |

## Quick Start

1. **The problem** — [problem-discovery/problem-statement.md](./problem-discovery/problem-statement.md)
2. **The research** — [research/README.md](./research/README.md)
3. **The spec** — [product-spec/product-spec.md](./product-spec/product-spec.md)
4. **The journeys** — [product-spec/journeys/](./product-spec/journeys/journeys.yml)
5. **The screens** — open [product-spec/wireframes/wireframe-match.html](./product-spec/wireframes/wireframe-match.html) in a browser

## Feature Description

Simple browser RTS — local single-player skirmish vs AI, Phaser 4, deterministic
fixed-timestep simulation, complete match arc in ~10 minutes.

## Constraints Worth Knowing Up Front

- The project constitution (**v1.1.0**, amended by this feature) makes a deterministic
  fixed-timestep simulation, sim/presentation separation, test-first development,
  and replay-verified regression **non-negotiable**. Two of five principles are
  marked NON-NEGOTIABLE.
- Determinism is verified across **three platforms**: Node LTS on `ubuntu-latest`
  and `macos-latest`, plus Chromium.
- Transcendental math functions are **forbidden** in simulation code and this
  should be enforced by lint, not review.
- Runtime dependency target: **Phaser alone.**
- Art is Kenney "RTS Pack: Sci-Fi" (CC0) at [`images/`](../../images/).
