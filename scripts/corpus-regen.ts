/**
 * Deliberate, manual corpus regeneration — ADR-002.
 *
 * Run this ONLY when a change intentionally alters simulation behaviour, and only
 * after bumping `SIM_VERSION` by hand in the same change. It rewrites the hashes
 * of stale cases and stamps them with the current version.
 *
 * It is never run in CI, and never as part of a test command. The whole design is
 * that regeneration is visible and slightly inconvenient:
 *
 *   - A regeneration is an ADMISSION that behaviour changed on purpose.
 *   - The hash diff must appear in the pull request so a human sees exactly which
 *     recorded behaviours moved.
 *   - A diff larger than the author expected is itself the finding.
 *
 * It refuses to touch cases that are already current, so it cannot be used to
 * paper over a genuine regression: if a case fails at the CURRENT simVersion,
 * that is a defect in the code, not a stale recording.
 *
 * Usage:  npm run corpus:regen [-- --dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { recordReplay, type Replay } from '../src/sim/replay';
import type { Difficulty } from '../src/sim/state';
import { SIM_VERSION } from '../src/sim/version';
import { CORPUS_DIR, loadCorpus } from '../tests/replay/run-corpus';

const dryRun = process.argv.includes('--dry-run');

function regenerate(): number {
  const cases = loadCorpus();
  let rewritten = 0;
  let skippedCurrent = 0;
  let ahead = 0;

  console.log(`Corpus regeneration — current simVersion is ${SIM_VERSION}.`);
  if (dryRun) {
    console.log('DRY RUN: no files will be written.\n');
  } else {
    console.log('');
  }

  for (const { file, replay: recorded } of cases) {
    if (recorded.simVersion > SIM_VERSION) {
      console.log(
        `  AHEAD    ${file} — recorded at simVersion ${recorded.simVersion}, newer than this checkout ` +
          `(${SIM_VERSION}). Refusing to overwrite a more current record. Update your working tree.`,
      );
      ahead += 1;
      continue;
    }

    if (recorded.simVersion === SIM_VERSION) {
      console.log(`  CURRENT  ${file} — already at simVersion ${SIM_VERSION}, left alone.`);
      skippedCurrent += 1;
      continue;
    }

    const setup = recorded.input.setup ?? {};
    const fresh: Replay = recordReplay(
      {
        seed: recorded.input.seed,
        difficulty: recorded.input.difficulty as Difficulty,
        ...(setup.players ? { players: setup.players } : {}),
        ...(setup.nodes ? { nodes: setup.nodes } : {}),
        ...(setup.entities ? { entities: setup.entities } : {}),
      },
      recorded.input.commands,
      recorded.expected.finalTick,
      recorded.expected.checkpoints.map((c) => c.tick),
      {
        id: recorded.id,
        description: recorded.description,
        defect: recorded.defect,
        map: recorded.input.map,
      },
    );

    // Preserve the original authoring date — the case is the same case, recorded
    // against changed behaviour, not a new one.
    fresh.createdAt = recorded.createdAt;

    console.log(`  REGEN    ${file}  simVersion ${recorded.simVersion} -> ${SIM_VERSION}`);
    console.log(`             terminal  ${recorded.expected.stateHash} -> ${fresh.expected.stateHash}`);
    for (let i = 0; i < fresh.expected.checkpoints.length; i += 1) {
      const before = recorded.expected.checkpoints[i];
      const after = fresh.expected.checkpoints[i]!;
      if (before !== undefined && before.stateHash !== after.stateHash) {
        console.log(`             tick ${String(after.tick).padStart(6)}  ${before.stateHash} -> ${after.stateHash}`);
      }
    }

    if (!dryRun) {
      const path = join(CORPUS_DIR, file);
      const existing = readFileSync(path, 'utf8');
      const trailingNewline = existing.endsWith('\n') ? '\n' : '';
      writeFileSync(path, `${JSON.stringify(fresh, null, 2)}${trailingNewline}`);
    }
    rewritten += 1;
  }

  console.log(
    `\n${rewritten} regenerated, ${skippedCurrent} already current, ${ahead} ahead of this checkout.`,
  );

  if (rewritten > 0 && !dryRun) {
    console.log(
      '\nPut the hash diff in your pull request. A diff larger than you expected is the finding,\n' +
        'not a formality — it means behaviour moved in more places than you intended.',
    );
  }

  return ahead > 0 ? 1 : 0;
}

process.exit(regenerate());
