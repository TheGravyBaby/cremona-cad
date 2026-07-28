import { computeBiarcCandidates } from './join-arc-tool';

const DEG = Math.PI / 180;

/**
 * Real P1/T1/P2/T2 inputs pulled from JoinArcTool's debug log (see logJoinDebug), each paired
 * with the candidate the user confirmed was actually correct after cycling through every
 * candidate with Shift and comparing them on canvas. These are the ground truth the scoring
 * formula (computeBiarcCandidates' combinedScore) is fit against — see its doc comment for the
 * history of metrics that were each falsified by one of these before the current one.
 */
const cases: Array<{
  name: string;
  P1: { x: number; y: number }; T1deg: number;
  P2: { x: number; y: number }; T2deg: number;
  expected: { invert1: boolean; invert2: boolean };
}> = [
  {
    name: 'prefers the single low-turning (61°) candidate over a tighter, higher-turning pair',
    P1: { x: -38.3446, y: 248.1196 }, T1deg: 119.6045,
    P2: { x: 22.3348, y: 208.2586 }, T2deg: 0.1049,
    expected: { invert1: true, invert2: true },
  },
  {
    name: 'prefers a gentle 42° arc over two near-mirror ~180°-turning candidates',
    P1: { x: 53.5642, y: 164.4070 }, T1deg: -70.5717,
    P2: { x: 90.0282, y: 106.0264 }, T2deg: 113.7504,
    expected: { invert1: false, invert2: false },
  },
  {
    name: 'same shape as above at a different chord length — still prefers the gentle (29°) arc',
    P1: { x: 197.3481, y: 237.3132 }, T1deg: -64.3577,
    P2: { x: 226.4420, y: 195.1892 }, T2deg: 119.2887,
    expected: { invert1: false, invert2: false },
  },
  {
    name: 'near-tie between two low-turning mirror candidates resolves on scale mismatch',
    P1: { x: 310.2319, y: 243.3407 }, T1deg: 70.0453,
    P2: { x: 291.8977, y: 206.7659 }, T2deg: -122.9757,
    expected: { invert1: false, invert2: false },
  },
  {
    name: 'near-tie between two low-turning mirror candidates, second variant',
    P1: { x: 384.8339, y: 232.2542 }, T1deg: 25.1543,
    P2: { x: 380.1454, y: 198.1686 }, T2deg: 139.0788,
    expected: { invert1: false, invert2: true },
  },
  {
    name: 'prefers a gentle 18° arc over two near-mirror ~180°-turning candidates (short chord)',
    P1: { x: 454.1758, y: 229.7572 }, T1deg: -91.3290,
    P2: { x: 456.3172, y: 203.6084 }, T2deg: -88.0763,
    expected: { invert1: false, invert2: true },
  },
];

describe('computeBiarcCandidates', () => {
  for (const c of cases) {
    it(`picks the confirmed-correct candidate: ${c.name}`, () => {
      const candidates = computeBiarcCandidates(c.P1, c.T1deg * DEG, c.P2, c.T2deg * DEG);
      expect(candidates.length).toBeGreaterThan(0);

      const winner = candidates[0];
      expect(winner.invert1).toBe(c.expected.invert1);
      expect(winner.invert2).toBe(c.expected.invert2);
    });
  }

  it('sorts every case\'s candidates by ascending combinedScore', () => {
    for (const c of cases) {
      const candidates = computeBiarcCandidates(c.P1, c.T1deg * DEG, c.P2, c.T2deg * DEG);
      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i].combinedScore).toBeGreaterThanOrEqual(candidates[i - 1].combinedScore);
      }
    }
  });
});
