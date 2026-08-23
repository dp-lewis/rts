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

/**
 * The permanent bar now carries BUILDINGS ONLY. Units moved to the building that
 * makes them, reached by selecting it.
 *
 * This is a deliberate departure from FR-010's "exactly five entries — four unit
 * plus one structure — always visible, never nested", recorded as a change
 * request rather than taken quietly. What is kept from the original reasoning is
 * the part research actually supports: SOMETHING is always on screen to click,
 * and it is one flat row, never a menu that opens another menu.
 */
export const BUILD_ENTRIES: readonly BuildEntry[] = [
  { kind: KIND.BARRACKS, label: 'Barracks', cost: COST.barracks, placed: true },
  { kind: KIND.FACTORY, label: 'Factory', cost: COST.factory, placed: true },
];

/** What each building trains, in the order it is offered when selected. */
export const TRAINS: Record<number, readonly BuildEntry[]> = {
  [KIND.BASE]: [{ kind: KIND.WORKER, label: 'Worker', cost: COST.worker, placed: false }],
  [KIND.BARRACKS]: [
    { kind: KIND.TROOPER, label: 'Trooper', cost: COST.trooper, placed: false },
  ],
  [KIND.FACTORY]: [{ kind: KIND.TANK, label: 'Tank', cost: COST.tank, placed: false }],
};
