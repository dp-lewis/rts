import { expect, test } from '@playwright/test';

import { openGame } from './helpers';

/**
 * TC-E2E-005 / EDGE-002 / FR-026 — keyboard-only difficulty selection.
 *
 * This is the requirement that decides the gate cannot be drawn on the canvas.
 * A canvas has no focusable elements and no focus ring, so "tab to an option and
 * press Enter, with focus visible throughout" is not implementable there at all.
 */

test.describe('EDGE-002 — keyboard only', () => {
  test('every difficulty option is reachable by Tab, in reading order', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('difficulty-gate').waitFor({ state: 'visible' });

    // The gate focuses its first option on show, so the walk starts from
    // whatever already has focus rather than assuming focus is nowhere. Asserting
    // a fixed sequence from a blind Tab was testing the autofocus, not the tab
    // order — it reported ['normal', 'hard', 'easy'] purely because the first
    // press moved OFF the already-focused option.
    const focused = async (): Promise<string | null> =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

    const order: string[] = [];
    const first = await focused();
    if (first !== null) {
      order.push(first);
    }
    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press('Tab');
      const id = await focused();
      if (id !== null) {
        order.push(id);
      }
    }

    expect(order).toEqual(['difficulty-easy', 'difficulty-normal', 'difficulty-hard']);
  });

  test('Enter on a focused option starts the match', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('difficulty-normal').focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('game-canvas')).toBeVisible();
    await expect(page.getByTestId('difficulty-gate')).toBeHidden();
  });

  test('Space also activates, because a button that ignores Space is broken', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('difficulty-hard').focus();
    await page.keyboard.press(' ');
    await expect(page.getByTestId('game-canvas')).toBeVisible();
  });

  test('focus is VISIBLE, not merely present', async ({ page }) => {
    // The failure this catches is a global `outline: none` reset, which leaves
    // the gate perfectly keyboard-operable and completely unusable without a
    // mouse, because nothing shows where you are.
    await openGame(page);
    const option = page.getByTestId('difficulty-easy');
    await option.focus();

    const style = await option.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
    });

    const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const hasRing = style.boxShadow !== 'none' && style.boxShadow !== '';
    expect(hasOutline || hasRing).toBe(true);
  });

  test('the first Tab lands inside the gate, not on browser chrome', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('Tab');
    const inGate = await page.evaluate(
      () => document.activeElement?.closest('[data-testid=difficulty-gate]') !== null,
    );
    expect(inGate).toBe(true);
  });
});
