# ADR-001: Canonical state hash

> Status: **Accepted** · Date: 2026-08-21 · Feature: `simple-rts-game`
> **Amended 2026-08-22 (Amendments 1 and 2)** — see the Amendments section.
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
6. Per entity, ordered by **entity id ascending**: `id`, `kind`, `owner`, `x`, `y`,
   `hp`, `stateEnum`, `targetId`, `cooldown`, `progress`, `destX`, `destY`
   *(the last two added by Amendment 2)*
7. `difficulty` (uint8) — *added by Amendment 1*
8. `nextEntityId` (uint32) — *added by Amendment 1*

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
