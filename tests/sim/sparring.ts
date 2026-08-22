/**
 * A sparring partner for player 0 — the instrument M8 tuned against.
 *
 * `ai.ts` plays player 1 and says so explicitly: "There is no second AI: this is
 * a single-player game, and an unattended match is simply one where player 0
 * never issues a command." That is a design decision, not an oversight, so it is
 * not overturned to make a measurement convenient.
 *
 * Instead the state is reflected across the map's vertical axis with owners
 * swapped, the AI plans for "player 1" in that mirrored world, and the resulting
 * orders are flipped back and relabelled as player intent. Sound only because the
 * opening is a true mirror across x = 640, which `command-seam.test.ts` asserts.
 * Entity ids survive reflection untouched, so `builderId` and `targetId` need no
 * mapping — only world x coordinates do.
 *
 * ## Read the numbers it produces with care
 *
 * The first duration measurement taken in M8 used no sparring partner at all. It
 * was AI-versus-NOBODY, reported 1.5-minute matches and player 1 winning 18 of
 * 18, and meant nothing. With a partner the same build measured 1.6 minutes and
 * still favoured player 1 — the two sides track each other exactly until first
 * contact and then diverge, even though isolated combat is provably symmetric
 * (a mirrored 1v1 kills both units on the same tick, O-6 working as designed).
 *
 * So this is a good instrument for PACING and a poor one for BALANCE, and it is
 * a proxy for a human in neither. M9's playtest is what confirms the band against
 * real players.
 *
 * Not a `.test.ts` file: it is shared machinery for `duration.test.ts` and
 * `scripts/measure-durations.ts`, which otherwise held two copies of the mirror
 * that would drift apart the first time either changed.
 */

import { aiThink } from '../../src/sim/ai';
import { ISSUER, type Command } from '../../src/sim/commands';
import { WORLD_WIDTH_PX } from '../../src/sim/setup';
import { cloneState, type SimState } from '../../src/sim/state';

export function mirrorState(state: SimState): SimState {
  const mirrored = cloneState(state);
  for (const entity of mirrored.entities) {
    entity.owner = entity.owner === 0 ? 1 : 0;
    entity.x = WORLD_WIDTH_PX - entity.x;
    if (entity.destX >= 0) {
      entity.destX = WORLD_WIDTH_PX - entity.destX;
    }
  }
  for (const node of mirrored.nodes) {
    node.x = WORLD_WIDTH_PX - node.x;
  }
  mirrored.players = [mirrored.players[1], mirrored.players[0]];
  // Entities must stay id-sorted (O-7); reflection does not reorder ids.
  mirrored.entities.sort((a, b) => a.id - b.id);
  return mirrored;
}

/** The AI's plan for player 1 in the mirror, expressed as player 0's intent. */
export function sparringCommands(state: SimState, seq: number): Command[] {
  return aiThink(mirrorState(state)).map((command, i) => {
    // Scheduled for the CURRENT tick: `applyCommands` accepts only commands whose
    // tick equals `state.tick` (REV-009).
    const base = { ...command, tick: state.tick, issuer: ISSUER.PLAYER, seq: seq + i };
    if (base.type === 'move' || base.type === 'place') {
      return { ...base, x: WORLD_WIDTH_PX - base.x };
    }
    return base;
  });
}
