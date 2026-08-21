# Contracts — not applicable for v1

Product Forge normally emits `openapi.yaml` (HTTP) and `asyncapi.yaml` (events) here
so frontend and backend tasks share one source of truth.

**Neither applies to this feature, and empty stubs would be worse than nothing** —
`api-docs` and `sync-verify` Layer 8 would then validate real code against a fiction.

| Artifact | Status | Why |
|----------|--------|-----|
| `openapi.yaml` | **not applicable** | No HTTP surface. Express and MongoDB are explicit v1 non-goals; the game is entirely client-side. |
| `asyncapi.yaml` | **not applicable** | No event-driven architecture. `research/codebase-analysis.md` recorded "N/A — no EDA patterns detected". |

`API-*` ids are therefore null throughout `journeys.yml` and `traceability.yml`.
Downstream verification should read those empty columns as **deliberate**, not as gaps.

## The one internal contract that does exist

The simulation's **command queue** is an application-level construct, not a network
or service contract, so it is not an `API-*`. It is specified in `spec.md`
(FR-004, FR-008) and its concrete shape — command types, payloads, target-tick
scheduling — is a Phase 5 design decision recorded in `plan.md`.

It is worth naming here because it is the seam a future multiplayer feature would
use. If this project ever gains a backend, **this is where `asyncapi.yaml` would
begin**, and the command log format is already required to be serialisable and
diffable by Constitution §IV.
