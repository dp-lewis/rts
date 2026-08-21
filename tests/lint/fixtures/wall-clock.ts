// FIXTURE — deliberately violating. Never imported by src/. See tests/lint/boundary.test.ts.
// Wall-clock read: the simulation's notion of "now" must come from the tick counter.
export function stampedAge(bornAt: number): number {
  return Date.now() - bornAt;
}
