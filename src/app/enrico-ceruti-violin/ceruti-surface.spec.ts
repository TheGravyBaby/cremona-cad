import { flutingProfileZ, pathsBounds } from '../helpers/svgPathMath';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams, longArchHeightAt } from './ceruti-arching';
import {
  buildPlateStl, buildPlateSurfaceModel, calculateCrossArchTemplates, calculateFlutingSectionTop,
  calculateLongArchTemplates, computeArchContours, computeArchSectionProfile, crossArchTemplateStationYs,
  stationChordsAt, topSurfaceZAt, PlateSurfaceModel, buildGougedPlateSurfaceModel,
} from './ceruti-surface';
import { defaultGougedCrossParams, defaultGougedFlutingParams, gougeHalfWidth } from './ceruti-gouged';
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
  // Signature: (u, edgeDepth, width, archEdgeSlope, flatPlatform?). A single
  // circular gouge arc across the annulus — 0 at the platform outer boundary
  // (u=0), −edgeDepth at the fluting inner boundary (u=1), tangent to
  // archEdgeSlope there. A nonzero takeoff slope dips it below −edgeDepth (the
  // recurve) before it rises to meet the arch.
  it('hits both boundary knots and dips through a single trough between them', () => {
    const edgeDepth = 0.5, width = 10, slope = 0.5;
    expect(flutingProfileZ(0, edgeDepth, width, slope)).toBe(0);
    expect(flutingProfileZ(1, edgeDepth, width, slope)).toBeCloseTo(-edgeDepth, 10);
    // Strictly descends to one trough, then strictly ascends to meet the arch — no wiggles.
    let prevZ = flutingProfileZ(0, edgeDepth, width, slope);
    let minZ = prevZ;
    let foundTrough = false;
    let descending = true;
    for (let i = 1; i <= 100; i++) {
      const z = flutingProfileZ(i / 100, edgeDepth, width, slope);
      minZ = Math.min(minZ, z);
      if (descending) {
        if (z > prevZ + 1e-9) { foundTrough = true; descending = false; }
        else { expect(z).toBeLessThanOrEqual(prevZ + 1e-9); }
      } else {
        expect(z).toBeGreaterThanOrEqual(prevZ - 1e-9);
      }
      prevZ = z;
    }
    expect(foundTrough).toBe(true);
    expect(minZ).toBeLessThan(-edgeDepth); // dipped past the takeoff — the recurve
  });

  it('clamps to the boundary heights outside the annulus', () => {
    expect(flutingProfileZ(-0.2, 0.5, 10, 0.5)).toBe(0);
    expect(flutingProfileZ(1.2, 0.5, 10, 0.5)).toBe(-0.5);
  });

  it('falls back to the straight chord when no tangent circle solves', () => {
    // slope = −edgeDepth/width makes B−A parallel to the tangent at B, so no
    // circle passes through both points tangent there; the profile is then the
    // linear chord −edgeDepth·u.
    const edgeDepth = 1, width = 2, slope = -edgeDepth / width;
    for (let u = 0.1; u <= 0.9; u += 0.1) {
      expect(flutingProfileZ(u, edgeDepth, width, slope)).toBeCloseTo(-edgeDepth * u, 10);
    }
  });

  it('stays flat across the annulus with a ledge at the inner boundary when flatPlatform', () => {
    // Whole platform sits at the plate surface; only the inner boundary drops to −edgeDepth.
    for (let u = 0; u < 1; u += 0.1) {
      expect(flutingProfileZ(u, 1, 10, 0.5, true)).toBe(0);
    }
    expect(flutingProfileZ(1, 1, 10, 0.5, true)).toBeCloseTo(-1, 10);
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
    // The channel scoops below the plate surface, past the arch takeoff (−edgeDepth).
    // Its depth is emergent from the gouge arc (tangent to the cross-arch slope),
    // not a stored parameter.
    expect(minZ).toBeLessThan(-model.edgeDepth);
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

    // Compared against the nearest sample rather than by looking for the centreline
    // coordinate as a substring: the profile is a fixed-step polyline, so no sample is
    // guaranteed to land exactly on x = 0, and an exact float match would be testing the
    // sampler's grid alignment rather than whether the path follows the height field.
    const samples = [...profile.matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)]
      .map(m => ({ x: +m[1], z: +m[2] }));
    expect(samples.length).toBeGreaterThan(10);
    const nearest = samples.reduce((a, b) => Math.abs(b.x) < Math.abs(a.x) ? b : a);
    expect(nearest.x).toBeCloseTo(0, 0);
    expect(nearest.z).toBeCloseTo(model.zBase + model.signZ * z, 2);
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

describe('gouged surface model', () => {
  /**
   * The claim the gouged model exists to make: the channel is one gouge wide
   * everywhere, because a maker has one gouge. The classic model cannot say
   * this — there the width is the gap between two boundary loops that disagree
   * about the corners, so it comes out as a value that drifts.
   *
   * Measured on the surface rather than on the parameters, since the surface is
   * what every consumer downstream actually reads.
   */
  function gougedParams(): EnricoCerutiParams {
    const p = makeParams();
    for (const side of ['top', 'bottom'] as const) {
      p.arching![side].gougedFluting = defaultGougedFlutingParams(p);
      p.arching![side].gougedCross = defaultGougedCrossParams();
    }
    return p;
  }

  it('cuts one constant channel section the whole way round', () => {
    const p = gougedParams();
    const model = buildGougedPlateSurfaceModel(p, 'top')!;
    expect(model.gouged).toBeTruthy();
    const depth = model.gouged!.gouge.depth;

    // Walk the channel centerline itself. That is where the gouge's deepest
    // point runs, so every sample on it must sit at exactly the full cut depth
    // — including through the corners, which the channel bypasses.
    const poly = model.gouged!.centerPoly;
    let checked = 0;
    for (let i = 0; i < poly.length; i += 7) {
      const z = topSurfaceZAt(p, model, poly[i].x, poly[i].y);
      if (z === null) continue; // off the plate outline at the very tips
      checked++;
      expect(z).toBeCloseTo(-depth, 6);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('leaves flat land outside the cut', () => {
    // Measured perpendicular to the centerline, not along the station chord —
    // the surface is defined by true distance to the loop, and the two only
    // agree where the centerline happens to run square to the station line.
    const p = gougedParams();
    const model = buildGougedPlateSurfaceModel(p, 'top')!;
    const poly = model.gouged!.centerPoly;
    const w = gougeHalfWidth(model.gouged!.gouge.sweepRadius, model.gouged!.gouge.depth);

    let checked = 0;
    for (let i = 0; i < poly.length; i += 23) {
      const prev = poly[(i - 1 + poly.length) % poly.length];
      const next = poly[(i + 1) % poly.length];
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty);
      if (len < 1e-9) continue;
      // Step outward along the loop normal, past the cut's own edge.
      const nx = ty / len, ny = -tx / len;
      const outward = Math.hypot(poly[i].x + nx, poly[i].y - p.height / 2) > Math.hypot(poly[i].x, poly[i].y - p.height / 2) ? 1 : -1;
      const step = w + 0.6;
      const z = topSurfaceZAt(p, model, poly[i].x + outward * nx * step, poly[i].y + outward * ny * step);
      if (z === null) continue; // stepped off the plate outline
      checked++;
      expect(z).toBeCloseTo(0, 6);
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('runs continuously along the body through the cap recurve bands', () => {
    // The artifact this exists to prevent: a straight seam ringing both caps,
    // where the crown dropped below plate level and the station stopped being
    // solved, leaving flat land where a shallow dish belonged. It shows up as a
    // step along y — not in the section at any one station, each of which
    // looked perfectly reasonable on its own.
    //
    // A plain jump threshold will not do. Near the caps the channel runs almost
    // *across* the body, so stepping in y traverses the gouge section
    // transversely and picks up its full flank slope; those steps are real
    // geometry. What separates a slope from a seam is refinement — halving the
    // step halves a slope's jump and leaves a discontinuity untouched.
    const p = gougedParams();
    const model = buildGougedPlateSurfaceModel(p, 'top')!;

    const xs = [0, 20, 40, 60];
    // One stationChordsAt per row, shared across the x samples — the same
    // hoisting every real consumer does, and without it the gouged solve reruns
    // per point and this takes minutes.
    const maxJumps = (step: number): number[] => {
      const worst = xs.map(() => 0);
      const prev: (number | null)[] = xs.map(() => null);
      for (let y = 4; y <= p.height - 4; y += step) {
        const chords = stationChordsAt(p, model, y);
        xs.forEach((x, i) => {
          const z = topSurfaceZAt(p, model, x, y, chords);
          if (z === null) { prev[i] = null; return; }
          const before = prev[i];
          if (before !== null) worst[i] = Math.max(worst[i], Math.abs(z - before));
          prev[i] = z;
        });
      }
      return worst;
    };

    const coarse = maxJumps(0.5);
    const fine = maxJumps(0.125);
    // A quarter of the step should give about a quarter of the jump. Anything
    // that refuses to shrink is a step in the surface itself.
    xs.forEach((_, i) => expect(fine[i]).toBeLessThan(coarse[i] * 0.4));
  });

  it('crowns on the centerline at essentially the height the section reports', () => {
    // Not exactly, and deliberately so. The height field parameterizes the arch
    // by true distance to the channel rather than by the station chord, which
    // is what makes the handover seamless. Where the channel curves away — the
    // waist especially — the nearest channel point is slightly closer than the
    // chord suggests, so the crown reads a hair low. On a violin that is a few
    // hundredths of a millimetre against a 15mm arch.
    const p = gougedParams();
    const model = buildGougedPlateSurfaceModel(p, 'top')!;
    const y = p.height / 2;
    const z = topSurfaceZAt(p, model, 0, y)!;
    expect(z).toBeGreaterThan(0);
    expect(z).toBeCloseTo(stationChordsAt(p, model, y).gougedSection!.zAt(0), 1);
  });

  it('exports an STL through the same builder the classic model uses', () => {
    // buildPlateStl only ever asks the model for heights, so it needs no
    // knowledge of which model filled them in. That is the whole point of
    // attaching the gouged geometry to a PlateSurfaceModel rather than
    // inventing a parallel type for it.
    const p = gougedParams();
    const buf = buildPlateStl(p, buildGougedPlateSurfaceModel(p, 'top')!, 'top', 2);
    const triCount = new DataView(buf).getUint32(80, true);
    expect(triCount).toBeGreaterThan(1000);
    expect(buf.byteLength).toBe(84 + triCount * 50);
  });

  it('leaves the classic model untouched', () => {
    // The safety argument for shipping both at once: buildPlateSurfaceModel
    // never grows a gouged block, so the exports and physical templates cannot
    // drift onto the new geometry while it is still being settled.
    const p = gougedParams();
    expect(buildPlateSurfaceModel(p, 'top')!.gouged).toBeUndefined();
  });
});
