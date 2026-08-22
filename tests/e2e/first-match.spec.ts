import { expect, test } from '@playwright/test';

import { VERDICT, openGame, startMatch } from './helpers';

/**
 * TC-E2E-001 / JRN-001 — first match, cold load to victory. SMOKE.
 *
 * The journey is authoritative and its steps are followed in order. Where a step
 * describes something only a human can judge ("both bases visible without moving
 * a camera"), the test asserts the structural fact that makes it true rather than
 * pretending to see — a fixed canvas size and no scroll container.
 */

test.describe('JRN-001 — first match', () => {
  test('STEP-001: a cold load shows the difficulty gate and nothing else', async ({ page }) => {
    await openGame(page);

    const gate = page.getByTestId('difficulty-gate');
    await expect(gate).toBeVisible();

    // FR-001 is "the gate AND NOTHING ELSE". Asserting the gate is visible would
    // pass on a page that also showed the match behind it.
    await expect(page.getByTestId('game-canvas')).toBeHidden();
    await expect(page.getByTestId('result-screen')).toBeHidden();

    // Exactly three options, self-declaring — no difficulty jargon to decode.
    await expect(page.getByTestId('difficulty-easy')).toBeVisible();
    await expect(page.getByTestId('difficulty-normal')).toBeVisible();
    await expect(page.getByTestId('difficulty-hard')).toBeVisible();
    await expect(gate.locator('[data-testid^=difficulty-]')).toHaveCount(3);
  });

  test('STEP-001: first render is under 3 seconds', async ({ page }) => {
    const started = Date.now();
    await openGame(page);
    await page.getByTestId('difficulty-gate').waitFor({ state: 'visible' });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test('STEP-002: choosing a difficulty dismisses the gate and starts the match', async ({
    page,
  }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    await expect(page.getByTestId('difficulty-gate')).toBeHidden();
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('STEP-003: ore rises with no player input at all', async ({ page }) => {
    // FR-006: workers gather from tick 0. This is the step that proves a new
    // player who touches nothing still sees the game doing something.
    await openGame(page);
    await startMatch(page, 'easy');

    const before = await page.evaluate(() => window.__tmw!.ore());
    await expect
      .poll(async () => page.evaluate(() => window.__tmw!.ore()), { timeout: 20_000 })
      .toBeGreaterThan(before);
  });

  test('STEP-004: the playfield is one fixed screen — no scroll, no camera', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    // FR-014. A camera would show up as a scrollable container; a fixed screen
    // cannot scroll because there is nothing outside it.
    const scrollable = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return {
        x: el.scrollWidth > el.clientWidth,
        y: el.scrollHeight > el.clientHeight,
      };
    });
    expect(scrollable).toEqual({ x: false, y: false });
  });

  test('STEP-007: the build bar is exactly five flat entries, always visible', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    const bar = page.getByTestId('build-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-testid^=build-]')).toHaveCount(5);

    // "Never nested" (FR-010): no entry may contain another entry.
    const nested = await bar.locator('[data-testid^=build-] [data-testid^=build-]').count();
    expect(nested).toBe(0);
  });

  test('STEP-010: destroying the enemy Base shows Victory with a duration', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    // A match is six to ten minutes by design, so the verdict is forced rather
    // than played. What is under test here is the RESULT path, not combat —
    // combat is covered headlessly and by the replay corpus.
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.VICTORY);

    const result = page.getByTestId('result-screen');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/victory/i);
    await expect(page.getByTestId('match-duration')).toBeVisible();
    await expect(page.getByTestId('rematch')).toBeVisible();
  });
});

test.describe('the test hook is not a production backdoor', () => {
  test('exposes no test hook without the flag', async ({ page }) => {
    // The hook can read and force simulation state. A debug affordance nobody
    // checks is closed is one that quietly stays open.
    await page.goto('/');
    expect(await page.evaluate(() => window.__tmw === undefined)).toBe(true);
  });
});
