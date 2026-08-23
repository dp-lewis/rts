import { expect, test } from '@playwright/test';

import { openGame, startMatch } from './helpers';

/**
 * TC-E2E-003 / JRN-003 — "losing without noticing".
 *
 * The journey's title is the requirement: a player whose attention is on their
 * own army must be told their Base is being hit, in time to respond. FR-033 adds
 * the half that is easy to get wrong — sudden-death damage must NOT read as an
 * attack, because a Base dying with no attacker on screen while the UI shouts
 * "under attack" reads as a bug rather than a rule.
 */

test.describe('JRN-003 — under attack', () => {
  test('STEP-002: the indicator is hidden until an owned entity is damaged', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');
    await expect(page.getByTestId('under-attack-indicator')).toBeHidden();
  });

  test('STEP-002: damage from an enemy raises the indicator', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    await page.evaluate(() => window.__tmw!.damageOwnBase('enemy'));
    await expect(page.getByTestId('under-attack-indicator')).toBeVisible();
  });

  test('FR-033: sudden-death damage does NOT raise the under-attack indicator', async ({
    page,
  }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    await page.evaluate(() => window.__tmw!.damageOwnBase('suddenDeath'));

    await expect(page.getByTestId('sudden-death-indicator')).toBeVisible();
    await expect(page.getByTestId('under-attack-indicator')).toBeHidden();
  });

  test('the two indicators are distinguishable, not one element relabelled', async ({ page }) => {
    // CR-001 asks for a DISTINCT indicator. Reusing one element with different
    // text would satisfy a careless test and still leave the player reading an
    // attack warning when nobody is attacking.
    await openGame(page);
    await startMatch(page, 'easy');

    const attack = page.getByTestId('under-attack-indicator');
    const sudden = page.getByTestId('sudden-death-indicator');
    expect(await attack.count()).toBe(1);
    expect(await sudden.count()).toBe(1);
  });
});
