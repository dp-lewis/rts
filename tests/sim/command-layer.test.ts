import { describe, expect, it } from 'vitest';

import { ISSUER, type Command } from '../../src/sim/commands';
import { BUILD_TICKS, COST, TILE_PX } from '../../src/sim/constants';
import { step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, createInitialState, type EntitySeed, type SimState } from '../../src/sim/state';

/**
 * End-to-end through the COMMAND LAYER — the seam the M0–M3 review found unguarded.
 *
 * Every other test in this suite hand-writes its preconditions into simulation
 * state. `runProduction` alone has sixteen tests, and all sixteen set `queuedKind`
 * into a fixture — so not one of them ever asked whether the only real-world
 * producer of that field actually sets it. It did not. The production system was
 * exhaustively verified and completely unreachable: 95% statements, 100% functions,
 * and the entry point to three of them broken.
 *
 * These tests take the player's actual route in: issue a command, step the
 * simulation, assert on the outcome. Nothing is written into state by hand.
 *
 * This matters more from M4 onward, not less — the AI is a second command source,
 * so every one of these paths is about to carry twice the traffic.
 */

function issue(state: SimState, command: Command): SimState {
  return step(state, [command]);
}

function run(state: SimState, ticks: number): SimState {
  let s = state;
  for (let t = 0; t < ticks; t += 1) {
    s = step(s, []);
  }
  return s;
}

function world(entities: readonly EntitySeed[], ore = 5000): SimState {
  return createInitialState({
    seed: 4242,
    difficulty: 1,
    players: [{ ore }, { ore }],
    nodes: [],
    entities,
  });
}

const BASE: EntitySeed = { id: 1, kind: KIND.BASE, owner: 0, x: 160, y: 352 };
/**
 * Combat units train at a Factory, Workers at the Base — product-spec.md line
 * 128, enforced by `canProduce` in step.ts. These fixtures queued Troopers and
 * Tanks on the Base, which is now refused, so the ones that test combat
 * production build here instead.
 */
const FACTORY: EntitySeed = { id: 9, kind: KIND.FACTORY, owner: 0, x: 288, y: 352 };

describe('build commands actually produce units (REV-001)', () => {
  it('queues the requested kind', () => {
    const state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 9, kind: KIND.TROOPER,
    });
    expect(state.entities.find((e) => e.id === 9)!.queuedKind).toBe(KIND.TROOPER);
  });

  it('refuses a combat unit ordered at the Base — that is what a Factory is for', () => {
    // The defect a playtester found as "the factory seems pointless": every build
    // command named the Base, so a placed Factory did nothing at all.
    const state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 1, kind: KIND.TROOPER,
    });
    expect(state.entities.find((e) => e.id === 1)!.queuedKind).toBe(-1);
  });

  it('refuses a Worker ordered at a Factory — the Base is the floor that keeps a player alive', () => {
    // pre-impl F-6: a player with no Workers and no ore can still get one from the
    // Base at zero cost. Routing Workers through a Factory would put that escape
    // hatch behind a structure the player might not have.
    const state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 9, kind: KIND.WORKER,
    });
    expect(state.entities.find((e) => e.id === 9)!.queuedKind).toBe(-1);
  });

  it('produces the unit after its build time and charges for it', () => {
    let state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 9, kind: KIND.TROOPER,
    });
    state = run(state, BUILD_TICKS.trooper + 2);

    const troopers = state.entities.filter((e) => e.kind === KIND.TROOPER);
    expect(troopers).toHaveLength(1);
    expect(troopers[0]!.owner).toBe(0);
    expect(state.players[0].ore).toBe(5000 - COST.trooper);
  });

  it('clears the queue and returns the producer to IDLE afterwards', () => {
    let state = issue(world([BASE]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 1, kind: KIND.WORKER,
    });
    state = run(state, BUILD_TICKS.worker + 2);
    const base = state.entities.find((e) => e.id === 1)!;
    expect(base.queuedKind).toBe(-1);
    expect(base.state).toBe(ENTITY_STATE.IDLE);
  });

  it('produces exactly one unit, not a stream', () => {
    let state = issue(world([BASE]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 1, kind: KIND.WORKER,
    });
    state = run(state, BUILD_TICKS.worker * 4);
    expect(state.entities.filter((e) => e.kind === KIND.WORKER)).toHaveLength(1);
  });

  it('ignores a second build order while one is already in progress', () => {
    let state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 9, kind: KIND.TANK,
    });
    state = issue(state, {
      tick: 1, issuer: ISSUER.PLAYER, seq: 1, type: 'build', builderId: 9, kind: KIND.SCOUT,
    });
    // The Tank order stands; the Scout order is dropped rather than replacing it.
    expect(state.entities.find((e) => e.id === 9)!.queuedKind).toBe(KIND.TANK);
  });

  it('refuses an out-of-range kind instead of poisoning the state (REV-008)', () => {
    // An unchecked `as Kind` cast would give undefined from the cost and
    // build-time tables, making ore NaN and the next hash throw. The whole match
    // would die on a malformed command.
    let state = issue(world([BASE]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 1, kind: 99 as never,
    });
    state = run(state, 50);
    expect(state.entities.find((e) => e.id === 1)!.queuedKind).toBe(-1);
    expect(Number.isFinite(state.players[0].ore)).toBe(true);
    expect(state.players[0].ore).toBe(5000);
  });

  it('refuses to build from a Base that is not yours to command', () => {
    const state = issue(world([BASE, { id: 2, kind: KIND.BASE, owner: 1, x: 1120, y: 352 }]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 2, kind: KIND.TANK,
    });
    expect(state.entities.find((e) => e.id === 2)!.queuedKind).toBe(-1);
  });
});

describe('a build order does not make a Factory rebuild itself (REV-002)', () => {
  const FACTORY: EntitySeed = { id: 2, kind: KIND.FACTORY, owner: 0, x: 416, y: 352 };

  it('an operational Factory produces the ordered unit', () => {
    let state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 2, kind: KIND.TANK,
    });
    state = run(state, BUILD_TICKS.tank + 2);
    expect(state.entities.filter((e) => e.kind === KIND.TANK)).toHaveLength(1);
  });

  it('an operational Factory never re-enters its own construction', () => {
    let state = issue(world([BASE, FACTORY]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'build', builderId: 2, kind: KIND.TANK,
    });
    for (let t = 0; t < BUILD_TICKS.tank + 2; t += 1) {
      state = step(state, []);
      const factory = state.entities.find((e) => e.id === 2)!;
      // While producing, `queuedKind` must stay set — that is exactly what
      // distinguishes "building a Tank" from "building myself".
      if (factory.state === ENTITY_STATE.BUILDING) {
        expect(factory.queuedKind).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('move commands move units (REV-003)', () => {
  const TROOPER: EntitySeed = { id: 1, kind: KIND.TROOPER, owner: 0, x: 2 * TILE_PX + 32, y: 5 * TILE_PX + 32 };

  it('records the destination', () => {
    const state = issue(world([TROOPER]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [1], x: 800, y: 352,
    });
    const unit = state.entities.find((e) => e.id === 1)!;
    expect(unit.destX).toBe(800);
    expect(unit.destY).toBe(352);
  });

  it('actually arrives', () => {
    let state = issue(world([TROOPER]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [1], x: 800, y: 352,
    });
    state = run(state, 400);
    const unit = state.entities.find((e) => e.id === 1)!;
    expect(Math.abs(unit.x - 800)).toBeLessThan(TILE_PX);
    expect(Math.abs(unit.y - 352)).toBeLessThan(TILE_PX);
  });

  it('moves every unit named in one order', () => {
    let state = issue(
      world([TROOPER, { id: 2, kind: KIND.TROOPER, owner: 0, x: 2 * TILE_PX + 32, y: 6 * TILE_PX + 32 }]),
      { tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [1, 2], x: 800, y: 352 },
    );
    state = run(state, 400);
    for (const id of [1, 2]) {
      expect(state.entities.find((e) => e.id === id)!.x).toBeGreaterThan(700);
    }
  });

  it('cancels a worker\'s gather order — an explicit order outranks the loop', () => {
    let state = createInitialState({
      seed: 1, difficulty: 1, players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 416, y: 352, remaining: 900 }],
      entities: [BASE, { id: 2, kind: KIND.WORKER, owner: 0, x: 224, y: 352 }],
    });
    state = run(state, 5);
    expect(state.entities.find((e) => e.id === 2)!.gatherNodeId).toBe(0);

    state = step(state, [{ tick: state.tick, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [2], x: 1000, y: 96 }]);
    expect(state.entities.find((e) => e.id === 2)!.gatherNodeId).toBe(-1);
  });

  it('refuses to move a unit that is not yours', () => {
    const state = issue(world([TROOPER, { id: 2, kind: KIND.TROOPER, owner: 1, x: 1000, y: 352 }]), {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [2], x: 200, y: 200,
    });
    expect(state.entities.find((e) => e.id === 2)!.destX).toBe(-1);
  });
});

describe('units respect obstacles when routing (REV-004)', () => {
  /** A wall of Factories across column 10, with a single gap at row 5. */
  const wall: EntitySeed[] = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10].map((cy) => ({
    id: 100 + cy, kind: KIND.FACTORY, owner: 1, x: 10 * TILE_PX + 32, y: cy * TILE_PX + 32,
  }));

  it('routes around a wall rather than through it', () => {
    let state = world([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 2 * TILE_PX + 32, y: 1 * TILE_PX + 32 },
      ...wall,
    ]);
    state = issue(state, {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [1], x: 18 * TILE_PX + 32, y: 1 * TILE_PX + 32,
    });

    let breached = false;
    for (let t = 0; t < 900; t += 1) {
      state = step(state, []);
      const u = state.entities.find((e) => e.id === 1)!;
      const cx = Math.floor(u.x / TILE_PX);
      const cy = Math.floor(u.y / TILE_PX);
      if (cx === 10 && cy !== 5) {
        breached = true;
      }
    }
    expect(breached).toBe(false);
  });

  it('a worker returning to a blocked Base cell does not cut through structures', () => {
    // The case that fires constantly in a real match: Base cells are blocked, so
    // every single deposit trip took the straight-line fallback.
    let state = createInitialState({
      seed: 1, difficulty: 1, players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: 18 * TILE_PX + 32, y: 1 * TILE_PX + 32, remaining: 900 }],
      entities: [
        { id: 1, kind: KIND.BASE, owner: 0, x: 1 * TILE_PX + 32, y: 1 * TILE_PX + 32 },
        { id: 2, kind: KIND.WORKER, owner: 0, x: 2 * TILE_PX + 32, y: 1 * TILE_PX + 32 },
        ...wall,
      ],
    });

    let breached = false;
    for (let t = 0; t < 1500; t += 1) {
      state = step(state, []);
      const w = state.entities.find((e) => e.id === 2)!;
      const cx = Math.floor(w.x / TILE_PX);
      const cy = Math.floor(w.y / TILE_PX);
      if (cx === 10 && cy !== 5) {
        breached = true;
      }
    }
    expect(breached).toBe(false);
  });

  it('a unit ordered somewhere unreachable stays put rather than walking into the wall', () => {
    // A sealed pocket: no gap at all.
    const sealed: EntitySeed[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((cy) => ({
      id: 200 + cy, kind: KIND.FACTORY, owner: 1, x: 10 * TILE_PX + 32, y: cy * TILE_PX + 32,
    }));
    let state = world([
      { id: 1, kind: KIND.TROOPER, owner: 0, x: 2 * TILE_PX + 32, y: 5 * TILE_PX + 32 },
      ...sealed,
    ]);
    state = issue(state, {
      tick: 0, issuer: ISSUER.PLAYER, seq: 0, type: 'move', units: [1], x: 18 * TILE_PX + 32, y: 5 * TILE_PX + 32,
    });
    state = run(state, 400);
    const u = state.entities.find((e) => e.id === 1)!;
    expect(Math.floor(u.x / TILE_PX)).toBeLessThan(10);
  });
});
