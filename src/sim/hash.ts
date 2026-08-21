import type { SimState } from './state';

/**
 * Canonical state hash — ADR-001.
 *
 * Constitution IV's replay corpus is exactly as trustworthy as this function. A
 * hash that quietly omits a field turns every green corpus run into theatre, and
 * nothing downstream would ever notice.
 *
 * Three properties carry that weight:
 *
 *  1. **Fixed field order, id-ordered traversal.** Collections are hashed in
 *     array order, which is id order because the state keeps them sorted.
 *     Sorting here would mask an ordering bug elsewhere in the tick — the exact
 *     bug class this project keeps finding (FR-021, FR-022, FR-027).
 *  2. **Exact IEEE-754 bits.** Rounding before hashing is the tempting shortcut
 *     and it defeats the entire principle: it hides precisely the sub-ulp
 *     divergence §I exists to detect. If float divergence appears, that is a
 *     finding, not noise to filter.
 *  3. **NaN and Infinity throw.** Neither should ever reach simulation state, and
 *     hashing one would launder a defect into a stable-looking value.
 *
 * ── Deviation from ADR-001, pending amendment ─────────────────────────────────
 * ADR-001 opens with "exactly the simulation state" and then lists fields that
 * omit `difficulty` and `nextEntityId`. Both are simulation state: two states
 * differing only in `nextEntityId` diverge at the next spawn, and difficulty
 * (FR-029) is a field rather than part of the seed precisely so it can vary
 * independently. Neither is presentational or derived, so neither is covered by
 * the ADR's "what is NOT hashed" list — this reads as a drafting gap, not a
 * deliberate exclusion. They are appended AFTER the ADR's six fields so the
 * amendment is purely additive and trivially revertible.
 */

const FNV_PRIME = 16777619;
const LANE_A_OFFSET = 2166136261;
const LANE_B_OFFSET = 0x9dc5811c;

const scratch = new ArrayBuffer(8);
const scratchView = new DataView(scratch);

class Hasher {
  private a = LANE_A_OFFSET;
  private b = LANE_B_OFFSET;

  private byte(value: number): void {
    this.a = Math.imul(this.a ^ value, FNV_PRIME) >>> 0;
    this.b = Math.imul(this.b ^ value, FNV_PRIME) >>> 0;
  }

  uint(value: number, bytes: number): void {
    for (let i = 0; i < bytes; i += 1) {
      this.byte((value >>> (i * 8)) & 0xff);
    }
  }

  /** Exact IEEE-754 double bits, little-endian fixed — never platform-native. */
  float(value: number, field: string): void {
    if (Number.isNaN(value)) {
      throw new Error(
        `Canonical hash encountered NaN at ${field}. NaN must never enter simulation state; ` +
          `it always indicates a defect upstream of the hash.`,
      );
    }
    if (!Number.isFinite(value)) {
      throw new Error(
        `Canonical hash encountered a non-finite value (${value === Infinity ? 'Infinity' : '-Infinity'}) ` +
          `at ${field}. Simulation state must stay finite.`,
      );
    }
    // -0 and 0 are === equal but have different bits, and no simulation rule
    // distinguishes them. Normalising here keeps the hash from reporting a
    // difference that does not exist.
    scratchView.setFloat64(0, value === 0 ? 0 : value, true);
    for (let i = 0; i < 8; i += 1) {
      this.byte(scratchView.getUint8(i));
    }
  }

  /** Two 32-bit lanes concatenated — 64 bits, ample for divergence detection. */
  digest(): string {
    return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0');
  }
}

export function hashState(state: SimState): string {
  const h = new Hasher();

  // 1–3: run-level scalars.
  h.uint(state.tick, 4);
  h.uint(state.rng, 4);
  h.uint(state.verdict, 1);

  // 4: per player, ordered by player id ascending (the array index IS the id).
  h.uint(state.players[0].ore, 4);
  h.uint(state.players[1].ore, 4);

  // 5: per ore node, in array order — which is id order.
  h.uint(state.nodes.length, 4);
  for (let i = 0; i < state.nodes.length; i += 1) {
    const node = state.nodes[i]!;
    h.uint(node.id, 4);
    h.float(node.remaining, `nodes[${node.id}].remaining`);
  }

  // 6: per entity, in array order — which is id order (O-7).
  h.uint(state.entities.length, 4);
  for (let i = 0; i < state.entities.length; i += 1) {
    const e = state.entities[i]!;
    h.uint(e.id, 4);
    h.uint(e.kind, 1);
    h.uint(e.owner, 1);
    h.float(e.x, `entities[${e.id}].x`);
    h.float(e.y, `entities[${e.id}].y`);
    h.float(e.hp, `entities[${e.id}].hp`);
    h.uint(e.state, 1);
    // targetId is -1 for "none", so it is signed. Shift into unsigned space
    // rather than letting the uint encoder truncate a negative.
    h.uint((e.targetId + 1) >>> 0, 4);
    h.float(e.cooldown, `entities[${e.id}].cooldown`);
    h.float(e.progress, `entities[${e.id}].progress`);
  }

  // Appended beyond ADR-001's list — see the deviation note above.
  h.uint(state.difficulty, 1);
  h.uint(state.nextEntityId, 4);

  return h.digest();
}
