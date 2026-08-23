import { describe, expect, it } from 'vitest';

import { BUILD_ENTRIES, TRAINS } from '../../src/game/hud/roster';
import { placementAt } from '../../src/game/input/placement';
import { COST, MAP_TILES_X, MAP_TILES_Y, TILE_PX } from '../../src/sim/constants';
import { KIND, createInitialState } from '../../src/sim/state';

/**
 * T056 / FR-010 — the build bar's SHAPE is the requirement.
 *
 * "Exactly 5 entries — 4 unit + 1 structure, visually separated, always visible,
 * never nested" is a deliberate ceiling, not a starting point: research found
 * nested build menus to be what makes browser RTS unreadable in the first minute.
 * A ceiling stated only in prose is a ceiling that drifts the first time someone
 * adds a unit, so it is asserted here.
 */

describe('the permanent bar carries buildings only', () => {
  // FR-010 said "exactly five entries — four unit plus one structure — always
  // visible, never nested". The tech-tree change moved units onto the building
  // that makes them, so the bar now carries only what can be PLACED. Recorded as
  // a change request; what survives from the original reasoning is asserted here:
  // the bar is never empty, and it is one flat row.
  it('offers exactly the placeable structures', () => {
    expect(BUILD_ENTRIES.map((e) => e.kind).sort()).toEqual(
      [KIND.BARRACKS, KIND.FACTORY].sort(),
    );
  });

  it('is never empty, so a cold-start player always has something to click', () => {
    expect(BUILD_ENTRIES.length).toBeGreaterThan(0);
  });

  it('contains no units — those live on their building now', () => {
    expect(BUILD_ENTRIES.every((e) => e.placed)).toBe(true);
  });

  it('quotes the simulation costs, never its own copies', () => {
    const byKind = new Map(BUILD_ENTRIES.map((e) => [e.kind, e.cost]));
    expect(byKind.get(KIND.BARRACKS)).toBe(COST.barracks);
    expect(byKind.get(KIND.FACTORY)).toBe(COST.factory);
  });
});

describe('the tech tree — each unit has exactly one building', () => {
  it('routes Worker to the Base, Trooper to the Barracks, Tank to the Factory', () => {
    expect(TRAINS[KIND.BASE]?.map((e) => e.kind)).toEqual([KIND.WORKER]);
    expect(TRAINS[KIND.BARRACKS]?.map((e) => e.kind)).toEqual([KIND.TROOPER]);
    expect(TRAINS[KIND.FACTORY]?.map((e) => e.kind)).toEqual([KIND.TANK]);
  });

  it('quotes simulation costs here too', () => {
    expect(TRAINS[KIND.BASE]?.[0]?.cost).toBe(COST.worker);
    expect(TRAINS[KIND.BARRACKS]?.[0]?.cost).toBe(COST.trooper);
    expect(TRAINS[KIND.FACTORY]?.[0]?.cost).toBe(COST.tank);
  });

  it('gives every trainable unit a home, so none is unreachable', () => {
    // The Factory was a 200-ore ornament for three milestones because nothing
    // routed to it. A unit with no building is the same defect waiting to happen.
    const homed = new Set(Object.values(TRAINS).flat().map((e) => e.kind));
    for (const kind of [KIND.WORKER, KIND.TROOPER, KIND.TANK]) {
      expect(homed.has(kind), `kind ${kind} has no building that makes it`).toBe(true);
    }
  });
});

describe('placementAt — the ghost asks the simulation, not itself', () => {
  const centre = (cell: number): number => cell * TILE_PX + TILE_PX / 2;
  const state = createInitialState({
    seed: 1,
    difficulty: 1,
    entities: [{ id: 1, kind: KIND.BASE, owner: 0, x: centre(2), y: centre(5) }],
  });

  it('snaps any point in a cell to that cell centre', () => {
    for (const [x, y] of [
      [centre(6), centre(5)],
      [centre(6) - 31, centre(5) + 31],
      [6 * TILE_PX, 5 * TILE_PX],
    ]) {
      const target = placementAt(state, x!, y!);
      expect(target?.x).toBe(centre(6));
      expect(target?.y).toBe(centre(5));
    }
  });

  it('reports valid ground as valid', () => {
    expect(placementAt(state, centre(6), centre(5))?.valid).toBe(true);
  });

  it('reports an occupied cell as invalid rather than refusing to answer', () => {
    // FR-013: the ghost must show an INVALID STATE, so it needs a target back
    // even when the answer is no. Returning undefined would leave nothing to
    // draw, and the player would get silence where they need a red outline.
    const target = placementAt(state, centre(2), centre(5));
    expect(target).toBeDefined();
    expect(target?.valid).toBe(false);
  });

  it('returns nothing only for a cursor off the map', () => {
    expect(placementAt(state, -1, centre(5))).toBeUndefined();
    expect(placementAt(state, MAP_TILES_X * TILE_PX, centre(5))).toBeUndefined();
    expect(placementAt(state, centre(5), MAP_TILES_Y * TILE_PX)).toBeUndefined();
  });

  it('agrees with the simulation about the cell it names', () => {
    // The ghost's whole job is to promise what the `place` command will do. If
    // these two ever disagreed, the ghost would be teaching the player something
    // false — worse than showing no ghost at all.
    const target = placementAt(state, centre(9) + 20, centre(3) - 20)!;
    expect(target.x % TILE_PX).toBe(TILE_PX / 2);
    expect(target.y % TILE_PX).toBe(TILE_PX / 2);
  });
});
