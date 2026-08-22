/**
 * Where a click would put a structure — T055, FR-012 / FR-013.
 *
 * Deliberately free of Phaser. The drawing half lives in `render/ghost.ts`; this
 * file answers the QUESTION, and answering it must be possible under plain Node.
 * The split is not tidiness: `placementAt` began life beside the ghost class,
 * which imports Phaser, which needs `window` — so the pure function could not be
 * imported by a test at all, and the requirement it implements went unasserted.
 * Same lesson as the accumulator and `orderFor`.
 *
 * The validity question is answered by the SIMULATION's `isValidPlacement`, never
 * by a presentation-side reimplementation. A ghost that disagreed with the rule
 * would be worse than no ghost — it would teach the player something false.
 */

import { MAP_TILES_X, MAP_TILES_Y, TILE_PX } from '../../sim/constants';
import { isValidPlacement } from '../../sim/production';
import type { SimState } from '../../sim/state';

export interface PlacementTarget {
  /** Cell centre in world px — what a `place` command should carry. */
  x: number;
  y: number;
  valid: boolean;
}

/**
 * Snap a cursor position to the cell it is in and ask the simulation whether a
 * structure could go there.
 *
 * Returns undefined ONLY for a cursor off the map. An occupied cell still comes
 * back, marked invalid: FR-013 wants an invalid ghost drawn, so there has to be
 * something to draw. Returning undefined there would give the player silence
 * where they need a red outline.
 */
export function placementAt(state: SimState, x: number, y: number): PlacementTarget | undefined {
  if (x < 0 || y < 0 || x >= MAP_TILES_X * TILE_PX || y >= MAP_TILES_Y * TILE_PX) {
    return undefined;
  }
  const cx = Math.floor(x / TILE_PX) * TILE_PX + TILE_PX / 2;
  const cy = Math.floor(y / TILE_PX) * TILE_PX + TILE_PX / 2;
  return { x: cx, y: cy, valid: isValidPlacement(state, cx, cy) };
}
