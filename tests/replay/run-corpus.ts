import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { replay, type Replay, type ReplayResult } from '../../src/sim/replay';

/**
 * The corpus runner — ADR-002.
 *
 * Every fixed simulation defect lands with a recorded command log and its
 * expected hashes, and CI replays the whole corpus on every run. Divergence fails
 * the build.
 *
 * The runner reports the FIRST failing checkpoint rather than only the terminal
 * mismatch. That single detail is what makes a failure diagnosable: a terminal
 * hash tells you a twelve-thousand-tick run went wrong somewhere, whereas "first
 * diverged at tick 1000" bounds the search to the gap between two checkpoints.
 *
 * There is deliberately no `--update` flag here, and adding one would be a
 * mistake worth reverting. It would convert Constitution IV from a regression
 * guard into a rubber stamp: every accidental behaviour change would quietly
 * re-record itself as the new expectation. Regeneration lives in
 * `scripts/corpus-regen.ts`, is run by hand, and shows its diff in a pull request.
 */

export const CORPUS_DIR = fileURLToPath(new URL('./corpus', import.meta.url));

export interface CorpusCase {
  file: string;
  replay: Replay;
}

export function loadCorpus(dir: string = CORPUS_DIR): CorpusCase[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    // Filename order is deliberate and stable: cases are NNN-slug.json, so
    // lexicographic order is chronological order.
    .sort();

  return files.map((file) => ({
    file,
    replay: JSON.parse(readFileSync(join(dir, file), 'utf8')) as Replay,
  }));
}

export interface CorpusOutcome extends ReplayResult {
  file: string;
  id: string;
}

export function runCorpus(dir: string = CORPUS_DIR): CorpusOutcome[] {
  return loadCorpus(dir).map(({ file, replay: recorded }) => ({
    file,
    id: recorded.id,
    ...replay(recorded),
  }));
}

/** A human-readable failure report naming the earliest divergence. */
export function describeFailure(outcome: CorpusOutcome): string {
  const lines = [`${outcome.file} — ${outcome.message}`];
  if (outcome.firstFailure !== null) {
    for (const cp of outcome.checkpoints) {
      const mark = cp.actual === cp.expected ? 'ok  ' : 'FAIL';
      lines.push(`  ${mark} tick ${String(cp.tick).padStart(6)}  expected ${cp.expected}  got ${cp.actual}`);
    }
    const t = outcome.terminal;
    const mark = t.actual === t.expected ? 'ok  ' : 'FAIL';
    lines.push(`  ${mark} tick ${String(t.tick).padStart(6)}  expected ${t.expected}  got ${t.actual}  (terminal)`);
  }
  return lines.join('\n');
}
