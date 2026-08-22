import { describe, expect, it } from 'vitest';

import {
  createCommandQueue,
  drainCommands,
  enqueueCommand,
  type Command,
} from '../../src/sim/commands';
import { KIND, VERDICT, type SimState } from '../../src/sim/state';
import { createMatch } from '../../src/sim/setup';
import { step } from '../../src/sim/step';

/**
 * The presentation → simulation command seam (T047).
 *
 * `MatchScene.update` is the only place player intent crosses into the
 * simulation, and it is not reachable from a headless test — it needs a Phaser
 * scene. So the seam's LOGIC is reproduced here exactly as the scene runs it,
 * and asserted end to end.
 *
 * This exists because the first version drained for `state.tick + 1` while
 * `applyCommands` only accepts commands whose tick equals `state.tick` and
 * `step` applies commands before advancing. Draining ahead handed `step`
 * commands it was guaranteed to skip AND removed them from the queue — every
 * player order silently discarded, with no error and a perfectly normal-looking
 * match. It is the same defect the M3 code review found ("the command layer
 * never worked"), reappearing one layer up, and nothing in M5 could have caught
 * it because M5 has no input.
 */

const LATENCY_TICKS = 1;

/** Exactly what `MatchScene.update` does per whole tick, minus the drawing. */
function runTick(state: SimState, queue: ReturnType<typeof createCommandQueue>) {
  const [due, rest] = drainCommands(queue, state.tick);
  return { state: step(state, due), queue: rest };
}

describe('player commands scheduled by the scene actually apply', () => {
  it('a build order issued at tick N takes effect, and exactly once', () => {
    let state = createMatch(20260822, 1);
    let queue = createCommandQueue();

    const base = state.entities.find((e) => e.kind === KIND.BASE && e.owner === 0);
    expect(base).toBeDefined();

    const issuedAt = state.tick;
    const command: Command = {
      type: 'build',
      tick: issuedAt + LATENCY_TICKS,
      issuer: 0,
      seq: 0,
      builderId: base!.id,
      kind: KIND.WORKER,
    };
    queue = enqueueCommand(queue, command);

    // Run past the scheduled tick. If the seam drains on the wrong tick, the
    // command is dropped from the queue and the base never starts building.
    for (let i = 0; i < 5; i += 1) {
      ({ state, queue } = runTick(state, queue));
    }

    const after = state.entities.find((e) => e.id === base!.id);
    expect(
      after?.queuedKind,
      'the base never picked up the build order — the command was drained on a ' +
        'tick step() would not apply it on, and silently discarded',
    ).toBe(KIND.WORKER);
  });

  it('leaves the command queued until its tick arrives, not before', () => {
    let state = createMatch(20260822, 1);
    let queue = createCommandQueue();
    const base = state.entities.find((e) => e.kind === KIND.BASE && e.owner === 0)!;

    queue = enqueueCommand(queue, {
      type: 'build',
      tick: 10,
      issuer: 0,
      seq: 0,
      builderId: base.id,
      kind: KIND.TROOPER,
    });

    while (state.tick < 10) {
      ({ state, queue } = runTick(state, queue));
      if (state.tick < 10) {
        expect(queue.pending, `command drained early at tick ${state.tick}`).toHaveLength(1);
      }
    }

    ({ state, queue } = runTick(state, queue));
    expect(queue.pending).toHaveLength(0);
    expect(state.entities.find((e) => e.id === base.id)?.queuedKind).toBe(KIND.TROOPER);
  });

  it('honours the one-tick latency the scene schedules with', () => {
    // FR-004 / Constitution II: intent must land on a FUTURE tick, never the one
    // already being computed. The scene issues at `state.tick + 1`.
    let state = createMatch(20260822, 1);
    let queue = createCommandQueue();
    const base = state.entities.find((e) => e.kind === KIND.BASE && e.owner === 0)!;

    const issuedAt = state.tick;
    queue = enqueueCommand(queue, {
      type: 'build',
      tick: issuedAt + LATENCY_TICKS,
      issuer: 0,
      seq: 0,
      builderId: base.id,
      kind: KIND.SCOUT,
    });

    ({ state, queue } = runTick(state, queue));
    expect(state.entities.find((e) => e.id === base.id)?.queuedKind).toBe(-1);

    ({ state } = runTick(state, queue));
    expect(state.entities.find((e) => e.id === base.id)?.queuedKind).toBe(KIND.SCOUT);
  });
});

describe('the standard opening is a playable, mirrored map', () => {
  // setup.ts had zero coverage. M2-F2 was exactly this defect one milestone
  // earlier: the baseline corpus case described a layout the game could not
  // produce, and three entities plus an ore node sat off the map unnoticed.
  const state = createMatch(1, 1);

  it('puts every entity and node inside the map', () => {
    for (const e of state.entities) {
      expect(e.x, `entity ${e.id} x`).toBeGreaterThan(0);
      expect(e.x, `entity ${e.id} x`).toBeLessThan(1280);
      expect(e.y, `entity ${e.id} y`).toBeGreaterThan(0);
      expect(e.y, `entity ${e.id} y`).toBeLessThan(704);
    }
    for (const n of state.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(1280);
    }
  });

  it('is a true mirror across the map centre, so neither side is favoured', () => {
    const mirror = (x: number): number => 1280 - x;
    for (const left of state.entities.filter((e) => e.owner === 0)) {
      // Match on BOTH axes: the two workers of a side share an x and differ only
      // in y, so an x-only lookup finds whichever is listed first and compares it
      // against the wrong counterpart.
      const match = state.entities.find(
        (e) =>
          e.owner === 1 &&
          e.kind === left.kind &&
          Math.abs(e.x - mirror(left.x)) < 0.001 &&
          Math.abs(e.y - left.y) < 0.001,
      );
      expect(
        match,
        `entity ${left.id} (${left.x},${left.y}) has no mirrored counterpart`,
      ).toBeDefined();
    }
  });

  it('gives both sides a Base, workers, and equal ore', () => {
    for (const owner of [0, 1] as const) {
      expect(state.entities.filter((e) => e.owner === owner && e.kind === KIND.BASE)).toHaveLength(
        1,
      );
      expect(
        state.entities.filter((e) => e.owner === owner && e.kind === KIND.WORKER).length,
      ).toBeGreaterThan(0);
    }
    expect(state.players[0].ore).toBe(state.players[1].ore);
    expect(state.verdict).toBe(VERDICT.NONE);
  });

  it('runs to a live match without a verdict on tick one', () => {
    let s = createMatch(7, 2);
    for (let i = 0; i < 200; i += 1) {
      s = step(s, []);
    }
    expect(s.verdict).toBe(VERDICT.NONE);
    expect(s.tick).toBe(200);
  });
});
