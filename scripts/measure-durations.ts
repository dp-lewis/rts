/**
 * Batch match measurement — the instrument T073 tunes against and T074 records.
 *
 * Runs headless AI-vs-AI matches to a verdict and reports the duration
 * distribution. AI-vs-AI rather than human-vs-AI because it is the only way to
 * get twenty-plus samples, and because `constants.ts` is what is being tuned:
 * the constants shape economy pacing, army cost curves and time-to-kill
 * identically whoever is issuing the orders.
 *
 * What this CANNOT measure is whether the result is fun, whether the difficulty
 * levels feel different, or whether a human can follow a fight at 30 units a
 * side. Those are M9's job. This one answers the exit criterion — median 6-10
 * minutes, p90 under 15 — which is a number, and numbers should not be guessed
 * at by playing a handful of matches by hand.
 */

import { sparringCommands } from '../tests/sim/sparring';
import { MS_PER_TICK, MAX_UNITS_PER_SIDE } from '../src/sim/constants';
import { createMatch } from '../src/sim/setup';
import { step } from '../src/sim/step';
import { KIND, VERDICT, type Difficulty, type SimState } from '../src/sim/state';

/** Hard stop. CR-001's sudden death should make this unreachable — if a match
 *  hits it, that is the finding, not the runtime. */
const TICK_BUDGET = 20 * 60 * 20; // 20 minutes at 20Hz

interface MatchResult {
  seed: number;
  difficulty: Difficulty;
  ticks: number;
  minutes: number;
  verdict: number;
  peakUnits: [number, number];
  suddenDeath: boolean;
  hitBudget: boolean;
}

function liveUnits(state: SimState, owner: 0 | 1): number {
  let n = 0;
  for (const e of state.entities) {
    if (e.owner === owner && e.kind !== KIND.BASE && e.state !== 5) {
      n += 1;
    }
  }
  return n;
}

function runMatch(seed: number, difficulty: Difficulty): MatchResult {
  let state = createMatch(seed, difficulty);
  const peak: [number, number] = [0, 0];
  let seq = 0;

  while (state.verdict === VERDICT.NONE && state.tick < TICK_BUDGET) {
    // Player 0's orders, scheduled for the CURRENT tick — `applyCommands` accepts
    // only commands whose tick equals `state.tick` (REV-009).
    const mine = sparringCommands(state, seq);
    seq += mine.length;
    state = step(state, mine);
    if (state.tick % 20 === 0) {
      peak[0] = Math.max(peak[0], liveUnits(state, 0));
      peak[1] = Math.max(peak[1], liveUnits(state, 1));
    }
  }

  return {
    seed,
    difficulty,
    ticks: state.tick,
    minutes: (state.tick * MS_PER_TICK) / 60_000,
    verdict: state.verdict,
    peakUnits: peak,
    suddenDeath: state.suddenDeathAt >= 0,
    hitBudget: state.verdict === VERDICT.NONE,
  };
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const VERDICT_NAME = ['none', 'p0 wins', 'p1 wins', 'draw'];

function main(): void {
  const perDifficulty = Number(process.argv[2] ?? 8);
  const results: MatchResult[] = [];

  for (const difficulty of [0, 1, 2] as const) {
    for (let i = 0; i < perDifficulty; i += 1) {
      // Fixed seeds so a tuning change is compared against the same matches, not
      // against a different sample. Every run of this script is reproducible.
      results.push(runMatch(1000 + i * 7919 + difficulty * 31, difficulty));
    }
  }

  const minutes = results.map((r) => r.minutes).sort((a, b) => a - b);
  const median = quantile(minutes, 0.5);
  const p90 = quantile(minutes, 0.9);
  const inBand = results.filter((r) => r.minutes >= 6 && r.minutes <= 10).length;
  const peak = Math.max(...results.flatMap((r) => r.peakUnits));

  console.log(`\n${results.length} matches (${perDifficulty} per difficulty)\n`);
  console.log('  by difficulty');
  for (const difficulty of [0, 1, 2] as const) {
    const subset = results.filter((r) => r.difficulty === difficulty);
    const mins = subset.map((r) => r.minutes).sort((a, b) => a - b);
    const verdicts = subset.reduce<Record<string, number>>((acc, r) => {
      const key = VERDICT_NAME[r.verdict]!;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `    d${difficulty}  median ${quantile(mins, 0.5).toFixed(1)}m` +
        `  range ${mins[0]!.toFixed(1)}-${mins.at(-1)!.toFixed(1)}m` +
        `  peak units ${Math.max(...subset.flatMap((r) => r.peakUnits))}` +
        `  ${JSON.stringify(verdicts)}`,
    );
  }

  console.log('\n  overall');
  console.log(`    median        ${median.toFixed(2)} min   (target 6-10)`);
  console.log(`    p90           ${p90.toFixed(2)} min   (target < 15)`);
  console.log(`    range         ${minutes[0]!.toFixed(2)} - ${minutes.at(-1)!.toFixed(2)} min`);
  console.log(`    in 6-10 band  ${inBand}/${results.length}`);
  console.log(`    peak units    ${peak}   (legibility ceiling ${MAX_UNITS_PER_SIDE})`);
  console.log(`    sudden death  ${results.filter((r) => r.suddenDeath).length}/${results.length}`);
  console.log(`    hit budget    ${results.filter((r) => r.hitBudget).length}/${results.length}`);

  const pass = median >= 6 && median <= 10 && p90 < 15;
  console.log(`\n  exit criterion: ${pass ? 'MET' : 'NOT MET'}\n`);
}

main();
