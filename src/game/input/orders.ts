/**
 * Right-click orders — T054, FR-008.
 *
 * Decides what a click MEANS. It does not schedule, does not enqueue, and does
 * not know what tick it is: it returns intent, and `MatchScene.issue` is the one
 * place that stamps `tick`, `issuer` and `seq` onto it. Keeping that in exactly
 * one place is the lesson of REV-009 — scheduling spread across two files is how
 * an off-by-one hides.
 */

import { COLLISION_RADIUS } from '../../sim/constants';
import { ENTITY_STATE, type Owner, type SimState } from '../../sim/state';
import type { PlayerIntent } from '../scenes/Match';

/**
 * The enemy entity under a click, or undefined for ground.
 *
 * Ties break to the LOWEST entity id, matching O-1's target acquisition rule. The
 * two are different code paths solving the same question, and having them
 * disagree would mean a manual attack order picked a different enemy than
 * auto-acquisition would from the same position.
 */
function enemyAt(state: SimState, x: number, y: number, owner: Owner): number | undefined {
  // `state.entities` is id-sorted (O-7), so the first hit IS the lowest id.
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.owner === owner || entity.state === ENTITY_STATE.DEAD) {
      continue;
    }
    const dx = entity.x - x;
    const dy = entity.y - y;
    if (dx * dx + dy * dy <= COLLISION_RADIUS * COLLISION_RADIUS) {
      return entity.id;
    }
  }
  return undefined;
}

/**
 * What the player means by right-clicking at (x, y) with `units` selected.
 *
 * Returns `undefined` when nothing is selected — an order with no units is not a
 * command worth scheduling, and letting one through would put an empty payload
 * into the hashed command stream.
 */
export function orderFor(
  state: SimState,
  units: readonly number[],
  x: number,
  y: number,
  owner: Owner,
): PlayerIntent | undefined {
  if (units.length === 0) {
    return undefined;
  }

  const target = enemyAt(state, x, y, owner);
  if (target !== undefined) {
    return { type: 'attack', units: [...units], targetId: target };
  }

  return { type: 'move', units: [...units], x, y };
}
