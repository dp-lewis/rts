/**
 * The build bar — T056, FR-010 / FR-011.
 *
 * FR-010 fixes the shape: EXACTLY five entries, four units and one structure,
 * visually separated, always visible, never nested. That is a deliberate ceiling,
 * not a starting point — research identified nested build menus as the thing that
 * makes browser RTS games unreadable in the first minute, and five flat entries
 * is the number a new player can take in without being taught.
 *
 * FR-011 says an unaffordable entry is greyed INLINE with its cost shown, rather
 * than hidden or disabled with an explanation elsewhere. The player should be able
 * to answer "what can I build, and what does the rest cost" in one glance, without
 * clicking anything.
 */

import Phaser from 'phaser';

import { BUILD_TICKS } from '../../sim/constants';
import { KIND, type Kind, type SimState } from '../../sim/state';
import { BUILD_ENTRIES, type BuildEntry } from './roster';

export { BUILD_ENTRIES, type BuildEntry };

const WIDTH = 108;
const HEIGHT = 44;
const GAP = 6;
/** The structure sits apart from the four units — FR-010's "visually separated". */
const GROUP_GAP = 22;
const MARGIN = 12;

export interface BuildBarHit {
  entry: BuildEntry;
  affordable: boolean;
}

export class BuildBar {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly bounds: Phaser.Geom.Rectangle[] = [];
  private selectedKind: Kind | undefined;

  constructor(scene: Phaser.Scene, screenHeight: number) {
    this.panel = scene.add.graphics().setDepth(50).setScrollFactor(0);

    const top = screenHeight - HEIGHT - MARGIN;
    let x = MARGIN;
    for (let i = 0; i < BUILD_ENTRIES.length; i += 1) {
      const entry = BUILD_ENTRIES[i]!;
      if (entry.placed) {
        x += GROUP_GAP;
      }
      this.bounds.push(new Phaser.Geom.Rectangle(x, top, WIDTH, HEIGHT));
      this.labels.push(
        scene.add
          .text(x + 8, top + 6, `${entry.label}\n${entry.cost} ore`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            color: '#e6e8ef',
            lineSpacing: 2,
          })
          .setDepth(51)
          .setScrollFactor(0),
      );
      x += WIDTH + GAP;
    }
  }

  setSelectedKind(kind: Kind | undefined): void {
    this.selectedKind = kind;
  }

  /** Which entry, if any, a click at (x, y) landed on. */
  hitTest(state: SimState, x: number, y: number): BuildBarHit | undefined {
    for (let i = 0; i < this.bounds.length; i += 1) {
      if (this.bounds[i]!.contains(x, y)) {
        const entry = BUILD_ENTRIES[i]!;
        return { entry, affordable: state.players[0].ore >= entry.cost };
      }
    }
    return undefined;
  }

  draw(state: SimState): void {
    const ore = state.players[0].ore;
    this.panel.clear();

    for (let i = 0; i < BUILD_ENTRIES.length; i += 1) {
      const entry = BUILD_ENTRIES[i]!;
      const box = this.bounds[i]!;
      const affordable = ore >= entry.cost;

      this.panel.fillStyle(0x12141c, 0.82);
      this.panel.fillRect(box.x, box.y, box.width, box.height);

      // Greyed, never hidden: FR-011 wants the cost of what you cannot afford
      // to stay legible, because that is what tells you how long to keep mining.
      this.panel.lineStyle(
        this.selectedKind === entry.kind ? 2 : 1,
        this.selectedKind === entry.kind ? 0xf8fafc : affordable ? 0x8ee9ff : 0x4b5563,
        1,
      );
      this.panel.strokeRect(box.x, box.y, box.width, box.height);
      this.labels[i]!.setColor(affordable ? '#e6e8ef' : '#6b7280');
    }
  }

  /** Build-bar clicks must not fall through to the world beneath. */
  containsPoint(x: number, y: number): boolean {
    for (let i = 0; i < this.bounds.length; i += 1) {
      if (this.bounds[i]!.contains(x, y)) {
        return true;
      }
    }
    return false;
  }

  /** Exposed so the HUD can report build times without importing constants. */
  static buildTicks(kind: Kind): number {
    const byKind: Record<Kind, number> = {
      [KIND.BASE]: 0,
      [KIND.FACTORY]: BUILD_TICKS.factory,
      [KIND.WORKER]: BUILD_TICKS.worker,
      [KIND.SCOUT]: BUILD_TICKS.scout,
      [KIND.TROOPER]: BUILD_TICKS.trooper,
      [KIND.TANK]: BUILD_TICKS.tank,
    };
    return byKind[kind];
  }
}
