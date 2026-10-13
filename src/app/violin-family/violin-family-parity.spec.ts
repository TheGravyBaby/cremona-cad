// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { templateKeys, templateViolin } from '../enrico-ceruti-violin/ceruti-fixtures';
import { calculateCenterBout, calculateCorners, calculateOuterArcs } from '../enrico-ceruti-violin/calculation/outline/ceruti-calcs';
import { defineInsetPath, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from '../enrico-ceruti-violin/calculation/outline/ceruti-paths';
import { channelPaths, defaultFlutingParams } from '../enrico-ceruti-violin/calculation/arching/ceruti-arch-geometry';
import { defaultArchingParams } from '../enrico-ceruti-violin/calculation/arching/ceruti-arching';
import { EnricoCerutiParams, FlutingParams } from '../enrico-ceruti-violin/ceruti-types';
import { Arc, Pt } from '../models/types';
import { signedRadianDelta, TURN } from '../helpers/math/simpleGeometry';
import { samplePathToPolyline } from '../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../helpers/math/vibeMath';
import { solveMainBoutsRatios, solveMainBouts } from './panels/main-bouts-panel/main-bouts-panel';
import { solveCorners, solveCornersRatios } from './panels/corners-panel/corners-panel';
import { solveCenterBout, solveCenterBoutRatios } from './panels/center-bout-panel/center-bout-panel';
import { solveOuterContour } from './panels/outer-contour-panel/outer-contour-panel';
import { solveFluting } from './panels/fluting-panel/fluting-panel';
import { GougeParams, ViolinFamilyParams } from './violin-family-types';

// The port's acceptance test: every frozen Ceruti instrument, solved by both recipes from the same
// inputs, gives the same arcs and reads the same ratios. Goes when the Ceruti recipe does.

// Ceruti stored each plate corner arc's end; here that end is typed as how far it runs on past the
// rib arc's, along the rib arc's own travel
const cutoff = (inner: Arc | null | undefined, outer: Arc | null | undefined): number =>
  inner && outer ? Math.sign(signedRadianDelta(inner.end - inner.start)) * signedRadianDelta(outer.end - inner.end) / TURN.degree : 0;

// Ceruti's second gouge is on when its sweep is set; here the sweep stays typed under a toggle
const gouge = (g: FlutingParams): GougeParams =>
  ({ sweepRadius: g.sweepRadius, depth: g.depth, cBoutSweep: g.sweepRadius_cBout ?? g.sweepRadius, useCBoutGouge: g.sweepRadius_cBout !== null });

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
  };
}

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

// each plate's channel edges and the land, both recipes from the same Ceruti instrument, seeded
// with the same gouges where the fixture carries none. Where a join grazes the land the two can
// settle a degree of retreat apart, since Ceruti's land polygon is sampled in path order and the
// phase differs; the centreline, whose C bout runs on the land, is where that shows under viol
// corners, and its construction is covered by the fixtures' own channels
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
  samePath(s.land, defineInsetPath(c, c.outerFlutingDepth!), 'land');
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

describe.each(templateKeys())('parity with the Ceruti recipe: %s', key => {
  const c = templateViolin(key);
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
