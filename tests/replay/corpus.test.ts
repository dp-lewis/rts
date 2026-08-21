import { describe, expect, it } from 'vitest';

import { describeFailure, loadCorpus, runCorpus } from './run-corpus';

/**
 * Drives the corpus runner inside the ordinary Vitest suite, as ADR-002 requires
 * ("it runs in the Vitest suite ... and as its own CI step"). `run-corpus.ts` is
 * a plain module so that the regeneration script can import it too.
 */

describe('replay corpus', () => {
  const cases = loadCorpus();

  it('is not empty — an empty corpus would pass silently forever', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => c.file))('%s carries a real authoring date', (file) => {
    // recordReplay cannot read a clock (src/sim is barred from Date), so the date
    // is caller-supplied and therefore forgettable. This is the guard that makes
    // forgetting it fail rather than quietly ship an undated case.
    const found = cases.find((c) => c.file === file);
    expect(found?.replay.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(cases.map((c) => c.file))('%s reproduces exactly', (file) => {
    const outcome = runCorpus().find((o) => o.file === file);
    expect(outcome).toBeDefined();
    if (outcome !== undefined && !outcome.ok) {
      throw new Error(describeFailure(outcome));
    }
  });
});
