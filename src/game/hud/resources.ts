/**
 * Ore counter and node depletion — T057, FR-016.
 *
 * FR-016's presentation half. The counter is the number the player checks most
 * often, so it sits top-left where the eye starts, and the remaining ore across
 * all nodes sits with it — because "how long can this economy last" is the
 * question that decides whether to expand or attack, and CR-001's sudden death
 * makes global depletion a real clock rather than a curiosity.
 */

import Phaser from 'phaser';

import type { SimState } from '../../sim/state';

const MARGIN = 12;

export class ResourceHud {
  private readonly ore: Phaser.GameObjects.Text;
  private readonly nodes: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.ore = scene.add
      .text(MARGIN, MARGIN, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#fbbf24',
      })
      .setDepth(51)
      .setScrollFactor(0);

    this.nodes = scene.add
      .text(MARGIN, MARGIN + 26, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#9ca3af',
      })
      .setDepth(51)
      .setScrollFactor(0);
  }

  draw(state: SimState): void {
    this.ore.setText(`${state.players[0].ore} ore`);

    let remaining = 0;
    let live = 0;
    for (let i = 0; i < state.nodes.length; i += 1) {
      const node = state.nodes[i]!;
      remaining += node.remaining;
      if (node.remaining > 0) {
        live += 1;
      }
    }

    // When every node is dry, say so plainly rather than showing "0" — sudden
    // death is armed at that moment (CR-001) and the player needs to know the
    // match now has a timer, not just an empty map.
    this.nodes.setText(
      live === 0 ? 'ore exhausted — sudden death' : `${live} nodes · ${remaining} ore left`,
    );
  }
}
