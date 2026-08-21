import { MAX_HP, STARTING_ORE } from './constants';
import { seedRng } from './rng';

/**
 * Simulation state shapes.
 *
 * Two decisions here exist purely to serve determinism, and both look like
 * over-specification until the first divergence:
 *
 *  - **Collections are arrays kept sorted by id** (O-7). Traversal is index
 *    order, so "iterate in id order" is the natural thing to write rather than a
 *    discipline to remember. A Map would make insertion order observable.
 *  - **Sentinels, never optionals.** `targetId: -1` rather than `null`, fixed
 *    length players rather than a lookup. Every field is always present and
 *    always a number, so the hash encoding has no branches and no absent case.
 */

export const KIND = {
  BASE: 0,
  FACTORY: 1,
  WORKER: 2,
  SCOUT: 3,
  TROOPER: 4,
  TANK: 5,
} as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

export const ENTITY_STATE = {
  IDLE: 0,
  MOVING: 1,
  GATHERING: 2,
  ATTACKING: 3,
  BUILDING: 4,
  DEAD: 5,
} as const;
export type EntityState = (typeof ENTITY_STATE)[keyof typeof ENTITY_STATE];

export const VERDICT = { NONE: 0, VICTORY: 1, DEFEAT: 2, DRAW: 3 } as const;
export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

/** Player id IS the array index, so there is no lookup and no player-ordering hazard. */
export type Owner = 0 | 1;

/** FR-029: difficulty is a field, never folded into the seed. */
export type Difficulty = 0 | 1 | 2;

export interface Entity {
  id: number;
  kind: Kind;
  owner: Owner;
  /** World px, doubles, hashed as exact IEEE-754 bits. */
  x: number;
  y: number;
  hp: number;
  state: EntityState;
  /** -1 means none. Never null. */
  targetId: number;
  cooldown: number;
  progress: number;
  /**
   * Move destination in world px; -1 on both axes means "no destination".
   *
   * There is deliberately no stored path. Units do not collide in v1 (pre-impl
   * review F-2) and the grid is static, so a path is a pure function of
   * (current cell, goal cell, grid) — recomputable from hashed state at any
   * time. Over a ~20x11 map that is microseconds, so storing one would be a
   * cache that can drift from its source for no gain, which is exactly what
   * ADR-001 warns against.
   *
   * 0 is a legal coordinate, so the sentinel is -1 rather than 0 or null.
   */
  destX: number;
  destY: number;
}

/**
 * What a caller supplies when seeding a simulation. Identity and position are
 * required; everything else defaults.
 *
 * This exists so that adding a field to `Entity` does not break every fixture
 * and every corpus case at once — a lesson from adding `destX`/`destY` in M2,
 * which would otherwise have touched a dozen literal constructions.
 */
export type EntitySeed = Pick<Entity, 'id' | 'kind' | 'owner' | 'x' | 'y'> &
  Partial<Omit<Entity, 'id' | 'kind' | 'owner' | 'x' | 'y'>>;

export interface OreNode {
  id: number;
  x: number;
  y: number;
  remaining: number;
}

export interface PlayerState {
  ore: number;
}

export interface SimState {
  tick: number;
  /** mulberry32 state — inside the state, never a module singleton. */
  rng: number;
  difficulty: Difficulty;
  verdict: Verdict;
  players: [PlayerState, PlayerState];
  /** Sorted by id, ascending. */
  nodes: OreNode[];
  /** Sorted by id, ascending — O-7. */
  entities: Entity[];
  nextEntityId: number;
}

export interface SimInit {
  seed: number;
  difficulty: Difficulty;
  players?: [PlayerState, PlayerState];
  nodes?: readonly OreNode[];
  entities?: readonly EntitySeed[];
}

const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id;

const DEFAULT_HP: Record<Kind, number> = {
  [KIND.BASE]: MAX_HP.base,
  [KIND.FACTORY]: MAX_HP.factory,
  [KIND.WORKER]: MAX_HP.worker,
  [KIND.SCOUT]: MAX_HP.scout,
  [KIND.TROOPER]: MAX_HP.trooper,
  [KIND.TANK]: MAX_HP.tank,
};

function hydrate(seed: EntitySeed): Entity {
  return {
    id: seed.id,
    kind: seed.kind,
    owner: seed.owner,
    x: seed.x,
    y: seed.y,
    hp: seed.hp ?? DEFAULT_HP[seed.kind],
    state: seed.state ?? ENTITY_STATE.IDLE,
    targetId: seed.targetId ?? -1,
    cooldown: seed.cooldown ?? 0,
    progress: seed.progress ?? 0,
    destX: seed.destX ?? -1,
    destY: seed.destY ?? -1,
  };
}

/**
 * Build a fresh simulation state.
 *
 * Sorting happens exactly once, here at construction. Everything downstream may
 * then assume id order without re-sorting — and crucially, without sorting at
 * hash time, which would mask precisely the ordering bugs the hash exists to
 * find.
 */
export function createInitialState(init: SimInit): SimState {
  const entities = (init.entities ?? []).map(hydrate).sort(byId);
  const nodes = (init.nodes ?? []).map((n) => ({ ...n })).sort(byId);

  let nextEntityId = 1;
  for (let i = 0; i < entities.length; i += 1) {
    const id = entities[i]!.id;
    if (id >= nextEntityId) {
      nextEntityId = id + 1;
    }
  }

  return {
    tick: 0,
    rng: seedRng(init.seed),
    difficulty: init.difficulty,
    verdict: VERDICT.NONE,
    players: init.players
      ? [{ ore: init.players[0].ore }, { ore: init.players[1].ore }]
      : [{ ore: STARTING_ORE }, { ore: STARTING_ORE }],
    nodes,
    entities,
    nextEntityId,
  };
}

/** A structural clone deep enough that `step` can stay pure without a library. */
export function cloneState(state: SimState): SimState {
  return {
    tick: state.tick,
    rng: state.rng,
    difficulty: state.difficulty,
    verdict: state.verdict,
    players: [{ ore: state.players[0].ore }, { ore: state.players[1].ore }],
    nodes: state.nodes.map((n) => ({ ...n })),
    entities: state.entities.map((e) => ({ ...e })),
    nextEntityId: state.nextEntityId,
  };
}
