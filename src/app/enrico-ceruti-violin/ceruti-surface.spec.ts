import { flutingProfileZ, pathsBounds } from '../helpers/svgPathMath';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams, longArchHeightAt } from './ceruti-arching';
import {
  buildPlateStl, buildPlateSurfaceModel, calculateCrossArchTemplates, calculateFlutingSectionTop, trimProfileToTroughs,
  calculateLongArchTemplates, computeArchContours, computeArchSectionProfile, crossArchTemplateStations,
  stationChordsAt, topSurfaceZAt, PlateSurfaceModel, buildGougedPlateSurfaceModel,
  computeArchContourRings,
} from './ceruti-surface';
import {
  defaultGougedCrossParams, defaultGougedFlutingParams, gougedCenterlineZAt, gougedCrossSectionAt,
  gougeHalfWidth, solveGougedLongArch,
} from './ceruti-gouged';
import { DefaultParams, EnricoCerutiParams } from './ceruti-types';

/** A polyline path's own vertices — not re-sampled, so a cut point stays where it was put. */
function polyline(path: string): Array<{ x: number; y: number }> {
  return [...path.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map(m => ({ x: +m[1], y: +m[2] }));
}

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

  it('cuts a template at every body landmark, up the body in order', () => {
    const stations = crossArchTemplateStations(p, p.arching!.top);
    expect(stations.map(s => s.code)).toEqual(['LB', 'LC', 'C', 'UC', 'UB']);
    for (let i = 1; i < stations.length; i++) {
      expect(stations[i].y).toBeGreaterThan(stations[i - 1].y);
    }
    // Every one of them is a real interior station with an arch over it.
    for (const s of stations) {
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(p.height);
    }
  });

  it('adds a blank for an authored station, but not for one already on a landmark', () => {
    const plate = p.arching!.top;
    const landmarks = crossArchTemplateStations(p, plate);
    // Between two landmarks, so it is nowhere near either.
    const between = Math.round((landmarks[0].y + landmarks[1].y) / 2);
    const onLandmark = landmarks[2].y;
    plate.gougedCross = {
      ...defaultGougedCrossParams(),
      stations: [
        { ...defaultGougedCrossParams(), y: between },
        { ...defaultGougedCrossParams(), y: onLandmark },
      ],
    };

    const stations = crossArchTemplateStations(p, plate);
    expect(stations.length).toBe(landmarks.length + 1);
    expect(stations.filter(s => s.y === between)).toEqual([{ y: between, code: '' }]);
    // The one sitting on a landmark contributed nothing beyond the landmark itself.
    expect(stations.filter(s => s.y === onLandmark).length).toBe(1);
  });

  it('builds one closed, labeled blank per station per plate side', () => {
    const shapes = calculateCrossArchTemplates(p);
    expect(shapes.length).toBe(10);
    for (const s of shapes) {
      expect(s.path.trim().endsWith('Z')).toBe(true);
      expect(s.label).toMatch(/^(Top|Back) (LB|LC|C|UC|UB) \d+mm$/);
    }
    expect(shapes.some(s => s.label.startsWith('Top'))).toBe(true);
    expect(shapes.some(s => s.label.startsWith('Back'))).toBe(true);
  });

  it('gives each plate its own stations rather than pooling them', () => {
    const landmarks = crossArchTemplateStations(p, p.arching!.top);
    p.arching!.bottom.gougedCross = {
      ...defaultGougedCrossParams(),
      stations: [{ ...defaultGougedCrossParams(), y: Math.round((landmarks[0].y + landmarks[1].y) / 2) }],
    };
    const shapes = calculateCrossArchTemplates(p);
    expect(shapes.filter(s => s.label.startsWith('Back')).length).toBe(landmarks.length + 1);
    expect(shapes.filter(s => s.label.startsWith('Top')).length).toBe(landmarks.length);
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

  it('cuts a profile at the trough on each side of the peak, keeping the middle', () => {
    // A hand-made profile with everything the real ones have and nothing else:
    // flat land, a trough, a hump, a second and deeper trough, flat land. The
    // second trough is the deeper one deliberately — a single global minimum
    // would find only that, and the two channels are free to differ.
    const shape = [0, 0, 0, -1, -2, -1, 0, 3, 5, 3, 0, -1, -3, -1, 0, 0, 0];
    const profile = shape.map((z, i) => `${i === 0 ? 'M' : 'L'} ${i} ${100 + z}`).join(' ');
    const pts = polyline(trimProfileToTroughs(profile, 100, 'y', 1)!);

    // Exactly the vertices it identified — the cut lands on a sample, not near
    // one, which is what makes the end tangent the trough's own.
    expect(pts[0]).toEqual({ x: 4, y: 98 });
    expect(pts[pts.length - 1]).toEqual({ x: 12, y: 97 });
    expect(Math.max(...pts.map(q => q.y))).toBe(105);
  });

  it('reads the trough off the surface, so a back plate cuts the same as a top', () => {
    // Same shape mirrored: on the back plate the wood's low point is the canvas
    // high point, and a trim that went by canvas coordinates would cut at the
    // peak instead.
    const shape = [0, 0, -1, -2, -1, 0, 3, 5, 3, 0, -1, -2, -1, 0, 0];
    const mirrored = shape.map((z, i) => `${i === 0 ? 'M' : 'L'} ${i} ${100 - z}`).join(' ');
    const pts = polyline(trimProfileToTroughs(mirrored, 100, 'y', -1)!);
    expect(pts[0].x).toBe(3);
    expect(pts[pts.length - 1].x).toBe(11);
  });

  it('ends every cross-arch blank flat, at the full depth of the gouge', () => {
    // The property that says the cut reached the trough rather than stopping
    // somewhere up the flank: the bottom of the gouge's arc is where its tangent
    // is horizontal, so a blank still on a grade at its end has not got there.
    // Checked at the corners as much as the bouts — placing the cut
    // arithmetically instead (channel half-chord plus gouge half-width) is right
    // along a bout and wrong at a corner, where the surface reads its position
    // off a distance field rather than off the chord.
    const gouge = defaultGougedFlutingParams(p);
    for (const key of ['top', 'bottom'] as const) {
      const model = buildGougedPlateSurfaceModel(p, key)!;
      for (const { y } of crossArchTemplateStations(p, p.arching![key])) {
        const swept = computeArchSectionProfile(p, model, y, 0.25)!;
        const pts = polyline(trimProfileToTroughs(swept, model.zBase, 'y', model.signZ)!);
        const n = pts.length;
        const depth = (pt: { y: number }) => model.signZ * (pt.y - model.zBase);

        // Full gouge depth at both ends — the trough's floor, not the flank.
        expect(depth(pts[0])).toBeCloseTo(-gouge.depth, 2);
        expect(depth(pts[n - 1])).toBeCloseTo(-gouge.depth, 2);
        // And flat there. Measured as a secant over two samples, which on a
        // curve through its own minimum is bounded by the sample step over the
        // gouge's radius — hence a tolerance rather than zero.
        for (const [a, b] of [[pts[0], pts[2]], [pts[n - 3], pts[n - 1]]]) {
          expect(Math.abs((b.y - a.y) / (b.x - a.x))).toBeLessThan(0.1);
        }
      }
    }
  });

  it('trims every cross-arch blank clear of the plate edge, corners included', () => {
    // The corners are the case that used to fail. Placing the cut arithmetically
    // — channel half-chord plus gouge half-width — is right along a bout and
    // wrong at a corner, where the surface reads its position off a distance
    // field instead, so the corner blanks came out carrying flats.
    const gouged = buildGougedPlateSurfaceModel(p, 'top')!;
    const blanks = calculateCrossArchTemplates(p);
    for (const { y, code } of crossArchTemplateStations(p, p.arching!.top)) {
      const plateEdge = stationChordsAt(p, gouged, y).outerHalf!;
      const width = pathsBounds([blanks.find(s => s.label === `Top ${code} ${y}mm`)!.path]).width;
      // Cut at the trough, so each side loses the land plus the channel's outer
      // flank — comfortably more than the land alone.
      expect(width).toBeLessThan(2 * (plateEdge - p.outerFlutingDepth!));
      // But still most of the plate: a blank that had collapsed onto the crown
      // would pass the bound above while describing nothing.
      expect(width).toBeGreaterThan(plateEdge);
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

  it('runs the long-arch blank trough to trough, leaving the flat caps out', () => {
    // The trough sits a half-width in from the land edge at each cap, so the
    // blank is that much shorter again than the body between the land edges.
    const gouge = defaultGougedFlutingParams(p);
    const trough = p.outerFlutingDepth! + gougeHalfWidth(gouge.sweepRadius, gouge.depth);
    // Closed against the x axis, so the strip's length is its y extent. Within
    // a sampling step rather than exactly — closeProfileToBlank re-samples at
    // fixed arc length, and its last step lands short of the true endpoint.
    for (const s of calculateLongArchTemplates(p)) {
      expect(Math.abs(pathsBounds([s.path]).height - (p.height - 2 * trough))).toBeLessThanOrEqual(0.5);
    }
  });

  it('carries the centerline from land edge through the channel and onto the arch', () => {
    const plate = p.arching!.top;
    const gouge = defaultGougedFlutingParams(p);
    const la = solveGougedLongArch(p, plate.arch, gouge)!;
    expect(la).toBeTruthy();
    const z = (y: number) => gougedCenterlineZAt(p, gouge, la, y);

    // Plate level right at the land edge, and full depth at the channel's
    // trough. The first is what makes the land edge the right place to end the
    // blank: the channel's outer flank arrives there with nothing left to
    // describe, so everything beyond is the flat the template now omits.
    expect(z(p.outerFlutingDepth!)).toBeCloseTo(0, 9);
    const centerY = p.outerFlutingDepth! + gougeHalfWidth(gouge.sweepRadius, gouge.depth);
    expect(z(centerY)).toBeCloseTo(-gouge.depth, 9);
    // And the arch's own height at the peak, measured from the plate surface.
    expect(z(p.height / 2)).toBeCloseTo(plate.arch.archHeight, 3);

    // The claim the whole model rests on, at the one place a maker would catch
    // it failing: the arch leaves the channel at the same height *and* the same
    // grade, so the template's edge has no step and no kink at the takeoff.
    // Height, as a one-sided pair: the channel branch owns the takeoff itself
    // and the arch branch picks up immediately past it, and both are the solved
    // takeoff depth. Compared *at* the join rather than across it — the curve
    // has real grade here, so straddling it would measure the slope and call it
    // a step.
    expect(z(la.yStart)).toBeCloseTo(-la.takeoff.takeoffDepth, 9);
    expect(z(la.yStart + 1e-6)).toBeCloseTo(-la.takeoff.takeoffDepth, 6);
    // Grade: no kink either. Measured over a short step on each side — the
    // solve matches slope at the join, not curvature, so a long secant on the
    // channel's arc and one on the arch would differ in their second-order
    // terms and read as a kink that isn't there.
    const e = 0.005;
    const slopeIn = (z(la.yStart) - z(la.yStart - e)) / e;
    const slopeOut = (z(la.yStart + e) - z(la.yStart)) / e;
    expect(slopeOut).toBeCloseTo(slopeIn, 2);
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

  it('draws contours from both halves rather than mirroring one', () => {
    // The grid used to sample x >= 0 and mirror, on the grounds that the outline
    // is x-symmetric. The outline is; the surface need not be. A moved crown, an
    // unmirrored control point, or the classic model's own left/right cycloid
    // pair all break it — and the mirror then stamps the treble half onto the
    // bass half, leaving a seam down the joint that is in the picture and not in
    // the height field.
    const centroidOfHighest = (peak: number): number => {
      const p = gougedParams();
      p.arching!.top.gougedCross = { ...defaultGougedCrossParams(), peak };
      const model = buildGougedPlateSurfaceModel(p, 'top')!;
      const levels = computeArchContourRings(p, model, 1, 1);
      const top = levels[levels.length - 1];
      let sum = 0;
      let n = 0;
      for (const ring of top.rings) for (const [x] of ring) { sum += x; n++; }
      return sum / n;
    };

    // A centred crown sits on the joint; a moved one takes its contours with it.
    expect(Math.abs(centroidOfHighest(0.5))).toBeLessThan(1.5);
    expect(centroidOfHighest(0.42)).toBeLessThan(-4);
  }, 20_000);

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
    //
    // Corner pass off, because at a corner the land outboard of the channel is
    // exactly what it carves: the channel bypasses the point, the platform
    // boundary follows it, and the wedge between them is the corner pass's whole
    // job. This is about the reach of the channel's own cut, which is unchanged.
    const p = gougedParams();
    for (const side of ['top', 'bottom'] as const) p.arching![side].gougedFluting!.cornerGouge = false;
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

  describe('corner gouge', () => {
    /**
     * The plate swept twice, corner pass on and off, reduced to what the three
     * tests below need. Memoized: it is the slow part, and all three want the
     * same numbers.
     *
     * Two independently built parameter sets, because the geometry holds a
     * *reference* to the gouge params — flipping the flag on one shared object
     * would move both surfaces and every assertion here would pass vacuously.
     */
    let cache: {
      rows: { y: number; max: number }[];
      added: number;
      maxZWhereChanged: number;
    } | null = null;

    function sweep() {
      if (cache) return cache;
      const pOff = gougedParams();
      for (const side of ['top', 'bottom'] as const) pOff.arching![side].gougedFluting!.cornerGouge = false;
      const off = buildGougedPlateSurfaceModel(pOff, 'top')!;
      const pOn = gougedParams();
      const on = buildGougedPlateSurfaceModel(pOn, 'top')!;

      const rows: { y: number; max: number }[] = [];
      let added = 0;
      let maxZWhereChanged = -Infinity;
      for (let y = 4; y < pOn.height - 4; y += 2) {
        const cOff = stationChordsAt(pOff, off, y);
        const cOn = stationChordsAt(pOn, on, y);
        let max = 0;
        for (let x = -120; x <= 120; x += 0.5) {
          const a = topSurfaceZAt(pOff, off, x, y, cOff);
          const b = topSurfaceZAt(pOn, on, x, y, cOn);
          if (a === null || b === null) continue;
          if (b > a + 1e-9) added++;
          if (Math.abs(b - a) > 1e-6) maxZWhereChanged = Math.max(maxZWhereChanged, a);
          max = Math.max(max, Math.abs(b - a));
        }
        rows.push({ y, max });
      }
      return (cache = { rows, added, maxZWhereChanged });
    }

    /** Even-odd crossing test, matching how the height field classifies land against channel. */
    function insideLandCrossings(x: number, xs: number[]): boolean {
      let count = 0;
      for (const c of xs) if (c > x) count++;
      return count % 2 === 1;
    }

    /** How far a station sits from the nearer corner, which is where the pass is expected to bite. */
    function fromCorner(p: EnricoCerutiParams, y: number): number {
      const ys = [p.bouts.UCr!.y, p.bouts.LCr!.y];
      return Math.min(...ys.map(c => Math.abs(y - c)));
    }

    it('only ever removes wood, and never above the plate surface', () => {
      // Both halves of the claim that lets this run after the channel is
      // settled. A second pass of a gouge can deepen and nothing else, so the
      // composition is a minimum; and it is called only from the channel-side
      // returns, so nothing standing proud of the plate — the whole arch — is
      // reachable by it. The takeoff and every station's section are decided
      // before this runs and cannot be moved by it.
      const { added, maxZWhereChanged } = sweep();
      expect(added).toBe(0);
      expect(maxZWhereChanged).toBeLessThanOrEqual(0);
    });

    it('changes nothing along the flanks, where the two loops are the same curve', () => {
      // The reason the pass needs no blend band and no weight. Away from the
      // corners the platform boundary and the channel's outer loop coincide, so
      // the second cut finds exactly what the first one left and the minimum is
      // inert. The residual is polyline sampling — both loops are sampled at
      // roughly 1 mm and a chord sits inside its arc — not geometry.
      const p = gougedParams();
      const flanks = sweep().rows.filter(r => fromCorner(p, r.y) > 30);
      expect(flanks.length).toBeGreaterThan(100);
      expect(Math.max(...flanks.map(r => r.max))).toBeLessThan(0.01);
    });

    it('leaves no ridge of untouched wood between the two runs', () => {
      // The defect this replaced. One pass anchored on the boundary and one on
      // the channel, with the corner wedge wider than the two of them, left a
      // ridge standing in between — merged near the point, opening to about 5 mm
      // of full-height plate further back, which is what a maker would look at
      // and reach for the gouge again.
      //
      // Measured as a flat *patch* rather than a flat sample: the arch crosses
      // plate level on its way down to the channel, so isolated samples at zero
      // are expected on every station and mean nothing. A ridge is wide.
      const widestFlatPatch = (cornerGouge: boolean): number => {
        const p = gougedParams();
        for (const side of ['top', 'bottom'] as const) p.arching![side].gougedFluting!.cornerGouge = cornerGouge;
        const model = buildGougedPlateSurfaceModel(p, 'top')!;
        const depth = p.arching!.top.gougedFluting!.depth;
        const step = 0.25;
        let widest = 0;
        for (const corner of [p.bouts.UCr!.y, p.bouts.LCr!.y]) {
          for (let y = corner - 24; y <= corner + 24; y += 1) {
            const chords = stationChordsAt(p, model, y);
            let run = 0;
            for (let x = 1; x <= 120; x += step) {
              // Inside the platform boundary and clear of its walls, where the
              // gouge's own flank is legitimately close to plate level.
              const clear = insideLandCrossings(x, chords.landCrossings)
                && Math.min(...chords.landCrossings.map(c => Math.abs(c - x))) > 1.5;
              const z = clear ? topSurfaceZAt(p, model, x, y, chords) : null;
              // Above plate level is the arch, which is not this pass's business.
              run = z !== null && z <= 0.02 && z > -0.05 * depth ? run + step : 0;
              widest = Math.max(widest, run);
            }
          }
        }
        return widest;
      };

      // Off, the wedge is simply left: several millimetres of flat plate between
      // the channel and the land. On, nothing survives but the zero crossing.
      expect(widestFlatPatch(false)).toBeGreaterThan(3);
      expect(widestFlatPatch(true)).toBeLessThan(1.5);
    });

    it('carves the corner wedge to the full depth of the gouge', () => {
      // The corner is where the channel bypasses and the platform boundary
      // follows, so the wedge between them is untouched wood under the channel
      // pass alone. Cut to depth here, which is what a maker takes it to.
      const p = gougedParams();
      const depth = p.arching!.top.gougedFluting!.depth;
      for (const corner of [p.bouts.UCr!.y, p.bouts.LCr!.y]) {
        const band = sweep().rows.filter(r => Math.abs(r.y - corner) <= 12);
        expect(Math.max(...band.map(r => r.max))).toBeGreaterThan(0.9 * depth);
      }
    });
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
    // Walks the whole body twice at 0.125mm, solving a section per station —
    // a root-find per side each time. Slow on purpose: the refinement is what
    // separates a real slope from a seam, and coarsening it would blunt exactly
    // the thing being measured.
  }, 20_000);

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
