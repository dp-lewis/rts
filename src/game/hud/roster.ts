/**
 * The build-bar roster — T056, FR-010.
 *
 * Phaser-free so the SHAPE of the bar can be asserted headlessly. "Exactly 5
 * entries — 4 unit + 1 structure" is a Must and a deliberate ceiling, not a
 * starting point: research identified nested build menus as what makes browser
 * RTS unreadable in the first minute. A ceiling stated only in prose drifts the
 * first time someone adds a unit.
 *
 * Costs are QUOTED from the simulation rather than copied. A HUD holding its own
 * numbers would tell the player a price the game does not charge the moment M8
 * retunes anything.
 */

import { COST } from '../../sim/constants';
import { KIND, type Kind } from '../../sim/state';

export interface BuildEntry {
  kind: Kind;
  label: string;
  cost: number;
  /** Structures are placed on chosen ground; units are queued on a producer. */
  placed: boolean;
}

export const BUILD_ENTRIES: readonly BuildEntry[] = [
  { kind: KIND.WORKER, label: 'Worker', cost: COST.worker, placed: false },
  { kind: KIND.SCOUT, label: 'Scout', cost: COST.scout, placed: false },
  { kind: KIND.TROOPER, label: 'Trooper', cost: COST.trooper, placed: false },
  { kind: KIND.TANK, label: 'Tank', cost: COST.tank, placed: false },
  { kind: KIND.FACTORY, label: 'Factory', cost: COST.factory, placed: true },
];
