/**
 * The placement ghost's sprite and cell outline — T055, FR-013.
 *
 * FR-013 is specific: an invalid placement is shown as ghost STATE, never as an
 * error dialog. A modal to say "you cannot build there" would interrupt a
 * real-time game to report something the player can see for themselves, and would
 * arrive after the mistake rather than before it. So the feedback is continuous
 * and pre-emptive: the ghost is on screen throughout placement and always already
 * says whether the click would work.
 *
 * Drawing only. The decision is `placementAt` in `input/placement.ts`.
 */

import Phaser from 'phaser';

import { spriteKey } from '../../assets/sprites';
import { TILE_PX } from '../../sim/constants';
import { KIND } from '../../sim/state';
import type { PlacementTarget } from '../input/placement';

const VALID_TINT = 0x4ade80;
const INVALID_TINT = 0xef4444;

export class PlacementGhost {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly outline: Phaser.GameObjects.Graphics;
  private active = false;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, spriteKey(KIND.FACTORY, 0)).setDepth(35).setAlpha(0.6);
    this.outline = scene.add.graphics().setDepth(34);
    this.hide();
  }

  isActive(): boolean {
    return this.active;
  }

  hide(): void {
    this.active = false;
    this.sprite.setVisible(false);
    this.outline.clear();
  }

  /** Show the ghost at `target`, coloured by validity. */
  show(target: PlacementTarget): void {
    this.active = true;
    this.sprite.setVisible(true);
    this.sprite.setPosition(target.x, target.y);
    this.sprite.setTint(target.valid ? VALID_TINT : INVALID_TINT);

    this.outline.clear();
    this.outline.lineStyle(2, target.valid ? VALID_TINT : INVALID_TINT, 0.95);
    this.outline.strokeRect(target.x - TILE_PX / 2, target.y - TILE_PX / 2, TILE_PX, TILE_PX);
  }
}
