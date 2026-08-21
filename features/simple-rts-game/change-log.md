# Change Log: Ten Minute War

## CR-001: Sudden-death backstop for post-exhaustion stalemate — 2026-08-21

| Field | Value |
|-------|-------|
| **Status** | **ACCEPTED** |
| **Priority** | Must Have |
| **Requested at phase** | 5C — Pre-Implementation Review |
| **Rationale** | Technical discovery. Pre-impl review finding F-1: ore exhaustion halts *production* but does not force *resolution*. A post-exhaustion stalemate had no terminator, so the product's central promise — a match that reliably ends in ~10 minutes — was not guaranteed by anything in the simulation. |
| **Impact** | 8 artifacts, +5 tasks, 3 tasks modified, effort delta **small** |
| **Phase rollback** | **No.** The change-request process is the sanctioned path for mutating a locked spec; no architecture rework is implied. |

### The gap

Phase 2 recorded the reasoning as: ore runs out → production halts → the match resolves
with the forces on the field. **The middle step does not imply the last one.** Two
players who turtle to a rough stalemate after ore is gone can neither build nor
profitably attack, and the only defined terminator was Base destruction (FR-017).
Nothing ended that match.

Four earlier review passes missed it because each checked the artifacts for consistency
*with each other* — and FR-016 and FR-017 are consistent. The gap is *between* them: a
state the requirements jointly fail to cover. Consistency checking cannot find a
missing state.

### The mechanism

Sudden death **arms** when every ore node on the map is depleted (a global, deterministic
condition — a counter in sim state). After a grace period, all Bases take **escalating**
damage; escalation guarantees termination in bounded ticks for any finite hit points.

It **adds no fourth verdict**. Both Bases take damage simultaneously, so whichever has
less hit points falls first, producing an ordinary Victory or Defeat — and if they are
exactly equal they fall on the same tick, where the existing Draw rule (FR-028) already
applies. All timing and damage values are `constants.ts` tuning variables, deliberately
unfixed in the spec.

Phase 2's rejection of a visible soft timer stands: this is a **backstop**, invisible in
a normal match, not a second valve.

### Sub-finding surfaced during impact analysis

Sudden-death damage would have fired the FR-023 under-attack indicator — telling the
player they are under attack when there is no attacker. A base dying with no visible
enemy, flagged "under attack", reads as a bug rather than a rule. Hence **FR-033**: a
distinct sudden-death indicator, and FR-023 restricted to damage from an enemy entity.

### Artifacts Modified

| Artifact | Change Type | Description |
|----------|:----------:|-------------|
| `product-spec/product-spec.md` | Modified | US-008 AC; §4.2 economy edge cases; §4.6 result screen |
| `product-spec/journeys/journeys.yml` | Added | EDGE-010 (P1) on JRN-001 |
| `product-spec/journeys/JRN-001-first-match.md` | Added | EDGE-010 narrative row |
| `product-spec/wireframes/wireframe-match.html` | Modified | Distinct sudden-death indicator; FR-023 scoped to enemy damage |
| `spec.md` | Added / Modified | **FR-032, FR-033 added**; FR-016, FR-017 amended; US-008 AC; TC-UNIT-011/012 |
| `specs/gameplay/spec.md` | Added / Modified | ADDED FR-032/033; new **MODIFIED Requirements** section for FR-016/017 |
| `plan.md` | Modified | Tick pipeline stage 9; M3 scope and exit criterion; M8 tuning surface; coverage 31/31 → **33/33** |
| `tasks.md` | Added / Modified | +T078, T079 (CR-001); T041, T073 extended; coverage matrix |
| `traceability.yml` | Added | FR-032, FR-033 rows; EDGE-010 on JRN-001 |

### New Tasks Added

| Task | Description | Milestone |
|------|-------------|-----------|
| T078 | Test: sudden death arms and terminates a deliberate stalemate in bounded ticks | M3 |
| T079 | Test: sudden-death damage does not misfire the under-attack indicator | M3 |

*(T080, T081, T082 were added in the same pass from pre-impl findings F-6, F-7, F-2 — logged under the review rather than under this CR.)*

### Decision Notes

Accepted at the impact gate. The decisive argument was timing: **regression risk and
test-invalidation risk are both zero because nothing is implemented yet.** The identical
change discovered at M7 would have invalidated corpus cases, forced a `simVersion` bump,
and required retuning M8. Two tasks now versus that later is not a close call.
