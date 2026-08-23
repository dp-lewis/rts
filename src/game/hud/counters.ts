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
  /**
   * Milliseconds from PAGE LOAD to the first command of the session.
   *
   * K2 is defined against page load, not match start, because it is a
   * comprehension measure: the gate is part of what a first-timer has to
   * understand, and time spent deciding there is time spent not playing. Only
   * the first is kept — after that the player knows what the screen is.
   */
  timeToFirstActionFromLoad: number | null;
  /** Match durations in simulation ticks — exact, unlike a wall-clock reading. */
  durationTicks: number[];
  /**
   * Outcome per completed match: 1 victory, 2 defeat, 3 draw (`VERDICT`).
   *
   * M9's second exit criterion is "at least 3 of 5 players WIN at least one match
   * on New to this", and completion alone cannot answer it. pre-impl F-3 is
   * explicit about why this matters: comprehension does not prove the game is
   * beatable, and an AI written by someone who knows the game is the most common
   * way a solo project ships something unwinnable.
   */
  outcomes: number[];
  /** Difficulty per completed match, so wins can be attributed to a level. */
  difficulties: number[];
}

function empty(): Counters {
  return {
    matchesStarted: 0,
    matchesCompleted: 0,
    rematches: 0,
    timeToFirstAction: [],
    timeToFirstActionFromLoad: null,
    durationTicks: [],
    outcomes: [],
    difficulties: [],
  };
}

/** Keeps a long session's history from growing without bound in localStorage. */
const MAX_SAMPLES = 200;

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function asSamples(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(-MAX_SAMPLES);
}

/**
 * Coerce whatever is in storage into the shape this class promises.
 *
 * A plain spread over `empty()` is not enough: it fills MISSING keys but happily
 * accepts a present one of the wrong type, so a stored `"lots"` became
 * `"lots" + 1` on the next increment and every counter downstream was a string or
 * NaN — silently, because nothing reads these until a playtest does. Storage is
 * outside this program's control (another tab, a hand edit, a partial write, an
 * older build), so its contents are input and get validated like input.
 */
function hydrate(raw: unknown): Counters {
  if (typeof raw !== 'object' || raw === null) {
    return empty();
  }
  const value = raw as Record<string, unknown>;
  const fromLoad = value['timeToFirstActionFromLoad'];
  return {
    matchesStarted: asCount(value['matchesStarted']),
    matchesCompleted: asCount(value['matchesCompleted']),
    rematches: asCount(value['rematches']),
    timeToFirstAction: asSamples(value['timeToFirstAction']),
    timeToFirstActionFromLoad:
      typeof fromLoad === 'number' && Number.isFinite(fromLoad) ? fromLoad : null,
    durationTicks: asSamples(value['durationTicks']),
    outcomes: asSamples(value['outcomes']),
    difficulties: asSamples(value['difficulties']),
  };
}

export class SessionCounters {
  private data: Counters = empty();
  private matchStartedAt = 0;
  private firstActionRecorded = false;
  private currentDifficulty = 1;

  constructor() {
    // Wrapped: localStorage throws outright in some privacy modes, and losing a
    // counter must never take the game down with it.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        this.data = hydrate(JSON.parse(raw));
      }
    } catch {
      this.data = empty();
    }
  }

  startMatch(now: number, isRematch: boolean, difficulty = 1): void {
    this.matchStartedAt = now;
    this.currentDifficulty = difficulty;
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
    if (this.data.timeToFirstActionFromLoad === null) {
      // `performance.now()` is measured from page load by definition, so `now` IS
      // the K2 reading with no bookkeeping of our own.
      this.data.timeToFirstActionFromLoad = Math.round(now);
    }
    this.trim();
    this.persist();
  }

  completeMatch(ticks: number, verdict: number): void {
    this.data.matchesCompleted += 1;
    this.data.durationTicks.push(ticks);
    this.data.outcomes.push(verdict);
    this.data.difficulties.push(this.currentDifficulty);
    this.trim();
    this.persist();
  }

  snapshot(): Counters {
    return structuredClone(this.data);
  }

  /** Rematch is the retention loop, so these arrays would otherwise grow forever. */
  private trim(): void {
    if (this.data.timeToFirstAction.length > MAX_SAMPLES) {
      this.data.timeToFirstAction = this.data.timeToFirstAction.slice(-MAX_SAMPLES);
    }
    if (this.data.durationTicks.length > MAX_SAMPLES) {
      this.data.durationTicks = this.data.durationTicks.slice(-MAX_SAMPLES);
    }
    if (this.data.outcomes.length > MAX_SAMPLES) {
      this.data.outcomes = this.data.outcomes.slice(-MAX_SAMPLES);
      this.data.difficulties = this.data.difficulties.slice(-MAX_SAMPLES);
    }
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
