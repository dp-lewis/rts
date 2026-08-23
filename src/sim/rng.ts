/**
 * mulberry32, vendored (Constitution V: no dependency for twenty lines).
 *
 * The state is a plain uint32 that the caller threads through, and it lives in
 * `SimState`. That is the whole point: a closure-based generator would be
 * invisible to the state hash, impossible to serialise into a replay, and shared
 * between two simulations running in one process — which is exactly what the
 * corpus runner does when it replays a hundred cases.
 *
 * Every function here is pure. `nextRng(s)` called twice with the same `s`
 * returns the same result, always.
 */

export interface RngResult {
  /** The generator state to thread into the next call. */
  state: number;
  /** A double in [0, 1). */
  value: number;
}

/** Normalise any integer seed into a uint32 generator state. */
export function seedRng(seed: number): number {
  return seed >>> 0;
}

export function nextRng(state: number): RngResult {
  // `| 0` keeps the arithmetic in int32 exactly as the reference implementation
  // does; the low 32 bits are identical whether `state` arrives signed or
  // unsigned, so returning an unsigned state is safe to feed straight back in.
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: a >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** A uniform integer in [0, boundExclusive). */
export function nextIntRng(state: number, boundExclusive: number): RngResult {
  const next = nextRng(state);
  return { state: next.state, value: Math.floor(next.value * boundExclusive) };
}
