import { samplePathToPolyline } from '../helpers/svgPathMath';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs, violNeckJoinLimit } from './ceruti-calcs';
import { pointOnCircle } from '../helpers/draftMath';
import { defaultViolin, geometryDiff, layoutFrom, templateKeys, templateViolin } from './ceruti-fixtures';
import { defineInnerPath, defineOuterPath } from './ceruti-paths';
import { EnricoCerutiParams } from './ceruti-types';

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

  it('re-solves to the same geometry it shipped with', () => {
    // Templates carry solved arcs, not just inputs. Running the calc pass over
    // one must therefore be a no-op — if it is not, the shipped geometry and the
    // geometry the app computes for the same instrument have diverged, and the
    // template is drawing something its own numbers no longer describe.
    //
    // Compared numerically rather than exactly: strad-goetz and strad-davidoff
    // were saved before the C-bout solver's last few digits settled and differ
    // by ~1e-8 on those arcs. See geometryDiff.
    const p = templateViolin(key);
    const shipped = JSON.parse(JSON.stringify(p));
    layoutFrom(p);
    expect(geometryDiff(shipped, p)).toEqual([]);
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
 * reported from a session, and each is checked both by its headroom and by the reversal it was
 * reported for.
 */
describe('the viol neck against the upper bout', () => {
  /** delGesù with the viol neck driven to the values a session reported the hook at. */
  const reported = (width: number, neckRadius: number): EnricoCerutiParams => {
    const base = templateViolin('delGesu');
    return layoutFrom({
      ...base,
      viol: { width, neckRadius, V0: { ...base.viol.V0!, r: 32.2, start: 3.3161255787892263, end: 4.328416544945937 } },
      options: { ...base.options, useViolNeck: true },
    } as EnricoCerutiParams);
  };

  /** The direction U0 travels from V0's tangency. Negative is outward — the way the outline goes. */
  const u0Sweep = (p: EnricoCerutiParams): number => p.bouts.U0!.end - p.bouts.U0!.start;

  it.each([
    ['a neck wider than the bout can take', 52, 0, -5.421],
    ['a join radius that pushes it out', 18, 13.5, -1.716],
  ])('reports %s', (_label, width, neckRadius, expected) => {
    const p = reported(width, neckRadius);
    const join = violNeckJoinLimit(p)!;

    expect(join.headroom).toBeCloseTo(expected, 3);
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

  it.each(templateKeys())('ships %s with the neck inside its limit', key => {
    const join = violNeckJoinLimit(templateViolin(key));
    if (join) expect(join.headroom).toBeGreaterThan(0);
  });
});
