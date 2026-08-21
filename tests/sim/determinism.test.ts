import { describe, expect, it } from 'vitest';

import { ISSUER, type Command } from '../../src/sim/commands';
import { hashState } from '../../src/sim/hash';
import { nextRng } from '../../src/sim/rng';
import { STAGES, step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, createInitialState, type SimState } from '../../src/sim/state';

/**
 * T011 (TC-UNIT-001) and T012 (TC-UNIT-002).
 *
 * Scope, stated plainly: in M1 the tick pipeline is a SKELETON. Stages 3–9
 * (economy, production, movement, combat, victory) are declared and ordered but
 * do nothing, because none of them exist yet. What these tests can honestly prove
 * is that the *harness* is deterministic — command ordering, state mutation, the
 * hash, and serialisation round-trips. They cannot yet prove the simulation is
 * deterministic, because there is barely a simulation. Each milestone from M2
 * onward inherits these tests and makes them mean more.
 *
 * Commands here are `attack`, not `move`. That is deliberate: the data model in
 * plan.md gives an Entity no destination field, so a move order has nowhere to be
 * recorded. Rather than invent a field ahead of the milestone that owns movement,
 * M1 exercises the command types the current model can actually express. See the
 * M1 finding in implementation-log.md.
 */

function scenario(seed = 1234567): SimState {
  return createInitialState({
    seed,
    difficulty: 1,
    players: [{ ore: 100 }, { ore: 100 }],
    nodes: [
      { id: 0, x: 320, y: 320, remaining: 1000 },
      { id: 1, x: 1600, y: 1600, remaining: 1000 },
    ],
    entities: [
      { id: 1, kind: KIND.BASE, owner: 0, x: 192, y: 192, hp: 800, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
      { id: 2, kind: KIND.WORKER, owner: 0, x: 256, y: 256, hp: 40, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
      { id: 3, kind: KIND.BASE, owner: 1, x: 1728, y: 1728, hp: 800, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
      { id: 4, kind: KIND.TROOPER, owner: 1, x: 1664, y: 1664, hp: 60, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
    ],
  });
}

const LOG: readonly Command[] = [
  { tick: 3, issuer: ISSUER.PLAYER, seq: 0, type: 'attack', units: [2], targetId: 4 },
  { tick: 3, issuer: ISSUER.AI, seq: 0, type: 'attack', units: [4], targetId: 2 },
  { tick: 7, issuer: ISSUER.PLAYER, seq: 1, type: 'build', builderId: 1, kind: KIND.WORKER },
  { tick: 11, issuer: ISSUER.AI, seq: 1, type: 'attack', units: [4], targetId: 1 },
];

function run(from: SimState, log: readonly Command[], ticks: number): SimState {
  let s = from;
  for (let t = 0; t < ticks; t += 1) {
    s = step(s, log.filter((c) => c.tick === s.tick));
  }
  return s;
}

describe('the tick pipeline order is part of the contract', () => {
  it('declares the ten stages in the order plan.md fixes', () => {
    // Pinned deliberately. Reordering the pipeline changes simulation behaviour
    // and must therefore be a visible, intentional diff — not something that
    // drifts while adding a system.
    expect(STAGES).toEqual([
      'applyCommands',
      'aiThink',
      'economy',
      'production',
      'movement',
      'combatAcquire',
      'combatCollectDamage',
      'combatApplyDamage',
      'victoryResolve',
      'advanceTick',
    ]);
  });
});

describe('TC-UNIT-001 — same seed + same command log ⇒ identical terminal hash', () => {
  it('is identical across repeated runs', () => {
    const a = hashState(run(scenario(), LOG, 20));
    const b = hashState(run(scenario(), LOG, 20));
    expect(a).toBe(b);
  });

  it('is identical when the log arrives in a different order each run', () => {
    const forwards = run(scenario(), LOG, 20);
    const backwards = run(scenario(), [...LOG].reverse(), 20);
    expect(hashState(backwards)).toBe(hashState(forwards));
  });

  it('actually advanced — the terminal hash differs from the initial one', () => {
    // Guards against the failure mode where every assertion above passes because
    // step() is a no-op and every hash is the hash of the initial state.
    const initial = scenario();
    const terminal = run(initial, LOG, 20);
    expect(terminal.tick).toBe(20);
    expect(hashState(terminal)).not.toBe(hashState(initial));
  });

  it('diverges for a different command log', () => {
    const withLog = run(scenario(), LOG, 20);
    const withoutLog = run(scenario(), [], 20);
    expect(hashState(withoutLog)).not.toBe(hashState(withLog));
  });

  it('diverges for a different seed once the seed is observable', () => {
    // The rng is hashed directly, so two seeds must never collide in the hash
    // even before anything draws from them.
    expect(hashState(scenario(1))).not.toBe(hashState(scenario(2)));
  });

  it('leaves the input state untouched — step is pure', () => {
    const initial = scenario();
    const before = hashState(initial);
    run(initial, LOG, 20);
    expect(hashState(initial)).toBe(before);
  });

  it('keeps entities id-sorted at every tick (O-7)', () => {
    let s = scenario();
    for (let t = 0; t < 20; t += 1) {
      s = step(s, LOG.filter((c) => c.tick === s.tick));
      const ids = s.entities.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((x, y) => x - y));
    }
  });
});

describe('TC-UNIT-002 — PRNG state lives inside sim state', () => {
  it('is carried on the state object, not in a module singleton', () => {
    const s = scenario();
    expect(typeof s.rng).toBe('number');
    expect(Number.isInteger(s.rng)).toBe(true);
  });

  it('survives a mid-match serialise/restore and resumes an identical trajectory', () => {
    const uninterrupted = run(scenario(), LOG, 20);

    const midpoint = run(scenario(), LOG, 9);
    const revived: SimState = JSON.parse(JSON.stringify(midpoint));
    expect(revived.rng).toBe(midpoint.rng);
    expect(hashState(revived)).toBe(hashState(midpoint));

    const resumed = run(revived, LOG, 11);
    expect(hashState(resumed)).toBe(hashState(uninterrupted));
  });

  it('produces the same subsequent draws from a restored state as from an uninterrupted one', () => {
    const midpoint = run(scenario(), LOG, 9);
    const revived: SimState = JSON.parse(JSON.stringify(midpoint));

    let live = midpoint.rng;
    let restored = revived.rng;
    for (let i = 0; i < 16; i += 1) {
      const a = nextRng(live);
      const b = nextRng(restored);
      expect(b.value).toBe(a.value);
      live = a.state;
      restored = b.state;
    }
  });

  it('gives two simulations in the same process independent generators', () => {
    // A module-level closure would make these two runs interfere. This is the
    // exact configuration the corpus runner uses: many cases, one process.
    const a = scenario(11);
    const b = scenario(22);
    const aAdvanced = run(a, [], 5);
    const bAdvanced = run(b, [], 5);
    expect(aAdvanced.rng).toBe(a.rng);
    expect(bAdvanced.rng).toBe(b.rng);
    expect(a.rng).not.toBe(b.rng);
  });
});
