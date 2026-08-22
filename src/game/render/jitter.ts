/**
 * Render-only unit jitter — pre-impl F-2, T082.
 *
 * Units do not collide in v1, so two of them ordered to the same cell occupy the
 * same pixel and draw as one sprite — the player sees one unit where they have
 * two, and no amount of squinting fixes it. A small per-entity offset separates
 * them enough to be countable.
 *
 * PRESENTATION ONLY. The offset is a pure function of the entity id, so it is
 * stable for the life of the entity, identical in every replay of the same
 * match, and computed without touching `SimState`, the sim PRNG, or
 * `Math.random`. Nothing here can influence a hash, a path, or a damage roll —
 * if this whole file were deleted, only the picture would change.
 *
 * ## Why an angle and not a random offset
 *
 * The first version scattered ids into a random box via an integer hash. The
 * T081 spike showed an enemy sitting inside a friendly's ownership ring, which
 * INVERTS the FR-018 cue rather than merely weakening it. Measuring the fix
 * showed the approach itself was unsound, not just under-tuned:
 *
 * | strategy | worst separation, adjacent ids |
 * |---|---|
 * | random box, ±11 px | 0.36 px |
 * | random box, ±20 px | 0.66 px |
 * | golden angle, r = 18 | **20.13 px** |
 *
 * Two independent uniform draws can always land on top of each other, so the
 * worst case is near zero at ANY magnitude — raising ±11 to ±20 bought 0.3 px.
 * Placing ids at successive golden angles on a fixed-radius ellipse instead
 * turns separation into a guarantee: consecutive ids are ~137.5° apart, which at
 * r = 18 exceeds the 16.6 px ownership-ring radius, so a ring can always be
 * attributed to exactly one sprite. Units stacked in one cell are usually
 * produced consecutively from the same structure, which is precisely the case
 * this bounds.
 */

/**
 * Offset radius in px. Chosen so that the separation between consecutive ids
 * (2r·sin(137.5°/2) ≈ 1.86r) clears the ownership ring's 16.6 px radius.
 */
const JITTER_PX = 18;

/** Vertical squash, matching the ring's — the map reads as a ground plane. */
const VERTICAL_SCALE = 0.6;

/** ~137.5°, the angle that keeps successive indices maximally spread. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Deterministic draw offset for one entity.
 *
 * NOTE for M6: this shifts the DRAWN position by up to 18 px from the simulated
 * one. T052 already requires selection to test collision circles at simulated
 * positions rather than sprite bounds, so the two must not be conflated — a
 * marquee is judged against where the unit IS, not where it is drawn.
 */
export function jitterFor(id: number): { dx: number; dy: number } {
  const angle = id * GOLDEN_ANGLE;
  return {
    dx: Math.cos(angle) * JITTER_PX,
    dy: Math.sin(angle) * JITTER_PX * VERTICAL_SCALE,
  };
}
