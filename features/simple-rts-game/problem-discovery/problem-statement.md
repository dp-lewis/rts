# Problem Statement Canvas: Ten Minute War — Simple RTS Game

> Phase 0 output · created 2026-08-21 · feature `simple-rts-game`

## The Problem

**In one sentence:**
A casual player who wants a real-time strategy fix in a spare 15 minutes has no
maintained browser RTS that delivers a complete match arc — the options are a
multi-gigabyte install with 30–60 minute matches, or a dead Flash-era clone.

**Affected user segment:**
Casual browser players — people with genre familiarity or nostalgia (they have
played or watched an RTS), who play in short opportunistic sessions on a desktop
browser, will not install a client, and will not create an account. They
encounter the gap occasionally, not daily.

**Current situation:**
They open a browser tab looking for something with a bit of depth, find nothing
credible in the RTS genre, and default to a different genre entirely — an idle
game, a puzzle game, or simply closing the tab.

**The friction:**
The exact break is the *commitment mismatch*. Every credible RTS demands more
than the session budget: an install, a tutorial campaign, a matchmaking queue, or
a 40-minute match. The genre's satisfying arc — gather → build → army → win — is
locked behind a commitment the casual session cannot pay.

**Consequence of not solving:**
Modest and honest: the player plays something else. Nothing is lost that they
notice. This is a *latent desire*, not an active pain — see Severity below.

## The Job (JTBD)

**When:** I have 15 spare minutes and want something more strategic than a
puzzle game, without committing to an install or a long match,
**I want to:** jump straight into a complete RTS skirmish in a browser tab,
**So I can:** get the full build-up-and-win arc — the satisfaction of a plan
working out — inside one short sitting.

**Functional job:** Play one complete RTS match (economy → production → combat →
resolution) start to finish, in under ~10 minutes, with no setup.

**Emotional job:** Feel clever and in control. The pleasure is watching a
decision compound. Explicitly *not* wanted: the feeling of being outpaced,
punished for low APM, or drowned in menus.

**Social job:** Weak for this segment. At most: "I play something with a bit of
substance on a break." Not a driver — do not design for it.

## Current Solutions Audit

| Solution | Who uses it | Why it fails | Opportunity |
|----------|-------------|--------------|-------------|
| Big-box RTS (StarCraft II, AoE II/IV) | Committed genre fans | Multi-GB install; 30–60 min matches; steep skill floor; ladder anxiety | The arc without the commitment |
| Flash-era browser RTS clones | Nobody now | Flash is dead; survivors are unmaintained, ad-heavy, broken UX | An actually-maintained HTML5 entry |
| Mobile "RTS" (Clash of Clans et al.) | Mobile casual players | Not real-time skirmish — build timers, F2P monetization, asynchronous raids | Genuine real-time play, no monetization friction |
| Turn-based / 4X browser games | Strategy-curious | Wrong pacing — deliberative, not real-time | Real-time tension in a short session |
| **Do something else entirely** | **Most of the segment** | — (it works fine) | **The real competitor** |

## Competing Job Forces

| Force | Rating | Reasoning |
|-------|--------|-----------|
| (+) **Push** — frustration with today | **Medium** | Mild. Players are not suffering; they substitute painlessly. |
| (+) **Pull** — appeal of the new | **Medium–High** | Genre nostalgia is real and "a full RTS match in a tab" is a legible, appealing promise. |
| (−) **Inertia** — comfort of the habit | **High** | The alternative costs nothing. There is no switching cost to overcome because there is nothing to switch *from*. |
| (−) **Anxiety** — fear of the new | **Low–Medium** | Free, no install, no account kills most anxiety. Residual: RTS carries a "this will be complicated" reputation. |

**Verdict: Push + Pull ≈ Inertia + Anxiety — the forces are roughly balanced.**

This is the single most important finding of Phase 0. The problem is *not*
painful enough to pull players in on its own. Adoption therefore rests entirely
on the **Pull** side, and specifically on legibility: the game must be
comprehensible and playable within roughly the first minute, or the costless
alternative wins. **Onboarding is the make-or-break variable, not feature depth.**

## Problem Validation Score

| Signal | Evidence | Weight |
|--------|----------|--------|
| User interviews | none | High |
| Support tickets / churn data | none (greenfield) | High |
| Competitor evidence | Not yet gathered — deferred to Phase 1 (H1) | Medium |
| Own observation / dogfooding | Builder has personally hit the gap looking for a lightweight browser RTS | Low |
| Assumption | Segment size and session-length preference are assumed | Very Low |

**Validation strength: Weak.** Grounded in one person's observation, no external
signal yet. Recorded honestly rather than inflated.

## Problem Severity

**Impact:** Low–Medium — a missed pleasant experience, not a cost incurred.
**Frequency:** Occasional — arises when a spare session coincides with the mood.
**Workaround quality:** Good enough — substituting another game fully satisfies
the underlying need for a short diversion.

**Severity score: 4 / 10.**

> **On the honesty of this score.** A 4/10 severity with Weak validation would
> normally read as a *No-go* on market grounds. That framing does not apply
> here, and pretending otherwise would be the wrong service. The stated success
> outcomes for this build are **"a playable, fun 10-minute match"** and **"a
> clean, extensible codebase"** — a craft-and-capability goal, not a market
> capture goal. Neither requires validated market pain to be worth achieving.
> The go decision below rests on that basis, explicitly, rather than on a
> severity score doing work it cannot support.

## Key Risks

1. **The determinism mandate is unbudgeted against the stated goals.**
   The project constitution makes a deterministic fixed-timestep simulation and
   replay-verified regression **NON-NEGOTIABLE** (Principles I and IV). But
   "provably deterministic sim" was *not* selected as a success outcome — the
   stated outcomes are fun and code cleanliness. Determinism carries real cost:
   seeded RNG throughout, ordered iteration everywhere, disciplined float
   handling in state-affecting comparisons, a command-log harness, and a CI
   replay corpus. That cost buys a property nobody has asked this feature to
   deliver, and it competes directly for effort with "fun in 10 minutes."
   **This tension must be resolved explicitly before Phase 5 (Plan), not
   discovered during implementation.** Note the constitution permits exactly two
   resolutions: comply, or record the violation in the plan's Complexity
   Tracking table with an accepted justification.
   *(Mitigating read: determinism also serves the "clean, extensible codebase"
   outcome — the sim/presentation split it forces is the same split that makes
   multiplayer and new units addable later. The cost is real; the value is not
   zero.)*

2. **The real competitor is "play nothing," and it is free.**
   Per the force analysis, there is no switching cost to overcome and no pain to
   relieve. A player who is confused at second 45 simply closes the tab, at zero
   cost to themselves. Time-to-comprehension dominates every other design
   variable. A feature-rich game with an opaque first minute fails outright.

3. **"Simple RTS" is undefined, and RTS scope creeps notoriously.**
   Pathfinding, unit collision, fog of war, formations, build trees, AI
   behaviour, and selection UX each look small in isolation and none of them
   are. Without a hard, written v1 budget — a fixed unit count, resource count,
   and explicit non-goals — this does not ship. The word "simple" in the feature
   description is currently carrying enormous unexamined weight.

4. **"Fun" is not derivable from a specification.**
   RTS feel — unit responsiveness, combat pacing, the economy curve — is *tuned*
   by playing, not *specified* by writing. The success criterion "a playable,
   fun 10-minute match" cannot be verified by the traceability chain that
   Product Forge's later phases check. It needs a playtest-and-tune loop that
   the plan must make room for, or it will be silently dropped in favour of the
   criteria that *are* machine-checkable.

## Hypotheses to Validate in Research

- **H1 (competitor):** The quick-session browser RTS niche is genuinely
  underserved — surviving options are either unmaintained Flash-era relics or
  heavyweight installs, and no maintained HTML5 RTS delivers a complete match in
  ≤10 minutes. *Phase 1 competitor analysis should confirm or kill this.*
- **H2 (UX):** Casual RTS legibility is bought through radical mechanic
  reduction — roughly 3 unit types, 1 resource, and no fog of war is sufficient
  for a satisfying match arc, and each addition beyond that costs more
  comprehension than it adds depth. *Phase 1 UX research.*
- **H3 (technical):** A deterministic fixed-timestep simulation with seeded RNG
  and a replayable command log is achievable in Phaser 4 without resorting to
  fixed-point arithmetic, provided the simulation layer confines itself to a
  deterministic math subset and never branches on raw float equality.
  *Phase 1 tech-stack research — this de-risks Risk 1.*
- **H4 (metrics):** For this segment, time-to-first-meaningful-action (target
  <30s) and match-completion rate predict success better than any measure of
  strategic depth. *Phase 1 metrics research — these become the spec's success
  metrics.*
