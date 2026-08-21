import { describe, expect, it } from 'vitest';

import { BUILD_TICKS, COST, TILE_PX } from '../../src/sim/constants';
import { isValidPlacement, runProduction } from '../../src/sim/production';
import { ENTITY_STATE, KIND, createInitialState, type EntitySeed, type PlayerSeed, type SimState } from '../../src/sim/state';

/**
 * T035 (O-5), T037 (FR-031), T080 (pre-impl F-6).
 *
 * O-5 exists because ore is spent on COMPLETION, not when an item is queued —
 * which is the right design (queuing should not lock up resources you might need)
 * and is precisely what creates the hazard. Two Factories finish on the same tick
 * and there is ore for one. Without a rule, whichever the loop reaches first
 * wins, and that is array position deciding the game.
 *
 * The rule: resolve in ascending entity id order, and the loser stays QUEUED
 * rather than failing. Staying queued matters — a build that silently evaporated
 * because ore was 10 short would be maddening and invisible.
 */

function producing(entities: readonly EntitySeed[], players?: [PlayerSeed, PlayerSeed]): SimState {
  return createInitialState({
    seed: 1,
    difficulty: 1,
    ...(players ? { players } : {}),
    entities,
  });
}

/** A producer one tick away from completing whatever it has queued. */
function almostDone(id: number, owner: 0 | 1, kind: number, x: number, y: number): EntitySeed {
  return {
    id,
    kind: KIND.FACTORY,
    owner,
    x,
    y,
    state: ENTITY_STATE.BUILDING,
    queuedKind: kind,
    progress: BUILD_TICKS.trooper - 1,
  };
}

describe('O-5 — two producers complete on one tick with ore for only one', () => {
  it('resolves in ascending entity id order: the LOWER id gets the unit', () => {
    const state = producing(
      [
        { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
        almostDone(4, 0, KIND.TROOPER, 416, 352),
        almostDone(7, 0, KIND.TROOPER, 608, 352),
      ],
      [{ ore: COST.trooper }, { ore: 0 }],
    );

    runProduction(state);

    const spawned = state.entities.filter((e) => e.kind === KIND.TROOPER);
    expect(spawned).toHaveLength(1);
    expect(state.players[0].ore).toBe(0);
    // Factory 4 won and cleared its queue; factory 7 is still holding its order.
    expect(state.entities.find((e) => e.id === 4)!.queuedKind).toBe(-1);
    expect(state.entities.find((e) => e.id === 7)!.queuedKind).toBe(KIND.TROOPER);
  });

  it('leaves the loser QUEUED, not failed', () => {
    const state = producing(
      [
        { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
        almostDone(4, 0, KIND.TROOPER, 416, 352),
        almostDone(7, 0, KIND.TROOPER, 608, 352),
      ],
      [{ ore: COST.trooper }, { ore: 0 }],
    );
    runProduction(state);
    const loser = state.entities.find((e) => e.id === 7)!;
    expect(loser.queuedKind).toBe(KIND.TROOPER);
    expect(loser.state).toBe(ENTITY_STATE.BUILDING);
  });

  it('resolves the same way however the factories were declared', () => {
    for (const swap of [false, true]) {
      const factories = [almostDone(4, 0, KIND.TROOPER, 416, 352), almostDone(7, 0, KIND.TROOPER, 608, 352)];
      const state = producing(
        [
          { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
          ...(swap ? [factories[1]!, factories[0]!] : factories),
        ],
        [{ ore: COST.trooper }, { ore: 0 }],
      );
      runProduction(state);
      expect(state.entities.find((e) => e.id === 4)!.queuedKind).toBe(-1);
      expect(state.entities.find((e) => e.id === 7)!.queuedKind).toBe(KIND.TROOPER);
    }
  });

  it('completes both when there is ore for both', () => {
    const state = producing(
      [
        { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
        almostDone(4, 0, KIND.TROOPER, 416, 352),
        almostDone(7, 0, KIND.TROOPER, 608, 352),
      ],
      [{ ore: COST.trooper * 2 }, { ore: 0 }],
    );
    runProduction(state);
    expect(state.entities.filter((e) => e.kind === KIND.TROOPER)).toHaveLength(2);
    expect(state.players[0].ore).toBe(0);
  });

  it('does not let progress run away while a build waits for ore', () => {
    // A build stuck on affordability must not accumulate unbounded progress and
    // then spawn a queue of units the instant ore arrives.
    const state = producing(
      [
        { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
        almostDone(4, 0, KIND.TROOPER, 416, 352),
      ],
      [{ ore: 0 }, { ore: 0 }],
    );
    for (let t = 0; t < 50; t += 1) {
      runProduction(state);
    }
    expect(state.entities.find((e) => e.id === 4)!.progress).toBeLessThanOrEqual(BUILD_TICKS.trooper);
    expect(state.entities.filter((e) => e.kind === KIND.TROOPER)).toHaveLength(0);
  });

  it('assigns spawned units ascending ids from nextEntityId', () => {
    const state = producing(
      [
        { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
        almostDone(4, 0, KIND.TROOPER, 416, 352),
        almostDone(7, 0, KIND.TROOPER, 608, 352),
      ],
      [{ ore: COST.trooper * 2 }, { ore: 0 }],
    );
    const before = state.nextEntityId;
    runProduction(state);
    expect(state.nextEntityId).toBe(before + 2);
    const ids = state.entities.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('FR-031 — placement validity', () => {
  function occupied(): SimState {
    return producing([
      { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 },
      { id: 2, kind: KIND.WORKER, owner: 0, x: 416, y: 352 },
    ]);
  }

  it('accepts open ground', () => {
    expect(isValidPlacement(occupied(), 800, 224)).toBe(true);
  });

  it('rejects a cell occupied by a structure', () => {
    expect(isValidPlacement(occupied(), 160, 352)).toBe(false);
  });

  it('rejects a cell occupied by a unit', () => {
    expect(isValidPlacement(occupied(), 416, 352)).toBe(false);
  });

  it('rejects anywhere out of bounds', () => {
    expect(isValidPlacement(occupied(), -10, 100)).toBe(false);
    expect(isValidPlacement(occupied(), 100, -10)).toBe(false);
    expect(isValidPlacement(occupied(), 20 * TILE_PX + 5, 100)).toBe(false);
    expect(isValidPlacement(occupied(), 100, 11 * TILE_PX + 5)).toBe(false);
  });

  it('judges by cell, not by exact pixel — anywhere in an occupied tile is invalid', () => {
    // The Base sits at (160,352), the centre of cell (2,5). A click at (130,330)
    // is a different pixel but the same tile, and must be refused.
    expect(isValidPlacement(occupied(), 130, 330)).toBe(false);
  });
});

describe('pre-impl F-6 — a player with no Workers is never stuck', () => {
  it('affords a Worker at zero cost when the player has none surviving', () => {
    // Without this rule a player who loses every Worker while broke can neither
    // gather nor build: a dead state where they can neither act nor lose, and the
    // match cannot end. The Base gives one away.
    const state = producing(
      [
        {
          id: 1,
          kind: KIND.BASE,
          owner: 0,
          x: 160,
          y: 352,
          state: ENTITY_STATE.BUILDING,
          queuedKind: KIND.WORKER,
          progress: BUILD_TICKS.worker - 1,
        },
      ],
      [{ ore: 0 }, { ore: 0 }],
    );
    runProduction(state);
    expect(state.entities.filter((e) => e.kind === KIND.WORKER)).toHaveLength(1);
    expect(state.players[0].ore).toBe(0);
  });

  it('charges full price once the player has a Worker again', () => {
    const state = producing(
      [
        {
          id: 1,
          kind: KIND.BASE,
          owner: 0,
          x: 160,
          y: 352,
          state: ENTITY_STATE.BUILDING,
          queuedKind: KIND.WORKER,
          progress: BUILD_TICKS.worker - 1,
        },
        { id: 2, kind: KIND.WORKER, owner: 0, x: 224, y: 352 },
      ],
      [{ ore: COST.worker }, { ore: 0 }],
    );
    runProduction(state);
    expect(state.players[0].ore).toBe(0);
    expect(state.entities.filter((e) => e.kind === KIND.WORKER)).toHaveLength(2);
  });

  it('does not extend the free Worker rule to any other unit', () => {
    const state = producing(
      [
        {
          id: 1,
          kind: KIND.BASE,
          owner: 0,
          x: 160,
          y: 352,
          state: ENTITY_STATE.BUILDING,
          queuedKind: KIND.TROOPER,
          progress: BUILD_TICKS.trooper - 1,
        },
      ],
      [{ ore: 0 }, { ore: 0 }],
    );
    runProduction(state);
    expect(state.entities.filter((e) => e.kind === KIND.TROOPER)).toHaveLength(0);
  });

  it('counts only SURVIVING workers — a dead one does not disqualify the rule', () => {
    const state = producing(
      [
        {
          id: 1,
          kind: KIND.BASE,
          owner: 0,
          x: 160,
          y: 352,
          state: ENTITY_STATE.BUILDING,
          queuedKind: KIND.WORKER,
          progress: BUILD_TICKS.worker - 1,
        },
        { id: 2, kind: KIND.WORKER, owner: 0, x: 224, y: 352, hp: 0, state: ENTITY_STATE.DEAD },
      ],
      [{ ore: 0 }, { ore: 0 }],
    );
    runProduction(state);
    expect(state.entities.filter((e) => e.kind === KIND.WORKER && e.state !== ENTITY_STATE.DEAD)).toHaveLength(1);
  });

  it('does not give the free Worker to the opponent as a side effect', () => {
    const state = producing(
      [
        {
          id: 1,
          kind: KIND.BASE,
          owner: 0,
          x: 160,
          y: 352,
          state: ENTITY_STATE.BUILDING,
          queuedKind: KIND.WORKER,
          progress: BUILD_TICKS.worker - 1,
        },
        { id: 2, kind: KIND.BASE, owner: 1, x: 1120, y: 352 },
        { id: 3, kind: KIND.WORKER, owner: 1, x: 1056, y: 352 },
      ],
      [{ ore: 0 }, { ore: 0 }],
    );
    runProduction(state);
    expect(state.entities.filter((e) => e.kind === KIND.WORKER && e.owner === 0)).toHaveLength(1);
    expect(state.entities.filter((e) => e.kind === KIND.WORKER && e.owner === 1)).toHaveLength(1);
  });
});
