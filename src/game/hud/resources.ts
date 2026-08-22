/**
 * Ore counter and node depletion — T057 (reworked in M7), FR-016.
 *
 * DOM for the reasons in `buildbar.ts`: `journeys.yml` addresses
 * `[data-testid=ore-counter]` directly, and STEP-003 of JRN-001 reads it to prove
 * that a player who touches nothing still sees the economy working.
 */

import type { SimState } from '../../sim/state';

export class ResourceHud {
  private readonly ore: HTMLElement;
  private readonly nodes: HTMLElement;

  constructor(root: ParentNode) {
    this.ore = root.querySelector<HTMLElement>('[data-testid=ore-counter]')!;
    this.nodes = root.querySelector<HTMLElement>('[data-testid=node-status]')!;
  }

  draw(state: SimState): void {
    const ore = String(state.players[0].ore);
    // Guarded because this runs every frame and touching textContent
    // unconditionally invalidates layout for a string that rarely changes.
    if (this.ore.textContent !== ore) {
      this.ore.textContent = ore;
    }

    let remaining = 0;
    let live = 0;
    for (let i = 0; i < state.nodes.length; i += 1) {
      const node = state.nodes[i]!;
      remaining += node.remaining;
      if (node.remaining > 0) {
        live += 1;
      }
    }

    // When every node is dry, say so plainly rather than showing a zero: sudden
    // death arms at that moment (CR-001), and the player needs to know the match
    // now has a clock rather than just an empty map.
    const text =
      live === 0 ? 'ore exhausted — sudden death' : `${live} nodes · ${remaining} ore left`;
    if (this.nodes.textContent !== text) {
      this.nodes.textContent = text;
    }
  }
}
