/**
 * The selected building's production panel.
 *
 * Units are reached by selecting the building that makes them: Workers at the
 * Base, Troopers at a Barracks, Tanks at a Factory. The permanent bar carries
 * only what can be PLACED.
 *
 * This departs from FR-010 ("exactly five entries — four unit plus one structure
 * — always visible, never nested"), recorded as a change request rather than
 * taken quietly. What the original reasoning was protecting is kept: the panel is
 * one flat row that appears in place, never a menu that opens another menu, and
 * the permanent bar means the screen is never without something to click.
 *
 * The risk the change accepts is real and worth naming — a first-time player can
 * no longer see the whole roster at once, so the tech tree has to be discovered
 * by selecting things. `ux-patterns.md` line 41 records always-visible-never-
 * nested as a research FINDING, and M9's comprehension result was measured
 * against the old design. It does not carry over.
 */

import { TRAINS, type BuildEntry } from './roster';
import { ENTITY_STATE, type Entity, type Kind, type SimState } from '../../sim/state';

const TESTID: Record<string, string> = {
  Worker: 'train-worker',
  Trooper: 'train-trooper',
  Tank: 'train-tank',
};

export class ProductionPanel {
  private readonly root: HTMLElement;
  private readonly onTrain: (kind: Kind, builderId: number) => void;
  private shownFor: number | undefined;

  constructor(root: HTMLElement, onTrain: (kind: Kind, builderId: number) => void) {
    this.root = root;
    this.onTrain = onTrain;
    this.hide();
  }

  hide(): void {
    this.shownFor = undefined;
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /**
   * Show what `building` trains, or hide if it trains nothing.
   *
   * Rebuilt only when the SELECTION changes, not every frame: recreating buttons
   * under the cursor sixty times a second makes them unclickable.
   */
  update(state: SimState, building: Entity | undefined): void {
    if (building === undefined || building.state === ENTITY_STATE.UNDER_CONSTRUCTION) {
      if (this.shownFor !== undefined) {
        this.hide();
      }
      return;
    }

    const entries = TRAINS[building.kind];
    if (entries === undefined || entries.length === 0) {
      if (this.shownFor !== undefined) {
        this.hide();
      }
      return;
    }

    if (this.shownFor !== building.id) {
      this.render(entries, building);
      this.shownFor = building.id;
    }

    // Affordability DOES refresh every frame — it changes as ore comes in, and a
    // greyed entry that stays greyed after you can afford it is worse than none.
    const ore = state.players[building.owner]!.ore;
    for (const entry of entries) {
      const button = this.root.querySelector<HTMLButtonElement>(
        `[data-testid="${TESTID[entry.label] ?? ''}"]`,
      );
      button?.setAttribute('aria-disabled', String(ore < entry.cost));
    }

    const busy = this.root.querySelector<HTMLElement>('[data-testid=train-status]');
    if (busy !== null) {
      busy.textContent = building.queuedKind >= 0 ? 'Building…' : '';
    }
  }

  private render(entries: readonly BuildEntry[], building: Entity): void {
    this.root.replaceChildren();
    this.root.hidden = false;

    const title = document.createElement('span');
    title.className = 'panel-title';
    title.textContent = LABEL[building.kind] ?? 'Selected';
    this.root.append(title);

    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'build-entry';
      button.setAttribute('data-testid', TESTID[entry.label] ?? `train-${entry.label}`);

      const name = document.createElement('span');
      name.textContent = entry.label;
      const cost = document.createElement('span');
      cost.className = 'build-cost';
      cost.textContent = `${entry.cost} ore`;
      button.append(name, cost);

      button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') {
          return;
        }
        this.onTrain(entry.kind, building.id);
      });
      this.root.append(button);
    }

    const status = document.createElement('span');
    status.className = 'panel-status';
    status.setAttribute('data-testid', 'train-status');
    this.root.append(status);
  }
}

const LABEL: Record<number, string> = {
  0: 'Base',
  1: 'Factory',
  6: 'Barracks',
};
