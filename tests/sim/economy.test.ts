import { describe, expect, it } from 'vitest';

import { WORKER_CARRY_CAPACITY } from '../../src/sim/constants';
import { chooseOreNode } from '../../src/sim/economy';
import { step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, createInitialState, type SimState } from '../../src/sim/state';

/**
 * T027 (O-3 / TC-UNIT-003), T029 (FR-006), T030 (FR-016 / TC-UNIT-007).
 *
 * The gather loop is where "pick the nearest thing" appears for the first time,
 * and "nearest" is the phrase that produces determinism bugs. Two nodes at equal
 * distance are not a rare edge case on a symmetric map — the map is deliberately
 * mirrored, so equidistant pairs are the normal configuration, not the exception.
 *
 * The rule (FR-027): least SQUARED Euclidean distance, ties by lowest node id.
 * Squared, so no sqrt in a hot loop and no rounding to argue about.
 */

function withWorker(nodes: SimState['nodes'], workerX: number, workerY: number): SimState {
  return createInitialState({
    seed: 7,
    difficulty: 1,
    nodes,
    entities: [
      { id: 1, kind: KIND.BASE, owner: 0, x: 128, y: 128 },
      { id: 2, kind: KIND.WORKER, owner: 0, x: workerX, y: workerY },
    ],
  });
}

describe('O-3 — ore node selection', () => {
  it('picks the strictly nearest node', () => {
    const state = withWorker(
      [
        { id: 0, x: 900, y: 900, remaining: 500 },
        { id: 1, x: 200, y: 200, remaining: 500 },
      ],
      190,
      190,
    );
    expect(chooseOreNode(state, state.entities[1]!)).toBe(1);
  });

  it('breaks an exact tie by the LOWER node id', () => {
    // Worker at (500,500); nodes at (300,500) and (700,500) are exactly equidistant.
    const state = withWorker(
      [
        { id: 3, x: 300, y: 500, remaining: 500 },
        { id: 4, x: 700, y: 500, remaining: 500 },
      ],
      500,
      500,
    );
    expect(chooseOreNode(state, state.entities[1]!)).toBe(3);
  });

  it('breaks the tie the same way whichever order the nodes were declared in', () => {
    const lowFirst = withWorker(
      [
        { id: 3, x: 300, y: 500, remaining: 500 },
        { id: 4, x: 700, y: 500, remaining: 500 },
      ],
      500,
      500,
    );
    const highFirst = withWorker(
      [
        { id: 4, x: 700, y: 500, remaining: 500 },
        { id: 3, x: 300, y: 500, remaining: 500 },
      ],
      500,
      500,
    );
    expect(chooseOreNode(highFirst, highFirst.entities[1]!)).toBe(
      chooseOreNode(lowFirst, lowFirst.entities[1]!),
    );
  });

  it('ignores exhausted nodes even when they are nearest', () => {
    const state = withWorker(
      [
        { id: 0, x: 510, y: 500, remaining: 0 },
        { id: 1, x: 900, y: 500, remaining: 500 },
      ],
      500,
      500,
    );
    expect(chooseOreNode(state, state.entities[1]!)).toBe(1);
  });

  it('returns -1 when every node is exhausted', () => {
    const state = withWorker(
      [
        { id: 0, x: 510, y: 500, remaining: 0 },
        { id: 1, x: 900, y: 500, remaining: 0 },
      ],
      500,
      500,
    );
    expect(chooseOreNode(state, state.entities[1]!)).toBe(-1);
  });

  it('uses squared distance, so a diagonal node loses to a nearer axis-aligned one', () => {
    // (400,400) is 141.4 away diagonally; (500,380) is 120 away straight up.
    const state = withWorker(
      [
        { id: 0, x: 400, y: 400, remaining: 500 },
        { id: 1, x: 500, y: 380, remaining: 500 },
      ],
      500,
      500,
    );
    expect(chooseOreNode(state, state.entities[1]!)).toBe(1);
  });
});

describe('FR-006 — workers gather from tick 0 with no player input', () => {
  function match(): SimState {
    return createInitialState({
      seed: 11,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 320, y: 128, remaining: 1000 }],
      entities: [
        { id: 1, kind: KIND.BASE, owner: 0, x: 128, y: 128 },
        { id: 2, kind: KIND.WORKER, owner: 0, x: 160, y: 128 },
      ],
    });
  }

  function run(ticks: number): SimState {
    let state = match();
    for (let t = 0; t < ticks; t += 1) {
      state = step(state, []);
    }
    return state;
  }

  it('sends an idle worker toward a node without any command', () => {
    const state = run(1);
    const worker = state.entities.find((e) => e.id === 2)!;
    expect(worker.state).not.toBe(ENTITY_STATE.IDLE);
    expect(worker.targetId).toBe(0);
  });

  it('raises the player\'s ore within a reasonable number of ticks', () => {
    const state = run(600);
    expect(state.players[0].ore).toBeGreaterThan(0);
  });

  it('depletes the node by exactly what the player banked', () => {
    // Conservation. Ore that vanishes between node and Base is a bug that would
    // otherwise only show up as a balance problem in M8.
    const state = run(600);
    const mined = 1000 - state.nodes[0]!.remaining;
    const banked = state.players[0].ore;
    const carried = state.entities.find((e) => e.id === 2)!.progress;
    expect(mined).toBe(banked + carried);
  });

  it('never lets a worker carry more than its capacity', () => {
    let state = match();
    for (let t = 0; t < 600; t += 1) {
      state = step(state, []);
      const worker = state.entities.find((e) => e.id === 2)!;
      expect(worker.progress).toBeLessThanOrEqual(WORKER_CARRY_CAPACITY);
    }
  });
});

describe('FR-016 / TC-UNIT-007 — depletion and retargeting', () => {
  it('drives a node to exactly zero and never below', () => {
    let state = createInitialState({
      seed: 3,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 224, y: 128, remaining: 25 }],
      entities: [
        { id: 1, kind: KIND.BASE, owner: 0, x: 128, y: 128 },
        { id: 2, kind: KIND.WORKER, owner: 0, x: 160, y: 128 },
      ],
    });
    for (let t = 0; t < 1200; t += 1) {
      state = step(state, []);
      expect(state.nodes[0]!.remaining).toBeGreaterThanOrEqual(0);
    }
    expect(state.nodes[0]!.remaining).toBe(0);
  });

  it('retargets a worker whose node is exhausted en route, deterministically', () => {
    const build = (): SimState =>
      createInitialState({
        seed: 5,
        difficulty: 1,
        players: [{ ore: 0 }, { ore: 0 }],
        nodes: [
          { id: 0, x: 1200, y: 128, remaining: 1 },
          { id: 1, x: 1216, y: 128, remaining: 900 },
        ],
        entities: [
          { id: 1, kind: KIND.BASE, owner: 0, x: 128, y: 128 },
          { id: 2, kind: KIND.WORKER, owner: 0, x: 160, y: 128 },
        ],
      });

    let a = build();
    let b = build();
    for (let t = 0; t < 500; t += 1) {
      a = step(a, []);
      b = step(b, []);
    }
    expect(b.entities.find((e) => e.id === 2)!.targetId).toBe(
      a.entities.find((e) => e.id === 2)!.targetId,
    );
  });

  it('idles workers at rest once every node is exhausted, without repath thrashing', () => {
    let state = createInitialState({
      seed: 9,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 224, y: 128, remaining: 4 }],
      entities: [
        { id: 1, kind: KIND.BASE, owner: 0, x: 128, y: 128 },
        { id: 2, kind: KIND.WORKER, owner: 0, x: 160, y: 128 },
      ],
    });
    for (let t = 0; t < 900; t += 1) {
      state = step(state, []);
    }

    const settled = state.entities.find((e) => e.id === 2)!;
    expect(state.nodes[0]!.remaining).toBe(0);
    expect(settled.state).toBe(ENTITY_STATE.IDLE);
    expect(settled.targetId).toBe(-1);
    expect(settled.destX).toBe(-1);
    expect(settled.destY).toBe(-1);

    // Thrashing check: with nothing left to do, the state must be a genuine
    // fixed point. A worker that re-picks a target and gives up every tick would
    // keep changing position or destination, and would burn CPU forever.
    const before = { ...settled };
    for (let t = 0; t < 60; t += 1) {
      state = step(state, []);
    }
    const after = state.entities.find((e) => e.id === 2)!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.destX).toBe(-1);
    expect(after.targetId).toBe(-1);
    expect(after.state).toBe(ENTITY_STATE.IDLE);
  });
});
