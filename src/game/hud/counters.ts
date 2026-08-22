/**
 * Local session counters — T072, FR-025.
 *
 * Time-to-first-action, match duration, completion and rematch count. These are
 * the numbers the M8 tuning pass and the M9 playtest need, and they are the
 * numbers `metrics.md` names — but there is no analytics backend by scope
 * decision, so they stay in memory and in `localStorage` on this machine only.
 * Nothing leaves the page.
 *
 * Time-to-first-action is the interesting one: research identified it as the
 * single best early signal of whether the game explains itself, and it can only
 * be measured from the presentation layer, because "the player did something" is
 * not a simulation event.
 */

const STORAGE_KEY = 'tmw.counters.v1';

export interface Counters {
  matchesStarted: number;
  matchesCompleted: number;
  rematches: number;
  /** Milliseconds from match start to the player's first command, per match. */
  timeToFirstAction: number[];
  /** Match durations in simulation ticks — exact, unlike a wall-clock reading. */
  durationTicks: number[];
}

function empty(): Counters {
  return {
    matchesStarted: 0,
    matchesCompleted: 0,
    rematches: 0,
    timeToFirstAction: [],
    durationTicks: [],
  };
}

export class SessionCounters {
  private data: Counters = empty();
  private matchStartedAt = 0;
  private firstActionRecorded = false;

  constructor() {
    // Wrapped: localStorage throws outright in some privacy modes, and losing a
    // counter must never take the game down with it.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        this.data = { ...empty(), ...(JSON.parse(raw) as Partial<Counters>) };
      }
    } catch {
      this.data = empty();
    }
  }

  startMatch(now: number, isRematch: boolean): void {
    this.matchStartedAt = now;
    this.firstActionRecorded = false;
    this.data.matchesStarted += 1;
    if (isRematch) {
      this.data.rematches += 1;
    }
    this.persist();
  }

  /** Called on the player's first command of a match; later calls are ignored. */
  recordFirstAction(now: number): void {
    if (this.firstActionRecorded) {
      return;
    }
    this.firstActionRecorded = true;
    this.data.timeToFirstAction.push(Math.round(now - this.matchStartedAt));
    this.persist();
  }

  completeMatch(ticks: number): void {
    this.data.matchesCompleted += 1;
    this.data.durationTicks.push(ticks);
    this.persist();
  }

  snapshot(): Counters {
    return structuredClone(this.data);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Counters are diagnostics. Losing them is not worth an error path.
    }
  }
}

/**
 * The debug overlay — the other half of T072.
 *
 * Off by default and toggled with F3. It exists because the numbers that matter
 * for M8 tuning and the M9 playtest — tick rate, ore rate, army size,
 * time-to-first-action — are otherwise invisible while playing, and reading them
 * out of the console mid-match is not something a playtest observer can do.
 *
 * Built in TypeScript rather than markup so `index.html` stays the description of
 * the SHIPPED interface. Nothing here is part of the game.
 */

import type { SimState } from '../../sim/state';

export class DebugOverlay {
  private readonly root: HTMLElement;
  private visible = false;
  private lastFrame = 0;
  private fps = 0;

  constructor(parent: HTMLElement, private readonly counters: SessionCounters) {
    this.root = document.createElement('pre');
    this.root.className = 'debug-overlay';
    this.root.hidden = true;
    // aria-hidden: it is a developer tool, and announcing a per-frame counter to
    // a screen reader would be actively hostile.
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'F3') {
        event.preventDefault();
        this.visible = !this.visible;
        this.root.hidden = !this.visible;
      }
    });
  }

  update(state: SimState, now: number): void {
    if (!this.visible) {
      return;
    }
    if (this.lastFrame > 0) {
      const delta = now - this.lastFrame;
      // Smoothed, because a raw per-frame reciprocal is unreadable.
      this.fps = this.fps === 0 ? 1000 / delta : this.fps * 0.9 + (1000 / delta) * 0.1;
    }
    this.lastFrame = now;

    const snapshot = this.counters.snapshot();
    const mine = state.entities.filter((e) => e.owner === 0).length;
    const theirs = state.entities.filter((e) => e.owner === 1).length;
    const ttfa = snapshot.timeToFirstAction.at(-1);

    this.root.textContent = [
      `tick     ${state.tick}`,
      `fps      ${this.fps.toFixed(0)}`,
      `ore      ${state.players[0].ore}`,
      `entities ${mine} v ${theirs}`,
      `verdict  ${state.verdict}`,
      `sudden   ${state.suddenDeathAt < 0 ? 'off' : `armed@${state.suddenDeathAt}`}`,
      `ttfa     ${ttfa === undefined ? '—' : `${ttfa}ms`}`,
      `matches  ${snapshot.matchesStarted} started, ${snapshot.matchesCompleted} completed`,
      `rematch  ${snapshot.rematches}`,
    ].join('\n');
  }
}
