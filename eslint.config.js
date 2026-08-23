import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Constitution I (Determinism) and II (Simulation–Presentation Separation),
 * converted from review-time vigilance into build-time failure.
 *
 * Roughly twenty lines of it are the highest-leverage code in the project:
 * everything under `src/sim/` must produce bit-identical results from the same
 * seed and the same command log, on any machine, forever. That property cannot
 * be recovered once lost — a single `Math.random()` merged in month two makes
 * every recorded replay in the corpus worthless.
 *
 * `tests/lint/boundary.test.ts` proves these rules actually fire. Change a rule
 * here and that test is what tells you whether the guard still exists.
 */

/** Ambient randomness and every transcendental whose result is not bit-portable. */
const BANNED_MATH = [
  { object: 'Math', property: 'random', message: 'Ambient randomness. Draw from the seeded PRNG in SimState (src/sim/rng.ts) instead — a replay must reproduce every roll.' },
  ...['sin', 'cos', 'tan', 'atan2', 'asin', 'acos', 'log', 'exp', 'pow'].map((property) => ({
    object: 'Math',
    property,
    message: `Math.${property} is implementation-defined and not bit-identical across engines or platforms. Use a fixed-point or lookup-table equivalent in src/sim/. (Math.sqrt and Math.abs are exactly specified by IEEE-754 and remain allowed.)`,
  })),
];

/** Anything that lets the simulation read the world instead of its own state. */
const BANNED_GLOBALS = [
  { name: 'Date', message: 'Wall-clock read. The simulation\'s only notion of time is its tick counter.' },
  { name: 'performance', message: 'Wall-clock read. The simulation\'s only notion of time is its tick counter.' },
  { name: 'window', message: 'src/sim/ must run headless under plain Node (TC-INT-003).' },
  { name: 'document', message: 'src/sim/ must run headless under plain Node (TC-INT-003).' },
  { name: 'navigator', message: 'src/sim/ must run headless under plain Node (TC-INT-003).' },
];

/**
 * O-7, unordered iteration.
 *
 * `for...in` is banned outright — its enumeration order is not part of any
 * contract we can rely on.
 *
 * The Map/Set half is a PARTIAL guard, and deliberately so. Detecting
 * `for (const x of someMap)` needs type information that a syntax selector does
 * not have, so we catch the `.keys()` / `.values()` / `.entries()` idiom and
 * direct iteration of a Map/Set literal. Bare iteration of a Map-typed variable
 * slips through; that residual risk is covered by the replay corpus (§IV), which
 * fails the build the moment iteration order diverges across the CI matrix.
 *
 * Map and Set themselves are NOT banned — A* needs an open set, and a Map read
 * through sorted keys is perfectly deterministic. The hazard is the iteration,
 * not the container.
 */
const BANNED_SYNTAX = [
  {
    selector: 'ForInStatement',
    message: 'for...in enumeration order is not a contract. Iterate an id-sorted array instead (O-7).',
  },
  {
    selector: 'ForOfStatement > CallExpression.right > MemberExpression.callee[property.name=/^(keys|values|entries)$/]',
    message: 'Iterating .keys()/.values()/.entries() risks Map/Set insertion order leaking into the simulation. Sort the keys first, or hold the data in an id-sorted array (O-7).',
  },
  {
    selector: 'ForOfStatement > NewExpression.right[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]',
    message: 'Iterating a Map/Set directly exposes insertion order to the simulation. Iterate an id-sorted array instead (O-7).',
  },
];

/** Constitution II: the dependency arrow points one way, sim ← game. */
const BANNED_IMPORTS = {
  paths: [
    { name: 'phaser', message: 'src/sim/ must never import the presentation layer. The simulation runs headless; Phaser reads it and never writes to it.' },
  ],
  patterns: [
    { group: ['**/game', '**/game/**', 'src/game', 'src/game/**'], message: 'src/sim/ must never import from src/game/. The dependency arrow points one way.' },
    { group: ['jsdom', 'happy-dom', 'canvas', '**/dom/**'], message: 'src/sim/ must run headless under plain Node (TC-INT-003).' },
  ],
};

export default tseslint.config(
  {
    // dist/ is generated; the fixtures are deliberately-violating specimens that
    // exist only to be fed to ESLint by tests/lint/boundary.test.ts. Linting
    // them here would report violations that are the entire point of the file.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'tests/lint/fixtures/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },

  {
    // ★ The boundary. Everything above applies everywhere; this applies only here.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', BANNED_IMPORTS],
      'no-restricted-globals': ['error', ...BANNED_GLOBALS],
      'no-restricted-properties': ['error', ...BANNED_MATH],
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX],
    },
  },
);
