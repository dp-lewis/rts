/**
 * The entire tuning surface, in one file on purpose.
 *
 * M8 is a dedicated balance-tuning pass, and a tuning pass that has to hunt for
 * numbers scattered across ten modules is a tuning pass that does not happen.
 * Every value a designer might want to change lives here; nothing else in
 * `src/sim/` should contain a magic number.
 *
 * ## Tuned in M8 (2026-08-22)
 *
 * These are no longer starting points. The pass moved the median match from
 * **1.6 minutes to 6.2**, with p90 at 9.97 — both inside the K4 band — measured
 * over 30 fixed-seed matches by `tests/sim/duration.test.ts`, which now fails the
 * build if a later edit drifts out of it.
 *
 * What moved, and why:
 *
 * | change | from → to | reason |
 * |---|---|---|
 * | `MAX_HP.base` | 1500 → 10500 → **17000 (M9)** | The Base is the win condition, so its hp is the single biggest lever on how long the closing fight lasts. |
 * | `BUILD_TICKS` | +~70% across the board | Slower production means the armies that decide a match take longer to exist, which is where most of the added length came from. |
 * | `ORE_PER_NODE` | 1500 → 3400 | Enough to sustain a longer match — but deliberately NOT more, because sudden death arms on global depletion, and 4200 put the CR-001 backstop out of reach in exactly the matches that needed it (one ran 15.8 minutes). |
 * | `SUDDEN_DEATH` | grace 60s → 30s, ramp +1/15s → +4/10s | The backstop was written against 1500hp Bases and was far too slow against 10500. This is what pulled p90 from 13.1 to 9.97. |
 *
 * Peak army size settled at 19 a side against the ~25–30 LEGIBILITY ceiling
 * (pre-impl F-5) — comfortably under, so nothing was tuned to chase it.
 *
 * The measurements come from AI-vs-mirrored-AI, which is a proxy for a human and
 * an imperfect one: see `tests/sim/sparring.ts`. The band is confirmed against
 * real players in M9, not here.
 *
 * ## Re-tuned in M9 (2026-08-22)
 *
 * The first playtest found the Factory did nothing — every build command named
 * the Base, so a 200-ore structure was an ornament. Implementing the spec (one
 * Factory per side, combat units trained there) gave each player TWO producers
 * working in parallel, armies arrived sooner, and the median fell 6.19 → 4.47.
 *
 * Base hp 10500 → 17000 and combat build times +25% put it back at **6.24 median,
 * p90 9.32** — and tighter than before: the whole 30-match range is now
 * 5.25–10.72 minutes, where it used to reach 15.3. Difficulty also separates by
 * duration for the first time (d0 8.6m, d1 5.9m, d2 5.7m), which M8-F7 flagged as
 * missing: a weaker opponent now visibly takes longer to finish you.
 */

/** Fixed simulation rate. The renderer interpolates between ticks; it never sets the rate. */
export const TICK_HZ = 20;
export const MS_PER_TICK = 1000 / TICK_HZ;

/** World geometry. One grid cell is one 64px tile. */
export const TILE_PX = 64;

/** FR-014: one fixed single screen, no scrolling and no camera. */
export const MAP_TILES_X = 20;
export const MAP_TILES_Y = 11;

/**
 * How close a worker must be to mine, in world px, compared as SQUARED distance.
 * Ore nodes are NOT blocked, so a worker stands on the node's own cell and a
 * pixel radius is well defined here — unlike deposit, which must clear a blocked
 * Base cell.
 */
export const GATHER_RANGE = 48;
/**
 * Deposit is NOT a pixel range — see `isAdjacentCell` in economy.ts. A Base sits
 * in a blocked cell, so a worker's closest legal standing position is an adjacent
 * cell centre; a pixel radius and cell-based movement disagreed whenever a Base
 * was not exactly cell-centred, and the worker livelocked holding a full load.
 */

/** Within this many px of its destination, a unit snaps and stops. */
export const ARRIVE_EPSILON = 1.5;

/** Starting resources. */
export const STARTING_ORE = 150;

/** Ore per node at match start, and how much a worker moves per trip. */
export const ORE_PER_NODE = 3400;
export const WORKER_CARRY_CAPACITY = 10;
export const WORKER_GATHER_PER_TICK = 1;

/** Build costs, in ore. Five build-bar entries (FR: exactly five). */
export const COST = {
  worker: 50,
  trooper: 80,
  tank: 160,
  barracks: 150,
  factory: 200,
} as const;

/** Build times, in ticks. */
export const BUILD_TICKS = {
  worker: 170,
  trooper: 310,
  tank: 560,
  barracks: 400,
  factory: 520,
} as const;

/** Maximum hit points by kind. */
export const MAX_HP = {
  base: 17000,
  barracks: 700,
  factory: 900,
  worker: 40,
  trooper: 90,
  tank: 260,
} as const;

/** Movement speed in world px per tick. */
export const SPEED = {
  worker: 3.2,
  trooper: 3.6,
  tank: 2.4,
} as const;

/** Combat. Ranges are in world px and compared as SQUARED distances (never sqrt in a hot loop). */
export const ATTACK = {
  worker: { damage: 2, range: 40, cooldownTicks: 20 },
  trooper: { damage: 9, range: 96, cooldownTicks: 16 },
  tank: { damage: 26, range: 128, cooldownTicks: 30 },
} as const;

/**
 * Sudden death (CR-001). Ore exhaustion halts production but does not by itself
 * force a resolution, so a post-exhaustion stalemate had no terminator and the
 * ten-minute promise was guaranteed by nothing. After every node is depleted a
 * grace period runs, then all Bases take escalating damage until one falls.
 */
export const SUDDEN_DEATH = {
  graceTicks: TICK_HZ * 30,
  initialDamagePerTick: 1,
  /** Added to the per-tick damage every `rampIntervalTicks`. */
  damageRampStep: 4,
  rampIntervalTicks: TICK_HZ * 10,
} as const;

/**
 * Selection hit radius in world px — FR-030.
 *
 * One value for every unit kind, deliberately. Selection is a player-facing
 * affordance, not a physics property: a tank being easier to box than a scout
 * because its sprite is larger is a usability accident, not a design decision.
 * It is NOT derived from the sprite, which is the whole point of FR-030 — the art
 * may be reskinned without changing what a drag captures.
 */
export const COLLISION_RADIUS = 18;

/**
 * Legibility ceiling, not a performance ceiling (pre-impl review F-5). Sixty
 * units on a 220-cell map is 27% occupancy with no camera to zoom out of; the
 * number that matters is how many units a player can still read.
 */
export const MAX_UNITS_PER_SIDE = 30;
