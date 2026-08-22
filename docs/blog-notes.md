# Ten Minute War — build notes

Raw material for a write-up. Facts and findings, not prose.

---

## What it is

A browser RTS. One fixed screen, no camera, no accounts, no install. A complete
skirmish against an AI in about ten minutes.

- **Phaser 4**, the only runtime dependency
- **Deterministic fixed-timestep simulation** (20 Hz) with a hard, lint-enforced
  boundary between `src/sim/` and `src/game/`
- Art: Kenney "RTS Pack: Sci-Fi" (CC0)
- ~5,600 lines of source, ~5,800 lines of tests
- 356 unit tests + 44 Playwright E2E, green on ubuntu/macOS × Node 22/24
- 27 commits, 10 milestones, 3 change requests, 54 findings recorded at gates

Built with a spec-driven workflow (SpecKit + Product Forge): problem discovery →
research → product spec → plan → 82 tasks → implement in milestones, with a
human gate at every phase boundary.

---

## The through-line: green checks that were green for nothing

The single most repeated failure in this project was **a check that passed because
it had nothing to check.** Seven separate instances, each caught a different way.
This is the spine of any write-up.

| # | The check | Why it was green | How it was caught |
|---|---|---|---|
| 1 | M0's boundary lint test | No config file → ESLint matched nothing → "no result". Would have gone green on an *empty* config. | Rejected at the Red gate, twice, before any code existed |
| 2 | M1's Red gate | 8 test files, 0 tests collected — all bare `Cannot find module` | Signature-only stubs forced 43 real failures |
| 3 | M5's coverage | **96.45%** — measured only over files a test imported. Files with *no* tests were not 0%, they were absent. | Re-ran with explicit include: **86.98%**, three files at 0% |
| 4 | M7's WCAG-AA axe floor | axe cannot see inside a canvas. A canvas-drawn UI passes by having nothing to audit. | Moving the UI to DOM; a control test now asserts axe found real nodes |
| 5 | M8's duration harness | Reported 1.5-minute matches, player 1 winning 18/18 — it was measuring AI-vs-*nobody* | Player 1 winning a *mirrored* map is not a result, it's a broken instrument |
| 6 | The Factory | Spec'd since Phase 2 to train units. Nothing routed to it. A 200-ore ornament. | A playtester: *"the factory seems pointless"* |
| 7 | A UI resize fix | First measurement said the bug persisted. Baseline had been taken mid-boot, before layout settled. | Re-measuring from a settled state |

**The lesson worth writing up:** the instrument lies more often than the code does.
Every one of these was a *process* that reported success. None was a bug in a
feature.

---

## Determinism as a build discipline

Two ADRs carried the whole project:

- **ADR-001** — a canonical state hash. Fixed field order, id-ordered traversal,
  exact IEEE-754 bits via `DataView`, FNV-1a in two 32-bit lanes.
- **ADR-002** — a replay corpus. Recorded matches with checkpoint hashes, replayed
  on every CI run across four runners.

`SIM_VERSION` is bumped **by hand** in the same change that alters behaviour.
Stale cases fail with a distinct message and are **never** auto-updated.

What that bought:

- **12 simVersion bumps**, each with a recorded reason
- A regen that fails *as a regression* ("first diverged at tick 1800") rather than
  as staleness tells you behaviour moved and you didn't declare it. That happened
  in M2 and caught a real omission.
- **Blast radius as a signal.** A combat-timing change in M6 moved one case and one
  checkpoint — because the other case never fires a shot. An economy change moved
  everything. A diff larger than expected *is* the finding.

Lint enforces the boundary rather than review: `Math.random`, `Date.now`,
transcendentals, `for...in`, and Phaser imports are all banned inside `src/sim/`.
The rule caught a real `new Date().toISOString()` one milestone after it was
written.

---

## Bugs worth telling

**Floating point made the tick rate depend on your monitor.** 288 frames at 144 Hz
sum to 1999.9999999999998 ms — one ulp short of the 40th tick. So 144 Hz ran 39
ticks where 30 Hz ran 40 over identical wall time. Fixed with a boundary epsilon
*sized from the drift*, not guessed.

**Player commands were drained on a tick they could never apply on.** The scene
drained for `tick + 1`; `applyCommands` only accepts `state.tick`, and `step`
applies before advancing. Every player order would have been silently discarded —
no error, a perfectly normal-looking match. Caught in code review, mutation-verified.

**A test that counted couldn't see an off-by-one.** Cooldown was set on the firing
tick and decremented from the next, so the real fire interval was `C+1` — every
damage-per-second figure 6% low. Both the existing test and my first replacement
counted shots in a window and passed: 4 shots land in 64 ticks under either
interval. The *gap* has to be measured, not the count.

**Random jitter could not separate co-located units at any magnitude.** Worst-case
separation was 0.36 px at ±11 px and 0.66 px at ±20 px — doubling the magnitude
bought 0.3 px, because two independent uniform draws can always coincide. Replaced
with successive golden angles, which makes separation a guarantee.

**The production build shipped zero sprites** for one milestone. Textures load by
URL, so Vite never saw them; `npm run dev` looked perfect because the dev server
serves the project root. Caught by looking *inside* `dist/`, not by a green build.

---

## What only humans could tell us

Two things no test could have produced:

1. **Is it beatable?** `pre-impl F-3` flagged it early: *comprehension does not
   prove the game is winnable, and an AI written by someone who knows the game is
   the most common way a solo project ships something unwinnable.* The AI-vs-AI
   harness structurally cannot answer this — it plays both sides at the same
   difficulty, so its win rate is ~50% by construction.
2. **The Factory is pointless.** Seven milestones and two code reviews missed it.
   A playtester found it in one session, then independently proposed the fix —
   which turned out to be what the product spec had said since Phase 2.

M9 was a **blocking** milestone by design: *"a build that passes every automated
test and fails M9 has failed."* Worth defending in a write-up — it's the only
mechanism that stops a provably-correct, unenjoyable game shipping.

---

## Design changed three times, from play

Each recorded as a formal change request against a locked spec, not a quiet edit.

- **CR-001** (pre-implementation) — sudden death. Ore exhaustion halted production
  but forced no resolution, so a post-exhaustion stalemate had no terminator and
  the ten-minute promise was guaranteed by nothing.
- **CR-002** — tech tree. Buildings gate units; the match opens with a Base and a
  decision. **Moved four locked requirements, three of them Must.** Two existed to
  protect research findings, so both trades were named in writing before being made.
- **CR-003** — scattered ore. Eight nodes in mirrored pairs instead of two.
  Depletion had worked since M2; with two nodes there was nowhere to relocate *to*,
  so a tested mechanic never showed itself in play.

Balance was tuned against a measured distribution, not opinion: **median 6.40 min,
p90 10.64**, over 30 fixed-seed matches, asserted as a test that fails the build
outside the band.

---

## Things that would not survive a second telling

Honest notes on what was awkward.

- **The AI-vs-mirrored-AI harness is a good instrument for pacing and a poor one
  for balance.** It measures the game, not the experience.
- **Seeds barely vary a match.** The AI's only PRNG draw is degenerate whenever one
  option is affordable, which is most of the time.
- **The game is silent.** FR-023 asks for an audio cue; it was never built, and two
  code reviews missed it.
- **Phase 7 (full traceability verification) never ran** — and the Factory defect is
  precisely what it exists to catch.
- **Documentation drifts.** `code-review.md` listed a fixed finding as open, which
  cost a later milestone real time when it planned work for a fix already present.
  A findings document that is only appended to becomes a list of things that
  *might* be true.

---

## Candidate angles for the post

1. **"Your tests are green because they're not looking"** — the seven-instance table
   is the whole article. Strongest angle.
2. **"The instrument lies more often than the code"** — measurement as the thing
   that needs verifying.
3. **"What a playtester found that seven milestones didn't"** — the Factory story,
   and why a blocking human gate earns its place.
4. **"Determinism as a build discipline"** — hashes, corpus, hand-bumped versions,
   and blast radius as a signal.
