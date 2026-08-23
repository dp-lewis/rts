# Code Review: Ten Minute War

> Feature: `simple-rts-game` | Date: 2026-08-22
> Files reviewed: 11 sim modules (2,010 LOC) + 14 test files | Tasks covered: 44/82 (M0–M3)
> Status: **NEEDS FIXES** → **RESOLVED 2026-08-22** (see Resolution at the foot)

> **Scope deviation.** `implement.status` is `milestone_complete`, not `completed`.
> Reviewed at the M3 boundary by explicit request; M4–M9 are out of scope.
>
> **Reviewer bias.** This is a self-review — the same model wrote every line under
> review, which is precisely the rationalization risk `--cross-model` exists to
> counter. Findings were therefore driven by *executable probes* wherever possible
> rather than by reading for intent. All four HIGH/CRITICAL findings below are
> reproduced by a runnable probe, not asserted from judgement.

## Machine gates

| Gate | Result |
|---|---|
| Lint (`eslint .`) | ✅ PASS |
| Types (`tsc --noEmit`) | ✅ PASS |
| SCA | ✅ PASS — 0 vulnerabilities across 192 deps (`osv-scanner` unavailable; `npm audit` used) |
| Coverage (`src/sim/**`) | ✅ PASS — 95.05% stmts, 100% funcs, 89.68% branches (Constitution III target ≥90%) |

Machine gates passed, so the judgment dimensions ran.

## Summary

| Dimension | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-----------|:--------:|:----:|:------:|:---:|:-----:|
| Quality | 0 | 0 | 2 | 1 | 3 |
| Security | 0 | 0 | 0 | 0 | 0 |
| Patterns | 0 | 0 | 1 | 0 | 1 |
| Tests | 0 | 1 | 0 | 0 | 1 |
| Doc↔Code | 2 | 2 | 1 | 0 | 5 |
| **Total** | **2** | **3** | **4** | **1** | **10** |

**Recommendation: FIX CRITICAL + HIGH BEFORE PROCEEDING TO M4.**

Security dimension is empty and that is correct, not an oversight: this feature has
no network, no persistence, no user-supplied strings, no auth, and no file I/O
(Express and MongoDB are explicit v1 non-goals). The only external input is a command
object, and REV-008 covers the one place that is unvalidated.

## The finding behind the findings

**Every M3 test constructs its preconditions directly in simulation state. Not one
test drives the system through the command layer.**

`runProduction` is exhaustively tested — 16 tests covering O-5, the free-Worker floor,
placement validity, id assignment. But every one of them hand-writes `queuedKind` into
a fixture. Nothing ever asked whether the only real-world producer of that field
actually sets it. It does not. The production system is thoroughly verified and
completely unreachable.

That is the shape of REV-001, REV-002 and REV-003, and it is a seam the coverage
number actively hides: 95% statements and 100% functions, with the entry point to
three of them broken.

## Findings

### REV-001: `build` commands never set `queuedKind` — no unit can ever be produced

| Field | Value |
|-------|-------|
| **Dimension** | Doc↔Code |
| **Severity** | **CRITICAL** |
| **File** | `src/sim/step.ts` — `applyCommands`, `case 'build'` |
| **Rule** | FR-011, FR-012, US-005, US-006 — the build bar must produce units |

**What:** The handler sets `state = BUILDING` and `progress = 0` but never records
*what* to build. `queuedKind` stays `-1`, so `runProduction` skips the producer on
every subsequent tick.

**Probe:**
```
Base, 5000 ore, build TROOPER at tick 0, run 400 ticks
  entities        : 1   (expected 2)
  base queuedKind : -1  (expected 4)
  base state      : 4   (BUILDING — permanently)
  ore spent       : 0
```

**Why it matters:** The entire production subsystem is unreachable from the only path
a player has to it. Three Must-have FRs are non-functional. The Base is also left in
`BUILDING` state forever, a state nothing ever clears.

**Suggested fix:**
```ts
case 'build': {
  const builder = findEntity(state.entities, command.builderId);
  if (builder === undefined || builder.state === ENTITY_STATE.DEAD) break;
  if (builder.queuedKind >= 0) break;        // already producing; ignore
  builder.queuedKind = command.kind;          // ← the missing line
  builder.state = ENTITY_STATE.BUILDING;
  builder.progress = 0;
  break;
}
```

### REV-002: a `build` command aimed at a Factory makes it re-run its own construction

| Field | Value |
|-------|-------|
| **Dimension** | Doc↔Code |
| **Severity** | **CRITICAL** |
| **File** | `src/sim/step.ts` `applyCommands` + `src/sim/production.ts` self-construction branch |
| **Rule** | A field must not carry two meanings distinguishable only by which system wrote last |

**What:** Because REV-001 leaves `queuedKind === -1` while setting `state = BUILDING`,
the producer matches `runProduction`'s "a Factory building ITSELF" branch. An operational
Factory told to build a Tank instead rebuilds itself over `BUILD_TICKS.factory` ticks
and returns to IDLE having produced nothing.

**Probe:** `entities: 2 (expected 3); factory state: 0 — it re-ran its own construction`

**Why it matters:** This is exactly the hazard M3's own digest flagged — *"a Factory
under construction reuses `progress`… one field with two meanings, which is the exact
shape of the `targetId` bug this milestone just fixed"* — biting in the same milestone
it was written down in. Fixing REV-001 masks it, but the ambiguity remains.

**Suggested fix:** distinguish self-construction explicitly rather than by inference,
e.g. a `KIND.FACTORY` sentinel in `queuedKind` while a Factory builds itself, or an
`UNDER_CONSTRUCTION` entity state distinct from `BUILDING`.

### REV-003: `move` commands are unhandled, and the comment explaining why is now false

| Field | Value |
|-------|-------|
| **Dimension** | Doc↔Code |
| **Severity** | **HIGH** |
| **File** | `src/sim/step.ts` — `applyCommands`, `case 'move'` |
| **Rule** | US-004, FR-020 — explicit orders must be obeyed |

**What:** The `case 'move'` body is empty, with a comment saying an Entity has no
destination field and *"M2 decides the field and amends ADR-001 in the same change."*
M2 did exactly that — `destX`/`destY` exist and are hashed (Amendment 2) — but nobody
returned to implement the handler. The comment is stale and reads as justification.

**Probe:** unit ordered to (1000,352); after 400 ticks `destX` is still `-1` and the
unit has not moved.

**Why it matters:** Half of US-004 is broken. Attack orders work, move orders are
silently discarded — the worst failure mode, since nothing reports it.

**Suggested fix:**
```ts
case 'move': {
  for (let u = 0; u < command.units.length; u += 1) {
    const unit = findEntity(state.entities, command.units[u]!);
    if (unit === undefined || unit.state === ENTITY_STATE.DEAD) continue;
    unit.destX = command.x;
    unit.destY = command.y;
    unit.gatherNodeId = -1;                   // an explicit order cancels gathering
    unit.state = ENTITY_STATE.MOVING;
  }
  break;
}
```

### REV-004: a destination inside a blocked cell degrades to straight-line movement through obstacles

| Field | Value |
|-------|-------|
| **Dimension** | Quality (correctness) |
| **Severity** | **HIGH** |
| **File** | `src/sim/step.ts` — `runMovement` |
| **Rule** | FR-031 / grid passability — units must not pass through structures |

**What:**
```ts
const path = isPassable(grid, goalCell) ? findPath(grid, fromCell, goalCell, entity.id) : [];
const nextCell = path[0];
if (nextCell !== undefined) { targetX = …; targetY = …; }
// else targetX/targetY remain entity.destX/destY — a straight line to the goal
```
When the goal cell is blocked the pathfinder is skipped entirely and the unit beelines
at the destination, ignoring every obstacle in between. The comment claims it will
*"walk to the cell edge"*; the code does no such thing.

**Probe:** a wall of Factories at column 10 with one gap at row 5. A worker returning
to deposit crossed column 10 at a **blocked** row.

**Why it matters:** Base cells are blocked, so this fires on *every worker return
trip* — workers pass through buildings routinely today. Once M6 lets players click a
move order onto an occupied tile, units walk through walls on demand. The same branch
also fires for genuinely unreachable goals, so a unit ordered somewhere it cannot
reach walks into the obstacle rather than refusing.

**Suggested fix:** path to the nearest passable neighbour of a blocked goal, and treat
an empty path from a *reachable* goal as "stay put" rather than "go straight".

### REV-005: `STAGES` claims to pin the pipeline contract but omits sudden death

> **STILL OPEN** as of the M6–M8 review (2026-08-22).

| Field | Value | |
|-------|-------|-|
| **Dimension** | Patterns · **Severity** MEDIUM · **File** `src/sim/step.ts` | |

`armSuddenDeath` and `suddenDeathDamage` run between stages 7 and 8 and appear nowhere
in `STAGES`, which `determinism.test.ts` asserts as *"the order plan.md fixes"*.
Reordering them relative to `collectDamage`/`applyDamage` — which would change match
outcomes — is invisible to the very test written to make pipeline changes visible.

### REV-006: `collectDamage` mutates state despite documenting that it does not

> **FIXED in M6** — doc corrected and the `cooldownTicks + 1` off-by-one repaired.

| Field | Value | |
|-------|-------|-|
| **Dimension** | Quality · **Severity** MEDIUM · **File** `src/sim/combat.ts:144,161` | |

Documented as *"works out what everyone would do and changes nothing"*, but it
decrements and resets `cooldown`. The test `collects damage without applying any of
it` asserts only on `hp`, so it passes while the stated contract is false. Secondary
effect: because cooldown is set on the firing tick and decremented from the next, the
real fire interval is `cooldownTicks + 1` — an off-by-one M8 would otherwise tune
around.

### REV-007: FR-012 has no command path at all

> **FIXED in M6** — the `place` command. Corpus case 003 replays one.

| Field | Value | |
|-------|-------|-|
| **Dimension** | Doc↔Code · **Severity** MEDIUM | |

*"Player may place additional Factories on valid ground"* is a **Must**. `isValidPlacement`
exists and is well tested, but its only caller is `spawnCell`; there is no `place`
command, so the requirement is unreachable. T039 delivered the validator without the
verb.

### REV-008: an out-of-range `kind` in a build command would NaN the simulation

> **ALREADY FIXED** by the M3 corrective pass; this entry was stale until the M6–M8 review (REV-021).

| Field | Value | |
|-------|-------|-|
| **Dimension** | Quality · **Severity** LOW (latent) · **File** `src/sim/production.ts` | |

`producer.queuedKind as Kind` is an unchecked cast. A command carrying `kind: 99`
yields `undefined` from `BUILD_TICKS_BY_KIND` / `COST_BY_KIND`; the comparisons go
false, `player.ore -= undefined` makes ore `NaN`, and the next `hashState` throws.
Unreachable today **only because REV-001 means `queuedKind` is never set from a
command** — fixing REV-001 makes this reachable, so fix both together.

## Positive highlights

1. **The "would this test fail if the guard were deleted?" discipline is real and has
   paid three times** — the M0 empty-config Red, the M1 import-error Red, and the M2
   discovery that all ten pathfinding tests passed with the A* tie-break removed. Very
   few codebases mutation-test their own guards; this one does it by habit.
2. **The determinism architecture is sound.** The per-field hash mutation sweep, the
   corpus reporting first divergence rather than terminal mismatch, and a regeneration
   script that *refuses* to touch cases at the current version are each the harder,
   correct choice over an easier one that would have looked identical when green.
3. **ADR-001's four amendments each record how the gap was found, not just what
   changed** — including Amendment 4's admission that the regression suite caught a
   defect two milestones later. That is unusually honest ADR writing and will be worth
   a great deal to whoever reads it in six months.

## Required before proceeding (CRITICAL + HIGH)

- [ ] REV-001 — set `queuedKind` in the build handler
- [ ] REV-002 — disambiguate Factory self-construction from production
- [ ] REV-003 — implement the move handler; delete the stale comment
- [ ] REV-004 — stop straight-lining through obstacles when the goal is blocked
- [ ] **Add end-to-end command-layer tests** (see gap analysis) — without these the
      same class of defect recurs in M4, where the AI becomes a second command source

## Test coverage gap analysis

| Requirement | Unit test | End-to-end via commands | Gap |
|---|:--:|:--:|---|
| FR-011/FR-012 production | ✅ 16 tests | ❌ | **The gap that hid REV-001/002** |
| US-004 move orders | ❌ | ❌ | No test anywhere; REV-003 |
| US-004 attack orders | ✅ | ✅ | Covered |
| FR-031 placement | ✅ | ❌ | No command exists (REV-007) |
| FR-004 command scheduling | ✅ | ✅ | Added this milestone |
| Movement vs obstacles | ❌ | ❌ | No test routes a unit around a wall; REV-004 |

**Note on the corpus:** `001-baseline.json` contains two `build` commands that are
silently no-ops, so its recorded hashes encode broken behaviour. Fixing REV-001 will
change them legitimately and require a deliberate `simVersion` bump and regeneration.

## Suggested canonical-spec updates (Theme G)

None. Every finding is code failing to meet the spec, not the spec failing to describe
the code. No `FR-*` text should change.

## Review checklist

- [x] All CRITICAL findings addressed
- [x] All HIGH findings addressed or acknowledged
- [x] No security vulnerabilities in new code
- [x] Machine gates pass
- [x] Test coverage adequate for Must Have stories — command-layer suite added

---

# Resolution (corrective pass, 2026-08-22)

All CRITICAL and HIGH findings fixed. **197 tests green** (was 179; +18).
`SIM_VERSION` 5 → 6, corpus regenerated deliberately.

| Finding | Fix |
|---|---|
| REV-001 | `applyCommands` sets `queuedKind`; ownership checked; a second order while busy is dropped rather than replacing the first |
| REV-002 | New `ENTITY_STATE.UNDER_CONSTRUCTION`, so self-construction is an explicit state instead of being inferred from `queuedKind === -1` |
| REV-003 | Move handler implemented; stale comment deleted; an explicit order clears `gatherNodeId` **and** the economy now leaves such workers alone |
| REV-004 | Blocked goals route to the nearest standable neighbour; an unreachable goal means **stay put**, never beeline |
| REV-008 | `isProducibleKind` validates at the command boundary — the simulation's only external input |
| Test gap | `tests/sim/command-layer.test.ts`, 17 tests, all driving the system through commands rather than hand-written state |

## Three further defects the fixes exposed

Fixing REV-004 removed a straight-line fallback that had been quietly masking two
latent bugs, and one design decision surfaced only once move orders worked.

1. **Workers were trapped inside their own Base.** `findPath` required a *passable
   start*, but units stand in a Base's blocked cell constantly. With the beeline gone
   they could not path anywhere at all — every worker in the suite stopped gathering.
   "Blocked" means a cell cannot be **entered**, not that a unit already there is
   stuck. Now only the goal must be passable.

2. **A pixel deposit range livelocked against cell-based movement.** A Base occupies a
   blocked cell, so a worker's closest legal position is an adjacent cell *centre* —
   but deposit distance was measured in pixels to the Base's own x/y. Whenever a Base
   was not exactly cell-centred the worker stood as close as it was permitted to get,
   was still "too far", and oscillated IDLE↔MOVING forever holding a full load. Silent:
   no error, no progress, just a worker that never banked again. Deposit is now cell
   adjacency, the same unit movement thinks in.

3. **The economy cancelled move orders on the tick they were issued.** Commands apply
   at stage 1 and the economy runs at stage 3, so it re-targeted the worker
   immediately and the order looked ignored. The loop only ever sets a destination
   *together with* a `gatherNodeId`, so a worker moving without one is under human
   orders — that is now the predicate, and arriving clears the order so the worker
   rejoins the workforce instead of being retired by one click.

Each was invisible while the straight-line fallback existed. Removing a lenient
fallback is how you find out what it was hiding.

---

# Code Review — M5 Presentation (2026-08-22)

> Files reviewed: 9 new source files (~640 LOC) + 5 new test files | Tasks covered: 56/82 (M0–M5)
> Reviewed delta: everything since the M3 corrective pass — M4 was not separately reviewed.
> Status: **NEEDS FIXES** → **RESOLVED** (all findings fixed in this pass; see each entry)

> **Scope deviation, again.** `implement.status` is `milestone_complete`. Reviewed at
> the M5 boundary by explicit request.
>
> **Reviewer bias, again.** Self-review. Every finding below except REV-011 was
> produced by an *executable probe* — a coverage run, a mutation, a grep for callers —
> rather than by reading for intent, for the reason the M3 review gives.

## Machine gates

| Gate | Result |
|---|---|
| Lint (`eslint .`) | ✅ PASS |
| Types (`tsc --noEmit`) | ✅ PASS |
| SCA | ✅ PASS — 0 vulnerabilities (`osv-scanner` unavailable; `npm audit --omit=dev`) |
| Coverage | ❌ **FAIL → fixed** — see REV-010. The reported 96.45% was measured over a file set that excluded every untested file. |

The coverage gate failed, which under the two-layer rule should stop the judgment
dimensions. It was fixed in place (REV-010) and the dimensions then ran.

## Summary

| Dimension | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-----------|:--------:|:----:|:------:|:---:|:-----:|
| Quality | 0 | 0 | 3 | 0 | 3 |
| Security | 0 | 0 | 0 | 0 | 0 |
| Patterns | 1 | 0 | 0 | 0 | 1 |
| Tests | 0 | 2 | 0 | 0 | 2 |
| Doc↔Code | 0 | 0 | 1 | 0 | 1 |
| **Total** | **1** | **2** | **4** | **0** | **7** |

**Recommendation:** all CRITICAL and HIGH addressed in this pass. **PROCEED.**

## Findings

### REV-009: player commands were drained on a tick `step()` would never apply them on

| Field | Value |
|-------|-------|
| **Dimension** | Patterns |
| **Severity** | CRITICAL |
| **File** | `src/game/scenes/Match.ts:101` |
| **Rule** | FR-004 / TC-UNIT-008 — a command applies on its own tick |

**What:** the scene drained the queue for `state.tick + 1` and passed the result to
`step(state, due)`. `applyCommands` skips any command whose `tick !== state.tick`, and
`step` applies commands *before* advancing the tick, so every drained command was
guaranteed to be skipped — and `drainCommands` had already removed it from the queue.

**Why it matters:** every player order would have been silently discarded. No error, no
warning, a match that looks completely normal and ignores the player. It is the same
defect the M3 review found ("the command layer never worked"), reappearing one layer
up — and it came from `plan.md`'s own sketch, which carries the same off-by-one.
Nothing in M5 could have caught it, because M5 has no input; it would have surfaced in
M6 as "right-click does nothing" with the cause two files away.

**Reference:** `replay.ts:102` is the working caller — `commands.filter((c) => c.tick === state.tick)`.

```ts
// Before
const [due, rest] = drainCommands(this.queue, this.state.tick + 1);

// After
const [due, rest] = drainCommands(this.queue, this.state.tick);
```

**Status:** ✅ FIXED. `tests/game/command-seam.test.ts` reproduces the scene's loop
headlessly and asserts a build order issued at tick N takes effect exactly once, stays
queued until its tick, and honours the one-tick latency. **Mutation-verified:** with the
off-by-one restored, 3 of 7 fail; restored, 7 pass.

### REV-010: the coverage report hid three files at 0%, one of them a simulation file

| Field | Value |
|-------|-------|
| **Dimension** | Tests |
| **Severity** | HIGH |
| **File** | `vitest.config.ts` (no `coverage` block) |
| **Rule** | Constitution III — ≥90% simulation coverage |

**What:** with no `coverage.include`, the v8 provider reports only files a test
imported. A file with no tests is not reported as 0% — it is **not reported at all**,
and the headline percentage is an average over exactly the files that were already
covered. The suite reported **96.45%**. Re-run with `include: ['src/**/*.ts']` it
reports **86.98%**, and three files appear that were previously invisible:

| File | Coverage |
|---|---|
| `src/game/render/world.ts` | 0% (148 lines) |
| `src/game/scenes/Match.ts` | 0% (113 lines) |
| `src/sim/setup.ts` | 0% |

**Why it matters:** `src/sim/setup.ts` is *simulation* code sitting at 0% behind a
number that claimed Constitution III was satisfied. And REV-009 lived in one of the
other two — an untested file that the coverage report said nothing about.

**Status:** ✅ FIXED. `vitest.config.ts` now sets an explicit `include` plus a
`src/sim/**` threshold block (90/85/90/90), so the constitutional floor is machine-
enforced rather than asserted. **Mutation-verified:** raising the glob threshold to 99
exits 1 with `Coverage for lines (97.23%) does not meet "src/sim/**/*.ts" threshold`.
`setup.ts` is now covered by `command-seam.test.ts`, which also asserts the opening is
in-bounds and mirrored — the M2-F2 defect, which was exactly this file's failure mode
one milestone earlier.

### REV-011: the coverage threshold would never have run

| Field | Value |
|-------|-------|
| **Dimension** | Tests |
| **Severity** | HIGH |
| **File** | `.github/workflows/ci.yml` |
| **Rule** | A gate nobody runs is not a gate |

**What:** CI runs lint, typecheck, unit, corpus, build and E2E — and never asks for
coverage. The threshold added in REV-010 would have sat in the config unexecuted.

**Why it matters:** identical in shape to the M0 boundary canary, whose entire lesson
was that an unenforced rule is decoration. Fixing REV-010 without this would have
produced a second one.

**Status:** ✅ FIXED. `test:coverage` script added and wired into CI after the unit step.

### REV-012: dead code in the renderer — the pattern flagged twice before

| Field | Value |
|-------|-------|
| **Dimension** | Quality |
| **Severity** | MEDIUM |
| **File** | `src/game/render/world.ts:175,180` |
| **Rule** | Dead code — a tested-or-exported abstraction with no users |

**What:** `ownershipLayer()` had zero callers (grep across `src/`, `tests/`, `scripts/`),
and `export { OWNER_TINT }` re-exported a constant every consumer already imports from
`assets/sprites`. Both were written speculatively "for T051", which then didn't need them.

**Why it matters:** this is the third instance of the same shape — M4-F1's `CommandQueue`
and the two the M3 review found. It is the codebase's most frequent smell.

**Status:** ✅ FIXED. Both removed.

### REV-013: `issue()` accepted command shapes that do not exist

| Field | Value |
|-------|-------|
| **Dimension** | Quality |
| **Severity** | MEDIUM |
| **File** | `src/game/scenes/Match.ts:80` |
| **Rule** | Types should make invalid states unrepresentable |

**What:** the parameter was typed `Omit<Command, 'tick'|'issuer'|'seq'> & Partial<Command>`.
`Omit` on a union collapses to the *shared* fields, and `Partial<Command>` then re-admits
every optional field from every variant — so `{ type: 'move', targetId: 5 }` type-checked,
despite no command having that shape. The `as Command` cast then silenced the rest.

**Why it matters:** `issue()` is the entry point M6's entire input layer will call. A
signature that accepts nonsense is a defect waiting for its first caller.

```ts
// After — distributive, so the three variants stay separate
type Unscheduled<C> = C extends Command ? Omit<C, 'tick' | 'issuer' | 'seq'> : never;
export type PlayerIntent = Unscheduled<Command>;
```

**Status:** ✅ FIXED. The remaining cast is on the *output* only and is justified in a
comment: spreading a union member plus the scheduling fields is a `Command` by
construction, but TypeScript cannot re-narrow across a spread. Also swapped the literal
`issuer: 0` for `ISSUER.PLAYER`.

### REV-014: the match scene threw if started without data

| Field | Value |
|-------|-------|
| **Dimension** | Quality |
| **Severity** | MEDIUM |
| **File** | `src/game/scenes/Match.ts:66` |
| **Rule** | Error handling — lifecycle callbacks must not assume their caller |

**What:** `create(config: MatchConfig)` read `config.seed` directly. Phaser calls
`create` with whatever data the caller passed, including nothing — and a scene listed in
the game config is auto-started with no data.

**Why it matters:** it does not currently fire (verified in-browser: `create` ran exactly
once with valid data, display list 222), but T069's rematch restarts this scene and is
the obvious place to trip it. Failing inside a Phaser lifecycle callback produces a stack
that points at Phaser, not at the caller.

**Status:** ✅ FIXED. `create(config?: Partial<MatchConfig>)` merges over a `DEFAULT_MATCH`.

### REV-015: `src/sim/setup.ts` is owned by no task and no requirement

| Field | Value |
|-------|-------|
| **Dimension** | Doc↔Code |
| **Severity** | MEDIUM |
| **File** | `src/sim/setup.ts` |
| **Rule** | Every significant code path maps to a documented requirement or task |

**What:** the standard skirmish opening is real simulation behaviour — starting units,
ore node placement, map symmetry — introduced because T047 needed a match to start and
recorded in no task's `Paths:` and against no FR.

**Why it matters:** it duplicates layout knowledge corpus case 001 holds inline, and only
the corpus copy is hashed (M5-F6). If the opening changes, 001 keeps certifying a layout
the game no longer produces — which is precisely M2-F2, already found once.

**Status:** ⚠️ ACKNOWLEDGED. Now covered by tests (in-bounds, mirrored, both sides
equipped) and recorded in `traceability.yml` under FR-014. The duplication with corpus
001 is left open as M5-F6; resolving it means deriving the corpus case from `createMatch`,
which changes hashes and needs a deliberate `simVersion` bump.

## Positive highlights

- **The accumulator's test suite found a defect no reviewer would have.** The
  144 Hz-vs-30 Hz equivalence assertion caught floating-point drift making the tick
  rate monitor-dependent. Written before the implementation, and the only assertion in
  the file capable of catching it.
- **`jitter.test.ts` asserts a relationship between two files' constants**, which is the
  only form in which the ring/offset invariant is visible. The kind of test that is
  usually skipped because "the screenshot looked fine".
- **`spriteManifest()` is derived from `KIND`, not hand-listed**, so a kind added
  without art throws at load rather than drawing nothing.
- **The T081 spike was run against the shipping renderer, not a mock**, which is why it
  found a real jitter defect instead of confirming a mock's behaviour.

## Test coverage gap analysis

| Requirement | Test status | Gap |
|---|:---:|---|
| FR-003 accumulator | ✅ | 19 assertions incl. frame-rate equivalence |
| FR-004 command seam | ✅ | added this pass (REV-009) |
| FR-014 fixed screen | ⚠️ | `world.ts` at 0% — verified visually and in `dist/`, not by test |
| FR-015 sprite roster | ✅ | manifest checked against filesystem |
| FR-018 ownership cue | ✅ | presence-not-hue pinned; separation asserted numerically |

**Remaining gap:** `world.ts` (0%) and `Match.ts` (0% outside the extracted seam) have no
unit tests — both need a Phaser scene. This is what Phase 8's Playwright E2E suite is
for; flagged rather than papered over with a mock that would assert its own stubs.

## Review checklist

- [x] All CRITICAL findings addressed — REV-009 fixed and mutation-verified
- [x] All HIGH findings addressed — REV-010, REV-011 fixed and mutation-verified
- [x] Test coverage adequate for Must Have stories — with the `world.ts` gap noted above
- [x] No security vulnerabilities in new code — no new attack surface (no network, no
      storage, no user-supplied strings; the feature is client-side and offline)

---

# Code Review — M6, M7, M8 (2026-08-22)

> Reviewed delta: `160d404..HEAD` — 47 files, ~3830 insertions. Three milestones:
> the input layer and the `place` command, the DOM migration and E2E suite, and the
> balance tuning pass.
> Status: **APPROVED WITH CONDITIONS** — 1 defect found and fixed, 3 accepted risks.

> **Reviewer bias.** Self-review again. Findings were driven by executable probes
> wherever possible — a coverage run, a browser probe, a timing measurement, and
> tests written against untested logic — rather than by reading for intent. Two
> suspicions were *disproved* by probing and are recorded as such, because a
> review that only reports confirmations is not measuring its own false-positive
> rate.

## Machine gates

| Gate | Result |
|---|---|
| Lint (`eslint .`) | ✅ PASS |
| Types (`tsc --noEmit`) | ✅ PASS |
| SCA (`npm audit --omit=dev`) | ✅ PASS — 0 vulnerabilities |
| Coverage (`src/sim/**` ≥ 90/85/90/90) | ✅ PASS — 98.06% stmts, 93.46% branches |
| E2E (42 specs, incl. axe WCAG-AA) | ✅ PASS against the tuned build |

## Summary

| Dimension | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-----------|:--------:|:----:|:------:|:---:|:-----:|
| Quality | 0 | 0 | 2 | 1 | 3 |
| Security | 0 | 0 | 0 | 0 | 0 |
| Patterns | 0 | 0 | 0 | 1 | 1 |
| Tests | 0 | 0 | 2 | 0 | 2 |
| Doc↔Code | 0 | 0 | 1 | 0 | 1 |
| **Total** | **0** | **0** | **5** | **2** | **7** |

**Recommendation: PROCEED to M9.** No CRITICAL or HIGH. The one genuine defect is
fixed and covered.

## Findings

### REV-016: corrupt stored counters silently poisoned every reading

| Field | Value |
|-------|-------|
| **Dimension** | Quality · **Severity** MEDIUM · **File** `src/game/hud/counters.ts` |
| **Rule** | Data from outside the program is input, and gets validated like input |

**What:** `SessionCounters` loaded storage with `{ ...empty(), ...JSON.parse(raw) }`.
A spread fills MISSING keys but accepts a PRESENT one of any type, so a stored
`{"matchesStarted":"lots"}` survived, and the next `+= 1` produced the string
`"lots1"`. Subsequent reads were strings or `NaN`.

**Why it matters:** these are the numbers M8's tuning and M9's playtest are meant to
read. A `NaN` time-to-first-action is silently wrong rather than obviously wrong, and
nothing looks at these until a playtest does — by which point the session is spent.
Storage is genuinely outside the program's control: another tab, a hand edit, a partial
write, an older build.

**Status:** ✅ FIXED. A `hydrate()` coercion validates every field.
`tests/game/counters.test.ts` (11 cases) covers it, plus storage that throws on read and
on write — private browsing and quota-exceeded both do.

### REV-017: the counter arrays grew without bound in localStorage

| Field | Value |
|-------|-------|
| **Dimension** | Quality · **Severity** LOW · **File** `src/game/hud/counters.ts` |

**What:** `timeToFirstAction` and `durationTicks` appended per match and were persisted
in full, forever.

**Why it matters:** "for a bounded game the rematch button IS the retention loop" — the
product is designed to be replayed in long sittings, and localStorage's failure mode on
quota is a throw, not a warning.

**Status:** ✅ FIXED. Capped at the 200 most recent samples; the aggregate counts are not
samples and survive intact.

### REV-018: pure logic sat at 0% because it lived beside framework code

| Field | Value |
|-------|-------|
| **Dimension** | Tests · **Severity** MEDIUM · **Files** `hud/counters.ts`, `scenes/Result.ts` |

**What:** `SessionCounters` is pure except for two `localStorage` calls, and
`formatDuration` is entirely pure. Both were untested, reported at 0%, purely because
they live in directories full of Phaser and DOM classes.

**Why it matters:** this is the third instance of one pattern — M6-F3 split
`placement.ts` and `buildbar.ts` for the same reason, and M7's finding was that a
decision trapped beside a framework is a decision nobody can test. It recurred
immediately in the next milestone's new files.

**Status:** ✅ PARTIALLY FIXED. 17 tests added; `formatDuration` passed everything
including the `6m 60s` rounding trap. The framework-bound remainder (`world.ts`,
`Match.ts`, `main.ts`, `buildbar.ts`, `alert.ts`, `ghost.ts`) stays at 0% and is covered
by E2E — see the accepted risk below.

### REV-019: the M8 duration test made the unit suite five times slower

| Field | Value |
|-------|-------|
| **Dimension** | Tests · **Severity** MEDIUM (accepted) · **File** `tests/sim/duration.test.ts` |

**What:** 30 full matches run at module scope. The unit suite went from ~1.2 s to 6.57 s,
of which 5.39 s is this file.

**Why it matters:** this project's discipline depends on running the suite constantly.
A 5× slowdown is how that habit erodes. Because the matches run in the `describe` body,
they also execute during collection even when a single test in the file is selected.

**Status:** ⚠️ ACCEPTED. 6.6 s is still fast in absolute terms, and what it buys is
executable verification of the product's central claim. Recorded with the numbers so the
next person to add a slow suite knows the budget they are spending. Escalation path if
the suite grows: move the run into `beforeAll` and gate the full 30 behind CI.

### REV-020: two clocks are mixed in the alert band

| Field | Value |
|-------|-------|
| **Dimension** | Patterns · **Severity** LOW · **Files** `hud/alert.ts`, `main.ts` |

**What:** the game calls `alerts.update(state, this.time.now)` with Phaser's clock; the
E2E hook calls it with `performance.now()`. The latch compares the two.

**Why it matters:** correct today, and by specification rather than luck — `requestAnimationFrame`
timestamps are `DOMHighResTimeStamp` and share `performance.now()`'s time origin, and
Phaser derives `time.now` from the rAF timestamp. But nothing says so at either call
site, and a future change to how the scene sources its clock would break the latch in a
way only an intermittent E2E failure would reveal.

**Status:** ⚠️ ACCEPTED, noted here rather than papered over with a comment that would
claim more certainty than the arrangement deserves.

### REV-021: `code-review.md` listed REV-008 as open after it was fixed

| Field | Value |
|-------|-------|
| **Dimension** | Doc↔Code · **Severity** MEDIUM · **File** `code-review.md` |

**What:** REV-008 (an unchecked `kind` cast that would `NaN` the simulation) was fixed by
the M3 corrective pass, but the review document was never updated. M6 planned work to
fix it and discovered the fix already present — the test written for it passed on its
first run.

**Why it matters:** a stale review document costs a later milestone real time and, worse,
invites someone to "fix" something twice. The same is now true of REV-005/REV-006:
REV-006 was fixed in M6, REV-007 in M6, and neither entry says so.

**Status:** ✅ FIXED below — see *Prior findings, reconciled*.

## Suspicions that probing disproved

Recorded because a review that reports only its confirmations has no measurable
false-positive rate.

- **Pointer handlers accumulating across rematches.** `MatchScene.create` re-runs
  `installInput()` on every rematch, which would double-issue every command. Probed in
  the browser: one right-click produced exactly one queued command both before and after
  three rematches (`{"before":0,"after":1}`). Phaser clears scene input on shutdown.
- **A systematic advantage to player 1.** M8's harness showed p1 winning 18/18 and a
  probe appeared to confirm an engine-level asymmetry. Both were artefacts — the harness
  had no second player, and the probe let p1's Base build a free Worker (pre-impl F-6)
  while p0's did nothing. A traced mirrored duel kills both units on tick 145, O-6
  exactly as designed.

## Prior findings, reconciled

| Finding | Status |
|---|---|
| REV-005 `STAGES` omits sudden death | **still open** — `armSuddenDeath` / `suddenDeathDamage` remain absent from the tuple `determinism.test.ts` asserts as the pipeline contract |
| REV-006 `collectDamage` documented as pure while mutating | **fixed in M6** — doc corrected and the `cooldownTicks + 1` off-by-one repaired |
| REV-007 FR-012 has no command path | **fixed in M6** — the `place` command; corpus case 003 now replays one |
| REV-008 unchecked `kind` would `NaN` the simulation | **already fixed in the M3 corrective pass**; this document was stale |

## Positive highlights

- **M8 discarded its own first measurement.** The harness reported 1.5-minute matches
  and p1 winning 18/18; recognising that as a broken instrument rather than a balance
  result is the single most valuable thing that happened in these three milestones.
- **The exit criterion became a test.** `duration.test.ts` fails the build outside the
  6–10 band, so the product's central claim cannot quietly drift.
- **Three pure decision functions** — `selectInRect`, `orderFor`, `placementAt` — take
  simulation state and a point and import no Phaser, which is why M6's input layer is
  tested at all.
- **The a11y suite has a control test** asserting axe found real nodes, which is the
  difference between a WCAG floor and a WCAG-shaped hole.

## Review checklist

- [x] All CRITICAL findings addressed — none found
- [x] All HIGH findings addressed — none found
- [x] Test coverage adequate for Must Have stories — `src/sim` 98.06%; framework-bound
      presentation covered by 42 E2E specs
- [x] No security vulnerabilities in new code — no network, no storage of user data, no
      user-supplied strings rendered; the `?test=1` hook is asserted absent without the flag
