/**
 * Combat and production feedback — T077, from playtest round 1.
 *
 * Two of the eight findings were the same complaint in different words: "it's not
 * clear when things are building" and "it's not clear when things are attacking,
 * eg no lasers or explosions". The simulation had been doing both correctly since
 * M3; it simply never said so. Health bars changed and units died, and a player
 * had to infer the cause.
 *
 * Everything here is derived from state the simulation already publishes —
 * `targetId`, `cooldown`, `progress`, `queuedKind` — and nothing is written back.
 * Deleting this file would change the picture and not a single hash.
 */

import Phaser from 'phaser';

import { ATTACK, BUILD_TICKS, TILE_PX } from '../../sim/constants';
import { ENTITY_STATE, KIND, type Entity, type Kind, type SimState } from '../../sim/state';

/** Cooldown ticks by kind, so a shot's freshness can be read from `cooldown`. */
const COOLDOWN: Partial<Record<number, number>> = {
  [KIND.WORKER]: ATTACK.worker.cooldownTicks,
  [KIND.TROOPER]: ATTACK.trooper.cooldownTicks,
  [KIND.TANK]: ATTACK.tank.cooldownTicks,
};

const BUILD_TICKS_BY_KIND: Partial<Record<number, number>> = {
  [KIND.FACTORY]: BUILD_TICKS.factory,
  [KIND.BARRACKS]: BUILD_TICKS.barracks,
  [KIND.WORKER]: BUILD_TICKS.worker,
  [KIND.TROOPER]: BUILD_TICKS.trooper,
  [KIND.TANK]: BUILD_TICKS.tank,
};

const BEAM_COLOUR = { 0: 0x8ee9ff, 1: 0xffb457 } as const;
const EXPLOSION_MS = 420;
const PROGRESS_WIDTH = 44;

interface Explosion {
  x: number;
  y: number;
  born: number;
  big: boolean;
}

export class Effects {
  private readonly beams: Phaser.GameObjects.Graphics;
  private readonly progress: Phaser.GameObjects.Graphics;
  private readonly blasts: Phaser.GameObjects.Graphics;
  private explosions: Explosion[] = [];

  constructor(scene: Phaser.Scene) {
    // Beams under the sprites so a unit is never hidden by its own fire; blasts
    // above, because an explosion is the thing you are meant to look at.
    this.beams = scene.add.graphics().setDepth(15);
    this.progress = scene.add.graphics().setDepth(31);
    this.blasts = scene.add.graphics().setDepth(45);
  }

  /** Called when an entity's sprite is retired, i.e. the tick it died. */
  recordDeath(x: number, y: number, kind: Kind, now: number): void {
    this.explosions.push({ x, y, born: now, big: kind === KIND.BASE || kind === KIND.FACTORY });
  }

  clear(): void {
    this.explosions = [];
    this.beams.clear();
    this.progress.clear();
    this.blasts.clear();
  }

  /**
   * @param positions interpolated draw positions by entity id, so a beam starts
   *   where the shooter is DRAWN rather than where it simulates — otherwise fire
   *   visibly detaches from the unit at anything above 20 fps.
   */
  draw(state: SimState, positions: Map<number, { x: number; y: number }>, now: number): void {
    this.beams.clear();
    this.progress.clear();
    this.blasts.clear();

    for (let i = 0; i < state.entities.length; i += 1) {
      const entity = state.entities[i]!;
      if (entity.state === ENTITY_STATE.DEAD) {
        continue;
      }
      this.drawBeam(entity, positions);
      this.drawProgress(entity, positions);
    }

    this.drawExplosions(now);
  }

  /**
   * A shot, drawn from how recently it was fired.
   *
   * `cooldown` is set to the full interval on the tick a unit fires and counts
   * down from there, so it doubles as "how fresh is this shot" without the
   * renderer having to detect the firing edge itself — which would need a copy of
   * last tick's cooldowns and would miss any shot fired on a frame that ran two
   * ticks at once.
   */
  private drawBeam(entity: Entity, positions: Map<number, { x: number; y: number }>): void {
    if (entity.state !== ENTITY_STATE.ATTACKING || entity.targetId < 0) {
      return;
    }
    const max = COOLDOWN[entity.kind];
    if (max === undefined || entity.cooldown <= 0) {
      return;
    }

    const from = positions.get(entity.id);
    const to = positions.get(entity.targetId);
    if (from === undefined || to === undefined) {
      return;
    }

    // Only the freshest third of the cooldown draws, so the screen shows shots
    // rather than a permanent web of lines between everything in range.
    const freshness = entity.cooldown / max;
    if (freshness < 0.66) {
      return;
    }
    const alpha = (freshness - 0.66) / 0.34;

    this.beams.lineStyle(entity.kind === KIND.TANK ? 3 : 2, BEAM_COLOUR[entity.owner], alpha);
    this.beams.lineBetween(from.x, from.y, to.x, to.y);
  }

  /**
   * Production progress, on the producer rather than in the HUD.
   *
   * "It's not clear when things are building" was the complaint, and the reason
   * is that the only feedback was ore leaving the counter at COMPLETION — up to
   * fifteen seconds after the click, with nothing in between.
   */
  private drawProgress(entity: Entity, positions: Map<number, { x: number; y: number }>): void {
    const building = entity.state === ENTITY_STATE.UNDER_CONSTRUCTION;
    const producing = entity.queuedKind >= 0;
    if (!building && !producing) {
      return;
    }

    const required = BUILD_TICKS_BY_KIND[building ? entity.kind : entity.queuedKind];
    if (required === undefined || required <= 0) {
      return;
    }

    const at = positions.get(entity.id);
    if (at === undefined) {
      return;
    }

    const fraction = Math.min(1, entity.progress / required);
    const left = at.x - PROGRESS_WIDTH / 2;
    const top = at.y + TILE_PX / 2 - 8;

    this.progress.fillStyle(0x000000, 0.7);
    this.progress.fillRect(left - 1, top - 1, PROGRESS_WIDTH + 2, 6);
    // Amber, matching the ore counter: this bar is spending, and it reads as the
    // same currency the counter is about to lose.
    this.progress.fillStyle(0xfbbf24, 1);
    this.progress.fillRect(left, top, PROGRESS_WIDTH * fraction, 4);
  }

  private drawExplosions(now: number): void {
    const live: Explosion[] = [];
    for (let i = 0; i < this.explosions.length; i += 1) {
      const blast = this.explosions[i]!;
      const age = (now - blast.born) / EXPLOSION_MS;
      if (age >= 1) {
        continue;
      }
      live.push(blast);

      const radius = (blast.big ? 46 : 22) * (0.35 + age);
      this.blasts.lineStyle(blast.big ? 4 : 2, 0xffd166, 1 - age);
      this.blasts.strokeCircle(blast.x, blast.y, radius);
      this.blasts.fillStyle(0xff7b3c, (1 - age) * 0.45);
      this.blasts.fillCircle(blast.x, blast.y, radius * 0.6);
    }
    this.explosions = live;
  }
}
