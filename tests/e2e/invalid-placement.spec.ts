import { expect, test } from '@playwright/test';

import { openGame, startMatch } from './helpers';

/**
 * TC-E2E-007 / EDGE-005 / FR-013 — invalid placement.
 *
 * "The ghost shows an invalid state and the click is refused inline; no error
 * dialog." A modal would interrupt a real-time game to report something the
 * player can already see, and would arrive after the mistake instead of before.
 */

test.describe('EDGE-005 — placing a Factory somewhere it cannot go', () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');
    await page.evaluate(() => window.__tmw!.setOre(600));
  });

  test('selecting Factory arms placement and shows a ghost that follows the cursor', async ({
    page,
  }) => {
    await page.getByTestId('build-factory').click();

    const canvas = (await page.getByTestId('game-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.3);

    await expect
      .poll(async () => page.evaluate(() => window.__tmw!.ghost()?.visible ?? false))
      .toBe(true);
  });

  test('the ghost reads valid on open ground and invalid over the Base', async ({ page }) => {
    await page.getByTestId('build-factory').click();
    const canvas = (await page.getByTestId('game-canvas').boundingBox())!;

    // Open ground, well clear of either base.
    await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.85);
    await expect.poll(async () => page.evaluate(() => window.__tmw!.ghost()?.valid)).toBe(true);

    // Over the player's own Base, which occupies its cell.
    const base = await page.evaluate(() => window.__tmw!.ownBaseScreenPoint());
    await page.mouse.move(base.x, base.y);
    await expect.poll(async () => page.evaluate(() => window.__tmw!.ghost()?.valid)).toBe(false);
  });

  test('clicking an invalid cell is refused inline, with no dialog and no charge', async ({
    page,
  }) => {
    await page.getByTestId('build-factory').click();
    const before = await page.evaluate(() => window.__tmw!.ore());

    const base = await page.evaluate(() => window.__tmw!.ownBaseScreenPoint());
    await page.mouse.move(base.x, base.y);
    await page.mouse.click(base.x, base.y);

    await expect(page.locator('dialog, [role=dialog], [role=alertdialog]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__tmw!.ore())).toBe(before);
    expect(await page.evaluate(() => window.__tmw!.factoryCount())).toBe(0);
  });

  test('clicking a valid cell commits the placement and deducts the ore', async ({ page }) => {
    // The control for the test above: refusal must mean something, which it only
    // does if acceptance is also demonstrated.
    await page.getByTestId('build-factory').click();
    const before = await page.evaluate(() => window.__tmw!.ore());

    const canvas = (await page.getByTestId('game-canvas').boundingBox())!;
    const x = canvas.x + canvas.width * 0.5;
    const y = canvas.y + canvas.height * 0.85;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);

    await expect.poll(async () => page.evaluate(() => window.__tmw!.factoryCount())).toBe(1);
    expect(await page.evaluate(() => window.__tmw!.ore())).toBeLessThan(before);
  });
});
