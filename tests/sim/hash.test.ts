import { describe, expect, it } from 'vitest';

import { hashState } from '../../src/sim/hash';
import { ENTITY_STATE, KIND, VERDICT, type Entity, type SimState } from '../../src/sim/state';

/**
 * T008 / T009 — the canonical state hash (ADR-001).
 *
 * This is the single most load-bearing function in the project. Constitution IV's
 * replay corpus is exactly as trustworthy as this hash: a hash that quietly ignores
 * a field turns every green corpus run into theatre, and no test downstream of it
 * would notice.
 *
 * So the tests are adversarial by design. It is easy to write a hash that is stable
 * (T008 first case) and much harder to write one that is stable AND sensitive to
 * every field it claims to cover. The per-field mutation sweep below is the part
 * that actually earns the confidence.
 */

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    kind: KIND.WORKER,
    owner: 0,
    x: 128,
    y: 256,
    hp: 40,
    state: ENTITY_STATE.IDLE,
    targetId: -1,
    cooldown: 0,
    progress: 0,
    destX: -1,
    destY: -1,
    ...overrides,
  };
}

function state(overrides: Partial<SimState> = {}): SimState {
  return {
    tick: 120,
    rng: 987654321,
    difficulty: 1,
    verdict: VERDICT.NONE,
    players: [{ ore: 150 }, { ore: 200 }],
    nodes: [
      { id: 0, x: 320, y: 320, remaining: 800 },
      { id: 1, x: 960, y: 960, remaining: 1500 },
    ],
    entities: [entity({ id: 1 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })],
    nextEntityId: 3,
    ...overrides,
  };
}

describe('hash shape', () => {
  it('is 64 bits of lowercase hex', () => {
    expect(hashState(state())).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('hash stability', () => {
  it('is identical for two structurally identical states', () => {
    expect(hashState(state())).toBe(hashState(state()));
  });

  it('is identical for a state round-tripped through JSON', () => {
    const original = state();
    const revived: SimState = JSON.parse(JSON.stringify(original));
    expect(hashState(revived)).toBe(hashState(original));
  });

  it('does not depend on JavaScript object key insertion order', () => {
    // Same values, properties declared in a different order. A hash built on
    // Object.keys or JSON.stringify would pass the test above and fail this one.
    const canonical = state();
    const shuffled: SimState = {
      nextEntityId: canonical.nextEntityId,
      entities: canonical.entities.map((e) => ({
        destY: e.destY,
        destX: e.destX,
        progress: e.progress,
        cooldown: e.cooldown,
        targetId: e.targetId,
        state: e.state,
        hp: e.hp,
        y: e.y,
        x: e.x,
        owner: e.owner,
        kind: e.kind,
        id: e.id,
      })),
      nodes: canonical.nodes.map((n) => ({ remaining: n.remaining, y: n.y, x: n.x, id: n.id })),
      players: [{ ore: canonical.players[0].ore }, { ore: canonical.players[1].ore }],
      verdict: canonical.verdict,
      difficulty: canonical.difficulty,
      rng: canonical.rng,
      tick: canonical.tick,
    };
    expect(hashState(shuffled)).toBe(hashState(canonical));
  });
});

describe('hash sensitivity — every hashed field must move the hash', () => {
  const baseline = hashState(state());

  it.each([
    ['tick', state({ tick: 121 })],
    ['rng', state({ rng: 987654322 })],
    ['verdict', state({ verdict: VERDICT.VICTORY })],
    ['player 0 ore', state({ players: [{ ore: 151 }, { ore: 200 }] })],
    ['player 1 ore', state({ players: [{ ore: 150 }, { ore: 201 }] })],
    ['node id', state({ nodes: [{ id: 0, x: 320, y: 320, remaining: 800 }, { id: 2, x: 960, y: 960, remaining: 1500 }] })],
    ['node remaining', state({ nodes: [{ id: 0, x: 320, y: 320, remaining: 799 }, { id: 1, x: 960, y: 960, remaining: 1500 }] })],
    ['entity id', state({ entities: [entity({ id: 1 }), entity({ id: 3, owner: 1, x: 1024, y: 1024 })] })],
    ['entity kind', state({ entities: [entity({ id: 1, kind: KIND.TROOPER }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity owner', state({ entities: [entity({ id: 1, owner: 1 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity x', state({ entities: [entity({ id: 1, x: 129 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity y', state({ entities: [entity({ id: 1, y: 257 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity hp', state({ entities: [entity({ id: 1, hp: 39 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity state', state({ entities: [entity({ id: 1, state: ENTITY_STATE.MOVING }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity targetId', state({ entities: [entity({ id: 1, targetId: 2 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity cooldown', state({ entities: [entity({ id: 1, cooldown: 5 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity progress', state({ entities: [entity({ id: 1, progress: 0.5 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity destX', state({ entities: [entity({ id: 1, destX: 640 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['entity destY', state({ entities: [entity({ id: 1, destY: 640 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] })],
    ['nextEntityId', state({ nextEntityId: 4 })],
  ])('changes when %s changes', (_field, mutated) => {
    expect(hashState(mutated)).not.toBe(baseline);
  });

  it('changes when two entities swap ids — position in the array is not identity', () => {
    const swapped = state({
      entities: [entity({ id: 2 }), entity({ id: 1, owner: 1, x: 1024, y: 1024 })],
    });
    expect(hashState(swapped)).not.toBe(baseline);
  });

  it('distinguishes a field-order swap between two entities', () => {
    // Entity 1 and entity 2 exchange their x values. Total is unchanged; a hash
    // that summed or XORed positions without positional weight would collide.
    const swappedX = state({
      entities: [entity({ id: 1, x: 1024 }), entity({ id: 2, owner: 1, x: 128, y: 1024 })],
    });
    expect(hashState(swappedX)).not.toBe(baseline);
  });

  it('distinguishes players whose ore values are exchanged', () => {
    const exchanged = state({ players: [{ ore: 200 }, { ore: 150 }] });
    expect(hashState(exchanged)).not.toBe(baseline);
  });

  it('is sensitive to a sub-ulp float difference', () => {
    // ADR-001 rejects rounding precisely so this case fails loudly. If this test
    // ever passes by returning an equal hash, exact-bit encoding has been lost
    // and the corpus can no longer detect cross-platform divergence.
    const nudged = state({ entities: [entity({ id: 1, x: 128 + Number.EPSILON * 128 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] });
    expect(nudged.entities[0]?.x).not.toBe(128);
    expect(hashState(nudged)).not.toBe(baseline);
  });
});

describe('hash ignores everything presentational', () => {
  it('is unchanged by fields that are not part of simulation state', () => {
    const withJunk = { ...state(), camera: { x: 12, y: 44 }, selection: [1, 2], alpha: 0.62 };
    expect(hashState(withJunk as SimState)).toBe(hashState(state()));
  });
});

describe('destination sentinel', () => {
  it('distinguishes "no destination" from a destination at the origin', () => {
    // -1 is the sentinel and 0 is a real coordinate. A hash that treated the
    // sentinel as just another number would still separate these, but a model
    // that used 0 or null for "none" would not — which is why the sentinel is
    // -1 and why this assertion exists.
    const none = state({ entities: [entity({ id: 1, destX: -1, destY: -1 })] });
    const origin = state({ entities: [entity({ id: 1, destX: 0, destY: 0 })] });
    expect(hashState(none)).not.toBe(hashState(origin));
  });
});

describe('numeric edge cases (T009)', () => {
  it('normalises -0 to 0', () => {
    const negZero = state({ entities: [entity({ id: 1, x: -0 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] });
    const posZero = state({ entities: [entity({ id: 1, x: 0 }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] });
    expect(Object.is(negZero.entities[0]?.x, -0)).toBe(true);
    expect(hashState(negZero)).toBe(hashState(posZero));
  });

  it('throws on NaN rather than hashing it', () => {
    const nan = state({ entities: [entity({ id: 1, x: NaN }), entity({ id: 2, owner: 1, x: 1024, y: 1024 })] });
    expect(() => hashState(nan)).toThrowError(/NaN/);
  });

  it('names the offending field when it throws, so the defect is findable', () => {
    const nan = state({ entities: [entity({ id: 7, hp: NaN })] });
    expect(() => hashState(nan)).toThrowError(/hp/);
  });

  it('throws on Infinity too — it is equally a defect', () => {
    const inf = state({ entities: [entity({ id: 1, y: Infinity })] });
    expect(() => hashState(inf)).toThrowError(/finite|Infinity/i);
  });
});
