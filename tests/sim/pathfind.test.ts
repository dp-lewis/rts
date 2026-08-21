import { describe, expect, it } from 'vitest';

import { createGrid, cellIndex, type Grid } from '../../src/sim/grid';
import { chooseBestOpen, findPath } from '../../src/sim/pathfind';

/**
 * T026 — O-2 / TC-UNIT-004, the A* open-set tie-break.
 *
 * On an open grid the number of equal-cost shortest paths between two diagonal
 * corners is enormous. Which one A* returns depends entirely on which node it
 * pops when several share the lowest `f` — and "which one it pops" is decided by
 * the tie-break, or, if there is no tie-break, by whatever order the open set
 * happens to hold them in. The second option is a divergence waiting to happen,
 * and it would show up as two machines' units taking different routes from the
 * same order.
 *
 * The rule (FR-022): ties break by lowest cell index, then by lowest entity id.
 *
 * These tests do not assert a specific route. Asserting "the path is exactly
 * these cells" would pin the tie-break to whatever the implementation did first,
 * which proves nothing about stability. They assert that the route is the SAME
 * every time, under every perturbation that must not matter.
 */

/** An open field with no walls — the worst case for tie-breaking. */
function openGrid(w = 20, h = 11): Grid {
  return createGrid(w, h, []);
}

describe('findPath basics', () => {
  it('returns a path from start to goal', () => {
    const grid = openGrid();
    const path = findPath(grid, cellIndex(grid, 0, 0), cellIndex(grid, 5, 3), 1);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toBe(cellIndex(grid, 5, 3));
  });

  it('returns an empty path when start and goal are the same cell', () => {
    const grid = openGrid();
    const start = cellIndex(grid, 4, 4);
    expect(findPath(grid, start, start, 1)).toEqual([]);
  });

  it('returns an empty path when the goal is unreachable', () => {
    // A full-height wall at x=3 with no gap.
    const grid = createGrid(8, 5, [
      cellIndex({ width: 8, height: 5, blocked: [] } as Grid, 3, 0),
    ]);
    const walled = createGrid(8, 5, [0, 1, 2, 3, 4].map((y) => cellIndex(grid, 3, y)));
    const path = findPath(walled, cellIndex(walled, 0, 2), cellIndex(walled, 7, 2), 1);
    expect(path).toEqual([]);
  });

  it('never routes through a blocked cell', () => {
    const grid = createGrid(8, 5, [cellIndex(openGrid(8, 5), 3, 2)]);
    const blocked = cellIndex(grid, 3, 2);
    const path = findPath(grid, cellIndex(grid, 0, 2), cellIndex(grid, 7, 2), 1);
    expect(path.length).toBeGreaterThan(0);
    expect(path).not.toContain(blocked);
  });
});

describe('O-2 — the tie-break is stable', () => {
  // Built inside each test rather than in describe scope: a helper that throws
  // during collection takes the whole file down and reports a suite error
  // instead of failing assertions, which is a materially weaker Red.
  const corners = (): { grid: Grid; start: number; goal: number } => {
    const grid = openGrid();
    return { grid, start: cellIndex(grid, 0, 0), goal: cellIndex(grid, 19, 10) };
  };

  it('returns an identical path across repeated calls', () => {
    const { grid, start, goal } = corners();
    const first = findPath(grid, start, goal, 1);
    for (let i = 0; i < 25; i += 1) {
      expect(findPath(grid, start, goal, 1)).toEqual(first);
    }
  });

  it('returns an identical path from a freshly constructed identical grid', () => {
    const { start, goal } = corners();
    // Guards against state accumulating inside the pathfinder between calls —
    // a reused open set or a memo that survives across invocations.
    const a = findPath(openGrid(), start, goal, 1);
    const b = findPath(openGrid(), start, goal, 1);
    expect(b).toEqual(a);
  });

  it('breaks ties by entity id when everything else is equal', () => {
    const { grid, start, goal } = corners();
    // Same start, same goal, different requester. FR-022 makes entity id the
    // second tie-break key, so two units must be allowed to differ — but each
    // must be individually stable, which is the property that matters.
    const forOne = findPath(grid, start, goal, 1);
    const forTwo = findPath(grid, start, goal, 2);
    expect(findPath(grid, start, goal, 1)).toEqual(forOne);
    expect(findPath(grid, start, goal, 2)).toEqual(forTwo);
  });

  it('is unaffected by the order blocked cells were declared in', () => {
    const { grid, start, goal } = corners();
    const walls = [cellIndex(grid, 5, 4), cellIndex(grid, 5, 5), cellIndex(grid, 5, 6)];
    const forward = findPath(createGrid(20, 11, walls), start, goal, 1);
    const reversed = findPath(createGrid(20, 11, [...walls].reverse()), start, goal, 1);
    const shuffled = findPath(createGrid(20, 11, [walls[1]!, walls[2]!, walls[0]!]), start, goal, 1);
    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('produces a contiguous path of adjacent cells', () => {
    const { grid, start, goal } = corners();
    const path = findPath(grid, start, goal, 1);
    let prev = start;
    for (const cell of path) {
      const dx = Math.abs((cell % grid.width) - (prev % grid.width));
      const dy = Math.abs(Math.floor(cell / grid.width) - Math.floor(prev / grid.width));
      expect(dx + dy).toBe(1);
      prev = cell;
    }
  });

  it('finds a shortest path, not merely a path', () => {
    const { grid, start, goal } = corners();
    // Manhattan distance is the exact lower bound on a 4-connected open grid.
    const path = findPath(grid, start, goal, 1);
    expect(path.length).toBe(19 + 10);
  });
});

describe('O-2 — the comparator itself, independent of push order', () => {
  /**
   * Why this exists.
   *
   * Every path-level assertion above passes even with the tie-break DELETED —
   * verified by deleting it. The open set is a linearly scanned array, so among
   * equal `f` the first-pushed candidate wins and push order is fixed, which makes
   * the search deterministic for a reason that has nothing to do with FR-022.
   *
   * That is the same failure this project caught in M0, where a lint test would
   * have gone green against an empty config: a guard that is never exercised is a
   * guard nobody has. So the comparator is tested against permuted candidate
   * order, where the absence of a tie-break shows up immediately.
   */
  const permutations: ReadonlyArray<readonly number[]> = [
    [10, 11, 12, 13],
    [13, 12, 11, 10],
    [12, 10, 13, 11],
    [11, 13, 10, 12],
  ];

  function scores(fValues: Record<number, number>, hValues: Record<number, number>): [Int32Array, Int32Array] {
    const f = new Int32Array(32);
    const h = new Int32Array(32);
    for (const [cell, value] of Object.entries(fValues)) f[Number(cell)] = value;
    for (const [cell, value] of Object.entries(hValues)) h[Number(cell)] = value;
    return [f, h];
  }

  it('picks the lowest f regardless of candidate order', () => {
    const [f, h] = scores({ 10: 9, 11: 4, 12: 7, 13: 9 }, { 10: 1, 11: 1, 12: 1, 13: 1 });
    for (const order of permutations) {
      expect(chooseBestOpen(order, f, h)).toBe(11);
    }
  });

  it('breaks an f tie by the lower h, regardless of candidate order', () => {
    const [f, h] = scores({ 10: 5, 11: 5, 12: 5, 13: 5 }, { 10: 4, 11: 2, 12: 6, 13: 3 });
    for (const order of permutations) {
      expect(chooseBestOpen(order, f, h)).toBe(11);
    }
  });

  it('breaks an f AND h tie by the lowest cell index (FR-022)', () => {
    // The assertion the whole rule exists for. With no tie-break this returns
    // whichever cell happened to come first in the array, so it differs per
    // permutation and this test fails on all but one of them.
    const [f, h] = scores({ 10: 5, 11: 5, 12: 5, 13: 5 }, { 10: 3, 11: 3, 12: 3, 13: 3 });
    for (const order of permutations) {
      expect(chooseBestOpen(order, f, h)).toBe(10);
    }
  });

  it('is total — every permutation of a fully tied set yields one answer', () => {
    const [f, h] = scores({ 10: 2, 11: 2, 12: 2, 13: 2 }, { 10: 0, 11: 0, 12: 0, 13: 0 });
    const answers = new Set(permutations.map((order) => chooseBestOpen(order, f, h)));
    expect(answers.size).toBe(1);
  });

  it('handles a single candidate', () => {
    const [f, h] = scores({ 7: 3 }, { 7: 1 });
    expect(chooseBestOpen([7], f, h)).toBe(7);
  });
});
