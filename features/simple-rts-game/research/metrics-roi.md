# Metrics & ROI: Simple Browser RTS

> Generated: 2026-08-21
> Tests hypothesis **H4** — "time-to-first-meaningful-action (<30s) and match-completion rate predict success better than strategic depth."

## Framing note (read this first)

Standard ROI analysis does not apply here and pretending otherwise would produce
a fabricated business case. Phase 0 recorded this explicitly: the go decision
rests on **craft goals** — a playable, fun 10-minute match and a clean,
extensible codebase — not on revenue or market capture. There is no monetisation,
no acquisition budget, and no revenue line to model.

What this dimension *can* usefully do is give the success criteria **numeric
targets** and, critically, address **R4** — "fun is not derivable from a spec."
Metrics are the only mechanism by which the fun goal becomes checkable at all.

**Telemetry caveat:** config sets `telemetry.product_analytics: none`,
`error_tracking: none`, `dashboards: none`. **Nothing is currently instrumented,
and none of the metrics below can be measured without a decision to add
instrumentation.** For a local single-player game with no backend
(`out_of_scope_v1`), the realistic v1 options are (a) local-only in-memory
counters surfaced in a debug overlay, (b) manual playtest observation, or
(c) adding an analytics dependency — which §V (YAGNI) would need convincing of.
**Recommend (a) + (b) for v1.** This should be settled in the product spec rather
than left to be discovered in Phase 9.

## Verdict on H4

**H4 is SUPPORTED as a design principle, but NOT verifiable as stated.**

The supporting evidence is strong and consistent: most players quit within the
first ten minutes of starting a game; engaging the audience within the first
minutes is critical, because a game that fails to capture attention quickly never
reaches a retention problem at all. Players who launch and leave quickly are
typically hitting loading issues, confusing onboarding, or friction — not
insufficient depth. That is H4's claim, and the literature backs it.

The unsupported half is the *measurement*. "Time-to-first-meaningful-action" is
not a published industry benchmark; no comparable figure was found. It is a
sound internal design target — **it just cannot be benchmarked against anything
external.** Treat the <30s figure as a self-imposed budget derived from our own
10-minute session constraint, not as an industry standard. Recorded honestly so
the spec does not cite it as validated.

## Industry Benchmarks

| Benchmark | Figure | Source | Relevance to us |
|---|---|---|---|
| Median daily playtime | ~22 min, ~4 sessions/day | GameAnalytics | Our 10-min match fits roughly two sessions per day. Coherent. |
| Strategy/multiplayer session length | often **>50 min** | industry aggregates | **We are targeting ~1/5 of genre norm.** Deliberate — that is the white space — but it means genre benchmarks are the wrong yardstick throughout. |
| Card/Trivia/Word session length | ~10–12 min | industry aggregates | **This is our real comparison class.** Our session shape resembles a word game far more than an RTS. |
| Mobile D1 retention (all games) | ~25–27% avg; top 5% ≈46% | GameAnalytics / Segwise | Mobile-app figures; a no-install browser game has no comparable install→D1 funnel. **Do not adopt as a target.** |
| Desktop bounce rate (cross-industry) | ~39.7% desktop / 51.8% mobile; cross-industry median 47.4% | 2026 benchmark data | Closest available proxy for "loaded the page, did not play." Not game-specific. |
| Quit-within-first-10-minutes | The dominant early-churn window | onboarding literature | **For a 10-minute game this is the whole product.** |

**The most consequential benchmark finding is a negative one:** almost every
available games metric is drawn from *installed mobile apps* with acquisition
funnels and D1/D7/D30 retention. None of that machinery exists for a
no-install, no-account, single-player browser game. Importing those targets
would be measurement theatre. The honest position is that **v1 has no external
benchmark and should be measured against itself.**

## User Impact Signals

| Metric | Expected impact | Confidence | Source |
|---|---|---|---|
| Fast, legible first minute → completed first match | Large | **High** | Onboarding literature is unambiguous |
| Auto-gather (no manual first-worker chore) → faster time-to-action | Moderate | Medium | Inference from "remove any mechanic not on the first-five-minutes path" |
| Instant rematch → repeat sessions | Moderate | Medium | Genre-standard for bounded matches; not directly measured |
| Added strategic depth → retention | **Small or negative** for this segment | Medium | H4's core claim; complexity is the documented churn driver |
| Slow asset load → bounce | Large negative | High | Frequent-launch-quick-exit is attributed to load and onboarding friction |

## Revenue Impact

**None. Not applicable.** No monetisation in scope, none planned, no revenue
model to evaluate. Recorded as N/A rather than estimated.

## Effort vs. Impact

- **Effort: High.** Not from game scope (H2 keeps that small) but from the constitution: deterministic sim, headless architecture, test-first throughout, and a CI replay corpus are all v1 obligations. See [codebase-analysis.md](./codebase-analysis.md).
- **Impact against stated goals: High.** Both goals — a fun 10-minute match and a clean, extensible codebase — are directly served, the second one substantially *by* the constitutional overhead.
- **Impact against market goals: Low**, and deliberately not pursued.
- **Net:** favourable, provided success is judged on the stated craft goals. Judged commercially it would not be — which is exactly why Phase 0 declined that frame.

## Recommended KPIs

Small, honest, and mostly measured by *watching someone play* rather than by
instrumentation.

| KPI | Baseline | Target | Measurement |
|---|---|---|---|
| **Time to first meaningful action** | n/a (new) | **< 30 s** | In-sim tick counter from match start to first player-issued command; debug overlay |
| **Match completion rate** (reached a win/loss state) | n/a | **≥ 70%** of started matches, playtest cohort | Local counter + playtest observation |
| **Match duration** | n/a | **median 6–10 min**, p90 < 15 min | Tick count at terminal state |
| **Rematch rate** | n/a | **≥ 40%** of completed matches | Local counter |
| **Time to first render** | n/a | **< 3 s** on a mid-tier laptop | Manual/Lighthouse |
| **"Did you understand what to do?"** (unprompted) | n/a | **≥ 4 of 5 first-time playtesters, unaided** | **Playtest — the R4 mitigation.** No instrumentation can substitute. |
| **Determinism corpus pass rate** | n/a | **100%, always** | CI (constitutionally mandated, §IV) |

> The last two rows are the important ones. The determinism KPI is a hard,
> machine-checked gate the constitution already requires. The playtest
> comprehension check is the *only* proposed measure of the "fun" goal, and it is
> deliberately human — R4 warned that machine-checkable criteria will crowd out
> fun unless fun is given an explicit, protected check of its own. **This row is
> that protection, and it needs a scheduled slot in the plan or it will not
> happen.**

## Measurement Plan

- **During implementation** — determinism corpus runs on every CI run from the first sim commit. Non-negotiable and automatic.
- **First playable** — sit 3–5 people in front of it cold, say nothing, and watch. Record time-to-first-action and whether they understood the goal unaided. This is the primary R4 gate and should block "done."
- **Post-playtest** — median match duration and completion rate from local counters; tune the pressure valve until duration lands in the 6–10 min band.
- **Explicitly not planned:** funnels, cohort retention, dashboards, A/B tests. No backend, no analytics provider, no user base. Phase 9B (Experiment Design) should resolve to `not_applicable`.

## Sources

- https://countly.com/blog/10-game-analytics-metrics-that-separate-successful-studios-from-the-rest
- https://appagent.com/blog/mobile-game-retention-benchmarks/ · https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies
- https://count.co/metric/session-duration · https://www.digitalapplied.com/blog/bounce-rate-benchmarks-2026-industry-channel-data
- https://webeyez.com/insights/guides/low-performance-browser-games-optimization-guide
- https://game-wisdom.com/critical/onboarding · https://celiahodent.com/gamers-brain-ux-onboarding/
