import { flutingProfileZ } from '../helpers/svgPathMath';
import {
  calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs,
  defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams,
} from './ceruti-calcs';
import {
  buildTopPlateStl, buildTopSurfaceModel, calculateFlutingSectionTop,
  computeArchContours, stationChordsAt, topSurfaceZAt, TopSurfaceModel,
} from './ceruti-surface';
import { DefaultParams, EnricoCerutiParams } from './ceruti-types';

/** A fully calculated default violin with arching + fluting configured. */
function makeParams(): EnricoCerutiParams {
  const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
  calculateMainBouts(p);
  calculateCorners(p);
  calculateCenterBout(p);
  calculateOuterArcs(p);
  p.arching = defaultArchingParams(p.height);
  p.arching.top.cross = defaultCrossArchParams();
  p.arching.top.fluting = defaultFlutingChannelParams();
  return p;
}

describe('flutingProfileZ', () => {
  it('hits its three knots and stays continuous across the trough', () => {
    expect(flutingProfileZ(0, 1, 0.4, 0.5)).toBe(0);
    expect(flutingProfileZ(0.4, 1, 0.4, 0.5)).toBeCloseTo(-1, 10);
    expect(flutingProfileZ(1, 1, 0.4, 0.5)).toBeCloseTo(-0.5, 10);
    const justBelow = flutingProfileZ(0.4 - 1e-9, 1, 0.4, 0.5);
    const justAbove = flutingProfileZ(0.4 + 1e-9, 1, 0.4, 0.5);
    expect(Math.abs(justBelow - justAbove)).toBeLessThan(1e-6);
  });

  it('descends monotonically when the channel is shallower than the edge depth', () => {
    let prev = flutingProfileZ(0, 0.5, 0.4, 1.0);
    for (let u = 0.05; u <= 1; u += 0.05) {
      const z = flutingProfileZ(u, 0.5, 0.4, 1.0);
      expect(z).toBeLessThanOrEqual(prev + 1e-12);
      prev = z;
    }
  });
});

describe('top surface height field', () => {
  let p: EnricoCerutiParams;
  let model: TopSurfaceModel;

  beforeEach(() => {
    p = makeParams();
    model = buildTopSurfaceModel(p)!;
  });

  it('builds a model with sampled boundary loops', () => {
    expect(model).toBeTruthy();
    expect(model.platformOuter.length).toBeGreaterThan(100);
    expect(model.flutingInner!.length).toBeGreaterThan(100);
  });

  it('never voids a station row inside the body — including the corner bands', () => {
    // The corner tips are cubic Béziers; arc-only chord queries used to return
    // null there, cutting horizontal shelves across the surface (LCr.y ≈ 140,
    // UCr.y ≈ 233 on the default violin).
    for (let y = 3; y <= p.height - 3; y++) {
      const chords = stationChordsAt(p, model, y);
      expect(chords.outerHalf).not.toBeNull();
      expect(topSurfaceZAt(p, model, 0, y, chords)).not.toBeNull();
    }
  });

  it('is continuous across the channel/arch join at several stations', () => {
    const cornerYs = [Math.round(p.bouts.LCr!.y), Math.round(p.bouts.UCr!.y)];
    for (const y of [60, 120, p.height / 2, 240, 300, ...cornerYs]) {
      const chords = stationChordsAt(p, model, y);
      const fi = chords.flutingInnerHalf!;
      const inside = topSurfaceZAt(p, model, fi - 1e-6, y, chords)!;
      const outside = topSurfaceZAt(p, model, fi + 1e-6, y, chords)!;
      // Arch takeoff sits at −edgeDepth; the channel profile ends there too.
      expect(inside).toBeCloseTo(-model.edgeDepth, 3);
      expect(Math.abs(inside - outside)).toBeLessThan(0.05);
    }
  });

  it('peaks at the long-arch height on the centerline and is flat land at the edge', () => {
    const y = p.height / 2;
    const peak = topSurfaceZAt(p, model, 0, y)!;
    expect(peak).toBeGreaterThan(p.arching!.top.arch.archHeight * 0.9);
    const chords = stationChordsAt(p, model, y);
    const nearEdge = topSurfaceZAt(p, model, chords.outerHalf! - 0.2, y, chords)!;
    expect(nearEdge).toBeCloseTo(0, 6);
    expect(topSurfaceZAt(p, model, chords.outerHalf! + 1, y, chords)).toBeNull();
  });

  it('dips below the surface inside the channel', () => {
    const y = p.height / 2;
    const chords = stationChordsAt(p, model, y);
    const fi = chords.flutingInnerHalf!;
    const outer = chords.outerHalf!;
    let minZ = 0;
    for (let x = fi; x < outer; x += 0.1) {
      const z = topSurfaceZAt(p, model, x, y, chords);
      if (z !== null) minZ = Math.min(minZ, z);
    }
    expect(minZ).toBeCloseTo(-model.channelDepth, 1);
  });

  it('produces a section slice that starts and ends where the render expects', () => {
    const slice = calculateFlutingSectionTop(p, model, p.height / 2);
    expect(slice).toBeTruthy();
    expect(slice!.startsWith('M')).toBe(true);
  });

  it('generates closed contours including channel levels', () => {
    const contours = computeArchContours(p, model, 1, 2);
    const levels = contours.map(c => c.level);
    expect(levels.some(l => l > 0)).toBe(true);
    expect(levels.some(l => l <= 0)).toBe(true);
    for (const c of contours) expect(c.path).toContain('Z');
  });

  it('exports a plausible binary STL', () => {
    const buf = buildTopPlateStl(p, model, 2);
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    expect(triCount).toBeGreaterThan(1000);
    expect(buf.byteLength).toBe(84 + triCount * 50);
  });
});
