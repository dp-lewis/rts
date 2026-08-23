import { describe, expect, it } from 'vitest';

import { ATTACK, BUILD_TICKS, COST, MAP_TILES_X, TILE_PX } from '../../src/sim/constants';
import { hashState } from '../../src/sim/hash';
import { ISSUER, type Command } from '../../src/sim/commands';
import { ENTITY_STATE, KIND, createInitialState, type EntitySeed } from '../../src/sim/state';
import { step } from '../../src/sim/step';

/**
 * The `place` command — REV-007, open since the M3 review.
 *
 * FR-012 ("Player may place additional Factories on valid ground") is a Must, and
 * until now it was unreachable: T039 delivered `isValidPlacement` but no verb, so
 * the validator's only caller was the automatic spawn search. A well-tested
 * function nobody can invoke is not a feature.
 */

const centre = (cell: number): number => cell * TILE_PX + TILE_PX / 2;

function world(entities: EntitySeed[], ore = 1000) {
  return createInitialState({
    seed: 1,
    difficulty: 1,
    players: [{ ore }, { ore }],
    entities,
  });
}

const BASE_P0: EntitySeed = { id: 1, kind: KIND.BASE, owner: 0, x: centre(2), y: centre(5) };

function place(builderId: number, x: number, y: number, tick = 0, issuer: number = ISSUER.PLAYER): Command {
  return { type: 'place', tick, issuer, seq: 0, builderId, kind: KIND.FACTORY, x, y };
}

describe('place — FR-012 becomes reachable', () => {
  it('creates an under-construction Factory on valid ground', () => {
    const state = world([BASE_P0]);
    const next = step(state, [place(1, centre(6), centre(5))]);

    const factory = next.entities.find((e) => e.kind === KIND.FACTORY);
    expect(factory).toBeDefined();
    expect(factory?.owner).toBe(0);
    expect(factory?.state).toBe(ENTITY_STATE.UNDER_CONSTRUCTION);
  });

  it('snaps the structure to the cell centre, not the click point', () => {
    // Placement is judged by CELL (isValidPlacement), so a structure left at a raw
    // click point would sit off-centre in a blocked cell — which is exactly the
    // mismatch that produced M3's deposit livelock, where pixel range and
    // cell-based movement disagreed.
    const state = world([BASE_P0]);
    const next = step(state, [place(1, centre(6) + 21, centre(5) - 17)]);

    const factory = next.entities.find((e) => e.kind === KIND.FACTORY)!;
    expect(factory.x).toBe(centre(6));
    expect(factory.y).toBe(centre(5));
  });

  it('charges the player at PLACEMENT, not at completion', () => {
    // Deliberately unlike a queued unit, which pays on completion (O-5). A
    // structure occupies ground the instant it is placed, so the ore goes with it
    // — otherwise an unaffordable Factory squats on a cell indefinitely, blocking
    // it for free and never finishing.
    const state = world([BASE_P0], 500);
    const next = step(state, [place(1, centre(6), centre(5))]);
    expect(next.players[0].ore).toBe(500 - COST.factory);
  });

  it('refuses placement the player cannot afford, and changes nothing', () => {
    const state = world([BASE_P0], COST.factory - 1);
    const next = step(state, [place(1, centre(6), centre(5))]);
    expect(next.entities.find((e) => e.kind === KIND.FACTORY)).toBeUndefined();
    expect(next.players[0].ore).toBe(COST.factory - 1);
  });

  it('refuses an occupied cell', () => {
    const state = world([BASE_P0]);
    const next = step(state, [place(1, BASE_P0.x, BASE_P0.y)]);
    expect(next.entities.find((e) => e.kind === KIND.FACTORY)).toBeUndefined();
    expect(next.players[0].ore).toBe(1000);
  });

  it('refuses ground outside the map', () => {
    const state = world([BASE_P0]);
    const next = step(state, [place(1, centre(MAP_TILES_X + 3), centre(5))]);
    expect(next.entities.find((e) => e.kind === KIND.FACTORY)).toBeUndefined();
  });

  it('refuses a builder the issuer does not own', () => {
    const state = world([BASE_P0, { id: 2, kind: KIND.BASE, owner: 1, x: centre(17), y: centre(5) }]);
    const next = step(state, [place(2, centre(6), centre(5), 0, ISSUER.PLAYER)]);
    expect(next.entities.find((e) => e.kind === KIND.FACTORY)).toBeUndefined();
  });

  it('builds itself to completion and becomes operational', () => {
    let state = world([BASE_P0]);
    state = step(state, [place(1, centre(6), centre(5))]);
    const id = state.entities.find((e) => e.kind === KIND.FACTORY)!.id;

    // Derived, not a magic 500: M8 raised the Factory's build time past that and
    // this assertion started failing for a tuning reason rather than a placement
    // one. The +20 is slack for the tick the command lands on.
    for (let i = 0; i < BUILD_TICKS.factory + 20; i += 1) {
      state = step(state, []);
    }
    expect(state.entities.find((e) => e.id === id)?.state).toBe(ENTITY_STATE.IDLE);
  });
});

describe('REV-008 — a malformed kind must not poison the simulation', () => {
  it('refuses a build command carrying an out-of-range kind', () => {
    // `queuedKind as Kind` was an unchecked cast: kind 99 yields undefined from
    // the cost and build-time tables, `ore -= undefined` makes ore NaN, and the
    // next hashState throws. Latent while no command could set queuedKind;
    // reachable the moment one could.
    const state = world([BASE_P0]);
    const rogue = { type: 'build', tick: 0, issuer: ISSUER.PLAYER, seq: 0, builderId: 1, kind: 99 };
    const next = step(state, [rogue as unknown as Command]);

    expect(next.entities.find((e) => e.id === 1)?.queuedKind).toBe(-1);
    expect(Number.isNaN(next.players[0].ore)).toBe(false);
    expect(() => hashState(next)).not.toThrow();
  });

  it('refuses a place command carrying a kind that is not a structure', () => {
    const state = world([BASE_P0]);
    const rogue: Command = {
      type: 'place',
      tick: 0,
      issuer: ISSUER.PLAYER,
      seq: 0,
      builderId: 1,
      kind: KIND.TANK,
      x: centre(6),
      y: centre(5),
    };
    const next = step(state, [rogue]);
    expect(next.entities).toHaveLength(1);
    expect(next.players[0].ore).toBe(1000);
  });
});

describe('M4-F2 — a new command type must be hashed in full', () => {
  it('hashes every field of a pending place command', () => {
    // The warning M4 left: `pending` is variable-length, and a command type could
    // be added whose FIELDS never reach the hash while its type code does. Two
    // states differing only inside a pending place command must not collide.
    const base = world([BASE_P0]);

    const withA = { ...base, pending: [place(1, centre(6), centre(5), 5, ISSUER.AI)] };
    const withB = { ...base, pending: [place(1, centre(7), centre(5), 5, ISSUER.AI)] };
    const withC = { ...base, pending: [place(1, centre(6), centre(4), 5, ISSUER.AI)] };

    expect(hashState(withA)).not.toBe(hashState(withB));
    expect(hashState(withA)).not.toBe(hashState(withC));
    expect(hashState(withA)).toBe(hashState({ ...base, pending: [place(1, centre(6), centre(5), 5, ISSUER.AI)] }));
  });
});

describe('REV-006 — the real fire interval', () => {
  it('fires exactly every cooldownTicks, not cooldownTicks + 1', () => {
    // Cooldown was set on the firing tick and only decremented from the NEXT one,
    // so the true interval was C+1. Measured before fixing: cooldownTicks=16,
    // observed gaps [17,17,17,17].
    //
    // The existing combat test asserts "at most one shot per cooldown window, plus
    // the opening shot", which passes under both. So did the first version of THIS
    // test, which counted shots in a fixed window — 4 shots either way, because
    // the extra tick per window only shifts when the fifth would land. Counting is
    // not enough; the GAP has to be measured directly.
    //
    // M8 is a tuning pass. Tuning against damage-per-second numbers that are all
    // quietly 6% low is the failure this milestone can still cheaply prevent.
    const cooldown = ATTACK.trooper.cooldownTicks;

    let state = world([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 320, y: 320, cooldown: 0 },
      { id: 2, kind: KIND.TROOPER, owner: 1, x: 340, y: 320, cooldown: 0, hp: 100_000 },
    ]);

    const shotTicks: number[] = [];
    let previousHp = state.entities.find((e) => e.id === 2)!.hp;
    for (let tick = 1; tick <= cooldown * 5; tick += 1) {
      state = step(state, []);
      const hp = state.entities.find((e) => e.id === 2)!.hp;
      if (hp < previousHp) {
        shotTicks.push(tick);
      }
      previousHp = hp;
    }

    const gaps = shotTicks.slice(1).map((t, i) => t - shotTicks[i]!);
    expect(gaps.length).toBeGreaterThan(2);
    expect(gaps, `shots landed on ticks ${JSON.stringify(shotTicks)}`).toEqual(
      gaps.map(() => cooldown),
    );
  });
});
