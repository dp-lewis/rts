import { expect, test } from '@playwright/test';

import { openGame, startMatch } from './helpers';

/**
 * TC-E2E-006 / EDGE-004 / FR-011 — insufficient ore.
 *
 * "Greyed with its cost shown inline; no dialog, no error toast, nothing hidden."
 * All three negatives matter. Hiding what you cannot afford is the common
 * alternative and it is worse: it removes the information that tells a new player
 * how long to keep mining, and makes the bar's contents change under them.
 */

test.describe('EDGE-004 — cannot afford it', () => {
  test('the unaffordable entry is greyed but still shows its cost', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    // Starting ore is 150; a Barracks costs 150 and a Factory 200.
    const tank = page.getByTestId('build-factory');
    await expect(tank).toBeVisible();
    await expect(tank).toHaveAttribute('aria-disabled', 'true');
    await expect(tank).toContainText('200');
  });

  test('nothing is hidden — every entry stays on screen', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');
    await expect(page.getByTestId('build-bar').locator('[data-testid^=build-]')).toHaveCount(2);
  });

  test('clicking it opens no dialog and spends nothing', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    const before = await page.evaluate(() => window.__tmw!.ore());
    await page.getByTestId('build-factory').click({ force: true });

    await expect(page.locator('dialog, [role=dialog], [role=alertdialog]')).toHaveCount(0);
    await expect(page.locator('[role=alert]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__tmw!.ore())).toBeLessThanOrEqual(before);
  });

  test('an affordable entry is not greyed, so the state means something', async ({ page }) => {
    // Without this the test would pass on a bar where EVERY entry is disabled.
    await openGame(page);
    await startMatch(page, 'easy');
    await expect(page.getByTestId('build-barracks')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('the greyed state clears once the ore arrives', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    await page.evaluate(() => window.__tmw!.setOre(500));
    await expect(page.getByTestId('build-factory')).not.toHaveAttribute('aria-disabled', 'true');
  });
});
