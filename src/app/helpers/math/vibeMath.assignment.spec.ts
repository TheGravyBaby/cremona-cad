// @vitest-environment node
import { minCostAssignment } from './vibeMath';

// every way of giving each row its own column, for checking against on small tables
function* injections(n: number, m: number, taken: number[] = []): Generator<number[]> {
  if (taken.length === n) { yield taken; return; }
  for (let j = 0; j < m; j++) if (!taken.includes(j)) yield* injections(n, m, [...taken, j]);
}

const total = (cost: number[][], cols: number[]) => cols.reduce((sum, j, i) => sum + cost[i][j], 0);

describe('minCostAssignment', () => {
  it('gives every row its own column', () => {
    const cost = Array.from({ length: 6 }, (_, i) => Array.from({ length: 9 }, (_, j) => Math.abs(i - j)));
    const cols = minCostAssignment(cost);
    expect(new Set(cols).size).toBe(6);
    expect(cols.every(j => j >= 0 && j < 9)).toBe(true);
  });

  it('finds the least total on small tables, square and wide', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [n, m] of [[3, 3], [4, 4], [3, 6], [5, 7]]) {
      for (let trial = 0; trial < 20; trial++) {
        const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.round(rand() * 100)));
        let best = Infinity;
        for (const cols of injections(n, m)) best = Math.min(best, total(cost, cols));
        expect(total(cost, minCostAssignment(cost))).toBe(best);
      }
    }
  });

  it('takes an empty table', () => {
    expect(minCostAssignment([])).toEqual([]);
  });
});
