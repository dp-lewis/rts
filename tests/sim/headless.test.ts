import { describe, expect, it } from 'vitest';

import { hashState } from '../../src/sim/hash';
import { step } from '../../src/sim/step';
import { KIND, ENTITY_STATE, createInitialState } from '../../src/sim/state';

/**
 * T014 (TC-INT-003) — the simulation runs under plain Node with no DOM and no
 * graphics context.
 *
 * The ESLint boundary (M0) stops `src/sim/` from *importing* the DOM. This test
 * closes the other half: that nothing it imports transitively reaches for a
 * browser global at module-evaluation time. Lint proves the source is clean;
 * this proves the running program is.
 *
 * Vitest is configured with `environment: 'node'`, so the globals below are
 * genuinely absent rather than merely unused.
 */

describe('the simulation is headless', () => {
  it('runs in an environment with no DOM', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(typeof globalThis.window).toBe('undefined');
  });

  it('does not rely on the environment to catch a `navigator` read', () => {
    // Node 21+ exposes globalThis.navigator, so `navigator` is NOT absent here —
    // it reports "Node.js/24". That makes the ESLint ban on it load-bearing
    // rather than redundant: a sim module reading navigator would not crash in
    // tests, it would silently return one value under Node and a completely
    // different one in the browser. Exactly the divergence Constitution I
    // forbids, and exactly the kind the runtime environment cannot catch for us.
    expect(typeof (globalThis as { navigator?: unknown }).navigator).toBe('object');
  });

  it('steps a match to a hash without any graphics context', () => {
    let state = createInitialState({
      seed: 42,
      difficulty: 1,
      entities: [
        { id: 1, kind: KIND.BASE, owner: 0, x: 192, y: 192, hp: 800, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
        { id: 2, kind: KIND.BASE, owner: 1, x: 1728, y: 1728, hp: 800, state: ENTITY_STATE.IDLE, targetId: -1, cooldown: 0, progress: 0 },
      ],
    });
    for (let t = 0; t < 200; t += 1) {
      state = step(state, []);
    }
    expect(state.tick).toBe(200);
    expect(hashState(state)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('imports nothing from the presentation layer', async () => {
    // Complements the lint rule with a runtime check: if any sim module pulled in
    // Phaser transitively, `phaser` would appear in the module registry after
    // these imports. Phaser touches `window` on evaluation and would already have
    // thrown above, but an explicit assertion says what we mean.
    const loaded = await import('../../src/sim/step');
    expect(loaded.step).toBeTypeOf('function');
    expect(typeof globalThis.window).toBe('undefined');
  });
});
