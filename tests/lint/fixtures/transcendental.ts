// FIXTURE — deliberately violating. Never imported by src/. See tests/lint/boundary.test.ts.
// Transcendental: Math.atan2 is not bit-identical across engines/platforms.
export function facing(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}
