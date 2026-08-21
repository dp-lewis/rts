import { sortCommands, type Command } from './commands';
import { ENTITY_STATE, cloneState, type Entity, type SimState } from './state';

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
  'economy', //              3 — gather, deposit, deplete nodes             O-3, M2
  'production', //           4 — advance queues, spend ore                  O-5, M3
  'movement', //             5 — pathfind + step positions                  O-2, M2
  'combatAcquire', //        6 — choose targets                             O-1, M3
  'combatCollectDamage', //  7 — accumulate, do NOT apply                        M3
  'combatApplyDamage', //    8 — atomic, end of tick                        O-6, M3
  'victoryResolve', //       9 — win / lose / draw; sudden death     FR-017/028, M3
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

export function step(state: SimState, commands: readonly Command[]): SimState {
  const next = cloneState(state);

  applyCommands(next, commands); // 1
  // 2–9: no systems exist yet. See STAGES for what lands where.
  next.tick += 1; // 10

  return next;
}
