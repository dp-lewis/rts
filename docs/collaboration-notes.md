# Working with the agent: what each of us actually caught

Source notes on the *collaboration*, as distinct from the game.

Every other document in this repo records what was built. This one records how it
was built, and specifically the division of labour — because the interesting
result of this experiment is not the game, it is which kind of mistake each of us
was capable of finding.

---

## Pace

| Day | Commits | What happened |
|---|---|---|
| 21 Aug | 7 | Product Forge phases 0–5C: problem discovery, research, product spec, plan, two ADRs, 82 tasks |
| 22 Aug | 23 | **The entire implementation.** M0 through M9, the playtest, three of the four change requests, one code review |
| 23 Aug | 4 | Scattered ore, merge to main, Pages deploy, documentation |

The whole build ran in about two days of elapsed time, with roughly one milestone
per working session. That number is worth stating plainly, because most of the
findings below are about a process failing to catch things — and a process that
catches nothing in two days is a different complaint from one that catches nothing
in two months.

---

## The asymmetry

**The agent caught what was measurable. It missed what was meaningful.**

That is the single sharpest thing this project produced, and the evidence is
one-sided enough to be worth trusting.

### What the agent caught

Every one of these is a number disagreeing with another number.

| Catch | How |
|---|---|
| Floating point made the tick rate depend on the monitor — 144 Hz ran 39 ticks where 30 Hz ran 40 | A test written *before* the implementation, asserting the two must agree |
| Player commands drained on a tick they could never apply on — every order silently discarded | Code review, then mutation-verified by restoring the bug |
| Coverage reported **96.45%** over a file set that excluded every untested file | Re-running with an explicit `include`: 86.98%, three files at 0% |
| A WCAG-AA floor that passed over a canvas `axe` cannot see into | Asking what the assertion was actually reading |
| A balance harness measuring AI-versus-**nobody** | Player 1 winning 18/18 on a mirrored map is not a result |
| A cooldown off-by-one making every damage figure 6% low | Measuring the *gap* between shots after a counting test passed against the bug |
| Random jitter that could not separate units at **any** magnitude | Measuring worst-case separation instead of tuning the number |
| Two suspicions that turned out to be **wrong** — handler accumulation, an engine-level player-1 advantage | Probing both instead of reporting them |

### What the agent missed

| Miss | For how long |
|---|---|
| **The Factory did nothing.** Specified in phase 2 to train units; no command ever routed to it | Seven milestones and **two of the agent's own code reviews** |
| FR-023's audio cue was never built. The game is silent | Missed in two code reviews; still open |
| Phase 7 traceability verification never ran — the phase that exists to catch exactly the Factory defect | The whole project |
| Assumed tiles 39–40 were plain ground because they sat next to 41–42 in a file listing | Until it was rendered and looked at |
| Let an ore lookalike into the terrain scatter *after* writing the reasoning that excluded two others | Until it was rendered and looked at |
| Never pushed back on locking design that could only be settled by playing | Until the developer said "specced too soon" |

The pattern is consistent. Every catch was a discrepancy between two measurements.
Every miss required either **looking at the game** or asking **whether a thing had
a purpose** — and an agent that never plays and never wonders why is structurally
bad at both.

### What the human caught

All of these came from playing. None could have come from an artifact.

- **The Factory is pointless** — and then, unprompted, the fix: *"only get the
  trooper and the tank after building a building to produce them."* Which turned
  out to be what the product spec had said since phase 2.
- **The Scout is pointless.** Specified with a role, built, tested, tuned, and it
  survived to the final milestone before anyone said so out loud.
- **The UI is clunky** — selecting a building resized the canvas. Underneath: a
  resize moves every unit under your cursor, so the click you were lining up lands
  somewhere else.
- **The terrain is bland**, and **more ore, exhausting over time, would force
  movement.**
- **"I think I specced it too soon."** No artifact in this repo would ever have
  produced that sentence.

---

## The decision record

Eleven gates were recorded as `approved_with_conditions`, which says nothing about
what was actually decided. The forks that shaped the build:

| Decision | Consequence |
|---|---|
| Scope each run to **one milestone** | Kept every gate reviewable; the alternative was a single unreadable diff |
| **"Build the spike, I'll judge"** on the underglow ring | The agent built it, the human judged it — and the spike found a defect in the *jitter*, not the ring |
| *"Both: wider jitter, tighter ring"* | Half of it was wrong. Measuring showed wider jitter bought 0.3 px; the agent said so rather than implementing the instruction as given |
| **"Add the place command"** rather than shipping a Must as decoration | Closed a finding open since the M3 review |
| **"Move the HUD to DOM"** | Made FR-026 and the WCAG floor real instead of vacuous. Cost: rewriting M6's work |
| **"Specs first, as a voluntary Red"** for M7's E2E | 41 failing specs before a line of screen code |
| **"Implement the spec"** on the Factory | The largest single change in the project, and the one that made it fun |
| **"Not proceeding with the kit"**, mid-build | Stopped the agent building an elaborate playtest apparatus nobody had asked for |
| **"Yes, several did"** — players won on New to this | The one exit criterion no harness in the project could evaluate |

Two of these are worth noticing as a pair. The human made the **judgement** calls —
is it fun, does it read, is it worth it — and the agent made the **verification**
calls. Neither set was interchangeable.

---

## Where the agent should have spoken sooner

Recorded because a collaboration note that only lists the agent's catches is
marketing.

- **It ran the process faithfully rather than critically.** It flagged all four
  requirement conflicts before implementing CR-002 — but that was late. The moment
  to say *"these fifteen requirements are architecture, lock them; these twelve are
  guesses about fun, mark them provisional"* was phase 3, when the spec was locked
  after one revision, on paper, before anything was playable.
- **It treated a locked spec as a fact rather than a decision with a cost.**
- **It asked for a gate decision more often than it needed to.** Some of those were
  genuine forks. Some were judgement calls it could have made and explained.
- **It twice reported a measurement before checking the instrument** — an
  AI-versus-nobody harness and a canvas-resize baseline taken mid-boot. Both were
  caught, but by the agent's own second look, not its first.

---

## The line worth stealing for the post

**The agent is a good proofreader of its own reasoning and a poor judge of whether
the thing is any good.**

It will find the off-by-one in your cooldown, the file your coverage report is not
reading, and the harness that is measuring nothing. It will not notice that a
building you spent 200 ore on does nothing, because that requires wanting to play
the game.

Which is an argument for the blocking playtest gate, not against the process:
`tasks.md` says *"a build that passes every automated test and fails M9 has
failed."* On this evidence that is the most valuable sentence in the entire
specification.

---

*See also: [`blog-notes.md`](./blog-notes.md) for the build findings, and
[`process-comparison.md`](./process-comparison.md) for the two-arm experiment
against [`dp-lewis/rts-2`](https://github.com/dp-lewis/rts-2).*
