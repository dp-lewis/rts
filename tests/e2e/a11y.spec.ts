import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { VERDICT, openGame, startMatch } from './helpers';

/**
 * TC-E2E-009 / T066 / FR-018 — the automated WCAG-AA floor.
 *
 * A deterministic minimum bar, NOT a substitute for manual review. It is scoped
 * to the DOM surfaces on purpose: axe cannot see inside a canvas, so running it
 * over a canvas-drawn UI would report zero violations because there is nothing
 * there to audit. That vacuous pass is precisely why the gate, the result screen
 * and the fallback are DOM — the same failure shape as M0's empty-config Red and
 * M5's coverage report, both of which were green for want of anything to check.
 *
 * The in-match world is genuinely a canvas and cannot be audited this way. Its
 * accessibility claim is FR-018's underglow ring — a non-colour ownership cue,
 * verified visually in greyscale by the T081 spike and pinned by unit tests.
 */

const CRITICAL = ['critical', 'serious'];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}

interface Violation {
  id: string;
  impact?: string | null | undefined;
  nodes: unknown[];
}

function fatal(violations: Violation[]): string[] {
  return violations
    .filter((v) => CRITICAL.includes(v.impact ?? ''))
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes)`);
}

test.describe('WCAG-AA floor — zero critical violations', () => {
  test('the difficulty gate', async ({ page }) => {
    await openGame(page);
    await page.getByTestId('difficulty-gate').waitFor({ state: 'visible' });
    expect(fatal((await scan(page)).violations)).toEqual([]);
  });

  test('the result screen', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');
    await page.evaluate((v) => window.__tmw!.forceVerdict(v), VERDICT.VICTORY);
    await page.getByTestId('result-screen').waitFor({ state: 'visible' });
    expect(fatal((await scan(page)).violations)).toEqual([]);
  });

  test('the WebGL-unavailable fallback', async ({ page }) => {
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
    await page.goto('/?test=1');
    await page.getByTestId('webgl-fallback').waitFor({ state: 'visible' });
    expect(fatal((await scan(page)).violations)).toEqual([]);
  });

  test('the in-match HUD, which is DOM and therefore auditable', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'easy');
    expect(fatal((await scan(page)).violations)).toEqual([]);
  });

  test('the scan is actually finding elements to audit', async ({ page }) => {
    // The control on the whole file. axe reports zero violations for a page with
    // nothing in it, so a suite of "zero violations" assertions can be perfectly
    // green over an empty DOM. Assert that each surface presented real nodes.
    await openGame(page);
    await page.getByTestId('difficulty-gate').waitFor({ state: 'visible' });
    const results = await scan(page);
    expect(results.passes.length).toBeGreaterThan(3);
  });
});
