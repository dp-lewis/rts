# ADR-001: Canonical state hash

> Status: **Accepted** · Date: 2026-08-21 · Feature: `simple-rts-game`
> **Amended 2026-08-22 (Amendments 1–5)** — see the Amendments section.
> Discharges bridge-gate obligation 1. Required by Constitution §I and §IV.

## Context

Constitution §I requires that the same seed plus the same command log produce a
**bit-identical state hash on every supported platform** (Node LTS on
`ubuntu-latest` and `macos-latest`, plus Chromium), verifiable by automated test.

A hash is only as good as what it covers and how it treats floats. Get this wrong
and §IV's replay corpus becomes theatre: green builds that prove nothing.

## Decision

### What is hashed

Exactly the simulation state, in a fixed order:

1. `tick` (uint32)
2. `rngState` (the PRNG's full internal state — see ADR note below)
3. `verdict` (uint8 enum: 0 none, 1 victory, 2 defeat, 3 draw)
4. Per player, ordered by player id ascending: `ore` (uint32)
5. Per ore node, ordered by **node id ascending**: `id`, `remaining`
4b. Per player, the two indicator flags `underAttack`, `suddenDeathDamage`
   (uint8 each) — *added by Amendment 3*
6. Per entity, ordered by **entity id ascending**: `id`, `kind`, `owner`, `x`, `y`,
   `hp`, `stateEnum`, `targetId`, `cooldown`, `progress`, `destX`, `destY`,
   `queuedKind`, `gatherNodeId`
   *(`destX`/`destY` added by Amendment 2, `queuedKind` by Amendment 3,
   `gatherNodeId` by Amendment 4)*
7. `difficulty` (uint8) — *added by Amendment 1*
8. `nextEntityId` (uint32) — *added by Amendment 1*
9. `suddenDeathAt` (int32, -1 until armed) — *added by Amendment 3*
10. `aiSeq` (uint32) and the scheduled-command queue, in issue order — *added by
    Amendment 5*

Entity and node collections are stored as arrays kept sorted by id, so "iterate in
id order" is the natural traversal, not a sort performed at hash time. Sorting at
hash time would mask an ordering bug elsewhere in the tick — the exact bug class
this project keeps finding (FR-021, FR-022, FR-027).

### What is NOT hashed

Anything presentational or derived: interpolation alpha, sprite ids, camera,
selection, animation timers, audio state, HUD, the debug overlay's counters, and
any memoised or cached value derivable from the fields above. If a cached value can
diverge from its source, the cache is the bug — the hash should catch it through
the source, not launder it.

### How numbers are encoded

Floats are hashed as their **exact IEEE-754 double bits**, via a `DataView` over a
scratch `ArrayBuffer` (`setFloat64(0, v, true)` — little-endian fixed, not
platform-native).

**Rounding before hashing is explicitly rejected.** It is the tempting shortcut and
it defeats the entire principle: rounding hides precisely the sub-ulp divergence
that §I exists to detect, and it would let a genuinely non-deterministic simulation
report green forever. If float divergence appears, that is a *finding*, not noise
to be filtered.

`-0` is normalised to `0` before encoding (they are `===` equal but have different
bits, and no simulation rule should distinguish them). `NaN` must never enter sim
state; a hash encountering `NaN` throws rather than hashing it, because it always
indicates a defect.

### Hash function

**FNV-1a, 32-bit, run as two independent lanes** with different offset bases, and
concatenated into a 64-bit lowercase hex string.

Rationale: ~20 vendored lines, no dependency (Constitution §V), and no reliance on
`crypto` (unavailable identically in Node and browser without ceremony). One 32-bit
lane has an uncomfortable collision profile for a corpus that will grow; two lanes
give 64 bits, which is ample for divergence detection. This is not a security hash
and does not need to be.

## Consequences

**Good.** Cheap, portable, dependency-free, and identical in Node and the browser.
Exact-bit hashing means the corpus genuinely tests what §I promises.

**Costly.** Any *intentional* change to simulation behaviour invalidates every
recorded hash. This is the part of §IV that projects discover too late — see
[ADR-002](./ADR-002-replay-corpus.md) for the regeneration procedure, which is
deliberately manual and reviewed.

**Risk accepted.** Exact-bit hashing will surface real cross-platform float
divergence if any exists. That is the intent, but it means a red CI on day one is
possible and must be treated as a genuine determinism defect to fix — never as a
reason to loosen the hash.

## Amendments

### Amendment 1 — `difficulty` and `nextEntityId` (2026-08-22, during M1)

**What changed.** Fields 7 and 8 were added to the hashed list. They are appended
*after* the original six rather than inserted in semantic position, so the change is
purely additive and the original ordering is untouched.

**Why.** This ADR opens by saying it hashes "exactly the simulation state", and then
lists fields that omit two members of `SimState`. Neither omission is defensible under
this ADR's own "What is NOT hashed" rule, which covers only presentational and derived
values:

- **`nextEntityId`** is not derived. Two states identical in every other respect but
  differing in this counter will produce different entity ids at the very next spawn,
  and therefore diverge — but a hash omitting it would report them as identical, and
  the corpus would not catch the divergence until it manifested somewhere else
  entirely, many ticks later and far from its cause.
- **`difficulty`** is a field precisely so it can vary independently of the seed
  (FR-029). A corpus case replayed at the wrong difficulty could otherwise match its
  early checkpoints and diverge only once the AI's behaviour differed enough to show.

This reads as a drafting gap rather than a deliberate exclusion: the decision text
states the correct principle and the field list simply fails to enumerate it fully.

**How it was found.** Writing `tests/sim/hash.test.ts` in M1 as an adversarial
per-field mutation sweep — one assertion per hashed field, each checking the hash
*moves* when that field moves. Enumerating the fields to sweep is what exposed the two
that the ADR's list did not mention.

**Cost.** None yet. The amendment landed in M1 alongside the hash's first
implementation, before any corpus case existed to be invalidated. Had it been found
one milestone later it would have required a `simVersion` bump and a full corpus
regeneration.

**Reverting.** Two lines in `src/sim/hash.ts`, one assertion in `tests/sim/hash.test.ts`,
a `simVersion` bump, and `npm run corpus:regen`.

### Amendment 2 — `destX` / `destY`, and the decision to store no path (2026-08-22, start of M2)

**What changed.** Each entity gained a move destination in world px, `destX` and
`destY`, appended to the end of the per-entity field list. `SIM_VERSION` went 1 → 2 and
the corpus was regenerated deliberately; all four recorded hashes changed, which is the
expected size of diff for two new hashed fields per entity.

**Why it was needed.** The original data model had nowhere to record where a unit was
going. `step()` could accept a `move` command and do nothing with it, which is what M1
shipped — with the `case 'move':` left deliberately empty and commented rather than
silently defaulted. The gap was found in M1 and, per the M1 gate decision, resolved by
the milestone that owns movement rather than guessed at earlier.

**The larger decision: no path is stored.** A destination is hashed state; a *path* is
not stored at all, anywhere.

- Pre-impl review F-2 settled that **units do not collide in v1**, so A\* stays a pure
  static grid search.
- The grid is static apart from buildings, so a path is a pure function of
  (current cell, goal cell, grid) — fully recomputable from hashed state.
- The map is a fixed single screen of ~20×11 tiles. A\* over ~220 cells for at most
  60 units at 20 Hz is microseconds, so recomputing costs nothing worth optimising.

Storing a path would therefore be a cache keyed on a position that has since moved —
precisely the "cached value that can diverge from its source" this ADR calls a bug. And
a stored path would itself have to be hashed (two states with identical positions but
different remaining paths behave differently), which would mean a variable-length array
inside an otherwise fixed-width per-entity encoding. Both costs, no benefit.

**Sentinel.** `-1` on both axes means "no destination". `0` is a legal coordinate, so
neither `0` nor `null` would do; a test asserts that "no destination" and "destination
at the origin" hash differently.

**Fixtures.** Adding a required field to `Entity` would have broken every literal
construction in the tests and every corpus case at once. `EntitySeed` was introduced at
the same time: id, kind, owner, and position are required, everything else defaults.
Future field additions are now additive for callers rather than a sweep.

### Amendment 3 — production, sudden death, and the indicator flags (2026-08-22, M3)

**What changed.** `queuedKind` per entity, `suddenDeathAt` on the state, and the two
per-player flags `underAttack` / `suddenDeathDamage`. `SIM_VERSION` 3 → 4.

**`queuedKind`.** Production needs to know *what* a producer is building, and
`progress` only says how far along it is. Ore is spent on completion rather than at
queue time, which is what makes O-5 real, so the queued item has to survive across
ticks in hashed state.

**`suddenDeathAt`.** The grace period and the damage ramp are both measured from the
tick sudden death armed, and "when did every node run dry" is not recoverable from a
later state — every node reads zero forever afterwards. It has to be recorded.

**The two indicator flags, and why they are hashed.** These are the one genuinely
debatable addition in this ADR's history, because they exist to drive a screen-edge
indicator and this document says presentational things are not hashed.

They are hashed anyway, and the reason is FR-033. A Base destroyed by the
sudden-death backstop must NOT read as "under attack", because there is no attacker
and the player would go looking for an enemy that does not exist — in a game with no
camera to go looking with. The flags therefore encode *what happened in the
simulation*, not how it is drawn. A system that set the wrong one would replay
identically, the corpus would stay green, and the indicator would lie forever.

The line this ADR draws is between presentational and simulated, not between
"visible" and "invisible". These are simulated.

### Amendment 4 — `gatherNodeId`, splitting an overloaded field (2026-08-22, M3)

**What changed.** Workers gained a dedicated `gatherNodeId`; `targetId` now belongs to
combat alone. `SIM_VERSION` 4 → 5.

**Why.** In M2 the worker's ore node was stored in `targetId`, and that worked for
exactly as long as nothing else used the field. The moment combat arrived,
`acquireTargets` cleared `targetId` every tick for any worker with no enemy nearby —
silently cancelling the gather order on the next tick.

**How it was found.** An M2 economy test ("sends an idle worker toward a node without
any command") started failing the moment combat was wired into the tick. It is the
clearest return the regression suite has produced so far: a milestone-old test caught
a defect introduced two milestones later, in a completely different file.

**The real lesson** is that `targetId` was holding two different id spaces — entity ids
and ore node ids — distinguishable only by which system last wrote to it. That the
sentinel `-1` and the fact that entity ids start at 1 would have hidden the collision
in most scenarios makes it worse, not better: it would have surfaced as a rare,
seed-dependent stall rather than an obvious break.

### Amendment 5 — scheduled commands and `aiSeq` (2026-08-22, M4)

**What changed.** `SimState` gained `pending: Command[]` — commands the AI has
scheduled for a future tick — and `aiSeq`, its monotonic per-issuer counter. Both are
hashed. `SIM_VERSION` 6 → 7.

**Why they exist at all.** The AI issues COMMANDS scheduled for the next tick, exactly
as the player's intent does (FR-004), rather than reaching into the simulation
directly. It therefore gets no privileged access and no lower latency than a human. But
`step` is pure, so a decision made on tick T has to survive in the returned state to be
applied on T+1. That is what `pending` is.

`aiSeq` is the `seq` half of O-4's `(issuer, seq)` ordering. It lives in state rather
than in a module counter for the same reason the PRNG does: two simulations running in
one process — which is exactly what the corpus runner does — must not interleave their
sequence numbers.

**Why they are hashed.** The AI's plan determines what happens next. Hashing it catches
a divergence in *planning* on the tick it occurs, rather than a tick later when it
finally manifests as a different unit doing a different thing. The delay would be
harmless for a terminal hash and actively unhelpful for a checkpoint, whose whole job
is localisation.

**The variable-length problem.** This is the first hashed field that is not
fixed-width, which is a real departure from the per-entity encoding. It is handled by
hashing the length first and then each command in array order — which is issue order —
with a type code before the payload so that a `move` and an `attack` carrying identical
numbers cannot collide. Tests assert each of those separately.

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Round floats to N decimals before hashing | Hides the exact divergence §I exists to detect. Would produce false confidence. |
| `JSON.stringify` then hash the string | Key order is insertion-dependent, and number formatting is a second, subtler determinism surface. More moving parts, no benefit. |
| SHA-256 via WebCrypto | Async in the browser, sync in Node — different call shapes for identical semantics. Overkill for divergence detection. |
| Fixed-point arithmetic throughout the sim | Unnecessary. Research established that `+ - * /` and `sqrt` are correctly rounded under IEEE 754; only transcendentals are implementation-defined, and those are banned in sim by Constitution §I. |
| Hash only at match end | Divergence would be detected but not localised. Checkpoints (ADR-002) are what make a failure diagnosable. |
| Omit `nextEntityId` and `difficulty` (the original field list) | Rejected by Amendment 1. Both are simulation state, neither is presentational or derived, and omitting them lets a genuine divergence go unreported until it surfaces far from its cause. |
| Store the computed path on each entity | Rejected by Amendment 2. It is a cache keyed on a position that has since moved, and it would need hashing (identical positions with different remaining paths behave differently), forcing a variable-length array into a fixed-width per-entity encoding. Recomputing A\* over ~220 cells is microseconds. |
| Use `0` or `null` for "no destination" | Rejected by Amendment 2. `0` is a legal coordinate, and `null` breaks the sentinels-not-optionals rule that keeps the hash encoding branch-free. |
| Treat the under-attack / sudden-death flags as presentational and leave them unhashed | Rejected by Amendment 3. They record what happened in the simulation, not how it is drawn. FR-033 depends on the two being distinguishable, and an unhashed flag set wrongly would replay green forever while the indicator lied. |
| Keep one `targetId` for both combat targets and ore nodes | Rejected by Amendment 4. Two id spaces in one field, distinguishable only by which system wrote last. Combat cleared it out from under the economy the moment both existed. |
| Let the AI mutate simulation state directly instead of issuing commands | Rejected by Amendment 5. It would need no `pending` queue and no hashing, but the opponent's decisions would then sit outside the replay, and an AI acting with zero latency is not playing the same game the player is. |
| Leave `pending` unhashed, since it is derivable from the previous state | Rejected by Amendment 5. True, and the divergence would still surface one tick later — but checkpoints exist to localise, and a plan is state at the moment it exists. |
