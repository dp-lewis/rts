# CR-002 — Tech tree: buildings gate units, and the opening is the player's

> Raised: 2026-08-22 · Requested by: product owner, after M9 round 2
> Status: **IMPLEMENTED** · `SIM_VERSION` 10 → 11

## What changed

1. A match starts with a **Base and 150 ore**. No Workers, no buildings.
2. **Troopers require a Barracks** — a new structure.
3. **Tanks require a Factory.**
4. The Barracks uses `scifiStructure_05`, distinct from Base and Factory.
5. Units are trained by **selecting the building that makes them**. The permanent
   bar carries only what can be placed.

Two consequences that followed rather than being asked for:

6. **The Scout is retired.** With Trooper behind a Barracks and Tank behind a
   Factory it had no rung of its own, and round-1 playtesters had already called it
   purposeless. `KIND` slot 3 is left permanently empty rather than renumbered, so an
   old corpus case carrying `"kind": 3` fails loudly instead of being silently
   reinterpreted as another unit.
7. **The first Worker is free**, via pre-impl F-6's existing zero-cost rule. Chosen
   deliberately at the gate: it means a player can never be stuck at tick 0.

## Requirements this moves

Four locked requirements are changed. They are listed here rather than quietly
violated, because three are **Must** tier.

| Requirement | Was | Now |
|---|---|---|
| **FR-006** (Must) | "Starting workers auto-gather from tick 0 with no player input" | No starting Workers. Ore moves only after the player trains one. |
| **FR-010** (Must) | "Build bar shows exactly 5 entries — 4 unit + 1 structure — always visible, never nested" | Bar carries the 2 placeable structures. Units appear on the building that makes them. |
| **FR-012** (Must) | "Player may place additional **Factories**" | Player may place Barracks and Factories. |
| Design decision 2026-08-21 | "Two structures; Factory is the only buildable — exactly one new interaction and one real economic decision" | Three structures, two buildable, and a tech order to decide. |

## The argument against, recorded

`ux-patterns.md` line 37 names the strongest reason to leave FR-006 alone:

> Page loads → **already in a match**. "Oh, it started." No menu, no lobby, no
> account. Cold start straight into playable state. **This is our biggest structural
> advantage over every competitor.**

The game now opens on a Base doing nothing until the player clicks it. That is one
click and the Worker is free, so the delay is small — but it is a real trade against
the finding the product was positioned on, and it was made knowingly.

Line 41 is the matching argument against the FR-010 change:

> Build menu ≤4 entries, **always visible, never nested**.

What survives of that reasoning: the permanent bar is never empty, the production
panel is one flat row that appears in place, and nothing opens a menu inside a menu.
What is lost: a first-time player can no longer see the whole roster at once, and has
to discover the tech tree by selecting things.

## Consequences that had to be re-done

- **M8's tuning is void and was redone.** Two producers working in parallel and a
  later army changed pacing. Re-measured over 30 matches: **median 7.78 min, p90
  10.84**, range 6.67–10.84 — inside the K4 band and the tightest spread the project
  has recorded. Difficulty now separates clearly: 10.8 / 7.8 / 6.7 min.
- **M9's comprehension result does not carry over.** K1 was measured against an
  opening that no longer exists. The first thirty seconds are exactly what it tests.
- **Corpus regenerated** at `SIM_VERSION` 11, with Scout entities removed and every
  build command rerouted to the building that now makes its unit.

## Defects found while implementing

- **The AI could not reach the Factory tier.** Its gate was `ore >= factory + trooper`,
  but it spends on Troopers as fast as it mines, so the balance never accumulated:
  measured over three seeds it built zero Factories and zero Tanks. The top of the new
  tech tree was unreachable for the opponent — REV-007's shape in a new place. It now
  banks for the next tier once it has an army worth defending.
- **The AI built two Factories.** `producerOf` excludes under-construction buildings
  because they cannot train anything, and using it to decide whether to BUILD one meant
  the answer stayed "no" for the whole construction time.
- **`isStructureKind` extracted.** The `kind === BASE || kind === FACTORY` test was
  written longhand in five places. The one in `gridFor` would have been the expensive
  miss: a structure absent from the passability grid is a building units walk through.

## Open

- **Seeds barely vary a match.** The AI's only PRNG draw is degenerate whenever one
  option is affordable, which is most of the time. Different seeds now produce nearly
  identical matches (7388 / 7388 / 7384 ticks over three seeds). FR-029's replay
  guarantees still hold; "different seed, different match" no longer does in practice.
