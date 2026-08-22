/**
 * The match scene — T047.
 *
 * This is the seam between wall-clock time and simulation time, and it is
 * deliberately the only place the two meet. `update` receives Phaser's `delta`,
 * hands it to `advanceAccumulator`, and gets back a COUNT of whole ticks. The
 * count drives `step`; the leftover drives interpolation. `delta` itself goes no
 * further, which is what makes the simulation a function of (seed, commands)
 * rather than of the player's refresh rate.
 */

import Phaser from 'phaser';

import { spriteManifest } from '../../assets/sprites';
import {
  ISSUER,
  createCommandQueue,
  drainCommands,
  enqueueCommand,
  type Command,
  type CommandQueue,
} from '../../sim/commands';
import { createMatch, WORLD_HEIGHT_PX, WORLD_WIDTH_PX } from '../../sim/setup';
import {
  ENTITY_STATE,
  KIND,
  VERDICT,
  type Difficulty,
  type Kind,
  type SimState,
} from '../../sim/state';
import { step } from '../../sim/step';
import { BuildBar } from '../hud/buildbar';
import { ResourceHud } from '../hud/resources';
import { orderFor } from '../input/orders';
import { placementAt } from '../input/placement';
import { PlacementGhost } from '../render/ghost';
import { selectInRect } from '../input/select';
import { advanceAccumulator } from '../loop';
import { WorldRenderer } from '../render/world';

export const MATCH_SCENE_KEY = 'Match';

export interface MatchConfig {
  seed: number;
  difficulty: Difficulty;
}

/** The match Phaser starts when the scene is given no data (M7's gate supplies it). */
const DEFAULT_MATCH: MatchConfig = { seed: 20260822, difficulty: 1 };

/**
 * A command minus the three fields the scene owns.
 *
 * Distributive on purpose: `Omit` applied to the union directly would collapse it
 * to the shared fields and accept `{ type: 'move', targetId: 5 }` — a shape no
 * command has. Distributing keeps the three variants separate, so the caller must
 * supply a coherent one.
 */
type Unscheduled<C> = C extends Command ? Omit<C, 'tick' | 'issuer' | 'seq'> : never;
export type PlayerIntent = Unscheduled<Command>;

export class MatchScene extends Phaser.Scene {
  private state!: SimState;
  // NOT `renderer` — Phaser.Scene already owns that name for the WebGL renderer.
  private world!: WorldRenderer;
  private accumulator = 0;

  /**
   * Player commands, buffered here until the tick they are scheduled for.
   *
   * This is the CommandQueue's real user (M4 finding F1 left the question open).
   * It is NOT the same thing as `state.pending`: that holds the AI's scheduled
   * commands and must live inside hashed state so `step` can stay pure. Player
   * intent arrives from outside the simulation, so it buffers outside it and
   * enters through `step`'s argument — which is exactly the seam a multiplayer
   * feature would widen.
   */
  private queue: CommandQueue = createCommandQueue();
  private seq = 0;

  // ── Presentation-only input state. None of this is hashed, none of it reaches
  // `step`, and all of it is rebuilt from scratch on a rematch.
  private buildBar!: BuildBar;
  private resources!: ResourceHud;
  private ghost!: PlacementGhost;
  private selection: Set<number> = new Set();
  private dragFrom: { x: number; y: number } | undefined;
  /** The Base the player builds from. Recomputed on demand — Bases can die. */
  private placingKind: Kind | undefined;

  constructor() {
    super(MATCH_SCENE_KEY);
  }

  preload(): void {
    for (const asset of spriteManifest()) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(config?: Partial<MatchConfig>): void {
    // Phaser calls `create` with whatever data the caller passed, including
    // nothing at all. Reading `config.seed` off `undefined` would throw inside a
    // scene lifecycle callback, where the stack says nothing useful.
    const { seed, difficulty } = { ...DEFAULT_MATCH, ...config };
    this.state = createMatch(seed, difficulty);
    this.accumulator = 0;
    this.queue = createCommandQueue();
    this.seq = 0;
    this.world = new WorldRenderer(this);
    this.resources = new ResourceHud(this);
    this.buildBar = new BuildBar(this, this.scale.height);
    this.ghost = new PlacementGhost(this);
    this.selection = new Set();
    this.dragFrom = undefined;
    this.placingKind = undefined;

    this.installInput();
  }

  /**
   * Pointer wiring. Deliberately thin: every decision here is delegated to a pure
   * function that is tested without a scene (`selectInRect`, `orderFor`,
   * `placementAt`), so this method holds only the parts that genuinely need
   * Phaser — which is also the only part no unit test can reach.
   */
  private installInput(): void {
    // Phaser's own context menu would otherwise eat every right-click.
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.onRightClick(pointer);
        return;
      }
      this.onLeftDown(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.placingKind !== undefined) {
        const target = placementAt(this.state, pointer.worldX, pointer.worldY);
        if (target === undefined) {
          this.ghost.hide();
        } else {
          this.ghost.show(target);
        }
        return;
      }
      if (this.dragFrom !== undefined) {
        this.world.setDragRect({
          x0: this.dragFrom.x,
          y0: this.dragFrom.y,
          x1: pointer.worldX,
          y1: pointer.worldY,
        });
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragFrom === undefined) {
        return;
      }
      const from = this.dragFrom;
      this.dragFrom = undefined;
      this.world.setDragRect(undefined);

      this.selection = new Set(
        selectInRect(
          this.state,
          { x0: from.x, y0: from.y, x1: pointer.worldX, y1: pointer.worldY },
          0,
        ),
      );
    });
  }

  private onLeftDown(pointer: Phaser.Input.Pointer): void {
    // HUD first: a click on the build bar must never fall through and start a
    // marquee across the units behind it.
    const hit = this.buildBar.hitTest(this.state, pointer.x, pointer.y);
    if (hit !== undefined) {
      if (!hit.affordable) {
        return; // FR-011: greyed and inert, never a dialog explaining why.
      }
      if (hit.entry.placed) {
        this.placingKind = hit.entry.kind;
        this.buildBar.setSelectedKind(hit.entry.kind);
      } else {
        this.queueBuild(hit.entry.kind);
      }
      return;
    }

    if (this.placingKind !== undefined) {
      this.confirmPlacement(pointer);
      return;
    }

    this.dragFrom = { x: pointer.worldX, y: pointer.worldY };
  }

  private onRightClick(pointer: Phaser.Input.Pointer): void {
    // Right-click is also "never mind" for a pending placement — FR-013 wants no
    // dialogs, so cancelling has to be something the hand already knows.
    if (this.placingKind !== undefined) {
      this.cancelPlacement();
      return;
    }

    const order = orderFor(
      this.state,
      [...this.selection].sort((a, b) => a - b),
      pointer.worldX,
      pointer.worldY,
      0,
    );
    if (order === undefined) {
      return;
    }
    this.issue(order);
    // FR-009: acknowledged in the frame the click happened, before the command
    // has been anywhere near the simulation.
    this.world.addMarker(pointer.worldX, pointer.worldY, order.type === 'attack', this.time.now);
  }

  private confirmPlacement(pointer: Phaser.Input.Pointer): void {
    const target = placementAt(this.state, pointer.worldX, pointer.worldY);
    if (target === undefined || !target.valid) {
      return; // The ghost already said so. Refusing inline IS the feedback.
    }
    const base = this.state.entities.find((e) => e.kind === KIND.BASE && e.owner === 0);
    if (base === undefined) {
      return;
    }
    this.issue({ type: 'place', builderId: base.id, kind: KIND.FACTORY, x: target.x, y: target.y });
    this.world.addMarker(target.x, target.y, false, this.time.now);
    this.cancelPlacement();
  }

  private cancelPlacement(): void {
    this.placingKind = undefined;
    this.ghost.hide();
    this.buildBar.setSelectedKind(undefined);
  }

  private queueBuild(kind: Kind): void {
    const base = this.state.entities.find((e) => e.kind === KIND.BASE && e.owner === 0);
    if (base === undefined) {
      return;
    }
    this.issue({ type: 'build', builderId: base.id, kind });
  }

  /**
   * Schedule a player command. `LATENCY` is one tick, deliberately not zero:
   * commands must land on a FUTURE tick (Constitution §II), so intent can never
   * be applied to the tick that is already being computed.
   */
  issue(command: PlayerIntent): void {
    // The cast is on the OUTPUT only: spreading a union member plus the three
    // scheduling fields is a valid Command by construction, but TypeScript
    // cannot re-narrow the union across a spread. The input type above is what
    // makes it safe — a malformed command cannot reach this line.
    const scheduled = {
      ...command,
      tick: this.state.tick + 1,
      issuer: ISSUER.PLAYER,
      seq: this.seq,
    } as Command;

    this.queue = enqueueCommand(this.queue, scheduled);
    this.seq += 1;
  }

  override update(_time: number, delta: number): void {
    const advanced = advanceAccumulator(this.accumulator, delta);
    this.accumulator = advanced.accumulator;

    for (let i = 0; i < advanced.steps; i += 1) {
      if (this.state.verdict !== VERDICT.NONE) {
        break; // A settled match does not keep simulating behind the result.
      }
      // The CURRENT tick, not `tick + 1`. `applyCommands` skips any command whose
      // `tick` is not `state.tick` (TC-UNIT-008), and `step` applies commands
      // BEFORE advancing the tick — so draining ahead handed `step` commands it
      // was guaranteed to skip, and `drainCommands` had already removed them from
      // the queue. Every player order would have been silently discarded.
      // `replay.ts` is the reference: `commands.filter((c) => c.tick === state.tick)`.
      const [due, rest] = drainCommands(this.queue, this.state.tick);
      this.queue = rest;
      this.world.captureTick(this.state);
      this.state = step(this.state, due);
    }

    // Selection is presentation state holding SIMULATION ids, so it has to be
    // reconciled: a selected unit that died must leave the set, or its id lingers
    // and a later order names an entity that no longer exists.
    if (this.selection.size > 0) {
      for (const id of [...this.selection]) {
        const entity = this.state.entities.find((e) => e.id === id);
        if (entity === undefined || entity.state === ENTITY_STATE.DEAD) {
          this.selection.delete(id);
        }
      }
    }

    this.world.setSelection(this.selection);
    this.world.draw(this.state, advanced.alpha, this.time.now);
    this.resources.draw(this.state);
    this.buildBar.draw(this.state);
  }

  /** Read-only access for the HUD and input layers landing in M6. */
  simState(): SimState {
    return this.state;
  }
}

export const WORLD_SIZE = { width: WORLD_WIDTH_PX, height: WORLD_HEIGHT_PX };
