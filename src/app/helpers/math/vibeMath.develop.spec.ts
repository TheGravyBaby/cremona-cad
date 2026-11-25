// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSurfaceDevelopment, calcFittedSpans, cubicPointAt, liftedLength } from './vibeMath';
import { warpPath } from './pathVibes';
import { samplePathToPolyline } from './pathMath';
import { Pt, Pt3D } from '../../models/types';

// A card bent over a curved surface traces a different shape from the one drawn flat above it:
// what matters is that the development is exact where a card can lie exactly, a cylinder, and
// changes nothing where there is nothing to bend over.

const R = 50;
const acrossCylinder = (x: number) => Math.sqrt(R * R - x * x) - R;
const alongCylinder = (_: number, y: number) => Math.sqrt(R * R - y * y) - R;
const origin = new Pt(0, 0);
const points = [new Pt(10, 5), new Pt(25, -12), new Pt(-40, 30), new Pt(0, -20), new Pt(-7, 0)];

// the points carried through a development over their own reach
const developOverSurface = (zAt: (x: number, y: number) => number | null, pts: Pt[], spine: Pt): Pt[] => {
  const xs = pts.map(pt => pt.x), ys = pts.map(pt => pt.y);
  return pts.map(buildSurfaceDevelopment(zAt, { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }, spine));
};

describe('liftedLength', () => {
  it('is the plan length on a level surface and the slope length on a ramp', () => {
    expect(liftedLength(() => 0, origin, new Pt(3, 4))).toBeCloseTo(5, 9);
    expect(liftedLength(x => 0.75 * x, origin, new Pt(4, 0))).toBeCloseTo(5, 9);
  });

  it('reads off the surface as level, so a run past its edge adds only its plan length', () => {
    expect(liftedLength(x => x <= 2 ? 0.75 * x : null, origin, new Pt(4, 0))).toBeCloseTo(2.5 + 2, 6);
  });
});

describe('buildSurfaceDevelopment', () => {
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

describe('carrying curves through a smooth map', () => {
  it('fits a curve with as few spans as keep it within tolerance', () => {
    const f = (s: number) => new Pt3D(10 * Math.cos(s), 10 * Math.sin(s), 0);
    const spans = calcFittedSpans(f, 0, 2 * Math.PI, 0.01);
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.length).toBeLessThan(16);
    for (const span of spans) for (let k = 0; k <= 10; k++) {
      const pt = cubicPointAt(span, k / 10);
      expect(Math.abs(Math.hypot(pt.x, pt.y) - 10)).toBeLessThan(0.01);
    }
  });

  it('carries an outline across a cylinder as the card unrolls it, still closed', () => {
    const d = 'M 10 -5 A 5 5 0 0 1 10 5 L -10 5 L -10 -5 Z';
    const develop = buildSurfaceDevelopment(acrossCylinder, { minX: -10, maxX: 15, minY: -5, maxY: 5 }, origin);
    const warped = warpPath(d, develop, 0.01);
    expect(warped.trim().endsWith('Z')).toBe(true);
    // a circle can't survive the bend; the level lines across the spine stay straight on a cylinder
    expect(warped).not.toMatch(/A/);
    // every point the warp draws is one the map sends something on the outline to: across the
    // cylinder x unrolls to its arc length and y stays put
    for (const pt of samplePathToPolyline(warped, 0.2)) {
      const flatX = R * Math.sin(pt.x / R);
      const onLines = Math.abs(Math.abs(pt.y) - 5) < 0.02 && flatX > -10.02 && flatX < 10.02 || Math.abs(flatX + 10) < 0.02;
      const onArc = Math.abs(Math.hypot(flatX - 10, pt.y) - 5) < 0.02 && flatX >= 9.98;
      expect(onLines || onArc, `${pt.x}, ${pt.y}`).toBe(true);
    }
  });
});
