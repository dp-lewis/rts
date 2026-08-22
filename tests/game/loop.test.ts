import { describe, expect, it } from 'vitest';

import { MS_PER_TICK, TICK_HZ } from '../../src/sim/constants';
import { MAX_ACCUMULATOR_MS, MAX_STEPS_PER_FRAME, advanceAccumulator } from '../../src/game/loop';

/**
 * T048 — the accumulator, and the one place `delta` could destroy determinism.
 *
 * Every Phaser tutorial multiplies movement by the frame delta. Doing that here
 * would make the simulation a function of frame rate: the same seed and the same
 * command log would produce different matches on a 60 Hz and a 144 Hz monitor, and
 * every recorded corpus hash would be worthless. RF-3 in the research flagged this
 * as the most likely way determinism gets lost by habit rather than by decision.
 *
 * The structural defence is that this function returns a COUNT OF WHOLE TICKS. It
 * has no way to hand a delta to `step()`, because it never touches `step()` and
 * returns no duration — the type system makes the mistake unrepresentable rather
 * than merely discouraged.
 */

describe('advanceAccumulator — whole ticks only', () => {
  it('runs no tick until a full tick has accumulated', () => {
    const result = advanceAccumulator(0, MS_PER_TICK - 1);
    expect(result.steps).toBe(0);
    expect(result.accumulator).toBeCloseTo(MS_PER_TICK - 1);
  });

  it('runs exactly one tick when exactly one has accumulated', () => {
    expect(advanceAccumulator(0, MS_PER_TICK).steps).toBe(1);
  });

  it('carries the remainder rather than rounding it away', () => {
    const remainder = 7;
    const result = advanceAccumulator(0, MS_PER_TICK * 3 + remainder);
    expect(result.steps).toBe(3);
    expect(result.accumulator).toBeCloseTo(remainder);
  });

  it('never returns a fractional step count', () => {
    for (let delta = 0; delta < 200; delta += 3.7) {
      const { steps } = advanceAccumulator(0, delta);
      expect(Number.isInteger(steps)).toBe(true);
    }
  });

  it('accumulates across frames that are each too short on their own', () => {
    // Three 20ms frames at 20Hz (50ms/tick) must produce exactly one tick, not
    // zero and not three.
    let accumulator = 0;
    let total = 0;
    for (let frame = 0; frame < 3; frame += 1) {
      const result = advanceAccumulator(accumulator, 20);
      accumulator = result.accumulator;
      total += result.steps;
    }
    expect(total).toBe(1);
  });

  it('averages out to the tick rate over a second of 60Hz frames', () => {
    let accumulator = 0;
    let total = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      const result = advanceAccumulator(accumulator, 1000 / 60);
      accumulator = result.accumulator;
      total += result.steps;
    }
    expect(total).toBe(TICK_HZ);
  });

  it('produces the same tick count at 144Hz as at 30Hz over the same wall time', () => {
    // The property the whole design exists for: the simulation advances with
    // TIME, never with frames.
    const ticksAt = (fps: number): number => {
      let accumulator = 0;
      let total = 0;
      for (let frame = 0; frame < fps * 2; frame += 1) {
        const result = advanceAccumulator(accumulator, 1000 / fps);
        accumulator = result.accumulator;
        total += result.steps;
      }
      return total;
    };
    expect(ticksAt(144)).toBe(ticksAt(30));
    expect(ticksAt(144)).toBe(TICK_HZ * 2);
  });
});

describe('interpolation alpha', () => {
  it('is the fraction of a tick left over, in [0, 1)', () => {
    for (let delta = 0; delta < 300; delta += 2.3) {
      const { alpha } = advanceAccumulator(0, delta);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('is zero on an exact tick boundary', () => {
    expect(advanceAccumulator(0, MS_PER_TICK * 2).alpha).toBe(0);
  });

  it('is half way through a tick at half a tick of leftover', () => {
    expect(advanceAccumulator(0, MS_PER_TICK * 1.5).alpha).toBeCloseTo(0.5);
  });
});

describe('spiral-of-death guard', () => {
  it('never runs more than MAX_STEPS_PER_FRAME ticks in one frame', () => {
    const { steps } = advanceAccumulator(0, MS_PER_TICK * 1000);
    expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
  });

  it('does not let unrun time pile up into the next frame', () => {
    // The spiral: if a frame that ran out of budget carried its debt forward, the
    // next frame would owe even more, and the game would grind slower and slower
    // while never catching up.
    const first = advanceAccumulator(0, MS_PER_TICK * 1000);
    const second = advanceAccumulator(first.accumulator, MS_PER_TICK);
    expect(second.steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    expect(first.accumulator).toBeLessThan(MAX_ACCUMULATOR_MS + MS_PER_TICK);
  });
});

describe('pre-impl F-4 — a backgrounded tab must not fast-forward the match', () => {
  it('clamps a huge delta and DROPS the excess', () => {
    // A tab left in the background for thirty seconds returns with a 30,000ms
    // delta. Simulating all of it would make the player watch the match they just
    // lost play out at high speed, with no way to intervene. The lost time is
    // discarded, not deferred.
    const result = advanceAccumulator(0, 30_000);
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
  });

  it('reports how much wall time was discarded', () => {
    const result = advanceAccumulator(0, 30_000);
    expect(result.dropped).toBeCloseTo(30_000 - MAX_ACCUMULATOR_MS);
  });

  it('drops nothing on an ordinary frame', () => {
    expect(advanceAccumulator(0, 16.7).dropped).toBe(0);
    expect(advanceAccumulator(0, 100).dropped).toBe(0);
  });

  it('clamps at roughly a quarter second, per pre-impl F-4', () => {
    expect(MAX_ACCUMULATOR_MS).toBeGreaterThanOrEqual(200);
    expect(MAX_ACCUMULATOR_MS).toBeLessThanOrEqual(300);
  });

  it('resumes normally on the frame after a long stall', () => {
    const stalled = advanceAccumulator(0, 30_000);
    const next = advanceAccumulator(stalled.accumulator, 16.7);
    expect(next.dropped).toBe(0);
    expect(next.steps).toBeLessThanOrEqual(1);
  });
});

describe('the function cannot leak a delta into the simulation', () => {
  it('returns only a whole-tick count, an accumulator, an alpha, and a drop total', () => {
    // Structural, not behavioural. There is no field here a caller could mistake
    // for "how much time to simulate", which is what makes the RF-3 habit
    // unrepresentable rather than merely discouraged.
    expect(Object.keys(advanceAccumulator(0, 16.7)).sort()).toEqual([
      'accumulator',
      'alpha',
      'dropped',
      'steps',
    ]);
  });
});

describe('the clamp and the step guard are coupled', () => {
  it('cannot leave a whole unrun tick in the accumulator, which would push alpha past 1', () => {
    // alpha < 1 holds today only because MAX_ACCUMULATOR_MS is exactly
    // MAX_STEPS_PER_FRAME ticks, so a clamped frame is always fully consumable.
    // Raising the clamp without raising the step guard would leave >= one whole
    // tick unrun, alpha would reach 1, and the renderer would extrapolate past a
    // state the simulation has not produced. No behavioural test can see this —
    // it is an invariant between two constants, so it is asserted as one.
    expect(MAX_ACCUMULATOR_MS).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME * MS_PER_TICK);
  });
});
