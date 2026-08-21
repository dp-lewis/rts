import { sortCommands, type Command } from './commands';
import { acquireTargets, applyDamage, collectDamage } from './combat';
import { ARRIVE_EPSILON, MAP_TILES_X, MAP_TILES_Y, SPEED } from './constants';
import { runEconomy } from './economy';
import { runProduction } from './production';
import { armSuddenDeath, resolveVictory, suddenDeathDamage } from './victory';
import { cellCentreX, cellCentreY, cellOf, createGrid, isPassable, type Grid } from './grid';
import { findPath } from './pathfind';
import { ENTITY_STATE, KIND, cloneState, type Entity, type SimState } from './state';

/**
 * The tick function — `step(state, commands) → state`, pure.
 *
 * ── Scope in M1 ───────────────────────────────────────────────────────────────
 * This is the pipeline SKELETON. Stage 1 (apply commands) and stage 10 (advance
 * tick) are real; stages 2–9 are declared, ordered, and empty, because none of
 * the systems they call exist yet. Each is filled in by the milestone that owns
 * it, and the stage list stays exactly as it is.
 *
 * The order is part of the contract, not an implementation detail. Moving combat
 * before movement, or resolving victory before damage lands, changes the outcome
 * of thousands of matches. `STAGES` is asserted in tests so that reordering is a
 * visible, deliberate diff rather than something that drifts while adding a
 * system.
 */
export const STAGES = [
  'applyCommands', //        1 — sorted by (issuer, seq)                    O-4
  'aiThink', //              2 — emits commands for tick+1; uses sim RNG     M4
  'economy', //              3 — gather, deposit, deplete nodes                 O-3
  'production', //           4 — advance queues, spend ore                      O-5
  'movement', //             5 — pathfind + step positions                      O-2
  'combatAcquire', //        6 — choose targets                                 O-1
  'combatCollectDamage', //  7 — accumulate, do NOT apply
  'combatApplyDamage', //    8 — atomic, end of tick                            O-6
  'victoryResolve', //       9 — win / lose / draw; sudden death         FR-017/028
  'advanceTick', //         10
] as const;

function findEntity(entities: readonly Entity[], id: number): Entity | undefined {
  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i]!;
    if (entity.id === id) {
      return entity;
    }
  }
  return undefined;
}

/**
 * Stage 1. Commands are applied in canonical `(issuer, seq)` order, never in
 * arrival order.
 */
function applyCommands(state: SimState, commands: readonly Command[]): void {
  const ordered = sortCommands(commands);

  for (let i = 0; i < ordered.length; i += 1) {
    const command = ordered[i]!;

    // FR-004 / TC-UNIT-008: a command takes effect on ITS tick, not whenever it
    // is handed over. Enforced here rather than trusted to the caller — every
    // caller filters correctly today, and that is exactly the kind of invariant
    // that holds until the one place that forgets.
    if (command.tick !== state.tick) {
      continue;
    }

    switch (command.type) {
      case 'attack': {
        for (let u = 0; u < command.units.length; u += 1) {
          const unit = findEntity(state.entities, command.units[u]!);
          if (unit === undefined || unit.state === ENTITY_STATE.DEAD) {
            continue;
          }
          unit.targetId = command.targetId;
          unit.state = ENTITY_STATE.ATTACKING;
        }
        break;
      }

      case 'build': {
        const builder = findEntity(state.entities, command.builderId);
        if (builder === undefined || builder.state === ENTITY_STATE.DEAD) {
          break;
        }
        builder.state = ENTITY_STATE.BUILDING;
        builder.progress = 0;
        break;
      }

      case 'move': {
        // Deliberately unhandled in M1, and deliberately explicit rather than a
        // silent default. An Entity has no destination field — plan.md's data
        // model and ADR-001's hashed field list both omit one — so a move order
        // has nowhere to be recorded. Inventing `destX`/`destY` here would add a
        // field to the hash ahead of the milestone that owns movement, and every
        // corpus hash recorded in between would go stale the moment M2 changed
        // it. M2 decides the field and amends ADR-001 in the same change.
        break;
      }
    }
  }
}

/** Speed in world px per tick, by kind. Structures do not move. */
function speedOf(entity: Entity): number {
  switch (entity.kind) {
    case KIND.WORKER:
      return SPEED.worker;
    case KIND.SCOUT:
      return SPEED.scout;
    case KIND.TROOPER:
      return SPEED.trooper;
    case KIND.TANK:
      return SPEED.tank;
    default:
      return 0;
  }
}

/**
 * The passability grid, rebuilt from hashed state every tick.
 *
 * Derived, therefore never stored and never hashed — ADR-001 is explicit that a
 * cached value which can drift from its source is itself the bug. Rebuilding a
 * 220-cell boolean array per tick costs nothing measurable and removes the
 * question entirely.
 */
function gridFor(state: SimState): Grid {
  const bare = createGrid(MAP_TILES_X, MAP_TILES_Y, []);
  const blocked: number[] = [];
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.state === ENTITY_STATE.DEAD) {
      continue;
    }
    if (entity.kind === KIND.BASE || entity.kind === KIND.FACTORY) {
      blocked.push(cellOf(bare, entity.x, entity.y));
    }
  }
  return createGrid(MAP_TILES_X, MAP_TILES_Y, blocked);
}

/**
 * Stage 5. Steps every entity that has a destination one tick along its path.
 *
 * The path is recomputed from the unit's CURRENT cell each tick rather than
 * stored (ADR-001 Amendment 2). Because the grid is static and the tie-break is
 * total, recomputing yields the suffix of the same path, so a unit does not
 * wander — and there is no cached path to drift from the position it was computed
 * for.
 */
function runMovement(state: SimState, grid: Grid): void {
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.state === ENTITY_STATE.DEAD || entity.destX < 0 || entity.destY < 0) {
      continue;
    }

    const speed = speedOf(entity);
    if (speed === 0) {
      continue;
    }

    const goalCell = cellOf(grid, entity.destX, entity.destY);
    const fromCell = cellOf(grid, entity.x, entity.y);

    // A destination inside a blocked cell (a Base, say) is normal: workers are
    // sent AT the Base to deposit, not into it. Walk to the cell edge and let the
    // range check in economy do the rest.
    let targetX = entity.destX;
    let targetY = entity.destY;

    if (fromCell !== goalCell) {
      const path = isPassable(grid, goalCell) ? findPath(grid, fromCell, goalCell, entity.id) : [];
      const nextCell = path[0];
      if (nextCell !== undefined) {
        targetX = cellCentreX(grid, nextCell);
        targetY = cellCentreY(grid, nextCell);
      }
    }

    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared <= ARRIVE_EPSILON * ARRIVE_EPSILON) {
      entity.x = targetX;
      entity.y = targetY;
      continue;
    }

    // sqrt is correctly rounded under IEEE 754, so it is safe here (Constitution I
    // bans the transcendentals, not sqrt). Distance COMPARISONS still use squares.
    const distance = Math.sqrt(distanceSquared);
    if (distance <= speed) {
      entity.x = targetX;
      entity.y = targetY;
    } else {
      entity.x += (dx / distance) * speed;
      entity.y += (dy / distance) * speed;
    }
  }
}

export function step(state: SimState, commands: readonly Command[]): SimState {
  const next = cloneState(state);

  applyCommands(next, commands); //    1
  //                                   2  aiThink — M4
  runEconomy(next); //                 3
  runProduction(next); //              4
  runMovement(next, gridFor(next)); // 5
  acquireTargets(next); //             6

  // 7 and 8 are one decision split in two on purpose. Everything that fires is
  // worked out first and NOTHING lands until the ledger is complete, so two units
  // that kill each other both die — O-6. The sudden-death backstop writes into
  // the same ledger so it lands atomically alongside real combat.
  const ledger = collectDamage(next); //  7
  armSuddenDeath(next);
  suddenDeathDamage(next, ledger);
  applyDamage(next, ledger); //           8

  resolveVictory(next); //             9
  next.tick += 1; //                  10

  return next;
}
