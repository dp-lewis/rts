import { ISSUER, type Command } from './commands';
import { COST } from './constants';
import { openCellNear } from './production';
import { nextIntRng } from './rng';
import { ENTITY_STATE, KIND, VERDICT, type Difficulty, type Entity, type Kind, type SimState } from './state';

/**
 * The opponent — FR-002, FR-029.
 *
 * Three rules shape everything here, and all three are constitutional rather than
 * stylistic:
 *
 *  1. **It draws only from the simulation PRNG.** `Math.random` is banned by lint
 *     in `src/sim/`, but the deeper point is that an opponent whose choices are not
 *     in the replay is an opponent whose match cannot be reproduced. M4 is the
 *     first milestone in which `step()` consumes the RNG at all.
 *  2. **It issues COMMANDS, scheduled for a future tick** — the same route the
 *     player's intent takes (FR-004). It gets no privileged access to the
 *     simulation and no lower latency than a human.
 *  3. **Difficulty is a field, never folded into the seed** (FR-029), so "same
 *     seed, different difficulty" is a legitimate comparison and a replay carries
 *     difficulty in its header rather than inferring it.
 *
 * The AI plays player 1. There is no second AI: this is a single-player game, and
 * an unattended match is simply one where player 0 never issues a command.
 */

interface Profile {
  /** How often it re-plans. The cheapest difficulty lever there is. */
  decideEveryTicks: number;
  workerTarget: number;
  armyTarget: number;
  /** Army size at which it commits to an attack. */
  attackAt: number;
  /** Army size at which it stops training and banks for the next tech tier. */
  expandAt: number;
}

const PROFILE: Record<Difficulty, Profile> = {
  // expandAt 99 is deliberate: the easiest opponent never techs to Tanks, which
  // is most of what makes "New to this" winnable for a first-time player.
  0: { decideEveryTicks: 80, workerTarget: 3, armyTarget: 4, attackAt: 4, expandAt: 99 },
  1: { decideEveryTicks: 45, workerTarget: 4, armyTarget: 8, attackAt: 5, expandAt: 3 },
  2: { decideEveryTicks: 25, workerTarget: 6, armyTarget: 14, attackAt: 5, expandAt: 2 },
};

/** Combat unit costs, for affordability checks. */
const COMBAT_COST: Record<number, number> = {
  [KIND.TROOPER]: COST.trooper,
  [KIND.TANK]: COST.tank,
};

const AI_OWNER = 1;
const HUMAN_OWNER = 0;

function isAlive(entity: Entity): boolean {
  return entity.state !== ENTITY_STATE.DEAD && entity.hp > 0;
}

/**
 * The Factory this side trains at — lowest id first, and an idle one preferred.
 *
 * Deterministic by id like every other tie-break in the simulation (O-1, O-5):
 * "whichever factory" would make the AI's output depend on array order.
 */
/**
 * Does this side have one of these buildings, INCLUDING one still going up?
 *
 * `producerOf` deliberately ignores under-construction buildings — they cannot
 * train anything yet. Using it to decide whether to BUILD one meant the answer
 * stayed "no" for the whole construction time, so the AI queued another every
 * decision tick and finished with two Factories it had paid for separately.
 */
function hasStructure(state: SimState, owner: number, kind: number): boolean {
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.kind === kind && entity.owner === owner && isAlive(entity)) {
      return true;
    }
  }
  return false;
}

function producerOf(state: SimState, owner: number, kind: number): Entity | undefined {
  let busy: Entity | undefined;
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (
      entity.kind !== kind ||
      entity.owner !== owner ||
      !isAlive(entity) ||
      entity.state === ENTITY_STATE.UNDER_CONSTRUCTION
    ) {
      continue;
    }
    if (entity.queuedKind < 0) {
      return entity;
    }
    busy ??= entity;
  }
  return busy;
}

function baseOf(state: SimState, owner: number): Entity | undefined {
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.kind === KIND.BASE && entity.owner === owner && isAlive(entity)) {
      return entity;
    }
  }
  return undefined;
}

interface Plan {
  commands: Command[];
  /** The generator state after every draw this plan made. */
  rng: number;
}

/**
 * Pure. Given a state, what the AI decides — including the PRNG state it would
 * leave behind. Nothing is mutated, so calling it twice on one state gives
 * identical answers, which is what lets tests inspect the AI's intent without
 * advancing the match.
 */
function plan(state: SimState): Plan {
  const empty: Plan = { commands: [], rng: state.rng };

  if (state.verdict !== VERDICT.NONE) {
    return empty;
  }

  const profile = PROFILE[state.difficulty];
  if (state.tick % profile.decideEveryTicks !== 0) {
    return empty;
  }

  const base = baseOf(state, AI_OWNER);
  if (base === undefined) {
    return empty;
  }

  let workers = 0;
  const army: Entity[] = [];
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.owner !== AI_OWNER || !isAlive(entity)) {
      continue;
    }
    if (entity.kind === KIND.WORKER) {
      workers += 1;
    } else if (entity.kind !== KIND.BASE && entity.kind !== KIND.FACTORY) {
      army.push(entity);
    }
  }

  const commands: Command[] = [];
  // `seq` advances per command issued. It is the tie-break half of O-4, so it must
  // be strictly increasing within an issuer and must not restart between ticks —
  // which is why it counts up from the state's own counter rather than from zero.
  let seq = state.aiSeq;
  let rng = state.rng;
  // Scheduled for the NEXT tick, never this one — the AI queues intent exactly
  // as a player does.
  const tick = state.tick + 1;

  // Workers train at the Base; combat units train at a Factory. Both sides are
  // held to the same rule — `canProduce` in step.ts enforces it, so an AI that
  // ignored it would simply have its commands dropped and never field an army.
  if (
    workers < profile.workerTarget &&
    base.queuedKind < 0 &&
    base.state !== ENTITY_STATE.UNDER_CONSTRUCTION
  ) {
    commands.push({ tick, issuer: ISSUER.AI, seq, type: 'build', builderId: base.id, kind: KIND.WORKER });
    seq += 1;
  } else if (workers >= profile.workerTarget && army.length < profile.armyTarget) {
    // The tech tree, walked in cost order. A match now starts with a Base and
    // nothing else, so the opponent has to build its way up exactly as the player
    // does — Barracks first because it is cheaper and sooner, Factory second.
    const barracks = producerOf(state, AI_OWNER, KIND.BARRACKS);
    const factory = producerOf(state, AI_OWNER, KIND.FACTORY);
    const ore = state.players[AI_OWNER]!.ore;

    if (!hasStructure(state, AI_OWNER, KIND.BARRACKS)) {
      seq = placeStructure(state, commands, base, KIND.BARRACKS, COST.barracks, tick, seq);
    } else if (!hasStructure(state, AI_OWNER, KIND.FACTORY) && army.length >= profile.expandAt) {
      // SAVE for the Factory rather than requiring the ore to be spare.
      //
      // The first version gated on `ore >= factory + trooper`, which the AI never
      // once reached: it spends on Troopers as fast as it mines, so the balance
      // never accumulates. Measured over three seeds it built zero Factories and
      // zero Tanks — the top of the tech tree was unreachable for the opponent,
      // which is REV-007's shape in a new place. Once it has an army worth
      // defending with, it stops training and banks for the next tier.
      seq = placeStructure(state, commands, base, KIND.FACTORY, COST.factory, tick, seq);
    } else {
      // Choose among what it can actually afford AND has the building for, and
      // choose randomly so the opponent is not perfectly predictable across
      // matches. This is the AI's only draw, and it comes from the simulation's
      // own generator — so the choice is recorded in the replay like everything
      // else.
      const options: { kind: Kind; producer: Entity }[] = [];
      if (barracks !== undefined && barracks.queuedKind < 0 && COMBAT_COST[KIND.TROOPER]! <= ore) {
        options.push({ kind: KIND.TROOPER, producer: barracks });
      }
      if (factory !== undefined && factory.queuedKind < 0 && COMBAT_COST[KIND.TANK]! <= ore) {
        options.push({ kind: KIND.TANK, producer: factory });
      }
      if (options.length > 0) {
        const draw = nextIntRng(rng, options.length);
        rng = draw.state;
        const chosen = options[draw.value]!;
        commands.push({
          tick,
          issuer: ISSUER.AI,
          seq,
          type: 'build',
          builderId: chosen.producer.id,
          kind: chosen.kind,
        });
        seq += 1;
      }
    }
  }

  if (army.length >= profile.attackAt) {
    const target = baseOf(state, HUMAN_OWNER);
    if (target !== undefined) {
      // One order for the whole army, so it arrives together rather than
      // trickling in and dying piecemeal. Ids are already in ascending order
      // because `state.entities` is (O-7).
      commands.push({
        tick,
        issuer: ISSUER.AI,
        seq,
        type: 'move',
        units: army.map((unit) => unit.id),
        x: target.x,
        y: target.y,
      });
    }
  }

  return { commands, rng };
}

/**
 * Queue a structure placement beside the Base, if there is room and ore for it.
 * Returns the next `seq`.
 */
function placeStructure(
  state: SimState,
  commands: Command[],
  base: Entity,
  kind: Kind,
  cost: number,
  tick: number,
  seq: number,
): number {
  if (state.players[base.owner]!.ore < cost) {
    return seq;
  }
  const spot = openCellNear(state, base);
  if (spot === undefined) {
    return seq;
  }
  commands.push({
    tick,
    issuer: ISSUER.AI,
    seq,
    type: 'place',
    builderId: base.id,
    kind,
    x: spot.x,
    y: spot.y,
  });
  return seq + 1;
}

/** What the AI would decide, without advancing anything. */
export function aiThink(state: SimState): Command[] {
  return plan(state).commands;
}

/**
 * Stage 2 of the tick. Commits the plan: advances the PRNG by exactly the draws
 * the plan made, bumps the per-issuer sequence counter, and queues the commands
 * for a future tick.
 */
export function runAi(state: SimState): void {
  const decided = plan(state);
  state.rng = decided.rng;
  state.aiSeq += decided.commands.length;
  for (let i = 0; i < decided.commands.length; i += 1) {
    state.pending.push(decided.commands[i]!);
  }
}
