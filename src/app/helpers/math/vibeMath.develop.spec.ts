// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { developOverSurface, liftedLength } from './vibeMath';
import { Pt } from '../../models/types';

// A card bent over a curved surface traces a different shape from the one drawn flat above it:
// what matters is that the development is exact where a card can lie exactly, a cylinder, and
// changes nothing where there is nothing to bend over.

const R = 50;
const acrossCylinder = (x: number) => Math.sqrt(R * R - x * x) - R;
const alongCylinder = (_: number, y: number) => Math.sqrt(R * R - y * y) - R;
const origin = new Pt(0, 0);
const points = [new Pt(10, 5), new Pt(25, -12), new Pt(-40, 30), new Pt(0, -20), new Pt(-7, 0)];

describe('liftedLength', () => {
  it('is the plan length on a level surface and the slope length on a ramp', () => {
    expect(liftedLength(() => 0, origin, new Pt(3, 4))).toBeCloseTo(5, 9);
    expect(liftedLength(x => 0.75 * x, origin, new Pt(4, 0))).toBeCloseTo(5, 9);
  });

  it('reads off the surface as level, so a run past its edge adds only its plan length', () => {
    expect(liftedLength(x => x <= 2 ? 0.75 * x : null, origin, new Pt(4, 0))).toBeCloseTo(2.5 + 2, 6);
  });
});

describe('developOverSurface', () => {
  it('changes nothing on a level surface', () => {
    for (const [pt, dev] of points.map((pt, i) => [pt, developOverSurface(() => 0, points, origin)[i]] as const)) {
      expect(dev.x).toBeCloseTo(pt.x, 9);
      expect(dev.y).toBeCloseTo(pt.y, 9);
    }
  });

  it('unrolls a cylinder across the spine to its arc length, and leaves the spine direction alone', () => {
    const dev = developOverSurface(acrossCylinder, points, origin);
    points.forEach((pt, i) => {
      expect(dev[i].x).toBeCloseTo(R * Math.asin(pt.x / R), 3);
      expect(dev[i].y).toBeCloseTo(pt.y, 9);
    });
  });

  it('unrolls a cylinder along the spine the same way', () => {
    const dev = developOverSurface(alongCylinder, points, origin);
    points.forEach((pt, i) => {
      expect(dev[i].x).toBeCloseTo(pt.x, 9);
      expect(dev[i].y).toBeCloseTo(R * Math.asin(pt.y / R), 3);
    });
  });

  it('holds the spine point fixed wherever it is, and measures across from it', () => {
    const spine = new Pt(15, -8);
    const dev = developOverSurface(acrossCylinder, [spine, ...points], spine);
    expect(dev[0].x).toBeCloseTo(spine.x, 9);
    expect(dev[0].y).toBeCloseTo(spine.y, 9);
    points.forEach((pt, i) => {
      expect(dev[i + 1].x).toBeCloseTo(spine.x + R * (Math.asin(pt.x / R) - Math.asin(spine.x / R)), 3);
      expect(dev[i + 1].y).toBeCloseTo(pt.y, 9);
    });
  });

  it('keeps a mirrored pair mirrored on a symmetric dome', () => {
    const dome = (x: number, y: number) => Math.sqrt(R * R - x * x - y * y) - R;
    const [a, b] = developOverSurface(dome, [new Pt(12, 9), new Pt(-12, -9)], origin);
    expect(a.x).toBeCloseTo(-b.x, 9);
    expect(a.y).toBeCloseTo(-b.y, 9);
    // the dome stretches a chord in every direction, never shrinks it
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(Math.hypot(12, 9));
  });
});
