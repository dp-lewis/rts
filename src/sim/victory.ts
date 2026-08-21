import { SUDDEN_DEATH } from './constants';
import { addDamage, type DamageLedger } from './combat';
import { ENTITY_STATE, KIND, VERDICT, type Entity, type SimState } from './state';

/**
 * Victory, defeat, draw — and the sudden-death backstop (CR-001).
 *
 * ── Why CR-001 exists ─────────────────────────────────────────────────────────
 * Ore exhaustion halts production but does not force a resolution. Two sides with
 * surviving armies and no income can sit forever, and nothing in FR-016 or FR-017
 * terminated that. The ten-minute promise — the product's entire differentiator —
 * was guaranteed by nothing in the simulation.
 *
 * Four review passes missed it because each checked whether the artifacts were
 * consistent WITH EACH OTHER, and FR-016 and FR-017 are perfectly consistent. The
 * gap was BETWEEN them: a state the requirements jointly failed to cover.
 *
 * The backstop adds NO fourth verdict. It forces one of the existing three, and
 * when both Bases fall together it reuses FR-028's Draw rule unchanged.
 */

function isAlive(entity: Entity): boolean {
  return entity.state !== ENTITY_STATE.DEAD && entity.hp > 0;
}

function baseOf(state: SimState, owner: number): Entity | undefined {
  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.kind === KIND.BASE && entity.owner === owner) {
      return entity;
    }
  }
  return undefined;
}

/** Arms on the tick the last node runs dry, and never re-arms. */
export function armSuddenDeath(state: SimState): void {
  if (state.suddenDeathAt >= 0) {
    return;
  }
  for (let i = 0; i < state.nodes.length; i += 1) {
    if (state.nodes[i]!.remaining > 0) {
      return;
    }
  }
  state.suddenDeathAt = state.tick;
}

/**
 * Escalating damage to every Base once the grace period has elapsed.
 *
 * Damage goes through the SAME ledger as combat, so it lands atomically with
 * everything else (O-6) and a Base can be finished off by a shell and the backstop
 * on the same tick. It is tagged `suddenDeath` rather than `enemy`, which is what
 * FR-033 turns on: a Base dying with no attacker must not raise the under-attack
 * indicator, or the player goes looking for an enemy that is not there — in a game
 * with no camera to go looking with.
 *
 * Both Bases take it, so the backstop cannot hand anyone a win by asymmetry. It
 * resolves the match on the hp the players earned.
 */
export function suddenDeathDamage(state: SimState, ledger: DamageLedger): void {
  if (state.suddenDeathAt < 0) {
    return;
  }

  const elapsed = state.tick - state.suddenDeathAt;
  if (elapsed < SUDDEN_DEATH.graceTicks) {
    return;
  }

  const steps = Math.floor((elapsed - SUDDEN_DEATH.graceTicks) / SUDDEN_DEATH.rampIntervalTicks);
  const damage = SUDDEN_DEATH.initialDamagePerTick + steps * SUDDEN_DEATH.damageRampStep;

  for (let i = 0; i < state.entities.length; i += 1) {
    const entity = state.entities[i]!;
    if (entity.kind === KIND.BASE && isAlive(entity)) {
      addDamage(ledger, entity.id, damage, 'suddenDeath');
    }
  }
}

/**
 * Stage 9. Verdicts are from player 0's point of view, matching `SimState.verdict`.
 *
 * A settled match stays settled: once the verdict is anything but NONE this
 * returns immediately. Without that, a Draw could be quietly rewritten into a
 * Defeat on the following tick as bodies were cleaned up.
 */
export function resolveVictory(state: SimState): void {
  if (state.verdict !== VERDICT.NONE) {
    return;
  }

  const own = baseOf(state, 0);
  const enemy = baseOf(state, 1);

  const ownLost = own === undefined || !isAlive(own);
  const enemyLost = enemy === undefined || !isAlive(enemy);

  if (ownLost && enemyLost) {
    state.verdict = VERDICT.DRAW;
  } else if (enemyLost) {
    state.verdict = VERDICT.VICTORY;
  } else if (ownLost) {
    state.verdict = VERDICT.DEFEAT;
  }
}
