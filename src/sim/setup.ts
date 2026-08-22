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
    // A Base and nothing else. The opening move is the player's: build a Worker,
    // start mining, then choose which production building to put up first.
    //
    // This replaces an opening that handed each side two Workers and a Factory.
    // The cost is that the first ten seconds are now a decision rather than a
    // running economy, which is precisely what M9's comprehension test measures —
    // so that result does not carry over to this design.
    entities: [
      { id: 1, kind: KIND.BASE, owner: 0, x: centre(2), y: centre(midY) },
      { id: 2, kind: KIND.BASE, owner: 1, x: centre(17), y: centre(midY) },
    ],
  });
}
