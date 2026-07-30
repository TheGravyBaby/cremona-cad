import { crossArchSplineProfileGrid, crossArchSplineEdgeSlopeFrac, CROSS_ARCH_SPLINE_GRID_N } from '../helpers/svgPathMath';
import {
  calculateCrossArchTop, crossArchEdgeSlopeAt, defaultArchingParams, defaultCrossArchSplineParams,
  defaultFlutingChannelParams, makeCrossArchSplineResolver, normalizeCrossArchStations,
} from './ceruti-arching';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { CrossArchSplineParams, DefaultParams, EnricoCerutiParams } from './ceruti-types';

const BODY = 350;

function base(over: Partial<CrossArchSplineParams> = {}): CrossArchSplineParams {
  return { type: 'spline', peak: 0.5, points: [], ...over };
}

describe('crossArchSplineProfileGrid', () => {
  it('rises from 0 at the left edge to 1 at the peak and back to 0 at the right edge', () => {
    const grid = crossArchSplineProfileGrid([{ t: 0.25, z: 0.6, mirror: true }], 0.5);
    expect(grid.length).toBe(CROSS_ARCH_SPLINE_GRID_N);
    expect(grid[0]).toBeCloseTo(0, 6);
    expect(grid[grid.length - 1]).toBeCloseTo(0, 6);
    const peakIdx = Math.round(0.5 * (grid.length - 1));
    expect(grid[peakIdx]).toBeCloseTo(1, 6);
    // Strictly rises to the peak, then strictly falls — no wiggles.
    for (let i = 1; i <= peakIdx; i++) expect(grid[i]).toBeGreaterThanOrEqual(grid[i - 1] - 1e-9);
    for (let i = peakIdx + 1; i < grid.length; i++) expect(grid[i]).toBeLessThanOrEqual(grid[i - 1] + 1e-9);
  });

  it('mirrors a mirrored point about the centerline', () => {
    const grid = crossArchSplineProfileGrid([{ t: 0.3, z: 0.4, mirror: true }], 0.5);
    for (let i = 0; i < grid.length; i++) expect(grid[i]).toBeCloseTo(grid[grid.length - 1 - i], 6);
  });

  it('holds a flat run between a control point and the peak at the same height (the long-arch bug this reuses the fix for)', () => {
    const grid = crossArchSplineProfileGrid([{ t: 0.3, z: 1, mirror: true }], 0.5);
    expect(Math.max(...grid)).toBeCloseTo(1, 6);
  });

  it('never overshoots the entered heights', () => {
    const grid = crossArchSplineProfileGrid([{ t: 0.15, z: 0.3 }, { t: 0.4, z: 0.9 }], 0.6);
    expect(Math.max(...grid)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.min(...grid)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('moves the peak off-center for an asymmetric shape', () => {
    const grid = crossArchSplineProfileGrid([], 0.3);
    const peakIdx = Math.round(0.3 * (grid.length - 1));
    expect(grid[peakIdx]).toBeCloseTo(1, 6);
  });
});

describe('crossArchSplineEdgeSlopeFrac', () => {
  it('is positive when the curve rises away from the edge', () => {
    expect(crossArchSplineEdgeSlopeFrac([], 0.5, true)).toBeGreaterThan(0);
    expect(crossArchSplineEdgeSlopeFrac([], 0.5, false)).toBeGreaterThan(0);
  });

  it('reads the same at both edges for a symmetric shape', () => {
    const points = [{ t: 0.25, z: 0.6, mirror: true }];
    expect(crossArchSplineEdgeSlopeFrac(points, 0.5, true))
      .toBeCloseTo(crossArchSplineEdgeSlopeFrac(points, 0.5, false), 4);
  });
});

describe('makeCrossArchSplineResolver', () => {
  it('is the plate base profile everywhere when no stations are set', () => {
    const cross = base({ points: [{ t: 0.2, z: 0.7, mirror: true }] });
    const baseGrid = crossArchSplineProfileGrid(cross.points, cross.peak);
    const at = makeCrossArchSplineResolver(cross, BODY);
    for (const y of [0, 50, 175, 300, BODY]) {
      const row = at(y);
      for (let i = 0; i < baseGrid.length; i++) expect(row.zFracGrid[i]).toBeCloseTo(baseGrid[i], 6);
    }
  });

  it('passes through a station\'s own profile at that station', () => {
    const stationPoints = [{ t: 0.35, z: 0.5, mirror: true }];
    const at = makeCrossArchSplineResolver(base({
      stations: [{ y: 175, type: 'spline', peak: 0.5, points: stationPoints }],
    }), BODY);
    const stationGrid = crossArchSplineProfileGrid(stationPoints, 0.5);
    const row = at(175);
    for (let i = 0; i < stationGrid.length; i++) expect(row.zFracGrid[i]).toBeCloseTo(stationGrid[i], 6);
  });

  it('returns to the base profile at both body ends', () => {
    const baseGrid = crossArchSplineProfileGrid([], 0.5);
    const at = makeCrossArchSplineResolver(base({
      stations: [{ y: 175, type: 'spline', peak: 0.5, points: [{ t: 0.3, z: 0.8, mirror: true }] }],
    }), BODY);
    for (let i = 0; i < baseGrid.length; i++) {
      expect(at(0).zFracGrid[i]).toBeCloseTo(baseGrid[i], 6);
      expect(at(BODY).zFracGrid[i]).toBeCloseTo(baseGrid[i], 6);
    }
  });

  it('never overshoots the entered heights at any grid column, for any station', () => {
    const at = makeCrossArchSplineResolver(base({
      stations: [{ y: 90, type: 'spline', peak: 0.4, points: [{ t: 0.2, z: 0.9 }] },
        { y: 260, type: 'spline', peak: 0.6, points: [{ t: 0.7, z: 0.3 }] }],
    }), BODY);
    for (let y = 0; y <= BODY; y += 10) {
      const grid = at(y).zFracGrid;
      expect(Math.max(...grid)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.min(...grid)).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('ramps monotonically between the base and a single station, at a fixed grid column', () => {
    const at = makeCrossArchSplineResolver(base({
      stations: [{ y: 175, type: 'spline', peak: 0.5, points: [{ t: 0.3, z: 0.9, mirror: true }] }],
    }), BODY);
    const col = Math.round(0.3 * (CROSS_ARCH_SPLINE_GRID_N - 1));
    let prev = at(0).zFracGrid[col];
    for (let y = 1; y <= 175; y += 1) {
      const v = at(y).zFracGrid[col];
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});

describe('normalizeCrossArchStations (shared with spline stations)', () => {
  it('preserves the spline station subtype through the call', () => {
    const out = normalizeCrossArchStations(
      [{ y: 200, type: 'spline' as const, peak: 0.5, points: [] }], BODY,
    );
    expect(out[0].type).toBe('spline');
    expect(out[0].points).toEqual([]);
  });
});

describe('spline cross-arch integration', () => {
  /** A fully calculated default violin with a spline cross-arch configured. */
  function makeSplineParams(): EnricoCerutiParams {
    const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
    calculateMainBouts(p);
    calculateCorners(p);
    calculateCenterBout(p);
    calculateOuterArcs(p);
    p.arching = defaultArchingParams(p.height);
    p.arching.top.cross = defaultCrossArchSplineParams();
    p.arching.top.fluting = defaultFlutingChannelParams();
    return p;
  }

  it('calculateCrossArchTop builds a real path for a spline cross-arch', () => {
    const p = makeSplineParams();
    const result = calculateCrossArchTop(p, p.height / 2, 'top');
    expect(result).not.toBeNull();
    expect(result!.path.startsWith('M')).toBe(true);
    expect(result!.halfSpan).toBeGreaterThan(0);
  });

  it('crossArchEdgeSlopeAt returns a finite slope for a spline cross-arch', () => {
    const p = makeSplineParams();
    const slope = crossArchEdgeSlopeAt(p, p.height / 2, 'top');
    expect(Number.isFinite(slope)).toBe(true);
  });
});
