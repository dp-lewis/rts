/**
 * Boot and the screen flow — T067 / T069 / T071.
 *
 * Owns everything outside the canvas: which screen is showing, the DOM HUD, the
 * session counters, and the WebGL check that has to happen before Phaser is given
 * a chance to fail on its own.
 *
 * The canvas is a fixed 1280x704 that Phaser scales to fit (FR-014: one screen,
 * no camera, no scrolling), so the simulation's coordinate space never depends on
 * the size of the browser window.
 */

import Phaser from 'phaser';

import { addDamage, applyDamage, type DamageLedger } from '../sim/combat';
import {
  KIND,
  VERDICT,
  type Difficulty,
  type Kind,
  type SimState,
  type Verdict,
} from '../sim/state';
import { AlertBand } from './hud/alert';
import { BuildBar } from './hud/buildbar';
import { DebugOverlay, SessionCounters } from './hud/counters';
import { ProductionPanel } from './hud/production';
import { ResourceHud } from './hud/resources';
import { Gate } from './scenes/Gate';
import { MatchScene, MATCH_SCENE_KEY, WORLD_SIZE } from './scenes/Match';
import { Result } from './scenes/Result';

/**
 * FR-024. Checked BEFORE Phaser boots, not after it throws.
 *
 * Phaser 4 replaced the v3 pipeline with a node-based render architecture and
 * deprecated Canvas, so `Phaser.AUTO`'s fallback is not a real fallback (research
 * RF-6). Letting it fail on its own produces a blank rectangle and a console
 * error — indistinguishable, to a player, from a broken website.
 */
function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`missing element #${id}`);
  }
  return node;
}

export interface App {
  game: Phaser.Game | undefined;
}

export function bootGame(): App {
  const gateEl = el('gate');
  const matchEl = el('match');
  const resultEl = el('result');
  const fallbackEl = el('webgl-fallback');

  if (!hasWebGL()) {
    fallbackEl.hidden = false;
    return { game: undefined };
  }

  const counters = new SessionCounters();
  const resources = new ResourceHud(matchEl);
  const alerts = new AlertBand(matchEl);
  const debug = new DebugOverlay(matchEl, counters);

  let game: Phaser.Game | undefined;
  let difficulty: Difficulty = 1;
  let isRematch = false;

  const scene = (): MatchScene | undefined =>
    game?.scene.getScene(MATCH_SCENE_KEY) as MatchScene | undefined;

  // The permanent bar carries BUILDINGS only; units live on the building that
  // makes them, in the panel below.
  const buildBar = new BuildBar(el('build-bar'), {
    onQueue: () => undefined,
    onPlace: (kind: Kind) => {
      scene()?.armPlacement(kind);
      buildBar.setArmed(kind);
    },
    hasFactory: () => true,
  });

  const production = new ProductionPanel(el('production'), (kind, builderId) =>
    scene()?.trainAt(kind, builderId),
  );

  const show = (screen: 'gate' | 'match' | 'result'): void => {
    gateEl.hidden = screen !== 'gate';
    matchEl.hidden = screen !== 'match';
    resultEl.hidden = screen !== 'result';
  };

  const startMatch = (): void => {
    show('match');
    alerts.reset();
    buildBar.setArmed(undefined);
    production.hide();
    counters.startMatch(performance.now(), isRematch, difficulty);

    const config = {
      // A new seed per match, so a rematch is a different match rather than a
      // replay of the one just lost (JRN-002 STEP-003).
      seed: Math.floor(Date.now() % 2_147_483_647),
      difficulty,
      hooks: {
        onFrame: (state: SimState, now: number) => {
          resources.draw(state);
          buildBar.draw(state);
          production.update(state, scene()?.selectedProducer());
          alerts.update(state, now);
          debug.update(state, now);
          if (!scene()?.isPlacing()) {
            buildBar.setArmed(undefined);
          }
        },
        onVerdict: (verdict: Verdict, ticks: number) => {
          counters.completeMatch(ticks, verdict);
          result.show(verdict, ticks);
          show('result');
        },
        onFirstAction: (now: number) => counters.recordFirstAction(now),
      },
    };

    if (game === undefined) {
      game = new Phaser.Game({
        // WEBGL rather than AUTO: Phaser 4 deprecated the Canvas renderer, so
        // AUTO's fallback is not a fallback. The check above is the real one.
        type: Phaser.WEBGL,
        parent: 'stage',
        width: WORLD_SIZE.width,
        height: WORLD_SIZE.height,
        backgroundColor: '#12141c',
        pixelArt: true, // 64px Kenney art; smoothing turns crisp edges to mush
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [MatchScene],
      });
      game.scene.start(MATCH_SCENE_KEY, config);
    } else {
      // A full restart, not a reset: the scene is torn down and `create` runs
      // again, so a rematch is constructed fresh from its seed with nothing
      // carried over (JRN-002 EDGE-002 — determinism hygiene).
      game.scene.stop(MATCH_SCENE_KEY);
      game.scene.start(MATCH_SCENE_KEY, config);
    }
  };

  const result = new Result(
    resultEl,
    () => {
      isRematch = true;
      startMatch();
    },
    () => {
      isRematch = false;
      show('gate');
      gate.show();
    },
  );

  const gate = new Gate(gateEl, (chosen) => {
    difficulty = chosen;
    isRematch = false;
    startMatch();
  });

  show('gate');
  gate.show();

  installTestHook({ scene, counters, alerts });

  return { game };
}

/**
 * The E2E affordance — see `tests/e2e/helpers.ts`.
 *
 * A match runs six to ten minutes by design, so no browser test can play one to
 * a verdict in real time. This exposes a narrow read/force surface, and ONLY when
 * `?test=1` is present, so a production load carries no test surface at all. That
 * exclusion is itself asserted, because a debug backdoor nobody checks is closed
 * is one that quietly stays open.
 */
function installTestHook(deps: {
  scene: () => MatchScene | undefined;
  counters: SessionCounters;
  alerts: AlertBand;
}): void {
  if (new URLSearchParams(location.search).get('test') !== '1') {
    return;
  }

  const state = () => deps.scene()?.simState();

  const damageOwnBase = (source: 'enemy' | 'suddenDeath'): void => {
    const current = state();
    if (current === undefined) {
      return;
    }
    const base = current.entities.find((e) => e.kind === KIND.BASE && e.owner === 0);
    if (base === undefined) {
      return;
    }
    // Real damage through the real path, so the flags are set by the simulation
    // rather than poked into the HUD — the difference between testing FR-033 and
    // testing that a boolean can be assigned.
    const ledger: DamageLedger = new Map();
    addDamage(ledger, base.id, 1, source);
    applyDamage(current, ledger);

    // `underAttack` lives for exactly one tick: `applyDamage` clears both flags
    // at the top of every tick and re-raises them from that tick's ledger. In the
    // real game that is safe, because `step` and `onFrame` run in the same frame
    // — the flag is always observed by the frame that produced it. Applying
    // damage from OUTSIDE the loop breaks that pairing: whether the next frame
    // steps first decides whether the flag is ever seen, which made this a
    // one-in-three flake rather than a failure. The observation is therefore
    // made here, at the moment the flag is true, through the real alert code.
    deps.alerts.update(current, performance.now());
  };

  (window as unknown as { __tmw: unknown }).__tmw = {
    tick: () => state()?.tick ?? -1,
    ore: () => state()?.players[0].ore ?? -1,
    verdict: () => state()?.verdict ?? VERDICT.NONE,
    entityCount: () => state()?.entities.length ?? -1,
    factoryCount: () =>
      state()?.entities.filter((e) => e.kind === KIND.FACTORY && e.owner === 0).length ?? -1,
    ghost: () => deps.scene()?.ghostState(),
    ownBaseScreenPoint: () => {
      const current = state();
      const base = current?.entities.find((e) => e.kind === KIND.BASE && e.owner === 0);
      const canvas = document.querySelector('canvas');
      if (base === undefined || canvas === null) {
        return { x: 0, y: 0 };
      }
      // Canvas is scaled to fit, so world px must be converted through the
      // element's actual on-screen size before a test can click at them.
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (base.x / WORLD_SIZE.width) * rect.width,
        y: rect.top + (base.y / WORLD_SIZE.height) * rect.height,
      };
    },
    forceVerdict: (v: number) => {
      const current = state();
      if (current !== undefined) {
        current.verdict = v as Verdict;
      }
    },
    setOre: (amount: number) => {
      const current = state();
      if (current !== undefined) {
        current.players[0].ore = amount;
      }
    },
    damageOwnBase,
    counters: () => deps.counters.snapshot(),
  };
}
