import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionCounters } from '../../src/game/hud/counters';

/**
 * T072 / FR-025 — the session counters.
 *
 * Pure logic behind a `localStorage` call, sitting at 0% coverage because it
 * lives in a directory full of Phaser and DOM classes. That is the M6-F3 lesson
 * for the third time: a decision trapped beside a framework is a decision nobody
 * tests. These are the numbers M8's tuning and M9's playtest are supposed to
 * read, so "recorded" needs to mean recorded.
 */

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem = (k: string): string | null => this.map.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.map.set(k, v);
  removeItem = (k: string): void => void this.map.delete(k);
  clear = (): void => this.map.clear();
  key = (): string | null => null;
  get length(): number {
    return this.map.size;
  }
}

function useStorage(store: unknown): void {
  vi.stubGlobal('localStorage', store);
}

beforeEach(() => {
  useStorage(new MemoryStorage());
});

describe('recording a session', () => {
  it('counts matches started and completed separately', () => {
    const c = new SessionCounters();
    c.startMatch(0, false);
    c.completeMatch(7200, 1);
    c.startMatch(1000, true);
    // Second match abandoned, not completed.

    const s = c.snapshot();
    expect(s.matchesStarted).toBe(2);
    expect(s.matchesCompleted).toBe(1);
    expect(s.rematches).toBe(1);
  });

  it('records time-to-first-action relative to the match, not the page', () => {
    // K3 in metrics.md, and research's best early signal of whether the game
    // explains itself. Measured from match start — a value relative to page load
    // would fold in however long the player sat on the difficulty gate.
    const c = new SessionCounters();
    c.startMatch(5_000, false);
    c.recordFirstAction(6_200);
    expect(c.snapshot().timeToFirstAction).toEqual([1200]);
  });

  it('takes only the FIRST action of a match', () => {
    const c = new SessionCounters();
    c.startMatch(0, false);
    c.recordFirstAction(400);
    c.recordFirstAction(900);
    c.recordFirstAction(1500);
    expect(c.snapshot().timeToFirstAction).toEqual([400]);
  });

  it('re-arms for the next match, so a rematch gets its own reading', () => {
    const c = new SessionCounters();
    c.startMatch(0, false);
    c.recordFirstAction(300);
    c.startMatch(10_000, true);
    c.recordFirstAction(10_800);
    expect(c.snapshot().timeToFirstAction).toEqual([300, 800]);
  });

  it('records duration in TICKS, which is exact', () => {
    // Wall-clock would drift with frame rate and background-tab throttling; the
    // tick count is the simulation's own clock and cannot.
    const c = new SessionCounters();
    c.startMatch(0, false);
    c.completeMatch(7434, 2);
    expect(c.snapshot().durationTicks).toEqual([7434]);
  });

  it('survives a reload', () => {
    const store = new MemoryStorage();
    useStorage(store);
    const first = new SessionCounters();
    first.startMatch(0, false);
    first.completeMatch(6000, 1);

    useStorage(store);
    expect(new SessionCounters().snapshot().matchesCompleted).toBe(1);
  });

  it('hands back a copy, not the live object', () => {
    const c = new SessionCounters();
    c.startMatch(0, false);
    const snap = c.snapshot();
    snap.matchesStarted = 999;
    expect(c.snapshot().matchesStarted).toBe(1);
  });
});

describe('storage is a convenience, never a failure path', () => {
  it('starts empty when localStorage throws on read', () => {
    useStorage({
      getItem: () => {
        throw new Error('SecurityError: storage disabled');
      },
      setItem: () => undefined,
    });
    expect(() => new SessionCounters()).not.toThrow();
    expect(new SessionCounters().snapshot().matchesStarted).toBe(0);
  });

  it('keeps counting when localStorage throws on write', () => {
    // Private browsing and quota-exceeded both throw on setItem. Losing a
    // diagnostic must never take the game down with it.
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    const c = new SessionCounters();
    expect(() => c.startMatch(0, false)).not.toThrow();
    expect(c.snapshot().matchesStarted).toBe(1);
  });

  it('ignores stored data that is not shaped like counters', () => {
    const store = new MemoryStorage();
    store.setItem('tmw.counters.v1', '{"matchesStarted":"lots"}');
    useStorage(store);
    // Reading garbage must not produce NaN counters downstream.
    const c = new SessionCounters();
    c.startMatch(0, false);
    expect(Number.isFinite(c.snapshot().matchesStarted)).toBe(true);
  });
});

describe('a long session cannot grow without bound', () => {
  it('keeps the most recent samples and drops the rest', () => {
    // Rematch IS the retention loop for a bounded game, so a keen player can run
    // hundreds of matches in a sitting. localStorage has a hard quota, and the
    // failure mode is a throw on write rather than a warning.
    const c = new SessionCounters();
    for (let i = 0; i < 260; i += 1) {
      c.startMatch(i * 1000, i > 0);
      c.recordFirstAction(i * 1000 + i);
      c.completeMatch(6000 + i, 1);
    }
    const s = c.snapshot();
    expect(s.durationTicks.length).toBeLessThanOrEqual(200);
    expect(s.timeToFirstAction.length).toBeLessThanOrEqual(200);
    // The counts themselves are not samples and must survive intact.
    expect(s.matchesStarted).toBe(260);
    expect(s.durationTicks.at(-1)).toBe(6259);
  });
});

describe('the readings M9 is scored against', () => {
  // pre-impl F-3: comprehension does not prove the game is beatable, and an AI
  // written by someone who knows the game is the most common way a solo project
  // ships something unwinnable. So M9's second exit criterion is "at least 3 of 5
  // players WIN at least one match on New to this" — which completion alone
  // cannot answer, and which the counters could not report until now.
  const VICTORY = 1;
  const DEFEAT = 2;
  const DRAW = 3;
  const EASY = 0;

  it('records who won, not merely that the match ended', () => {
    const c = new SessionCounters();
    c.startMatch(0, false, EASY);
    c.completeMatch(7200, DEFEAT);
    c.startMatch(1000, true, EASY);
    c.completeMatch(7400, VICTORY);

    expect(c.snapshot().outcomes).toEqual([DEFEAT, VICTORY]);
  });

  it('attributes each outcome to the difficulty it was played on', () => {
    // "Won at least one match ON NEW TO THIS" — a win on Hard does not satisfy
    // the criterion, so the level has to travel with the result.
    const c = new SessionCounters();
    c.startMatch(0, false, 2);
    c.completeMatch(6000, VICTORY);
    c.startMatch(1, true, EASY);
    c.completeMatch(6000, VICTORY);

    const s = c.snapshot();
    const wonOnEasy = s.outcomes.some((o, i) => o === VICTORY && s.difficulties[i] === EASY);
    expect(wonOnEasy).toBe(true);
    expect(s.difficulties).toEqual([2, EASY]);
  });

  it('counts a draw as completed but not as a win', () => {
    const c = new SessionCounters();
    c.startMatch(0, false, EASY);
    c.completeMatch(7000, DRAW);

    const s = c.snapshot();
    expect(s.matchesCompleted).toBe(1);
    expect(s.outcomes.filter((o) => o === VICTORY)).toHaveLength(0);
  });

  it('measures K2 from PAGE LOAD, not from match start', () => {
    // metrics.md defines K2 against page load on purpose: the difficulty gate is
    // part of what a first-timer has to work out, and time spent deciding there
    // is time spent not playing. `performance.now()` is measured from page load
    // by definition, so the reading needs no bookkeeping of its own.
    const c = new SessionCounters();
    c.startMatch(12_000, false, EASY); // player sat on the gate for 12s
    c.recordFirstAction(18_500);

    const s = c.snapshot();
    expect(s.timeToFirstActionFromLoad).toBe(18_500);
    expect(s.timeToFirstAction).toEqual([6500]); // from match start, and different
  });

  it('keeps the FIRST session reading of K2, not the most recent', () => {
    // After one match the player knows what the screen is, so a later reading
    // measures familiarity rather than comprehension.
    const c = new SessionCounters();
    c.startMatch(1000, false, EASY);
    c.recordFirstAction(4000);
    c.startMatch(60_000, true, EASY);
    c.recordFirstAction(60_500);

    expect(c.snapshot().timeToFirstActionFromLoad).toBe(4000);
  });

  it('keeps outcomes and difficulties aligned when trimmed', () => {
    // They are read together by index; trimming one without the other would
    // silently reattribute every win to the wrong difficulty.
    const c = new SessionCounters();
    for (let i = 0; i < 240; i += 1) {
      c.startMatch(i * 1000, i > 0, i % 3);
      c.completeMatch(6000, i % 2 === 0 ? VICTORY : DEFEAT);
    }
    const s = c.snapshot();
    expect(s.outcomes.length).toBe(s.difficulties.length);
    expect(s.outcomes.length).toBeLessThanOrEqual(200);
  });

  it('survives storage written by a build that had no outcomes field', () => {
    const store = new MemoryStorage();
    store.setItem(
      'tmw.counters.v1',
      JSON.stringify({ matchesStarted: 3, matchesCompleted: 2, durationTicks: [6000, 7000] }),
    );
    useStorage(store);

    const s = new SessionCounters().snapshot();
    expect(s.outcomes).toEqual([]);
    expect(s.difficulties).toEqual([]);
    expect(s.timeToFirstActionFromLoad).toBeNull();
    expect(s.matchesCompleted).toBe(2);
  });
});
