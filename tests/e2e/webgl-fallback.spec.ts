import { expect, test } from '@playwright/test';

/**
 * TC-E2E-004 / EDGE-001 / FR-024 — WebGL unavailable.
 *
 * Newly reachable rather than theoretical: Phaser 4 replaced the v3 pipeline with
 * a node-based render architecture and deprecated Canvas, so a machine without
 * WebGL has no fallback renderer at all (research RF-6). Without this the player
 * gets a blank rectangle and no explanation — the single worst failure mode a
 * browser game has, because it is indistinguishable from a broken site.
 */

test.describe('EDGE-001 — no WebGL', () => {
  test.beforeEach(async ({ page }) => {
    // Refuse every WebGL context before any application code runs.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patched(
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
          return null;
        }
        return (original as never as (t: string, ...r: unknown[]) => unknown).call(
          this,
          type,
          ...rest,
        );
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
  });

  test('shows a plain readable message instead of a blank rectangle', async ({ page }) => {
    await page.goto('/?test=1');

    const fallback = page.getByTestId('webgl-fallback');
    await expect(fallback).toBeVisible();

    // "Plain and human-readable" is the requirement, so the assertion is about
    // the TEXT being real prose — not a code, not an exception message.
    const text = (await fallback.textContent())?.trim() ?? '';
    expect(text.length).toBeGreaterThan(30);
    expect(text).toMatch(/webgl/i);
    expect(text).not.toMatch(/undefined|null|\[object|Error:/i);
  });

  test('does not leave a dead canvas on screen beside the message', async ({ page }) => {
    await page.goto('/?test=1');
    await page.getByTestId('webgl-fallback').waitFor({ state: 'visible' });
    await expect(page.getByTestId('game-canvas')).toBeHidden();
  });

  test('does not show the difficulty gate, which would lead nowhere', async ({ page }) => {
    await page.goto('/?test=1');
    await page.getByTestId('webgl-fallback').waitFor({ state: 'visible' });
    await expect(page.getByTestId('difficulty-gate')).toBeHidden();
  });
});
