/**
 * Under-attack and sudden-death indicators — T070, FR-023 / FR-033.
 *
 * `underAttack` is set by the simulation on the tick damage lands and cleared on
 * the next one, so a naive binding would flash the indicator for 50 ms and be
 * invisible in practice. It is LATCHED here for a readable duration — rate
 * limiting in presentation only, never in the simulation, because a simulation
 * that throttled its own flags would make the same match hash differently
 * depending on when someone last looked at the screen.
 *
 * FR-033 is the half that is easy to get wrong. Sudden-death damage gets its own
 * distinct indicator: a Base losing health with no attacker anywhere on screen,
 * under a banner saying "under attack", reads as a bug rather than as a rule.
 */

import type { SimState } from '../../sim/state';

/** How long an alert stays up after the tick that raised it, in real ms. */
const HOLD_MS = 1500;

export class AlertBand {
  private readonly underAttack: HTMLElement;
  private readonly suddenDeath: HTMLElement;
  private attackUntil = 0;
  private suddenUntil = 0;

  constructor(root: ParentNode) {
    this.underAttack = root.querySelector<HTMLElement>('[data-testid=under-attack-indicator]')!;
    this.suddenDeath = root.querySelector<HTMLElement>('[data-testid=sudden-death-indicator]')!;
  }

  /** Called every frame with the current state and the wall clock. */
  update(state: SimState, now: number): void {
    const player = state.players[0];

    if (player.underAttack) {
      this.attackUntil = now + HOLD_MS;
    }
    if (player.suddenDeathDamage) {
      this.suddenUntil = now + HOLD_MS;
    }

    this.underAttack.hidden = now >= this.attackUntil;
    this.suddenDeath.hidden = now >= this.suddenUntil;
  }

  /** A rematch must not inherit the previous match's alarm. */
  reset(): void {
    this.attackUntil = 0;
    this.suddenUntil = 0;
    this.underAttack.hidden = true;
    this.suddenDeath.hidden = true;
  }
}
