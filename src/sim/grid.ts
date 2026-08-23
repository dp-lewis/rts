import { TILE_PX } from './constants';

/**
 * The 64 px tile grid — FR-014, a fixed single screen of roughly 20x11 tiles.
 *
 * Cells are addressed by a single integer index (`y * width + x`) rather than an
 * `{x, y}` pair. That is not micro-optimisation: a scalar index gives the A* open
 * set a natural, total, and cheap tie-break key (O-2 breaks ties by lowest cell
 * index), and it removes any question of how two coordinate pairs compare.
 *
 * Passability is a flat boolean array in the same index space, so `blocked[cell]`
 * is a direct lookup with no branching on bounds inside the pathfinder's hot loop.
 */

export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly blocked: readonly boolean[];
}

export function createGrid(width: number, height: number, blockedCells: readonly number[]): Grid {
  const blocked = new Array<boolean>(width * height).fill(false);
  // Order-independent by construction: setting a flag twice is the same as
  // setting it once, so the order blocked cells arrive in cannot matter.
  for (let i = 0; i < blockedCells.length; i += 1) {
    const cell = blockedCells[i]!;
    if (cell >= 0 && cell < blocked.length) {
      blocked[cell] = true;
    }
  }
  return { width, height, blocked };
}

export function cellIndex(grid: Grid, cx: number, cy: number): number {
  return cy * grid.width + cx;
}

export function cellX(grid: Grid, cell: number): number {
  return cell % grid.width;
}

export function cellY(grid: Grid, cell: number): number {
  return Math.floor(cell / grid.width);
}

/** World px → cell index. */
export function cellOf(grid: Grid, x: number, y: number): number {
  const cx = Math.floor(x / TILE_PX);
  const cy = Math.floor(y / TILE_PX);
  return cellIndex(grid, cx, cy);
}

/** Centre of a cell in world px — where a unit stands when it occupies the cell. */
export function cellCentreX(grid: Grid, cell: number): number {
  return cellX(grid, cell) * TILE_PX + TILE_PX / 2;
}

export function cellCentreY(grid: Grid, cell: number): number {
  return cellY(grid, cell) * TILE_PX + TILE_PX / 2;
}

export function inBounds(grid: Grid, cell: number): boolean {
  return cell >= 0 && cell < grid.width * grid.height;
}

export function isPassable(grid: Grid, cell: number): boolean {
  return inBounds(grid, cell) && !grid.blocked[cell];
}
