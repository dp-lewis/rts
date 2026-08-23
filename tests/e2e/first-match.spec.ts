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

  test('STEP-003: ore rises once a Worker is trained — the opening move', async ({ page }) => {
    // CHANGED. FR-006 used to read "starting workers auto-gather from tick 0 with
    // no player input", and the assertion here was that a player who touches
    // nothing still sees the game doing something. The tech-tree change removed
    // the starting Workers: a match now begins with a Base and 150 ore, and the
    // first move is the player's.
    //
    // That is a real trade against the research finding that cold-start-straight-
    // into-playable is this game's biggest structural advantage, and it is
    // recorded as a change request rather than buried in a fixture. What the test
    // asserts now is the new promise: one click and the economy starts.
    await openGame(page);
    await startMatch(page, 'easy');

    const before = await page.evaluate(() => window.__tmw!.ore());
    // `ownBaseScreenPoint` converts world px to page px. Clicking the canvas at
    // raw world coordinates misses: the canvas is scaled to fit, so Playwright's
    // element-relative position is not the simulation's coordinate space.
    const base = await page.evaluate(() => window.__tmw!.ownBaseScreenPoint());
    await page.mouse.click(base.x, base.y);
    await page.getByTestId('train-worker').click();

    await expect
      .poll(async () => page.evaluate(() => window.__tmw!.ore()), { timeout: 40_000 })
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

  test('STEP-007: the permanent bar carries the buildings, always visible', async ({ page }) => {
    // CHANGED from FR-010's "exactly five entries — four unit plus one structure".
    // Units moved onto the building that makes them. What is still asserted is
    // what the original requirement was protecting: the bar is never empty and
    // never nested, so a cold-start player always has something to click.
    await openGame(page);
    await startMatch(page, 'easy');

    const bar = page.getByTestId('build-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-testid^=build-]')).toHaveCount(2);
    expect(await bar.locator('[data-testid^=build-] [data-testid^=build-]').count()).toBe(0);
  });

  test('STEP-007: selecting a building shows what it trains', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');

    // Nothing selected: no panel.
    await expect(page.getByTestId('production-panel')).toBeHidden();

    const base = await page.evaluate(() => window.__tmw!.ownBaseScreenPoint());
    await page.mouse.click(base.x, base.y);
    await expect(page.getByTestId('production-panel')).toBeVisible();
    await expect(page.getByTestId('train-worker')).toBeVisible();
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

test.describe('the production panel is an overlay, not a row', () => {
  test('selecting a building does not resize the playfield', async ({ page }) => {
    // Reported from play: "when I click on a building and I get the build option
    // the UI is stacked which makes the canvas size change and it's a bit clunky".
    //
    // The panel was in the document flow, so showing it shrank the stage; Phaser's
    // FIT scaling then recomputed and the whole map jumped. A canvas that resizes
    // mid-match also moves every unit under the cursor, which makes the click you
    // were about to make land somewhere else.
    await openGame(page);
    await startMatch(page, 'easy');

    const size = async () =>
      page.evaluate(() => {
        const r = document.querySelector('canvas')!.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });

    const before = await size();
    expect(before.w).toBeGreaterThan(0);

    const base = await page.evaluate(() => window.__tmw!.ownBaseScreenPoint());
    await page.mouse.click(base.x, base.y);
    await expect(page.getByTestId('production-panel')).toBeVisible();

    expect(await size(), 'the canvas resized when the panel opened').toEqual(before);
  });
});
