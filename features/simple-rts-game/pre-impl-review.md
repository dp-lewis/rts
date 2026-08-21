# Pre-Implementation Review: Ten Minute War

> Feature: `simple-rts-game` · Phase 5C · Date: 2026-08-21
> **Scope: focused.** Untested assumptions and a consolidated risk register.
> Architecture is deliberately *not* re-treaded — it has already passed two
> Constitution Check gates (5/5 each), a determinism lens over every Must-Have
> acceptance criterion, an ordering audit, an adversarial task-ordering pass, and
> sync-verify at Layers 1 and 2.

## Method

Four review passes have already run and between them caught ten defects. Repeating
their questions would mostly reproduce their answers. So this review asks a different
question of the design:

> **Which load-bearing assumptions has nobody actually checked?**

Ten were identified and interrogated. Seven hold. **Three do not**, and one of those
threatens the product's central promise.

---

## Findings

### 🔴 F-1 — Ore exhaustion does not actually guarantee the match ends

**Severity: HIGH.** This is the most important finding in the review.

The entire "ten minutes, guaranteed" promise rests on finite ore as a pressure valve
(FR-016). The reasoning recorded in Phase 2 was: ore runs out → production halts → the
match resolves with the forces on the field.

**The middle step does not imply the last one.** Ore exhaustion halts *production*. It
does not force *resolution*. Consider two players who each turtle with a comparable
surviving force after ore is gone: neither can build, neither can profitably attack,
and the only defined terminator is Base destruction (FR-017). Nothing in the
simulation ends that match. It runs until someone closes the tab.

This is reachable, not theoretical — mutual attrition to a rough stalemate is a
*normal* RTS outcome, and it becomes more likely, not less, once production stops and
both sides are down to whatever they had.

**Why four review passes missed it:** every one of them checked the artifacts for
internal consistency, and FR-016 and FR-017 *are* internally consistent. The gap is
between them — a state the requirements jointly fail to cover. Consistency checking
cannot find a missing state; only asking "what happens if…" can.

**Recommended fix — a backstop, not a second valve.** Phase 2 deliberately rejected a
soft timer as the *primary* valve, and that decision stands: a visible countdown makes
the clock the opponent. A backstop is a different thing — invisible in the normal case,
engaging only in the stalemate the primary valve cannot resolve. Options:

| Option | Shape | Assessment |
|---|---|---|
| **Sudden death** *(recommended)* | N ticks after **both** sides' ore is exhausted, all Bases begin taking escalating damage | Invisible in a normal match; diegetic; forces resolution without a clock. Deterministic (a tick counter in sim state). |
| Attrition scoring | At a hard tick cap, the side with more surviving value wins | Simple, but converts a decisive game into a points decision — a poor fit for "the satisfaction of a plan working out". |
| Accept the hole | Document it and move on | Not viable. It voids the product's one differentiating promise. |

**This needs a change request, not a plan edit** — it changes what FR-016/FR-017 mean
and adds a match-end condition, which is spec-level. See "Required action" below.

---

### 🔴 F-2 — Unit collision and crowding are entirely unspecified

**Severity: HIGH.**

`FR-030` defines a collision *circle*, but only for **selection**. Nothing anywhere —
spec, plan, or tasks — says whether units **collide with each other** when moving.

This is not a detail. It is a fork with large consequences in both directions:

- **Units do not collide** — they pass through and stack. Trivial to implement, trivially deterministic, and A\* stays a pure grid search. But 40 units converging on one target become a visually illegible pile, which directly attacks the legibility the whole design is built on.
- **Units do collide** — requires local avoidance or separation on top of A\*, which is a real system with real determinism hazards (every separation calculation is another "pick the nearest/first" site — likely **ordering hazard O-8**). It is also the classic source of RTS unit-jamming bugs.

The plan's rejection of flow fields was correct and remains so, but it answered a
*pathfinding* question and left the *collision* question unasked.

**Recommendation:** units do **not** collide in v1 (no separation system), with soft
visual jitter at render time only — a presentation-layer offset that never touches sim
state. This preserves determinism, keeps A\* pure, and is consistent with §V. Whether
the resulting pile is legible enough becomes an explicit M9 playtest question.

---

### 🔴 F-3 — Nothing validates that "New to this" is winnable by a novice

**Severity: HIGH.**

The difficulty gate's entire justification (Phase 2) was that a first-timer must be
able to win. Yet:

- **M8** tunes *match duration* — exit criterion is the 6–10 minute band.
- **M9** tests *comprehension* — exit criterion is ≥4 of 5 understanding what to do.
- **Nothing tests beatability.**

A player can understand exactly what to do and still lose every match to an AI written
by someone who knows the game intimately. That is the single most common failure mode
in solo game development, and the current task list would not catch it. Both K1 and the
duration KPI could pass on a build that is comprehensively unfun.

**Recommendation:** extend M9's exit criterion to cover it — *≥3 of 5 first-time
players win at least one match on "New to this"*. It is the same playtest session, the
same observation, one more thing recorded. Near-zero marginal cost.

---

### 🟡 F-4 — Tab-backgrounding / accumulator catch-up policy is undefined

**Severity: MEDIUM.**

`plan.md` specifies `MAX_STEPS_PER_FRAME` as a spiral-of-death guard, but not what
happens across a *long* stall. Browsers throttle or suspend `requestAnimationFrame` in
background tabs; a player who switches away for five minutes returns to an accumulator
holding ~300 seconds of unsimulated time.

With only a per-frame cap, the simulation grinds through the backlog over many frames —
the player watches minutes of gameplay fast-forward past them, having lost the match
during it. That is worse than either honest alternative.

**Recommendation:** clamp the accumulator to a small ceiling (e.g. 250 ms) and **drop**
the excess. In single-player, wall-clock time carries no meaning — the simulation is
authoritative and simply continues from where it was. This is a presentation-layer
decision that does not touch sim determinism, and it belongs in `loop.ts` (T048).

---

### 🟡 F-5 — Unit cap and map size are in tension

**Severity: MEDIUM.**

The NFR targets "stable frame rate with ~60 simultaneous units". The map is 20×11 =
**220 cells**, of which roughly 20 are consumed by structures and ore nodes.

Sixty units is **27% occupancy of the whole map** — and they will not be evenly spread;
they cluster at chokepoints and around bases. Combined with F-2 (no collision), a
late-game engagement is a heap of overlapping sprites on a screen with no camera to
zoom out of.

Notably, "~60 units" was never a design decision. It arrived as a *performance* target
in an NFR and has been treated as a design constraint ever since. Nobody has asked what
unit count actually makes the game legible.

**Recommendation:** treat unit count as an M8 tuning variable with a legibility ceiling,
not a performance floor. Make unit costs high enough that ~25–30 units per side is the
realistic maximum. Record the intent so M8 tunes toward legibility rather than toward
the 60 that performance permits.

---

### 🟡 F-6 — Worker wipeout is an unspecified soft-lock

**Severity: MEDIUM.**

If a player loses every Worker and holds less ore than a Worker costs, they can never
gather again and never rebuild. They are not defeated — the Base still stands — but
they cannot act. The match becomes a formality the player must sit through.

**Recommendation:** the Base always affords at least one Worker — either Workers cost
zero from a Base with none alive, or the Base slowly auto-spawns a Worker when a player
has none. The first is simpler and fully deterministic. Small rule, removes a dead state.

---

### 🟢 F-7 — Underglow ring legibility is unverified at real sprite scale

**Severity: LOW.**

FR-018's underglow ring is the sole non-colour ownership cue and therefore the whole
WCAG 1.4.1 mitigation. The Kenney sprites are 64×64 canvases, but the *drawn unit*
occupies materially less than that — infantry appear to be roughly 30 px. A ring around
a 30 px sprite, on a textured background, among other units, is a genuinely tight
legibility budget that has never been looked at.

**Recommendation:** a 30-minute spike at the start of M5 (before T051) — render a dozen
mixed friendly/enemy units and check the ring reads at a glance, including in
greyscale. Cheap, and it de-risks the accessibility claim before it is built on.

---

## Assumptions that held

| # | Assumption | Verdict |
|---|---|---|
| A-1 | 20 Hz tick rate is responsive enough | ✅ Holds. ~100 ms worst-case command latency is well within RTS norms; StarCraft shipped at coarser turn rates. |
| A-2 | Grid A\* is sufficient at our scale | ✅ Holds comfortably. 220 cells is a trivial search space; even pathological repathing is negligible. *(The crowding consequence is F-2, not a pathfinding problem.)* |
| A-3 | Corpus runtime stays manageable | ✅ Holds. 20 full-match cases × 12,000 ticks × 3 platforms ≈ 720,000 tick-executions per CI run — seconds, not minutes. |
| A-4 | Command-log size per case is reasonable | ✅ Holds. A few hundred commands per match; tens of KB of diffable JSON. |
| A-5 | `simVersion` covers AI logic changes | ✅ Holds. AI is simulation code, so behavioural changes bump `simVersion` like any other. |
| A-6 | One runtime dependency is achievable | ✅ Holds. Nothing in the design needs a second. |
| A-7 | Exact-bit float hashing is portable across the three platforms | ✅ Holds in principle — `DataView` semantics are specified. **M1 is where it is actually proven**, and it remains the correct first real gate. |

---

## Consolidated Risk Register

| ID | Risk | Prob. | Impact | Owner phase | Mitigation |
|----|------|:-----:|:------:|---|---|
| **F-1** | Stalemate after ore exhaustion never resolves | Med | **High** | Change request → M3 | Sudden-death backstop |
| **F-2** | Unit crowding illegible / collision unspecified | High | **High** | Decision now → M2 | No collision in v1; render-only jitter; M9 validates |
| **F-3** | "New to this" not actually winnable | Med | **High** | M9 | Extend M9 exit criterion |
| **F-4** | Background-tab catch-up fast-forwards the match | High | Med | M5 (T048) | Clamp accumulator, drop excess |
| **F-5** | Unit cap vs map size | Med | Med | M8 | Tune toward legibility, not the perf ceiling |
| **F-6** | Worker wipeout soft-lock | Low | Med | M3 | Base always affords one Worker |
| **F-7** | Underglow ring unreadable at real scale | Med | Low | M5 spike | 30-min greyscale check before T051 |
| RF-2 | A\* tie-break divergence | Med | High | M2 | T026 (carried) |
| RF-3 | Phaser `delta` leaks into sim | Med | High | M0/M5 | Lint + isolated `loop.ts` (carried) |
| RF-4 | "Fun" crowded out by machine-checkable criteria | High | High | M9 | M9 blocks completion (carried) |
| — | Float divergence surfaces at M1 | Med | High | M1 | Expected and wanted; fix it, never loosen the hash (carried) |

---

## Required action before implementation

**F-1 requires a change request.** It adds a match-end condition, which changes the
meaning of FR-016 and FR-017 — spec-level, and the spec is LOCKED. Per the note
recorded at Phase 3 approval, changes to locked artifacts go through
`/speckit.product-forge.change-request` so impact across `spec.md`, `plan.md`, and
`tasks.md` is analysed rather than assumed.

**F-2, F-3, F-4, F-5, F-6 can be absorbed at plan/task level** — they add or refine
tasks without changing what the product promises.

**F-7 is a spike**, not a decision.

---

## Verdict

**The design is sound and the architecture needs no rework** — unsurprising after two
Constitution Check gates. But this review found **three HIGH findings that four prior
passes did not**, and the reason is instructive: every earlier pass verified that the
artifacts were *consistent with each other*. F-1, F-2, and F-3 are each a **missing
state** rather than a contradiction — a question the requirements never asked. No
amount of cross-artifact checking surfaces those; only interrogating assumptions does.

F-1 alone justifies the phase: shipping without it means the product's single
differentiating promise — a match that reliably ends in about ten minutes — is not
actually guaranteed by anything in the simulation.
