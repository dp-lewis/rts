/**
 * The fixed-timestep accumulator — presentation layer, T048.
 *
 * This is the single place where wall-clock time is allowed to influence the
 * simulation, and it influences it in exactly one way: by deciding HOW MANY whole
 * ticks to run. `delta` is consumed here and never travels any further. The return
 * type is the structural defence — it carries a tick COUNT, a leftover, an
 * interpolation fraction, and a discard total, and no field a caller could mistake
 * for "how much time to simulate" (RF-3).
 *
 * The function is pure and takes the accumulator as an argument rather than
 * holding it in module state, so the frame-rate-independence property is directly
 * testable without a Phaser scene.
 */

import { MS_PER_TICK } from '../sim/constants';

/**
 * Spiral-of-death guard: the most whole ticks one frame may run. Under load the
 * simulation falls behind wall-clock time, which is correct — it does not change
 * results, only when they are drawn.
 */
export const MAX_STEPS_PER_FRAME = 5;

/**
 * pre-impl F-4: browsers suspend rAF in background tabs, so a player returning
 * after five minutes would otherwise watch the match they already lost play out
 * at high speed with no way to intervene. The excess is DROPPED, not deferred:
 * in single-player, wall-clock time carries no meaning and the simulation is
 * authoritative.
 */
export const MAX_ACCUMULATOR_MS = 250;

/**
 * Floating-point slack on the tick-boundary comparison.
 *
 * `delta` arrives as a float and 1000/144 has no exact binary representation, so
 * 288 frames of a 144 Hz monitor sum to 1999.9999999999998 ms rather than 2000 —
 * one ulp short of the 40th tick. Without this tolerance a 144 Hz display runs
 * 39 ticks where a 30 Hz display runs 40 over the same wall time, which is the
 * precise property this whole design exists to rule out.
 *
 * Sized from the drift, not guessed: the accumulator is bounded at
 * MAX_ACCUMULATOR_MS, so each addition contributes at most ulp(250) ~ 5.7e-14 ms,
 * and even 10 minutes of 144 Hz frames accumulates under 1e-8 ms. A nanosecond of
 * slack covers that with six orders of magnitude to spare while sitting 2e-8 of a
 * tick below the boundary — far too small for any real quantity to reach it.
 */
const TICK_BOUNDARY_EPSILON = 1e-6;

export interface AccumulatorResult {
  /** Whole ticks to run this frame. Never fractional, never a duration. */
  readonly steps: number;
  /** Leftover milliseconds to carry into the next frame. */
  readonly accumulator: number;
  /** Interpolation fraction in [0, 1). Presentation only — never reaches `step()`. */
  readonly alpha: number;
  /** Wall time discarded by the F-4 clamp. Zero on an ordinary frame. */
  readonly dropped: number;
}

/**
 * Fold one frame's `delta` into the accumulator and report how many whole ticks
 * are now due.
 *
 * @param accumulator leftover milliseconds from the previous frame
 * @param delta wall-clock milliseconds since the previous frame, from Phaser
 */
export function advanceAccumulator(accumulator: number, delta: number): AccumulatorResult {
  let remaining = accumulator + delta;

  let dropped = 0;
  if (remaining > MAX_ACCUMULATOR_MS) {
    dropped = remaining - MAX_ACCUMULATOR_MS;
    remaining = MAX_ACCUMULATOR_MS;
  }

  let steps = 0;
  while (remaining >= MS_PER_TICK - TICK_BOUNDARY_EPSILON && steps < MAX_STEPS_PER_FRAME) {
    // `Math.max` because a tick consumed on the epsilon's credit leaves a
    // negative remainder, and a negative accumulator would make alpha negative.
    remaining = Math.max(0, remaining - MS_PER_TICK);
    steps += 1;
  }

  return {
    steps,
    accumulator: remaining,
    alpha: remaining / MS_PER_TICK,
    dropped,
  };
}
