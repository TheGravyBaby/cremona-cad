// @vitest-environment node
import { biarcFromRoot, solveBiarcRoots } from '../../helpers/math/draftMath';
import { dist } from '../../helpers/math/simpleGeometry';
import { solveJoinsThrough } from './join-arc-tool';

const DEG = Math.PI / 180;

// ends and tangents read off the canvas, each with the way round (departure tangents, the second
// pointing from P2 into the join) picked by eye as the right join among the equal-radius ones
const cases: Array<{
  name: string;
  P1: { x: number; y: number }; T1deg: number;
  P2: { x: number; y: number }; T2deg: number;
  expected: { invert1: boolean; invert2: boolean };
}> = [
  {
    name: 'a low-turning join over a tighter pair',
    P1: { x: -38.3446, y: 248.1196 }, T1deg: 119.6045,
    P2: { x: 22.3348, y: 208.2586 }, T2deg: 0.1049,
    expected: { invert1: true, invert2: true },
  },
  {
    name: 'a gentle join over two near-mirror half turns',
    P1: { x: 53.5642, y: 164.4070 }, T1deg: -70.5717,
    P2: { x: 90.0282, y: 106.0264 }, T2deg: 113.7504,
    expected: { invert1: false, invert2: false },
  },
  {
    name: 'the same shape at another chord',
    P1: { x: 197.3481, y: 237.3132 }, T1deg: -64.3577,
    P2: { x: 226.4420, y: 195.1892 }, T2deg: 119.2887,
    expected: { invert1: false, invert2: false },
  },
  {
    name: 'two low-turning mirror joins',
    P1: { x: 310.2319, y: 243.3407 }, T1deg: 70.0453,
    P2: { x: 291.8977, y: 206.7659 }, T2deg: -122.9757,
    expected: { invert1: false, invert2: false },
  },
  {
    name: 'two low-turning mirror joins, second variant',
    P1: { x: 384.8339, y: 232.2542 }, T1deg: 25.1543,
    P2: { x: 380.1454, y: 198.1686 }, T2deg: 139.0788,
    expected: { invert1: false, invert2: true },
  },
  {
    name: 'a gentle join on a short chord',
    P1: { x: 454.1758, y: 229.7572 }, T1deg: -91.3290,
    P2: { x: 456.3172, y: 203.6084 }, T2deg: -88.0763,
    expected: { invert1: false, invert2: true },
  },
];

describe('solveJoinsThrough', () => {
  for (const c of cases) {
    it(`clicked at its joint, leads with the join picked by eye: ${c.name}`, () => {
      const T1 = c.T1deg * DEG, T2 = c.T2deg * DEG;
      const picked = solveBiarcRoots(c.P1, T1, c.P2, T2, c.expected.invert1, c.expected.invert2)
        .map(({ R, N1, N2 }) => biarcFromRoot(c.P1, c.P2, N1, N2, R));
      expect(picked.length).toBeGreaterThan(0);

      const reproduced = picked.some(([a, b]) => {
        const joint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const [got] = solveJoinsThrough(c.P1, T1, c.P2, T2, joint);
        const scale = dist(c.P1, c.P2);
        return got?.length === 2
          && dist(got[0].center, a) < 1e-6 * scale && dist(got[1].center, b) < 1e-6 * scale;
      });
      expect(reproduced).toBe(true);
    });
  }
});
