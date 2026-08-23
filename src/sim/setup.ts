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
    // Eight nodes in four mirrored pairs, spread rather than sat on the centre
    // row. Depletion has always worked — `remaining` counts down and workers
    // retarget when a node runs dry (T030) — but with two nodes there was
    // nowhere to retarget TO, so the mechanic never showed itself. Each node is
    // now much smaller, so a match walks outward: the safe pair beside your Base
    // runs out first and the contested middle is where the ore still is.
    //
    // Every pair mirrors across x = 640 (column c pairs with 19 - c), which
    // `command-seam.test.ts` asserts for entities and now for nodes too. Ore
    // nodes are NOT blocked terrain — workers stand on them — so adding six of
    // them changes the economy and nothing about pathing.
    nodes: [
      // Near each Base: safe, and the first to go.
      { id: 0, x: centre(4), y: centre(2), remaining: ORE_PER_NODE },
      { id: 1, x: centre(4), y: centre(8), remaining: ORE_PER_NODE },
      { id: 2, x: centre(15), y: centre(2), remaining: ORE_PER_NODE },
      { id: 3, x: centre(15), y: centre(8), remaining: ORE_PER_NODE },
      // Mid-field: reachable by both sides, so the late economy is contested.
      { id: 4, x: centre(8), y: centre(3), remaining: ORE_PER_NODE },
      { id: 5, x: centre(8), y: centre(7), remaining: ORE_PER_NODE },
      { id: 6, x: centre(11), y: centre(3), remaining: ORE_PER_NODE },
      { id: 7, x: centre(11), y: centre(7), remaining: ORE_PER_NODE },
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
