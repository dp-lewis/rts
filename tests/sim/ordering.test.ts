import { describe, expect, it } from 'vitest';

import { hashState } from '../../src/sim/hash';
import { step } from '../../src/sim/step';
import { KIND, createInitialState, type EntitySeed, type SimState } from '../../src/sim/state';

/**
 * T028 — O-7, the general case.
 *
 * O-1 through O-6 are all instances of one root problem: something in the tick
 * iterates a collection whose order is not part of any contract. The structural
 * fix is that entities live in an array kept sorted by id and every traversal is
 * index order — which means the property to test is not "does traversal happen in
 * id order" (an implementation detail) but "does the ORDER I HAND YOU ENTITIES IN
 * change the outcome". It must not, ever.
 *
 * This is the test that will catch the eighth ordering hazard when it appears —
 * and plan.md predicted more would appear, having already been right once.
 */

const SEEDS: readonly EntitySeed[] = [
  { id: 1, kind: KIND.BASE, owner: 0, x: 128, y: 128 },
  { id: 2, kind: KIND.WORKER, owner: 0, x: 192, y: 192 },
  { id: 3, kind: KIND.WORKER, owner: 0, x: 192, y: 256 },
  { id: 4, kind: KIND.BASE, owner: 1, x: 1088, y: 576 },
  { id: 5, kind: KIND.WORKER, owner: 1, x: 1024, y: 576 },
  { id: 6, kind: KIND.TROOPER, owner: 1, x: 960, y: 512 },
];

const NODES = [
  { id: 0, x: 448, y: 320, remaining: 600 },
  { id: 1, x: 832, y: 320, remaining: 600 },
];

function build(order: readonly number[]): SimState {
  return createInitialState({
    seed: 4242,
    difficulty: 1,
    players: [{ ore: 0 }, { ore: 0 }],
    nodes: NODES,
    entities: order.map((i) => SEEDS[i]!),
  });
}

function run(state: SimState, ticks: number): SimState {
  let s = state;
  for (let t = 0; t < ticks; t += 1) {
    s = step(s, []);
  }
  return s;
}

const PERMUTATIONS: ReadonlyArray<readonly number[]> = [
  [0, 1, 2, 3, 4, 5],
  [5, 4, 3, 2, 1, 0],
  [2, 0, 4, 1, 5, 3],
  [3, 5, 1, 4, 0, 2],
  [1, 2, 0, 5, 3, 4],
];

describe('O-7 — entity declaration order cannot affect the simulation', () => {
  it('sorts entities by id at construction whatever order they arrive in', () => {
    for (const order of PERMUTATIONS) {
      expect(build(order).entities.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('produces an identical initial hash from every permutation', () => {
    const canonical = hashState(build(PERMUTATIONS[0]!));
    for (const order of PERMUTATIONS) {
      expect(hashState(build(order))).toBe(canonical);
    }
  });

  it('produces an identical hash after 300 ticks from every permutation', () => {
    // The real assertion. Construction-time sorting is easy; what this catches is
    // a system that iterates some OTHER collection — a node list, a per-owner
    // bucket, a Map built during the tick — in an order that happens to follow
    // however the entities were declared.
    const canonical = hashState(run(build(PERMUTATIONS[0]!), 300));
    for (const order of PERMUTATIONS) {
      expect(hashState(run(build(order), 300))).toBe(canonical);
    }
  });

  it('keeps entities id-sorted at every single tick', () => {
    let state = build(PERMUTATIONS[2]!);
    for (let t = 0; t < 300; t += 1) {
      state = step(state, []);
      const ids = state.entities.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    }
  });

  it('is unaffected by the order ore nodes were declared in', () => {
    const forward = createInitialState({
      seed: 4242,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: NODES,
      entities: SEEDS,
    });
    const reversed = createInitialState({
      seed: 4242,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [...NODES].reverse(),
      entities: SEEDS,
    });
    expect(hashState(run(reversed, 300))).toBe(hashState(run(forward, 300)));
  });
});
