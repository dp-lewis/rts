/**
 * The match scene — T047, rewired in M7.
 *
 * This is the seam between wall-clock time and simulation time, and it is
 * deliberately the only place the two meet. `update` receives Phaser's `delta`,
 * hands it to `advanceAccumulator`, and gets back a COUNT of whole ticks. The
 * count drives `step`; the leftover drives interpolation. `delta` itself goes no
 * further, which is what makes the simulation a function of (seed, commands)
 * rather than of the player's refresh rate.
 *
 * M7 moved the HUD out. The scene now owns the world and canvas input only, and
 * reports upward through `onFrame` and `onVerdict` — the DOM shell owns the
 * screens, the build bar, the counters and the alert band. Keeping the scene
 * ignorant of them means the HUD can be rebuilt (as it just was) without
 * touching the tick loop.
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
  isStructureKind,
  type Difficulty,
  type Entity,
  type Kind,
  type SimState,
  type Verdict,
} from '../../sim/state';
import { step } from '../../sim/step';
import { orderFor } from '../input/orders';
import { placementAt } from '../input/placement';
import { TILE_PX } from '../../sim/constants';
import { selectInRect } from '../input/select';
import { advanceAccumulator } from '../loop';
import { PlacementGhost } from '../render/ghost';
import { WorldRenderer } from '../render/world';

export const MATCH_SCENE_KEY = 'Match';

export interface MatchConfig {
  seed: number;
  difficulty: Difficulty;
}

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

export interface MatchHooks {
  /** Every rendered frame, for the DOM HUD to read. */
  onFrame?: (state: SimState, now: number) => void;
  /** Once, on the tick a verdict is reached. */
  onVerdict?: (verdict: Verdict, ticks: number) => void;
  /** Once per match, on the player's first command — FR-025. */
  onFirstAction?: (now: number) => void;
}

export class MatchScene extends Phaser.Scene {
  private state!: SimState;
  // NOT `renderer` — Phaser.Scene already owns that name for the WebGL renderer.
  private world!: WorldRenderer;
  private ghost!: PlacementGhost;
  private accumulator = 0;

  /**
   * Player commands, buffered here until the tick they are scheduled for.
   *
   * NOT the same thing as `state.pending`: that holds the AI's scheduled commands
   * and must live inside hashed state so `step` can stay pure. Player intent
   * arrives from outside the simulation, so it buffers outside it and enters
   * through `step`'s argument — the seam a multiplayer feature would widen.
   */
  private queue: CommandQueue = createCommandQueue();
  private seq = 0;

  private hooks: MatchHooks = {};
  private selection: Set<number> = new Set();
  private dragFrom: { x: number; y: number } | undefined;
  private placingKind: Kind | undefined;
  /**
   * The building the player has clicked, if any — presentation state that drives
   * the production panel. Separate from `selection`, which is units: a drag that
   * captures units must not also open a building's panel, and clicking one
   * building must not clear a unit selection you are about to give orders to.
   */
  private selectedBuilding: number | undefined;
  private announcedVerdict = false;
  private firstActionSent = false;

  constructor() {
    super(MATCH_SCENE_KEY);
  }

  preload(): void {
    for (const asset of spriteManifest()) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(config?: Partial<MatchConfig> & { hooks?: MatchHooks }): void {
    // Phaser calls `create` with whatever data the caller passed, including
    // nothing at all. Reading `config.seed` off `undefined` would throw inside a
    // scene lifecycle callback, where the stack says nothing useful.
    const { seed, difficulty } = { ...DEFAULT_MATCH, ...config };
    this.state = createMatch(seed, difficulty);
    this.hooks = config?.hooks ?? {};

    this.accumulator = 0;
    this.queue = createCommandQueue();
    this.seq = 0;
    this.selection = new Set();
    this.dragFrom = undefined;
    this.placingKind = undefined;
    this.announcedVerdict = false;
    this.firstActionSent = false;

    this.world = new WorldRenderer(this);
    this.ghost = new PlacementGhost(this);

    // `journeys.yml` addresses `canvas[data-testid=game-canvas]`, and Phaser
    // creates the element itself, so the hook is attached after boot.
    this.game.canvas.setAttribute('data-testid', 'game-canvas');

    this.installInput();
  }

  /**
   * Pointer wiring. Deliberately thin: every decision is delegated to a pure
   * function tested without a scene (`selectInRect`, `orderFor`, `placementAt`),
   * so this holds only the parts that genuinely need Phaser — which is also the
   * only part no unit test can reach.
   */
  private installInput(): void {
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
        this.updateGhost(pointer.worldX, pointer.worldY);
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

  private updateGhost(x: number, y: number): void {
    const target = placementAt(this.state, x, y);
    if (target === undefined) {
      this.ghost.hide();
    } else {
      this.ghost.show(target);
    }
  }

  private onLeftDown(pointer: Phaser.Input.Pointer): void {
    if (this.placingKind !== undefined) {
      this.confirmPlacement(pointer);
      return;
    }

    // A click on one of your own buildings opens its production panel. Checked
    // before the drag starts, so selecting a Barracks is a click rather than a
    // one-pixel marquee that happens to contain it.
    const building = this.buildingAt(pointer.worldX, pointer.worldY);
    if (building !== undefined) {
      this.selectedBuilding = building.id;
      return;
    }
    this.selectedBuilding = undefined;
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
    const base = this.ownBase();
    if (base === undefined) {
      return;
    }
    this.issue({
      type: 'place',
      builderId: base.id,
      kind: this.placingKind ?? KIND.FACTORY,
      x: target.x,
      y: target.y,
    });
    this.world.addMarker(target.x, target.y, false, this.time.now);
    this.cancelPlacement();
  }

  /** One of the player's own buildings under a click, or undefined. */
  private buildingAt(x: number, y: number): Entity | undefined {
    for (let i = 0; i < this.state.entities.length; i += 1) {
      const entity = this.state.entities[i]!;
      if (
        entity.owner !== 0 ||
        entity.state === ENTITY_STATE.DEAD ||
        !isStructureKind(entity.kind)
      ) {
        continue;
      }
      // Judged by CELL, matching how placement and blocking work: a structure
      // occupies a whole tile, so anywhere in that tile is a hit on it.
      if (Math.abs(entity.x - x) <= TILE_PX / 2 && Math.abs(entity.y - y) <= TILE_PX / 2) {
        return entity;
      }
    }
    return undefined;
  }

  /** The building whose panel is open, if it is still alive. */
  selectedProducer(): Entity | undefined {
    if (this.selectedBuilding === undefined) {
      return undefined;
    }
    const entity = this.state.entities.find((e) => e.id === this.selectedBuilding);
    return entity !== undefined && entity.state !== ENTITY_STATE.DEAD ? entity : undefined;
  }

  /** Queue a unit at a specific producer — the production panel's entry point. */
  trainAt(kind: Kind, builderId: number): void {
    this.issue({ type: 'build', builderId, kind });
  }

  private ownBase() {
    return this.state.entities.find(
      (e) => e.kind === KIND.BASE && e.owner === 0 && e.state !== ENTITY_STATE.DEAD,
    );
  }

  /**
   * The Factory a combat order goes to — lowest id, an idle one preferred, so a
   * second click queues at a second Factory rather than being dropped.
   * Deterministic by id like every other tie-break (O-1, O-5).
   */
  // ── Called by the DOM build bar ───────────────────────────────────────────

  armPlacement(kind: Kind): void {
    this.placingKind = kind;
  }

  cancelPlacement(): void {
    this.placingKind = undefined;
    this.ghost.hide();
  }

  isPlacing(): boolean {
    return this.placingKind !== undefined;
  }

  ghostState(): { visible: boolean; valid: boolean } | undefined {
    return this.ghost.snapshot();
  }

  /**
   * Schedule a player command. `LATENCY` is one tick, deliberately not zero:
   * commands must land on a FUTURE tick (Constitution §II), so intent can never
   * be applied to the tick already being computed.
   */
  issue(command: PlayerIntent): void {
    // The cast is on the OUTPUT only: spreading a union member plus the three
    // scheduling fields is a valid Command by construction, but TypeScript
    // cannot re-narrow the union across a spread. The input type is what makes
    // it safe — a malformed command cannot reach this line.
    const scheduled = {
      ...command,
      tick: this.state.tick + 1,
      issuer: ISSUER.PLAYER,
      seq: this.seq,
    } as Command;

    this.queue = enqueueCommand(this.queue, scheduled);
    this.seq += 1;

    if (!this.firstActionSent) {
      this.firstActionSent = true;
      this.hooks.onFirstAction?.(this.time.now);
    }
  }

  override update(_time: number, delta: number): void {
    const advanced = advanceAccumulator(this.accumulator, delta);
    this.accumulator = advanced.accumulator;

    for (let i = 0; i < advanced.steps; i += 1) {
      if (this.state.verdict !== VERDICT.NONE) {
        break; // A settled match does not keep simulating behind the result.
      }
      // The CURRENT tick, not `tick + 1`. `applyCommands` skips any command whose
      // `tick` is not `state.tick`, and `step` applies commands BEFORE advancing
      // the tick — so draining ahead handed `step` commands it was guaranteed to
      // skip while `drainCommands` had already removed them from the queue.
      // Every player order would have been silently discarded (REV-009).
      const [due, rest] = drainCommands(this.queue, this.state.tick);
      this.queue = rest;
      this.world.captureTick(this.state);
      this.state = step(this.state, due);
    }

    // Selection is presentation state holding SIMULATION ids, so it has to be
    // reconciled: a selected unit that died must leave the set, or its id lingers
    // and a later order names an entity that no longer exists.
    for (const id of [...this.selection]) {
      const entity = this.state.entities.find((e) => e.id === id);
      if (entity === undefined || entity.state === ENTITY_STATE.DEAD) {
        this.selection.delete(id);
      }
    }

    this.world.setSelection(this.selection);
    this.world.draw(this.state, advanced.alpha, this.time.now);
    this.hooks.onFrame?.(this.state, this.time.now);

    if (this.state.verdict !== VERDICT.NONE && !this.announcedVerdict) {
      this.announcedVerdict = true;
      this.hooks.onVerdict?.(this.state.verdict, this.state.tick);
    }
  }

  /** Read-only access for the HUD, the counters, and the E2E test hook. */
  simState(): SimState {
    return this.state;
  }
}

export const WORLD_SIZE = { width: WORLD_WIDTH_PX, height: WORLD_HEIGHT_PX };
