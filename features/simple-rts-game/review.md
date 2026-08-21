# Review Log: Ten Minute War — Simple Browser RTS

> Feature: `simple-rts-game` | Status: **APPROVED / LOCKED**
> Started: 2026-08-21

## Current Status: ✅ APPROVED — LOCKED

## Open Questions Resolution

> How open questions from product-spec.md were answered during revalidation.

| # | Question | Decision | Rationale | Resolved in Revision |
|---|----------|----------|-----------|----------------------|
| D-1 | What does "nearest" ore node mean, and how are ties broken? | Least **squared** Euclidean distance; ties by **ascending ore-node id** | `sqrt` is avoidable and squared comparison is both faster and exactly deterministic. An unbroken tie is precisely the RF-2 defect class and Constitution §I forbids unspecified ordering — a replay would diverge. | #1 |
| D-2 | Does the build bar have four entries or five? | **Five** — 4 unit + 1 structure, structure visually separated | Spec said "exactly four"; the wireframe drew five. The wireframe's separation was the better design (units and structures are different actions), so the spec moved to match it. | #1 |
| D-3 | Is the 30 s budget time-to-interactive or observed time-to-first-action? | **Both, named separately.** US-001 = ≤10 s time-to-interactive (product guarantee); K2 = <30 s observed first action (playtest measure). Both from page load. | The original wording collapsed a guarantee we control into a behaviour we can only watch, and the two cannot share one threshold. The gap between them is itself the comprehension signal K1 is after. | #1 |
| D-4 | What happens if both Bases are destroyed on the same tick? | Explicit **Draw** verdict | A real, reachable branch with no answer. A Draw costs one string and one result-screen state; an arbitrary tie-break would be invisible to the player and would look like a bug. | #1 |
| D-5 | Is difficulty encoded *into* the seed or stored *alongside* it? | A **field of initial simulation state**, alongside the RNG seed, written into the replay header | Replays must reproduce AI behaviour, so difficulty has to live inside replayable state either way. Encoding it into the seed integer would conflate two independent things. | #1 |
| — | Does selection test sprite bounds or unit geometry? | **Collision circle** (position + radius) | Makes selection independent of art, so changing a sprite cannot change gameplay. | #1 |
| — | What is "valid ground" for placement? | Full 64 px footprint passable, wholly in bounds, unoccupied by structure or unit | "Valid" was undefined; every clause here is independently checkable. | #1 |
| OQ-4 | Is the project name still right? | Renamed **"8 Bit RTS" → "Ten Minute War"** | The old name promised pixel art the Kenney sprites do not deliver, and it would have shown in the browser tab. The new name states the differentiator: research found the vacant niche is *session length*, not genre — no competitor offers a match you can actually finish — so the name now does positioning work a generic RTS name cannot. Applied across 15 files. | post-lock (deferred question, not a scope change) |

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-21 | Determinism lens applied to all 10 Must-Have acceptance criteria before approval, not at approval | Findings should inform the approve/revise decision, not arrive after it. Surfaced 5 findings (2 High) that would otherwise have reached `spec.md` and become plan and task errors. |
| 2026-08-21 | Three new tie-break rules are now explicit FRs (FR-021 targeting, FR-022 A\*, FR-027 ore node) | Unspecified ordering is the single recurring determinism defect class in this project. Making each instance a numbered requirement means the plan cannot quietly skip one. |
| 2026-08-21 | Draw added as a third match verdict | Prefer specifying a rare branch over resolving it by arbitrary tie-break. Cost is one string; benefit is one fewer unspecified state. |
| 2026-08-21 | Fixed single screen and no-tutorial confirmed as load-bearing **together** | Single-screen visibility is much of what makes no-tutorial viable. They should be revisited as a pair, never independently. |
| 2026-08-21 | Project renamed to **Ten Minute War** | Resolving open question #4, which the locked spec explicitly deferred to the user. Handled as a deferred-question resolution rather than a change request: no requirement, story, journey, or non-goal changed — only the product name. |

## Change History

v1.0 → v1.1: Determinism lens fixes — nearest-node and build-bar defects resolved, Draw verdict added, time-to-interactive separated from observed time-to-first-action, difficulty placement in sim state pinned down, selection geometry and valid-placement defined. 5 new FRs (FR-027…FR-031), 1 new journey edge (EDGE-009).

## Revision History

## Revision #1 — 2026-08-21

**User feedback:**
> Revise — fix all 5 findings *(gate selection: apply D-1 through D-5 plus the two minor findings, then re-present for approval)*

**Changes applied:**

| File | Change Type | Description |
|------|-------------|-------------|
| `product-spec/product-spec.md` | Modify | 12 edits: US-001 (time-to-interactive ≤10 s), US-002 (difficulty in sim state + replay header), US-003 (squared distance, ascending node id), US-004 (collision circle), US-005 (five build-bar entries), US-006 (valid ground defined), US-008 (Draw verdict); FR-010 corrected; **FR-027…FR-031 added**; §4.2 economy, §4.6 result screen |
| `product-spec/metrics.md` | Modify | K2 redefined as observed-from-page-load; added an explicit note that K2 and US-001 measure different things and must not be conflated |
| `product-spec/journeys/journeys.yml` | Modify | STEP-007 expectation updated to the 5-entry bar; **EDGE-009 added** (simultaneous Base destruction → Draw, P2) |
| `product-spec/journeys/JRN-001-first-match.md` | Modify | Mirrored the same two changes in the narrative |
| `traceability.yml` | Modify | EDGE-009 added to the JRN-001 row; edge counts re-verified against `journeys.yml` (9/9, 2/2, 2/2) |
| `product-spec/wireframes/wireframe-match.html` | Modify | Build-bar annotation corrected to five entries, noting the divider is the separation |
| `product-spec/wireframes/wireframe-result.html` | Modify | Draw documented as a third verdict state, with the colour-independence rule restated |

**Notes:**

- **D-2 was resolved in favour of the wireframe, not the spec.** The spec's "exactly four" was the error; the wireframe's visually-separated fifth button was the better design. Worth recording because the reflex is to treat prose as authoritative over a drawing.
- **D-1 belongs to a pattern, not an incident.** It is the third place in this feature where unspecified ordering could break determinism — after target acquisition (FR-021) and A\* open-set ordering (FR-022). All three are now numbered requirements. A fourth instance should be expected during planning.
- **D-4 (Draw) is rare but reachable.** Specifying it costs one string and removes an unspecified branch; an arbitrary tie-break would have been invisible to the player and indistinguishable from a bug.
- **D-3 was a genuine measurement error**, not just loose wording: as written, US-001 and K2 shared a 30 s threshold while measuring different quantities, so one of them would necessarily have been measured wrong.

---

## ✅ APPROVED — 2026-08-21

**Approved by user after 1 revision.**

### Final consistency check

| Check | Result |
|---|---|
| Cross-links in `product-spec/README.md` resolve | ✅ 16/16 |
| Referenced wireframe files exist | ✅ 3/3 |
| Must + Should stories map to ≥1 journey | ✅ 12/12, no gaps |
| `traceability.yml` edge counts match `journeys.yml` | ✅ 9/9, 2/2, 2/2 |
| Determinism lens on Must-Have acceptance criteria | ✅ 5 findings raised, all 5 resolved in revision #1 |

### Final document inventory

| Document | Size | Notes |
|----------|------|-------|
| `product-spec/product-spec.md` | 277 lines | 15 US, **31 FR**, 10 NFR, ~30 non-goals, 10 risks, 14-row decision log |
| `product-spec/journeys/journeys.yml` | 248 lines | 3 journeys · 16 steps · **13 edges** |
| `product-spec/journeys/JRN-001/002/003.md` | 3 files | Human-readable narratives, kept in sync with the YAML |
| `product-spec/wireframes/` | 3 screens + shared CSS | Rationale annotated inline on each |
| `product-spec/metrics.md` | 108 lines | 7 KPIs, 5 guardrails, 5 anti-metrics |
| `product-spec/README.md`, `digest.md` | 2 files | Index and phase digest |
| `traceability.yml` | 42 lines | `journeys:` block seeded (US → JRN → STEP/EDGE) |

### Open questions carried forward (5) — deliberate, not missed

| # | Question | Resolves in |
|---|----------|-------------|
| 1 | Exact unit balance numbers | Implementation tuning pass (R4) — feel is tuned, not specified |
| 2 | Map layout and ore-node placement/count | Plan (Phase 5); directly sets match length, so expect iteration |
| 3 | Final sprite id selection from the 48 available | Implementation (Phase 6); roster is fixed by *role* already |
| 4 | ~~Project name~~ | ✅ **RESOLVED 2026-08-21 — "Ten Minute War"** |
| 5 | Audio scope beyond the two functional cues | Plan (Phase 5) |

None of these block the bridge: each is either a tuning variable, a plan-level
detail, or cosmetic. All five were reviewed at the approval gate and knowingly
left open.

**Status: LOCKED — ready for SpecKit Bridge (Phase 4)**

> Note for downstream phases: `product-spec.md` is now the locked source of truth.
> Any change to it after this point should go through
> `/speckit.product-forge.change-request` rather than direct editing, so the
> impact across `spec.md`, `plan.md`, and `tasks.md` is analysed rather than
> assumed.
