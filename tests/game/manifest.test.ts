import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ORE_KEY, TILE_KEYS, spriteKey, spriteManifest } from '../../src/assets/sprites';
import { KIND } from '../../src/sim/state';

/**
 * T049 — the roster must name files that exist.
 *
 * A mistyped sprite number does not throw: Phaser logs a missing-texture warning
 * and draws a green box, which is easy to miss in a moving match and impossible
 * to see in CI. Checking the manifest against the filesystem turns that into a
 * failing test in milliseconds, without a browser.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

describe('sprite manifest', () => {
  const manifest = spriteManifest();

  it('names a file that exists on disk for every texture', () => {
    const missing = manifest
      .map((asset) => ({ ...asset, full: resolve(REPO_ROOT, asset.path.replace(/^\/+/, '')) }))
      .filter((asset) => !existsSync(asset.full))
      .map((asset) => `${asset.key} -> ${asset.path}`);

    expect(missing).toEqual([]);
  });

  it('uses a distinct key per texture', () => {
    const keys = manifest.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every kind in the simulation', () => {
    // Built from KIND rather than hand-listed, so a kind added in a later
    // milestone without art fails here instead of drawing nothing in a match.
    const keys = new Set(manifest.map((a) => a.key));
    for (const kind of Object.values(KIND)) {
      for (const owner of [0, 1] as const) {
        expect(keys.has(spriteKey(kind, owner)), `no texture for kind ${kind}`).toBe(true);
      }
    }
    expect(keys.has(ORE_KEY)).toBe(true);
    for (const tile of TILE_KEYS) {
      expect(keys.has(tile)).toBe(true);
    }
  });

  it('gives the two players different art for the same unit kind', () => {
    // Colour is the redundant channel behind the ring (FR-018). If both sides
    // resolved to one family the ring would be the ONLY cue rather than the
    // primary one, and a single regression would remove ownership entirely.
    for (const kind of [KIND.WORKER, KIND.SCOUT, KIND.TROOPER, KIND.TANK]) {
      const zero = manifest.find((a) => a.key === spriteKey(kind, 0))?.path;
      const one = manifest.find((a) => a.key === spriteKey(kind, 1))?.path;
      expect(zero).not.toBe(one);
    }
  });
});
