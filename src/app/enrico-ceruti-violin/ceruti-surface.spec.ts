import { flutingProfileZ, pathsBounds } from '../helpers/svgPathMath';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams, longArchHeightAt } from './ceruti-arching';
import {
  buildPlateStl, buildPlateSurfaceModel, calculateCrossArchTemplates, calculateFlutingSectionTop,
  calculateLongArchTemplates, computeArchContours, computeArchSectionProfile, crossArchTemplateStationYs,
  stationChordsAt, topSurfaceZAt, PlateSurfaceModel,
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
  it('hits its three knots and has exactly one local minimum', () => {
    // Circular-arc profile through A=(0,0), T=(troughU·width, −channelDepth), B=(width, −edgeDepth).
    // T lies exactly on the arc so z(troughU) = −channelDepth precisely.
    const width = 10;
    expect(flutingProfileZ(0, 1, 0.4, 0.5, width)).toBe(0);
    expect(flutingProfileZ(0.4, 1, 0.4, 0.5, width)).toBeCloseTo(-1, 1);
    expect(flutingProfileZ(1, 1, 0.4, 0.5, width)).toBeCloseTo(-0.5, 1);
    // Exactly one local minimum: first strictly descends, then strictly ascends — no inflection wiggles.
    let prevZ = flutingProfileZ(0, 1, 0.4, 0.5, width);
    let foundTrough = false;
    let descending = true;
    for (let i = 1; i <= 99; i++) {
      const u = i / 100;
      const z = flutingProfileZ(u, 1, 0.4, 0.5, width);
      if (descending) {
        if (z > prevZ + 1e-9) { foundTrough = true; descending = false; }
        else { expect(z).toBeLessThanOrEqual(prevZ + 1e-9); }
      } else {
        expect(z).toBeGreaterThanOrEqual(prevZ - 1e-9);
      }
      prevZ = z;
    }
    expect(foundTrough).toBe(true);
  });

  it('falls back to the straight chord when T is not below the A–B chord', () => {
    // channelDepth(0.3) <= edgeDepth·troughU(0.4): T sits on or above the chord from A to B,
    // so no concave arc exists. The function returns the linear chord −edgeDepth·u.
    for (let u = 0; u <= 1; u += 0.1) {
      expect(flutingProfileZ(u, 0.3, 0.4, 1.0, 10)).toBeCloseTo(-1.0 * u, 10);
    }
  });

  it('stays flat across the annulus with a ledge at the inner boundary when flatPlatform', () => {
    // Whole platform sits at the plate surface; only the inner boundary drops to −edgeDepth.
    for (let u = 0; u < 1; u += 0.1) {
      expect(flutingProfileZ(u, 1, 0.4, 0.5, 10, true)).toBe(0);
    }
    expect(flutingProfileZ(1, 1, 0.4, 0.5, 10, true)).toBeCloseTo(-0.5, 10);
  });
});

describe('top surface height field', () => {
  let p: EnricoCerutiParams;
  let model: PlateSurfaceModel;

  beforeEach(() => {
    p = makeParams();
    model = buildPlateSurfaceModel(p, 'top')!;
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

  it('flat platform leaves the annulus flat with a ledge to the arch takeoff', () => {
    p.arching!.top.edgeDepth = 1.2;
    p.arching!.top.fluting!.flatPlatform = true;
    const flatModel = buildPlateSurfaceModel(p, 'top')!;
    const y = p.height / 2;
    const chords = stationChordsAt(p, flatModel, y);
    const fi = chords.flutingInnerHalf!;
    const outer = chords.outerHalf!;
    // The whole annulus sits at the plate surface — no scoop below it.
    for (let x = fi + 0.2; x < outer; x += 0.2) {
      const z = topSurfaceZAt(p, flatModel, x, y, chords);
      if (z !== null) expect(z).toBeCloseTo(0, 6);
    }
    // The arch still takes off at −edgeDepth; the ledge bridges the two.
    expect(topSurfaceZAt(p, flatModel, fi - 1e-6, y, chords)!).toBeCloseTo(-1.2, 3);
    const slice = calculateFlutingSectionTop(p, flatModel, y)!;
    expect(slice).toContain(`L ${fi} ${flatModel.zBase}`);
  });

  it('generates closed contours including channel levels', () => {
    const contours = computeArchContours(p, model, 1, 2);
    const levels = contours.map(c => c.level);
    expect(levels.some(l => l > 0)).toBe(true);
    expect(levels.some(l => l <= 0)).toBe(true);
    for (const c of contours) expect(c.path).toContain('Z');
  });

  it('exports a plausible binary STL', () => {
    const buf = buildPlateStl(p, model, 'top', 2);
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    expect(triCount).toBeGreaterThan(1000);
    expect(buf.byteLength).toBe(84 + triCount * 50);
  });
});

describe('arching templates', () => {
  let p: EnricoCerutiParams;
  let model: PlateSurfaceModel;

  beforeEach(() => {
    p = makeParams();
    model = buildPlateSurfaceModel(p, 'top')!;
  });

  it('sweeps the full station width in one continuous path, matching the height field', () => {
    const y = p.height / 2;
    const profile = computeArchSectionProfile(p, model, y)!;
    expect(profile).toBeTruthy();
    expect(profile.startsWith('M')).toBe(true);
    const chords = stationChordsAt(p, model, y);
    const z = topSurfaceZAt(p, model, 0, y, chords)!;
    expect(profile).toContain(`0 ${model.zBase + model.signZ * z}`);
  });

  it('returns null off the plate', () => {
    expect(computeArchSectionProfile(p, model, -10)).toBeNull();
    expect(computeArchSectionProfile(p, model, p.height + 50)).toBeNull();
  });

  it('picks 5 interior stations, never the zero-height ends of the long arch', () => {
    const stations = crossArchTemplateStationYs(p);
    expect(stations.length).toBe(5);
    for (const y of stations) {
      expect(longArchHeightAt(p, p.arching!.top.arch, y)).toBeGreaterThan(0);
    }
  });

  it('builds one closed, labeled blank per station per plate side', () => {
    const shapes = calculateCrossArchTemplates(p);
    expect(shapes.length).toBe(10);
    for (const s of shapes) {
      expect(s.path.trim().endsWith('Z')).toBe(true);
      expect(s.label).toMatch(/^(Top|Back) \d+mm$/);
    }
    expect(shapes.some(s => s.label.startsWith('Top'))).toBe(true);
    expect(shapes.some(s => s.label.startsWith('Back'))).toBe(true);
  });

  it('places each cross-arch label inside its own blank’s bounds', () => {
    for (const s of calculateCrossArchTemplates(p)) {
      const b = pathsBounds([s.path]);
      expect(s.labelPos.x).toBeGreaterThanOrEqual(b.minX);
      expect(s.labelPos.x).toBeLessThanOrEqual(b.maxX);
      expect(s.labelPos.y).toBeGreaterThanOrEqual(b.minY);
      expect(s.labelPos.y).toBeLessThanOrEqual(b.maxY);
    }
  });

  it('cross-arch templates are empty without arching configured', () => {
    const bare = makeParams();
    bare.arching = undefined;
    expect(calculateCrossArchTemplates(bare)).toEqual([]);
  });

  it('builds one closed, labeled blank per plate side for the long arch', () => {
    const shapes = calculateLongArchTemplates(p);
    expect(shapes.length).toBe(2);
    expect(shapes.map(s => s.label).sort()).toEqual(['Back Long', 'Top Long']);
    for (const s of shapes) {
      expect(s.path.trim().endsWith('Z')).toBe(true);
      expect(s.labelRotation).toBe(90);
    }
  });

  it('long-arch templates are empty without arching configured', () => {
    const bare = makeParams();
    bare.arching = undefined;
    expect(calculateLongArchTemplates(bare)).toEqual([]);
  });
});

describe('back plate surface height field', () => {
  let p: EnricoCerutiParams;
  let model: PlateSurfaceModel;

  beforeEach(() => {
    p = makeParams();
    // defaultArchingParams already seeds bottom.cross/fluting; build the back model.
    model = buildPlateSurfaceModel(p, 'bottom')!;
  });

  it('folds downward from the back outer surface', () => {
    expect(model.signZ).toBe(-1);
    expect(model.zBase).toBeCloseTo(-p.arching!.bottom.thickness, 6);
  });

  it('uses the same relative height field convention (dome positive)', () => {
    // The relative field is plate-agnostic: peak positive, channel negative.
    const y = p.height / 2;
    const peak = topSurfaceZAt(p, model, 0, y)!;
    expect(peak).toBeGreaterThan(p.arching!.bottom.arch.archHeight * 0.9);
  });

  it('carries the neck-root button in its outline, unlike the top', () => {
    // The button sits at the neck end (max y); the back outline reaches past the
    // top outline's highest point there.
    const top = buildPlateSurfaceModel(p, 'top')!;
    const maxYBack = Math.max(...model.outerPlate.map(pt => pt.y));
    const maxYTop = Math.max(...top.outerPlate.map(pt => pt.y));
    expect(maxYBack).toBeGreaterThan(maxYTop);
  });

  it('places the flat-platform ledge on the negative (down) side', () => {
    p.arching!.bottom.edgeDepth = 1.2;
    p.arching!.bottom.fluting!.flatPlatform = true;
    const flat = buildPlateSurfaceModel(p, 'bottom')!;
    const y = p.height / 2;
    const slice = calculateFlutingSectionTop(p, flat, y)!;
    // signZ = −1: the ledge drops toward the rib (zBase + edgeDepth), not below the plate.
    expect(slice).toContain(`${flat.zBase + 1.2}`);
  });

  it('exports a plausible binary STL for the back plate', () => {
    const buf = buildPlateStl(p, model, 'bottom', 2);
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    expect(triCount).toBeGreaterThan(1000);
    expect(buf.byteLength).toBe(84 + triCount * 50);
  });
});
