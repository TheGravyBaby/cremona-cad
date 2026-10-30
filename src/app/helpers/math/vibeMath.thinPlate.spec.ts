// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeThinPlateSpline, thinPlateSplineFitter as makeThinPlateSplineFitter, Reading } from './vibeMath';

const at = (x: number, y: number, v: number): Reading => ({ x, y, v });

describe('a thin-plate spline', () => {
  const readings = [at(0, 0, 4), at(50, 0, 2), at(0, 60, 3), at(-40, -30, 2.5), at(30, 45, 3.5)];
  const f = makeThinPlateSpline(readings)!;

  it('is exact on every reading', () => {
    for (const r of readings) expect(f(r.x, r.y)).toBeCloseTo(r.v, 9);
  });

  it('is a plane through readings that lie on one', () => {
    const plane = (x: number, y: number): number => 3 + 0.01 * x - 0.02 * y;
    const g = makeThinPlateSpline([at(0, 0, plane(0, 0)), at(50, 0, plane(50, 0)), at(0, 60, plane(0, 60)), at(-40, 20, plane(-40, 20))])!;
    for (const [x, y] of [[10, 10], [-100, 30], [200, -200]]) expect(g(x, y)).toBeCloseTo(plane(x, y), 9);
  });

  it('runs smoothly from one reading to the next, with no bullseye at either', () => {
    const g = makeThinPlateSpline([at(0, 0, 4), at(50, 0, 2), at(0, 60, 3), at(50, 60, 3)])!;
    let previous = g(0, 0);
    for (let x = 1; x <= 50; x++) {
      const v = g(x, 0);
      expect(v).toBeLessThan(previous);
      expect(previous - v).toBeLessThan(0.12);
      previous = v;
    }
  });

  it('is the same spline at any scale of the plane', () => {
    const g = makeThinPlateSpline(readings.map(r => at(r.x * 1000, r.y * 1000, r.v)))!;
    for (const [x, y] of [[10, 10], [-20, 30], [25, -15]]) expect(g(x * 1000, y * 1000)).toBeCloseTo(f(x, y), 6);
  });

  it('refuses too few readings or two at one spot', () => {
    expect(makeThinPlateSpline([at(0, 0, 1), at(1, 0, 2)])).toBeNull();
    expect(makeThinPlateSpline([at(0, 0, 1), at(0, 0, 2), at(1, 1, 3), at(2, 0, 1)])).toBeNull();
  });
});

describe('a thin-plate spline fitter', () => {
  const sites = [at(0, 0, 0), at(50, 0, 0), at(0, 60, 0), at(-40, -30, 0), at(30, 45, 0)];
  const fit = makeThinPlateSplineFitter(sites)!;

  it('fits the same spline as a one-shot fit, and refits new values at the same sites', () => {
    const first = [4, 2, 3, 2.5, 3.5], second = [1, 1, 5, 1, 2];
    const f = fit(first), g = fit(second);
    const whole = makeThinPlateSpline(sites.map((s, i) => at(s.x, s.y, first[i])))!;
    for (const [x, y] of [[10, 10], [-20, 30], [25, -15]]) expect(f(x, y)).toBeCloseTo(whole(x, y), 9);
    sites.forEach((s, i) => {
      expect(f(s.x, s.y)).toBeCloseTo(first[i], 9);
      expect(g(s.x, s.y)).toBeCloseTo(second[i], 9);
    });
  });
});
