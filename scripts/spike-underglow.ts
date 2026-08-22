/**
 * T081 spike — does the underglow ring read at a glance, including in greyscale?
 *
 * pre-impl F-7: the ring is the whole of the FR-018 / WCAG 1.4.1 mitigation, and
 * Kenney's sprites occupy far less than their 64 px canvas, so "it looked fine on
 * one unit" is not evidence. This renders twelve mixed friendly/enemy units at
 * real scale through the SHIPPING renderer — not a mock — so what is judged is
 * what ships. The greyscale toggle is CSS over the canvas, which is a harsher
 * test than a colour-blindness simulation: it removes hue entirely.
 */

import Phaser from 'phaser';

import { spriteManifest } from '../src/assets/sprites';
import { WorldRenderer } from '../src/game/render/world';
import { TILE_PX } from '../src/sim/constants';
import { KIND, createInitialState, type EntitySeed } from '../src/sim/state';
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from '../src/sim/setup';

const centre = (cell: number): number => cell * TILE_PX + TILE_PX / 2;

/**
 * Twelve units, deliberately INTERLEAVED rather than split left and right.
 * Two tidy blocks would be readable from position alone and would prove nothing
 * about the ring; a real skirmish is a mixed scrum, which is when ownership is
 * hardest and matters most.
 */
const SEEDS: EntitySeed[] = [
  { id: 1, kind: KIND.TROOPER, owner: 0, x: centre(6), y: centre(3) },
  { id: 2, kind: KIND.TROOPER, owner: 1, x: centre(7), y: centre(3) },
  { id: 3, kind: KIND.TROOPER, owner: 0, x: centre(8), y: centre(3) },
  { id: 4, kind: KIND.TANK, owner: 1, x: centre(9), y: centre(3) },
  { id: 5, kind: KIND.WORKER, owner: 0, x: centre(6), y: centre(5) },
  { id: 6, kind: KIND.TROOPER, owner: 1, x: centre(7), y: centre(5) },
  { id: 7, kind: KIND.TANK, owner: 0, x: centre(8), y: centre(5) },
  { id: 8, kind: KIND.TROOPER, owner: 1, x: centre(9), y: centre(5) },
  // Four stacked on two cells — the F-2 jitter case, and the worst case for
  // telling two owners apart.
  { id: 9, kind: KIND.TROOPER, owner: 0, x: centre(13), y: centre(4) },
  { id: 10, kind: KIND.TROOPER, owner: 1, x: centre(13), y: centre(4) },
  { id: 11, kind: KIND.TROOPER, owner: 0, x: centre(14), y: centre(4) },
  { id: 12, kind: KIND.TROOPER, owner: 0, x: centre(14), y: centre(4) },
  // Structures for scale reference.
  { id: 13, kind: KIND.BASE, owner: 0, x: centre(2), y: centre(5) },
  { id: 14, kind: KIND.BASE, owner: 1, x: centre(17), y: centre(5) },
];

class SpikeScene extends Phaser.Scene {
  private world!: WorldRenderer;

  preload(): void {
    for (const asset of spriteManifest()) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(): void {
    const state = createInitialState({
      seed: 1,
      difficulty: 1,
      players: [{ ore: 0 }, { ore: 0 }],
      nodes: [{ id: 0, x: centre(11), y: centre(7), remaining: 1500 }],
      entities: SEEDS,
    });
    this.world = new WorldRenderer(this);
    this.world.draw(state, 0);
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: WORLD_WIDTH_PX,
  height: WORLD_HEIGHT_PX,
  backgroundColor: '#12141c',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [SpikeScene],
});
