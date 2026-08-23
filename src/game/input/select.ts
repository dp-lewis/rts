/**
 * Drag-rectangle selection — T053, FR-007 / FR-030.
 *
 * Pure geometry over simulation state. It takes no Phaser object, no texture, and
 * no camera, which is what makes FR-030 structural rather than a promise: there is
 * no parameter through which sprite dimensions could reach the decision, so
 * reskinning a unit cannot change what a drag captures.
 *
 * This matters more than it sounds. Kenney's units occupy a small and UNEVEN
 * fraction of their 64 px canvas, so sprite-bounds selection would make a tank
 * easier to box than a scout for reasons that are an accident of the art. And
 * since M5's jitter draws a unit up to 18 px from its simulated position (M5-F5),
 * "where it looks" and "where it is" are genuinely different points — only the
 * simulated one is correct to select against.
 */

import { COLLISION_RADIUS } from '../../sim/constants';
import { ENTITY_STATE, isStructureKind, type Owner, type SimState } from '../../sim/state';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Structures are not selectable: FR-007 is about units, and a Base never moves. */
function isSelectableKind(kind: number): boolean {
  return !isStructureKind(kind);
}

/**
 * Does a circle at (cx, cy) overlap the axis-aligned rectangle?
 *
 * Clamp the centre into the rectangle to get the nearest point on it, then compare
 * SQUARED distances — no `Math.sqrt`, matching the simulation's convention even
 * though this file is not bound by the `src/sim` lint rules.
 *
 * A zero-area rectangle degenerates correctly: the clamp returns the click point
 * itself, so a click becomes "is the cursor within a unit's radius", which is
 * exactly what single-unit selection should mean.
 */
function circleIntersectsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const left = Math.min(rect.x0, rect.x1);
  const right = Math.max(rect.x0, rect.x1);
  const top = Math.min(rect.y0, rect.y1);
  const bottom = Math.max(rect.y0, rect.y1);

  const nearestX = Math.min(Math.max(cx, left), right);
  const nearestY = Math.min(Math.max(cy, top), bottom);

  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Every live unit of `owner` whose collision circle the rectangle touches.
 *
 * Returned in ascending id order. Not cosmetic: a selection is fed straight back
 * in as a command's `units` array, and command payloads are hashed — so an
 * insertion-ordered result would make the same drag produce a different command
 * depending on the order units happened to be spawned in.
 */
export function selectInRect(state: SimState, rect: Rect, owner: Owner): number[] {
  const selected: number[] = [];

  // `state.entities` is id-sorted by construction (O-7), so a single forward pass
  // already yields ascending ids without a sort.
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;

    if (entity.owner !== owner) {
      continue;
    }
    if (entity.state === ENTITY_STATE.DEAD) {
      continue;
    }
    if (!isSelectableKind(entity.kind)) {
      continue;
    }
    if (!circleIntersectsRect(entity.x, entity.y, COLLISION_RADIUS, rect)) {
      continue;
    }

    selected.push(entity.id);
  }

  return selected;
}
