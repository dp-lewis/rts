import { describe, expect, it } from 'vitest';

import { formatDuration } from '../../src/game/scenes/Result';
import { MS_PER_TICK } from '../../src/sim/constants';

/**
 * T068 / FR-019 — the duration shown on the result screen.
 *
 * Derived from the TICK COUNT, which is the simulation's own clock and exact,
 * rather than from wall time — which drifts with frame rate and stops entirely
 * in a backgrounded tab (M6 found `requestAnimationFrame` fully paused there).
 * Two players who ran the same match would otherwise be told different lengths.
 *
 * It is also the number M8's 6–10 minute band is expressed in, so a formatting
 * error here would misreport the product's central claim.
 */

const ticksFor = (minutes: number, seconds = 0): number =>
  ((minutes * 60 + seconds) * 1000) / MS_PER_TICK;

describe('formatDuration', () => {
  it('renders a whole number of minutes', () => {
    expect(formatDuration(ticksFor(7))).toBe('7m 00s');
  });

  it('pads seconds, so 7m 5s never reads as 7m 5s next to 7m 50s', () => {
    expect(formatDuration(ticksFor(7, 5))).toBe('7m 05s');
    expect(formatDuration(ticksFor(7, 50))).toBe('7m 50s');
  });

  it('handles a match under a minute', () => {
    expect(formatDuration(ticksFor(0, 43))).toBe('0m 43s');
  });

  it('handles tick zero without producing NaN or a negative', () => {
    expect(formatDuration(0)).toBe('0m 00s');
  });

  it('rolls 59.6 seconds up into the next minute rather than showing 60', () => {
    // Rounding to the nearest second and then splitting can produce "6m 60s".
    for (let extra = 0; extra < 20; extra += 1) {
      const text = formatDuration(ticksFor(6, 59) + extra);
      expect(text, `ticks ${ticksFor(6, 59) + extra}`).not.toMatch(/\b60s\b/);
    }
  });

  it('reports the M8 band the way the exit criterion states it', () => {
    expect(formatDuration(ticksFor(6, 11))).toBe('6m 11s');
    expect(formatDuration(ticksFor(9, 58))).toBe('9m 58s');
  });
});
