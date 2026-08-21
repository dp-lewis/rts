import { cellX, cellY, isPassable, type Grid } from './grid';

/**
 * A* over the tile grid, with a total tie-break — O-2 / FR-022.
 *
 * The hazard here is easy to underestimate. Between two opposite corners of an
 * open 20x11 grid there are astronomically many equal-cost shortest paths, and
 * which one A* returns is decided entirely by which node it pops when several
 * share the lowest `f`. With no tie-break that is decided by whatever order the
 * open set happens to hold them in — a property of the data structure, not of the
 * game — and two machines replaying the same command log would send the same unit
 * down different routes.
 *
 * The tie-break is therefore total, not merely helpful:
 *   1. lowest `f`
 *   2. lowest `h`   — prefer nodes closer to the goal; a pure heuristic tie-break
 *                     that shortens the search without affecting correctness
 *   3. lowest cell index  (FR-022's first key)
 * and the caller's `entityId` seeds nothing at all — see the note below.
 *
 * No path is stored on the entity. Units do not collide in v1 (pre-impl review
 * F-2) and the grid is static, so a path is a pure function of its inputs and can
 * be recomputed whenever it is needed. Over ~220 cells that is microseconds. See
 * ADR-001 Amendment 2.
 */

/** Manhattan distance — exact and admissible on a 4-connected grid. */
function heuristic(grid: Grid, from: number, to: number): number {
  return Math.abs(cellX(grid, from) - cellX(grid, to)) + Math.abs(cellY(grid, from) - cellY(grid, to));
}

/**
 * The open-set comparator — this is O-2 itself, exported so it can be tested
 * directly rather than inferred from path output.
 *
 * That distinction is not pedantry. The open set below is a linearly scanned
 * array, so with NO tie-break at all the search would still be deterministic:
 * among equal `f` the first-pushed candidate wins, and push order is fixed. Every
 * path-level assertion therefore passes whether this comparator is total or
 * absent — verified by deleting it and watching all ten pathfinding tests stay
 * green. The tie-break only starts carrying weight the moment the open set's
 * order changes, which is exactly what swapping in a binary heap would do.
 *
 * So the comparator is tested against PERMUTED candidate order, where the absence
 * of a tie-break is immediately visible.
 *
 * Ordering, total by construction:
 *   1. lowest `f`
 *   2. lowest `h`     — prefer nodes nearer the goal; shortens the search
 *   3. lowest cell index  (FR-022)
 */
export function chooseBestOpen(open: readonly number[], f: Int32Array, h: Int32Array): number {
  let best = open[0]!;
  for (let i = 1; i < open.length; i += 1) {
    const cell = open[i]!;
    const df = f[cell]! - f[best]!;
    if (df < 0 || (df === 0 && (h[cell]! < h[best]! || (h[cell]! === h[best]! && cell < best)))) {
      best = cell;
    }
  }
  return best;
}

/**
 * A linear scan, deliberately. A binary heap would need its own tie-break to stay
 * deterministic under equal keys — heap sift order is exactly the kind of
 * incidental ordering O-7 warns about — whereas a scan over at most ~220 cells is
 * both trivially fast and obviously correct. If profiling ever says otherwise, the
 * replacement must carry `chooseBestOpen`'s comparator, and the comparator tests
 * are what will still hold it honest.
 */
function popBest(open: number[], f: Int32Array, h: Int32Array): number {
  const best = chooseBestOpen(open, f, h);
  open.splice(open.indexOf(best), 1);
  return best;
}

/**
 * @param entityId  Present because FR-022 names entity id as the second tie-break
 *                  key. It is deliberately NOT used to vary the search: two units
 *                  asking for the same route get the same route, which is both
 *                  correct and the only behaviour that is testable for stability.
 *                  The key exists for a future site where two entities contend for
 *                  one cell — reservation or formation assignment — and it should
 *                  be applied there, at the point of contention, rather than
 *                  smuggled into the heuristic where it would silently degrade
 *                  path quality.
 */
export function findPath(grid: Grid, start: number, goal: number, entityId: number): number[] {
  void entityId;

  if (start === goal || !isPassable(grid, goal) || !isPassable(grid, start)) {
    return [];
  }

  const size = grid.width * grid.height;
  const g = new Int32Array(size).fill(-1);
  const f = new Int32Array(size).fill(-1);
  const h = new Int32Array(size).fill(-1);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  g[start] = 0;
  h[start] = heuristic(grid, start, goal);
  f[start] = h[start]!;
  const open: number[] = [start];

  while (open.length > 0) {
    const current = popBest(open, f, h);
    if (current === goal) {
      const path: number[] = [];
      let node = goal;
      while (node !== start) {
        path.push(node);
        node = cameFrom[node]!;
      }
      return path.reverse();
    }

    closed[current] = 1;
    const cx = cellX(grid, current);
    const cy = cellY(grid, current);

    // Neighbours in a fixed order. Even with a total tie-break this stays fixed:
    // relying on the comparator alone would make the result depend on the order
    // neighbours were pushed, which is the same class of bug one level down.
    const neighbours = [
      cy > 0 ? current - grid.width : -1, // north
      cx > 0 ? current - 1 : -1, // west
      cx < grid.width - 1 ? current + 1 : -1, // east
      cy < grid.height - 1 ? current + grid.width : -1, // south
    ];

    for (let i = 0; i < neighbours.length; i += 1) {
      const next = neighbours[i]!;
      if (next < 0 || closed[next] === 1 || !isPassable(grid, next)) {
        continue;
      }

      const tentative = g[current]! + 1;
      if (g[next] === -1 || tentative < g[next]!) {
        if (g[next] === -1) {
          open.push(next);
        }
        cameFrom[next] = current;
        g[next] = tentative;
        h[next] = heuristic(grid, next, goal);
        f[next] = tentative + h[next]!;
      }
    }
  }

  return [];
}
