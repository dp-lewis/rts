/**
 * The difficulty gate — T067, FR-001 / FR-002 / FR-026.
 *
 * A DOM controller, not a `Phaser.Scene`, despite living under `scenes/`. FR-026
 * requires the gate to be operable by keyboard with visible focus, and a canvas
 * has neither focusable elements nor a focus ring; T066's axe floor cannot see
 * into a canvas either. The file path is kept because `tasks.md` names it; what
 * changed is the technology, not the responsibility.
 *
 * The three options are self-declaring — "New to this" rather than "Easy" —
 * because the gate is the first thing a first-time player meets and difficulty
 * jargon asks them to rate themselves before they know what the game is.
 */

import type { Difficulty } from '../../sim/state';

export class Gate {
  private readonly root: HTMLElement;
  private readonly options: HTMLButtonElement[];

  constructor(root: HTMLElement, onChoose: (difficulty: Difficulty) => void) {
    this.root = root;
    this.options = [...root.querySelectorAll<HTMLButtonElement>('[data-difficulty]')];

    for (const option of this.options) {
      // Native <button>, so Enter AND Space activate, focus is reachable by Tab,
      // and the accessible role is right without an aria- attribute in sight.
      // Re-implementing that on a div is how keyboard support quietly rots.
      option.addEventListener('click', () => {
        const value = Number(option.dataset['difficulty']);
        onChoose(value as Difficulty);
      });
    }
  }

  show(): void {
    this.root.hidden = false;
    // Focus the first option so a keyboard player is already inside the gate
    // rather than tabbing through browser chrome to reach it.
    this.options[0]?.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }
}
