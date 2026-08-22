import { expect, test } from '@playwright/test';

import { VERDICT, openGame, startMatch } from './helpers';

/**
 * TC-E2E-002 / JRN-002 — the rematch loop. SMOKE.
 *
 * "For a bounded game the rematch button IS the retention loop" (result
 * wireframe). v1 deliberately forgoes the multiplayer retention mechanism every
 * competitor leads with, so this screen carries disproportionate weight and its
 * one button gets a smoke test of its own.
 */

test.describe('JRN-002 — rematch', () => {
  test('STEP-001: the outcome is unambiguous and Rematch is the primary action', async ({
    page,
  }) => {
    await openGame(page);
    await startMatch(page, 'normal');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.VICTORY);

    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('match-duration')).toBeVisible();

    // "Primary and largest" is a visual claim, so it is measured rather than
    // asserted: the rematch control must be bigger than the secondary one.
    const rematch = await page.getByTestId('rematch').boundingBox();
    const change = await page.getByTestId('change-difficulty').boundingBox();
    expect(rematch!.width * rematch!.height).toBeGreaterThan(change!.width * change!.height);
  });

  test('STEP-002: Rematch starts a fresh match without returning to the gate', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'hard');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.VICTORY);

    await page.getByTestId('rematch').click();

    await expect(page.getByTestId('result-screen')).toBeHidden();
    await expect(page.getByTestId('difficulty-gate')).toBeHidden();
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('STEP-003 / EDGE-002: the new match is genuinely fresh, with no state leak', async ({
    page,
  }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    // Let the first match accumulate something worth leaking.
    await expect
      .poll(async () => page.evaluate(() => window.__tmw!.tick()), { timeout: 20_000 })
      .toBeGreaterThan(60);
    const spentMatch = await page.evaluate(() => ({
      tick: window.__tmw!.tick(),
      entities: window.__tmw!.entityCount(),
    }));
    expect(spentMatch.tick).toBeGreaterThan(60);

    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.DEFEAT);
    await page.getByTestId('rematch').click();
    await page.getByTestId('game-canvas').waitFor({ state: 'visible' });

    const fresh = await page.evaluate(() => ({
      tick: window.__tmw!.tick(),
      verdict: window.__tmw!.verdict(),
      entities: window.__tmw!.entityCount(),
    }));
    expect(fresh.tick).toBeLessThan(spentMatch.tick);
    expect(fresh.verdict).toBe(VERDICT.NONE);
    expect(fresh.entities).toBe(6); // the standard opening: 2 Bases, 4 Workers
  });

  test('EDGE-001: rematch after defeat behaves identically — no penalty, no extra step', async ({
    page,
  }) => {
    await openGame(page);
    await startMatch(page, 'easy');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.DEFEAT);

    const result = page.getByTestId('result-screen');
    await expect(result).toContainText(/defeat/i);
    await expect(page.getByTestId('rematch')).toBeVisible();

    await page.getByTestId('rematch').click();
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });
});
