import { describe, expect, it } from 'vitest';

import { ISSUER, type Command } from '../../src/sim/commands';
import { SIM_VERSION } from '../../src/sim/version';
import { ENTITY_STATE, KIND, type SimInit } from '../../src/sim/state';
import { recordReplay, replay, type Replay } from '../../src/sim/replay';

/**
 * T013 (TC-INT-001) — replay round-trip.
 *
 * This is the test the whole of Constitution IV rests on. If a recorded seed plus
 * command log does not reproduce its terminal hash, the corpus records nothing
 * useful and every green build after the first defect fix is meaningless.
 *
 * Note what is deliberately NOT recorded: any state snapshot. A replay is a seed,
 * a difficulty, and a command log — nothing else. If reproducing a run required
 * storing state, the simulation would not be deterministic and the corpus would be
 * papering over it.
 */

const INIT: SimInit = {
  seed: 987654321,
  difficulty: 2,
  players: [{ ore: 120 }, { ore: 120 }],
  nodes: [{ id: 0, x: 640, y: 640, remaining: 1200 }],
  entities: [
    { id: 1, kind: KIND.BASE, owner: 0, x: 192, y: 192, hp: 800, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
    { id: 2, kind: KIND.WORKER, owner: 0, x: 256, y: 256, hp: 40, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
    { id: 3, kind: KIND.BASE, owner: 1, x: 1728, y: 1728, hp: 800, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
    { id: 4, kind: KIND.TROOPER, owner: 1, x: 1664, y: 1664, hp: 60, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
  ],
};

const LOG: readonly Command[] = [
  { tick: 5, issuer: ISSUER.PLAYER, seq: 0, type: 'attack', units: [2], targetId: 4 },
  { tick: 5, issuer: ISSUER.AI, seq: 0, type: 'attack', units: [4], targetId: 2 },
  { tick: 12, issuer: ISSUER.PLAYER, seq: 1, type: 'build', builderId: 1, kind: KIND.TROOPER },
  { tick: 30, issuer: ISSUER.AI, seq: 1, type: 'attack', units: [4], targetId: 1 },
];

const FINAL_TICK = 60;
const CHECKPOINTS = [10, 25, 45] as const;

describe('recordReplay', () => {
  it('captures the seed, the log, and the resulting hashes', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);

    expect(recorded.simVersion).toBe(SIM_VERSION);
    expect(recorded.input.seed).toBe(INIT.seed);
    expect(recorded.input.commands).toEqual(LOG);
    expect(recorded.expected.finalTick).toBe(FINAL_TICK);
    expect(recorded.expected.stateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(recorded.expected.checkpoints.map((c) => c.tick)).toEqual([...CHECKPOINTS]);
  });

  it('records hashes, never evolved state — `expected` carries no simulation state', () => {
    // The Red version of this test asserted the whole file contained no
    // "entities" key. Implementing it showed that conflates two different
    // things: the STARTING scenario is input (and until M2 gives us a map
    // system, it has to be carried inline), whereas a snapshot of state
    // part-way through a run would mean the run was not reproducible from its
    // seed. Only the second is forbidden, so that is what this now asserts.
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    expect(Object.keys(recorded.expected).sort()).toEqual(['checkpoints', 'finalTick', 'stateHash']);
    for (const cp of recorded.expected.checkpoints) {
      expect(Object.keys(cp).sort()).toEqual(['stateHash', 'tick']);
    }
  });
});

describe('replay round-trip', () => {
  it('reproduces the terminal hash from seed + log alone', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const result = replay(recorded);

    expect(result.ok).toBe(true);
    expect(result.terminal.actual).toBe(recorded.expected.stateHash);
    expect(result.firstFailure).toBeNull();
  });

  it('reproduces every checkpoint hash, not only the terminal one', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const result = replay(recorded);
    for (const cp of result.checkpoints) {
      expect(cp.actual).toBe(cp.expected);
    }
  });

  it('survives a JSON round-trip, as a corpus case must', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const onDisk: Replay = JSON.parse(JSON.stringify(recorded));
    expect(replay(onDisk).ok).toBe(true);
  });

  it('is stable across repeated replays of the same case', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const first = replay(recorded);
    const second = replay(recorded);
    expect(second.terminal.actual).toBe(first.terminal.actual);
    expect(second.checkpoints).toEqual(first.checkpoints);
  });
});

describe('replay failure reporting (ADR-002)', () => {
  it('reports the FIRST failing checkpoint, not just the terminal mismatch', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    // Corrupt the middle checkpoint AND the terminal hash. A runner that only
    // compared the terminal state would report tick 60 and leave the reader to
    // search 60 ticks; ADR-002 requires it to name tick 25.
    const corrupted: Replay = {
      ...recorded,
      expected: {
        ...recorded.expected,
        stateHash: '0000000000000000',
        checkpoints: recorded.expected.checkpoints.map((c) =>
          c.tick === 25 ? { ...c, stateHash: 'ffffffffffffffff' } : c,
        ),
      },
    };

    const result = replay(corrupted);
    expect(result.ok).toBe(false);
    expect(result.firstFailure?.tick).toBe(25);
  });

  it('names the terminal tick when only the terminal hash diverges', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const corrupted: Replay = {
      ...recorded,
      expected: { ...recorded.expected, stateHash: '0000000000000000' },
    };
    const result = replay(corrupted);
    expect(result.ok).toBe(false);
    expect(result.firstFailure?.tick).toBe(FINAL_TICK);
  });

  it('flags a stale case rather than silently passing or re-recording', () => {
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const stale: Replay = { ...recorded, simVersion: SIM_VERSION - 1 };
    const result = replay(stale);
    expect(result.ok).toBe(false);
    expect(result.stale).toBe(true);
    expect(result.message).toMatch(/stale/i);
  });

  it('does not treat a case from a FUTURE simVersion as merely stale', () => {
    // A case recorded on a newer simVersion means the checkout is behind, which
    // is a different problem with a different fix. Conflating the two would send
    // someone to regenerate a corpus that is more current than their code.
    const recorded = recordReplay(INIT, LOG, FINAL_TICK, CHECKPOINTS);
    const future: Replay = { ...recorded, simVersion: SIM_VERSION + 1 };
    const result = replay(future);
    expect(result.ok).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.message).toMatch(/newer|future|ahead/i);
  });
});
