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
import { VERDICT, type Difficulty, type SimState } from '../../sim/state';
import { step } from '../../sim/step';
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

    this.world.draw(this.state, advanced.alpha);
  }

  /** Read-only access for the HUD and input layers landing in M6. */
  simState(): SimState {
    return this.state;
  }
}

export const WORLD_SIZE = { width: WORLD_WIDTH_PX, height: WORLD_HEIGHT_PX };
