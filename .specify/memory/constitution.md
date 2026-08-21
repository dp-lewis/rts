<!--
SYNC IMPACT REPORT (v1.1.0 — 2026-08-21)
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR. Principle I expanded — the previously undefined "supported
  platform" set is now enumerated, and the deterministic/non-deterministic arithmetic
  boundary is stated explicitly. This materially bounds what is required (it makes the
  bit-identical guarantee falsifiable and testable), so it exceeds a PATCH clarification.
  No principle removed or redefined; existing compliant work stays compliant.

Trigger: Product Forge feature `simple-rts-game`, Phase 1 research red flag RF-1 —
  "every supported platform" was an unfalsifiable claim, and a single-runner CI cannot
  test it. Resolved at the Phase 1 gate (decision: approved_with_conditions).

Templates updated in this amendment:
  ✅ .specify/templates/plan-template.md — Constitution Check reference bumped to v1.1.0;
     Principle I gate now asks for the platform matrix explicitly.
  ✅ .specify/templates/tasks-template.md — determinism-check task now names the matrix.
  ✅ .specify/templates/spec-template.md — no change required.
  ✅ .specify/templates/checklist-template.md — no change required (generic).

---- PRIOR REPORT (v1.0.0) ----
Version change: TEMPLATE (unversioned) → 1.0.0
Bump rationale: Initial ratification. Template placeholders replaced with concrete
governance; MAJOR baseline established.

Principles defined (all new — template slots were unfilled):
  - I. Deterministic Simulation Core (NON-NEGOTIABLE)
  - II. Simulation–Presentation Separation
  - III. Test-First Development (NON-NEGOTIABLE)
  - IV. Replay-Verified Regression
  - V. Simplicity and YAGNI

Added sections: Core Principles (5), Governance
Removed sections: [SECTION_2_NAME], [SECTION_3_NAME] — project elected a lean
  constitution (principles + governance only). Tech-stack constraints and workflow
  gates are deliberately left to per-feature plans.

Templates requiring updates:
  ✅ .specify/templates/tasks-template.md — "Tests are OPTIONAL" reversed to mandatory
     per Principle III (header, all three per-story test sections, polish phase, and
     execution-order notes); added determinism-check and replay-regression task types
     per Principles I and IV.
  ✅ .specify/templates/plan-template.md — Constitution Check gate populated with the
     five principle gates.
  ✅ .specify/templates/spec-template.md — no change required (lean constitution adds
     no mandatory spec sections).
  ✅ .specify/templates/checklist-template.md — no change required (generic).
  ✅ .claude/skills/speckit-*/SKILL.md — verified: constitution references are generic
     and use hyphenated command names; no outdated agent-specific references.
  ✅ README.md — no principle references present; no change required.

Follow-up TODOs: none. No placeholders deferred.
-->

# RTS Constitution

## Core Principles

### I. Deterministic Simulation Core (NON-NEGOTIABLE)

The simulation MUST advance in fixed-timestep ticks. Every state transition MUST be a
pure function of the previous state and the ordered set of commands scheduled for that
tick — nothing else.

Within simulation code the following are FORBIDDEN: reading wall-clock or frame-delta
time, unseeded or ambient randomness, iteration over collections with unspecified order,
and any dependency on machine, locale, or thread-scheduling behaviour. All randomness
MUST derive from a seed carried inside simulation state.

Given the same seed and the same command log, a run MUST produce a bit-identical state
hash on every supported platform. This property MUST be verifiable by an automated test,
not asserted by review.

**Supported platforms** are exactly the following set. CI MUST prove hash equality across
all of them on every run; a platform absent from this list carries no guarantee, and
adding one is an amendment to this document.

| Platform | Runtime | Rationale |
|----------|---------|-----------|
| `ubuntu-latest` | Node.js LTS, headless | Primary CI runner |
| `macos-latest` | Node.js LTS, headless | Second OS family — catches OS-level math library divergence |
| Chromium (via Playwright) | Browser, headless | **The runtime the product actually ships in.** Without it, a browser-versus-Node divergence would make committed replays disagree with real play |

Two OS families and two distinct JavaScript engine builds are the minimum that makes the
words "every supported platform" falsifiable; a single runner would make the guarantee
trivially true and therefore worthless. Firefox and WebKit are deliberately excluded until
a second player shares a simulation across machines — at which point this table MUST be
revisited.

Determinism is achieved with ordinary IEEE 754 double arithmetic, not fixed-point. IEEE 754
requires correct rounding for `+`, `-`, `*`, `/` and `sqrt`, but only *recommends* it for
transcendental functions — so `Math.sin`, `cos`, `tan`, `atan2`, `asin`, `acos`, `log`,
`exp`, and `pow` are implementation-defined, vary between engines and architectures, and
are therefore FORBIDDEN inside simulation code. This prohibition SHOULD be enforced by
lint rather than by review.

Rationale: lockstep networking, replays, save/load, and reproducible bug reports all rest
on this single property. It cannot be retrofitted once non-determinism is diffused
through the codebase.

### II. Simulation–Presentation Separation

The simulation layer MUST NOT depend on rendering, audio, input devices, windowing, or
UI. The dependency arrow points one way: presentation reads simulation state, and MUST
NOT mutate it.

Player intent enters the simulation only as commands queued for a future tick. Direct
mutation of simulation state from input or UI handlers is a violation.

The simulation MUST be runnable headless, with no graphics context, at speeds decoupled
from real time.

Rationale: this separation is what makes Principle I testable and CI-enforceable, and it
is the precondition for dedicated servers, AI training runs, and fast-forwarded replays.

### III. Test-First Development (NON-NEGOTIABLE)

Red-Green-Refactor is mandatory and strictly ordered: write the test, confirm it
expresses the intended behaviour, observe it fail for the right reason, then implement.

No production code is merged without a test that fails in its absence. Simulation logic
MUST be covered by headless tests that assert on state, not on rendered output.

Test tasks are never optional in a feature's task list. A plan that omits them is
non-compliant and MUST be corrected before implementation begins.

Rationale: a simulation with emergent behaviour cannot be validated by inspection.
Tests written after the fact encode what the code does, not what it was supposed to do.

### IV. Replay-Verified Regression

Every fixed gameplay or simulation defect MUST land together with a recorded command log
and the expected terminal state hash, committed as a regression case.

CI MUST replay the full corpus of recorded cases on every run. Any divergence from a
recorded hash fails the build and MUST be treated as a determinism defect until proven
otherwise.

Rationale: replays are the only affordable way to regression-test a system whose
behaviour is defined by thousands of interacting ticks. This principle is what keeps
Principle I true over time rather than merely true today.

### V. Simplicity and YAGNI

Implement the simplest thing that satisfies the specification. Abstractions, indirection
layers, configuration points, and third-party dependencies MUST each be justified by a
demonstrated present need — not an anticipated future one.

Speculative generality is rejected in review. When a feature genuinely requires added
complexity, it MUST be recorded in the plan's Complexity Tracking table with the simpler
alternative named and the reason it was insufficient.

Rationale: RTS codebases accrete systems fast, and every premature abstraction becomes a
constraint on the systems added after it.

## Governance

This constitution supersedes all other development practices, conventions, and habits.
Where a tool default, template, or prior practice conflicts with a principle here, the
principle wins.

**Amendment procedure**: Amendments are made by a pull request that modifies this file,
states the rationale for the change, applies the version bump below, and propagates the
change to every dependent template and command file in the same PR. Amendments take
effect on merge.

**Versioning policy**: This document is versioned with semantic versioning.
- MAJOR — a principle is removed, or redefined in a way that invalidates existing
  compliant work.
- MINOR — a principle or governance section is added, or existing guidance is materially
  expanded.
- PATCH — clarifications, wording, and typo fixes that do not change what is required.

**Compliance review**: Every `/speckit-plan` run MUST evaluate its feature against the
Constitution Check gate before Phase 0 research and again after Phase 1 design. Every
pull request review MUST verify compliance with the principles above. A violation is
resolved in exactly one of two ways: the work is changed to comply, or the violation is
recorded in the plan's Complexity Tracking table with an accepted justification. An
unjustified violation blocks merge.

**Version**: 1.1.0 | **Ratified**: 2026-08-21 | **Last Amended**: 2026-08-21
