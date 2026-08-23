import { describe, expect, it } from 'vitest';

import { orderFor } from '../../src/game/input/orders';
import { COLLISION_RADIUS } from '../../src/sim/constants';
import { ENTITY_STATE, KIND, createInitialState, type EntitySeed } from '../../src/sim/state';

/**
 * T054 / FR-008 — right-click means "move" on ground and "attack" on an enemy.
 *
 * The decision is a pure function of simulation state and a world point, kept
 * apart from the Phaser pointer handler so it can be tested without a scene — the
 * same split that let M5's accumulator be tested without booting the game, and the
 * same split that would have caught REV-009 a milestone earlier.
 */

function world(entities: EntitySeed[]) {
  return createInitialState({ seed: 1, difficulty: 1, entities });
}

const TROOPER: EntitySeed = { id: 1, kind: KIND.TROOPER, owner: 0, x: 100, y: 100 };

describe('orderFor — what a right-click means', () => {
  it('orders a move when the click lands on empty ground', () => {
    const state = world([TROOPER]);
    expect(orderFor(state, [1], 500, 400, 0)).toEqual({
      type: 'move',
      units: [1],
      x: 500,
      y: 400,
    });
  });

  it('orders an attack when the click lands on an enemy', () => {
    const state = world([TROOPER, { id: 2, kind: KIND.TANK, owner: 1, x: 500, y: 400 }]);
    expect(orderFor(state, [1], 500, 400, 0)).toEqual({
      type: 'attack',
      units: [1],
      targetId: 2,
    });
  });

  it('orders an attack on an enemy STRUCTURE too — that is how you win', () => {
    const state = world([TROOPER, { id: 2, kind: KIND.BASE, owner: 1, x: 500, y: 400 }]);
    expect(orderFor(state, [1], 500, 400, 0)).toMatchObject({ type: 'attack', targetId: 2 });
  });

  it('orders a move, not an attack, when the click lands on your OWN unit', () => {
    // Right-clicking a friendly must never be an attack order. Friendly fire is
    // not a mechanic in this game, and an attack command naming a friendly target
    // would be silently dropped by the simulation — the unit would just stop.
    const state = world([TROOPER, { id: 2, kind: KIND.TROOPER, owner: 0, x: 500, y: 400 }]);
    expect(orderFor(state, [1], 500, 400, 0)).toMatchObject({ type: 'move' });
  });

  it('ignores the dead — a corpse is ground', () => {
    const state = world([
      TROOPER,
      { id: 2, kind: KIND.TANK, owner: 1, x: 500, y: 400, state: ENTITY_STATE.DEAD },
    ]);
    expect(orderFor(state, [1], 500, 400, 0)).toMatchObject({ type: 'move' });
  });

  it('uses the same click radius as selection, so the two agree', () => {
    // If picking a target were more forgiving than picking a unit, a player would
    // be able to attack something they cannot select — the sort of asymmetry that
    // reads as the game "mis-clicking" for them.
    const state = world([TROOPER, { id: 2, kind: KIND.TANK, owner: 1, x: 500, y: 400 }]);
    const justInside = orderFor(state, [1], 500 + COLLISION_RADIUS - 1, 400, 0);
    const justOutside = orderFor(state, [1], 500 + COLLISION_RADIUS + 1, 400, 0);
    expect(justInside).toMatchObject({ type: 'attack' });
    expect(justOutside).toMatchObject({ type: 'move' });
  });

  it('breaks overlapping-target ties by lowest entity id, like O-1', () => {
    const state = world([
      TROOPER,
      { id: 5, kind: KIND.TANK, owner: 1, x: 500, y: 400 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 502, y: 400 },
    ]);
    expect(orderFor(state, [1], 501, 400, 0)).toMatchObject({ targetId: 3 });
  });

  it('issues nothing when nothing is selected', () => {
    const state = world([TROOPER]);
    expect(orderFor(state, [], 500, 400, 0)).toBeUndefined();
  });

  it('carries the selection through unchanged, in order', () => {
    const state = world([
      TROOPER,
      { id: 2, kind: KIND.TROOPER, owner: 0, x: 120, y: 100 },
      { id: 7, kind: KIND.TANK, owner: 0, x: 140, y: 100 },
    ]);
    expect(orderFor(state, [1, 2, 7], 600, 600, 0)).toMatchObject({ units: [1, 2, 7] });
  });
});

describe('the order carries no scheduling of its own', () => {
  it('omits tick, issuer and seq — the scene owns those', () => {
    // FR-004: intent must be scheduled for a FUTURE tick, and exactly one place
    // decides which. A decision function that stamped its own tick would be a
    // second scheduler, and REV-009 is what happens when scheduling is spread out.
    const state = world([TROOPER]);
    const order = orderFor(state, [1], 500, 400, 0)!;
    expect(Object.keys(order).sort()).toEqual(['type', 'units', 'x', 'y']);
  });
});
