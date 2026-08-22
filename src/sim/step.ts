import { ISSUER, sortCommands, type Command } from './commands';
import { runAi } from './ai';
import { acquireTargets, applyDamage, collectDamage } from './combat';
import { ARRIVE_EPSILON, COST, MAP_TILES_X, MAP_TILES_Y, SPEED, TILE_PX } from './constants';
import { runEconomy } from './economy';
import { isValidPlacement, runProduction } from './production';
import { armSuddenDeath, resolveVictory, suddenDeathDamage } from './victory';
import { cellCentreX, cellCentreY, cellOf, cellX, cellY, createGrid, inBounds, isPassable, type Grid } from './grid';
import { findPath } from './pathfind';
import {
  ENTITY_STATE,
  KIND,
  cloneState,
  type Entity,
  type Kind,
  type Owner,
  isStructureKind,
  type SimState,
} from './state';
import { MAX_HP } from './constants';

/**
 * The tick function — `step(state, commands) → state`, pure.
 *
 * Every stage is live as of M4. The list below was written in M1 with stages 2–9
 * empty, and each has been filled in by the milestone that owns it without the
 * order ever changing — which was the point of declaring it up front.
 *
 * The order is part of the contract, not an implementation detail. Moving combat
 * before movement, or resolving victory before damage lands, changes the outcome
 * of thousands of matches. `STAGES` is asserted in tests so that reordering is a
 * visible, deliberate diff rather than something that drifts while adding a
 * system.
 */
export const STAGES = [
  'applyCommands', //        1 — sorted by (issuer, seq)                    O-4
  'aiThink', //              2 — emits commands for tick+1; uses sim RNG    FR-002
  'economy', //              3 — gather, deposit, deplete nodes                 O-3
  'production', //           4 — advance queues, spend ore                      O-5
  'movement', //             5 — pathfind + step positions                      O-2
  'combatAcquire', //        6 — choose targets                                 O-1
  'combatCollectDamage', //  7 — accumulate, do NOT apply
  'combatApplyDamage', //    8 — atomic, end of tick                            O-6
  'victoryResolve', //       9 — win / lose / draw; sudden death         FR-017/028
  'advanceTick', //         10
] as const;

/** `issuer` is a fixed enum where PLAYER is player 0 and AI is player 1. */
function ownerOf(issuer: number): number {
  return issuer === ISSUER.AI ? 1 : 0;
}

/**
 * The entity this issuer is allowed to command: it must exist, be alive, and be
 * theirs. Ownership is checked here rather than trusted, because from M4 the AI
 * is a second command source and a targeting slip would otherwise let it order
 * the player's units around.
 */
function commandable(state: SimState, issuer: number, id: number): Entity | undefined {
  const entity = findEntity(state.entities, id);
  if (entity === undefined || entity.state === ENTITY_STATE.DEAD) {
    return undefined;
  }
  return entity.owner === ownerOf(issuer) ? entity : undefined;
}

/**
 * Cost and max-hp keyed by numeric kind. Local to the command layer: production.ts
 * keeps its own copies for the queue path, and duplicating two four-entry lookups
 * is cheaper than exporting them and coupling the two modules' internals.
 */
const COST_BY_KIND: Record<Kind, number> = {
  [KIND.BASE]: Number.POSITIVE_INFINITY, // never purchasable
  [KIND.FACTORY]: COST.factory,
  [KIND.BARRACKS]: COST.barracks,
  [KIND.WORKER]: COST.worker,
  [KIND.TROOPER]: COST.trooper,
  [KIND.TANK]: COST.tank,
};

const MAX_HP_BY_KIND: Record<Kind, number> = {
  [KIND.BASE]: MAX_HP.base,
  [KIND.FACTORY]: MAX_HP.factory,
  [KIND.BARRACKS]: MAX_HP.barracks,
  [KIND.WORKER]: MAX_HP.worker,
  [KIND.TROOPER]: MAX_HP.trooper,
  [KIND.TANK]: MAX_HP.tank,
};

/**
 * The bare (unblocked) grid, for turning a click into a cell.
 *
 * A module constant, matching `production.ts`: cell geometry depends only on the
 * map dimensions, never on state. Rebuilding it per command would be the same
 * waste `gridFor` deliberately accepts for PASSABILITY, which genuinely does
 * change every tick.
 */
const bareGrid: Grid = createGrid(MAP_TILES_X, MAP_TILES_Y, []);

/**
 * Who may produce what — the Factory's reason to exist.
 *
 * product-spec.md line 128 has always said the Factory "Trains Scout / Trooper /
 * Tank", with one pre-placed per side. Neither half was implemented: no Factory
 * was seeded, and every build command named the Base, so a placed Factory was a
 * 200-ore ornament. A playtester reported it as "the factory seems pointless" and
 * then independently proposed the missing rule — "only get the trooper and the
 * tank after building a building to produce them" — which is the spec.
 *
 * Enforced HERE rather than in the build bar because the AI issues commands too.
 * A UI-only rule would gate the player and leave the opponent producing an army
 * from thin air.
 */
/**
 * The tech tree, as one table.
 *
 * Every unit has exactly one building that makes it, and a match now starts with
 * only a Base — so the opening is a real sequence: Worker, then ore, then choose
 * whether Troopers (Barracks, cheaper and sooner) or Tanks (Factory, dearer and
 * later) come first.
 *
 * `undefined` means "no building makes this", which covers the structures: they
 * are PLACED on chosen ground and never queued.
 */
const PRODUCED_BY: Record<number, number | undefined> = {
  // Workers stay on the Base. pre-impl F-6's zero-cost Worker is the floor that
  // stops a player with nothing being unable to act, and putting it behind a
  // structure would reintroduce the dead state it exists to prevent — doubly so
  // now that every match STARTS with zero Workers.
  [KIND.WORKER]: KIND.BASE,
  [KIND.TROOPER]: KIND.BARRACKS,
  [KIND.TANK]: KIND.FACTORY,
};

function canProduce(builder: Entity, kind: number): boolean {
  const required = PRODUCED_BY[kind];
  if (required === undefined) {
    return false;
  }
  return builder.kind === required && builder.state !== ENTITY_STATE.UNDER_CONSTRUCTION;
}

/** Structures may be PLACED on chosen ground; units may not (FR-012). */
function isPlaceableKind(kind: number): boolean {
  return kind === KIND.FACTORY || kind === KIND.BARRACKS;
}

function isProducibleKind(kind: number): boolean {
  return (
    kind === KIND.FACTORY ||
    kind === KIND.BARRACKS ||
    kind === KIND.WORKER ||
    kind === KIND.TROOPER ||
    kind === KIND.TANK
  );
}

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
          const unit = commandable(state, command.issuer, command.units[u]!);
          if (unit === undefined) {
            continue;
          }
          unit.targetId = command.targetId;
          unit.state = ENTITY_STATE.ATTACKING;
        }
        break;
      }

      case 'build': {
        const builder = commandable(state, command.issuer, command.builderId);
        if (builder === undefined) {
          break;
        }
        // A malformed kind must not reach production. `queuedKind as Kind` there
        // is an unchecked cast, and an out-of-range value yields `undefined` from
        // the cost and build-time tables — which makes ore NaN and kills the
        // whole match on the next hash. Commands are the simulation's only
        // external input, so this is the boundary where they get validated.
        if (!isProducibleKind(command.kind)) {
          break;
        }
        if (!canProduce(builder, command.kind)) {
          break;
        }
        // Already busy. Dropped rather than replacing the order, so a stray
        // double-click cannot silently discard the thing you meant to build.
        if (builder.queuedKind >= 0 || builder.state === ENTITY_STATE.UNDER_CONSTRUCTION) {
          break;
        }
        builder.queuedKind = command.kind;
        builder.state = ENTITY_STATE.BUILDING;
        builder.progress = 0;
        break;
      }

      case 'place': {
        // FR-012 / REV-007. `isValidPlacement` has existed since T039 with no
        // caller but the automatic spawn search; this is the verb that makes the
        // requirement reachable.
        const builder = commandable(state, command.issuer, command.builderId);
        if (builder === undefined) {
          break;
        }
        if (!isPlaceableKind(command.kind)) {
          break;
        }

        // Snap to the cell centre BEFORE validating, so the check and the result
        // agree about which cell is meant. Placement is judged by cell; leaving a
        // structure at a raw click point would seat it off-centre in a blocked
        // cell, which is the pixel-vs-cell mismatch that produced M3's deposit
        // livelock.
        // Bounds-check the RAW pixels before converting. `cellOf` derives a cell
        // index arithmetically, so an x past the right edge aliases into the next
        // ROW rather than going out of range — the index passes `inBounds` and a
        // click off the map silently places a structure somewhere else entirely.
        // `isValidPlacement` guards its pixel arguments first for the same reason.
        if (
          command.x < 0 ||
          command.y < 0 ||
          command.x >= MAP_TILES_X * TILE_PX ||
          command.y >= MAP_TILES_Y * TILE_PX
        ) {
          break;
        }
        const cell = cellOf(bareGrid, command.x, command.y);
        if (!inBounds(bareGrid, cell)) {
          break;
        }
        const x = cellCentreX(bareGrid, cell);
        const y = cellCentreY(bareGrid, cell);

        if (!isValidPlacement(state, x, y)) {
          break;
        }

        // Paid HERE, not on completion — deliberately unlike a queued unit (O-5).
        // A placed structure occupies ground from this instant, so the ore goes
        // with it; charging on completion would let an unaffordable Factory squat
        // on a cell forever, blocking it for free and never finishing.
        const price = COST_BY_KIND[command.kind];
        const player = state.players[ownerOf(command.issuer)]!;
        if (player.ore < price) {
          break;
        }
        player.ore -= price;

        state.entities.push({
          id: state.nextEntityId,
          kind: command.kind,
          owner: ownerOf(command.issuer) as Owner,
          x,
          y,
          hp: MAX_HP_BY_KIND[command.kind],
          state: ENTITY_STATE.UNDER_CONSTRUCTION,
          targetId: -1,
          cooldown: 0,
          progress: 0,
          destX: -1,
          destY: -1,
          queuedKind: -1,
          gatherNodeId: -1,
        });
        state.nextEntityId += 1;
        // Entities must stay id-sorted (O-7). Ids are monotonic and this is the
        // largest, so appending preserves the order without a sort.
        break;
      }

      case 'move': {
        for (let u = 0; u < command.units.length; u += 1) {
          const unit = commandable(state, command.issuer, command.units[u]!);
          if (unit === undefined) {
            continue;
          }
          unit.destX = command.x;
          unit.destY = command.y;
          // An explicit order outranks the automatic gather loop (FR-020's
          // principle). Without this the economy would re-target the worker on
          // the very next tick and the order would appear to be ignored.
          unit.gatherNodeId = -1;
          unit.state = ENTITY_STATE.MOVING;
        }
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
    if (isStructureKind(entity.kind)) {
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
/**
 * The nearest cell adjacent to a blocked goal that a unit can actually stand in,
 * or -1 if the goal is walled in completely.
 *
 * Neighbours are examined in a fixed order and chosen by (distance to the mover,
 * then cell index), so the choice is total and independent of anything but the
 * grid — O-7's rule applied to one more "pick the nearest" site.
 */
function nearestStandableNeighbour(grid: Grid, goal: number, from: number): number {
  const gx = cellX(grid, goal);
  const gy = cellY(grid, goal);
  const fx = cellX(grid, from);
  const fy = cellY(grid, from);

  const candidates = [
    gy > 0 ? goal - grid.width : -1,
    gx > 0 ? goal - 1 : -1,
    gx < grid.width - 1 ? goal + 1 : -1,
    gy < grid.height - 1 ? goal + grid.width : -1,
  ];

  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const cell = candidates[i]!;
    if (cell < 0 || !isPassable(grid, cell)) {
      continue;
    }
    const distance = Math.abs(cellX(grid, cell) - fx) + Math.abs(cellY(grid, cell) - fy);
    if (distance < bestDistance || (distance === bestDistance && cell < best)) {
      bestDistance = distance;
      best = cell;
    }
  }
  return best;
}

/**
 * Clear the order once the unit is standing where it was sent.
 *
 * Without this a unit sits in MOVING forever with its destination still set, and
 * a worker given an explicit order never returns to the gather loop — the economy
 * skips anything moving under orders, so it would be retired from the workforce
 * by one click.
 */
function arrive(entity: Entity, onFinalLeg: boolean): void {
  if (!onFinalLeg) {
    return;
  }
  entity.destX = -1;
  entity.destY = -1;
  if (entity.state === ENTITY_STATE.MOVING) {
    entity.state = ENTITY_STATE.IDLE;
  }
}

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

    // A destination inside a blocked cell is normal — workers are sent AT the
    // Base to deposit, not into it — so route to the nearest cell they can
    // actually stand in and let the range check do the rest.
    //
    // This used to skip the pathfinder entirely for a blocked goal and walk a
    // straight line at the destination, which meant units crossed structures on
    // every deposit trip. Falling back to "go straight" whenever routing is hard
    // is the tempting shape here and it silently deletes the whole point of
    // having a grid.
    const reachableGoal = isPassable(grid, goalCell) ? goalCell : nearestStandableNeighbour(grid, goalCell, fromCell);
    if (reachableGoal < 0) {
      continue; // nowhere legal to stand near the destination — hold position
    }

    let targetX = isPassable(grid, goalCell) ? entity.destX : cellCentreX(grid, reachableGoal);
    let targetY = isPassable(grid, goalCell) ? entity.destY : cellCentreY(grid, reachableGoal);

    if (fromCell !== reachableGoal) {
      const nextCell = findPath(grid, fromCell, reachableGoal, entity.id)[0];
      if (nextCell === undefined) {
        // Unreachable. Standing still is the honest answer; walking at the
        // obstacle would look like the unit was trying and failing forever.
        continue;
      }
      targetX = cellCentreX(grid, nextCell);
      targetY = cellCentreY(grid, nextCell);
    }

    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const distanceSquared = dx * dx + dy * dy;

    const onFinalLeg = fromCell === reachableGoal;

    if (distanceSquared <= ARRIVE_EPSILON * ARRIVE_EPSILON) {
      entity.x = targetX;
      entity.y = targetY;
      arrive(entity, onFinalLeg);
      continue;
    }

    // sqrt is correctly rounded under IEEE 754, so it is safe here (Constitution I
    // bans the transcendentals, not sqrt). Distance COMPARISONS still use squares.
    const distance = Math.sqrt(distanceSquared);
    if (distance <= speed) {
      entity.x = targetX;
      entity.y = targetY;
      arrive(entity, onFinalLeg);
    } else {
      entity.x += (dx / distance) * speed;
      entity.y += (dy / distance) * speed;
    }
  }
}

export function step(state: SimState, commands: readonly Command[]): SimState {
  const next = cloneState(state);

  // Commands the AI scheduled on an earlier tick come due now, alongside whatever
  // the caller supplies. `applyCommands` sorts the merged list by (issuer, seq),
  // so the player is always resolved before the AI — O-4, and the first tick on
  // which that rule has had two issuers to order.
  const due: Command[] = [];
  const stillPending: Command[] = [];
  for (let i = 0; i < next.pending.length; i += 1) {
    const command = next.pending[i]!;
    (command.tick === next.tick ? due : stillPending).push(command);
  }
  next.pending = stillPending;

  applyCommands(next, due.length > 0 ? [...commands, ...due] : commands); // 1
  runAi(next); //                      2
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
