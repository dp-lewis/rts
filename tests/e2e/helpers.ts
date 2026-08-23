import type { Page } from '@playwright/test';

/**
 * Shared E2E helpers.
 *
 * The test hook below is the one affordance E2E needs that the product does not:
 * a match takes six to ten minutes by design (that is the entire premise), so no
 * browser test can play one to a verdict in real time. `?test=1` exposes a narrow
 * read/force API and is the ONLY way the harness reaches into the running game.
 *
 * It is gated strictly on the query parameter, so a production load has no test
 * surface at all — checked by `exposes no test hook without the flag` in
 * first-match.spec.ts, because a debug backdoor nobody verifies is closed is a
 * backdoor that quietly stays open.
 */

export const VERDICT = { NONE: 0, VICTORY: 1, DEFEAT: 2, DRAW: 3 } as const;

/**
 * The read/force surface the harness is allowed. Deliberately small and explicit
 * — every addition here is a piece of the game a test can reach around rather
 * than through, so the list is meant to stay short and to be read as a cost.
 */
export interface TestHook {
  /** Reads. */
  tick: () => number;
  ore: () => number;
  verdict: () => number;
  entityCount: () => number;
  factoryCount: () => number;
  ghost: () => { visible: boolean; valid: boolean } | undefined;
  /** Own Base position in SCREEN px, so a spec need not redo the canvas scaling. */
  ownBaseScreenPoint: () => { x: number; y: number };
  /** Forces — a six-minute match cannot be played to a verdict in a browser test. */
  forceVerdict: (v: number) => void;
  setOre: (amount: number) => void;
  damageOwnBase: (source: 'enemy' | 'suddenDeath') => void;
}

declare global {
  interface Window {
    __tmw?: TestHook;
  }
}

/** Load the game with the test hook enabled. */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
}

/** Pick a difficulty and wait for the match surface to appear. */
export async function startMatch(page: Page, difficulty: 'easy' | 'normal' | 'hard' = 'easy') {
  await page.getByTestId(`difficulty-${difficulty}`).click();
  await page.getByTestId('game-canvas').waitFor({ state: 'visible' });
}

