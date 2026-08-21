// FIXTURE — deliberately violating. Never imported by src/. See tests/lint/boundary.test.ts.
// Unordered iteration (O-7): for...in order is not part of the sim's contract.
export function sumBag(bag: Record<string, number>): number {
  let total = 0;
  for (const key in bag) {
    total += bag[key] ?? 0;
  }
  return total;
}
