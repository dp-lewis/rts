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
    c.completeMatch(7200);
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
    c.completeMatch(7434);
    expect(c.snapshot().durationTicks).toEqual([7434]);
  });

  it('survives a reload', () => {
    const store = new MemoryStorage();
    useStorage(store);
    const first = new SessionCounters();
    first.startMatch(0, false);
    first.completeMatch(6000);

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
      c.completeMatch(6000 + i);
    }
    const s = c.snapshot();
    expect(s.durationTicks.length).toBeLessThanOrEqual(200);
    expect(s.timeToFirstAction.length).toBeLessThanOrEqual(200);
    // The counts themselves are not samples and must survive intact.
    expect(s.matchesStarted).toBe(260);
    expect(s.durationTicks.at(-1)).toBe(6259);
  });
});
