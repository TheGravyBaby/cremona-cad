// @vitest-environment node
import { ArcFit } from '../../helpers/math/draftMath';
import { angleFromCenter, signedRadianDelta } from '../../helpers/math/simpleGeometry';
import { solveJoinsThrough } from './join-arc-tool';

const DEG = Math.PI / 180;

// ends and tangents read off the canvas, a point clicked between them, and the way the join picked
// by eye leaves each end: along the snapped tangent or against it at P1, and arriving along it or
// against it at P2
const cases: Array<{
  name: string;
  P1: { x: number; y: number }; T1deg: number;
  P2: { x: number; y: number }; T2deg: number;
  through: { x: number; y: number };
  against: { P1: boolean; P2: boolean };
}> = [
  {
    name: 'a low-turning join over a tighter pair',
    P1: { x: -38.3446, y: 248.1196 }, T1deg: 119.6045,
    P2: { x: 22.3348, y: 208.2586 }, T2deg: 0.1049,
    through: { x: 26.4891, y: 208.1572 },
    against: { P1: false, P2: true },
  },
  {
    name: 'a gentle join over two near-mirror half turns',
    P1: { x: 53.5642, y: 164.4070 }, T1deg: -70.5717,
    P2: { x: 90.0282, y: 106.0264 }, T2deg: 113.7504,
    through: { x: 73.1057, y: 131.9074 },
    against: { P1: false, P2: true },
  },
  {
    name: 'the same shape at another chord',
    P1: { x: 197.3481, y: 237.3132 }, T1deg: -64.3577,
    P2: { x: 226.4420, y: 195.1892 }, T2deg: 119.2887,
    through: { x: 213.3775, y: 213.3992 },
    against: { P1: false, P2: true },
  },
  {
    name: 'two low-turning mirror joins',
    P1: { x: 310.2319, y: 243.3407 }, T1deg: 70.0453,
    P2: { x: 291.8977, y: 206.7659 }, T2deg: -122.9757,
    through: { x: 292.1666, y: 207.1791 },
    against: { P1: true, P2: false },
  },
  {
    name: 'two low-turning mirror joins, second variant',
    P1: { x: 384.8339, y: 232.2542 }, T1deg: 25.1543,
    P2: { x: 380.1454, y: 198.1686 }, T2deg: 139.0788,
    through: { x: 384.8506, y: 232.2621 },
    against: { P1: false, P2: true },
  },
  {
    name: 'a gentle join on a short chord',
    P1: { x: 454.1758, y: 229.7572 }, T1deg: -91.3290,
    P2: { x: 456.3172, y: 203.6084 }, T2deg: -88.0763,
    through: { x: 455.2587, y: 214.3254 },
    against: { P1: false, P2: false },
  },
];

// the way an arc fitted from `from` runs there: counterclockwise when the fit kept `from` as its start
const travelFrom = (arc: ArcFit, from: { x: number; y: number }) => {
  const at = angleFromCenter(arc.center, from);
  return at + (Math.abs(signedRadianDelta(arc.startAngle - at)) < 1e-6 ? 1 : -1) * Math.PI / 2;
};

describe('solveJoinsThrough', () => {
  for (const c of cases) {
    it(`leads with the join picked by eye: ${c.name}`, () => {
      const [lead] = solveJoinsThrough(c.P1, c.T1deg * DEG, c.P2, c.T2deg * DEG, c.through);
      expect(lead?.length).toBe(2);
      const leaves = c.T1deg * DEG + (c.against.P1 ? Math.PI : 0);
      const arrives = c.T2deg * DEG + (c.against.P2 ? Math.PI : 0);
      expect(Math.abs(signedRadianDelta(travelFrom(lead[0], c.P1) - leaves))).toBeLessThan(1e-6);
      expect(Math.abs(signedRadianDelta(travelFrom(lead[1], c.P2) + Math.PI - arrives))).toBeLessThan(1e-6);
    });
  }
});
