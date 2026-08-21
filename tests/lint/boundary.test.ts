import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * The guard on the guard.
 *
 * `eslint.config.js` is the entire machine-checked half of Constitution I and II:
 * it is what stops `Math.random()`, a wall-clock read, a transcendental, an
 * unordered iteration, or a Phaser import from ever entering `src/sim/`. A guard
 * nobody verified is a guard nobody has, so it gets a Red-Green cycle like any
 * other code.
 *
 * Each fixture in `fixtures/` is a real, type-checked TypeScript file holding
 * exactly one planted violation. We read its source and lint it through
 * `lintText` under a SYNTHETIC path inside `src/sim/`, so the `src/sim/**`-scoped
 * rules apply without a single violating byte ever living in `src/`.
 *
 * When `eslint.config.js` does not yet exist, we lint against a config that can
 * PARSE TypeScript but carries no rules, rather than letting ESLint throw or
 * silently match nothing. That is deliberate: it makes the Red failure read
 * "expected a violation, got none" instead of "config file not found" or "no
 * result", so an empty or rule-less `eslint.config.js` would NOT turn this test
 * green. The only thing that turns it green is rules that actually fire.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CONFIG_PATH = resolve(REPO_ROOT, 'eslint.config.js');
const FIXTURE_DIR = resolve(REPO_ROOT, 'tests/lint/fixtures');

interface PlantedViolation {
  /** Fixture file under tests/lint/fixtures/ */
  readonly fixture: string;
  /** What the planted code does that src/sim/ forbids */
  readonly banned: string;
  /** The rule that must be the one to catch it */
  readonly rule: string;
}

const PLANTED: readonly PlantedViolation[] = [
  { fixture: 'math-random.ts', banned: 'Math.random()', rule: 'no-restricted-properties' },
  { fixture: 'wall-clock.ts', banned: 'Date.now()', rule: 'no-restricted-globals' },
  { fixture: 'transcendental.ts', banned: 'Math.atan2()', rule: 'no-restricted-properties' },
  { fixture: 'unordered-iteration.ts', banned: 'a for...in loop', rule: 'no-restricted-syntax' },
  { fixture: 'phaser-import.ts', banned: "an import of 'phaser'", rule: 'no-restricted-imports' },
];

/**
 * Parses TypeScript, enforces nothing. Used only when `eslint.config.js` is
 * absent, so that the Red state is a real lint pass reporting zero violations
 * rather than a crash or an unmatched file.
 */
const RULE_FREE_FALLBACK = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {},
  },
];

function createLinter(): ESLint {
  return existsSync(CONFIG_PATH)
    ? new ESLint({ cwd: REPO_ROOT, overrideConfigFile: CONFIG_PATH })
    : new ESLint({
        cwd: REPO_ROOT,
        overrideConfigFile: true,
        overrideConfig: RULE_FREE_FALLBACK,
      });
}

/** Lint a fixture's source as though it lived at `src/sim/<name>`. */
async function lintAsSimFile(fixture: string): Promise<ESLint.LintResult> {
  const source = readFileSync(resolve(FIXTURE_DIR, fixture), 'utf8');
  const results = await createLinter().lintText(source, {
    filePath: resolve(REPO_ROOT, 'src/sim', fixture),
    warnIgnored: false,
  });

  const [result] = results;
  if (result === undefined) {
    throw new Error(`ESLint returned no result for fixture ${fixture}`);
  }
  return result;
}

describe('src/sim boundary rules fire on planted violations', () => {
  it.each(PLANTED)('rejects $banned via $rule', async ({ fixture, banned, rule }) => {
    const result = await lintAsSimFile(fixture);
    const ruleIds = result.messages.map((m) => m.ruleId);

    expect(
      result.errorCount,
      `${banned} was planted in src/sim/${fixture} and ESLint reported no error. ` +
        `Rules that did fire: ${ruleIds.length > 0 ? ruleIds.join(', ') : '(none)'}`,
    ).toBeGreaterThan(0);

    expect(
      ruleIds,
      `${banned} must be caught by ${rule}, not merely by something. ` +
        `Rules that fired: ${ruleIds.length > 0 ? ruleIds.join(', ') : '(none)'}`,
    ).toContain(rule);
  });
});

describe('the guard is scoped, not global', () => {
  it('permits the same constructs outside src/sim', async () => {
    // Identical source, linted as a presentation-layer file. Phaser reads the
    // wall clock and calls Math.random() constantly; banning it everywhere would
    // make the rule unusable and it would be turned off within a week.
    const source = readFileSync(resolve(FIXTURE_DIR, 'wall-clock.ts'), 'utf8');
    const results = await createLinter().lintText(source, {
      filePath: resolve(REPO_ROOT, 'src/game/wall-clock.ts'),
      warnIgnored: false,
    });

    const [result] = results;
    expect(result).toBeDefined();
    expect(
      result?.messages.map((m) => m.ruleId) ?? [],
      'src/game/ must be free to read the wall clock',
    ).not.toContain('no-restricted-globals');
  });
});
