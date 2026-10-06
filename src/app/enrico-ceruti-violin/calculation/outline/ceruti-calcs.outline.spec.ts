// @vitest-environment node
import { samplePathToPolyline } from '../../../helpers/math/pathMath';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs, ensureCenterBoutInnerPath, ensureOuterTracePaths, violNeckJoinLimit } from './ceruti-calcs';
import { dist, offsetArcRadius, pointOnCircle } from '../../../helpers/math/simpleGeometry';
import { defaultViolin, geometryDiff, layoutFrom, templateKeys, templateViolin, violinFromRecipe } from '../../ceruti-fixtures';
import { cornerOffsetSign, defineInnerPath, defineOffsetArcs, defineOuterPath, definePurflingPath } from './ceruti-paths';
import { EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { setGlobalEmitter } from '../../../shared/message-emitter';
import delGesuBalticParams from '../../templates/test-fixtures/del-gesu-baltic-params.json';
import invertedLowerCornerParams from '../../templates/test-fixtures/inverted-lower-corner-params.json';
import invertedCornersParams from '../../templates/test-fixtures/inverted-corners-params.json';

/**
 * The 2D outline pipeline — `ceruti-calcs.ts` into `ceruti-paths.ts`.
 *
 * This is the half of the model that is edited by hand and was, until now, the
 * half with almost no coverage: everything downstream (the mould, the blocks,
 * the plate surface, every export) is cut from the outline these functions
 * solve, so an outline that is subtly wrong is wrong on the finished plate.
 *
 * The properties here are the ones a maker would notice on the bench — the
 * outline closes, it is symmetric about the joint, and its widest points are
 * the bout widths the recipe states — plus the one property the *code* depends
 * on: that running the calc pass again changes nothing.
 */

/** The point a path starts at. */
function pathStart(d: string): { x: number; y: number } {
  const m = d.match(/M\s*(-?[\d.]+(?:e[+-]?\d+)?)\s+(-?[\d.]+(?:e[+-]?\d+)?)/i);
  if (!m) throw new Error(`No move-to in path: ${d.slice(0, 40)}`);
  return { x: +m[1], y: +m[2] };
}

/** The point a path ends at — every SVG command here ends with its destination. */
function pathEnd(d: string): { x: number; y: number } {
  const nums = d.match(/-?[\d.]+(?:e[+-]?\d+)?/gi) ?? [];
  return { x: +nums[nums.length - 2], y: +nums[nums.length - 1] };
}

const outerOf = (p: EnricoCerutiParams) => defineOuterPath(p, p.overhang + p.rib, true, false);

describe('the calc pass', () => {
  // Panels call these on every buildRun(), so they run on every keystroke against
  // params they have already solved. Anything that accumulated — a radius nudged
  // by a rounding step, an angle renormalized a little further each time — would
  // drift the drawing under an idle cursor rather than fail outright.
  it('is idempotent: solving an already-solved recipe changes nothing', () => {
    const p = defaultViolin();
    const solved = JSON.stringify(p);

    layoutFrom(p);
    expect(JSON.stringify(p)).toBe(solved);
    layoutFrom(p);
    expect(JSON.stringify(p)).toBe(solved);
  });

  // Weaker than the whole-pass check above, and deliberately so: the stages hand
  // intermediate states to one another, so a stage run alone can legitimately
  // settle a residual its successor puts back (calculateMainBouts snaps a ~2e-8
  // leftover on U1.end to exactly 0). What must not happen is a stage moving
  // geometry by an amount a plate could express.
  it('moves nothing measurable when a single stage is re-run', () => {
    const p = defaultViolin();
    for (const stage of [calculateMainBouts, calculateCorners, calculateCenterBout, calculateOuterArcs]) {
      const before = JSON.parse(JSON.stringify(p));
      stage(p);
      expect(geometryDiff(before, p), `${stage.name} moved geometry`).toEqual([]);
    }
  });

  // The ratios are the display half of the same numbers the arcs carry, and the
  // calc pass rewrites them from the solved geometry. If they disagreed, the
  // panel fields would read one instrument and the drawing would show another.
  it('leaves the displayed ratios agreeing with the geometry they describe', () => {
    const p = defaultViolin();
    const inset = p.overhang + p.rib;
    const UBWI = p.bouts.UBW! - 2 * inset;
    const LBWI = p.bouts.LBW! - 2 * inset;

    expect(p.ratios.UBtoLB).toBeCloseTo(p.bouts.UBW! / p.bouts.LBW!, 10);
    expect(p.ratios.LBtoH).toBeCloseTo(p.bouts.LBW! / p.height, 10);
    expect(p.ratios.U0toUBW).toBeCloseTo(p.bouts.U0!.r / UBWI, 10);
    expect(p.ratios.L0toLBW).toBeCloseTo(p.bouts.L0!.r / LBWI, 10);
  });
});

/**
 * A corner dragged where no arc can reach it is the most common way a recipe breaks, and it is
 * also the quietest: the solvers return nothing rather than throwing, so the generic `safeRun`
 * net never sees it. These pin the two things that make it recoverable — the message names the
 * corner, and clearing a corner hands it back to the default solve.
 */
describe('a corner out of reach', () => {
  const captureTitles = (): string[] => {
    const titles: string[] = [];
    setGlobalEmitter(m => { titles.push(m.title); });
    return titles;
  };

  afterEach(() => setGlobalEmitter(null as any));

  it('names which corner failed instead of leaving it to the generic catch', () => {
    for (const [corner, expected] of [['UCr', 'Upper corner'], ['LCr', 'Lower corner']] as const) {
      const titles = captureTitles();
      const p = defaultViolin();
      // well outside the plate, so no arc of that radius is both tangent to the bout and through it
      p.bouts[corner]!.x = 400;
      const failures = calculateCorners(p);
      expect(titles).toEqual(['Corners']);
      expect(failures).toHaveLength(1);
      expect(failures[0].message).toContain(expected);
    }
  });

  it('still solves the other corner', () => {
    captureTitles();
    const p = defaultViolin();
    const lower = JSON.parse(JSON.stringify(p.bouts.L3));

    p.bouts.UCr!.x = 400;
    const failures = calculateCorners(p);

    expect(failures[0].unsolved).toEqual(['U2', 'U3', 'U31', 'U4']);
    expect(geometryDiff(p.bouts.L3, lower)).toEqual([]);
  });

  it('quotes the smallest arc that reaches the corner, and that arc does', () => {
    captureTitles();
    const p = defaultViolin();
    p.options.U31DoubleArc = false;
    p.bouts.U3!.r = 1;
    const failures = calculateCorners(p);
    const needed = Math.abs(Math.hypot(p.bouts.UCr!.x - p.bouts.U2!.x, p.bouts.UCr!.y - p.bouts.U2!.y) - p.bouts.U2!.r) / 2;

    expect(failures[0].message).toContain(`at least ${needed.toFixed(1)}mm`);
    expect(failures[0].points).toEqual([p.bouts.UCr]);

    p.bouts.U3!.r = needed + 0.05;
    expect(calculateCorners(p)).toEqual([]);
  });

  it('keeps the last good inner outline while a corner is out of reach', () => {
    captureTitles();
    const p = defaultViolin();
    const paths: PathEntry[] = [];
    ensureCenterBoutInnerPath(p, paths);
    const good = paths.find(e => e.key === 'inner')!.path;

    p.bouts.UCr!.x = 400;
    expect(() => ensureCenterBoutInnerPath(p, paths)).not.toThrow();
    expect(paths.find(e => e.key === 'inner')!.path).toBe(good);
  });

  // The center bout reaches the same two corners from its own arcs, so it fails the same way and
  // has to name the same corner — the corners panel is not the only place this is recoverable from.
  it('names the corner when the center bout is the arc that cannot reach it', () => {
    const titles = captureTitles();
    const p = defaultViolin();
    p.bouts.LCr!.x = 400;
    const failures = calculateCenterBout(p);
    expect(titles).toEqual(['Center Bout']);
    expect(failures.map(f => f.unsolved)).toEqual([['C0', 'C1', 'C11']]);
    expect(failures[0].message).toContain("C1 can't reach the corner from C0");
  });

  it('quotes the smallest center-bout arc that reaches the corner, and that arc does', () => {
    captureTitles();
    const p = defaultViolin();
    p.options.C21DoubleArc = false;
    p.bouts.C2!.r = 1;
    const failures = calculateCenterBout(p);
    const needed = Math.abs(Math.hypot(p.bouts.UCr!.x - p.bouts.C0!.x, p.bouts.UCr!.y - p.bouts.C0!.y) - p.bouts.C0!.r) / 2;

    expect(failures[0].message).toContain(`at least ${needed.toFixed(1)}mm`);

    p.bouts.C2!.r = needed + 0.05;
    expect(calculateCenterBout(p)).toEqual([]);
  });

  it('falls back to placing C0 by hand when the fit cannot touch both bouts, and says so once', () => {
    const titles = captureTitles();
    const p = defaultViolin();
    p.options.useKellyC0 = true;
    p.bouts.C0!.r = 1;
    const failures = calculateCenterBout(p);

    expect(titles).toEqual(['Center Bout']);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('Fit C0 to Bouts');
    expect(failures[0].circles).toEqual([p.bouts.U2, p.bouts.L2]);
    expect(p.options.useKellyC0).toBe(false);
    expect(Number.isFinite(p.bouts.C0!.x)).toBe(true);
  });

  it('leaves the previous geometry standing so there is something to steer by', () => {
    captureTitles();
    const p = defaultViolin();
    const before = JSON.parse(JSON.stringify(p.bouts.U3));

    p.bouts.UCr!.x = 400;
    calculateCorners(p);

    expect(p.bouts.U3).toEqual(before);
  });

  it('re-derives only the corner that was cleared', () => {
    const p = defaultViolin();
    const upper = { x: p.bouts.UCr!.x, y: p.bouts.UCr!.y };

    // move both corners in, then hand back only the upper one
    p.bouts.UCr!.x -= 8;
    p.bouts.LCr!.x -= 8;
    calculateCorners(p);
    const movedLower = { x: p.bouts.LCr!.x, y: p.bouts.LCr!.y };

    p.bouts.UCr = null;
    calculateCorners(p);

    expect(p.bouts.UCr!.x).toBeCloseTo(upper.x, 0);
    expect(p.bouts.UCr!.y).toBeCloseTo(upper.y, 0);
    expect(p.bouts.LCr).toEqual(expect.objectContaining(movedLower));
  });
});

describe('a main bout that cannot reach its width', () => {
  afterEach(() => setGlobalEmitter(null as any));

  const innerHalf = (p: EnricoCerutiParams, width: number) => (width - 2 * (p.overhang + p.rib)) / 2;

  it('names the lower bout and the radius it needs, and leaves the upper bout solved', () => {
    const titles: string[] = [];
    setGlobalEmitter(m => { titles.push(m.title); });
    const p = defaultViolin();
    const upper = JSON.parse(JSON.stringify(p.bouts.U1));
    p.bouts.L0!.r = innerHalf(p, p.bouts.LBW) - 10;

    const failures = calculateMainBouts(p);

    expect(failures).toHaveLength(1);
    expect(failures[0].unsolved).toEqual(['L0', 'L1']);
    expect(failures[0].message).toContain(`at least ${innerHalf(p, p.bouts.LBW).toFixed(1)}mm`);
    expect(failures[0].segments[0][0].x).toBeCloseTo(innerHalf(p, p.bouts.LBW), 9);
    expect(titles).toEqual(['Main Bouts']);
    expect(geometryDiff(p.bouts.U1, upper)).toEqual([]);
  });

  it('names the upper bout the same way', () => {
    const p = defaultViolin();
    p.bouts.U0!.r = innerHalf(p, p.bouts.UBW) - 5;

    const failures = calculateMainBouts(p);

    expect(failures.map(f => f.unsolved)).toEqual([['U0', 'U1']]);
    expect(failures[0].message).toContain("U0 can't reach the upper bout width");
  });

  it('says the small arc has to be the smaller one when it has caught up', () => {
    const p = defaultViolin();
    p.bouts.L1!.r = p.bouts.L0!.r;

    expect(calculateMainBouts(p)[0].message).toContain('L1 has to be smaller than L0');
  });
});

describe('the solved outline', () => {
  // No `Z` is emitted — the path is closed by arriving back where it began. A
  // gap here would show up as a nick in the trace and, worse, as an open loop
  // to the boolean ops the mould and blocks are cut with.
  it('returns to its own start point, inner and outer', () => {
    const p = defaultViolin();
    for (const [name, d] of [['inner', defineInnerPath(p)], ['outer', outerOf(p)]] as const) {
      const a = pathStart(d);
      const b = pathEnd(d);
      expect(Math.hypot(b.x - a.x, b.y - a.y), `${name} path does not close`).toBeLessThan(1e-6);
    }
  });

  it('is symmetric about the joint', () => {
    const poly = samplePathToPolyline(outerOf(defaultViolin()));
    const xs = poly.map(q => q.x);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 2);
  });

  // The bout circles are placed so their outermost point *is* the widest point
  // of that bout (see bodyLandmarks). So the drawing's extreme x must be half
  // the stated width — this is what ties the number in the panel to the line on
  // the screen, and nothing else in the suite checks that link.
  it('is exactly as wide as the lower bout width says', () => {
    const p = defaultViolin();
    const xs = samplePathToPolyline(outerOf(p)).map(q => q.x);
    expect(Math.max(...xs)).toBeCloseTo(p.bouts.LBW! / 2, 2);
  });

  it('stays inside the plate: the inner path is nowhere wider than the outer', () => {
    const p = defaultViolin();
    const innerXs = samplePathToPolyline(defineInnerPath(p)).map(q => Math.abs(q.x));
    const outerXs = samplePathToPolyline(outerOf(p)).map(q => Math.abs(q.x));
    expect(Math.max(...innerXs)).toBeLessThan(Math.max(...outerXs));
  });

  it('runs the full body length', () => {
    const p = defaultViolin();
    const ys = samplePathToPolyline(outerOf(p)).map(q => q.y);
    expect(Math.min(...ys)).toBeCloseTo(0, 1);
    expect(Math.max(...ys)).toBeCloseTo(p.height, 1);
  });
});

/**
 * Every bundled instrument, solved from its own saved parameters.
 *
 * The set spans violin through double bass, which is the point: the solvers are
 * written against violin proportions and these are the only check that they
 * still answer for a 1110mm body. Until the fixtures existed, no test had ever
 * loaded one of these.
 */
// with the lower corner outside C0's circle, C1 wraps around C0 rather than sitting inside it —
// an S into the corner, as on a Prescott bass — and its offsets have to grow where they'd shrink
describe('a lower corner that wraps around the center bout', () => {
  const inverted = () => violinFromRecipe({ params: invertedLowerCornerParams });

  it('is told apart from the usual corner', () => {
    expect(cornerOffsetSign(defaultViolin(), 'C1')).toBe(-1);
    expect(cornerOffsetSign(inverted(), 'C1')).toBe(1);
  });

  it('keeps the outer C1 tangent to the outer C0', () => {
    const p = inverted();
    const C0 = offsetArcRadius(p.bouts.C0!, -(p.overhang + p.rib));
    const C1 = p.outerCorners.C1!;
    expect(dist(C0, C1)).toBeCloseTo(C0.r + C1.r, 6);
  });

  it('brings the purfling into the corner rather than to the far crossing of L3 and C1', () => {
    const p = inverted();
    const arcs = defineOffsetArcs(p, p.overhang + p.rib - p.purflingOffset!, true);
    const [L3, C1] = arcs.slice(-2);
    const tip = pointOnCircle(L3, L3.end);

    expect(dist(tip, pointOnCircle(C1, C1.end))).toBeLessThan(1e-6);
    expect(dist(tip, p.bouts.LCr!)).toBeLessThan(p.purflingOffset!);
  });

  it('closes its outer and purfling outlines', () => {
    const p = inverted();
    const offset = p.overhang + p.rib;
    for (const [name, d] of [['outer', outerOf(p)], ['purfling', definePurflingPath(p, offset)!]] as const) {
      const a = pathStart(d);
      const b = pathEnd(d);
      expect(Math.hypot(b.x - a.x, b.y - a.y), `${name} path does not close`).toBeLessThan(1e-6);
    }
  });

  it('carries the inversion through a compound C11', () => {
    const params = JSON.parse(JSON.stringify(invertedLowerCornerParams));
    params.options.C11DoubleArc = true;
    const p = violinFromRecipe({ params });
    const offset = p.overhang + p.rib;
    const { C1, C11 } = p.outerCorners;
    expect(dist(C1!, C11!)).toBeCloseTo(C1!.r - C11!.r, 6);

    for (const [name, d] of [['outer', outerOf(p)], ['purfling', definePurflingPath(p, offset)!]] as const) {
      const a = pathStart(d);
      const b = pathEnd(d);
      expect(Math.hypot(b.x - a.x, b.y - a.y), `${name} path does not close`).toBeLessThan(1e-6);
    }
  });
});

// saved from the app with both corners inverted, and its outer C2 saved before the upper one was
// recognized, so that arc's end sits on the far side of the corner
describe('an upper corner that wraps around the center bout', () => {
  const inverted = () => violinFromRecipe({ params: JSON.parse(JSON.stringify(invertedCornersParams)) });

  it('is told apart from the usual corner', () => {
    expect(cornerOffsetSign(defaultViolin(), 'C2')).toBe(-1);
    expect(cornerOffsetSign(inverted(), 'C2')).toBe(1);
  });

  it('keeps the outer C2 tangent to the outer C0', () => {
    const p = inverted();
    const C0 = offsetArcRadius(p.bouts.C0!, -(p.overhang + p.rib));
    const C2 = p.outerCorners.C2!;
    expect(dist(C0, C2)).toBeCloseTo(C0.r + C2.r, 6);
  });

  it('starts over an outer C2 saved before the corner inverted', () => {
    const p = inverted();
    const C2 = p.outerCorners.C2!;
    expect(dist(pointOnCircle(C2, C2.end), p.bouts.UCr!)).toBeLessThan(2 * (p.overhang + p.rib));
  });

  it('brings the purfling into the corner', () => {
    const p = inverted();
    const purfling = samplePathToPolyline(definePurflingPath(p, p.overhang + p.rib)!);
    const nearest = Math.min(...purfling.map(q => dist(q, p.bouts.UCr!)));
    expect(nearest).toBeLessThan(p.purflingOffset!);
  });

  it('builds the outer trace panel\'s paths', () => {
    const p = inverted();
    const paths: PathEntry[] = [];
    calculateOuterArcs(p);
    ensureOuterTracePaths(p, paths);
    expect(paths.map(e => e.key)).toEqual(expect.arrayContaining(['back', 'purfling', 'outerPurfling']));
  });
});

describe.each(templateKeys())('template: %s', key => {
  it('solves to a closed, finite, symmetric outline', () => {
    const p = templateViolin(key);
    const inner = defineInnerPath(p);
    const outer = outerOf(p);

    expect(inner + outer).not.toMatch(/NaN|Infinity/);

    for (const [name, d] of [['inner', inner], ['outer', outer]] as const) {
      const a = pathStart(d);
      const b = pathEnd(d);
      expect(Math.hypot(b.x - a.x, b.y - a.y), `${name} path does not close`).toBeLessThan(1e-6);
    }

    const xs = samplePathToPolyline(outer).map(q => q.x);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(p.bouts.LBW! / 2, 1);
  });
});

/**
 * The viol neck's reach into the upper bout.
 *
 * U0 is seated tangent to V0's end and U1 is inscribed in U0 at a fixed x, so the point where
 * they touch travels inward as the neck grows. Push the neck far enough and that touch ends up
 * behind V0's end: U0 sweeps backwards to reach it and the outline hooks. Nothing throws — the
 * circles all still intersect — so `violNeckJoinLimit` is the only thing that catches it.
 *
 * What the two recipes below pin is that the closed form agrees with the solver: they were
 * reported from a session, and each is checked both by the sign of its headroom and by the
 * reversal it was reported for.
 */
describe('the viol neck against the upper bout', () => {
  /** delGesù with the viol neck driven to the values a session reported the hook at. */
  const reported = (width: number, neckRadius: number): EnricoCerutiParams => {
    const base = violinFromRecipe({ params: delGesuBalticParams });
    return layoutFrom({
      ...base,
      viol: { width, neckRadius, V0: { ...base.viol.V0!, r: 32.2, start: 3.3161255787892263, end: 4.328416544945937 } },
      options: { ...base.options, useViolNeck: true },
    } as EnricoCerutiParams);
  };

  /** The direction U0 travels from V0's tangency. Negative is outward — the way the outline goes. */
  const u0Sweep = (p: EnricoCerutiParams): number => p.bouts.U0!.end - p.bouts.U0!.start;

  it.each([
    ['a neck wider than the bout can take', 52, 0],
    ['a join radius that pushes it out', 18, 13.5],
  ])('reports %s', (_label, width, neckRadius) => {
    const p = reported(width, neckRadius);
    const join = violNeckJoinLimit(p)!;

    expect(join.headroom).toBeLessThan(0);
    expect(u0Sweep(p), 'U0 sweeps backwards, which is the hook').toBeGreaterThan(0);
  });

  it('leaves the same neck room at a width the bout can take', () => {
    const p = reported(16.1, 0);
    const join = violNeckJoinLimit(p)!;

    expect(join.headroom).toBeGreaterThan(0);
    expect(u0Sweep(p), 'U0 sweeps outward').toBeLessThan(0);
  });

  it('reads V0 end off the solved arc, not just the closed form', () => {
    // The guard on the formula: `reach` has to be V0's end in x, or the limit is being compared
    // against something else that happens to trend the same way.
    for (const [w, R] of [[16.1, 0], [52, 0], [18, 13.5], [30, 6]] as const) {
      const p = reported(w, R);
      expect(violNeckJoinLimit(p)!.reach).toBeCloseTo(pointOnCircle(p.viol.V0!, p.viol.V0!.end).x, 9);
    }
  });
});
