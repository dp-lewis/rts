# Phase Digest — Phase 2: Product Spec

> Feature: `simple-rts-game` · Phase: product_spec · Completed: 2026-08-21
> Mode: standard · Size: Medium · Detail: Standard

## Key Decisions

**Target user:** "The lapsed strategist" — a casual desktop browser player who has
played or watched an RTS but does not currently play one. They arrive already
knowing drag-select and right-click-to-move. That pre-training is the single most
valuable fact about them and is why no tutorial is needed.

**Scope boundary (risk R3, discharged).** "Simple" is now a hard written budget:
1 resource · 4 unit types (Worker + 3 combat) · 2 structure types · 1 buildable ·
1 fixed screen · 3 difficulty levels. The non-goal list runs to ~30 items across
gameplay, interface, and platform, and is explicitly framed as *non-goals, not
backlog* — adding one back is a change request.

**Seven product decisions taken at this phase:**

| Decision | Choice | Why |
|---|---|---|
| Pressure valve | Finite ore nodes | Diegetic, no UI, no timer, cheapest to make deterministic; gives a boom → squeeze → decide arc |
| Unit relationship | Cost/power ladder, **no counters** | Counters are invisible and only learnable by losing — unaffordable against first-minute legibility |
| Tutorialisation | None | In a ten-minute game there is no "later" to teach in |
| Difficulty | Three-option gate before play | Accepted cost to cold start; labels self-declare experience and absorb some of the absent tutorial's job |
| Map | Fixed single screen, no camera | Removes camera, search, and fog in one stroke; makes "enemy visible from frame one" literal |
| Structures | Two; Factory the only buildable | Keeps the RTS "build" pillar at the cost of exactly one interaction, and creates the central economic decision |
| Ownership cue | Colour + underglow ring | Resolves WCAG 1.4.1 against baked-in sprite colour; doubles as the selection affordance |

**Top 3 user stories:** US-001 (playable within seconds of load) · US-007 (whole
battlefield visible, no camera) · US-008 (decisive result in ~10 minutes).

**Journeys identified:** JRN-001 first match load→victory (smoke, 10 steps, 8
edges) · JRN-002 rematch loop (smoke) · JRN-003 losing without noticing.

**Design system: `not_applicable`.** This is a canvas game with no component
library. `design-system-harvest` was skipped and no `mockups/` or
`component-map.yml` was produced — for canvas-drawn units a component map would be
fiction, and downstream phases would be checking it against nothing real. The
visual system is the Kenney CC0 sprite pack, already documented in
`research/assets.md`. Stable `data-testid` selectors take the place of `CMP-` ids
in the journey steps.

## Artifacts Produced

| File | Description |
|---|---|
| `product-spec/product-spec.md` | Main PRD: persona, 15 user stories, 26 functional requirements, 10 NFRs inherited from the constitution, the ~30-item non-goal list, 10 risks, 5 open questions, 14-row decision log |
| `product-spec/journeys/journeys.yml` | **Authoritative** structured journeys — 3 journeys, 16 steps, 12 edges, runner `playwright-cli` |
| `product-spec/journeys/JRN-001-first-match.md` | Load → victory narrative; the journey that decides whether the product works |
| `product-spec/journeys/JRN-002-rematch.md` | Rematch loop — our only retention mechanism |
| `product-spec/journeys/JRN-003-under-attack.md` | Losing without noticing |
| `product-spec/wireframes/wireframe-difficulty-gate.html` | Screen 1 + rationale for why the gate exists at all |
| `product-spec/wireframes/wireframe-match.html` | Screen 2 — HUD, build bar, ore nodes, underglow ownership, under-attack band |
| `product-spec/wireframes/wireframe-result.html` | Screen 3 — Rematch-primary result |
| `product-spec/metrics.md` | 7 KPIs, 5 guardrails, 5 anti-metrics, honest "no valid external benchmark" position |
| `product-spec/README.md` | Index, key decisions, the v1 budget at a glance |
| `traceability.yml` | Seeded `journeys:` block — US → JRN → STEP/EDGE, `tests: []` left for test-plan |
| `README.md` (feature root) | Lifecycle status board and up-front constraints |
| `product-spec/digest.md` | This file |

## Open Risks

| # | Risk | Status |
|---|---|---|
| **RF-4 / R4** | **"Fun" has exactly one check (K1 comprehension playtest) and it is manual.** The six machine-checkable criteria will crowd it out unless the plan reserves a protected slot. Balance numbers were deliberately left unspecified for the same reason. **This is the risk most likely to be silently dropped.** | **Open — the plan must act on it** |
| RF-2 | A\* open-set tie-breaking is the highest-probability determinism defect. Now written as FR-022 (stable entity-id ordering + dedicated test). | Open, specified |
| RF-3 | Phaser's `update(time, delta)` idiom fights §I. Written as FR-003; needs a lint rule and an explicit plan note. | Open, specified |
| RF-5 | Single-player forgoes the retention mechanism every competitor leads with. Accepted; JRN-002 is the substitute loop. | Accepted |
| RF-6 | WebGL unavailable. FR-024 + JRN-001 EDGE-001. | Open, specified |
| New | **The difficulty gate erodes the cold-start advantage** — it is now the only thing between load and play. Mitigated to one tap with nothing else on screen; anti-metric added ("anyone closes the tab during the gate"). | Accepted trade-off |
| New | **Fixed single screen may feel cramped or toy-like.** ~20×11 tiles at 64px. Validate in playtest; escalating to a scrolling map would be a change request. | Open — playtest decides |

**Unresolved (5 open questions, all deliberate):** exact unit balance numbers ·
map layout and ore-node placement · final sprite id selection · whether the
project name "8 Bit RTS" still fits smooth-shaded sci-fi art · how much audio
ships beyond the two functional cues.

## Handoff Notes

**For revalidation (Phase 3):**
- The load-bearing sections are **§4 (feature breakdown)** and **§7 (out of scope)**. §7 is where R3 is actually discharged — if it is wrong or incomplete, nothing downstream can recover.
- Two decisions deserve a deliberate second look because they cut against a default: **no tutorial** and **fixed single screen, no camera**. Both are defensible and reasoned, both are unusual, and both are cheap to change now and expensive later.
- The difficulty gate is in tension with the no-tutorial decision — it is now the only pre-play friction. That tension is recorded rather than resolved, and revalidation is the right place to confirm the trade is wanted.

**For bridge (Phase 4):**
- 26 `FR-*` ids are already minted and are the natural spine of `spec.md`. They map cleanly onto the `US-*` stories.
- `journeys.yml` is **authoritative** — the markdown narratives must not introduce steps absent from the YAML. Test-plan generates Playwright specs from the YAML, not the prose.
- `traceability.yml` has a real `journeys:` block seeded (US → JRN → STEP/EDGE). Bridge and plan should add their columns rather than rewriting it. `tests: []` belongs to test-plan; row-level `status` belongs to tasks/implement.
- **NFR §6 is inherited, not authored.** It restates constitution v1.1.0 and is not negotiable at feature level. The 13-row derivation lives in `research/codebase-analysis.md` and should be consumed directly rather than re-derived.
- `API-*` and `CMP-*` are null throughout by design — no backend in v1 scope, no component library. Downstream verification should expect empty columns there, not treat them as gaps.

**For plan (Phase 5):**
- Two constitutional obligations need concrete design: the **canonical state-hash definition** (field order, entity ordering, exact float bits) and the **replay-corpus format**. Both must exist before the first bug fix, or §IV becomes unmeetable in practice.
- The **Complexity Tracking table starts empty.** Phase 0 and Phase 1 recorded zero accepted violations. Every later entry is therefore a visible, deliberate decision rather than accumulated drift.
- Reserve a **balance-tuning pass** and the **K1 playtest** as real scheduled work, not as polish. This is the single most important thing the plan can do for RF-4.
