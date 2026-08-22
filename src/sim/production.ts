import { BUILD_TICKS, COST, MAP_TILES_X, MAP_TILES_Y, MAX_HP, TILE_PX } from './constants';
import { cellCentreX, cellCentreY, cellIndex, cellOf, cellX, cellY, createGrid, inBounds } from './grid';
import { ENTITY_STATE, KIND, type Entity, type Kind, type SimState } from './state';

/**
 * Build queue, ore spend, and placement — O-5, FR-012, FR-031, and pre-impl F-6.
 *
 * **Ore is spent on COMPLETION, not when an item is queued.** That is the right
 * design — queuing should not lock up ore you might need for defence — and it is
 * exactly what creates O-5: two Factories finish on the same tick with ore for
 * one. Without a rule, whichever the loop reaches first wins, which is array
 * position deciding the match.
 *
 * The rule: resolve in ascending entity id order, and the loser stays QUEUED
 * rather than failing. Staying queued matters. A build that silently evaporated
 * because you were ten ore short would be maddening and, with no error surface in
 * this game, completely invisible.
 */

const COST_BY_KIND: Record<Kind, number> = {
  [KIND.BASE]: Infinity,
  [KIND.FACTORY]: COST.factory,
  [KIND.BARRACKS]: COST.barracks,
  [KIND.WORKER]: COST.worker,
  [KIND.TROOPER]: COST.trooper,
  [KIND.TANK]: COST.tank,
};

const BUILD_TICKS_BY_KIND: Record<Kind, number> = {
  [KIND.BASE]: Infinity,
  [KIND.FACTORY]: BUILD_TICKS.factory,
  [KIND.BARRACKS]: BUILD_TICKS.barracks,
  [KIND.WORKER]: BUILD_TICKS.worker,
  [KIND.TROOPER]: BUILD_TICKS.trooper,
  [KIND.TANK]: BUILD_TICKS.tank,
};

const MAX_HP_BY_KIND: Record<Kind, number> = {
  [KIND.BASE]: MAX_HP.base,
  [KIND.FACTORY]: MAX_HP.factory,
  [KIND.BARRACKS]: MAX_HP.barracks,
  [KIND.WORKER]: MAX_HP.worker,
  [KIND.TROOPER]: MAX_HP.trooper,
  [KIND.TANK]: MAX_HP.tank,
};

const bareGrid = createGrid(MAP_TILES_X, MAP_TILES_Y, []);

function isAlive(entity: Entity): boolean {
  return entity.state !== ENTITY_STATE.DEAD && entity.hp > 0;
}

/**
 * FR-031: the full 64 px footprint must be in bounds, passable, and free of any
 * structure or unit.
 *
 * Judged by CELL, not by pixel. A click anywhere inside an occupied tile is
 * refused, because the footprint is a tile — accepting a click 30 px from a Base's
 * centre would place a Factory overlapping it.
 */
export function isValidPlacement(state: SimState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_TILES_X * TILE_PX || y >= MAP_TILES_Y * TILE_PX) {
    return false;
  }

  const target = cellOf(bareGrid, x, y);
  if (!inBounds(bareGrid, target)) {
    return false;
  }

  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (!isAlive(entity)) {
      continue;
    }
    if (cellOf(bareGrid, entity.x, entity.y) === target) {
      return false;
    }
  }

  return true;
}

/**
 * The first cell around `origin` a structure could legally be placed in, searched
 * in a fixed ring order. Returns undefined when the surroundings are full.
 *
 * Exported so the AI can site a replacement Factory without duplicating the ring
 * search — the search order is part of what makes the AI deterministic, and two
 * copies of it would drift.
 */
export function openCellNear(
  state: SimState,
  origin: Entity,
  maxRadius = 4,
): { x: number; y: number } | undefined {
  const cell = cellOf(bareGrid, origin.x, origin.y);
  const ox = cellX(bareGrid, cell);
  const oy = cellY(bareGrid, cell);

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
          continue; // interior of the ring, already searched
        }
        const cx = ox + dx;
        const cy = oy + dy;
        if (cx < 0 || cy < 0 || cx >= MAP_TILES_X || cy >= MAP_TILES_Y) {
          continue;
        }
        const candidate = cellIndex(bareGrid, cx, cy);
        const px = cellCentreX(bareGrid, candidate);
        const py = cellCentreY(bareGrid, candidate);
        if (isValidPlacement(state, px, py)) {
          return { x: px, y: py };
        }
      }
    }
  }
  return undefined;
}

/**
 * The first free cell around a producer, searched in a fixed ring order so two
 * units queued on the same tick never contend for one cell by accident.
 */
function spawnCell(state: SimState, producer: Entity): { x: number; y: number } {
  const origin = cellOf(bareGrid, producer.x, producer.y);
  const ox = cellX(bareGrid, origin);
  const oy = cellY(bareGrid, origin);

  for (let radius = 1; radius <= 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
          continue; // interior of the ring, already searched
        }
        const cx = ox + dx;
        const cy = oy + dy;
        if (cx < 0 || cy < 0 || cx >= MAP_TILES_X || cy >= MAP_TILES_Y) {
          continue;
        }
        const cell = cellIndex(bareGrid, cx, cy);
        if (isValidPlacement(state, cellCentreX(bareGrid, cell), cellCentreY(bareGrid, cell))) {
          return { x: cellCentreX(bareGrid, cell), y: cellCentreY(bareGrid, cell) };
        }
      }
    }
  }

  // Fully boxed in. Stack on the producer rather than refusing: a unit that was
  // paid for must exist, and units do not collide in v1 anyway (pre-impl F-2).
  return { x: producer.x, y: producer.y };
}

function survivingWorkers(state: SimState, owner: number): number {
  let count = 0;
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.kind === KIND.WORKER && entity.owner === owner && isAlive(entity)) {
      count += 1;
    }
  }
  return count;
}

/**
 * pre-impl F-6. A player with no surviving Workers and less ore than a Worker
 * costs can neither gather nor build: a dead state in which they can neither act
 * nor lose, and the match cannot end. The Base affords one at zero cost.
 *
 * Deliberately narrow — only Workers, only when there are none left. It is a
 * floor under an unrecoverable state, not a discount.
 */
function priceOf(state: SimState, owner: number, kind: Kind): number {
  if (kind === KIND.WORKER && survivingWorkers(state, owner) === 0) {
    return 0;
  }
  return COST_BY_KIND[kind];
}

/**
 * Stage 4. Traverses entities in index order — which is ascending id — so O-5
 * resolves by id without a separate sort.
 */
export function runProduction(state: SimState): void {
  const spawns: Entity[] = [];

  for (let i = 0; i < state.entities.length; i += 1) {
    const producer = state.entities[i]!;
    if (!isAlive(producer)) {
      continue;
    }

    // A structure building ITSELF: placed but not yet operational. Keyed on an
    // explicit state rather than inferred from `queuedKind`, so a producer that
    // fails to record what it was told to build can never fall into this branch.
    if (producer.state === ENTITY_STATE.UNDER_CONSTRUCTION) {
      producer.progress += 1;
      if (producer.progress >= BUILD_TICKS_BY_KIND[producer.kind]) {
        producer.progress = 0;
        producer.state = ENTITY_STATE.IDLE;
      }
      continue;
    }

    if (producer.queuedKind < 0) {
      continue;
    }

    const kind = producer.queuedKind as Kind;
    const required = BUILD_TICKS_BY_KIND[kind];

    // Advance first, THEN test for completion. A producer one tick from done
    // completes on its next tick, not the one after — otherwise every build
    // silently costs an extra tick and the M8 tuning pass would be balancing
    // against numbers that are all quietly wrong by one.
    if (producer.progress < required) {
      producer.progress += 1;
      producer.state = ENTITY_STATE.BUILDING;
      if (producer.progress < required) {
        continue;
      }
    }

    // Complete — now, and only now, does it cost anything.
    const price = priceOf(state, producer.owner, kind);
    const player = state.players[producer.owner]!;
    if (player.ore < price) {
      // Stay queued. Progress is CAPPED rather than accumulating, so ore arriving
      // later releases exactly one unit and not a backlog of them.
      producer.progress = required;
      continue;
    }

    player.ore -= price;
    const where = spawnCell(state, producer);
    spawns.push({
      id: state.nextEntityId,
      kind,
      owner: producer.owner,
      x: where.x,
      y: where.y,
      hp: MAX_HP_BY_KIND[kind],
      state: ENTITY_STATE.IDLE,
      targetId: -1,
      cooldown: 0,
      progress: 0,
      destX: -1,
      destY: -1,
      queuedKind: -1,
      gatherNodeId: -1,
    });
    state.nextEntityId += 1;

    producer.queuedKind = -1;
    producer.progress = 0;
    producer.state = ENTITY_STATE.IDLE;
  }

  // Appended after the loop and in ascending id order, so the entity array stays
  // id-sorted without a re-sort (O-7) and a unit spawned this tick cannot act
  // until the next one.
  for (let i = 0; i < spawns.length; i += 1) {
    state.entities.push(spawns[i]!);
  }
}
