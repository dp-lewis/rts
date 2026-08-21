# UX/UI Patterns: Simple Browser RTS

> Generated: 2026-08-21
> Tests hypothesis **H2** — "radical mechanic reduction (~3 units, 1 resource, no fog of war) suffices for a satisfying match arc."
> Addresses risk **R2** — the real competitor is "play nothing," at zero cost.

## Headline finding

**H2 is SUPPORTED — from two independent directions.**

1. *Empirically:* Littlewargame, a shipped and well-received browser RTS, uses
   **gold as its only resource**, and reviewers name that reduction as a
   strength, not a limitation.
2. *From UX literature:* the consensus failure mode of game onboarding is
   frontloading — "controls, story, progression systems, currencies, menus, and
   edge cases all at once, which creates friction before player engagement has
   even started." The prescribed remedy is layering: master one skill before the
   next is introduced.

The research adds a **sharper constraint than H2 proposed**. The industry rule of
thumb is that most players quit within the first ten minutes. For a *ten-minute
game* that statistic collapses into something brutal: **the first-run experience
and the game are the same thing.** There is no "later" in which to teach. Every
mechanic must be either immediately legible or absent from v1.

The recommended design method from the literature translates directly into a
task we should carry into the spec: *map the first five minutes screen by screen,
marking where the player moves, acts, gets feedback, and receives reward, then
remove any mechanic that does not affect that path.*

## Core User Flows

### Primary (happy path) — target: complete arc under 10 minutes

| # | Step | Player mental model | Design requirement |
|---|---|---|---|
| 1 | Page loads → **already in a match** | "Oh, it started." | No menu, no lobby, no account. Cold start straight into playable state. This is our biggest structural advantage over every competitor. |
| 2 | Sees own base + a few workers | "That's mine." | Ownership must be readable in <2s: colour, camera centred on base. |
| 3 | Workers auto-gather, resource counter ticks up | "Numbers go up. Good." | **Auto-gather on spawn.** Requiring the player to manually assign first workers is a classic RTS onboarding trap and burns the critical first 30s. |
| 4 | Drag-selects workers / clicks build | "I make things." | Standard drag-select + right-click order. Zero innovation here. |
| 5 | Builds production structure, trains soldiers | "I have an army now." | Build menu ≤4 entries, always visible, never nested. |
| 6 | Sends army at visible enemy base | "Attack." | Enemy base visible from the start (no fog) — the goal must never be *searched for*. |
| 7 | Combat resolves, one base falls | "I won / I lost." | Clear, unambiguous, immediate victory state. |
| 8 | Result screen → **instant rematch** | "Again." | One-click restart. The retention loop for a bounded game *is* the rematch button. |

**Time-to-first-meaningful-action target: <30 s** (H4). Steps 1–3 must complete
inside that budget, and step 3 is satisfied passively by auto-gathering.

### Alternative paths
- **Player does nothing for 60 s** — AI advances anyway; game must remain
  recoverable, not instantly lost. A punishing AI here converts confusion into
  a closed tab.
- **Player rushes with initial workers** — must not be an instant-win exploit.
- **Player turtles** — needs a match-length pressure valve (resource exhaustion,
  escalating AI, or a soft timer) so a 10-minute match cannot become 40.
- **Player loses badly and fast** — offer instant rematch, not a post-mortem.

## State Inventory

| State | Trigger | Recommended pattern |
|---|---|---|
| Cold start | Page load | **Skip empty state entirely** — begin mid-match with base and workers placed. |
| Loading | Asset load | Single deterministic progress bar; keep assets small enough that this is near-invisible. Slow loads read as "broken" and bounce. |
| Selection | Units selected | Persistent selection outline + count badge. Never a modal. |
| Command issued | Right-click | Immediate visual acknowledgement (move marker) — **before** the unit physically moves. Perceived responsiveness is decoupled from simulation latency; this is a presentation-layer concern (Constitution II) and must not reach into sim state. |
| Insufficient resources | Build attempt | Inline, non-blocking: greyed button + cost tint. Never an error dialog. |
| Under attack | Enemy in own base | Screen-edge indicator + audio cue. Losing without noticing is the worst possible outcome. |
| Victory / defeat | Base destroyed | Full-screen, unambiguous, one primary action: **Rematch**. |
| Error / WebGL unsupported | Renderer init fails | Plain, honest message. Phaser 4 is WebGL-first (see tech-stack.md) — this state is *newly reachable* and must not be a blank canvas. |

## UI Pattern Library

1. **Drag-select + right-click-order (universal RTS grammar).** Every competitor uses it; players arrive pre-trained. Deviating costs comprehension and buys nothing.
2. **Always-visible build bar (≤4 buttons).** Nested build trees are a primary complexity source. A flat bar is self-documenting.
3. **Single resource counter, top-left.** Littlewargame's precedent. One number, one meaning.
4. **Diegetic goal marker.** With no fog of war, the enemy base is visible from second one — the objective needs no explanation.
5. **Rematch-first result screen.** Bounded matches live or die on restart friction.

## Micro-interactions worth building

- Selection: instant outline + a short affirmative sound.
- Move order: ground marker that lands *immediately* on click.
- Unit spawn: brief scale-in so production is felt, not just counted.
- Resource tick: number rolls rather than jumps — makes the economy feel alive.
- Combat: hit flash + damage feedback. Without it, battles read as units standing near each other.

> All of the above are **presentation-layer only**. Per Constitution Principle II
> none may mutate simulation state, and none may feed back into sim timing.
> Animations must be free to lag or drop without affecting the tick stream.

## Accessibility (WCAG 2.1 AA — feature-specific)

Config sets `a11y_gate: axe`, so an automated WCAG-AA floor will be generated per journey in Phase 8A. Feature-specific criteria that automation will *not* catch:

- **1.4.1 Use of Colour** — player/enemy ownership must not rest on colour alone (RTS's most common a11y failure). Add a shape, outline, or icon differentiator.
- **1.4.3 Contrast** — HUD text over a varied game field needs a backing plate; contrast against "the map" is not measurable without one.
- **2.1.1 Keyboard** — full mouse-free play is unrealistic for v1 RTS; camera pan, build, and select/attack-move keyboard equivalents are the achievable subset. **State honestly in the spec which parts are not keyboard-reachable** rather than claiming blanket conformance.
- **2.2.x Timing** — a real-time game is inherently time-pressured; a slower/pausable mode is the standard accommodation. Worth pricing, likely v2.
- **Canvas is opaque to screen readers.** A canvas game cannot be made screen-reader accessible by markup alone. Declare this limit explicitly; do not let an axe pass on the surrounding page imply the game is accessible.

## Anti-patterns to Avoid

| Anti-pattern | Why it kills *this* game |
|---|---|
| **A tutorial before play** | In a 10-minute game the tutorial *is* the game. Teach through the first match or not at all. |
| **Manual first-worker assignment** | Burns the 30 s time-to-first-action budget on chores. Auto-gather instead. |
| **Fog of war in v1** | Adds a search problem on top of a strategy problem, and hides the goal. H2 correctly excludes it. |
| **Nested build trees / tech tiers** | The dominant complexity source in RTS. Flat roster only. |
| **Account wall or lobby before play** | Directly triggers R2 — a costless alternative always wins against a signup form. |
| **Unbounded match length** | Breaks the core promise. Needs an explicit pressure valve. |
| **APM-dependent difficulty** | Our player wants to feel clever, not fast. Difficulty must come from decisions, not click rate. |
| **Punishing AI at default** | An AI that wins in 3 minutes converts new players into closed tabs. Default must be beatable. |

## Recommended Approach

Open directly into a live match with the base placed and workers already
gathering — no menu, no account, no tutorial. Hold to one resource, a flat roster
of roughly three units, and no fog of war, so that the entire strategic surface is
visible and legible within the first minute. Use the universal RTS control grammar
unchanged, keep the build bar flat and permanently on screen, and make the enemy
base visible from the start so the objective never has to be explained. Guarantee
the match ends inside the session budget with an explicit pressure valve, and land
the player on a result screen whose primary action is *Rematch*. Every mechanic
that does not appear on that path should be cut from v1 and recorded as a non-goal.

## Open questions for the product spec

- What is the concrete pressure valve for match length — finite resource nodes, escalating AI aggression, or a soft timer? (Affects the sim design directly.)
- Are the three units a rock-paper-scissors triangle, or a cost/power ladder? The former adds depth at real comprehension cost; H2 does not settle this.
- Is there any tutorialisation at all, or is legibility expected to carry the whole load?
- Does the AI have a difficulty selection at cold start, or is a single beatable default correct for the 30-second budget?

## Sources

- https://uxdesign.cc/games-ux-building-the-right-onboarding-experience-a6e99cf4aaea
- https://celiahodent.com/gamers-brain-ux-onboarding/
- https://game-wisdom.com/critical/onboarding
- https://userguiding.com/blog/video-game-onboarding
- https://thegeekinsights.com/how-to-make-gaming-tutorials/
- https://littlewargame.com/
