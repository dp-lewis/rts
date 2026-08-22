import type { Command } from './commands';
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

/**
 * Entity kinds.
 *
 * `3` is RETIRED and must never be reused. It was the Scout, dropped when the
 * tech tree arrived — round-1 playtesters found it purposeless, and with Trooper
 * behind a Barracks and Tank behind a Factory it had no rung of its own. Leaving
 * the slot empty rather than renumbering means an old recorded corpus case
 * carrying `"kind": 3` FAILS loudly instead of being silently reinterpreted as
 * some other unit, which is what renumbering into the gap would have caused.
 */
export const KIND = {
  BASE: 0,
  FACTORY: 1,
  WORKER: 2,
  // 3 — retired (was SCOUT). Do not reuse.
  TROOPER: 4,
  TANK: 5,
  BARRACKS: 6,
} as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

/**
 * Structures block movement, are placed rather than queued, carry no ownership
 * ring, and never jitter.
 *
 * One function because the test was written out longhand as
 * `kind === BASE || kind === FACTORY` in five places, and adding the Barracks
 * meant finding all five. The one in `gridFor` would have been the expensive
 * miss: a structure absent from the passability grid is a building units walk
 * straight through.
 */
export function isStructureKind(kind: number): boolean {
  return kind === KIND.BASE || kind === KIND.FACTORY || kind === KIND.BARRACKS;
}

export const ENTITY_STATE = {
  IDLE: 0,
  MOVING: 1,
  GATHERING: 2,
  ATTACKING: 3,
  /** Producing something else — `queuedKind` says what. */
  BUILDING: 4,
  DEAD: 5,
  /**
   * This structure is itself being built and is not yet operational.
   *
   * Distinct from BUILDING on purpose. The two used to be told apart by
   * `queuedKind === -1`, which meant a Factory handed a build order it failed to
   * record fell into "building myself" and re-ran its own construction. One
   * field with two meanings, distinguishable only by which system wrote last —
   * the same shape as the `targetId` bug ADR-001 Amendment 4 fixed.
   */
  UNDER_CONSTRUCTION: 6,
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
  /**
   * The enemy ENTITY this unit is fighting; -1 for none. Never null.
   *
   * Combat owns this field exclusively. It used to double as the worker's ore
   * node too, which worked right up until combat existed — `acquireTargets`
   * then cleared it every tick for any worker with no enemy nearby, silently
   * cancelling the gather order. Two id spaces in one field is the bug; see
   * `gatherNodeId`.
   */
  targetId: number;
  /** The ore NODE this worker is working; -1 for none. Economy owns it. */
  gatherNodeId: number;
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
  /**
   * What this producer is currently building; -1 for nothing.
   *
   * Ore is spent on COMPLETION, not when the item is queued. That is what makes
   * O-5 a real hazard — two Factories finishing on one tick with ore for only one
   * — and resolving it in ascending entity id order, with the loser staying
   * queued rather than failing, is the rule.
   */
  queuedKind: number;
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

/** Same idea for players: ore is the only thing a caller ever needs to set. */
export type PlayerSeed = Partial<PlayerState> & Pick<PlayerState, 'ore'>;

export interface OreNode {
  id: number;
  x: number;
  y: number;
  remaining: number;
}

export interface PlayerState {
  ore: number;
  /**
   * An owned entity took damage from an enemy this tick (FR-023). Reset every
   * tick by the damage stage.
   */
  underAttack: boolean;
  /**
   * A Base took sudden-death damage this tick (FR-033, CR-001). Deliberately
   * SEPARATE from `underAttack`: a Base dying to the backstop has no attacker,
   * and reporting it as "under attack" would send the player looking for an
   * enemy that is not there.
   */
  suddenDeathDamage: boolean;
}

export interface SimState {
  tick: number;
  /** mulberry32 state — inside the state, never a module singleton. */
  rng: number;
  difficulty: Difficulty;
  verdict: Verdict;
  players: [PlayerState, PlayerState];
  /**
   * The tick sudden death armed on, or -1 while it has not (CR-001). Stored
   * rather than recomputed because the grace period and the damage ramp are both
   * measured from it, and "when did every node run dry" is not recoverable from a
   * later state.
   */
  suddenDeathAt: number;
  /** Sorted by id, ascending. */
  nodes: OreNode[];
  /** Sorted by id, ascending — O-7. */
  entities: Entity[];
  nextEntityId: number;
  /**
   * Commands the AI has scheduled for a future tick.
   *
   * Player intent enters as commands queued ahead of time (FR-004); the AI is held
   * to the same rule, so it cannot act with less latency than a human can. Those
   * commands have to survive from the tick that decided them to the tick that
   * applies them, and `step` is pure — so they live here.
   */
  pending: Command[];
  /**
   * The AI's monotonic per-issuer command counter — the `seq` half of O-4's
   * `(issuer, seq)` ordering. Held in state rather than a module counter so that
   * `aiThink` stays a pure function of state and two simulations in one process
   * cannot interleave their sequence numbers.
   */
  aiSeq: number;
}

export interface SimInit {
  seed: number;
  difficulty: Difficulty;
  players?: [PlayerSeed, PlayerSeed];
  nodes?: readonly OreNode[];
  entities?: readonly EntitySeed[];
}

const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id;

const DEFAULT_HP: Record<Kind, number> = {
  [KIND.BASE]: MAX_HP.base,
  [KIND.FACTORY]: MAX_HP.factory,
  [KIND.BARRACKS]: MAX_HP.barracks,
  [KIND.WORKER]: MAX_HP.worker,
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
    queuedKind: seed.queuedKind ?? -1,
    gatherNodeId: seed.gatherNodeId ?? -1,
  };
}

function hydratePlayer(seed: PlayerSeed): PlayerState {
  return {
    ore: seed.ore,
    underAttack: seed.underAttack ?? false,
    suddenDeathDamage: seed.suddenDeathDamage ?? false,
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
    suddenDeathAt: -1,
    players: init.players
      ? [hydratePlayer(init.players[0]), hydratePlayer(init.players[1])]
      : [hydratePlayer({ ore: STARTING_ORE }), hydratePlayer({ ore: STARTING_ORE })],
    nodes,
    entities,
    nextEntityId,
    pending: [],
    aiSeq: 0,
  };
}

/** A structural clone deep enough that `step` can stay pure without a library. */
export function cloneState(state: SimState): SimState {
  return {
    tick: state.tick,
    rng: state.rng,
    difficulty: state.difficulty,
    verdict: state.verdict,
    suddenDeathAt: state.suddenDeathAt,
    players: [{ ...state.players[0] }, { ...state.players[1] }],
    nodes: state.nodes.map((n) => ({ ...n })),
    entities: state.entities.map((e) => ({ ...e })),
    nextEntityId: state.nextEntityId,
    // Commands are treated as immutable once issued, so a shallow copy of the
    // array is enough — nothing mutates a Command in place.
    pending: [...state.pending],
    aiSeq: state.aiSeq,
  };
}
