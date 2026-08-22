/**
 * The build bar — T056 (reworked in M7), FR-010 / FR-011.
 *
 * Rebuilt as DOM in M7. It was drawn inside the Phaser canvas in M6, which looked
 * correct and was unreachable by every selector in `journeys.yml` — the
 * authoritative journey addresses `[data-testid=build-trooper]` directly, and a
 * canvas has no such element. It was also invisible to the axe WCAG-AA floor and
 * to a screen reader, so a "zero violations" result would have been green for
 * want of anything to audit.
 *
 * Entries are real <button>s generated from the shared roster, so the five-entry
 * shape (FR-010) and the costs (FR-011) have exactly one source.
 */

import { BUILD_ENTRIES, type BuildEntry } from './roster';
import { KIND, type Kind, type SimState } from '../../sim/state';

export interface BuildBarHandlers {
  /** A unit entry: queue it on whichever producer the kind belongs to. */
  onQueue: (kind: Kind) => void;
  /** The structure entry: arm placement rather than queueing. */
  onPlace: (kind: Kind) => void;
  /** Whether a combat order currently has a Factory to go to. */
  hasFactory: () => boolean;
}

const TESTID: Record<string, string> = {
  Worker: 'build-worker',
  Scout: 'build-scout',
  Trooper: 'build-trooper',
  Tank: 'build-tank',
  Factory: 'build-factory',
};

export class BuildBar {
  private readonly buttons = new Map<Kind, HTMLButtonElement>();
  private readonly reason = new Map<Kind, boolean>();
  private readonly handlers: BuildBarHandlers;
  private armed: Kind | undefined;

  constructor(root: HTMLElement, handlers: BuildBarHandlers) {
    this.handlers = handlers;
    root.replaceChildren();

    for (const entry of BUILD_ENTRIES) {
      const button = this.render(entry);
      button.addEventListener('click', () => {
        // FR-011: the entry is greyed and INERT. No dialog, no toast, no
        // explanation — the greyed cost already said why.
        if (button.getAttribute('aria-disabled') === 'true') {
          return;
        }
        if (entry.placed) {
          handlers.onPlace(entry.kind);
        } else {
          handlers.onQueue(entry.kind);
        }
      });
      this.buttons.set(entry.kind, button);
      root.append(button);
    }
  }

  private render(entry: BuildEntry): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = entry.placed ? 'build-entry placed' : 'build-entry';
    button.dataset['testid'] = TESTID[entry.label] ?? `build-${entry.label.toLowerCase()}`;
    button.setAttribute('data-testid', button.dataset['testid']);

    const name = document.createElement('span');
    name.textContent = entry.label;
    const cost = document.createElement('span');
    cost.className = 'build-cost';
    // Cost stays in the DOM even when unaffordable — FR-011 is explicit that it
    // is greyed with the cost SHOWN, not hidden. Hiding it removes the one thing
    // that tells a new player how long to keep mining.
    cost.textContent = `${entry.cost} ore`;

    // A second line, empty unless there is something to say. Reserved rather than
    // inserted on demand so the bar never changes height mid-match.
    const note = document.createElement('span');
    note.className = 'build-note';

    button.append(name, cost, note);
    return button;
  }

  /** Highlight the entry whose placement is armed, or clear it. */
  setArmed(kind: Kind | undefined): void {
    this.armed = kind;
  }

  draw(state: SimState): void {
    const ore = state.players[0].ore;
    const factory = this.handlers.hasFactory();

    for (const entry of BUILD_ENTRIES) {
      const button = this.buttons.get(entry.kind)!;
      // Two reasons an entry can be unavailable, and they are NOT the same thing.
      // "You cannot afford it" is answered by the cost already on screen; "you
      // have no Factory" is not answered by anything, so it says so. FR-013's
      // principle — refuse inline, explain inline, never a dialog.
      const needsFactory = entry.kind !== KIND.WORKER && !entry.placed && !factory;
      const affordable = ore >= entry.cost && !needsFactory;
      button.title = needsFactory ? 'Needs a Factory' : '';
      this.reason.set(entry.kind, needsFactory);
      // aria-disabled rather than `disabled`: a disabled button is removed from
      // the tab order and from the accessibility tree, so a keyboard player would
      // lose the ability to read what they cannot yet afford.
      button.setAttribute('aria-disabled', String(!affordable));
      button.setAttribute('aria-pressed', String(this.armed === entry.kind));

      const note = button.querySelector<HTMLElement>('.build-note');
      if (note !== null) {
        note.textContent = this.reason.get(entry.kind) === true ? 'needs a Factory' : '';
      }
    }
  }
}

export { BUILD_ENTRIES, type BuildEntry };
