# The other half of the experiment

This repo — *Ten Minute War* — was built with **Product Forge on top of Spec Kit**,
letting Forge's own problem-discovery and product-spec phases do the design work.

A companion game was built the other way: **a rich PRD written with Claude first,
then Spec Kit driven from it.** That repo is
[`dp-lewis/rts-2`](https://github.com/dp-lewis/rts-2), and its retrospective is
[`docs/process-retrospective.md`](https://github.com/dp-lewis/rts-2/blob/main/docs/process-retrospective.md).

**Read theirs first.** It is the more complete document, it argues against its own
hypothesis, and it names its own attribution problem in the third paragraph. This
file is not a rebuttal. It is the half that could only be written from inside this
repo — three corrections, one cost the other side could not observe, and one
finding that is stronger because both runs reached it independently.

---

## Corrections

The companion retrospective was written from outside this repo, and some of its
figures have since moved.

| Their figure | Actual, as of this commit |
|---|---|
| Balance: median **6.19 min**, p90 **9.97** | **median 6.40, p90 10.64.** 6.19 was the M8 number. Two change requests later — a tech tree and scattered ore — it was re-tuned. Sudden death also now fires in 8 of 24 matches where it fired in **none**, because total ore finally dropped low enough for the CR-001 backstop to be reachable. |
| Docs: **11,228** lines | **7,831** across `features/` and `docs/`. Still more markdown than the 5,646 lines of source, so their point survives — but the ratio is 1.4:1, not 2:1. |
| Phase 0: push and pull "roughly balanced inertia and anxiety" | The recorded forces were `push: medium, pull: medium-high, inertia: high, anxiety: low-medium`. **Inertia was the dominant force** — which is a *stronger* reason to cut than a balanced picture would have been. The 4/10 severity and "weak" validation they quote are exact. |

Their headline claim — that this build is the more rigorous engineering and the only
one of the two that is actually balanced — is accurate, and remains so.

---

## The cost they could not see

The retrospective's sharpest line is:

> **the PRD told us what to build, and Forge worked out what not to.**

That is right, and it is the fairest thing anyone has said about this process. But
it has a second half that is only visible from in here:

**Forge also made it expensive to change its mind.**

Phase 3 locked the spec after one revision, on paper, before anything was playable.
From that point, changing a *unit roster* required the same machinery as changing a
*hash format*. When play disagreed with the spec, the bill arrived:

- **CR-002** moved **four locked requirements, three of them Must** — and required a
  full re-tune plus invalidating an M9 playtest result that had already passed.
- **The Scout** was specified with a role, built, tested, tuned, and survived to the
  final milestone before a human looked at it and said it was pointless.
- **The balance pass ran twice**, because the first one measured an economy in which
  200 ore bought a building that did nothing.
- Roughly **80% of the 82 tasks were complete before anyone but the author played it**,
  so every design finding arrived at the most expensive possible moment.

The companion repo could absorb a design change inside a slice. This one needed a
change request, an amended spec, and a regenerated replay corpus.

The developer's own conclusion, unprompted, at the end of the build:

> *"my conclusion is one of frustration. That I think I specced it too soon."*

That belongs beside the favourable verdict, not underneath it.

---

## The finding both runs reached independently

Two opposite hypotheses, two different processes, same answer.

| | Worst defects found by |
|---|---|
| **rts-2** (PRD-first) | Four of five by *launch it and look* — a camera that scrolled away before the player touched anything, an attack order that never closed the distance, a harvester deadlock 205 tests never saw |
| **Ten Minute War** (Forge) | The Factory did nothing for **seven milestones and two code reviews**. A playtester found it in one session — and then independently proposed the fix, which turned out to be what the product spec had said since Phase 2 |

Neither test suite could have caught its own worst bug. That is more convincing as a
shared result than either repo could claim alone.

This repo has a second version of the same lesson, which is really the story of the
whole build: **seven separate occasions when a check passed because it had nothing
to check.** An ESLint test that would have gone green against an empty config; a Red
gate collecting zero tests; a 96.45% coverage figure measured only over files a test
already imported; a WCAG-AA floor over a canvas `axe` cannot see into; a balance
harness measuring AI-versus-*nobody*. None was a bug in a feature. Every one was a
process reporting success. Full list in [`blog-notes.md`](./blog-notes.md).

---

## What this side would add to their recommendation

Their closing suggestion is Forge's phase 0, rts-2's constitution and slicing, and a
balance criterion written into the spec on day one. That is well judged. One addition:

**Lock architecture hard. Hold design loosely.**

The evidence for the split is unusually clean, because this project ran both through
the same machinery and got opposite results:

| Locked up front | Outcome |
|---|---|
| Determinism, canonical state hash, replay corpus, the `src/sim` lint boundary | **Never amended.** Not once, across 82 tasks and 12 simulation versions. `plan.md` argued these cannot be retrofitted, and that was correct. |
| Unit roster, build UI, opening position, economy shape | **Changed three times, all from play.** Every one required a formal change request against a Must-tier requirement. |

Same document. Same ceremony. Wildly different volatility. The mistake was not
specifying too much — it was applying one lock to two kinds of decision.

A concrete version: two tiers in the spec. Architecture is locked and expensive to
change, and should be. Design is provisional, expected to move, and gets revisited
the first time anyone plays it — which should be milestone one, not milestone nine.

---

## Scoreboard

Neither of these is a verdict on the processes; both are one run of one game by one
developer, and the two builds had different goals by the time they finished.

| | **Ten Minute War** (Forge) | **rts-2** (PRD-first) |
|---|---|---|
| Commits | 33 | 49 |
| Source | 5,646 lines | 4,048 |
| Tests | 356 unit + 44 E2E, 45 files | 159 cases, 13 files |
| Specs / docs | 7,831 lines | 5,471 |
| Units / buildings | 3 / 3 | 6 / 6 |
| Determinism | Hash + replay corpus, cross-platform CI | None |
| Pathfinding | A\* | Straight-line |
| Balance | Tuned to a measured exit criterion | Not attempted |
| Fog of war / camera / minimap | Cut in phase 0 | Present |
| Playtested with real players | Yes — a blocking gate | No |

**Their summary was: *I built more game; Forge built a better one.*** Accurate. The
addition from this side is that Forge also built the one that was harder to change
once the player disagreed with it — and the player always does.
