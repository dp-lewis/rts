import { describe, expect, it } from 'vitest';

import { jitterFor } from '../../src/game/render/jitter';
import { TILE_PX } from '../../src/sim/constants';

/**
 * T082 — the render-only offset that keeps co-located units countable.
 *
 * The first implementation scattered ids into a random box and LOOKED fine on a
 * single unit. The T081 spike caught an enemy sitting inside a friendly's
 * ownership ring, which inverts the FR-018 cue. Measurement showed the approach
 * was unsound rather than under-tuned: two independent uniform draws can land on
 * top of each other at any magnitude.
 *
 * The separation guarantee is therefore asserted as a NUMBER here, not left to
 * whether a screenshot looked right. A future tweak to the ring size or the
 * offset radius that breaks the relationship fails this file.
 */

/** Must match `RADIUS_X` in ownership.ts — the ring a stray sprite must clear. */
const RING_RADIUS = TILE_PX * 0.26;

const distance = (a: { dx: number; dy: number }, b: { dx: number; dy: number }): number =>
  Math.hypot(a.dx - b.dx, a.dy - b.dy);

describe('jitterFor — deterministic and presentation-only', () => {
  it('gives the same offset for the same id, every call', () => {
    for (const id of [1, 7, 42, 999]) {
      expect(jitterFor(id)).toEqual(jitterFor(id));
    }
  });

  it('depends on nothing but the id', () => {
    // No sim state, no PRNG, no clock. If this function ever needed more than an
    // id, it would have become capable ofinfluencing something it must not touch.
    const before = jitterFor(12);
    void Math.random();
    expect(jitterFor(12)).toEqual(before);
  });

  it('stays inside a tile — a unit is never drawn in a cell it is not in', () => {
    for (let id = 1; id < 500; id += 1) {
      const { dx, dy } = jitterFor(id);
      expect(Math.abs(dx)).toBeLessThan(TILE_PX / 2);
      expect(Math.abs(dy)).toBeLessThan(TILE_PX / 2);
    }
  });
});

describe('the separation guarantee the T081 spike bought', () => {
  it('separates consecutive ids by more than the ownership ring radius', () => {
    // Units stacked in one cell are usually produced back-to-back from the same
    // structure, so consecutive ids are the case that actually occurs — and the
    // case where a shared ring reads as belonging to the wrong owner.
    let worst = Infinity;
    let worstPair: [number, number] = [0, 0];

    for (let id = 1; id < 600; id += 1) {
      const d = distance(jitterFor(id), jitterFor(id + 1));
      if (d < worst) {
        worst = d;
        worstPair = [id, id + 1];
      }
    }

    expect(
      worst,
      `ids ${worstPair[0]} and ${worstPair[1]} are drawn ${worst.toFixed(2)}px apart, ` +
        `inside the ${RING_RADIUS.toFixed(1)}px ownership ring — the ring would read ` +
        `as belonging to whichever sprite draws last`,
    ).toBeGreaterThan(RING_RADIUS);
  });

  it('never places two ids in the same spot, however far apart their ids are', () => {
    const seen = new Map<string, number>();
    for (let id = 1; id < 400; id += 1) {
      const { dx, dy } = jitterFor(id);
      const key = `${dx.toFixed(3)},${dy.toFixed(3)}`;
      expect(seen.has(key), `ids ${seen.get(key)} and ${id} draw at an identical offset`).toBe(
        false,
      );
      seen.set(key, id);
    }
  });
});
