import { describe, expect, it } from 'vitest';

import { acquireTargets, applyDamage, collectDamage } from '../../src/sim/combat';
import { ATTACK, MAX_HP } from '../../src/sim/constants';
import { step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, createInitialState, type EntitySeed, type SimState } from '../../src/sim/state';

/**
 * T034 (O-1 / TC-UNIT-005) and T036 (O-6 / FR-028).
 *
 * Two hazards live here and they are different in kind.
 *
 * O-1 is a "pick the nearest" tie, like O-3 before it: two enemies equidistant
 * and in range, and without a rule the answer depends on traversal order.
 *
 * O-6 is subtler and worse. If damage is applied as it is calculated, then when A
 * and B would kill each other on the same tick, whichever is processed first
 * kills the other before the other gets to fire. The outcome is decided by array
 * position — and it is not merely non-deterministic, it is *wrong*: both units
 * fired, so both should die. Collecting damage across the whole tick and applying
 * it atomically at the end makes the array position irrelevant and generalises
 * FR-028's Draw rule from Bases to every entity.
 */

function scenario(entities: readonly EntitySeed[]): SimState {
  return createInitialState({ seed: 1, difficulty: 1, entities });
}

describe('O-1 / TC-UNIT-005 — target acquisition ties', () => {
  it('targets the LOWER entity id when two enemies are exactly equidistant', () => {
    const state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 320 - 64, y: 320 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 320 + 64, y: 320 },
    ]);
    acquireTargets(state);
    expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(2);
  });

  it('breaks the tie identically however the entities were declared', () => {
    const seeds: EntitySeed[] = [
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 256, y: 320 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 384, y: 320 },
    ];
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0], [2, 0, 1]]) {
      const state = scenario(order.map((i) => seeds[i]!));
      acquireTargets(state);
      expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(2);
    }
  });

  it('prefers a strictly nearer enemy over a lower id', () => {
    const state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 320 + 90, y: 320 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 320 + 40, y: 320 },
    ]);
    acquireTargets(state);
    expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(3);
  });

  it('acquires nothing when every enemy is out of range', () => {
    const state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 64, y: 64 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 1200, y: 640 },
    ]);
    acquireTargets(state);
    expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(-1);
  });

  it('never targets a friendly unit', () => {
    const state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320 },
      { id: 2, kind: KIND.TROOPER, owner: 0, x: 340, y: 320 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 380, y: 320 },
    ]);
    acquireTargets(state);
    expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(3);
  });

  it('never targets a dead unit', () => {
    const state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 340, y: 320, state: ENTITY_STATE.DEAD, hp: 0 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 380, y: 320 },
    ]);
    acquireTargets(state);
    expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(3);
  });

  it('FR-020 — an explicit order overrides auto-acquisition', () => {
    // Unit 1 is ordered onto the FAR enemy. Auto-acquire must not quietly
    // retarget it to the nearer one; the player said what they wanted.
    const state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320, targetId: 3, state: ENTITY_STATE.ATTACKING },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 340, y: 320 },
      { id: 3, kind: KIND.TROOPER, owner: 1, x: 390, y: 320 },
    ]);
    acquireTargets(state);
    expect(state.entities.find((e) => e.id === 1)!.targetId).toBe(3);
  });
});

describe('O-6 / FR-028 — damage is atomic at end of tick', () => {
  function mutuallyLethal(): SimState {
    // Two troopers, each with exactly enough hp to die to one hit from the other.
    return scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320, hp: ATTACK.trooper.damage, cooldown: 0 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 340, y: 320, hp: ATTACK.trooper.damage, cooldown: 0 },
    ]);
  }

  it('kills BOTH units when the damage is mutually lethal', () => {
    const state = mutuallyLethal();
    acquireTargets(state);
    applyDamage(state, collectDamage(state));
    expect(state.entities.find((e) => e.id === 1)!.state).toBe(ENTITY_STATE.DEAD);
    expect(state.entities.find((e) => e.id === 2)!.state).toBe(ENTITY_STATE.DEAD);
  });

  it('kills both whichever order the two units were declared in', () => {
    // The assertion that O-6 exists for. Applying damage as it is calculated
    // makes this depend entirely on array position.
    for (const swap of [false, true]) {
      const seeds: EntitySeed[] = [
        { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320, hp: ATTACK.trooper.damage },
        { id: 2, kind: KIND.TROOPER, owner: 1, x: 340, y: 320, hp: ATTACK.trooper.damage },
      ];
      const state = scenario(swap ? [seeds[1]!, seeds[0]!] : seeds);
      acquireTargets(state);
      applyDamage(state, collectDamage(state));
      expect(state.entities.map((e) => e.state)).toEqual([ENTITY_STATE.DEAD, ENTITY_STATE.DEAD]);
    }
  });

  it('collects damage without applying any of it', () => {
    // The separation is the mechanism, so it is asserted directly rather than
    // inferred from the outcome.
    const state = mutuallyLethal();
    acquireTargets(state);
    const damage = collectDamage(state);
    expect(damage.size).toBe(2);
    expect(state.entities.every((e) => e.hp === ATTACK.trooper.damage)).toBe(true);
    expect(state.entities.every((e) => e.state !== ENTITY_STATE.DEAD)).toBe(true);
  });

  it('lets a dying unit land its blow — the corpse still fired', () => {
    // Trooper 2 is frail and dies to tank 3 this tick, but must still have dealt
    // its damage to Base 1, because it was alive when it fired.
    //
    // The geometry is load-bearing and the first draft got it wrong: the tank sits
    // at 110px, inside its own 128px reach but OUTSIDE the trooper's 96px reach,
    // so the trooper's nearest valid target really is the Base. Put the tank any
    // closer and the trooper shoots the tank instead and the test proves nothing.
    const state = scenario([
      { id: 1, kind: KIND.BASE, owner: 0, x: 320, y: 320, hp: MAX_HP.base },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 360, y: 320, hp: 1 },
      { id: 3, kind: KIND.TANK, owner: 0, x: 470, y: 320 },
    ]);
    acquireTargets(state);
    applyDamage(state, collectDamage(state));
    expect(state.entities.find((e) => e.id === 2)!.state).toBe(ENTITY_STATE.DEAD);
    expect(state.entities.find((e) => e.id === 1)!.hp).toBeLessThan(MAX_HP.base);
  });

  it('never drives hp below zero', () => {
    const state = scenario([
      { id: 1, kind: KIND.WORKER, owner: 0, x: 320, y: 320, hp: 1 },
      { id: 2, kind: KIND.TANK, owner: 1, x: 340, y: 320 },
    ]);
    acquireTargets(state);
    applyDamage(state, collectDamage(state));
    expect(state.entities.find((e) => e.id === 1)!.hp).toBe(0);
  });

  it('sets the defender\'s underAttack flag and not the attacker\'s', () => {
    const state = scenario([
      { id: 1, kind: KIND.BASE, owner: 0, x: 320, y: 320 },
      { id: 2, kind: KIND.TANK, owner: 1, x: 360, y: 320 },
    ]);
    acquireTargets(state);
    applyDamage(state, collectDamage(state));
    expect(state.players[0].underAttack).toBe(true);
    expect(state.players[1].underAttack).toBe(false);
  });
});

describe('cooldown', () => {
  it('prevents a unit firing every single tick', () => {
    let state = scenario([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320, hp: MAX_HP.base },
      { id: 2, kind: KIND.BASE, owner: 1, x: 360, y: 320, hp: MAX_HP.base },
    ]);
    const ticks = ATTACK.trooper.cooldownTicks * 3;
    for (let t = 0; t < ticks; t += 1) {
      state = step(state, []);
    }
    const dealt = MAX_HP.base - state.entities.find((e) => e.id === 2)!.hp;
    // At most one shot per cooldown window, plus the opening shot.
    expect(dealt).toBeLessThanOrEqual(ATTACK.trooper.damage * 4);
    expect(dealt).toBeGreaterThan(0);
  });
});
