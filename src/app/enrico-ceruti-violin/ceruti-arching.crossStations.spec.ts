import {
  makeCrossArchResolver, normalizeCrossArchStations, resolveCrossArchSides,
  STATION_MERGE_EPS_MM,
} from './ceruti-arching';
import { CrossArchParams } from './ceruti-types';

const BODY = 350;

function base(over: Partial<CrossArchParams> = {}): CrossArchParams {
  return { d: 0.4, pct: 0.9, ...over };
}

describe('normalizeCrossArchStations', () => {
  it('sorts by position and leaves the caller\'s array untouched', () => {
    const stations = [{ y: 200, d: 0.5, pct: 0.8 }, { y: 100, d: 0.6, pct: 0.7 }];
    const out = normalizeCrossArchStations(stations, BODY);
    expect(out.map(s => s.y)).toEqual([100, 200]);
    // The panel keeps its own row order (it deliberately doesn't re-sort mid-edit),
    // so normalizing must not reorder the array behind it.
    expect(stations.map(s => s.y)).toEqual([200, 100]);
  });

  it('collapses stations that land on top of one another, first wins', () => {
    const out = normalizeCrossArchStations([
      { y: 100, d: 0.5, pct: 0.8 },
      { y: 100 + STATION_MERGE_EPS_MM / 2, d: 0.9, pct: 0.5 },
    ], BODY);
    expect(out.length).toBe(1);
    expect(out[0].d).toBe(0.5);
  });

  it('holds stations inside the body ends so they stay interior knots', () => {
    const out = normalizeCrossArchStations([{ y: -50, d: 0.5, pct: 0.8 }], BODY);
    expect(out[0].y).toBeGreaterThan(0);
    const far = normalizeCrossArchStations([{ y: BODY + 50, d: 0.5, pct: 0.8 }], BODY);
    expect(far[0].y).toBeLessThan(BODY);
  });
});

describe('makeCrossArchResolver', () => {
  it('is the plate base shape everywhere when no stations are set', () => {
    const cross = base();
    const at = makeCrossArchResolver(cross, BODY);
    for (const y of [0, 50, 175, 300, BODY]) {
      expect(at(y).left).toEqual({ d: 0.4, pct: 0.9 });
      expect(at(y).right).toEqual({ d: 0.4, pct: 0.9 });
    }
    // ...and matches what the station-free resolver reports.
    expect(at(175)).toEqual(resolveCrossArchSides(cross));
  });

  it('passes through a station\'s own shape at that station', () => {
    const at = makeCrossArchResolver(base({ stations: [{ y: 175, d: 0.8, pct: 0.6 }] }), BODY);
    expect(at(175).left.d).toBeCloseTo(0.8, 6);
    expect(at(175).left.pct).toBeCloseTo(0.6, 6);
  });

  it('returns to the base shape at both body ends', () => {
    const at = makeCrossArchResolver(base({ stations: [{ y: 175, d: 0.8, pct: 0.6 }] }), BODY);
    expect(at(0).left.d).toBeCloseTo(0.4, 6);
    expect(at(BODY).left.d).toBeCloseTo(0.4, 6);
  });

  it('never overshoots the entered values between knots', () => {
    // A shape-preserving interpolant is what keeps an interpolated d/pct inside
    // the range the maker actually typed — a plain cubic would bulge past 0.8.
    const at = makeCrossArchResolver(base({ stations: [{ y: 175, d: 0.8, pct: 0.6 }] }), BODY);
    for (let y = 0; y <= BODY; y += 1) {
      const { d, pct } = at(y).left;
      expect(d).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(d).toBeLessThanOrEqual(0.8 + 1e-9);
      expect(pct).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(pct).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });

  it('ramps monotonically between the base and a single station', () => {
    const at = makeCrossArchResolver(base({ stations: [{ y: 175, d: 0.8, pct: 0.6 }] }), BODY);
    let prev = at(0).left.d;
    for (let y = 1; y <= 175; y += 1) {
      const d = at(y).left.d;
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
  });

  it('keeps both sides identical on a symmetric plate, stations included', () => {
    const at = makeCrossArchResolver(base({ stations: [{ y: 120, d: 0.8, pct: 0.6 }] }), BODY);
    for (let y = 0; y <= BODY; y += 5) {
      expect(at(y).left).toEqual(at(y).right);
    }
  });

  it('tracks each side independently once the plate is asymmetric', () => {
    const at = makeCrossArchResolver(base({
      asymmetric: true,
      left: { d: 0.3, pct: 0.9 },
      right: { d: 0.5, pct: 0.9 },
      stations: [{ y: 175, d: 0.4, pct: 0.7, left: { d: 0.2, pct: 0.7 }, right: { d: 0.9, pct: 0.8 } }],
    }), BODY);
    expect(at(175).left.d).toBeCloseTo(0.2, 6);
    expect(at(175).right.d).toBeCloseTo(0.9, 6);
    expect(at(0).left.d).toBeCloseTo(0.3, 6);
    expect(at(0).right.d).toBeCloseTo(0.5, 6);
  });

  it('falls back to a station\'s symmetric pair for a side it has not been given', () => {
    // A station added before the asymmetric toggle was flipped carries no left/right.
    const at = makeCrossArchResolver(base({
      asymmetric: true,
      left: { d: 0.3, pct: 0.9 },
      right: { d: 0.5, pct: 0.9 },
      stations: [{ y: 175, d: 0.75, pct: 0.65 }],
    }), BODY);
    expect(at(175).left.d).toBeCloseTo(0.75, 6);
    expect(at(175).right.d).toBeCloseTo(0.75, 6);
  });

  it('holds resolved values inside the ranges the trochoid builders accept', () => {
    const at = makeCrossArchResolver(base({
      d: 0, pct: 0.05,
      stations: [{ y: 90, d: 1, pct: 1 }, { y: 260, d: 0, pct: 0.05 }],
    }), BODY);
    for (let y = 0; y <= BODY; y += 1) {
      const { d, pct } = at(y).left;
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      expect(pct).toBeGreaterThanOrEqual(0.05);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });
});
