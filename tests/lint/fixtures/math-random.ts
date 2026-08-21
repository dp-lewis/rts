// FIXTURE — deliberately violating. Never imported by src/. See tests/lint/boundary.test.ts.
// Ambient randomness: two machines replaying the same command log diverge on tick 1.
export function pickTarget(count: number): number {
  return Math.floor(Math.random() * count);
}
