# Metrics & Success Criteria: Ten Minute War

> Feature: `simple-rts-game` | Related: [Product Spec](./product-spec.md) · [Research: metrics-roi.md](../research/metrics-roi.md)

## Success Definition

Thirty days after this ships, success looks like: **a person who has never seen it
sits down, plays a complete match without asking a question, and immediately
plays another.** Underneath that, the determinism corpus has been green on every
CI run since the first simulation commit.

There is deliberately no revenue, growth, or acquisition target. Phase 0 recorded
the go decision as resting on craft goals — a playable, fun ten-minute match and a
clean, extensible codebase — not on market capture, and inventing commercial KPIs
now would be dressing that up as something it is not.

## Measurement approach (and its limits)

Config declares `telemetry.product_analytics: none`, `error_tracking: none`,
`dashboards: none`, and v1 has no backend by scope decision. Measurement is
therefore:

1. **Local in-simulation counters**, surfaced in a debug overlay (FR-025). Zero dependencies, satisfies Constitution §V.
2. **A scripted comprehension playtest** with 3–5 first-time players.

**No analytics provider, no funnels, no cohort retention, no dashboards.** Adding
one would mean a runtime dependency and a network call for a game with no users,
which §V would need convincing of.

> **An honest caveat carried forward from research:** almost every published games
> metric comes from *installed mobile apps* with acquisition funnels and D1/D7/D30
> retention. None of that machinery exists for a no-install, no-account,
> single-player browser game. Importing mobile D1 targets here would be
> measurement theatre. **v1 has no valid external benchmark and is measured
> against itself.**

## KPIs

| # | Metric | Baseline | Target | Measurement |
|---|--------|----------|--------|-------------|
| K1 | **Comprehension** — first-timer understands what to do, unaided | n/a | **≥ 4 of 5** playtesters | Playtest observation. Say nothing, watch. |
| K2 | Time to first meaningful action (**observed**) | n/a | **< 30 s** from page load | Wall time from page load to the first player-issued command, recorded in playtest. Distinct from US-001's ≤10 s **time-to-interactive**, which is the product guarantee that commands *can* be issued. |
| K3 | Match completion rate (reached win or loss) | n/a | **≥ 70%** of started matches | Local counter |
| K4 | Match duration | n/a | **median 6–10 min**, p90 < 15 min | Tick count at terminal state |
| K5 | Rematch rate | n/a | **≥ 40%** of completed matches | Local counter |
| K6 | Time to first render | n/a | **< 3 s** on a mid-tier laptop | Manual / Lighthouse |
| K7 | **Determinism corpus pass rate** | n/a | **100%, always** | CI across all 3 supported platforms |

### On K1 and K7

These two carry the weight, for opposite reasons.

**K7 is machine-checked and absolute.** Constitution §IV requires CI to replay the
full corpus on every run; any divergence fails the build. There is no partial
credit and no negotiating it down.

**K1 is human and is the only check on the "fun" goal at all.** This is risk R4
made concrete: RTS feel — unit responsiveness, combat pacing, the economy curve —
is *tuned* by playing, not *specified* by writing, and cannot be verified by the
traceability chain that Product Forge's later phases check. Without a protected
slot, K1 will be quietly crowded out by the six criteria a machine *can* check.
**The plan must reserve time for it, and it should block "done".**

> Note that K2's `< 30 s` is a **self-imposed budget** derived from the ten-minute
> session goal — not an industry benchmark. No comparable published figure exists.
> The spec must not cite it as validated.
>
> **K2 and US-001 measure different things and must not be conflated.** US-001's
> ≤10 s is *time-to-interactive* — a product guarantee we control. K2's <30 s is
> *observed time to first action* — behaviour we can only watch. Both start at page
> load; the gap between them is the player deciding what to do, which is exactly the
> comprehension signal K1 is after.

## Leading Indicators

Available before the full KPI set is meaningful:

- **Determinism corpus green from the first sim commit** — the earliest signal that the architecture is sound. If this wobbles early, everything downstream is at risk.
- **Playtester reaches first command without asking a question** — the earliest signal on K1, available from the first playable build.
- **Ore depletes at a rate that ends matches near 8 minutes** — the earliest signal that the pressure valve is tuned, available as soon as the economy runs.

## Guardrail Metrics

Must not regress:

| Guardrail | Threshold |
|---|---|
| Determinism corpus | **Never** below 100%. A single divergence is a build failure and is treated as a determinism defect until proven otherwise (§IV). |
| Runtime dependencies | **Phaser only.** Any addition requires a §V justification recorded in the plan's Complexity Tracking table. |
| Simulation layer imports | **Zero** imports of rendering, audio, input, windowing, or UI. Enforced by lint (§II). |
| Frame rate | Stable with ~60 simultaneous units on a mid-tier laptop. |
| Time to first render | Must not exceed 3 s. Slow loads read as "broken" and bounce. |

## Measurement Plan

- **From the first simulation commit** — K7 runs on every CI run. Automatic, non-negotiable.
- **At first playable** — K1 and K2. Sit 3–5 people down cold, say nothing, watch. This is the primary R4 gate.
- **After the playtest** — K3, K4, K5 from local counters; tune ore-node quantity and count until K4 lands in the 6–10 minute band. *Expect this to take more than one pass.*
- **Before calling it done** — K6, plus a re-run of K1 against the tuned build.
- **Explicitly not planned** — funnels, cohorts, dashboards, A/B tests. Phase 9B (Experiment Design) should resolve to `not_applicable`.

## Anti-metrics — what failure looks like

- A playtester asks **"what am I supposed to do?"** — legibility has failed, and it is the failure that matters most.
- Matches routinely run past 15 minutes, or end inside 3 — the pressure valve is mistuned and the core promise is broken.
- Players complete a match and do **not** click Rematch — the only retention loop we have is not working.
- Anyone closes the tab during the difficulty gate — the gate has cost more than it earned, and should be reconsidered.
- The determinism corpus is made green by **relaxing the hash** rather than fixing the divergence — the most dangerous possible outcome, because it silently voids §I while appearing to satisfy it.
