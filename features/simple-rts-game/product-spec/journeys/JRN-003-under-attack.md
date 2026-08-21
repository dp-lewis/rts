# JRN-003: Losing without noticing — base under attack

> Feature: `simple-rts-game` | Actor: Casual browser player mid-match
> Stories: US-011 | Entry: Match in progress, attention on own army | Success: Player is alerted in time to respond
> Related: [Product Spec](../product-spec.md) · [journeys.yml](./journeys.yml)

> Research named this the worst possible outcome: **losing without noticing.** On
> a fixed single screen the player *can* see everything, but attention is still
> finite — visibility is not the same as noticing.

## Preconditions
- A match is in progress
- The player's army is away from their Base

## Happy path

| Step | Action | UI | Expected result | Contract |
|------|--------|-----|-----------------|----------|
| STEP-001 | Send the army away | `canvas[data-testid=game-canvas]` | Army pathfinds away; Base left lightly defended | — |
| STEP-002 | Enemy damages an owned entity | `[data-testid=under-attack-indicator]` | Screen-edge indicator appears and an audio cue fires on the **first** damage event | — |
| STEP-003 | Recall the army | `canvas[data-testid=game-canvas]` | Units path back and engage the attackers | — |

## Alternate flows

*(none — this journey has no alternate success path)*

## Error / boundary cases

| Edge | Of step | Case | Given / When / Then | Priority |
|------|---------|------|---------------------|----------|
| EDGE-001 | STEP-002 | Repeated damage events | GIVEN continuous damage / WHEN many events fire in succession / THEN the indicator and cue do not spam — rate-limited **in the presentation layer only, never in simulation** | P2 |
| EDGE-002 | STEP-002 | Damage after resolution | GIVEN the match has already resolved / WHEN a trailing damage event is processed / THEN no indicator or audio fires over the result screen | P3 |

> EDGE-001's parenthetical is load-bearing. Rate-limiting inside the simulation
> would make alert behaviour depend on render cadence and break determinism (§I).
> The limiter belongs in presentation, which by §II cannot feed back into the sim.

## E2E
- Runner: `playwright-cli`
- Smoke: no
- Test cases: *(filled by test-plan, Phase 8A)*
