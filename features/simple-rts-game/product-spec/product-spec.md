# Product Spec: Ten Minute War — Simple Browser RTS

> Status: DRAFT | Version: 1.0 | Date: 2026-08-21
> Feature: `simple-rts-game` | Size: Medium | Detail: Standard
>
> **Related:** [Journeys](./journeys/) · [Wireframes](./wireframes/) · [Metrics](./metrics.md) · [Research →](../research/README.md) · [Problem statement →](../problem-discovery/problem-statement.md)

## 1. Overview

### Problem Statement

A casual player who wants a real-time strategy fix in a spare 15 minutes has no
maintained browser RTS that delivers a complete match arc. The credible options
are a multi-gigabyte install with 30–60 minute matches, or a dead Flash-era clone.
The genre's satisfying arc — gather → build → army → win — is locked behind a
commitment the casual session cannot pay.

Severity is honestly modest (4/10, validation Weak). The competing-forces analysis
found Push + Pull ≈ Inertia + Anxiety: **the problem is not painful enough to pull
players in on its own, because the alternative — playing something else — is free
and works fine.** Everything in this spec follows from that single fact.

### Solution Summary

A single-screen browser RTS that opens straight into a playable match and reaches
a definitive win or loss in roughly ten minutes. One resource, three combat units
on a plain cost/power ladder, no fog of war, no camera, no tutorial. The entire
strategic surface is visible at once, and the match is guaranteed to end because
the ore runs out.

### Background & Research

- **Competitors** — Browser RTS is *contested but not at our session length*. BrowserRTS, Honest War, and Littlewargame all compete on scale, persistence, and multiplayer. Nobody targets a short, finishable match. Decisively: **Littlewargame ships with gold as its only resource and reviewers cite that reduction as a strength** — shipped precedent for our economy design.
- **UX/UI** — Most players quit within the first ten minutes. In a *ten-minute game* that statistic collapses into a design rule: **the first-run experience and the game are the same thing.** There is no "later" in which to teach.
- **Technical** — Greenfield repo. The constitution supplies 13 binding constraints and is the only pre-existing fact. Determinism costs a lint rule and a squared-distance habit, **not fixed-point math**: IEEE 754 requires correct rounding for `+ - * /` and `sqrt`, but only *recommends* it for transcendentals, which are therefore forbidden in simulation code (Constitution §I, v1.1.0).
- **Assets** — Kenney "RTS Pack: Sci-Fi" (CC0) is in-repo: 48 unit / 16 structure / 42 tile sprites, uniform 64×64. Art direction is settled and the 64px module is handed to the simulation for free.

> Full research: [research/README.md](../research/README.md)

## 2. Users & Personas

### Primary Persona — "the lapsed strategist"

**Context:** Desktop browser, 10–20 spare minutes, mid-afternoon or evening gap.
**Background:** Has played or watched an RTS at some point — StarCraft, Age of
Empires, Command & Conquer. Does not currently play one. Arrives already knowing
drag-select and right-click-to-move; this is the single most valuable thing about
them and the reason no tutorial is needed.
**Goals:** Feel clever. Watch a decision compound into a win. Finish something.
**Frustrations:** Installs. Tutorial campaigns. Matchmaking queues. Forty-minute
matches. Being outpaced by someone with better APM.
**Will not tolerate:** An account wall, a loading screen that reads as broken, or
being confused at second 45 — because closing the tab costs them nothing.

No secondary persona in v1. Competitive RTS players are explicitly not served.

## 3. User Stories

### Must Have (v1)

- [ ] **US-001** — As a player, I want the game to be playable within seconds of loading, so that I never have to invest before I know if I like it. **AC:** From page load to an **interactive match** — commands issuable — is ≤10 s including the difficulty gate; no account, no lobby, no tutorial. *(Distinct from metric K2, which measures the player's **observed** first action from page load against a <30 s target. Both are measured from page load; they are different quantities with different thresholds — see [metrics.md](./metrics.md).)*
- [ ] **US-002** — As a player, I want to declare my experience level before starting, so that the match is winnable for someone at my level. **AC:** A one-tap, three-option gate is the only thing between load and match. The chosen difficulty is a **field of the match's initial simulation state**, stored alongside the RNG seed — *not* encoded into the seed integer — and written into the replay header, so a replay reproduces AI behaviour exactly.
- [ ] **US-003** — As a player, I want my workers to gather automatically from the start, so that I am never doing chores in the first thirty seconds. **AC:** Starting workers move to the nearest own-side ore node and begin gathering on tick 0 without any player input. **"Nearest" means least squared Euclidean distance** (no `sqrt` call needed), and **ties resolve by ascending ore-node id** — never by iteration or array order (Constitution §I).
- [ ] **US-004** — As a player, I want to select units by dragging and order them by right-clicking, so that I can play immediately using what I already know. **AC:** Drag-rectangle selects every own unit whose **collision circle** (position + radius) intersects the rectangle — not its sprite bounds, so selection is independent of art. Right-click issues move (empty ground) or attack (enemy entity); both are acknowledged visually within one rendered frame.
- [ ] **US-005** — As a player, I want to train combat units from a permanently visible build bar, so that I never hunt through menus. **AC:** Build bar shows exactly **five** entries — four unit entries (Worker, Scout, Trooper, Tank) plus one structure entry (Factory), with the structure **visually separated** from the units. Always on screen, never nested; unaffordable entries are greyed with cost shown, never hidden and never a dialog.
- [ ] **US-006** — As a player, I want to build additional factories, so that I can trade economy now for production later. **AC:** One placeable structure type; placement is a click on valid ground with a live ghost preview; invalid placement is shown inline, not as an error. **Valid ground** = every tile in the structure's full 64 px footprint is passable terrain, wholly inside map bounds, and occupied by no other structure and no unit.
- [ ] **US-007** — As a player, I want to see the whole battlefield at once, so that I never have to search for the enemy or manage a camera. **AC:** Fixed single-screen map, no scrolling, no minimap, no fog. Both bases visible from the first frame.
- [ ] **US-008** — As a player, I want the match to end decisively in about ten minutes, so that it fits the time I actually have. **AC:** Destroying the enemy Base wins; losing your own Base loses. **If both Bases reach zero hit points on the same tick the match is a Draw** — an explicit third verdict rather than an arbitrary tie-break. Ore nodes are finite, so production necessarily halts. <!-- CR-001: ore exhaustion halts production but does not force resolution --> **When every ore node on the map is depleted, a sudden-death backstop arms: after a grace period all Bases take escalating damage until one falls.** Median duration 6–10 min; p90 < 15 min.
- [ ] **US-009** — As a player, I want to tell my units from the enemy's at a glance without relying on colour, so that the game is readable regardless of colour vision. **AC:** Every friendly unit carries a persistent non-colour ownership cue (underglow ring); enemies do not. Verified against WCAG 2.1 AA §1.4.1.
- [ ] **US-010** — As a player, I want to restart instantly when the match ends, so that the good outcome is "again", not "leave". **AC:** Result screen's primary and largest action is Rematch; one click returns to a fresh match at the same difficulty.

### Should Have

- [ ] **US-011** — As a player, I want to know when my base is under attack, so that I do not lose without noticing. **AC:** Screen-edge indicator plus audio cue when an enemy unit damages any owned entity.
- [ ] **US-012** — As a player on a machine without WebGL, I want an honest explanation, so that I am not staring at a blank rectangle. **AC:** A plain, human-readable message replaces the canvas when renderer init fails.

### Could Have (post-v1)

- [ ] **US-013** — Share a match by seed so someone else can play or watch the same match. *(The replay machinery is constitutionally mandatory anyway — surfacing it is nearly free differentiation. Deliberately not v1.)*
- [ ] **US-014** — Difficulty change from the result screen without returning to the gate.
- [ ] **US-015** — Sound and music beyond the two functional cues.

## 4. Feature Breakdown

### 4.1 Difficulty Gate

**Description:** The only thing between page load and play. Three large buttons, nothing else on screen.
**Key interactions:** One click. No back, no settings, no scroll.
**Labels self-declare experience** rather than naming abstract tiers — *"New to this"* / *"I've played RTS before"* / *"Bring it"* — which is the onboarding literature's recommended pattern and does the small amount of teaching that the absent tutorial would otherwise do.
**Edge cases:** Keyboard-only selection must work (arrow/tab + enter). Direct deep-link with a difficulty parameter skips the gate.

### 4.2 Economy

**Description:** One resource, **Ore**. Workers walk to an ore node, extract for a fixed number of ticks, walk back to the Base, and deposit. Ore nodes hold a finite amount and visibly deplete.
**Key interactions:** None required — workers auto-assign on spawn to the node of least squared distance, ties resolved by ascending node id. Manual reassignment is possible but never necessary.
**Why finite:** This is the match-length pressure valve. It is diegetic, needs no UI, requires no timer, and creates a natural three-act shape — boom, squeeze, decide. It is also the cheapest valve to make deterministic: a counter in simulation state.
**Edge cases:** All own nodes exhausted → workers idle at Base (they must not thrash or pathfind endlessly). Node exhausted while a worker is en route → worker retargets to the remaining own node of least squared distance, ties by ascending node id. <!-- CR-001 --> **All nodes on the map exhausted → sudden death arms.** Halting production is not the same as ending the match: two players who turtle to a rough stalemate after ore is gone have no terminator without this.

### 4.3 Units — the cost/power ladder

Four unit types total: one economic, three combat. The three combat units form a
plain cost/power ladder with **no counter matrix** — the sprite and the price tell
the player everything, which is what makes a tutorial unnecessary.

| Unit | Role | Cost | Speed | HP | Damage | Legibility cue |
|---|---|---|---|---|---|---|
| **Worker** | Gathers ore; cannot fight | lowest | medium | very low | none | Small civilian silhouette |
| **Scout** | Cheap, fast, fragile | low | fast | low | low | Infantry silhouette |
| **Trooper** | The staple | medium | medium | medium | medium | Larger infantry / light vehicle |
| **Tank** | Slow, expensive, dominant | high | slow | high | high | Tracked vehicle, visibly biggest |

> Exact numeric balance is deliberately **not fixed here**. Balance is tuned by
> playing, not by specifying (this is risk R4). The spec fixes the *shape* — a
> strict monotonic ladder — and the plan must protect a tuning pass.

**Explicitly rejected:** a rock-paper-scissors counter triangle. It is the
genre-authentic choice and adds real depth, but counters are *invisible* — the
player can only learn them by losing, which costs precisely the first-minute
legibility that our competing-forces analysis says is make-or-break.

### 4.4 Structures

Two types only.

| Structure | Function | Notes |
|---|---|---|
| **Base** | Ore drop-off; trains Workers; **its destruction ends the match** | One per side, pre-placed at start |
| **Factory** | Trains Scout / Trooper / Tank | One pre-placed per side; more may be built |

Building additional Factories is the only construction action in the game. It
preserves the "build" pillar of the RTS arc with exactly one new interaction, and
creates the match's central economic decision: **more production capacity, or more
units right now?**

**Edge cases:** Placement overlapping terrain, another structure, or a unit is
refused with an inline ghost-state cue. Factory destroyed mid-production → queued
ore is refunded (deterministically, on the same tick).

### 4.5 Combat

Units auto-acquire and attack enemies within range; explicit attack orders
override. No formations, no stances, no abilities, no upgrades, no veterancy.
**Edge cases:** Two units acquiring the same target on the same tick must resolve
in a stable, id-ordered way — not by iteration accident (Constitution §I).

### 4.6 Result & Rematch

Full-screen, unambiguous **Victory**, **Defeat**, or **Draw** (simultaneous Base
destruction — rare but a real branch, so it is specified rather than left to an
arbitrary tie-break), match duration shown, and one dominant action: **Rematch**.

<!-- CR-001 -->
**Sudden death adds no fourth verdict.** It applies damage to both Bases; whichever
has less hit points falls first, producing an ordinary Victory or Defeat. If they are
exactly equal they fall on the same tick and the existing Draw rule already covers it. A bounded game's retention loop is the rematch
button; nothing else competes with it for prominence.

## 5. Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Page load presents the difficulty gate and nothing else | Must | US-002 |
| FR-002 | Selecting a difficulty starts a match immediately | Must | US-002 |
| FR-003 | Simulation advances in fixed-timestep ticks, decoupled from render frames | Must | Constitution §I |
| FR-004 | All player intent enters the simulation as commands queued for a future tick | Must | Constitution §II |
| FR-005 | All randomness derives from a seed held inside simulation state | Must | Constitution §I |
| FR-006 | Starting workers auto-gather from tick 0 with no player input | Must | US-003 |
| FR-007 | Drag-rectangle selects all own units intersecting it | Must | US-004 |
| FR-008 | Right-click issues move on ground, attack on enemy entity | Must | US-004 |
| FR-009 | Command issue is visually acknowledged within one rendered frame | Must | Presentation-layer only; must not affect sim timing |
| FR-010 | Build bar shows exactly 5 entries — 4 unit + 1 structure, visually separated — always visible, never nested | Must | US-005 |
| FR-011 | Unaffordable build entries are greyed inline with cost shown | Must | Never a dialog |
| FR-012 | Player may place additional Factories on valid ground | Must | US-006 |
| FR-013 | Invalid placement is indicated by ghost state, not an error dialog | Must | US-006 |
| FR-014 | Map is a fixed single screen: no scrolling, no camera, no minimap | Must | US-007 |
| FR-015 | No fog of war; both bases visible from the first frame | Must | US-007 |
| FR-016 | Ore nodes hold finite amounts and visibly deplete | Must | US-008, pressure valve |
| FR-017 | Destroying the enemy Base wins; losing own Base loses | Must | US-008 |
| FR-027 | Ore-node selection resolves by least squared distance, ties by ascending node id | Must | US-003, Constitution §I |
| FR-028 | Simultaneous Base destruction on one tick resolves as an explicit **Draw** | Must | US-008 |
| FR-029 | Difficulty is a field of initial simulation state and appears in the replay header | Must | US-002 |
| FR-030 | Selection tests against unit collision circles, not sprite bounds | Must | US-004 |
| FR-031 | Valid placement = full footprint passable, in-bounds, unoccupied by structure or unit | Must | US-006 |
| FR-018 | Every friendly unit carries a persistent non-colour ownership cue | Must | US-009, WCAG 1.4.1 |
| FR-019 | Result screen's primary action is Rematch | Must | US-010 |
| FR-020 | Units auto-acquire enemies in range; explicit orders override | Must | §4.5 |
| FR-021 | Target acquisition ties resolve by stable entity id | Must | Constitution §I — see RF-2 |
| FR-022 | A* open-set ties resolve by stable entity id | Must | Constitution §I — RF-2, highest-probability determinism defect |
| FR-023 | Screen-edge indicator + audio cue when an owned entity takes damage | Should | US-011 |
| FR-024 | Honest fallback message when WebGL is unavailable | Should | US-012, RF-6 |
| FR-025 | Local counters record time-to-first-action, duration, completion, rematch | Should | [metrics.md](./metrics.md) |
| FR-026 | Difficulty gate is operable by keyboard alone | Should | WCAG 2.1.1 |

## 6. Non-Functional Requirements

These are inherited from the project constitution (v1.1.0) and are **not
negotiable at feature level**. The full 13-row derivation is in
[codebase-analysis.md](../research/codebase-analysis.md).

| Category | Requirement |
|---|---|
| **Determinism** | Same seed + same command log ⇒ bit-identical state hash on `ubuntu-latest` (Node LTS), `macos-latest` (Node LTS), and Chromium. Verified by automated test, not review. (§I) |
| **Forbidden in sim** | Wall-clock/frame-delta time, unseeded randomness, unordered iteration, and all transcendentals (`sin`/`cos`/`tan`/`atan2`/`asin`/`acos`/`log`/`exp`/`pow`). Enforced by lint, not vigilance. (§I) |
| **Layering** | Simulation must not import rendering, audio, input, windowing, or UI. Presentation reads sim state and must never mutate it. Enforced by import boundary. (§II) |
| **Headless** | Simulation must run under plain Node with no graphics context, decoupled from real time. (§II) |
| **Test-first** | Red-Green-Refactor, strictly ordered. No production code without a test that fails in its absence. Test tasks are never optional. (§III) |
| **Regression** | Every fixed gameplay/sim defect lands with a recorded command log and expected terminal state hash; CI replays the full corpus every run. (§IV) |
| **Simplicity** | Every abstraction, config point, and third-party dependency requires a demonstrated present need. Runtime dependencies target: **Phaser alone.** (§V) |
| **Performance** | Time to first render < 3 s on a mid-tier laptop. Stable frame rate with ~60 simultaneous units. |
| **Accessibility** | WCAG 2.1 AA for the DOM surfaces (gate, result, fallback). Ownership never conveyed by colour alone (1.4.1). **The canvas is not screen-reader accessible; this limit is stated, not papered over.** |
| **Licensing** | Art is CC0 (Kenney). Credit given though not required. |

## 7. Out of Scope (v1)

This list is the substance of risk R3 — "simple" made falsifiable. Anything here
is a **non-goal**, not a backlog item, and adding one back is a change request.

**Gameplay:** fog of war · unit counters / rock-paper-scissors · upgrades, tech
tree, veterancy · abilities or special powers · formations or stances · more than
one resource · more than 3 combat unit types · more than 2 structure types ·
buildable Bases · unit repair or healing · terrain height or cover · naval or air
units · campaign, missions, or story.

**Interface:** camera control, scrolling, or zoom · minimap · control groups ·
build queues beyond one item · replay viewer UI · settings menu · pause.

**Platform & product:** multiplayer of any kind (local or networked) · accounts,
profiles, or persistence · leaderboards · mobile or touch support · monetisation ·
backend, API, or database (Express and MongoDB are out of v1 scope despite
appearing in project config) · localisation (English only) · analytics provider.

## 8. Success Criteria

1. A first-time player, given no instruction, starts a match and **understands what to do without being told** — measured by 4 of 5 playtesters. *This is the only check on the "fun" goal and it is deliberately human.*
2. Median match duration lands in the **6–10 minute** band; p90 under 15 minutes.
3. **≥70%** of started matches reach a definitive win or loss.
4. **≥40%** of completed matches are followed by a rematch.
5. Time to first meaningful action **< 30 s**, gate included.
6. The determinism corpus passes **100%** on all three supported platforms, always.
7. The codebase ships with **Phaser as its only runtime dependency**.

## 9. Risks & Mitigations

| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| **RF-2** A\* open-set tie-breaking diverges silently across platforms | Med | **High** | FR-022: stable id ordering + a dedicated determinism test. Highest-probability determinism defect in the project. |
| **RF-4** "Fun" is crowded out by machine-checkable criteria | **High** | High | Success criterion #1 is a blocking playtest gate; the plan must reserve a tuning pass. Balance numbers deliberately left unspecified in §4.3. |
| **RF-3** Phaser's `update(time, delta)` idiom fights §I | Med | High | Lint ban on frame-delta in sim + an explicit accumulator note in the plan. Every Phaser tutorial pulls the wrong way. |
| **R2** Player closes the tab at second 45 | Med | High | No tutorial, no camera, no fog, auto-gather, flat build bar, both bases visible from frame one. |
| Difficulty gate erodes the cold-start advantage | Med | Med | One tap, three buttons, nothing else on screen. **Accepted trade-off** — see Decision Log. |
| **RF-5** Single-player forgoes the category's retention mechanism | High | Med | Accepted for v1. Rematch button is the substitute loop. Recorded as a knowing decision. |
| **RF-8** Baked-in team colour violates WCAG 1.4.1 | High | Med | FR-018 underglow ring. Resolved in design, not deferred. |
| Fixed single screen feels cramped or toy-like | Med | Med | 64px tiles at ~1280×720 gives ~20×11 — small but sufficient. Validate in the playtest; escalating to a scrolling map is a change request. |
| **RF-6** WebGL unavailable | Low | Med | FR-024 honest fallback. |
| Balance tuning consumes unbounded time | Med | Med | Timebox the tuning pass; ship at "beatable and legible", not "perfectly balanced". |

## 10. Open Questions

1. **Exact unit balance numbers** — deliberately deferred to a tuning pass. The spec fixes the ladder's shape, not its values.
2. **Map layout** — symmetric mirrored bases is the safe default; the precise ore-node placement and count is a tuning variable that directly sets match length.
3. **Final sprite selection** — the roster is specified by *role*; sprite ids get picked visually during implementation from the 48 available. Candidates observed: infantry ~`scifiUnit_01–04`, vehicles ~`05–09`, tanks ~`11`, worker ~`12`; structures ~`scifiStructure_01` (Base), `_05` (Factory).
4. ~~**Is the project name still right?**~~ **RESOLVED 2026-08-21 — renamed "8 Bit RTS" → "Ten Minute War".** The old name promised pixel art the Kenney sprites do not deliver. The new one states the differentiator: research found the vacant niche is *session length*, not genre, so the name now carries the positioning. See [review.md](../review.md).
5. **Audio** — two functional cues are specified (US-011). Whether any further sound ships in v1 is unresolved.

## 11. Decision Log

| Decision | Rationale | Date |
|---|---|---|
| Track: `standard` | Greenfield multi-module product with a hard determinism contract | 2026-08-21 |
| Scope: local single-player vs AI; no backend | Smallest path honouring the determinism constitution; Express/MongoDB deferred | 2026-08-21 |
| Comply fully with Constitution §I, §II, §IV | §I/§II are near-free at greenfield and ruinous to retrofit; §II *is* the "clean, extensible codebase" goal | 2026-08-21 |
| Constitution amended to v1.1.0 | RF-1: "every supported platform" was unfalsifiable; now enumerated as Node×2 OS + Chromium | 2026-08-21 |
| **Pressure valve: finite ore nodes** | Diegetic, no UI, no timer, cheapest to make deterministic; yields a natural boom-squeeze-decide arc | 2026-08-21 |
| **Units: cost/power ladder, no counters** | Counters are invisible and only learnable by losing — unaffordable against first-minute legibility | 2026-08-21 |
| **No tutorial** | In a 10-minute game there is no "later" to teach in; players arrive pre-trained on RTS grammar | 2026-08-21 |
| **Difficulty gate before play** | Accepted cost to the cold-start advantage; labels self-declare experience and absorb some of the absent tutorial's job | 2026-08-21 |
| **Fixed single screen, no camera** | Removes camera control, search, and fog in one stroke; makes "enemy visible from frame one" literally true | 2026-08-21 |
| **Two structures; Factory is the only buildable** | Preserves the RTS "build" pillar with exactly one new interaction and one real economic decision | 2026-08-21 |
| **Ownership: colour + underglow ring** | Resolves WCAG 1.4.1 against baked-in sprite colour; doubles as the selection affordance | 2026-08-21 |
| **Measurement: local counters + playtest** | No backend, no analytics dependency; §V-compliant and honest for a game with no users | 2026-08-21 |
| Balance numbers left unspecified | Feel is tuned, not specified (R4); spec fixes shape only | 2026-08-21 |
| No design-system harvest, no component map | Canvas game with no component library; a component map would be fiction | 2026-08-21 |
