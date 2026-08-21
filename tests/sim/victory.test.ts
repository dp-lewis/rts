import { describe, expect, it } from 'vitest';

import { ATTACK, MAX_HP, SUDDEN_DEATH } from '../../src/sim/constants';
import { step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, VERDICT, createInitialState, type EntitySeed, type OreNode, type SimState } from '../../src/sim/state';
import { resolveVictory } from '../../src/sim/victory';

/**
 * T038 (FR-017, FR-028 / TC-UNIT-006), T078 (FR-032 / TC-UNIT-011, CR-001),
 * T079 (FR-033 / TC-UNIT-012, CR-001).
 *
 * CR-001 is the change request that came out of the pre-impl review, and it is
 * worth restating why it exists. Ore exhaustion halts production but does not by
 * itself force a resolution: two sides with surviving armies and no income can sit
 * forever, and nothing in FR-016 or FR-017 terminated that. The ten-minute promise
 * — the product's entire differentiator — was guaranteed by nothing.
 *
 * Four earlier review passes missed it because each checked whether the artifacts
 * were consistent WITH EACH OTHER, and FR-016 and FR-017 are perfectly consistent.
 * The gap was BETWEEN them: a state the requirements jointly failed to cover.
 *
 * The backstop adds NO fourth verdict. It forces one of the existing three.
 */

function match(entities: readonly EntitySeed[], nodes: readonly OreNode[] = [{ id: 0, x: 416, y: 352, remaining: 500 }]): SimState {
  return createInitialState({ seed: 1, difficulty: 1, players: [{ ore: 0 }, { ore: 0 }], nodes, entities });
}

const P0_BASE: EntitySeed = { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 };
const P1_BASE: EntitySeed = { id: 2, kind: KIND.BASE, owner: 1, x: 1120, y: 352 };

/**
 * Step until a verdict, with a hard budget.
 *
 * Never write `while (verdict === NONE)` here without one. The first draft of
 * these tests did, and against an unimplemented victory stage they did not fail —
 * they HUNG, taking the whole suite with them and giving no signal at all. A test
 * for "this terminates" that itself fails to terminate is worse than no test: in
 * CI it burns the job timeout and reports nothing.
 */
const VERDICT_BUDGET = SUDDEN_DEATH.graceTicks + 20_000;

function runToVerdict(from: SimState, budget = VERDICT_BUDGET): SimState {
  let state = from;
  for (let t = 0; t < budget; t += 1) {
    if (state.verdict !== VERDICT.NONE) {
      return state;
    }
    state = step(state, []);
  }
  throw new Error(
    `No verdict within ${budget} ticks — the match did not terminate. ` +
      'This is the exact failure CR-001 exists to prevent.',
  );
}

describe('TC-UNIT-006 — verdicts', () => {
  it('is NONE while both Bases stand', () => {
    const state = match([P0_BASE, P1_BASE]);
    resolveVictory(state);
    expect(state.verdict).toBe(VERDICT.NONE);
  });

  it('is VICTORY when only the enemy Base is destroyed', () => {
    const state = match([P0_BASE, { ...P1_BASE, hp: 0, state: ENTITY_STATE.DEAD }]);
    resolveVictory(state);
    expect(state.verdict).toBe(VERDICT.VICTORY);
  });

  it('is DEFEAT when only the player\'s own Base is destroyed', () => {
    const state = match([{ ...P0_BASE, hp: 0, state: ENTITY_STATE.DEAD }, P1_BASE]);
    resolveVictory(state);
    expect(state.verdict).toBe(VERDICT.DEFEAT);
  });

  it('FR-028 — is DRAW when both Bases fall on the same tick', () => {
    // An explicit third verdict, not an arbitrary tie-break. Picking a winner
    // here would be a lie about what happened, and O-6's atomic damage is what
    // makes the situation reachable in the first place.
    const state = match([
      { ...P0_BASE, hp: 0, state: ENTITY_STATE.DEAD },
      { ...P1_BASE, hp: 0, state: ENTITY_STATE.DEAD },
    ]);
    resolveVictory(state);
    expect(state.verdict).toBe(VERDICT.DRAW);
  });

  it('reaches the same verdict whichever order the Bases were declared in', () => {
    const dead0 = { ...P0_BASE, hp: 0, state: ENTITY_STATE.DEAD };
    const forward = match([dead0, P1_BASE]);
    const reversed = match([P1_BASE, dead0]);
    resolveVictory(forward);
    resolveVictory(reversed);
    expect(reversed.verdict).toBe(forward.verdict);
  });

  it('never revises a verdict once it has been reached', () => {
    // A settled match must stay settled. Without this, a Draw could be quietly
    // rewritten into a Defeat on the following tick.
    let state = match([
      { ...P0_BASE, hp: 0, state: ENTITY_STATE.DEAD },
      { ...P1_BASE, hp: 0, state: ENTITY_STATE.DEAD },
    ]);
    resolveVictory(state);
    expect(state.verdict).toBe(VERDICT.DRAW);
    for (let t = 0; t < 20; t += 1) {
      state = step(state, []);
    }
    expect(state.verdict).toBe(VERDICT.DRAW);
  });
});

describe('TC-UNIT-011 (CR-001) — sudden death arms and terminates', () => {
  function exhausted(entities: readonly EntitySeed[]): SimState {
    return match(entities, [
      { id: 0, x: 416, y: 352, remaining: 0 },
      { id: 1, x: 864, y: 352, remaining: 0 },
    ]);
  }

  it('does not arm while any ore remains anywhere', () => {
    let state = match([P0_BASE, P1_BASE], [
      { id: 0, x: 416, y: 352, remaining: 0 },
      { id: 1, x: 864, y: 352, remaining: 1 },
    ]);
    for (let t = 0; t < 10; t += 1) {
      state = step(state, []);
    }
    expect(state.suddenDeathAt).toBe(-1);
  });

  it('arms on the tick every node is depleted', () => {
    let state = exhausted([P0_BASE, P1_BASE]);
    state = step(state, []);
    expect(state.suddenDeathAt).toBeGreaterThanOrEqual(0);
  });

  it('arms exactly once and never re-arms', () => {
    let state = exhausted([P0_BASE, P1_BASE]);
    state = step(state, []);
    const armedAt = state.suddenDeathAt;
    for (let t = 0; t < 50; t += 1) {
      state = step(state, []);
    }
    expect(state.suddenDeathAt).toBe(armedAt);
  });

  it('deals no damage during the grace period', () => {
    let state = exhausted([P0_BASE, P1_BASE]);
    for (let t = 0; t < SUDDEN_DEATH.graceTicks; t += 1) {
      state = step(state, []);
    }
    expect(state.entities.every((e) => e.hp === MAX_HP.base)).toBe(true);
    expect(state.verdict).toBe(VERDICT.NONE);
  });

  it('terminates a deliberate stalemate in bounded ticks', () => {
    // The scenario CR-001 was written for: both sides alive, ore gone, neither
    // able to reach the other. Before the backstop this ran forever.
    const state = exhausted([
      P0_BASE,
      P1_BASE,
      { id: 3, kind: KIND.TROOPER, owner: 0, x: 224, y: 352 },
      { id: 4, kind: KIND.TROOPER, owner: 1, x: 1056, y: 352 },
    ]);

    // runToVerdict throws with a clear message if the budget is exhausted, which
    // is the assertion: a stalemate that does not terminate IS the failure.
    const resolved = runToVerdict(state);
    expect(resolved.verdict).not.toBe(VERDICT.NONE);
  });

  it('escalates — damage per tick grows the longer sudden death runs', () => {
    // Measured as two single-tick deltas, one in the first ramp band and one in
    // the second. The first draft sampled three bands apart and read zero,
    // because by then the cumulative damage had already destroyed the Base — the
    // test was measuring a corpse. Staying inside two bands keeps it alive.
    let state = exhausted([P0_BASE, P1_BASE]);

    const hitAt = (targetTick: number): number => {
      while (state.tick < targetTick) {
        state = step(state, []);
      }
      const before = state.entities[0]!.hp;
      state = step(state, []);
      return before - state.entities[0]!.hp;
    };

    const firstHit = hitAt(SUDDEN_DEATH.graceTicks + 2);
    const laterHit = hitAt(SUDDEN_DEATH.graceTicks + SUDDEN_DEATH.rampIntervalTicks + 2);

    expect(state.entities[0]!.hp).toBeGreaterThan(0);
    expect(firstHit).toBeGreaterThan(0);
    expect(laterHit).toBeGreaterThan(firstHit);
  });

  it('damages BOTH Bases, so it cannot hand one side a win by asymmetry', () => {
    let state = exhausted([P0_BASE, P1_BASE]);
    for (let t = 0; t < SUDDEN_DEATH.graceTicks + 5; t += 1) {
      state = step(state, []);
    }
    expect(state.entities.find((e) => e.id === 1)!.hp).toBeLessThan(MAX_HP.base);
    expect(state.entities.find((e) => e.id === 2)!.hp).toBeLessThan(MAX_HP.base);
  });

  it('resolves an equal-hp stalemate as a DRAW, reusing FR-028', () => {
    // Both Bases identical, both taking identical damage, so both hit zero on the
    // same tick. CR-001 adds no fourth verdict; it reuses the Draw rule.
    const state = runToVerdict(exhausted([P0_BASE, P1_BASE]));
    expect(state.verdict).toBe(VERDICT.DRAW);
  });

  it('resolves in favour of the healthier Base when hp differs', () => {
    const state = runToVerdict(exhausted([{ ...P0_BASE, hp: MAX_HP.base }, { ...P1_BASE, hp: 40 }]));
    expect(state.verdict).toBe(VERDICT.VICTORY);
  });
});

describe('TC-UNIT-012 (CR-001) — sudden death does not misfire the alert', () => {
  it('FR-033 — sets the sudden-death flag and NOT the under-attack flag', () => {
    // A Base dying with no attacker must not be reported as under attack. The
    // player would go looking for an enemy that does not exist, in a game with no
    // camera to go looking with.
    let state = createInitialState({
      seed: 1,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 416, y: 352, remaining: 0 }],
      entities: [P0_BASE, P1_BASE],
    });
    for (let t = 0; t < SUDDEN_DEATH.graceTicks + 2; t += 1) {
      state = step(state, []);
    }
    expect(state.players[0].suddenDeathDamage).toBe(true);
    expect(state.players[1].suddenDeathDamage).toBe(true);
    expect(state.players[0].underAttack).toBe(false);
    expect(state.players[1].underAttack).toBe(false);
  });

  it('still reports a genuine attack during sudden death', () => {
    // The flags are independent, not exclusive: being shot at while the backstop
    // runs must still raise the under-attack indicator.
    //
    // Scanned over a window rather than sampled on one tick. The flags are reset
    // every tick and the tank only fires once per cooldown, so a single sample
    // lands on a non-firing tick far more often than not — the first draft did
    // exactly that and failed for a reason that had nothing to do with the rule.
    let state = createInitialState({
      seed: 1,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 416, y: 352, remaining: 0 }],
      entities: [P0_BASE, P1_BASE, { id: 3, kind: KIND.TANK, owner: 1, x: 224, y: 352 }],
    });
    while (state.tick < SUDDEN_DEATH.graceTicks + 2) {
      state = step(state, []);
    }

    let sawBothTogether = false;
    let sawSuddenDeathAlone = false;
    for (let t = 0; t < ATTACK.tank.cooldownTicks + 2; t += 1) {
      state = step(state, []);
      if (state.players[0].suddenDeathDamage && state.players[0].underAttack) {
        sawBothTogether = true;
      }
      if (state.players[0].suddenDeathDamage && !state.players[0].underAttack) {
        sawSuddenDeathAlone = true;
      }
    }

    expect(sawBothTogether).toBe(true);
    expect(sawSuddenDeathAlone).toBe(true);
  });

  it('clears the flags on a tick with no damage at all', () => {
    let state = match([P0_BASE, P1_BASE]);
    state = step(state, []);
    expect(state.players[0].underAttack).toBe(false);
    expect(state.players[0].suddenDeathDamage).toBe(false);
  });
});
