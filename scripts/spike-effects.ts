/**
 * T077 spike — does combat actually read on screen now?
 *
 * Playtest round 1: "it's not clear when things are attacking, eg no lasers or
 * explosions" and "the sprites don't turn". Both fixes are pure rendering, so
 * they get checked the way the T081 underglow ring was: against the SHIPPING
 * renderer, at real scale, rather than by trusting that the code looks right.
 *
 * A live match takes minutes to reach a fight. This seeds one directly.
 */

import Phaser from 'phaser';

import { spriteManifest } from '../src/assets/sprites';
import { WorldRenderer } from '../src/game/render/world';
import { ATTACK, TILE_PX } from '../src/sim/constants';
import { WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from '../src/sim/setup';
import {
  ENTITY_STATE,
  KIND,
  createInitialState,
  type EntitySeed,
  type SimState,
} from '../src/sim/state';

const centre = (cell: number): number => cell * TILE_PX + TILE_PX / 2;

/** Pairs already engaged, so every beam state is on screen at once. */
const SEEDS: EntitySeed[] = [
  { id: 1, kind: KIND.BASE, owner: 0, x: centre(1), y: centre(5) },
  { id: 2, kind: KIND.BASE, owner: 1, x: centre(18), y: centre(5) },

  // Freshly fired (full cooldown) — should draw brightly.
  { id: 3, kind: KIND.TROOPER, owner: 0, x: centre(6), y: centre(2),
    state: ENTITY_STATE.ATTACKING, targetId: 4, cooldown: ATTACK.trooper.cooldownTicks },
  { id: 4, kind: KIND.TROOPER, owner: 1, x: centre(8), y: centre(2),
    state: ENTITY_STATE.ATTACKING, targetId: 3, cooldown: ATTACK.trooper.cooldownTicks },

  // Mid-cooldown — should be faded or gone, not a permanent line.
  { id: 5, kind: KIND.SCOUT, owner: 0, x: centre(6), y: centre(4),
    state: ENTITY_STATE.ATTACKING, targetId: 6,
    cooldown: Math.round(ATTACK.scout.cooldownTicks * 0.5) },
  { id: 6, kind: KIND.SCOUT, owner: 1, x: centre(8), y: centre(4),
    state: ENTITY_STATE.ATTACKING, targetId: 5,
    cooldown: Math.round(ATTACK.scout.cooldownTicks * 0.5) },

  // Tanks, fresh — the thickest beam, and the kind that must also rotate.
  { id: 7, kind: KIND.TANK, owner: 0, x: centre(6), y: centre(7),
    state: ENTITY_STATE.ATTACKING, targetId: 8, cooldown: ATTACK.tank.cooldownTicks },
  { id: 8, kind: KIND.TANK, owner: 1, x: centre(9), y: centre(7),
    state: ENTITY_STATE.ATTACKING, targetId: 7, cooldown: ATTACK.tank.cooldownTicks },

  // Production in progress, at both producer kinds.
  { id: 9, kind: KIND.FACTORY, owner: 0, x: centre(2), y: centre(8),
    queuedKind: KIND.TANK, progress: 260 },
  { id: 10, kind: KIND.FACTORY, owner: 1, x: centre(17), y: centre(8),
    state: ENTITY_STATE.UNDER_CONSTRUCTION, progress: 300 },

  // Tanks driving in four directions — facing is eased toward the heading, so
  // they must be stepped for a few frames before it reads.
  { id: 11, kind: KIND.TANK, owner: 0, x: centre(12), y: centre(2) },
  { id: 12, kind: KIND.TANK, owner: 0, x: centre(12), y: centre(4) },
  { id: 13, kind: KIND.TANK, owner: 0, x: centre(12), y: centre(6) },
  { id: 14, kind: KIND.TANK, owner: 0, x: centre(12), y: centre(8) },
];

const HEADINGS: Record<number, [number, number]> = {
  11: [1, 0],
  12: [0, 1],
  13: [-1, 0],
  14: [0, -1],
};

class SpikeScene extends Phaser.Scene {
  private world!: WorldRenderer;
  private state!: SimState;
  private frame = 0;

  preload(): void {
    for (const asset of spriteManifest()) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(): void {
    this.state = createInitialState({
      seed: 1,
      difficulty: 1,
      players: [{ ore: 500 }, { ore: 500 }],
      nodes: [{ id: 0, x: centre(10), y: centre(10), remaining: 500 }],
      entities: SEEDS,
    });
    this.world = new WorldRenderer(this);
  }

  override update(): void {
    // Nudge the driving tanks along their heading so `faceTravel` has real
    // movement to turn toward, WITHOUT calling step() — this is a rendering
    // spike and the simulation has nothing to do with it.
    for (const entity of this.state.entities) {
      const heading = HEADINGS[entity.id];
      if (heading !== undefined) {
        this.world.captureTick(this.state);
        entity.x += heading[0] * 1.5;
        entity.y += heading[1] * 1.5;
      }
    }
    // Kill and revive a unit on a loop so a blast is almost always on screen —
    // an explosion lasts 420ms and a one-shot death is easy to miss.
    const doomed = this.state.entities.find((e) => e.id === 5);
    if (doomed !== undefined) {
      const phase = this.frame % 120;
      doomed.state = phase < 60 ? ENTITY_STATE.DEAD : ENTITY_STATE.ATTACKING;
    }
    this.frame += 1;
    this.world.draw(this.state, 0, this.time.now);
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
