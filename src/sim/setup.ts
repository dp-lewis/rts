/**
 * The standard skirmish opening.
 *
 * Lives in `src/sim/` rather than in the presentation layer because it is
 * simulation data, not drawing: a match must be constructible headlessly for
 * corpus cases and for M7's rematch (T069), and nothing here may depend on
 * Phaser. The layout mirrors corpus case 001 — a reflection across x = 640 on
 * cell centres, so neither side has a geometric advantage and a divergence
 * between the two halves is visible by inspection.
 */

import { MAP_TILES_X, MAP_TILES_Y, ORE_PER_NODE, STARTING_ORE, TILE_PX } from './constants';
import { KIND, createInitialState, type Difficulty, type SimState } from './state';

/** Cell centre in world px. Bases and workers sit on centres so paths stay clean. */
function centre(cell: number): number {
  return cell * TILE_PX + TILE_PX / 2;
}

export const WORLD_WIDTH_PX = MAP_TILES_X * TILE_PX;
export const WORLD_HEIGHT_PX = MAP_TILES_Y * TILE_PX;

/**
 * Player 0 is the human and always starts on the left. FR-014 puts both bases on
 * one fixed screen, so "which side am I" must never need a camera to answer.
 */
export function createMatch(seed: number, difficulty: Difficulty): SimState {
  const midY = (MAP_TILES_Y - 1) / 2;

  return createInitialState({
    seed,
    difficulty,
    players: [{ ore: STARTING_ORE }, { ore: STARTING_ORE }],
    nodes: [
      { id: 0, x: centre(6), y: centre(midY), remaining: ORE_PER_NODE },
      { id: 1, x: centre(13), y: centre(midY), remaining: ORE_PER_NODE },
    ],
    entities: [
      { id: 1, kind: KIND.BASE, owner: 0, x: centre(2), y: centre(midY) },
      { id: 2, kind: KIND.WORKER, owner: 0, x: centre(3), y: centre(midY - 1) },
      { id: 3, kind: KIND.WORKER, owner: 0, x: centre(3), y: centre(midY + 1) },
      // One Factory per side, operational from tick 0 — product-spec.md line 128.
      // Without it a new player has a build bar whose combat entries cannot be
      // used until they work out that a Factory must come first, which is a
      // puzzle the game never sets and never explains.
      { id: 4, kind: KIND.FACTORY, owner: 0, x: centre(4), y: centre(midY) },
      { id: 5, kind: KIND.BASE, owner: 1, x: centre(17), y: centre(midY) },
      { id: 6, kind: KIND.WORKER, owner: 1, x: centre(16), y: centre(midY - 1) },
      { id: 7, kind: KIND.WORKER, owner: 1, x: centre(16), y: centre(midY + 1) },
      { id: 8, kind: KIND.FACTORY, owner: 1, x: centre(15), y: centre(midY) },
    ],
  });
}
