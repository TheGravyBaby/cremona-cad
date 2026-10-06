// @vitest-environment node
import { svgPathProperties } from 'svg-path-properties';
import { occludePath } from './pathVibes';
import { samplePathToPolyline } from './pathMath';

const lengthOf = (d: string) => d.trim() ? new svgPathProperties(d).getTotalLength() : 0;
const subpathCount = (d: string) => (d.match(/M/g) ?? []).length;
const square = (x0: number, y0: number, x1: number, y1: number) => `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
const circle = (cx: number, cy: number, r: number) => `M ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`;

// svg-path-properties measures arcs to about 1e-4 mm, so the sum is held to 1e-3
function expectLengthKept(bottom: string, top: string | string[]) {
  const { visible, hidden } = occludePath(bottom, top);
  expect(lengthOf(visible) + lengthOf(hidden)).toBeCloseTo(lengthOf(bottom), 3);
  return { visible, hidden };
}

describe('occludePath', () => {
  it('cuts a line where it passes under the top, leaving both ends visible', () => {
    const { visible, hidden } = expectLengthKept('M -10 0 L 10 0', square(-2, -2, 2, 2));
    expect(lengthOf(hidden)).toBeCloseTo(4, 9);
    expect(subpathCount(visible)).toBe(2);
    expect(hidden).toBe('M -2 0 L 2 0');
  });

  it('keeps an arc an arc of the same radius on both sides of the cut', () => {
    const bottom = 'M 10 0 A 10 10 0 0 1 -10 0';
    const { visible, hidden } = expectLengthKept(bottom, square(-3, 5, 3, 15));
    for (const d of [visible, hidden]) {
      expect(d).not.toMatch(/[LC]/);
      for (const m of d.matchAll(/A (\S+) (\S+)/g)) expect([+m[1], +m[2]]).toEqual([10, 10]);
    }
    for (const pt of samplePathToPolyline(hidden, 0.5, true)) expect(Math.hypot(pt.x, pt.y)).toBeCloseTo(10, 6);
  });

  it('rejoins a closed loop cut once through its start into one visible run', () => {
    const { visible, hidden } = expectLengthKept(circle(0, 0, 10), square(5, -20, 20, 20));
    expect(subpathCount(visible)).toBe(1);
    expect(subpathCount(hidden)).toBe(1);
  });

  it('hides a path wholly under the top and passes one wholly outside it through', () => {
    const inside = expectLengthKept(circle(0, 0, 2), square(-5, -5, 5, 5));
    expect(inside.visible).toBe('');
    expect(inside.hidden.trim().endsWith('Z')).toBe(true);
    const outside = expectLengthKept(circle(20, 0, 2), square(-5, -5, 5, 5));
    expect(outside.hidden).toBe('');
  });

  it('covers with the union of several tops', () => {
    const { hidden } = expectLengthKept('M -10 0 L 10 0', [square(-8, -1, -4, 1), square(2, -1, 6, 1)]);
    expect(subpathCount(hidden)).toBe(2);
    expect(lengthOf(hidden)).toBeCloseTo(8, 9);
  });

  it('leaves a ring\'s hole uncovered, its subpaths covering even-odd', () => {
    const ring = `${square(-6, -6, 6, 6)} ${square(-2, -2, 2, 2)}`;
    const { visible, hidden } = expectLengthKept('M -10 0 L 10 0', ring);
    expect(lengthOf(hidden)).toBeCloseTo(8, 9);
    expect(lengthOf(visible)).toBeCloseTo(12, 9);
  });

  it('leaves a line along the top\'s edge visible, and a tangent touch uncut', () => {
    expect(occludePath('M -10 2 L 10 2', square(-2, -2, 2, 2)).hidden).toBe('');
    const tangent = expectLengthKept(circle(0, 0, 5), square(5, -1, 8, 1));
    expect(tangent.hidden).toBe('');
    expect(subpathCount(tangent.visible)).toBe(1);
  });

  it('splits a cubic exactly, its hidden piece ending on the top\'s edges', () => {
    const bottom = 'M 0 0 C 0 10 20 10 20 0';
    const { hidden } = expectLengthKept(bottom, square(5, -1, 15, 20));
    expect(hidden).toMatch(/^M \S+ \S+ C /);
    const ends = samplePathToPolyline(hidden, 0.5, true);
    expect(ends[0].x).toBeCloseTo(5, 6);
    expect(ends[ends.length - 1].x).toBeCloseTo(15, 6);
    const original = samplePathToPolyline(bottom, 0.01, true);
    for (const pt of ends) {
      expect(Math.min(...original.map(o => Math.hypot(o.x - pt.x, o.y - pt.y)))).toBeLessThan(0.01);
    }
  });

  it('reads a quadratic as its cubic, and refuses relative commands', () => {
    expectLengthKept('M 0 0 Q 10 10 20 0', square(5, -1, 15, 20));
    expect(() => occludePath('M 0 0 l 10 0', square(-1, -1, 1, 1))).toThrow(/unsupported/);
  });
});
