/**
 * The result screen and the rematch loop — T068 / T069, FR-017 / FR-019.
 *
 * "For a bounded game the rematch button IS the retention loop." v1 deliberately
 * forgoes the multiplayer retention mechanism every competitor leads with, so
 * this screen carries disproportionate weight: it must state the outcome without
 * softening it, and then get the player back in with one click.
 *
 * Defeat offers exactly what victory offers — same controls, same sizes, no
 * post-mortem. A loss screen with an extra step is where a bounded game loses the
 * player it just beat.
 */

import { VERDICT, type Verdict } from '../../sim/state';
import { MS_PER_TICK } from '../../sim/constants';

const HEADLINE: Record<number, string> = {
  [VERDICT.VICTORY]: 'Victory',
  [VERDICT.DEFEAT]: 'Defeat',
  [VERDICT.DRAW]: 'Draw',
};

/** Ticks are the only clock the simulation has, and it is exact. Exported for test. */
export function formatDuration(ticks: number): string {
  const totalSeconds = Math.round((ticks * MS_PER_TICK) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export class Result {
  private readonly root: HTMLElement;
  private readonly outcome: HTMLElement;
  private readonly duration: HTMLElement;

  constructor(root: HTMLElement, onRematch: () => void, onChangeDifficulty: () => void) {
    this.root = root;
    this.outcome = root.querySelector<HTMLElement>('[data-testid=result-outcome]')!;
    this.duration = root.querySelector<HTMLElement>('[data-testid=match-duration]')!;

    root.querySelector<HTMLButtonElement>('[data-testid=rematch]')!.addEventListener(
      'click',
      onRematch,
    );
    root
      .querySelector<HTMLButtonElement>('[data-testid=change-difficulty]')!
      .addEventListener('click', onChangeDifficulty);
  }

  show(verdict: Verdict, ticks: number): void {
    this.outcome.textContent = HEADLINE[verdict] ?? 'Match over';
    this.duration.textContent = `Match length ${formatDuration(ticks)}`;
    this.root.hidden = false;
    // Move focus to the primary action: a keyboard player must not have to hunt
    // for Rematch, and a screen reader should land on the outcome's own screen.
    this.root.querySelector<HTMLButtonElement>('[data-testid=rematch]')?.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}
