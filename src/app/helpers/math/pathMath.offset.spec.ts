// @vitest-environment node
import { catenaryBetween, offsetPath, pathsBounds, samplePathToPolyline } from './pathMath';
import { polylineCumulativeLengths, projectOntoPolyline } from './vibeMath';

const sample = (d: string) => samplePathToPolyline(d, 0.1, true);

// every point of each within `distance` of the other, so neither a stray bulge nor a missing piece passes
function expectParallel(original: string, offset: string, distance: number, digits = 3) {
  const a = sample(original), b = sample(offset);
  const aCum = polylineCumulativeLengths(a), bCum = polylineCumulativeLengths(b);
  for (const p of b) expect(projectOntoPolyline(p, a, aCum).dist).toBeCloseTo(distance, digits);
  for (const p of a) expect(projectOntoPolyline(p, b, bCum).dist).toBeCloseTo(distance, digits);
}

describe('offsetPath', () => {
  // bows to +y, so its hollow faces the chord, on the right of travel
  const catenary = catenaryBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);

  it('runs a catenary parallel on its outside', () => {
    expectParallel(catenary, offsetPath(catenary, -5)!, 5);
  });

  it('runs a catenary parallel on its hollow side while that is shallower than its tightest bend', () => {
    expectParallel(catenary, offsetPath(catenary, 5)!, 5);
  });

  it('refuses to step into the hollow deeper than the bottom bend', () => {
    expect(offsetPath(catenary, 100)).toBeNull();
  });

  it('keeps an arc an arc, on the same centre', () => {
    expect(offsetPath('M 10 0 A 10 10 0 0 1 0 10', 2)).toMatch(/A 12 12 0 0 1/);
    expect(offsetPath('M 10 0 A 10 10 0 0 1 0 10', -10)).toBeNull();
  });

  it('mitres the corners of a grown square, whichever way round it was drawn', () => {
    for (const d of ['M 0 0 L 10 0 L 10 10 L 0 10 Z', 'M 0 0 L 0 10 L 10 10 L 10 0 Z']) {
      const b = pathsBounds([offsetPath(d, 2)!]);
      expect([b.minX, b.minY, b.maxX, b.maxY].map(v => +v.toFixed(9))).toEqual([-2, -2, 12, 12]);
    }
  });

  it('cuts a shrunk square back at its corners, and refuses once it would turn inside out', () => {
    const b = pathsBounds([offsetPath('M 0 0 L 10 0 L 10 10 L 0 10 Z', -2)!]);
    expect([b.minX, b.minY, b.maxX, b.maxY].map(v => +v.toFixed(9))).toEqual([2, 2, 8, 8]);
    expect(offsetPath('M 0 0 L 10 0 L 10 10 L 0 10 Z', -6)).toBeNull();
  });

  const corners = (d: string) => [...d.matchAll(/-?[\d.]+(?:e-?\d+)? -?[\d.]+(?:e-?\d+)?/g)]
    .map(m => m[0].split(' ').map(v => +(+v).toFixed(9)));

  it('trims the inside of a bend and mitres the outside, on an open run', () => {
    const run = 'M 0 0 L 10 0 L 10 10';
    // it turns left, so its left is the inside
    expect(corners(offsetPath(run, -2)!)).toEqual([[0, 2], [8, 2], [8, 10]]);
    expect(corners(offsetPath(run, 2)!)).toContainEqual([12, -2]);
  });

  it('trims and mitres where a line meets a curve', () => {
    // turns left onto an arc about (10, 0)
    const d = 'M -20 0 L 0 0 A 10 10 0 0 0 10 10';
    expect(corners(offsetPath(d, 3)!)).toContainEqual([3, -3]);
    expect(corners(offsetPath(d, -3)!)).toContainEqual([+(10 - Math.sqrt(13 * 13 - 9)).toFixed(9), 3]);
  });

  it('declines what it cannot read rather than offsetting it wrongly', () => {
    expect(offsetPath('m 0 0 l 10 0', 1)).toBeNull();
    expect(offsetPath('M 0 0 A 10 5 0 0 1 20 0', 1)).toBeNull();
  });
});
