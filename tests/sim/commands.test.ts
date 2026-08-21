import { describe, expect, it } from 'vitest';

import {
  ISSUER,
  createCommandQueue,
  drainCommands,
  enqueueCommand,
  sortCommands,
  type Command,
} from '../../src/sim/commands';

/**
 * T010 — O-4, command application order within a tick.
 *
 * The hazard: the player clicks and the AI decides on the same tick T. Whichever
 * command object happens to reach the queue first would otherwise be applied
 * first, and "which arrived first" is a property of wall-clock timing, input
 * latency, and event-loop scheduling — none of which are reproducible.
 *
 * The rule: sort by `(issuer, seq)` before applying, with `issuer` a fixed enum
 * where player < ai, and `seq` a per-issuer monotonic counter. Arrival order must
 * make no difference whatsoever, which is what these tests assert directly by
 * feeding the same commands in deliberately hostile orders.
 */

function move(issuer: number, seq: number, tick: number, unit: number): Command {
  return { tick, issuer, seq, type: 'move', units: [unit], x: 0, y: 0 };
}

const shuffles: ReadonlyArray<readonly number[]> = [
  [0, 1, 2, 3],
  [3, 2, 1, 0],
  [2, 0, 3, 1],
  [1, 3, 0, 2],
];

describe('sortCommands (O-4)', () => {
  it('puts player before ai regardless of arrival order', () => {
    const ai = move(ISSUER.AI, 0, 10, 99);
    const player = move(ISSUER.PLAYER, 0, 10, 1);
    expect(sortCommands([ai, player]).map((c) => c.issuer)).toEqual([ISSUER.PLAYER, ISSUER.AI]);
    expect(sortCommands([player, ai]).map((c) => c.issuer)).toEqual([ISSUER.PLAYER, ISSUER.AI]);
  });

  it('orders by seq within a single issuer', () => {
    const cmds = [move(ISSUER.PLAYER, 2, 10, 3), move(ISSUER.PLAYER, 0, 10, 1), move(ISSUER.PLAYER, 1, 10, 2)];
    expect(sortCommands(cmds).map((c) => c.seq)).toEqual([0, 1, 2]);
  });

  it('produces one canonical order from every arrival permutation', () => {
    const cmds = [
      move(ISSUER.PLAYER, 0, 10, 1),
      move(ISSUER.PLAYER, 1, 10, 2),
      move(ISSUER.AI, 0, 10, 3),
      move(ISSUER.AI, 1, 10, 4),
    ];
    const expected = [
      [ISSUER.PLAYER, 0],
      [ISSUER.PLAYER, 1],
      [ISSUER.AI, 0],
      [ISSUER.AI, 1],
    ];
    for (const order of shuffles) {
      const arrived = order.map((i) => cmds[i]!);
      expect(sortCommands(arrived).map((c) => [c.issuer, c.seq])).toEqual(expected);
    }
  });

  it('is a pure function — it does not reorder the caller\'s array', () => {
    const arrived = [move(ISSUER.AI, 0, 10, 9), move(ISSUER.PLAYER, 0, 10, 1)];
    const snapshot = [...arrived];
    sortCommands(arrived);
    expect(arrived).toEqual(snapshot);
  });

  it('is stable and total — no two distinct commands compare equal', () => {
    // A comparator returning 0 for distinct commands would leave their relative
    // order to the engine's sort implementation, which is exactly the class of
    // bug O-4 exists to close.
    const cmds = [
      move(ISSUER.PLAYER, 0, 10, 1),
      move(ISSUER.PLAYER, 1, 10, 2),
      move(ISSUER.AI, 0, 10, 3),
    ];
    const keys = sortCommands(cmds).map((c) => `${c.issuer}:${c.seq}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('command queue drain', () => {
  it('returns only the commands scheduled for the requested tick', () => {
    let queue = createCommandQueue();
    queue = enqueueCommand(queue, move(ISSUER.PLAYER, 0, 10, 1));
    queue = enqueueCommand(queue, move(ISSUER.PLAYER, 1, 11, 2));
    queue = enqueueCommand(queue, move(ISSUER.AI, 0, 10, 3));

    const [drained] = drainCommands(queue, 10);
    expect(drained.map((c) => c.tick)).toEqual([10, 10]);
  });

  it('drains in (issuer, seq) order however the commands arrived', () => {
    for (const order of shuffles) {
      const cmds = [
        move(ISSUER.AI, 1, 7, 4),
        move(ISSUER.PLAYER, 1, 7, 2),
        move(ISSUER.AI, 0, 7, 3),
        move(ISSUER.PLAYER, 0, 7, 1),
      ];
      let queue = createCommandQueue();
      for (const i of order) {
        queue = enqueueCommand(queue, cmds[i]!);
      }
      const [drained] = drainCommands(queue, 7);
      expect(drained.map((c) => [c.issuer, c.seq])).toEqual([
        [ISSUER.PLAYER, 0],
        [ISSUER.PLAYER, 1],
        [ISSUER.AI, 0],
        [ISSUER.AI, 1],
      ]);
    }
  });

  it('removes drained commands but leaves future ones queued', () => {
    let queue = createCommandQueue();
    queue = enqueueCommand(queue, move(ISSUER.PLAYER, 0, 10, 1));
    queue = enqueueCommand(queue, move(ISSUER.PLAYER, 1, 20, 2));

    const [atTen, afterTen] = drainCommands(queue, 10);
    expect(atTen).toHaveLength(1);

    const [atTwenty] = drainCommands(afterTen, 20);
    expect(atTwenty.map((c) => c.tick)).toEqual([20]);

    const [again] = drainCommands(afterTen, 10);
    expect(again).toEqual([]);
  });

  it('does not mutate the queue it was given', () => {
    let queue = createCommandQueue();
    queue = enqueueCommand(queue, move(ISSUER.PLAYER, 0, 10, 1));
    const [first] = drainCommands(queue, 10);
    const [second] = drainCommands(queue, 10);
    expect(second).toEqual(first);
  });

  it('returns an empty list for a tick with nothing scheduled', () => {
    const [drained] = drainCommands(createCommandQueue(), 42);
    expect(drained).toEqual([]);
  });
});

describe('issuer enum', () => {
  it('orders player strictly before ai, as the sort depends on', () => {
    expect(ISSUER.PLAYER).toBeLessThan(ISSUER.AI);
  });
});
