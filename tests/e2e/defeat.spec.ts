import { expect, test } from '@playwright/test';

import { VERDICT, openGame, startMatch } from './helpers';

/**
 * TC-E2E-008 / EDGE-007 / FR-017 — the defeat path.
 *
 * P0 in the journey, and the reason is retention rather than correctness: a
 * result screen that treats losing as a lesser state is where a bounded game
 * loses the player it just beat. Defeat must offer exactly what victory offers.
 */

test.describe('EDGE-007 — losing', () => {
  test('defeat is stated plainly, not softened or hidden', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'hard');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.DEFEAT);

    const result = page.getByTestId('result-screen');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/defeat/i);
  });

  test('Rematch is still the primary action after a loss', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'hard');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.DEFEAT);

    const rematch = await page.getByTestId('rematch').boundingBox();
    const change = await page.getByTestId('change-difficulty').boundingBox();
    expect(rematch!.width * rematch!.height).toBeGreaterThan(change!.width * change!.height);
  });

  test('the defeat screen offers no more steps than the victory screen', async ({ page }) => {
    // EDGE-001 of JRN-002: "no penalty, no extra step, no post-mortem". An extra
    // control on defeat is exactly how a post-mortem sneaks in.
    await openGame(page);
    await startMatch(page, 'easy');

    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.VICTORY);
    const onVictory = await page.getByTestId('result-screen').locator('button').count();

    await page.getByTestId('rematch').click();
    await page.getByTestId('game-canvas').waitFor({ state: 'visible' });
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.DEFEAT);
    const onDefeat = await page.getByTestId('result-screen').locator('button').count();

    expect(onDefeat).toBe(onVictory);
  });

  test('EDGE-009: a simultaneous kill is an explicit Draw, not an arbitrary winner', async ({
    page,
  }) => {
    await openGame(page);
    await startMatch(page, 'normal');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.DRAW);

    const result = page.getByTestId('result-screen');
    await expect(result).toContainText(/draw/i);
    await expect(page.getByTestId('rematch')).toBeVisible();
  });
});
