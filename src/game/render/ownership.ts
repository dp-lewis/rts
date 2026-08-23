/**
 * The underglow ring — FR-018, T051.
 *
 * WCAG 1.4.1 forbids colour as the SOLE carrier of information, and "which of
 * these 60 identical-sized sprites is mine" is information. The cue is therefore
 * PRESENCE, not hue: friendly units carry a ring, enemy units carry nothing.
 * That distinction survives greyscale, every form of colour vision deficiency,
 * and a cheap monitor, because it is not a colour distinction at all. The tint
 * is a second, redundant channel for players who can use it.
 *
 * Drawn UNDER the sprite (depth 10 vs 20) so it reads as a glow the unit stands
 * in rather than an outline stuck on top of it. The ring is sized to the tile,
 * not to the sprite: Kenney's art occupies far less than its 64 px canvas, so a
 * sprite-sized ring would be too small to see — pre-impl F-7 flagged exactly
 * this, and it is why the ring is a drawn primitive and not part of the art.
 */

import type Phaser from 'phaser';

import { TILE_PX } from '../../sim/constants';
import { isStructureKind, type Entity, type Owner } from '../../sim/state';
import { OWNER_TINT } from '../../assets/sprites';

/** The human player. Only this player's units are ringed. */
export const FRIENDLY: Owner = 0;

// Tightened from 0.34/0.20 by the T081 spike: the ring must belong visibly to
// ONE sprite. Paired with the raised jitter, the gap between two co-located
// units now exceeds the ring radius instead of being a quarter of it.
const RADIUS_X = TILE_PX * 0.26;
const RADIUS_Y = TILE_PX * 0.155; // squashed: the map reads as a ground plane
const GLOW_ALPHA = 0.30;
const RIM_ALPHA = 0.95;
const RIM_WIDTH = 2.5;

/**
 * A dark seat drawn beneath the glow.
 *
 * Without it the ring depends on being LIGHTER than the ground, which fails the
 * moment a unit stands on a pale tile — and in greyscale that is the only
 * channel left. A dark rim under a light one means the ring carries contrast in
 * both directions and cannot be washed out by whatever it is standing on.
 */
const SEAT_ALPHA = 0.35;

/** Near-white, so the selected rim outranks the tinted one in luminance too. */
const SELECTED_RIM_COLOUR = 0xf8fafc;
const SELECTED_RIM_WIDTH = 2;

export function drawOwnership(
  graphics: Phaser.GameObjects.Graphics,
  entity: Entity,
  x: number,
  y: number,
  selected = false,
): void {
  if (entity.owner !== FRIENDLY) {
    return;
  }
  if (isStructureKind(entity.kind)) {
    return; // Structures are unmistakable by silhouette and never move.
  }

  // Feet, not centre: a ring on the sprite's midpoint reads as a halo.
  const cy = y + TILE_PX * 0.16;

  graphics.fillStyle(0x000000, SEAT_ALPHA);
  graphics.fillEllipse(x, cy + 1.5, RADIUS_X * 2.1, RADIUS_Y * 2.1);

  graphics.fillStyle(OWNER_TINT[FRIENDLY], GLOW_ALPHA);
  graphics.fillEllipse(x, cy, RADIUS_X * 2, RADIUS_Y * 2);

  graphics.lineStyle(RIM_WIDTH, OWNER_TINT[FRIENDLY], RIM_ALPHA);
  graphics.strokeEllipse(x, cy, RADIUS_X * 2, RADIUS_Y * 2);

  // Selection reuses the ring rather than adding a second decoration: FR-018 says
  // the underglow doubles as the selection affordance. A brighter, wider second
  // rim OUTSIDE the first, so "selected" reads as a change of weight rather than
  // of colour — and so it survives greyscale like the ring itself.
  if (selected) {
    graphics.lineStyle(SELECTED_RIM_WIDTH, SELECTED_RIM_COLOUR, 1);
    graphics.strokeEllipse(x, cy, RADIUS_X * 2 + 7, RADIUS_Y * 2 + 7);
  }
}
