import { ATTACK } from './constants';
import { ENTITY_STATE, KIND, type Entity, type SimState } from './state';

/**
 * Target acquisition and damage — O-1 and O-6.
 *
 * Two hazards live here and they are different in kind.
 *
 * **O-1** is another "pick the nearest" tie, like O-3: two enemies equidistant and
 * in range. Rule (FR-021): lowest entity id wins.
 *
 * **O-6 is the serious one.** If damage is applied as it is calculated, then when
 * A and B would kill each other on the same tick, whichever the loop reaches first
 * kills the other before the other gets to fire. That is not merely
 * non-deterministic — it is *wrong*. Both units were alive and both fired, so both
 * should die. Collecting damage across the whole tick and applying it atomically
 * at the end makes array position irrelevant, and generalises FR-028's Draw rule
 * from Bases to every entity.
 */

export interface DamageEntry {
  amount: number;
  /** Came from an enemy, so it raises the under-attack indicator (FR-023). */
  fromEnemy: boolean;
  /** Came from the sudden-death backstop, which has no attacker (FR-033). */
  fromSuddenDeath: boolean;
}

export type DamageLedger = Map<number, DamageEntry>;

const ATTACK_BY_KIND: Partial<Record<number, { damage: number; range: number; cooldownTicks: number }>> = {
  [KIND.WORKER]: ATTACK.worker,
  [KIND.SCOUT]: ATTACK.scout,
  [KIND.TROOPER]: ATTACK.trooper,
  [KIND.TANK]: ATTACK.tank,
};

function isAlive(entity: Entity): boolean {
  return entity.state !== ENTITY_STATE.DEAD && entity.hp > 0;
}

function squaredDistance(a: Entity, b: Entity): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function findById(state: SimState, id: number): Entity | undefined {
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.id === id) {
      return entity;
    }
  }
  return undefined;
}

/**
 * Stage 6. Traverses in index order, which is id order (O-7).
 *
 * FR-020: an explicit order overrides auto-acquisition. A unit the player put in
 * ATTACKING state keeps its target even when something closer wanders past —
 * quietly retargeting would mean the game ignoring an instruction it was given.
 */
export function acquireTargets(state: SimState): void {
  for (let i = 0; i < state.entities.length; i += 1) {
    const attacker = state.entities[i]!;
    const profile = ATTACK_BY_KIND[attacker.kind];
    if (profile === undefined || !isAlive(attacker)) {
      continue;
    }

    if (attacker.state === ENTITY_STATE.ATTACKING) {
      const ordered = attacker.targetId >= 0 ? findById(state, attacker.targetId) : undefined;
      if (ordered !== undefined && isAlive(ordered)) {
        continue;
      }
      // The ordered target is gone. Fall through and auto-acquire rather than
      // leaving the unit pointing at a corpse forever.
    }

    let bestId = -1;
    let bestDistance = Infinity;
    const rangeSquared = profile.range * profile.range;

    for (let j = 0; j < state.entities.length; j += 1) {
      const candidate = state.entities[j]!;
      if (candidate.owner === attacker.owner || !isAlive(candidate)) {
        continue;
      }
      const distance = squaredDistance(attacker, candidate);
      // Strict `<`, so an equal distance leaves the earlier (lower-id) candidate
      // in place. That single character is the whole of O-1.
      if (distance <= rangeSquared && distance < bestDistance) {
        bestDistance = distance;
        bestId = candidate.id;
      }
    }

    if (bestId === -1) {
      if (attacker.state === ENTITY_STATE.ATTACKING) {
        attacker.state = ENTITY_STATE.IDLE;
      }
      attacker.targetId = -1;
    } else {
      attacker.targetId = bestId;
      attacker.state = ENTITY_STATE.ATTACKING;
    }
  }
}

export function addDamage(ledger: DamageLedger, targetId: number, amount: number, source: 'enemy' | 'suddenDeath'): void {
  const existing = ledger.get(targetId);
  if (existing === undefined) {
    ledger.set(targetId, {
      amount,
      fromEnemy: source === 'enemy',
      fromSuddenDeath: source === 'suddenDeath',
    });
    return;
  }
  existing.amount += amount;
  existing.fromEnemy = existing.fromEnemy || source === 'enemy';
  existing.fromSuddenDeath = existing.fromSuddenDeath || source === 'suddenDeath';
}

/**
 * Stage 7. Works out what everyone would do and changes nothing.
 *
 * Cooldowns ARE decremented and reset here, because "did this unit fire" is the
 * same decision as "does its cooldown reset" — splitting them would let a unit
 * fire twice or never.
 */
export function collectDamage(state: SimState): DamageLedger {
  const ledger: DamageLedger = new Map();

  for (let i = 0; i < state.entities.length; i += 1) {
    const attacker = state.entities[i]!;
    const profile = ATTACK_BY_KIND[attacker.kind];
    if (profile === undefined || !isAlive(attacker)) {
      continue;
    }

    if (attacker.cooldown > 0) {
      attacker.cooldown -= 1;
      continue;
    }
    if (attacker.targetId < 0) {
      continue;
    }

    const target = findById(state, attacker.targetId);
    if (target === undefined || !isAlive(target) || target.owner === attacker.owner) {
      continue;
    }
    if (squaredDistance(attacker, target) > profile.range * profile.range) {
      continue;
    }

    addDamage(ledger, target.id, profile.damage, 'enemy');
    attacker.cooldown = profile.cooldownTicks;
  }

  return ledger;
}

/**
 * Stage 8. Atomic — every hit lands at once, so a unit that died this tick still
 * dealt the damage it dealt while alive.
 *
 * The ledger is iterated by ENTITY, not by walking the Map (O-7: never iterate a
 * Map in `src/sim`). The Map is only a lookup.
 */
export function applyDamage(state: SimState, ledger: DamageLedger): void {
  state.players[0].underAttack = false;
  state.players[1].underAttack = false;
  state.players[0].suddenDeathDamage = false;
  state.players[1].suddenDeathDamage = false;

  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    const entry = ledger.get(entity.id);
    if (entry === undefined || !isAlive(entity)) {
      continue;
    }

    entity.hp = Math.max(0, entity.hp - entry.amount);

    const player = state.players[entity.owner]!;
    if (entry.fromEnemy) {
      player.underAttack = true;
    }
    if (entry.fromSuddenDeath) {
      player.suddenDeathDamage = true;
    }

    if (entity.hp === 0) {
      entity.state = ENTITY_STATE.DEAD;
      entity.targetId = -1;
      entity.gatherNodeId = -1;
      entity.destX = -1;
      entity.destY = -1;
      entity.queuedKind = -1;
    }
  }
}
