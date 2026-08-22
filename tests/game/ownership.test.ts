import { describe, expect, it } from 'vitest';

import { FRIENDLY, drawOwnership } from '../../src/game/render/ownership';
import { KIND, type Entity, type Kind, type Owner } from '../../src/sim/state';

/**
 * T051 / FR-018 — "every friendly unit carries a persistent non-colour ownership cue".
 *
 * The cue is PRESENCE, not hue: friendly units get a ring, enemy units get
 * nothing. That is what makes it a non-colour cue and what carries it through
 * greyscale and every colour vision deficiency — confirmed visually by the T081
 * spike, and pinned here so the rule survives a later restyle.
 *
 * Phaser's Graphics is stubbed rather than instantiated: this asserts the
 * DECISION (does this entity get a ring at all), which is the requirement.
 * Whether the ellipse is pretty is what the spike was for.
 */

interface Call {
  op: string;
  args: number[];
}

function stubGraphics(): { calls: Call[]; graphics: never } {
  const calls: Call[] = [];
  const record =
    (op: string) =>
    (...args: number[]): void => {
      calls.push({ op, args });
    };
  const graphics = {
    fillStyle: record('fillStyle'),
    fillEllipse: record('fillEllipse'),
    lineStyle: record('lineStyle'),
    strokeEllipse: record('strokeEllipse'),
  } as unknown as never;
  return { calls, graphics };
}

function entity(kind: Kind, owner: Owner): Entity {
  return {
    id: 1,
    kind,
    owner,
    x: 100,
    y: 100,
    hp: 10,
    state: 0,
    targetId: -1,
    gatherNodeId: -1,
    cooldown: 0,
    progress: 0,
    destX: -1,
    destY: -1,
    queuedKind: -1,
  };
}

const UNIT_KINDS: Kind[] = [KIND.WORKER, KIND.TROOPER, KIND.TANK];

describe('the ownership cue is presence, not colour', () => {
  it.each(UNIT_KINDS)('rings friendly unit kind %i', (kind) => {
    const { calls, graphics } = stubGraphics();
    drawOwnership(graphics, entity(kind, FRIENDLY), 100, 100);
    expect(calls.filter((c) => c.op === 'strokeEllipse')).toHaveLength(1);
  });

  it.each(UNIT_KINDS)('draws NOTHING for enemy unit kind %i', (kind) => {
    // If this ever starts drawing, ownership becomes a hue comparison between two
    // rings — which is precisely the WCAG 1.4.1 failure the ring exists to avoid.
    const { calls, graphics } = stubGraphics();
    drawOwnership(graphics, entity(kind, 1), 100, 100);
    expect(calls).toEqual([]);
  });

  it('draws nothing for structures, whoever owns them', () => {
    for (const kind of [KIND.BASE, KIND.FACTORY, KIND.BARRACKS]) {
      for (const owner of [0, 1] as const) {
        const { calls, graphics } = stubGraphics();
        drawOwnership(graphics, entity(kind, owner), 100, 100);
        expect(calls, `kind ${kind} owner ${owner}`).toEqual([]);
      }
    }
  });

  it('seats the ring below the sprite centre rather than haloing it', () => {
    const { calls, graphics } = stubGraphics();
    drawOwnership(graphics, entity(KIND.TROOPER, FRIENDLY), 100, 100);
    const stroke = calls.find((c) => c.op === 'strokeEllipse');
    expect(stroke?.args[1]).toBeGreaterThan(100);
  });

  it('draws a dark seat under the tinted glow, so contrast survives any ground', () => {
    // The ring cannot rely on being lighter than the terrain: in greyscale that
    // is the only channel left, and a pale tile would erase it.
    const { calls, graphics } = stubGraphics();
    drawOwnership(graphics, entity(KIND.TROOPER, FRIENDLY), 100, 100);
    const fills = calls.filter((c) => c.op === 'fillStyle');
    expect(fills.length).toBeGreaterThanOrEqual(2);
    expect(fills[0]?.args[0]).toBe(0x000000);
  });
});
