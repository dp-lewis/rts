/**
 * The entire tuning surface, in one file on purpose.
 *
 * M8 is a dedicated balance-tuning pass, and a tuning pass that has to hunt for
 * numbers scattered across ten modules is a tuning pass that does not happen.
 * Every value a designer might want to change lives here; nothing else in
 * `src/sim/` should contain a magic number.
 *
 * The values below are STARTING POINTS, not balanced figures. spec.md is explicit
 * that all timing and damage constants are M8 targets, and the target the tuning
 * pass aims at is a median match of 6–10 minutes with p90 under 15.
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
export const ORE_PER_NODE = 1500;
export const WORKER_CARRY_CAPACITY = 10;
export const WORKER_GATHER_PER_TICK = 1;

/** Build costs, in ore. Five build-bar entries (FR: exactly five). */
export const COST = {
  worker: 50,
  scout: 60,
  trooper: 80,
  tank: 160,
  factory: 200,
} as const;

/** Build times, in ticks. */
export const BUILD_TICKS = {
  worker: 100,
  scout: 90,
  trooper: 140,
  tank: 300,
  factory: 400,
} as const;

/** Maximum hit points by kind. */
export const MAX_HP = {
  base: 1500,
  factory: 600,
  worker: 40,
  scout: 50,
  trooper: 90,
  tank: 260,
} as const;

/** Movement speed in world px per tick. */
export const SPEED = {
  worker: 3.2,
  scout: 5.6,
  trooper: 3.6,
  tank: 2.4,
} as const;

/** Combat. Ranges are in world px and compared as SQUARED distances (never sqrt in a hot loop). */
export const ATTACK = {
  worker: { damage: 2, range: 40, cooldownTicks: 20 },
  scout: { damage: 4, range: 72, cooldownTicks: 12 },
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
  graceTicks: TICK_HZ * 60,
  initialDamagePerTick: 1,
  /** Added to the per-tick damage every `rampIntervalTicks`. */
  damageRampStep: 1,
  rampIntervalTicks: TICK_HZ * 15,
} as const;

/**
 * Legibility ceiling, not a performance ceiling (pre-impl review F-5). Sixty
 * units on a 220-cell map is 27% occupancy with no camera to zoom out of; the
 * number that matters is how many units a player can still read.
 */
export const MAX_UNITS_PER_SIDE = 30;
