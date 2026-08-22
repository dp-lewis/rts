import { describe, expect, it } from 'vitest';

import { aiThink } from '../../src/sim/ai';
import { ISSUER } from '../../src/sim/commands';
import { hashState } from '../../src/sim/hash';
import { step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, VERDICT, createInitialState, type Difficulty, type SimState } from '../../src/sim/state';

/**
 * T042 (FR-002) and T043 (FR-029).
 *
 * M4 is the first milestone in which `step()` consumes the PRNG at all. Until now
 * TC-UNIT-002 could prove the generator lived inside simulation state and survived
 * serialisation, but nothing proved the tick loop actually threaded it correctly —
 * a generator nobody draws from is trivially deterministic.
 *
 * It is also the first time a second issuer exists. Every ordering rule written for
 * O-4 has been carrying player commands only; from here the AI competes for the
 * same tick, which is the situation the rule was written for.
 *
 * FR-029: difficulty is a FIELD, never folded into the seed. That is what makes
 * "same seed, different difficulty" a legitimate comparison, and it is why a replay
 * carries difficulty in its header rather than inferring it.
 */

function mirrorMatch(difficulty: Difficulty, seed = 777): SimState {
  return createInitialState({
    seed,
    difficulty,
    players: [{ ore: 150 }, { ore: 150 }],
    nodes: [
      { id: 0, x: 416, y: 352, remaining: 1500 },
      { id: 1, x: 864, y: 352, remaining: 1500 },
    ],
    entities: [
      { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
      { id: 2, kind: KIND.WORKER, owner: 0, x: 224, y: 288 },
      { id: 3, kind: KIND.WORKER, owner: 0, x: 224, y: 416 },
      { id: 4, kind: KIND.BASE, owner: 1, x: 1120, y: 352 },
      { id: 5, kind: KIND.WORKER, owner: 1, x: 1056, y: 288 },
      { id: 6, kind: KIND.WORKER, owner: 1, x: 1056, y: 416 },
    ],
  });
}

function run(from: SimState, ticks: number): SimState {
  let s = from;
  for (let t = 0; t < ticks; t += 1) {
    s = step(s, []);
  }
  return s;
}

describe('FR-002 / T042 — an AI-vs-AI match is reproducible', () => {
  it('produces an identical terminal hash across repeated runs', () => {
    const a = hashState(run(mirrorMatch(1), 1200));
    const b = hashState(run(mirrorMatch(1), 1200));
    expect(b).toBe(a);
  });

  it('is identical at every checkpoint, not merely at the end', () => {
    // A terminal-only comparison can hide two runs that diverged and reconverged.
    let a = mirrorMatch(1);
    let b = mirrorMatch(1);
    for (let t = 0; t < 900; t += 1) {
      a = step(a, []);
      b = step(b, []);
      if (t % 100 === 0) {
        expect(hashState(b)).toBe(hashState(a));
      }
    }
  });

  it('actually consumes the PRNG — this is the first milestone where step() does', () => {
    const initial = mirrorMatch(1);
    const later = run(initial, 300);
    expect(later.rng).not.toBe(initial.rng);
  });

  it('diverges for a different seed at the same difficulty', () => {
    expect(hashState(run(mirrorMatch(1, 1), 600))).not.toBe(hashState(run(mirrorMatch(1, 2), 600)));
  });

  it('leaves the input state untouched — step stays pure with the AI running', () => {
    const initial = mirrorMatch(1);
    const before = hashState(initial);
    run(initial, 300);
    expect(hashState(initial)).toBe(before);
  });

  it('keeps entities id-sorted while the AI is spawning units', () => {
    let s = mirrorMatch(2);
    for (let t = 0; t < 900; t += 1) {
      s = step(s, []);
      const ids = s.entities.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((x, y) => x - y));
    }
  });

  it('reaches a verdict rather than idling forever', () => {
    let s = mirrorMatch(2);
    for (let t = 0; t < 30_000 && s.verdict === VERDICT.NONE; t += 1) {
      s = step(s, []);
    }
    expect(s.verdict).not.toBe(VERDICT.NONE);
  });
});

describe('the AI plays — it is not a no-op that happens to be deterministic', () => {
  it('produces units', () => {
    // The cheapest way for an "AI" to be perfectly reproducible is to do nothing.
    // These assertions are what stop that from passing.
    const s = run(mirrorMatch(1), 1500);
    const aiUnits = s.entities.filter((e) => e.owner === 1 && e.kind !== KIND.BASE);
    expect(aiUnits.length).toBeGreaterThan(2);
  });

  it('spends ore', () => {
    const s = run(mirrorMatch(1), 1500);
    expect(s.players[1].ore).not.toBe(150);
  });

  it('eventually attacks — something of the player\'s takes damage', () => {
    let s = mirrorMatch(2);
    let sawDamage = false;
    for (let t = 0; t < 6000 && !sawDamage; t += 1) {
      s = step(s, []);
      if (s.players[0].underAttack) {
        sawDamage = true;
      }
    }
    expect(sawDamage).toBe(true);
  });

  it('only ever commands its OWN units', () => {
    let s = mirrorMatch(2);
    for (let t = 0; t < 600; t += 1) {
      const commands = aiThink(s);
      for (const command of commands) {
        expect(command.issuer).toBe(ISSUER.AI);
        // Widened when `place` joined the union (M6). Switching on the type
        // rather than testing for one of them keeps this exhaustive: a future
        // command type carrying entity ids will fail to compile here instead of
        // quietly escaping the ownership check.
        const ids =
          command.type === 'build' || command.type === 'place'
            ? [command.builderId]
            : command.units;
        for (const id of ids) {
          const owner = s.entities.find((e) => e.id === id)?.owner;
          if (owner !== undefined) {
            expect(owner).toBe(1);
          }
        }
      }
      s = step(s, []);
    }
  });

  it('schedules its commands for a FUTURE tick, never the current one', () => {
    // Player intent enters as commands queued for a future tick (FR-004); the AI
    // is held to the same rule so it cannot act with less latency than a human.
    const s = run(mirrorMatch(1), 40);
    for (const command of aiThink(s)) {
      expect(command.tick).toBeGreaterThan(s.tick);
    }
  });

  it('issues a monotonic seq per issuer, so O-4 has a total order', () => {
    let s = mirrorMatch(2);
    let last = -1;
    for (let t = 0; t < 800; t += 1) {
      for (const command of aiThink(s)) {
        expect(command.seq).toBeGreaterThan(last);
        last = command.seq;
      }
      s = step(s, []);
    }
  });
});

describe('FR-029 / T043 — difficulty is a field, not part of the seed', () => {
  it('is carried on the initial state', () => {
    expect(mirrorMatch(0).difficulty).toBe(0);
    expect(mirrorMatch(2).difficulty).toBe(2);
  });

  it('changes AI behaviour at an identical seed', () => {
    const easy = hashState(run(mirrorMatch(0), 900));
    const hard = hashState(run(mirrorMatch(2), 900));
    expect(hard).not.toBe(easy);
  });

  it('is reproducible independently at each level', () => {
    for (const level of [0, 1, 2] as const) {
      expect(hashState(run(mirrorMatch(level), 700))).toBe(hashState(run(mirrorMatch(level), 700)));
    }
  });

  it('makes harder AI field an army no smaller than easier AI, at the same seed', () => {
    const army = (d: Difficulty): number =>
      run(mirrorMatch(d), 1800).entities.filter(
        (e) => e.owner === 1 && e.kind !== KIND.BASE && e.kind !== KIND.WORKER && e.state !== ENTITY_STATE.DEAD,
      ).length;
    expect(army(2)).toBeGreaterThanOrEqual(army(0));
  });
});
