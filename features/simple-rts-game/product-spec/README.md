# Product Spec Index: Ten Minute War — Simple Browser RTS

> Status: DRAFT | Created: 2026-08-21 | Last updated: 2026-08-21
> Feature slug: `simple-rts-game`
> ← [Feature root](../README.md) · ← [Research](../research/README.md) · ← [Problem statement](../problem-discovery/problem-statement.md)

## What We're Building

A single-screen browser RTS that opens straight into a playable match and reaches
a definitive win or loss in roughly ten minutes. One resource, three combat units
on a plain cost/power ladder, no fog of war, no camera, no tutorial — the entire
strategic surface visible at once. The match is guaranteed to end because the ore
runs out.

## Document Map

| Document | Purpose | Detail | Status |
|----------|---------|--------|--------|
| [product-spec.md](./product-spec.md) | Main PRD — personas, 15 user stories, 26 functional requirements, **the hard v1 budget**, risks, decision log | Standard | DRAFT |
| [journeys/journeys.yml](./journeys/journeys.yml) | Authoritative structured journeys — E2E source of truth | 3 journeys · 16 steps · 12 edges | DRAFT |
| [journeys/JRN-001-first-match.md](./journeys/JRN-001-first-match.md) | Load → victory. **The journey that decides whether the product works** | smoke | DRAFT |
| [journeys/JRN-002-rematch.md](./journeys/JRN-002-rematch.md) | The rematch loop — our only retention mechanism | smoke | DRAFT |
| [journeys/JRN-003-under-attack.md](./journeys/JRN-003-under-attack.md) | Losing without noticing | — | DRAFT |
| [wireframes/](./wireframes/) | 3 screens, basic HTML with annotated rationale | basic-html | DRAFT |
| [metrics.md](./metrics.md) | 7 KPIs, guardrails, anti-metrics, and the R4 playtest gate | detailed | DRAFT |
| [../traceability.yml](../traceability.yml) | Seeded `journeys:` block (US → JRN → STEP/EDGE) | — | seeded |
| ~~mockups/~~ | **Not produced** — canvas game, no component library; a component map would be fiction | — | n/a |
| ~~design-system/manifest.yml~~ | **`not_applicable`** — the visual system is the Kenney CC0 sprite pack, documented in [research/assets.md](../research/assets.md) | — | n/a |

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Match-length pressure valve | **Finite ore nodes** | Diegetic, no UI, no timer, cheapest to make deterministic. Yields a natural boom → squeeze → decide arc. |
| Unit design | **Cost/power ladder, no counters** | Counters are invisible and only learnable by losing — unaffordable against first-minute legibility. |
| Tutorialisation | **None** | In a ten-minute game there is no "later" to teach in. Players arrive pre-trained on RTS grammar. |
| Difficulty | **Gate before play, 3 options** | Accepted cost to the cold-start advantage; labels self-declare experience and absorb some of the absent tutorial's job. |
| Map | **Fixed single screen, no camera** | Removes camera control, search, and fog in one stroke. Makes "enemy visible from frame one" literally true. |
| Structures | **Two; Factory is the only buildable** | Preserves the RTS "build" pillar with exactly one new interaction and one real economic decision. |
| Ownership cue | **Colour + underglow ring** | Resolves WCAG 1.4.1 against baked-in sprite colour; doubles as the selection affordance. |
| Measurement | **Local counters + playtest** | No backend, no analytics dependency. §V-compliant and honest for a game with no users. |
| Balance numbers | **Deliberately unspecified** | Feel is tuned, not specified (R4). The spec fixes the ladder's shape, not its values. |

## The v1 Budget

The substance of risk R3 — *"simple"* made falsifiable.

**In:** 1 resource · 4 unit types (Worker + 3 combat) · 2 structure types · 1 buildable · 1 fixed screen · 3 difficulty levels · 3 journeys.

**Out (non-goals, not backlog):** fog of war · unit counters · upgrades or tech tree · abilities · formations · a second resource · buildable Bases · terrain height · air or naval units · campaign · camera, scroll, or zoom · minimap · control groups · pause · settings menu · multiplayer of any kind · accounts or persistence · leaderboards · mobile or touch · monetisation · backend, API, or database · localisation · analytics provider.

Full list in [product-spec.md §7](./product-spec.md#7-out-of-scope-v1). Adding any of these back is a change request, not a decision.

## Must Read

> Start with [product-spec.md](./product-spec.md) — §4 (feature breakdown) and §7
> (out of scope) are the load-bearing sections. Then read
> [JRN-001](./journeys/JRN-001-first-match.md) and open the
> [wireframes](./wireframes/wireframe-match.html) in a browser; each carries the
> reasoning for its layout inline.
>
> The non-functional requirements in [§6](./product-spec.md#6-non-functional-requirements)
> are inherited from the project constitution (v1.1.0) and are **not negotiable at
> feature level** — their full derivation is the 13-row table in
> [research/codebase-analysis.md](../research/codebase-analysis.md).
