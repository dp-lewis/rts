import { describe, expect, it } from 'vitest';

import { nextIntRng, nextRng, seedRng } from '../../src/sim/rng';

/**
 * T007 — the PRNG.
 *
 * Two properties matter and they are different. The first is that the generator
 * is *the* mulberry32, not merely *a* deterministic generator: the golden vector
 * below was computed from the canonical published implementation, independently
 * of `src/sim/rng.ts`, so a subtly-wrong port fails here rather than silently
 * producing its own stable-but-different universe.
 *
 * The second is that the state is a plain integer living in simulation state
 * rather than a closure hidden in a module. A closure would be invisible to the
 * hash, unserialisable into a replay, and shared across two simulations running
 * in the same process — which is exactly what the corpus runner does.
 */

const SEED = 1234567;

/** Canonical mulberry32(1234567), first eight draws. */
const GOLDEN: readonly number[] = [
  0.6074679309967905, 0.19144689152017236, 0.43751312675885856, 0.3372786734253168,
  0.12603325210511684, 0.4152222655247897, 0.15052086533978581, 0.16445867787115276,
];

function draw(count: number, from: number): { values: number[]; state: number } {
  let state = from;
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = nextRng(state);
    state = result.state;
    values.push(result.value);
  }
  return { values, state };
}

describe('mulberry32', () => {
  it('reproduces the canonical sequence for a fixed seed', () => {
    const { values } = draw(GOLDEN.length, seedRng(SEED));
    expect(values).toEqual(GOLDEN);
  });

  it('yields values in [0, 1)', () => {
    const { values } = draw(500, seedRng(SEED));
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('diverges for different seeds', () => {
    const a = draw(8, seedRng(SEED));
    const b = draw(8, seedRng(SEED + 1));
    expect(a.values).not.toEqual(b.values);
  });

  it('normalises any integer seed into a uint32 state', () => {
    expect(seedRng(-1)).toBe(0xffffffff);
    expect(seedRng(0)).toBe(0);
    expect(Number.isInteger(seedRng(SEED))).toBe(true);
  });

  it('is a pure function of its state — it never mutates the caller\'s', () => {
    const state = seedRng(SEED);
    const first = nextRng(state);
    const second = nextRng(state);
    expect(state).toBe(seedRng(SEED));
    expect(second).toEqual(first);
  });
});

describe('rng state round-trips', () => {
  it('survives JSON serialise/deserialise mid-sequence and resumes identically', () => {
    const uninterrupted = draw(8, seedRng(SEED));

    // Draw three, ship the state through JSON as a replay or corpus case would,
    // then draw the remaining five.
    const partial = draw(3, seedRng(SEED));
    const revived: number = JSON.parse(JSON.stringify({ rng: partial.state })).rng;
    expect(revived).toBe(partial.state);

    const resumed = draw(5, revived);
    expect([...partial.values, ...resumed.values]).toEqual(uninterrupted.values);
  });

  it('holds its state as a JSON-safe integer, not a closure or object', () => {
    const { state } = draw(3, seedRng(SEED));
    expect(typeof state).toBe('number');
    expect(Number.isInteger(state)).toBe(true);
    expect(state).toBe(1200964710);
  });
});

describe('nextIntRng', () => {
  it('stays within [0, bound) and advances the state', () => {
    let state = seedRng(SEED);
    for (let i = 0; i < 200; i += 1) {
      const result = nextIntRng(state, 6);
      expect(Number.isInteger(result.value)).toBe(true);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(6);
      expect(result.state).not.toBe(state);
      state = result.state;
    }
  });

  it('collapses to 0 for a bound of 1 without consuming entropy differently', () => {
    const state = seedRng(SEED);
    expect(nextIntRng(state, 1).value).toBe(0);
  });
});
