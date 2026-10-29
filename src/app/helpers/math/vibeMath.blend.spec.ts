// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { radialBlend, RadialSource } from './vibeMath';

const at = (x: number, y: number, value: number, reach: number): RadialSource => ({ value, reach, dist: (px, py) => Math.hypot(px - x, py - y) });

describe('a radial blend', () => {
  const sources = [at(0, 0, 4, 30), at(50, 0, 2, 30), at(0, 60, 3, 10)];

  it('is exact on every source', () => {
    expect(radialBlend(sources, 0, 0)).toBe(4);
    expect(radialBlend(sources, 50, 0)).toBe(2);
    expect(radialBlend(sources, 0, 60)).toBe(3);
  });

  it('is flat where one source reaches alone', () => {
    for (const [x, y] of [[0, 20], [-15, -10], [10, 12]]) expect(radialBlend(sources, x, y)).toBeCloseTo(4, 9);
  });

  it('never leaves the sources\' range, and runs from one to the other between them', () => {
    let previous = 4;
    for (let x = 0; x <= 50; x += 2.5) {
      const v = radialBlend(sources, x, 0);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });

  it('shades toward the source nearest beyond its reach where none reaches, smoothly', () => {
    expect(radialBlend(sources, 0, 100)).toBeCloseTo(3, 0);
    expect(radialBlend(sources, 100, 0)).toBeCloseTo(2, 0);
    let previous = radialBlend(sources, 0, 70);
    for (let y = 71; y <= 100; y++) {
      const v = radialBlend(sources, 0, y);
      expect(Math.abs(v - previous)).toBeLessThan(0.05);
      previous = v;
    }
  });
});
