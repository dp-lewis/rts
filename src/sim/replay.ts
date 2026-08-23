import type { Command } from './commands';
import { hashState } from './hash';
import { step } from './step';
import { createInitialState, type Difficulty, type EntitySeed, type OreNode, type PlayerSeed, type SimInit } from './state';
import { SIM_VERSION } from './version';

/**
 * Replay record and playback — ADR-002.
 *
 * A replay is a seed, a difficulty, and a command log. Deliberately NOT a state
 * snapshot: if reproducing a run required storing intermediate state, the
 * simulation would not be deterministic and the corpus would be papering over
 * exactly the defect it exists to catch.
 *
 * Checkpoints are mandatory rather than optional. A terminal-only hash tells you
 * *that* a run diverged; checkpoints tell you *when*, which turns a
 * multi-thousand-tick haystack into a bounded search. The runner reports the
 * FIRST failing checkpoint, never just the final mismatch.
 */

export interface Checkpoint {
  tick: number;
  stateHash: string;
}

/**
 * M1 only. ADR-002's format resolves the starting scenario from a named `map`,
 * but no map system exists until M2, so the case carries its scenario inline.
 * M2 replaces this with a map id, bumps `SIM_VERSION`, and regenerates — which
 * is precisely the deliberate, reviewed regeneration ADR-002 describes, and a
 * cheap one while the corpus holds a single case.
 */
export interface ReplaySetup {
  players?: [PlayerSeed, PlayerSeed];
  nodes?: readonly OreNode[];
  entities?: readonly EntitySeed[];
}

export interface Replay {
  schemaVersion: number;
  id: string;
  description: string;
  defect: string | null;
  createdAt: string;
  simVersion: number;
  input: {
    seed: number;
    difficulty: number;
    map: string;
    commands: readonly Command[];
    setup?: ReplaySetup;
  };
  expected: {
    finalTick: number;
    stateHash: string;
    checkpoints: Checkpoint[];
  };
}

export interface CheckpointResult {
  tick: number;
  expected: string;
  actual: string;
}

export interface ReplayResult {
  ok: boolean;
  /** True only for a case recorded on an OLDER simVersion — the regeneratable case. */
  stale: boolean;
  message: string;
  checkpoints: CheckpointResult[];
  terminal: CheckpointResult;
  /** The earliest divergence, which is what makes a failure diagnosable. */
  firstFailure: CheckpointResult | null;
}

export const REPLAY_SCHEMA_VERSION = 1;

function initFrom(replayed: Replay): SimInit {
  const setup = replayed.input.setup ?? {};
  return {
    seed: replayed.input.seed,
    difficulty: replayed.input.difficulty as Difficulty,
    ...(setup.players ? { players: setup.players } : {}),
    ...(setup.nodes ? { nodes: setup.nodes } : {}),
    ...(setup.entities ? { entities: setup.entities } : {}),
  };
}

/** Run a scenario, capturing a hash at each checkpoint tick and at the final tick. */
function collectHashes(
  init: SimInit,
  commands: readonly Command[],
  finalTick: number,
  checkpointTicks: readonly number[],
): { checkpoints: Checkpoint[]; terminal: string } {
  const wanted = new Set(checkpointTicks);
  const checkpoints: Checkpoint[] = [];

  let state = createInitialState(init);
  while (state.tick < finalTick) {
    const due = commands.filter((c) => c.tick === state.tick);
    state = step(state, due);
    if (wanted.has(state.tick)) {
      checkpoints.push({ tick: state.tick, stateHash: hashState(state) });
    }
  }

  return { checkpoints, terminal: hashState(state) };
}

export function recordReplay(
  init: SimInit,
  commands: readonly Command[],
  finalTick: number,
  checkpointTicks: readonly number[],
  meta: {
    id?: string;
    description?: string;
    defect?: string | null;
    map?: string;
    /**
     * Authoring date, supplied by the CALLER. The simulation must never read a
     * wall clock — the ESLint boundary caught exactly that here, one milestone
     * after the rule was written, when this was `new Date().toISOString()`.
     * Corpus-authoring callers must pass a real date; `corpus.test.ts` fails any
     * case that does not carry one.
     */
    createdAt?: string;
  } = {},
): Replay {
  const { checkpoints, terminal } = collectHashes(init, commands, finalTick, checkpointTicks);

  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    id: meta.id ?? 'unnamed',
    description: meta.description ?? '',
    defect: meta.defect ?? null,
    createdAt: meta.createdAt ?? 'unrecorded',
    simVersion: SIM_VERSION,
    input: {
      seed: init.seed,
      difficulty: init.difficulty,
      map: meta.map ?? 'inline',
      commands,
      setup: {
        ...(init.players ? { players: init.players } : {}),
        ...(init.nodes ? { nodes: init.nodes } : {}),
        ...(init.entities ? { entities: init.entities } : {}),
      },
    },
    expected: {
      finalTick,
      stateHash: terminal,
      checkpoints,
    },
  };
}

export function replay(recorded: Replay): ReplayResult {
  const empty: CheckpointResult = { tick: recorded.expected.finalTick, expected: recorded.expected.stateHash, actual: '' };

  // Version gating, before any work. The two mismatch directions are genuinely
  // different problems and must never be conflated: a case from an OLDER version
  // means behaviour changed on purpose and the case needs a deliberate
  // regeneration. A case from a NEWER version means this checkout is behind, and
  // regenerating would overwrite a more current record with a staler one.
  if (recorded.simVersion < SIM_VERSION) {
    return {
      ok: false,
      stale: true,
      message:
        `Corpus case "${recorded.id}" is stale: recorded at simVersion ${recorded.simVersion}, ` +
        `current is ${SIM_VERSION}. Regenerate deliberately with \`npm run corpus:regen\` and put the ` +
        `hash diff in the pull request. Never auto-update.`,
      checkpoints: [],
      terminal: empty,
      firstFailure: null,
    };
  }

  if (recorded.simVersion > SIM_VERSION) {
    return {
      ok: false,
      stale: false,
      message:
        `Corpus case "${recorded.id}" was recorded at a newer simVersion (${recorded.simVersion}) than this ` +
        `checkout provides (${SIM_VERSION}). Your working tree is behind — update it. Do NOT regenerate; ` +
        `that would overwrite a more current record.`,
      checkpoints: [],
      terminal: empty,
      firstFailure: null,
    };
  }

  const expectedTicks = recorded.expected.checkpoints.map((c) => c.tick);
  const { checkpoints, terminal } = collectHashes(
    initFrom(recorded),
    recorded.input.commands,
    recorded.expected.finalTick,
    expectedTicks,
  );

  const results: CheckpointResult[] = recorded.expected.checkpoints.map((want, i) => ({
    tick: want.tick,
    expected: want.stateHash,
    actual: checkpoints[i]?.stateHash ?? '',
  }));

  const terminalResult: CheckpointResult = {
    tick: recorded.expected.finalTick,
    expected: recorded.expected.stateHash,
    actual: terminal,
  };

  // Checkpoints are in ascending tick order, so the first mismatch found here is
  // the earliest divergence — the whole reason checkpoints are mandatory.
  const firstFailure =
    results.find((r) => r.actual !== r.expected) ??
    (terminalResult.actual !== terminalResult.expected ? terminalResult : null);

  return {
    ok: firstFailure === null,
    stale: false,
    message:
      firstFailure === null
        ? `Corpus case "${recorded.id}" reproduced exactly.`
        : `Corpus case "${recorded.id}" first diverged at tick ${firstFailure.tick}: ` +
          `expected ${firstFailure.expected}, got ${firstFailure.actual}.`,
    checkpoints: results,
    terminal: terminalResult,
    firstFailure,
  };
}
