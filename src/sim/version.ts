/**
 * The simulation behaviour version (ADR-002).
 *
 * Bump this BY HAND, in the same change that intentionally alters simulation
 * behaviour. Every recorded corpus hash is stamped with the version it was
 * recorded under; the corpus runner fails loudly on a mismatch rather than
 * silently re-recording, and `npm run corpus:regen` is the deliberate, reviewed
 * way to bring stale cases forward.
 *
 * Never bump this to make a red build go green. A stale corpus case means either
 * behaviour changed on purpose — in which case the regeneration diff belongs in
 * the pull request — or it changed by accident, which is the defect the corpus
 * exists to catch.
 */
export const SIM_VERSION = 1;
