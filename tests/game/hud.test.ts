import { describe, expect, it } from 'vitest';

import { BUILD_ENTRIES } from '../../src/game/hud/roster';
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

describe('the build bar is exactly five flat entries', () => {
  it('has five, and not four or six', () => {
    expect(BUILD_ENTRIES).toHaveLength(5);
  });

  it('splits four units and one structure', () => {
    const structures = BUILD_ENTRIES.filter((e) => e.placed);
    expect(structures).toHaveLength(1);
    expect(structures[0]?.kind).toBe(KIND.FACTORY);
    expect(BUILD_ENTRIES.filter((e) => !e.placed)).toHaveLength(4);
  });

  it('puts the structure last, so the visual separation is one gap', () => {
    expect(BUILD_ENTRIES[BUILD_ENTRIES.length - 1]?.placed).toBe(true);
  });

  it('quotes the simulation costs, never its own copies', () => {
    // FR-011 shows the cost on the greyed entry. A HUD holding its own numbers
    // would drift from the simulation the first time M8 retunes, and would tell
    // the player a price the game does not charge.
    const byKind = new Map(BUILD_ENTRIES.map((e) => [e.kind, e.cost]));
    expect(byKind.get(KIND.WORKER)).toBe(COST.worker);
    expect(byKind.get(KIND.SCOUT)).toBe(COST.scout);
    expect(byKind.get(KIND.TROOPER)).toBe(COST.trooper);
    expect(byKind.get(KIND.TANK)).toBe(COST.tank);
    expect(byKind.get(KIND.FACTORY)).toBe(COST.factory);
  });

  it('names every entry', () => {
    for (const entry of BUILD_ENTRIES) {
      expect(entry.label.length).toBeGreaterThan(0);
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
