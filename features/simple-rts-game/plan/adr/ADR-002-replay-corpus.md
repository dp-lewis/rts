# ADR-002: Replay corpus format and regeneration

> Status: **Accepted** · Date: 2026-08-21 · Feature: `simple-rts-game`
> Discharges bridge-gate obligation 2. Required by Constitution §IV.

## Context

Constitution §IV requires that **every fixed gameplay or simulation defect lands
together with a recorded command log and the expected terminal state hash**, and
that **CI replays the full corpus on every run**, with any divergence failing the
build.

The format must therefore exist *before the first bug fix*. A corpus retrofitted
after gameplay exists is not trustworthy, because nobody can tell whether a
recorded hash captured correct behaviour or merely captured the behaviour of the
day it was recorded.

## Decision

### Format

One JSON file per case: `tests/replay/corpus/NNN-slug.json`.

```json
{
  "schemaVersion": 1,
  "id": "003-worker-node-tiebreak",
  "description": "Two ore nodes equidistant from the starting worker; the lower node id must win.",
  "defect": "#12",
  "createdAt": "2026-09-01",
  "simVersion": 4,
  "input": {
    "seed": 1234567,
    "difficulty": "normal",
    "map": "mirror-01",
    "commands": [
      { "tick": 40, "issuer": "player", "seq": 0, "type": "move",  "units": [3, 4], "x": 512, "y": 320 },
      { "tick": 95, "issuer": "player", "seq": 0, "type": "build", "kind": "trooper" }
    ]
  },
  "expected": {
    "finalTick": 8400,
    "stateHash": "9f2c41ab7e05d318",
    "checkpoints": [
      { "tick": 1000, "stateHash": "3ab0f19c22d74e05" },
      { "tick": 4000, "stateHash": "c71e5d0284fa9b36" }
    ]
  }
}
```

One file per case rather than a directory per case: fewer paths, and the whole case
reviews as a single diff in a pull request.

### Checkpoints are mandatory, not optional

Every case carries intermediate checkpoint hashes at fixed tick intervals as well as
a terminal hash. A terminal-only hash tells you *that* a run diverged; checkpoints
tell you *when*, which turns a multi-thousand-tick haystack into a bounded search.
The runner reports the **first** failing checkpoint, not just the final mismatch.

### The runner

`tests/replay/run-corpus.ts` loads every case, constructs a fresh simulation from
`input`, applies commands at their scheduled ticks, and compares hashes at each
checkpoint and at `finalTick`. Any mismatch fails. It runs in the Vitest suite (so
it is part of the ordinary test run) and as its own CI step across all three
supported platforms.

### Regeneration is manual, reviewed, and never automatic

This is the load-bearing rule. When a change **intentionally** alters simulation
behaviour, every recorded hash becomes stale, and the temptation is to add an
`--update` flag and move on. That flag would silently convert §IV from a regression
guard into a rubber stamp.

Therefore:

1. `simVersion` is an integer in `src/sim/version.ts`, bumped **by hand** in the same
   change that alters simulation behaviour.
2. If a case's `simVersion` is lower than the current one, the runner **fails with a
   distinct message** — "corpus case is stale, regenerate deliberately" — rather than
   silently passing or silently re-recording.
3. `npm run corpus:regen` rewrites hashes for stale cases and bumps their
   `simVersion`. It is **never** run in CI, and never as part of a test command.
4. The regenerating change must show the hash diffs in its pull request, so a human
   sees exactly which recorded behaviours changed. A regeneration diff that is larger
   than the author expected is itself the signal.

**A regeneration is an admission that behaviour changed on purpose.** Making it
manual, visible, and slightly inconvenient is the point, not an oversight.

## Consequences

**Good.** The corpus is cheap to grow (one file per defect), diffable, reviewable,
and localises failures. It works identically headless and in the browser.

**Costly.** Every fixed sim defect adds a per-defect authoring cost, and CI runtime
grows with the corpus. Both are accepted: §IV is non-negotiable, and this is the
only affordable way to regression-test a system whose behaviour is defined by
thousands of interacting ticks.

**Watch.** If total corpus runtime becomes a problem, the answer is to run the full
corpus on CI and a fast subset on pre-commit — **never** to prune cases. A pruned
corpus quietly loses exactly the regression it was written to prevent.

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Terminal hash only, no checkpoints | Detects divergence without localising it. A failure would be near-undiagnosable across ~12,000 ticks. |
| Auto-update hashes when they mismatch | Converts the regression guard into a rubber stamp. This is the single most dangerous option available and is rejected outright. |
| Store corpus as binary | Not diffable, not reviewable in a PR. The whole value is a human seeing what changed. |
| Record full state snapshots per case | Large, noisy, and duplicative — the hash already covers the state, and snapshots would bloat the repository for no diagnostic gain beyond checkpoints. |
| Generate cases automatically by fuzzing | Speculative generality (Constitution §V). Cases come from real fixed defects, as §IV requires. Fuzzing is a reasonable *later* addition once the harness has proven itself. |
