/**
 * The world renderer — T050.
 *
 * Reads simulation state and draws it. It never writes to sim state, never calls
 * `step`, and never sees a frame delta: everything time-dependent reaches it as
 * `alpha`, a fraction in [0, 1) of the way from the previous tick to the current
 * one. Positions are interpolated for smoothness at any refresh rate while the
 * simulation itself advances only in whole 20 Hz ticks.
 *
 * Interpolation needs where each entity was on the PREVIOUS tick, which is not
 * in `SimState` — the simulation has no reason to carry it. The renderer keeps
 * its own copy, which is legitimate presentation state: throwing it away would
 * change nothing but the smoothness of the draw.
 */

import Phaser from 'phaser';

import { ORE_KEY, TILE_KEYS, spriteKey } from '../../assets/sprites';
import { MAP_TILES_X, MAP_TILES_Y, MAX_HP, TILE_PX } from '../../sim/constants';
import { ENTITY_STATE, KIND, type Entity, type SimState } from '../../sim/state';
import { jitterFor } from './jitter';
import { drawOwnership } from './ownership';

interface Snapshot {
  x: number;
  y: number;
}

const HEALTH_BAR_WIDTH = 40;
const HEALTH_BAR_HEIGHT = 4;

/** Max hp keyed by the numeric `Kind`, so a bar can be drawn without a switch. */
const MAX_HP_BY_KIND: Record<number, number> = {
  [KIND.BASE]: MAX_HP.base,
  [KIND.FACTORY]: MAX_HP.factory,
  [KIND.WORKER]: MAX_HP.worker,
  [KIND.SCOUT]: MAX_HP.scout,
  [KIND.TROOPER]: MAX_HP.trooper,
  [KIND.TANK]: MAX_HP.tank,
};

export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly oreSprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly previous = new Map<number, Snapshot>();
  private readonly health: Phaser.GameObjects.Graphics;
  private readonly ownership: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.drawGround();

    // Depth order is fixed here and nowhere else: ground, ownership rings,
    // sprites, health. The ring must sit UNDER the sprite to read as a glow
    // rather than as an outline drawn on top of it.
    this.ownership = scene.add.graphics().setDepth(10);
    this.health = scene.add.graphics().setDepth(30);
  }

  /**
   * The static tile background. Drawn once — the grid never changes during a
   * match, so redrawing 220 tiles every frame would be 220 draw calls for a
   * picture that is identical each time.
   */
  private drawGround(): void {
    for (let cy = 0; cy < MAP_TILES_Y; cy += 1) {
      for (let cx = 0; cx < MAP_TILES_X; cx += 1) {
        // A fixed checker rather than a random pick: the background must look
        // the same in every replay of the same match, and `Math.random` here
        // would be the one un-linted way to make a screenshot irreproducible.
        const key = TILE_KEYS[(cx + cy) % TILE_KEYS.length]!;
        this.scene.add
          .image(cx * TILE_PX + TILE_PX / 2, cy * TILE_PX + TILE_PX / 2, key)
          .setDepth(0);
      }
    }
  }

  /**
   * Record where everything is BEFORE the simulation advances, so the next draw
   * can interpolate from it. Called by the scene immediately before `step`.
   */
  captureTick(state: SimState): void {
    for (let i = 0; i < state.entities.length; i += 1) {
      const entity = state.entities[i]!;
      this.previous.set(entity.id, { x: entity.x, y: entity.y });
    }
  }

  draw(state: SimState, alpha: number): void {
    this.drawOre(state);

    this.health.clear();
    this.ownership.clear();

    const live = new Set<number>();

    for (let i = 0; i < state.entities.length; i += 1) {
      const entity = state.entities[i]!;
      if (entity.state === ENTITY_STATE.DEAD) {
        continue;
      }
      live.add(entity.id);

      const previous = this.previous.get(entity.id) ?? { x: entity.x, y: entity.y };
      // Jitter is applied to the DRAWN position only, after interpolation, so it
      // shifts the picture and never the simulated coordinate (T082).
      const structure = entity.kind === KIND.BASE || entity.kind === KIND.FACTORY;
      const offset = structure ? { dx: 0, dy: 0 } : jitterFor(entity.id);
      const x = previous.x + (entity.x - previous.x) * alpha + offset.dx;
      const y = previous.y + (entity.y - previous.y) * alpha + offset.dy;

      this.drawEntity(entity, x, y);
    }

    // A sprite whose entity died — or was never alive — must not linger.
    for (const [id, sprite] of this.sprites) {
      if (!live.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
        this.previous.delete(id);
      }
    }
  }

  private drawEntity(entity: Entity, x: number, y: number): void {
    let sprite = this.sprites.get(entity.id);
    if (sprite === undefined) {
      sprite = this.scene.add.image(x, y, spriteKey(entity.kind, entity.owner)).setDepth(20);
      this.sprites.set(entity.id, sprite);
    }
    sprite.setPosition(x, y);

    // A structure still going up is drawn faded — the state exists in the
    // simulation (UNDER_CONSTRUCTION) and would otherwise be invisible, which
    // reads as "my ore vanished and nothing happened".
    sprite.setAlpha(entity.state === ENTITY_STATE.UNDER_CONSTRUCTION ? 0.45 : 1);

    drawOwnership(this.ownership, entity, x, y);
    this.drawHealth(entity, x, y);
  }

  private drawHealth(entity: Entity, x: number, y: number): void {
    const max = MAX_HP_BY_KIND[entity.kind] ?? entity.hp;
    if (entity.hp >= max) {
      return; // An unbroken row of full bars is noise, not information.
    }

    const fraction = Math.max(0, entity.hp / max);
    const left = x - HEALTH_BAR_WIDTH / 2;
    const top = y - TILE_PX / 2 + 2;

    this.health.fillStyle(0x000000, 0.65);
    this.health.fillRect(left - 1, top - 1, HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2);
    this.health.fillStyle(fraction > 0.35 ? 0x4ade80 : 0xef4444, 1);
    this.health.fillRect(left, top, HEALTH_BAR_WIDTH * fraction, HEALTH_BAR_HEIGHT);
  }

  private drawOre(state: SimState): void {
    for (let i = 0; i < state.nodes.length; i += 1) {
      const node = state.nodes[i]!;
      let sprite = this.oreSprites.get(node.id);
      if (sprite === undefined) {
        sprite = this.scene.add.image(node.x, node.y, ORE_KEY).setDepth(5);
        this.oreSprites.set(node.id, sprite);
      }
      // Depletion is legible without a number: the node fades as it empties and
      // disappears when it is spent (FR-016's presentation half lands in T057).
      sprite.setVisible(node.remaining > 0);
    }
  }
}
