import { describe, expect, it } from 'vitest';

import { JITTER_PX, jitterFor } from '../../src/game/render/jitter';
import { selectInRect, type Rect } from '../../src/game/input/select';
import { COLLISION_RADIUS } from '../../src/sim/constants';
import { ENTITY_STATE, KIND, createInitialState, type EntitySeed } from '../../src/sim/state';

/**
 * T052 / FR-030 — selection tests COLLISION CIRCLES, not sprite bounds.
 *
 * The requirement exists because sprite bounds are an accident of the art. Kenney's
 * units occupy a fraction of their 64 px canvas and vary in size between kinds, so
 * selection built on sprite rectangles would silently change the moment anyone
 * swapped a sprite — and would already be wrong today, because M5's jitter draws a
 * unit up to 18 px from where it actually is (M5-F5).
 *
 * The strongest form of that assertion is the jitter one below: what the player
 * drags a box around and what the box captures are judged in DIFFERENT coordinate
 * spaces, and only the simulated one is correct.
 */

const R = COLLISION_RADIUS;

function world(entities: EntitySeed[]) {
  return createInitialState({ seed: 1, difficulty: 1, entities });
}

const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });

describe('selectInRect — what a drag captures', () => {
  it('selects an own unit whose centre is inside the rectangle', () => {
    const state = world([{ id: 1, kind: KIND.TROOPER, owner: 0, x: 100, y: 100 }]);
    expect(selectInRect(state, rect(50, 50, 150, 150), 0)).toEqual([1]);
  });

  it('selects a unit whose CIRCLE the rectangle clips, though its centre is outside', () => {
    // The whole point of FR-030. The rectangle stops short of the centre but
    // overlaps the body; a point-in-rect test would miss it and the player would
    // watch a unit they clearly boxed fail to respond.
    const state = world([{ id: 1, kind: KIND.TROOPER, owner: 0, x: 100, y: 100 }]);
    const grazing = rect(0, 0, 100 - R + 1, 200);
    expect(selectInRect(state, grazing, 0)).toEqual([1]);
  });

  it('does NOT select a unit the rectangle misses by more than its radius', () => {
    const state = world([{ id: 1, kind: KIND.TROOPER, owner: 0, x: 100, y: 100 }]);
    expect(selectInRect(state, rect(0, 0, 100 - R - 1, 200), 0)).toEqual([]);
  });

  it('judges against the simulated position, not the drawn one', () => {
    // M5-F5 made this load-bearing rather than tidy: the renderer offsets a unit
    // by up to JITTER_PX, so "where it looks" and "where it is" are genuinely
    // different points. A tight box around the TRUE position must select, for
    // every id, whichever way that id happens to be offset.
    for (let id = 1; id <= 40; id += 1) {
      const state = world([{ id, kind: KIND.SCOUT, owner: 0, x: 300, y: 300 }]);
      expect(selectInRect(state, rect(298, 298, 302, 302), 0)).toEqual([id]);
    }
  });
});

describe('the jitter/selection coupling', () => {
  it('never draws a unit further from its true position than the click radius', () => {
    // The property that makes the two coordinate spaces safe to have at once: a
    // player clicks what they SEE, and selection is judged where the unit IS. So
    // long as the drawn position stays within one collision radius of the true
    // one, clicking the sprite always hits the unit. Raise JITTER_PX above
    // COLLISION_RADIUS and single-click selection starts failing for the units
    // that happen to be offset horizontally — intermittently, by id, which is
    // about the worst bug shape available.
    //
    // Neither constant knows about the other, and no behavioural test can see the
    // relationship, so it is asserted directly — the same shape as M5's
    // MAX_ACCUMULATOR_MS / MAX_STEPS_PER_FRAME coupling.
    expect(JITTER_PX).toBeLessThanOrEqual(COLLISION_RADIUS);
  });

  it('selects a unit from a click on its drawn position, for every id', () => {
    for (let id = 1; id <= 60; id += 1) {
      const { dx, dy } = jitterFor(id);
      const state = world([{ id, kind: KIND.TROOPER, owner: 0, x: 400, y: 400 }]);
      const clickWhereItLooks = rect(400 + dx, 400 + dy, 400 + dx, 400 + dy);
      expect(
        selectInRect(state, clickWhereItLooks, 0),
        `clicking the drawn position of unit ${id} missed it`,
      ).toEqual([id]);
    }
  });
});

describe('what a drag must never capture', () => {
  const mixed = world([
    { id: 1, kind: KIND.TROOPER, owner: 0, x: 100, y: 100 },
    { id: 2, kind: KIND.TROOPER, owner: 1, x: 120, y: 100 },
    { id: 3, kind: KIND.BASE, owner: 0, x: 140, y: 100 },
    { id: 4, kind: KIND.FACTORY, owner: 0, x: 160, y: 100 },
    { id: 5, kind: KIND.SCOUT, owner: 0, x: 180, y: 100, state: ENTITY_STATE.DEAD },
  ]);
  const everything = rect(0, 0, 1000, 1000);

  it('never selects an enemy unit', () => {
    expect(selectInRect(mixed, everything, 0)).not.toContain(2);
  });

  it('never selects structures — FR-007 is about units', () => {
    const selected = selectInRect(mixed, everything, 0);
    expect(selected).not.toContain(3);
    expect(selected).not.toContain(4);
  });

  it('never selects the dead', () => {
    expect(selectInRect(mixed, everything, 0)).not.toContain(5);
  });

  it('selects exactly the one live own unit in that world', () => {
    expect(selectInRect(mixed, everything, 0)).toEqual([1]);
  });
});

describe('drag geometry', () => {
  const four = world([
    { id: 1, kind: KIND.TROOPER, owner: 0, x: 100, y: 100 },
    { id: 2, kind: KIND.SCOUT, owner: 0, x: 200, y: 100 },
    { id: 3, kind: KIND.WORKER, owner: 0, x: 100, y: 200 },
    { id: 4, kind: KIND.TANK, owner: 0, x: 200, y: 200 },
  ]);

  it('normalises a rectangle dragged right-to-left and bottom-to-top', () => {
    const forward = selectInRect(four, rect(50, 50, 250, 250), 0);
    const backward = selectInRect(four, rect(250, 250, 50, 50), 0);
    expect(backward).toEqual(forward);
    expect(forward).toEqual([1, 2, 3, 4]);
  });

  it('treats a zero-area drag as a click and still selects what is under it', () => {
    // A click is a drag with no movement. Requiring area would make single-unit
    // selection — the most common action in the game — silently unreliable.
    expect(selectInRect(four, rect(100, 100, 100, 100), 0)).toEqual([1]);
  });

  it('returns ids in ascending order regardless of entity array order', () => {
    // O-7 discipline: a selection is fed back in as command `units`, and command
    // payloads are hashed. Insertion-order output would make the same drag produce
    // different commands depending on spawn history.
    const shuffled = world([
      { id: 9, kind: KIND.SCOUT, owner: 0, x: 100, y: 100 },
      { id: 2, kind: KIND.TROOPER, owner: 0, x: 110, y: 100 },
      { id: 5, kind: KIND.TANK, owner: 0, x: 120, y: 100 },
    ]);
    expect(selectInRect(shuffled, rect(0, 0, 500, 500), 0)).toEqual([2, 5, 9]);
  });

  it('selects nothing when the drag lands on empty ground', () => {
    expect(selectInRect(four, rect(400, 400, 500, 500), 0)).toEqual([]);
  });
});

describe('the function cannot consult a sprite', () => {
  it('takes only simulation state, a rectangle, and an owner', () => {
    // Structural, not behavioural: there is no parameter through which texture
    // dimensions, a Phaser object, or a camera could reach this decision.
    expect(selectInRect.length).toBe(3);
  });
});
