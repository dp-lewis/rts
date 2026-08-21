import { DEPOSIT_RANGE, GATHER_RANGE, WORKER_CARRY_CAPACITY, WORKER_GATHER_PER_TICK } from './constants';
import { ENTITY_STATE, KIND, type Entity, type SimState } from './state';

/**
 * Ore nodes and the worker gather loop — FR-006, FR-016, and O-3.
 *
 * O-3 is the site where "pick the nearest node" appears, and on a deliberately
 * mirrored map equidistant pairs are the normal configuration rather than a rare
 * edge case. The rule (FR-027) is least SQUARED Euclidean distance, ties broken by
 * lowest node id.
 *
 * Squared distance, never `Math.sqrt`: sqrt is correctly rounded under IEEE 754 so
 * it would be safe, but it buys nothing here — comparing squares gives the same
 * ordering — and avoiding it keeps the comparison exact and the hot loop cheap.
 * Comparing distances is the one place where a rounding difference would silently
 * flip a tie, so the fewer operations between the coordinates and the comparison,
 * the better.
 */

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * The nearest non-exhausted ore node, or -1 if none remain.
 *
 * Iterates the id-sorted node array in index order and takes a new best only on a
 * STRICT improvement, so an equal distance leaves the earlier (lower-id) node in
 * place. That single `<` rather than `<=` is the whole of the O-3 tie-break, and
 * it is the kind of character that is easy to get wrong and impossible to notice
 * without a test for it.
 */
export function chooseOreNode(state: SimState, worker: Entity): number {
  let bestId = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < state.nodes.length; i += 1) {
    const node = state.nodes[i]!;
    if (node.remaining <= 0) {
      continue;
    }
    const distance = squaredDistance(worker.x, worker.y, node.x, node.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = node.id;
    }
  }

  return bestId;
}

function findNode(state: SimState, id: number): { id: number; x: number; y: number; remaining: number } | undefined {
  for (let i = 0; i < state.nodes.length; i += 1) {
    const node = state.nodes[i]!;
    if (node.id === id) {
      return node;
    }
  }
  return undefined;
}

/** The owning player's Base, by lowest entity id if somehow there are several. */
function findBase(state: SimState, owner: number): Entity | undefined {
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.kind === KIND.BASE && entity.owner === owner && entity.state !== ENTITY_STATE.DEAD) {
      return entity;
    }
  }
  return undefined;
}

/**
 * Stage 3 of the tick. Traverses entities in index order, which is id order (O-7).
 *
 * `progress` doubles as the worker's carried ore. It is already hashed and already
 * means "how far through its current job this entity is", so adding a dedicated
 * `carrying` field would widen the hash for no new information.
 */
export function runEconomy(state: SimState): void {
  for (let i = 0; i < state.entities.length; i += 1) {
    const worker = state.entities[i]!;
    if (worker.kind !== KIND.WORKER || worker.state === ENTITY_STATE.DEAD) {
      continue;
    }

    // A worker under explicit orders is not doing economy this tick. Player
    // intent always outranks the automatic loop (FR-020's principle, applied
    // here rather than only to combat).
    if (worker.state === ENTITY_STATE.ATTACKING || worker.state === ENTITY_STATE.BUILDING) {
      continue;
    }

    const base = findBase(state, worker.owner);
    const full = worker.progress >= WORKER_CARRY_CAPACITY;
    const targetNode = worker.targetId >= 0 ? findNode(state, worker.targetId) : undefined;
    const targetExhausted = targetNode === undefined || targetNode.remaining <= 0;

    // Heading home: either full, or holding ore with nothing left to mine.
    if (base !== undefined && (full || (targetExhausted && worker.progress > 0))) {
      if (squaredDistance(worker.x, worker.y, base.x, base.y) <= DEPOSIT_RANGE * DEPOSIT_RANGE) {
        state.players[worker.owner]!.ore += worker.progress;
        worker.progress = 0;
        worker.targetId = -1;
        worker.destX = -1;
        worker.destY = -1;
        worker.state = ENTITY_STATE.IDLE;
      } else {
        worker.destX = base.x;
        worker.destY = base.y;
        worker.state = ENTITY_STATE.MOVING;
      }
      continue;
    }

    // Needs a node: either it has none, or the one it had ran dry.
    if (targetExhausted) {
      const chosen = chooseOreNode(state, worker);
      if (chosen === -1) {
        // Nothing left anywhere. Come to a complete rest rather than re-deciding
        // every tick — a worker that re-picks and gives up forever would burn CPU
        // and, worse, would never reach a fixed point the hash could settle on.
        worker.targetId = -1;
        worker.destX = -1;
        worker.destY = -1;
        worker.state = ENTITY_STATE.IDLE;
        continue;
      }
      worker.targetId = chosen;
    }

    const node = findNode(state, worker.targetId)!;
    if (squaredDistance(worker.x, worker.y, node.x, node.y) <= GATHER_RANGE * GATHER_RANGE) {
      const room = WORKER_CARRY_CAPACITY - worker.progress;
      const mined = Math.min(WORKER_GATHER_PER_TICK, room, node.remaining);
      node.remaining -= mined;
      worker.progress += mined;
      worker.destX = -1;
      worker.destY = -1;
      worker.state = ENTITY_STATE.GATHERING;
    } else {
      worker.destX = node.x;
      worker.destY = node.y;
      worker.state = ENTITY_STATE.MOVING;
    }
  }
}
