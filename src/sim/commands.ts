import type { Kind } from './state';

/**
 * Commands and their ordering — O-4.
 *
 * The hazard is quiet and total: the player clicks and the AI decides on the same
 * tick T. Whichever command object happens to arrive first would otherwise be
 * applied first, and "which arrived first" depends on wall-clock timing, input
 * latency, and event-loop scheduling. None of that is reproducible, so a replay
 * of that tick would diverge for reasons no one could see in the log.
 *
 * The rule: sort by `(issuer, seq)` before applying. `issuer` is a fixed enum with
 * player strictly before ai; `seq` is a per-issuer monotonic counter. Arrival
 * order then makes no difference at all, which is the property the tests assert
 * by feeding identical commands in deliberately hostile orders.
 */

/** Player sorts strictly before AI. The sort depends on this, so it is asserted in tests. */
export const ISSUER = { PLAYER: 0, AI: 1 } as const;
export type Issuer = (typeof ISSUER)[keyof typeof ISSUER];

interface CommandBase {
  /** The tick this command takes effect on — always scheduled, never immediate. */
  tick: number;
  issuer: number;
  /** Per-issuer monotonic counter; the tie-break within an issuer. */
  seq: number;
}

export interface MoveCommand extends CommandBase {
  type: 'move';
  units: number[];
  x: number;
  y: number;
}

export interface AttackCommand extends CommandBase {
  type: 'attack';
  units: number[];
  targetId: number;
}

export interface BuildCommand extends CommandBase {
  type: 'build';
  builderId: number;
  kind: Kind;
}

export type Command = MoveCommand | AttackCommand | BuildCommand;

export interface CommandQueue {
  readonly pending: readonly Command[];
}

export function createCommandQueue(): CommandQueue {
  return { pending: [] };
}

export function enqueueCommand(queue: CommandQueue, command: Command): CommandQueue {
  return { pending: [...queue.pending, command] };
}

/**
 * The canonical order. Total, not merely consistent: no two distinct commands
 * compare equal, so the engine's sort stability never becomes load-bearing.
 */
export function sortCommands(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) => a.issuer - b.issuer || a.seq - b.seq);
}

/**
 * Take everything scheduled for `tick`, in canonical order, and return the queue
 * without them. Pure — the caller's queue is untouched.
 */
export function drainCommands(queue: CommandQueue, tick: number): [Command[], CommandQueue] {
  const due: Command[] = [];
  const rest: Command[] = [];
  for (let i = 0; i < queue.pending.length; i += 1) {
    const command = queue.pending[i]!;
    (command.tick === tick ? due : rest).push(command);
  }
  return [sortCommands(due), { pending: rest }];
}
