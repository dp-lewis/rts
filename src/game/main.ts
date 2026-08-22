/**
 * Phaser boot — T047.
 *
 * FR-014 fixes the playfield at one screen: 20x11 tiles of 64 px, no camera and
 * no scrolling, so both bases are visible from the first frame and "where is the
 * fight" never needs a minimap. The canvas is therefore a fixed 1280x704 that
 * Phaser scales to fit the window rather than a viewport-sized surface — the
 * simulation's coordinate space must not depend on the size of the browser
 * window.
 */

import Phaser from 'phaser';

import { MatchScene, MATCH_SCENE_KEY, WORLD_SIZE } from './scenes/Match';

export function bootGame(parent: string | HTMLElement = 'game'): Phaser.Game {
  const game = new Phaser.Game({
    // WEBGL rather than AUTO: Phaser 4 deprecated the Canvas renderer, so AUTO's
    // fallback is not a real fallback. FR-024's honest message (T071) is the
    // supported path when WebGL is missing, not a silently degraded render.
    type: Phaser.WEBGL,
    parent,
    width: WORLD_SIZE.width,
    height: WORLD_SIZE.height,
    backgroundColor: '#12141c',
    // Kenney's art is 64 px pixel art; smoothing it turns crisp edges to mush.
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [MatchScene],
  });

  // The difficulty gate (T067) will supply these in M7. Until then the match
  // starts directly on Normal so M5 has something to look at. The scene defaults
  // to the same values if it is ever started without data.
  game.scene.start(MATCH_SCENE_KEY, { seed: 20260822, difficulty: 1 });

  return game;
}
