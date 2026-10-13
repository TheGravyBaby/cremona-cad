// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { templateKeys, templateViolin } from '../enrico-ceruti-violin/ceruti-fixtures';
import { calculateCenterBout, calculateCorners, calculateFholeContours, calculateMould, calculateOuterArcs } from '../enrico-ceruti-violin/calculation/outline/ceruti-calcs';
import { defineInsetPath, defineOneFholePath, fingerboardEnd as cerutiBoardEnd, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from '../enrico-ceruti-violin/calculation/outline/ceruti-paths';
import { defaultFHolePlacement } from '../enrico-ceruti-violin/panels/f-hole-placement-panel/f-hole-placement-panel';
import { channelPaths, crossArchSectionAt, defaultCrossArchParams, defaultFlutingParams, solveLongArch as cerutiLongArch } from '../enrico-ceruti-violin/calculation/arching/ceruti-arch-geometry';
import { bodyLandmarks as cerutiLandmarks, defaultArchingParams, solveRibTaper as cerutiRibTaper } from '../enrico-ceruti-violin/calculation/arching/ceruti-arching';
import { buildPlateSurfaceModel, stationChordsAt, topSurfaceZAt } from '../enrico-ceruti-violin/calculation/arching/ceruti-surface';
import { calculateNeck, defaultNeckParams, defaultStringSetup, fingerboardCrown as cerutiCrown, heelStands, heelFace as cerutiHeelFace, lowerThicknessLine, mortiseFingerboardIntersect, plateEdgeAtNeck, buttonTip } from '../enrico-ceruti-violin/calculation/neck/ceruti-neck';
import { NeckParams as CerutiNeck, ScrollParams as CerutiScroll, StringSetup as CerutiStringSetup, VoluteStyle } from '../enrico-ceruti-violin/ceruti-types';
import { calculateScroll, calculateScrollWidths, defaultVoluteParams, pegboxCavity as cerutiCavity, scrollPathStretches as cerutiStretches, scrollWidthStations as cerutiStations } from '../enrico-ceruti-violin/calculation/neck/ceruti-scroll';
import { scrollBackViewStrokes as cerutiBackView, scrollFrontViewStrokes as cerutiFrontView } from '../enrico-ceruti-violin/calculation/neck/ceruti-scroll-views';
import { ArchCurve, ArchingParams as CerutiArching, CrossArchShape, EnricoCerutiParams, FholeParams, FlutingParams } from '../enrico-ceruti-violin/ceruti-types';
import { Arc, Pt, Pt3D, Rectangle } from '../models/types';
import { signedRadianDelta, TURN } from '../helpers/math/simpleGeometry';
import { samplePathToPolyline, splitPathStrings } from '../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../helpers/math/vibeMath';
import { solveMainBoutsRatios, solveMainBouts } from './panels/main-bouts-panel/main-bouts-panel';
import { solveCorners, solveCornersRatios } from './panels/corners-panel/corners-panel';
import { solveCenterBout, solveCenterBoutRatios } from './panels/center-bout-panel/center-bout-panel';
import { solveOuterContour } from './panels/outer-contour-panel/outer-contour-panel';
import { solveFluting } from './panels/fluting-panel/fluting-panel';
import { FHolePlacementPanel } from './panels/fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel, solveFholeContours } from './panels/fhole-contours-panel/fhole-contours-panel';
import { solveLongArching } from './panels/long-arching-panel/long-arching-panel';
import { bodyLandmarks, rowAt, sectionAt, solveCrossArching, surfaceZAt } from './panels/cross-arching-panel/cross-arching-panel';
import { NeckPanel, solveNeck } from './panels/neck-panel/neck-panel';
import { VolutePanel } from './panels/volute-panel/volute-panel';
import { solveScroll } from './panels/scroll-panel/scroll-panel';
import { fingerboardCrown, solveStringSetup, StringSetupPanel } from './panels/string-setup-panel/string-setup-panel';
import { MOULD_EXPORT_STEP, MouldPanel, solveMould } from './panels/mould-panel/mould-panel';
import { pegboxCavity, scrollBackViewStrokes, scrollFrontViewStrokes, scrollPathStretches, scrollWidthStations, solveScrollWidths } from './panels/scroll-widths-panel/scroll-widths-panel';
import { ArchingParams, MouldParams, NeckParams, ScrollParams, StringSetupParams, CrossArchParams, CrossShapeParams, FholeArcKey, FholeContourParams, FholePlacementParams, GougeParams, LongArchParams, ViolinFamilyParams } from './violin-family-types';

// The port's acceptance test: every frozen Ceruti instrument, solved by both recipes from the same
// inputs, gives the same arcs and reads the same ratios. Goes when the Ceruti recipe does.

// Ceruti stored each plate corner arc's end; here that end is typed as how far it runs on past the
// rib arc's, along the rib arc's own travel
const cutoff = (inner: Arc | null | undefined, outer: Arc | null | undefined): number =>
  inner && outer ? Math.sign(signedRadianDelta(inner.end - inner.start)) * signedRadianDelta(outer.end - inner.end) / TURN.degree : 0;

// Ceruti's second gouge is on when its sweep is set; here the sweep stays typed under a toggle
const gouge = (g: FlutingParams): GougeParams =>
  ({ sweepRadius: g.sweepRadius, depth: g.depth, cBoutSweep: g.sweepRadius_cBout ?? g.sweepRadius, useCBoutGouge: g.sweepRadius_cBout !== null });

// Ceruti's angles are radians on the arcs; here they are degrees in the fields. Rounded to a
// billionth of a degree so a stored quarter turn reads back as exactly 90 and compares the same
// way against the apex it is tested at
const degrees = (radians: number): number => Math.round(radians / TURN.degree * 1e9) / 1e9;

// the placement as Ceruti holds it, once its stem is there (a fixture may carry eyes alone)
const placement = (f: FholeParams | undefined): FholePlacementParams | undefined => f?.stem?.center ? {
  UEye: { x: f.UEye!.x, y: f.UEye!.y, r: f.UEye!.r },
  LEye: { x: f.LEye!.x, y: f.LEye!.y, r: f.LEye!.r },
  URise: f.URise!,
  LRise: f.LRise!,
  stem: { center: { x: f.stem.center.x, y: f.stem.center.y }, width: f.stem.width!, angle: degrees(f.stem.angle!) },
} : undefined;

// the contours as Ceruti holds them, once solved at least once: the radii and ends it keeps on
// the arcs, read before a re-solve moves anything else
const contours = (c: EnricoCerutiParams): FholeContourParams | undefined => {
  let f = c.fHoles;
  if (!f?.U1 || !f.S1) return undefined;
  return {
    U1R: f.U1.r, U1End: degrees(f.U1.end), U2R: f.U2!.r,
    U21DoubleArc: !!c.options.U21DoubleArc, U21R: f.U21?.r ?? f.U2!.r, U21Start: degrees(f.U21?.start ?? 0),
    U3R: f.U3!.r, U3End: degrees(f.U3!.end),
    UCut: { angleOnEye: degrees(f.UCut!.angleOnEye!), slope: degrees(f.UCut!.slope!), length: f.UCut!.length! },
    L1R: f.L1!.r, L1End: degrees(f.L1!.end), L2R: f.L2!.r,
    L21DoubleArc: !!c.options.L21DoubleArc, L21R: f.L21?.r ?? f.L2!.r, L21Start: degrees(f.L21?.start ?? 0),
    L3R: f.L3!.r, L3End: degrees(f.L3!.end),
    LCut: { angleOnEye: degrees(f.LCut!.angleOnEye!), slope: degrees(f.LCut!.slope!), length: f.LCut!.length! },
    stemArcR: f.stem.arcR!, stemArcsIndependent: !!c.options.stemArcsIndependent,
    S1R: f.S1.r, S2R: f.S2!.r, S3R: f.S3!.r, S4R: f.S4!.r,
  };
};

// Ceruti's fractions are percent here, rounded to a billionth so 0.66 reads back as 66 and not a
// hair over; a point's signed per-side fraction becomes a position across the whole plate
const pct = (f: number): number => Math.round(f * 100 * 1e9) / 1e9;

const longArch = (arch: ArchCurve): LongArchParams => {
  if (arch.type === 'cycloid') throw new Error('no fixture carries a cycloid long arch');
  return arch.type === 'spline'
    ? { type: 'spline', height: arch.archHeight, peak: pct(arch.peak ?? 0.5), points: arch.points.map(pt => ({ t: pct(pt.t), z: pt.z, mirror: !!pt.mirror })) }
    : { type: 'catenary', height: arch.archHeight, peak: 50, points: [] };
};

const crossShapeOf = (shape: CrossArchShape): CrossShapeParams => ({
  d: shape.type === 'cycloid' ? pct(shape.d) : 40,
  pct: shape.type === 'cycloid' ? pct(shape.pct) : 90,
  peak: shape.type === 'spline' ? pct(shape.peak ?? 0.5) : 50,
  points: shape.type === 'spline' ? shape.points.map(pt => ({ x: 50 + pct(pt.x) / 2, z: pct(pt.z), mirror: !!pt.mirror })) : [],
});

const crossArch = (shape: CrossArchShape): CrossArchParams => ({
  type: shape.type,
  ...crossShapeOf(shape),
  stations: (shape.type === 'catenary' ? [] : shape.stations ?? []).map(st => ({ y: st.y!, ...crossShapeOf(st as CrossArchShape) })),
});

// Ceruti seeds a plate's crown lazily, so a fixture without one takes the default it would get
const arching = (a: CerutiArching): ArchingParams => ({
  ribHeightLower: a.ribHeightLower,
  ribHeightUpper: a.ribHeightUpper,
  top: { thickness: a.top.thickness, arch: longArch(a.top.arch), cross: crossArch(a.top.cross ?? defaultCrossArchParams()) },
  back: { thickness: a.bottom.thickness, arch: longArch(a.bottom.arch), cross: crossArch(a.bottom.cross ?? defaultCrossArchParams()) },
});

// Ceruti keeps the heel as an arc whose radius is typed and the angle in radians
const neck = (n: CerutiNeck): NeckParams => ({
  length: n.length, angle: degrees(n.angle), upperThickness: n.upperThickness, lowerThickness: n.lowerThickness,
  topWidth: n.topWidth, rootWidth: n.rootWidth, heelRadius: n.heel.r, mortiseDepth: n.mortiseDepth, overstand: n.overstand,
  nutHeight: n.nutHeight, nutWidth: n.nutWidth,
});

// Ceruti keeps the solved points on the setup beside the typed numbers
const stringSetup = (ss: CerutiStringSetup): StringSetupParams => ({
  bodyStop: ss.bodyStop, bridgeHeight: ss.bridgeHeight, nutThickness: ss.nutThickness,
  fingerboardLength: ss.fingerboardLength, fingerboardThickness: ss.fingerboardThickness, fingerboardRadius: ss.fingerboardRadius,
});

// Ceruti's scroll keeps its arcs whole, the radius and end typed and the rest solved onto them;
// here only the radius and end are typed, the end in degrees
const scroll = (v: CerutiScroll): ScrollParams => ({
  style: v.style, eye: { x: v.eye.x, y: v.eye.y, r: v.eye.r }, fitToNeck: v.flushWithNeck,
  pitch: v.pitch, seedLength: v.seedLength, arcRadii: [...v.arcRadii],
  S0R: v.S0.r, S0End: degrees(v.S0.end), S1R: v.S1.r, S1End: degrees(v.S1.end), S2R: v.S2.r, S2End: degrees(v.S2.end),
  backStraight: v.backStraight, S3R: v.S3.r, hang: v.hang, napeR: v.nape.r, napeCircle: v.napeCircle,
  flat: v.flat, F0R: v.F0.r, F0End: degrees(v.F0.end), frontStraight: v.frontStraight, F1R: v.F1.r,
  widths: { ...v.widths }, hipHeight: v.hipHeight, backHipHeight: v.backHipHeight, wall: v.pegbox.wall,
});

function fromCeruti(c: EnricoCerutiParams): ViolinFamilyParams {
  let V0 = c.viol?.V0;
  let b = c.bouts;
  let oc = c.outerCorners;
  return {
    body: { height: c.height, width: b.LBW!, overhang: c.overhang, rib: c.rib },
    bouts: {
      UBW: b.UBW!,
      U0R: b.U0!.r,
      U1R: b.U1!.r,
      L0R: b.L0!.r,
      L1R: b.L1!.r,
      useViolNeck: c.options.useViolNeck,
      viol: V0 ? { width: c.viol.width!, neckRadius: c.viol.neckRadius ?? 0, V0R: V0.r, V0Start: V0.start / TURN.degree, V0End: V0.end / TURN.degree } : null,
      CBW: b.CBW!,
      C0R: b.C0!.r,
      C0Y: b.C0!.y,
      useKellyC0: c.options.useKellyC0,
    },
    // a solved Ceruti compound arc's start is the split direction it was solved at, so it reads
    // straight across as the authored angle
    corners: {
      UCr: { x: b.UCr!.x, y: b.UCr!.y },
      LCr: { x: b.LCr!.x, y: b.LCr!.y },
      U2R: b.U2!.r,
      U3R: b.U3!.r,
      U31R: b.U31!.r,
      U31Start: b.U31!.start / TURN.degree,
      U31DoubleArc: c.options.U31DoubleArc,
      useViolCornerUC: c.options.useViolCornerUC,
      L2R: b.L2!.r,
      L3R: b.L3!.r,
      L31R: b.L31!.r,
      L31Start: b.L31!.start / TURN.degree,
      L31DoubleArc: c.options.L31DoubleArc,
      useViolCornerLC: c.options.useViolCornerLC,
      C2R: b.C2!.r,
      C21R: b.C21!.r,
      C21Start: b.C21!.start / TURN.degree,
      C21DoubleArc: c.options.C21DoubleArc,
      C1R: b.C1!.r,
      C11R: b.C11!.r,
      C11Start: b.C11!.start / TURN.degree,
      C11DoubleArc: c.options.C11DoubleArc,
    },
    outerContour: {
      button: { width: c.button!.width, height: c.button!.height },
      purflingOffset: c.purflingOffset!,
      purflingChannelDepth: c.purflingChannelDepth!,
      U3Cutoff: cutoff(b.U3, oc.U3),
      U31Cutoff: cutoff(b.U31, oc.U31),
      C2Cutoff: cutoff(b.C2, oc.C2),
      C21Cutoff: cutoff(b.C21, oc.C21),
      C1Cutoff: cutoff(b.C1, oc.C1),
      C11Cutoff: cutoff(b.C11, oc.C11),
      L3Cutoff: cutoff(b.L3, oc.L3),
      L31Cutoff: cutoff(b.L31, oc.L31),
      upperRounding: c.options.ucCornerSharpness ?? 0,
      lowerRounding: c.options.lcCornerSharpness ?? 0,
    },
    // Ceruti seeds a plate's gouge lazily, so a fixture without one takes the default it would get
    fluting: {
      flutingEdge: c.outerFlutingDepth ?? c.overhang * 0.5,
      cornerGouge: c.arching?.top.fluting?.cornerGouge ?? true,
      top: gouge(c.arching?.top.fluting ?? defaultFlutingParams(c)),
      back: gouge(c.arching?.bottom.fluting ?? defaultFlutingParams(c)),
    },
    fHoles: placement(c.fHoles),
    fHoleContours: contours(c),
    arching: c.arching ? arching(c.arching) : undefined,
    neck: c.neck ? neck(c.neck) : undefined,
    scroll: c.scroll ? scroll(c.scroll) : undefined,
    stringSetup: c.stringSetup ? stringSetup(c.stringSetup) : undefined,
  };
}

// the ribs, each plate's long arch and its carved surface, both recipes from the same Ceruti
// instrument. The arch solves to a millionth: its inputs are the same numbers. The surface is read
// off channel loops sampled every millimetre from paths that agree to a micron but start at
// different points, so a half chord can differ by a chord's sagitta; a hundredth covers it
const sameArching = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const ours = solveLongArching(p)!;
  expect(ours.failures.filter(f => f.unsolved.length)).toEqual([]);
  const ribs = cerutiRibTaper(c);
  for (const k of ['zLower', 'zUpper', 'angle'] as const) expect(ours.ribs![k], k).toBeCloseTo(ribs[k], 9);

  for (const [plate, theirsKey] of [['top', 'top'], ['back', 'bottom']] as const) {
    const plateParams = c.arching![theirsKey];
    const theirs = cerutiLongArch(c, plateParams.arch, plateParams.fluting ??= defaultFlutingParams(c))!;
    const la = ours[plate]!;
    expect(la.span, `${plate} span`).toBeCloseTo(theirs.span, 6);
    expect(la.yStart, `${plate} yStart`).toBeCloseTo(theirs.yStart, 6);
    expect(la.yEnd, `${plate} yEnd`).toBeCloseTo(theirs.yEnd, 6);
    for (const [end, label] of [['takeoff', 'takeoff'], ['farTakeoff', 'far takeoff']] as const) {
      expect(la[end].contactS, `${plate} ${label}`).toBeCloseTo(theirs[end].contactS, 6);
      expect(la[end].takeoffDepth, `${plate} ${label} depth`).toBeCloseTo(theirs[end].takeoffDepth, 6);
      expect(la[end].tangent, `${plate} ${label} tangent`).toBe(theirs[end].tangent);
    }
  }
};

// the neck in the side elevation, both recipes from the same instrument. Ceruti's solve writes its
// points onto the neck, so it runs after the params are read across
const sameNeck = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveNeck(p)!;
  const top = c.arching!.top;
  calculateNeck(c, cerutiLongArch(c, top.arch, top.fluting ??= defaultFlutingParams(c)), top.fluting);
  const n = c.neck!;
  const near = (a: Pt | null, b: Pt | null | undefined, label: string) => {
    expect(a, `${label} solved`).not.toBeNull();
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y), label).toBeLessThan(1e-6);
  };
  near(s.root, n.root, 'root');
  near(s.neckTop, n.neckTop, 'nut');
  near(s.backNut, n.backNut, 'back at the nut');
  near(s.backRoot, n.backRoot, 'back at the root');
  near(s.plateAtMortise, n.plateAtMortise, 'plate at the mortise');
  near(s.glue, mortiseFingerboardIntersect(c), 'mortise floor on the fingerboard plane');
  near(s.plateEdge, plateEdgeAtNeck(c), 'plate edge');
  near(s.tip, buttonTip(c), 'button tip');
  near(s.lowerThickness![0], lowerThicknessLine(c)[0], 'lower thickness, front');
  near(s.lowerThickness![1], lowerThicknessLine(c)[1], 'lower thickness, back');
  expect(!!s.heel, 'heel stands').toBe(heelStands(c));
  if (s.heel) sameArc(s.heel, n.heel, 'heel');
  const face = cerutiHeelFace(c);
  expect(!!s.heelFace, 'heel face').toBe(!!face);
  if (face) near(s.heelFace![0], face[0], 'heel face');
};

// the string setup over the neck, both recipes from the same instrument; Ceruti's neck solve writes
// the setup's points too. Its failures name the field, ours the part
const sameStringSetup = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveStringSetup(p)!;
  const top = c.arching!.top;
  const theirs = calculateNeck(c, cerutiLongArch(c, top.arch, top.fluting ??= defaultFlutingParams(c)), top.fluting);
  const ss = c.stringSetup!;
  const near = (a: Pt | null, b: Pt | null, label: string) => {
    expect(a, `${label} solved`).not.toBeNull();
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y), label).toBeLessThan(1e-6);
  };
  near(s.bridgeFoot, ss.bridgeFoot, 'bridge foot');
  near(s.bridgeTop, ss.bridgeTop, 'bridge top');
  near(s.nutTop, ss.nutTop, 'nut');
  near(s.fingerboardEnd, cerutiBoardEnd(c), 'board end');
  const radiusFails = theirs.some(f => f.unsolved.includes('fingerboardRadius'));
  expect(s.failures.some(f => f.message.startsWith('Fingerboard')), 'radius fails').toBe(radiusFails);
  expect(s.failures.some(f => f.message.startsWith('Nut')), 'nut below the crown').toBe(theirs.some(f => f.unsolved.includes('nutThickness')));
  if (radiusFails) return;
  for (let i = 0; i <= 10; i++) {
    const y = s.neck.neckTop!.y + (s.fingerboardEnd!.y - s.neck.neckTop!.y) * i / 10;
    expect(fingerboardCrown(p, s, y), `crown at ${i}/10`).toBeCloseTo(cerutiCrown(c, y), 9);
  }
};

const near3 = (a: Pt3D, b: Pt3D, label: string) =>
  expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)), label).toBeLessThan(1e-6);

// the scroll's side, both recipes from the same instrument; where the side solves whole, its widths,
// stations, hollow and both views too. Ceruti's solve writes its arcs onto the scroll, so the
// params are read across before it runs
const sameScroll = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const failures = calculateScroll(c);
  const s = solveScroll(p)!;
  expect(s.failures.map(f => f.unsolved), 'failures').toEqual(failures.map(f => f.unsolved));
  const v = c.scroll!;
  if (!s.spiral) return;
  expect(Math.abs(s.eye!.x - v.eye.x), 'eye x').toBeLessThan(1e-9);
  expect(s.spiral.length).toBe(v.spiral!.length);
  s.spiral.forEach((arc, i) => sameArc(arc, v.spiral![i], `spiral ${i}`));
  for (const key of ['S0', 'S1', 'S2', 'S3', 'nape', 'F0', 'F1'] as const) {
    if (failures.some(f => f.unsolved.includes(key))) expect(s[key], key).toBeNull();
    else sameArc(s[key], v[key], key);
  }
  if (failures.length) return;

  calculateScrollWidths(c);
  const w = solveScrollWidths(p)!;
  expect(w.failures, 'widths').toEqual([]);
  const ours = scrollWidthStations(p, s);
  const theirs = cerutiStations(c);
  expect(ours.map(st => st.key)).toEqual(theirs.map(st => st.key));
  ours.forEach((st, i) => {
    expect(Math.hypot(st.at.x - theirs[i].at.x, st.at.y - theirs[i].at.y), `${st.key} station`).toBeLessThan(1e-6);
    expect(st.width, `${st.key} width`).toBeCloseTo(theirs[i].width, 9);
  });
  const stretches = scrollPathStretches(p, s);
  const theirStretches = cerutiStretches(c);
  for (const key of Object.keys(stretches) as (keyof typeof stretches)[]) {
    expect(stretches[key].length, key).toBe(theirStretches[key].length);
    stretches[key].forEach((pt, i) => near3(pt, theirStretches[key][i], `${key} ${i}`));
  }
  const cavity = pegboxCavity(p, s);
  const theirCavity = cerutiCavity(c);
  expect(!!cavity, 'hollow').toBe(!!theirCavity);
  cavity?.forEach((pt, i) => expect(Math.hypot(pt.x - theirCavity![i].x, pt.y - theirCavity![i].y), `hollow ${i}`).toBeLessThan(1e-6));
  const place = (x: number, y: number) => new Pt(x, y);
  for (const [mine, theirView, label] of [
    [scrollBackViewStrokes(p, s, place, -20), cerutiBackView(c, place, -20), 'back view'],
    [scrollFrontViewStrokes(p, s, place, -20), cerutiFrontView(c, place, -20), 'front view'],
  ] as const) {
    for (const part of Object.keys(mine) as (keyof typeof mine)[]) {
      expect(mine[part].length, `${label} ${part}`).toBe(theirView[part].length);
      mine[part].forEach((stroke, i) => {
        const other = theirView[part][i] as any;
        if ('d' in stroke) samePath(stroke.d, other.d, `${label} ${part} ${i}`);
        else expect(JSON.stringify(stroke), `${label} ${part} ${i}`).toBe(JSON.stringify(other));
      });
    }
  }
};

// Ceruti's seeded scroll on the fixture's neck, and ours seeded beside it from the same params
const seededScroll = (key: string, edit: (v: CerutiScroll) => void = () => {}) => {
  const c = templateViolin(key, true);
  c.neck ??= defaultNeckParams(c);
  const p = fromCeruti(c);
  c.scroll = defaultVoluteParams(c);
  VolutePanel.seed(p);
  edit(c.scroll);
  const q = fromCeruti(c);
  // the four point's radii are seeded lazily from Kelly's in Ceruti, up front here
  q.scroll!.arcRadii = c.scroll.arcRadii.length ? q.scroll!.arcRadii : p.scroll!.arcRadii;
  return { c, p, q };
};

const sameSurface = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveCrossArching(p)!;
  expect(s.failures).toEqual([]);
  expect(bodyLandmarks(p)).toEqual(cerutiLandmarks(c));
  for (const [plate, theirsKey] of [['top', 'top'], ['back', 'bottom']] as const) {
    const model = buildPlateSurfaceModel(c, theirsKey)!;
    const surface = s[plate]!;
    const stations = [...cerutiLandmarks(c).map(m => m.y), ...Array.from({ length: 10 }, (_, i) => Math.round(c.height * (i + 0.5) / 10))];
    for (const y of stations) {
      const theirs = crossArchSectionAt(c, model.geometry, y);
      const mine = sectionAt(surface, y);
      expect(!!mine, `${plate} section at ${y}`).toBe(!!theirs);
      if (!theirs || !mine) continue;
      expect(mine.centerHalf, `${plate} ${y} half chord`).toBeCloseTo(theirs.centerHalf, 2);
      expect(mine.xPeak, `${plate} ${y} crown`).toBeCloseTo(theirs.xPeak, 2);
      expect(mine.archH, `${plate} ${y} height`).toBeCloseTo(theirs.archH, 6);
      for (const side of ['left', 'right'] as const) expect(mine[side]!.contactS, `${plate} ${y} ${side} contact`).toBeCloseTo(theirs[side]!.contactS, 2);
      for (let i = 0; i <= 20; i++) {
        const x = -mine.centerHalf + (2 * mine.centerHalf * i) / 20;
        expect(mine.zAt(x), `${plate} ${y} z at ${x.toFixed(1)}`).toBeCloseTo(theirs.zAt(x), 2);
      }
    }
    let compared = 0, offEdge = 0;
    for (let y = 2; y < c.height; y += 5) {
      const chords = stationChordsAt(c, model, y);
      const row = rowAt(surface, y);
      for (let x = -c.width / 2 - 5; x <= c.width / 2 + 5; x += 5) {
        const theirs = topSurfaceZAt(c, model, x, y, chords);
        const mine = surfaceZAt(surface, x, y, row);
        if ((theirs === null) !== (mine === null)) { offEdge++; continue; }
        if (theirs === null || mine === null) continue;
        compared++;
        expect(Math.abs(mine - theirs), `${plate} z at ${x},${y}`).toBeLessThan(0.01);
      }
    }
    expect(compared).toBeGreaterThan(500);
    // a sample within a chord's sagitta of the edge can fall either side of it
    expect(offEdge).toBeLessThan(compared / 100);
  }
};

// to a millionth: the Ceruti fixtures are solved through every outline stage, and its corners
// leave a ~2e-8 residue on U1.end that its main bouts solve would have snapped to 0. Angles
// compare round the circle, since an arc is the same arc a turn later
const sameArc = (a: Arc | null, b: Arc | null | undefined, label: string) => {
  expect(a, `${label} solved`).not.toBeNull();
  for (const k of ['x', 'y', 'r'] as const) {
    expect(Math.abs(a![k] - b![k]), `${label}.${k}`).toBeLessThan(1e-6);
  }
  for (const k of ['start', 'end'] as const) {
    expect(Math.abs(signedRadianDelta(a![k] - b![k])), `${label}.${k}`).toBeLessThan(1e-6);
  }
};

// a path sampled segment by segment, so its own vertices are kept: a sharp kink sampled at equal
// steps along the whole path is cut differently from each side, by more than the tolerance below.
// A segment shorter than a micron draws nothing (Ceruti's channel carries one where a viol flank
// is shorter than the join-back), and the sampler would make NaN of it
const polyline = (d: string): Pt[] => {
  const pts: Pt[] = [];
  let at: Pt | null = null;
  for (const cmd of d.match(/[MLACZ][^MLACZ]*/g) ?? []) {
    const n = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd[0] === 'M') {
      at = { x: n[0], y: n[1] };
      pts.push(at);
      continue;
    }
    if (cmd[0] === 'Z' || !at) continue;
    const to = { x: n[n.length - 2], y: n[n.length - 1] };
    if (Math.hypot(to.x - at.x, to.y - at.y) > 1e-6) pts.push(...samplePathToPolyline(`M ${at.x} ${at.y} ${cmd}`, 0.1, true).slice(1));
    at = to;
  }
  return pts;
};

// two paths are the same curve when every point sampled along either lies on the other, to a
// micron. Sampled finely enough that the chords of the tightest corner arc stay under that
const samePath = (a: string | null, b: string | null, label: string) => {
  expect(a, `${label} drawn`).toBeTruthy();
  expect(b, `${label} drawn by Ceruti`).toBeTruthy();
  const A = polyline(a!);
  const B = polyline(b!);
  const far = (pts: Pt[], onto: Pt[]) => {
    const idx = buildPolylineIndex(onto);
    return Math.max(...pts.map(q => distPointToPolylineIndexed(q, idx)));
  };
  expect(far(A, B), `${label}: ours strays off theirs`).toBeLessThan(1e-3);
  expect(far(B, A), `${label}: theirs strays off ours`).toBeLessThan(1e-3);
};

// Ceruti keeps the blocks as rectangles whose places it rewrites on every solve, and one pad both
// ways; here only the sizes are typed, and the pad is an offset from the corner tip
const mould = (c: EnricoCerutiParams): MouldParams => {
  const b = c.blocks;
  return {
    neckBlock: { width: b.U!.width!, height: b.U!.height! },
    upperCornerBlock: { width: b.CU!.width!, height: b.CU!.height!, pad: { x: b.CUPad!, y: -b.CUPad! } },
    lowerCornerBlock: { width: b.CL!.width!, height: b.CL!.height!, pad: { x: b.CLPad!, y: b.CLPad! } },
    endBlock: { width: b.L!.width!, height: b.L!.height! },
    bitDiameter: c.bitDiameter,
    clampBox: true,
  };
};

const sameRect = (a: Rectangle, b: Rectangle, label: string) => {
  const box = (r: Rectangle) => [Math.min(r.Pt1.x, r.Pt2.x), Math.min(r.Pt1.y, r.Pt2.y), Math.max(r.Pt1.x, r.Pt2.x), Math.max(r.Pt1.y, r.Pt2.y)];
  box(a).forEach((v, i) => expect(Math.abs(v - box(b)[i]), `${label}[${i}]`).toBeLessThan(1e-9));
};

// the blocks and the outline they leave, Ceruti's blocks seeded where the fixture carries none. Its
// simple clamp box comes first in the path, two rectangles; the clamp box here is its own (the
// walls are thicker), so only the outline is compared
const sameMould = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const theirs = splitPathStrings(calculateMould(c, true, true)).slice(2).join(' ');
  p.mould = mould(c);
  const s = solveMould(p, MOULD_EXPORT_STEP)!;
  expect(s.failures.filter(f => f.unsolved.length)).toEqual([]);
  sameRect(s.blocks!.neck, c.blocks.U!, 'neck block');
  sameRect(s.blocks!.upperCorner, c.blocks.CU!, 'upper corner block');
  sameRect(s.blocks!.lowerCorner, c.blocks.CL!, 'lower corner block');
  sameRect(s.blocks!.end, c.blocks.L!, 'end block');
  samePath(s.outline, theirs, 'mould outline');
};

const OUTER_CORNER_KEYS = ['U3', 'U31', 'C2', 'C21', 'C1', 'C11', 'L3', 'L31'] as const;

// the plate edges, purfling and corner arcs, both recipes solved from the same Ceruti instrument
const sameOuterContour = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveOuterContour(p)!;
  const inset = c.overhang + c.rib;
  expect(s.failures).toEqual([]);
  if (!c.options.useViolCornerUC && !c.options.useViolCornerLC) {
    for (const key of OUTER_CORNER_KEYS) {
      expect(!!s.corners[key], `${key} present`).toBe(!!c.outerCorners[key]);
      if (s.corners[key]) sameArc(s.corners[key]!, c.outerCorners[key], key);
    }
  }
  samePath(s.top, defineOuterPath(c, inset, true, false), 'top');
  samePath(s.back, defineOuterPath(c, inset, true, true), 'back');
  samePath(s.purfling, definePurflingPath(c, inset), 'purfling');
  samePath(s.outerPurfling, defineOuterPurflingPath(c, inset), 'outer purfling');
};

// each plate's channel edges and the fluting edge, both recipes from the same Ceruti instrument,
// seeded with the same gouges where the fixture carries none. Where a join grazes the fluting edge
// the two can settle a degree of retreat apart, since Ceruti samples that polygon in path order
// and the phase differs; the centreline, whose C bout runs on the edge, is where that shows under
// viol corners, and its construction is covered by the fixtures' own channels
const sameFluting = (c: EnricoCerutiParams, p = fromCeruti(c), grazing = false) => {
  c.arching ??= defaultArchingParams(c.height);
  const s = solveFluting(p)!;
  for (const [plate, ours] of [['top', s.top], ['bottom', s.back]] as const) {
    const theirs = channelPaths(c, c.arching[plate].fluting ??= defaultFlutingParams(c));
    if (!theirs) {
      expect(ours, `${plate} fails with Ceruti`).toBeNull();
      continue;
    }
    expect(ours, `${plate} channel`).not.toBeNull();
    samePath(ours!.outer, theirs.outer, `${plate} outer edge`);
    if (!grazing) samePath(ours!.center, theirs.center, `${plate} centreline`);
    samePath(ours!.inner, theirs.inner, `${plate} inner edge`);
    expect(ours!.innerEdgeOffset).toBeCloseTo(theirs.innerEdgeOffset, 9);
    expect(ours!.innerEdgeOffset_cBout).toBeCloseTo(theirs.innerEdgeOffset_cBout, 9);
  }
  samePath(s.outerEdge, defineInsetPath(c, c.outerFlutingDepth!), 'fluting edge');
};

const FHOLE_KEYS: FholeArcKey[] = ['U1', 'U2', 'U21', 'U3', 'L1', 'L2', 'L21', 'L3', 'S1', 'S2', 'S3', 'S4'];

// the f-hole's arcs, tips and outline, both recipes from the same placement. Ceruti seeds the
// contours lazily inside its solve, so a fixture without them is seeded on both sides first; where
// Ceruti's solve fails, ours has to fail the same sections
const sameFholes = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const failures = calculateFholeContours(c);
  if (!p.fHoleContours) FHoleContoursPanel.seed(p);
  const s = solveFholeContours(p)!;
  expect(s.failures.map(f => f.unsolved)).toEqual(failures.map(f => f.unsolved));
  if (failures.length) return;
  const f = c.fHoles!;
  for (const key of FHOLE_KEYS) {
    if ((key === 'U21' && !c.options.U21DoubleArc) || (key === 'L21' && !c.options.L21DoubleArc)) continue;
    sameArc(s[key], f[key], key);
  }
  for (const [ours, theirs, label] of [[s.UTip, f.UTip, 'UTip'], [s.LTip, f.LTip, 'LTip']] as const) {
    expect(Math.abs(ours!.x - theirs!.x), `${label}.x`).toBeLessThan(1e-6);
    expect(Math.abs(ours!.y - theirs!.y), `${label}.y`).toBeLessThan(1e-6);
  }
  samePath(s.path, defineOneFholePath(c, false), 'f-hole');
};

// every corner arc the options draw, both recipes solved from the same Ceruti instrument
const sameCorners = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveCorners(p)!;
  const b = c.bouts;
  const o = c.options;
  expect(s.failures).toEqual([]);
  sameArc(s.U1, b.U1, 'U1');
  sameArc(s.L1, b.L1, 'L1');
  sameArc(s.U2, b.U2, 'U2');
  sameArc(s.U3, b.U3, 'U3');
  sameArc(s.L2, b.L2, 'L2');
  sameArc(s.L3, b.L3, 'L3');
  if (o.U31DoubleArc) sameArc(s.U31, b.U31, 'U31');
  if (o.L31DoubleArc) sameArc(s.L31, b.L31, 'L31');
  if (o.useViolCornerUC) sameArc(s.U4, b.U4, 'U4');
  if (o.useViolCornerLC) sameArc(s.L4, b.L4, 'L4');
};

// the C bout and its corner arcs, both recipes solved from the same Ceruti instrument
const sameCenterBout = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveCenterBout(p)!;
  const b = c.bouts;
  expect(s.failures).toEqual([]);
  sameArc(s.C0, b.C0, 'C0');
  sameArc(s.C2, b.C2, 'C2');
  sameArc(s.C1, b.C1, 'C1');
  if (c.options.C21DoubleArc) sameArc(s.C21, b.C21, 'C21');
  if (c.options.C11DoubleArc) sameArc(s.C11, b.C11, 'C11');
  expect(s.CBW).toBeCloseTo(b.CBW!, 6);
};

// a fixture carrying only its eyes gets Ceruti's own placement, as its panel would give it
const withPlacement = (c: EnricoCerutiParams): EnricoCerutiParams => {
  if (!c.fHoles?.stem?.center) c.fHoles = defaultFHolePlacement(c);
  return c;
};

describe.each(templateKeys())('parity with the Ceruti recipe: %s', key => {
  const c = withPlacement(templateViolin(key));
  const p = fromCeruti(c);
  const m = solveMainBouts(p)!;

  it('solves the main bouts to the same arcs', () => {
    expect(m.failures).toEqual([]);
    sameArc(m.U0, c.bouts.U0, 'U0');
    sameArc(m.U1, c.bouts.U1, 'U1');
    sameArc(m.L0, c.bouts.L0, 'L0');
    sameArc(m.L1, c.bouts.L1, 'L1');
    if (c.options.useViolNeck) sameArc(m.V0, c.viol.V0, 'V0');
  });

  it('solves the corners to the same arcs', () => {
    sameCorners(c);
  });

  // no fixture ships with a viol corner, and only some with a compound arc, so each instrument is
  // also re-solved by both recipes with those options turned on. The Violin Family params are
  // read before the Ceruti re-solve: that rewrites the compound arc's start with the handover it
  // found, a micron off the angle it was given. Where that corner is out of reach for the
  // instrument, both recipes have to say so
  it('solves the viol corners to the same arcs', () => {
    const viol = templateViolin(key);
    viol.options.useViolCornerUC = true;
    viol.options.useViolCornerLC = true;
    const p = fromCeruti(viol);
    calculateCorners(viol);
    sameCorners(viol, p);
  });

  it('solves the compound corners to the same arcs, or misses them together', () => {
    const compound = templateViolin(key);
    compound.options.U31DoubleArc = true;
    compound.options.L31DoubleArc = true;
    const p = fromCeruti(compound);
    const failures = calculateCorners(compound);
    if (failures.length) {
      expect(solveCorners(p)!.failures.map(f => f.unsolved)).toEqual(failures.map(f => f.unsolved));
    } else {
      sameCorners(compound, p);
    }
  });

  it('solves the center bout to the same arcs', () => {
    sameCenterBout(c);
  });

  it('solves the compound center bout corners to the same arcs, or misses them together', () => {
    const compound = templateViolin(key);
    compound.options.C21DoubleArc = true;
    compound.options.C11DoubleArc = true;
    const p = fromCeruti(compound);
    const failures = calculateCenterBout(compound);
    if (failures.length) {
      expect(solveCenterBout(p)!.failures.map(f => f.unsolved)).toEqual(failures.map(f => f.unsolved));
    } else {
      sameCenterBout(compound, p);
    }
  });

  // no fixture ships with the fit on. Where Ceruti's fit misses it turns itself off and falls
  // back to a hand-placed C0; here that is a failure, with no fallback
  it('fits C0 to the bouts the same way, or misses it together', () => {
    const fit = templateViolin(key);
    fit.options.useKellyC0 = true;
    const p = fromCeruti(fit);
    calculateCenterBout(fit);
    if (!fit.options.useKellyC0) {
      expect(solveCenterBout(p)!.failures[0].message).toContain('Fit C0 to Bouts');
    } else {
      sameCenterBout(fit, p);
    }
  });

  it('draws the same plates, purfling and corner cutoffs', () => {
    sameOuterContour(c);
  });

  // no fixture ships with a viol corner: both recipes re-solve the instrument with one at each end
  it('draws the same plates with viol corners', () => {
    const viol = templateViolin(key);
    viol.options.useViolCornerUC = true;
    viol.options.useViolCornerLC = true;
    calculateCorners(viol);
    calculateCenterBout(viol);
    calculateOuterArcs(viol);
    sameOuterContour(viol, fromCeruti(viol));
  });

  it('cuts the same fluting channel on each plate', () => {
    sameFluting(c);
  });

  it('cuts the same fluting channel past viol corners', () => {
    const viol = templateViolin(key);
    viol.options.useViolCornerUC = true;
    viol.options.useViolCornerLC = true;
    calculateCorners(viol);
    calculateCenterBout(viol);
    calculateOuterArcs(viol);
    sameFluting(viol, fromCeruti(viol), true);
  });

  it('cuts the same f-holes', () => {
    sameFholes(c);
  });

  // Ceruti seeds a split arm halfway along the arm it last drew; here the seed does the same, so
  // the second half is read off Ceruti's once it has drawn one
  it('cuts the same f-holes with both arms compound', () => {
    const compound = withPlacement(templateViolin(key));
    calculateFholeContours(compound);
    compound.options.U21DoubleArc = true;
    compound.options.L21DoubleArc = true;
    calculateFholeContours(compound);
    compound.fHoles!.U21!.r *= 0.6;
    compound.fHoles!.L21!.r *= 1.4;
    sameFholes(compound, fromCeruti(compound));
  });

  it('cuts the same f-holes with the stem arcs set free', () => {
    const free = withPlacement(templateViolin(key));
    calculateFholeContours(free);
    free.options.stemArcsIndependent = true;
    const shared = free.fHoles!.stem.arcR!;
    free.fHoles!.S1!.r = shared + 2;
    free.fHoles!.S2!.r = shared + 4;
    free.fHoles!.S3!.r = shared + 6;
    free.fHoles!.S4!.r = shared + 8;
    sameFholes(free, fromCeruti(free));
  });

  // no fixture ships with the eyes at the seed's ratios bar the del Gesu, whose eyes alone are
  // what Ceruti places from; where the fixture's own ratios differ the seeds can't agree
  it('places the eyes the same way from the corners, where the ratios are the seed\'s', () => {
    const fresh = templateViolin(key);
    if (Math.abs((fresh.ratios.FUtoL ?? 3 / 4) - 3 / 4) > 1e-9 || Math.abs((fresh.ratios.FLtoW ?? 1 / 50) - 1 / 50) > 1e-9) return;
    const theirs = defaultFHolePlacement(fresh);
    const q = fromCeruti(fresh);
    delete q.fHoles;
    delete q.fHoleContours;
    FHolePlacementPanel.seed(q);
    const ours = q.fHoles!;
    for (const [a, b, label] of [[ours.UEye.x, theirs.UEye!.x, 'UEye.x'], [ours.UEye.y, theirs.UEye!.y, 'UEye.y'], [ours.UEye.r, theirs.UEye!.r, 'UEye.r'],
      [ours.LEye.x, theirs.LEye!.x, 'LEye.x'], [ours.LEye.y, theirs.LEye!.y, 'LEye.y'], [ours.LEye.r, theirs.LEye!.r, 'LEye.r'],
      [ours.URise, theirs.URise!, 'URise'], [ours.LRise, theirs.LRise!, 'LRise'],
      [ours.stem.center.x, theirs.stem.center!.x, 'stem.x'], [ours.stem.center.y, theirs.stem.center!.y, 'stem.y'], [ours.stem.width, theirs.stem.width!, 'stem.width'],
      [ours.stem.angle, degrees(theirs.stem.angle!), 'stem.angle']] as const) {
      expect(Math.abs(a - b), label).toBeLessThan(0.006);
    }
  });

  it('tilts the ribs and runs the long arches the same way, seeded where the fixture carries none', () => {
    sameArching(templateViolin(key, true));
  });

  it('carves the same surface on each plate', () => {
    sameSurface(templateViolin(key, true));
  }, 60_000);

  it('carves the same surface through two stations', () => {
    const ca = templateViolin(key, true);
    for (const plate of ['top', 'bottom'] as const) {
      const cross = ca.arching![plate].cross ??= defaultCrossArchParams();
      if (cross.type === 'catenary') continue;
      const lo = Math.round(ca.height * 0.3), hi = Math.round(ca.height * 0.7);
      cross.stations = cross.type === 'cycloid'
        ? [{ type: 'cycloid', d: 0.6, pct: 0.8, y: lo }, { type: 'cycloid', d: 0.2, pct: 1, y: hi }]
        : [{ type: 'spline', points: [{ x: 0.5, z: 0.7, mirror: true }], peak: 0.45, y: lo }, { type: 'spline', points: [{ x: 0.7, z: 0.4, mirror: true }], peak: 0.55, y: hi }];
    }
    sameSurface(ca);
  }, 60_000);

  it('sets the same neck, seeded where the fixture carries none', () => {
    const cn = templateViolin(key, true);
    const p = fromCeruti(cn);
    if (!cn.neck) {
      NeckPanel.seed(p);
      cn.neck = defaultNeckParams(cn);
      expect(p.neck).toEqual(neck(cn.neck));
    }
    sameNeck(cn, p);
  });

  it('sets the same neck at a tight heel and a wide one', () => {
    for (const r of [6, 45]) {
      const cn = templateViolin(key, true);
      cn.neck ??= defaultNeckParams(cn);
      cn.neck.heel.r = r;
      sameNeck(cn);
    }
  });

  it('sets the same string setup, seeded where the fixture carries none', () => {
    const c = templateViolin(key, true);
    c.neck ??= defaultNeckParams(c);
    const p = fromCeruti(c);
    if (!c.stringSetup) {
      StringSetupPanel.seed(p);
      c.stringSetup = defaultStringSetup(c);
      expect(p.stringSetup).toEqual(stringSetup(c.stringSetup));
    }
    sameStringSetup(c, p);
  });

  it('sets the same string setup with the nut sunk in the crown and the radius too tight', () => {
    const c = templateViolin(key, true);
    c.neck ??= defaultNeckParams(c);
    c.stringSetup ??= defaultStringSetup(c);
    c.stringSetup.nutThickness = 4;
    sameStringSetup(c);
    // too tight for the board's end but still round over the nut, where Ceruti's crown isn't clamped
    c.stringSetup.fingerboardRadius = c.neck.topWidth;
    sameStringSetup(c);
  });

  it('seeds the same scroll', () => {
    const { c, p } = seededScroll(key);
    expect({ ...p.scroll, arcRadii: [] }).toEqual(scroll(c.scroll!));
  });

  it.each(['salviati', 'fourPoint', 'archimedean', 'serlio', 'goldmann', 'kelly'] as VoluteStyle[])('carves the same %s scroll, side, widths and views', style => {
    const { c, q } = seededScroll(key, v => { v.style = style; });
    sameScroll(c, q);
  });

  it('carves the same scroll with the nape a circle, and with the eye set by hand', () => {
    let { c, q } = seededScroll(key, v => { v.napeCircle = true; });
    sameScroll(c, q);
    ({ c, q } = seededScroll(key, v => { v.flushWithNeck = false; v.eye.x -= 3; }));
    sameScroll(c, q);
  });

  it('cuts the same blocks out of the same mould, seeded where the fixture carries none', () => {
    const fresh = withPlacement(templateViolin(key));
    const seeded = !fresh.blocks?.CU;
    const q = fromCeruti(fresh);
    sameMould(fresh, q);
    if (seeded) {
      const own = fromCeruti(fresh);
      MouldPanel.seed(own);
      // the fixtures were saved with a quarter-inch bit; both recipes seed an eighth. The neck and end
      // blocks seed half again as wide here, the viol neck's still spanning its root
      const theirs = mould(fresh);
      if (!fresh.options.useViolNeck) theirs.neckBlock.width *= 1.5;
      theirs.endBlock.width *= 1.5;
      expect({ ...own.mould, bitDiameter: fresh.bitDiameter }).toEqual(theirs);
    }
  });

  it('reads the same ratios', () => {
    const r = { ...solveMainBoutsRatios(p), ...solveCornersRatios(p), ...solveCenterBoutRatios(p) };
    for (const k of [
      'UBtoLB', 'U0toUBW', 'U1toUBW', 'LBtoH', 'L0toLBW', 'L1toLBW',
      'U2toUBW', 'U3toLBW', 'U31toLBW', 'L2toLBW', 'L3toLBW', 'L31toLBW', 'UCYtoH', 'LCYtoH',
      'CBWtoLBW', 'C0toLBW', 'C0YtoH', 'C2toLBW', 'C21toLBW', 'C1toLBW', 'C11toLBW',
    ] as const) {
      expect(r[k], k).toBeCloseTo(c.ratios[k], 12);
    }
  });
});
