# JRN-002: Rematch loop

> Feature: `simple-rts-game` | Actor: Casual browser player (match just ended)
> Stories: US-010 | Entry: Result screen | Success: A fresh match running at the same difficulty
> Related: [Product Spec](../product-spec.md) · [journeys.yml](./journeys.yml)

> For a bounded game, **the rematch button is the retention loop.** We forgo the
> multiplayer retention mechanism every competitor leads with (RF-5), so this
> short journey carries disproportionate weight.

## Preconditions
- A match has reached a definitive win or loss

## Happy path

| Step | Action | UI | Expected result | Contract |
|------|--------|-----|-----------------|----------|
| STEP-001 | Observe the result screen | `[data-testid=result-screen]` | Outcome unambiguous; duration shown; Rematch is the largest and primary action | — |
| STEP-002 | Click Rematch | `[data-testid=rematch]` | A fresh match starts at the same difficulty — **without returning to the gate** | — |
| STEP-003 | Confirm freshness | `[data-testid=ore-counter]` | Ore, units, and structures at starting values; a new seed is in effect | — |

## Alternate flows

| Edge | Of step | Case | Given / When / Then | Priority |
|------|---------|------|---------------------|----------|
| EDGE-001 | STEP-002 | Rematch after defeat | GIVEN the previous match was a loss / WHEN Rematch is clicked / THEN behaviour is identical to rematch after a win — no penalty, no extra step, no post-mortem | P1 |

## Error / boundary cases

| Edge | Of step | Case | Given / When / Then | Priority |
|------|---------|------|---------------------|----------|
| EDGE-002 | STEP-003 | Determinism hygiene | GIVEN a rematch has started / WHEN the new match runs / THEN **no state leaks from the prior match** — the simulation is constructed fresh from its seed | P0 |

> EDGE-002 is P0 for a constitutional reason, not a gameplay one. Leaked state
> between matches is a determinism defect (§I): a replay of match 2 would not
> reproduce from its seed alone. It is also the kind of bug that hides for months.

## E2E
- Runner: `playwright-cli`
- Smoke: **yes**
- Test cases: *(filled by test-plan, Phase 8A)*
