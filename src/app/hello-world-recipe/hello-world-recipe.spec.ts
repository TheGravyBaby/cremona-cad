import { describe, expect, it } from 'vitest';
import { solveFourCircles } from './hello-world-recipe';
import { FOUR_CIRCLES_DEFAULTS } from './hello-world-types';
import { dist, pointOnCircle } from '../helpers/math/simpleGeometry';

describe('solveFourCircles', () => {
  const p = FOUR_CIRCLES_DEFAULTS;
  const s = solveFourCircles(p);

  it('seats the centre circle tangent to both bouts', () => {
    expect(dist(s.center, s.upper)).toBeCloseTo(p.upperR + p.centerR, 6);
    expect(dist(s.center, s.lower)).toBeCloseTo(p.lowerR + p.centerR, 6);
  });

  it('puts the centre circle on the right, between the two bouts', () => {
    expect(s.center.x).toBeGreaterThan(0);
    expect(s.center.y).toBeGreaterThan(s.lower.y);
    expect(s.center.y).toBeLessThan(s.upper.y);
  });

  it('spans the body from y = 0 to the body length', () => {
    expect(s.lower.y - s.lower.r).toBeCloseTo(0, 9);
    expect(s.upper.y + s.upper.r).toBeCloseTo(p.bodyLength, 9);
  });

  it('runs each arc from one tangent point to the next', () => {
    expect(dist(pointOnCircle(s.upper, s.upper.start), pointOnCircle(s.center, s.center.start))).toBeCloseTo(0, 6);
    expect(dist(pointOnCircle(s.center, s.center.end), pointOnCircle(s.lower, s.lower.end))).toBeCloseTo(0, 6);
  });

  it('keeps every arc under a half turn so the minor-sweep renderers draw the right side', () => {
    for (const arc of [s.upper, s.center, s.lower]) {
      const sweep = ((arc.end - arc.start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      expect(sweep).toBeLessThan(Math.PI);
    }
  });

  it('refuses a centre circle too small to reach both bouts', () => {
    expect(() => solveFourCircles({ ...p, bodyLength: 355, upperR: 30, lowerR: 30, centerR: 5 }))
      .toThrow(/cannot reach/);
  });

  it('refuses bouts that leave no room for a waist', () => {
    expect(() => solveFourCircles({ ...p, upperR: 200, lowerR: 200 })).toThrow(/waist/);
  });

  it('refuses a zero radius', () => {
    expect(() => solveFourCircles({ ...p, centerR: 0 })).toThrow(/greater than zero/);
  });
});
