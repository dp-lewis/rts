import { ISSUER, type Command } from './commands';
import { COST } from './constants';
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
}

const PROFILE: Record<Difficulty, Profile> = {
  0: { decideEveryTicks: 80, workerTarget: 3, armyTarget: 4, attackAt: 4 },
  1: { decideEveryTicks: 45, workerTarget: 4, armyTarget: 8, attackAt: 5 },
  2: { decideEveryTicks: 25, workerTarget: 6, armyTarget: 14, attackAt: 5 },
};

/** Combat units the AI will consider, cheapest first so a poor AI still fields something. */
const COMBAT_KINDS: readonly Kind[] = [KIND.SCOUT, KIND.TROOPER, KIND.TANK];
const COMBAT_COST: Record<number, number> = {
  [KIND.SCOUT]: COST.scout,
  [KIND.TROOPER]: COST.trooper,
  [KIND.TANK]: COST.tank,
};

const AI_OWNER = 1;
const HUMAN_OWNER = 0;

function isAlive(entity: Entity): boolean {
  return entity.state !== ENTITY_STATE.DEAD && entity.hp > 0;
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

  if (base.queuedKind < 0 && base.state !== ENTITY_STATE.UNDER_CONSTRUCTION) {
    if (workers < profile.workerTarget) {
      commands.push({ tick, issuer: ISSUER.AI, seq, type: 'build', builderId: base.id, kind: KIND.WORKER });
      seq += 1;
    } else if (army.length < profile.armyTarget) {
      // Choose among what it can actually afford, and choose randomly so the
      // opponent is not perfectly predictable across matches. This is the AI's
      // only draw, and it comes from the simulation's own generator — so the
      // choice is recorded in the replay like everything else.
      const affordable = COMBAT_KINDS.filter((kind) => COMBAT_COST[kind]! <= state.players[AI_OWNER]!.ore);
      if (affordable.length > 0) {
        const draw = nextIntRng(rng, affordable.length);
        rng = draw.state;
        commands.push({
          tick,
          issuer: ISSUER.AI,
          seq,
          type: 'build',
          builderId: base.id,
          kind: affordable[draw.value]!,
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
