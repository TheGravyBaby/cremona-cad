import { normalizeCrossArchStations, STATION_MERGE_EPS_MM } from './ceruti-arching';
import { GougedCrossCycloidStation, GougedCrossSplineStation } from './ceruti-types';

// `normalizeCrossArchStations` outlived the classic cross-arch engine it was
// written for: it is generic over `{ y: number }`, and the gouged resolver,
// `nearestGougedCrossShape` and the template station list all lean on it. These
// cases came across from the two classic station specs when those were retired,
// restated against gouged stations so the coverage follows the caller.

const BODY = 350;

const cyc = (y: number, d: number, pct = 0.9): GougedCrossCycloidStation =>
  ({ y, type: 'gouged-cycloid', d, pct });

describe('normalizeCrossArchStations', () => {
  it('sorts by position and leaves the caller\'s array untouched', () => {
    const stations = [cyc(200, 0.5), cyc(100, 0.6)];
    const out = normalizeCrossArchStations(stations, BODY);
    expect(out.map(s => s.y)).toEqual([100, 200]);
    // The panel keeps its own row order (it deliberately doesn't re-sort mid-edit),
    // so normalizing must not reorder the array behind it.
    expect(stations.map(s => s.y)).toEqual([200, 100]);
  });

  it('collapses stations that land on top of one another, first wins', () => {
    const out = normalizeCrossArchStations(
      [cyc(100, 0.5), cyc(100 + STATION_MERGE_EPS_MM / 2, 0.9)], BODY,
    );
    expect(out.length).toBe(1);
    expect(out[0].d).toBe(0.5);
  });

  it('holds stations inside the body ends so they stay interior knots', () => {
    const out = normalizeCrossArchStations([cyc(-50, 0.5)], BODY);
    expect(out[0].y).toBeGreaterThan(0);
    const far = normalizeCrossArchStations([cyc(BODY + 50, 0.5)], BODY);
    expect(far[0].y).toBeLessThan(BODY);
  });

  it('preserves the station subtype through the call', () => {
    const stations: GougedCrossSplineStation[] = [
      { y: 120, type: 'gouged', peak: 0.55, points: [{ x: -0.34, z: 0.5, mirror: true }] },
    ];
    const out = normalizeCrossArchStations(stations, BODY);
    // Typed as the spline station it went in as, so `points` is reachable
    // without a cast — the property the generic exists to hold.
    expect(out[0].points[0].z).toBe(0.5);
    expect(out[0].peak).toBe(0.55);
  });
});
