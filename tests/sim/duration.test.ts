import { describe, expect, it } from 'vitest';

import { MAX_UNITS_PER_SIDE, MS_PER_TICK } from '../../src/sim/constants';
import { createMatch } from '../../src/sim/setup';
import { step } from '../../src/sim/step';
import { ENTITY_STATE, KIND, VERDICT, type Difficulty } from '../../src/sim/state';
import { sparringCommands } from './sparring';

/**
 * T074 / K4 — match duration. The M8 exit criterion, asserted rather than
 * remembered: **median 6–10 minutes, p90 under 15**.
 *
 * ## What this measures, and what it does not
 *
 * The matches here are AI versus a MIRRORED AI, because a human cannot be put in
 * a test and twenty-plus samples cannot be gathered by hand. `ai.ts` plays player
 * 1 only — deliberately, for a single-player game — so player 0 is driven by
 * reflecting the state across the map's vertical axis, planning for "player 1" in
 * that mirrored world, and flipping the resulting orders back. That is sound only
 * because the opening is a true mirror, which `command-seam.test.ts` asserts.
 *
 * It is a proxy, and an imperfect one. A human plays nothing like this AI, and
 * during tuning the mirrored sides tracked each other exactly until first contact
 * and then diverged — so the harness is a good instrument for PACING and a poor
 * one for balance. The 6–10 minute band is a claim about how long the game takes,
 * and this is the only way to check it at n > 20. M9's playtest is what confirms
 * it against real players.
 *
 * The first measurement taken in M8 was AI-versus-NOBODY and reported 1.5-minute
 * matches; the number meant nothing. That is why the sparring partner exists.
 */

const TICK_BUDGET = 20 * 60 * 20; // 20 minutes at 20Hz — a hang guard, not a target

interface Outcome {
  minutes: number;
  verdict: number;
  peakUnits: number;
  settled: boolean;
}

function playMatch(seed: number, difficulty: Difficulty): Outcome {
  let state = createMatch(seed, difficulty);
  let seq = 0;
  let peak = 0;

  while (state.verdict === VERDICT.NONE && state.tick < TICK_BUDGET) {
    const mine = sparringCommands(state, seq);
    seq += mine.length;
    state = step(state, mine);

    if (state.tick % 40 === 0) {
      for (const owner of [0, 1] as const) {
        let n = 0;
        for (const e of state.entities) {
          if (e.owner === owner && e.kind !== KIND.BASE && e.state !== ENTITY_STATE.DEAD) {
            n += 1;
          }
        }
        peak = Math.max(peak, n);
      }
    }
  }

  return {
    minutes: (state.tick * MS_PER_TICK) / 60_000,
    verdict: state.verdict,
    peakUnits: peak,
    settled: state.verdict !== VERDICT.NONE,
  };
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Fixed seeds, so this is a regression test rather than a sampling exercise: the
 * same thirty matches run every time, and a tuning change moves the numbers for a
 * reason someone can point at.
 */
const SAMPLE: { seed: number; difficulty: Difficulty }[] = [];
for (const difficulty of [0, 1, 2] as const) {
  for (let i = 0; i < 10; i += 1) {
    SAMPLE.push({ seed: 1000 + i * 7919 + difficulty * 31, difficulty });
  }
}

describe('K4 — match duration', () => {
  const outcomes = SAMPLE.map((s) => playMatch(s.seed, s.difficulty));
  const minutes = outcomes.map((o) => o.minutes).sort((a, b) => a - b);
  const summary = `median ${quantile(minutes, 0.5).toFixed(2)}m, p90 ${quantile(minutes, 0.9).toFixed(2)}m, range ${minutes[0]!.toFixed(2)}-${minutes.at(-1)!.toFixed(2)}m`;

  it(`runs ${SAMPLE.length} matches — more than the 20 T074 asks for`, () => {
    expect(outcomes).toHaveLength(30);
  });

  it('reaches a median of 6 to 10 minutes', () => {
    expect(quantile(minutes, 0.5), summary).toBeGreaterThanOrEqual(6);
    expect(quantile(minutes, 0.5), summary).toBeLessThanOrEqual(10);
  });

  it('keeps p90 under 15 minutes', () => {
    expect(quantile(minutes, 0.9), summary).toBeLessThan(15);
  });

  it('settles every match — CR-001 means none may run to the budget', () => {
    // The sudden-death backstop exists precisely so that "it eventually ended"
    // is not left to chance. A match hitting the budget is the finding.
    const unsettled = outcomes.filter((o) => !o.settled).length;
    expect(unsettled, `${unsettled} matches never reached a verdict`).toBe(0);
  });

  it('stays under the legibility ceiling, not the performance one', () => {
    // pre-impl F-5: "~60 units" arrived as a performance NFR and was never a
    // design decision. The number that matters is how many a player can read.
    const peak = Math.max(...outcomes.map((o) => o.peakUnits));
    expect(peak, `peak ${peak} units on one side`).toBeLessThanOrEqual(MAX_UNITS_PER_SIDE);
  });

  it('produces a decisive result, not a field of draws', () => {
    const draws = outcomes.filter((o) => o.verdict === VERDICT.DRAW).length;
    expect(draws, `${draws}/${outcomes.length} matches ended in a draw`).toBeLessThan(
      outcomes.length / 2,
    );
  });
});
