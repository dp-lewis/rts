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

import { ORE_KEY, SCENERY_KEYS, TILE_KEYS, spriteKey } from '../../assets/sprites';
import { MAP_TILES_X, MAP_TILES_Y, MAX_HP, TILE_PX } from '../../sim/constants';
import {
  ENTITY_STATE,
  KIND,
  isStructureKind,
  type Entity,
  type Kind,
  type SimState,
} from '../../sim/state';
import { Effects } from './effects';
import { jitterFor } from './jitter';
import { drawOwnership } from './ownership';

interface Snapshot {
  x: number;
  y: number;
}

/** Percentage of eligible cells that get a decoration. */
const SCENERY_DENSITY = 26;

/**
 * A stable hash of a cell position — the terrain's only source of variety.
 *
 * Not the sim PRNG: drawing scenery must not consume a draw the simulation is
 * counting, and this file is on the presentation side of a boundary that exists
 * precisely so it cannot. Not `Math.random` either, because the map would then
 * differ between two replays of the same match.
 */
function scatterHash(cx: number, cy: number, salt: number): number {
  let h = (cx * 73856093) ^ (cy * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** How long an order acknowledgement stays on screen, in real milliseconds. */
const MARKER_MS = 320;

const HEALTH_BAR_WIDTH = 40;
const HEALTH_BAR_HEIGHT = 4;

/** Max hp keyed by the numeric `Kind`, so a bar can be drawn without a switch. */
const MAX_HP_BY_KIND: Record<number, number> = {
  [KIND.BASE]: MAX_HP.base,
  [KIND.FACTORY]: MAX_HP.factory,
  [KIND.BARRACKS]: MAX_HP.barracks,
  [KIND.WORKER]: MAX_HP.worker,
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
  /** The live drag rectangle and click acknowledgements — FR-009. */
  private readonly overlay: Phaser.GameObjects.Graphics;
  private selected: ReadonlySet<number> = new Set();
  private dragRect: { x0: number; y0: number; x1: number; y1: number } | undefined;
  private markers: { x: number; y: number; born: number; hostile: boolean }[] = [];
  private readonly effects: Effects;
  /** Interpolated draw positions this frame, so effects attach to what is drawn. */
  private readonly drawn = new Map<number, { x: number; y: number }>();
  /** Facing angle per entity — presentation only, never simulated. */
  private readonly facing = new Map<number, number>();
  /** Last known kind per entity, so a death can be sized after the entity is gone. */
  private readonly kinds = new Map<number, Kind>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.drawGround();

    // Depth order is fixed here and nowhere else: ground, ownership rings,
    // sprites, health. The ring must sit UNDER the sprite to read as a glow
    // rather than as an outline drawn on top of it.
    this.ownership = scene.add.graphics().setDepth(10);
    this.health = scene.add.graphics().setDepth(30);
    this.overlay = scene.add.graphics().setDepth(40);
    this.effects = new Effects(scene);
  }

  /**
   * The static tile background and its scenery. Drawn once — the grid never
   * changes during a match, so redrawing it every frame would be hundreds of
   * draw calls for a picture that is identical each time.
   */
  private drawGround(): void {
    for (let cy = 0; cy < MAP_TILES_Y; cy += 1) {
      for (let cx = 0; cx < MAP_TILES_X; cx += 1) {
        // Hashed rather than random: the background must look the same in every
        // replay of the same match, and `Math.random` here would be the one
        // un-linted way to make a screenshot irreproducible.
        const key = TILE_KEYS[scatterHash(cx, cy, 1) % TILE_KEYS.length]!;
        this.scene.add
          .image(cx * TILE_PX + TILE_PX / 2, cy * TILE_PX + TILE_PX / 2, key)
          .setDepth(0);
      }
    }
    this.drawScenery();
  }

  /**
   * Scattered rock and vegetation — playtest round 1 called the terrain bland.
   *
   * Purely decorative: it is drawn under everything, never consulted by
   * anything, and the passability grid does not know it exists. That is a real
   * constraint rather than a shortcut — scenery that LOOKED solid while units
   * walked through it would be worse than bare ground, because a player reads
   * the map at a glance and would be reading it wrong.
   *
   * The layout is a pure function of cell position, so it is identical in every
   * match and every replay, and it costs no state. Two exclusions matter:
   *
   *  - **The starting areas**, so nothing sits under a Base, Factory, Worker or
   *    ore node, where it would compete with the things a player must find in
   *    the first ten seconds.
   *  - **The central band**, where the fighting happens. Decoration there buys
   *    atmosphere at the cost of legibility, and FR-018's whole argument is that
   *    legibility wins.
   */
  private drawScenery(): void {
    const midY = Math.floor(MAP_TILES_Y / 2);

    for (let cy = 0; cy < MAP_TILES_Y; cy += 1) {
      for (let cx = 0; cx < MAP_TILES_X; cx += 1) {
        // Keep the opening clear: bases sit at columns 2 and 17, factories at 4
        // and 15, workers between them, and ore at 6 and 13 — all on the middle
        // rows.
        const nearStart =
          Math.abs(cy - midY) <= 1 && (cx <= 7 || cx >= MAP_TILES_X - 8);
        const centreLane = Math.abs(cy - midY) <= 1;
        if (nearStart || centreLane) {
          continue;
        }

        const roll = scatterHash(cx, cy, 7) % 100;
        if (roll >= SCENERY_DENSITY) {
          continue;
        }

        const key = SCENERY_KEYS[scatterHash(cx, cy, 13) % SCENERY_KEYS.length]!;
        // Nudged off the cell centre and scaled a little, so a grid of decor does
        // not read as a grid.
        const jx = (scatterHash(cx, cy, 17) % 24) - 12;
        const jy = (scatterHash(cx, cy, 23) % 24) - 12;
        this.scene.add
          .image(cx * TILE_PX + TILE_PX / 2 + jx, cy * TILE_PX + TILE_PX / 2 + jy, key)
          .setDepth(1)
          .setAlpha(0.85)
          .setScale(0.7 + (scatterHash(cx, cy, 29) % 30) / 100);
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

  /** Presentation-only view state, pushed by the scene each frame. */
  setSelection(selected: ReadonlySet<number>): void {
    this.selected = selected;
  }

  setDragRect(rect: { x0: number; y0: number; x1: number; y1: number } | undefined): void {
    this.dragRect = rect;
  }

  /**
   * FR-009 — acknowledge an order within one rendered frame.
   *
   * Recorded with a WALL-CLOCK birth stamp and faded over real milliseconds, not
   * ticks. That is the correct coupling for once: the requirement is about how
   * quickly a human sees a response, so it must not slow down when the simulation
   * falls behind, and it must never feed back into sim timing.
   */
  addMarker(x: number, y: number, hostile: boolean, now: number): void {
    this.markers.push({ x, y, born: now, hostile });
  }

  draw(state: SimState, alpha: number, now = 0): void {
    this.drawOre(state);

    this.health.clear();
    this.ownership.clear();

    const live = new Set<number>();
    this.drawn.clear();

    for (let i = 0; i < state.entities.length; i += 1) {
      const entity = state.entities[i]!;
      if (entity.state === ENTITY_STATE.DEAD) {
        continue;
      }
      live.add(entity.id);

      const previous = this.previous.get(entity.id) ?? { x: entity.x, y: entity.y };
      // Jitter is applied to the DRAWN position only, after interpolation, so it
      // shifts the picture and never the simulated coordinate (T082).
      const structure = isStructureKind(entity.kind);
      const offset = structure ? { dx: 0, dy: 0 } : jitterFor(entity.id);
      const x = previous.x + (entity.x - previous.x) * alpha + offset.dx;
      const y = previous.y + (entity.y - previous.y) * alpha + offset.dy;

      this.drawn.set(entity.id, { x, y });
      this.drawEntity(entity, x, y);
    }

    this.effects.draw(state, this.drawn, now);
    this.drawOverlay(now);

    // A sprite whose entity died — or was never alive — must not linger.
    for (const [id, sprite] of this.sprites) {
      if (!live.has(id)) {
        // The frame a sprite is retired IS the frame its entity died, so this is
        // where an explosion belongs — no death event exists in sim state, and
        // adding one would put presentation into the hash.
        const kind = this.kinds.get(id);
        if (kind !== undefined) {
          this.effects.recordDeath(sprite.x, sprite.y, kind, now);
        }
        sprite.destroy();
        this.sprites.delete(id);
        this.previous.delete(id);
        this.facing.delete(id);
        this.kinds.delete(id);
      }
    }
  }

  /** Drag rectangle and order markers. Cleared and redrawn every frame. */
  private drawOverlay(now: number): void {
    this.overlay.clear();

    if (this.dragRect !== undefined) {
      const { x0, y0, x1, y1 } = this.dragRect;
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const width = Math.abs(x1 - x0);
      const height = Math.abs(y1 - y0);
      this.overlay.fillStyle(0xf8fafc, 0.12);
      this.overlay.fillRect(left, top, width, height);
      this.overlay.lineStyle(1, 0xf8fafc, 0.9);
      this.overlay.strokeRect(left, top, width, height);
    }

    // Expanding, fading ring. Drop finished markers by rebuilding the array —
    // it holds at most a handful of entries for a fraction of a second.
    const live: typeof this.markers = [];
    for (let i = 0; i < this.markers.length; i += 1) {
      const marker = this.markers[i]!;
      const age = (now - marker.born) / MARKER_MS;
      if (age >= 1) {
        continue;
      }
      live.push(marker);
      this.overlay.lineStyle(2, marker.hostile ? 0xef4444 : 0x8ee9ff, 1 - age);
      this.overlay.strokeCircle(marker.x, marker.y, 6 + age * 16);
    }
    this.markers = live;
  }

  private drawEntity(entity: Entity, x: number, y: number): void {
    let sprite = this.sprites.get(entity.id);
    if (sprite === undefined) {
      sprite = this.scene.add.image(x, y, spriteKey(entity.kind, entity.owner)).setDepth(20);
      this.sprites.set(entity.id, sprite);
    }
    sprite.setPosition(x, y);
    this.kinds.set(entity.id, entity.kind);
    this.faceTravel(entity, sprite, x, y);

    // A structure still going up is drawn faded — the state exists in the
    // simulation (UNDER_CONSTRUCTION) and would otherwise be invisible, which
    // reads as "my ore vanished and nothing happened".
    sprite.setAlpha(entity.state === ENTITY_STATE.UNDER_CONSTRUCTION ? 0.45 : 1);

    drawOwnership(this.ownership, entity, x, y, this.selected.has(entity.id));
    this.drawHealth(entity, x, y);
  }

  /**
   * Turn a vehicle to face where it is going — T077, from playtest round 1:
   * "the sprites don't turn, e.g. the tank is always facing the same way".
   *
   * VEHICLES ONLY. Kenney's infantry are drawn front-on, so rotating one makes a
   * soldier lie on their side; the tank is drawn side-on with its barrel to the
   * east, which is exactly Phaser's zero-angle, so it rotates correctly.
   *
   * The angle is held HERE, in a presentation map keyed by entity id, and never
   * in `Entity`. Facing changes nothing about what a unit does — combat is
   * omnidirectional (`acquireTargets` has no arc) — so putting it in sim state
   * would add a hashed field that affects nothing and stales every corpus case.
   */
  private faceTravel(entity: Entity, sprite: Phaser.GameObjects.Image, x: number, y: number): void {
    if (entity.kind !== KIND.TANK) {
      return;
    }
    const previous = this.previous.get(entity.id);
    const current = this.facing.get(entity.id) ?? 0;

    let target = current;
    if (previous !== undefined) {
      const dx = x - previous.x;
      const dy = y - previous.y;
      if (dx * dx + dy * dy > 0.25) {
        target = Math.atan2(dy, dx);
      }
    }

    // Ease toward the heading rather than snapping, and take the SHORT way round
    // — lerping raw radians makes a unit crossing the -pi/+pi boundary spin the
    // long way for no reason a player could explain.
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const next = current + delta * 0.2;
    this.facing.set(entity.id, next);
    sprite.setRotation(next);
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
