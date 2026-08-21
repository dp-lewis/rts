# ADR-001: Canonical state hash

> Status: **Accepted** · Date: 2026-08-21 · Feature: `simple-rts-game`
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
   `hp`, `stateEnum`, `targetId`, `cooldown`, `progress`

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

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Round floats to N decimals before hashing | Hides the exact divergence §I exists to detect. Would produce false confidence. |
| `JSON.stringify` then hash the string | Key order is insertion-dependent, and number formatting is a second, subtler determinism surface. More moving parts, no benefit. |
| SHA-256 via WebCrypto | Async in the browser, sync in Node — different call shapes for identical semantics. Overkill for divergence detection. |
| Fixed-point arithmetic throughout the sim | Unnecessary. Research established that `+ - * /` and `sqrt` are correctly rounded under IEEE 754; only transcendentals are implementation-defined, and those are banned in sim by Constitution §I. |
| Hash only at match end | Divergence would be detected but not localised. Checkpoints (ADR-002) are what make a failure diagnosable. |
