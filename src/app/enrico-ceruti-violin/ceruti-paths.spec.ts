import { defineFlutingPath, defineInnerPath, defineOffsetArcs, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from './ceruti-paths';
import { layoutFrom, templateKeys, templateViolin, violinFromRecipe } from './ceruti-fixtures';
import { EnricoCerutiParams } from './ceruti-types';
import { pointOnCircle } from '../helpers/draftMath';
import { Pt } from '../models/types';

/**
 * The purfling and channel lines, which are the inner arcs re-solved at a
 * different offset rather than a rendering of the outline.
 *
 * Everything here turns on one property: the result has to close. The arcs are
 * handed to `unifyConnectedSvgPaths` as an unordered bag, and when a pair of
 * ends does not meet it does not throw — it logs and returns the pieces
 * concatenated, so an arc that runs past its neighbour arrives as an extra
 * `M ...` subpath and draws as a whisker off the corner. That is a visual bug
 * with no exception behind it, which is why it is counted here instead.
 */

/** Subpath count. A purfling line is one closed loop, so anything above 1 is an unjoined piece. */
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;

/** Every arc, keyed by the circle it came from — two entries mean one arc was emitted twice. */
function centresEmittedTwice(p: EnricoCerutiParams, offset: number): string[] {
  const seen = new Map<string, number>();
  for (const a of defineOffsetArcs(p, offset, true)) {
    const key = `${a.x.toFixed(6)},${a.y.toFixed(6)},${a.r.toFixed(6)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([key]) => key);
}

/** A solved instrument with the corner styles forced, rather than as the template saved them. */
function withCorners(key: string, uc: boolean, lc: boolean): EnricoCerutiParams {
  const p = templateViolin(key);
  p.options.useViolCornerUC = uc;
  p.options.useViolCornerLC = lc;
  // A viol corner sets the purfling arcs a real distance in from the outline;
  // left at the default the offset works out to zero and the arcs coincide with
  // the inner trace, which is exactly the case that hides an untrimmed end.
  p.purflingOffset = p.rib + p.overhang + 3.8;
  return layoutFrom(p);
}

const CORNER_STYLES: [string, boolean, boolean][] = [
  ['round corners', false, false],
  ['a viol upper corner', true, false],
  ['a viol lower corner', false, true],
  ['viol corners both ends', true, true],
];

describe.each(CORNER_STYLES)('the purfling line with %s', (_label, uc, lc) => {
  it.each(templateKeys())('closes into a single loop on %s', key => {
    const p = withCorners(key, uc, lc);
    const offset = p.overhang + p.rib;

    expect(subpaths(definePurflingPath(p, offset)!)).toBe(1);
    expect(subpaths(defineOuterPurflingPath(p, offset)!)).toBe(1);
  });
});

describe('the arcs behind the purfling line', () => {
  it.each(CORNER_STYLES)('emits each circle once with %s', (_label, uc, lc) => {
    // The flank arc of a viol corner (U4/L4) is itself the arc that reaches the
    // corner tip, so the corner block emits it trimmed to the intersection it
    // just solved. It used to be pushed a second time untrimmed, which is what
    // produced the whisker: same circle, same start, an end 4mm further round.
    const p = withCorners('ravatinMans', uc, lc);
    expect(centresEmittedTwice(p, -3.8)).toEqual([]);
  });

  it('stops the viol flank at the corner, not past it', () => {
    // The end angle has to be the one solved against the neighbouring corner
    // arc. Compared as a point, since the two arcs meet in space and not at any
    // shared angle.
    const p = withCorners('ravatinMans', true, false);
    const arcs = defineOffsetArcs(p, -3.8, true);
    const flank = arcs.filter(a => Math.abs(a.r - (p.bouts.U4!.r - 3.8)) < 1e-9);
    expect(flank).toHaveLength(1);

    const tip = { x: flank[0].x + flank[0].r * Math.cos(flank[0].end), y: flank[0].y + flank[0].r * Math.sin(flank[0].end) };
    const meets = arcs.some(a => a !== flank[0]
      && Math.hypot(a.x + a.r * Math.cos(a.end) - tip.x, a.y + a.r * Math.sin(a.end) - tip.y) < 1e-6);
    expect(meets, 'the viol flank ends where nothing else does').toBe(true);
  });
});

describe('the recipe the whisker was reported from', () => {
  /**
   * The Ravatin cello as it stood in the session that reported this, reduced to
   * what the bug turns on: a viol upper corner, and a purfling offset set well
   * in from the outline. Reproducing it from the nearest template instead would
   * have missed it — every bundled instrument with a viol corner leaves
   * `purflingOffset` at its default, where the offset works out to zero and the
   * untrimmed arc lands exactly on top of the trimmed one.
   */
  const reported = () => violinFromRecipe({
    params: {
      ...templateViolin('ravatinMans'),
      purflingOffset: 10.8,
      purflingChannelDepth: 1.2,
      options: { ...templateViolin('ravatinMans').options, useViolCornerUC: true, useViolCornerLC: false },
    },
  });

  it('draws its purfling as one closed loop', () => {
    const p = reported();
    expect(subpaths(definePurflingPath(p, p.overhang + p.rib)!)).toBe(1);
  });

  it('sets a purfling offset the outline can actually feel', () => {
    // The guard on the fixture above: if this ever came out zero, the test
    // passes while testing nothing.
    const p = reported();
    expect(p.purflingOffset).not.toBe(p.rib + p.overhang);
  });
});

/**
 * The viol neck, where V0 sweeps out of the neck's flat top face.
 *
 * That junction is the one hard corner in the outline, and offsetting a convex corner outward
 * cannot land the two offset pieces on the same point — the arc's end slides along its own radial
 * normal while the face slides straight up. `violNeckCap` bridges them with a fillet of radius
 * R + d, so what these tests pin is that every line drawn at the neck agrees: same centre, radius
 * differing by exactly the offset between them.
 */

/** Segment endpoints. The last two numbers of M/L/A/C/Q are the endpoint in every case. */
function endpoints(d: string): Pt[] {
  return (d.match(/[MLACQ][^MLACQ]*/g) ?? []).map((seg: string) => {
    const n = seg.slice(1).trim().split(/[\s,]+/).map(Number);
    return { x: n[n.length - 2], y: n[n.length - 1] };
  });
}

/** The neck's top face is the highest thing on the instrument, so the top of the path is it. */
const faceY = (d: string): number => Math.max(...endpoints(d).map(pt => pt.y));

/** True when the path returns to where it started — an open chain still reads as one subpath. */
function closes(d: string): boolean {
  const pts = endpoints(d);
  return (d.match(/M/g) ?? []).length === 1
    && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;
}

const violNeckKeys = (): string[] => templateKeys().filter(k => templateViolin(k).options.useViolNeck);

function violNeck(key: string, neckRadius: number): EnricoCerutiParams {
  const p = templateViolin(key);
  p.viol.neckRadius = neckRadius;
  return layoutFrom(p);
}

// 0 is the sharp corner offset exactly; 6 is a fillet wide enough to move the face in visibly.
const NECK_RADII = [0, 6];

describe.each(NECK_RADII)('the viol neck with a %dmm join radius', R => {
  it.each(violNeckKeys())('closes every line across the neck on %s', key => {
    // The dangle this was reported for: the purfling ran up the V0 sweep and stopped, because
    // the offset arcs carry no top face and nothing closed the loop over the neck.
    const p = violNeck(key, R);
    const inset = p.overhang + p.rib;

    expect(closes(defineInnerPath(p)), 'inner trace').toBe(true);
    expect(closes(defineOuterPath(p, inset, true, false)), 'outer trace').toBe(true);
    expect(closes(defineOuterPath(p, inset, true, true)), 'outer trace with a button').toBe(true);
    expect(closes(definePurflingPath(p, inset)!), 'purfling').toBe(true);
    expect(closes(defineOuterPurflingPath(p, inset)!), 'purfling channel').toBe(true);
    expect(closes(defineFlutingPath(p, inset + 3)!), 'fluting').toBe(true);
  });

  it.each(violNeckKeys())('stands the plate edge a full inset above the rib line on %s', key => {
    // The face used to be built off the *offset* arc's endpoint rather than the corner, which put
    // it an extra 1.1mm up on the Maggini — the plate overhanging its own ribs by more at the
    // neck than anywhere else on the instrument.
    const p = violNeck(key, R);
    const inset = p.overhang + p.rib;

    expect(faceY(defineOuterPath(p, inset, true, false))).toBeCloseTo(faceY(defineInnerPath(p)) + inset, 9);
    expect(faceY(defineInnerPath(p))).toBeCloseTo(p.height - inset, 9);
  });

  it.each(violNeckKeys())('starts V0 exactly where its start angle says on %s', key => {
    // The join is seated into the layout rather than carved out of it, so raising the radius
    // must not move where V0 begins. Carving it did: the join's tangency landed short of
    // V0.start, leaving the flank hanging past the outline by the amount it had eaten.
    const p = violNeck(key, R);
    const start = pointOnCircle(p.viol.V0!, p.viol.V0!.start);

    // the inner trace passes through that point, mirrored, whatever the radius
    const hits = endpoints(defineInnerPath(p))
      .some(pt => Math.hypot(pt.x - start.x, pt.y - start.y) < 1e-9);
    expect(hits, `V0.start at (${start.x}, ${start.y}) is on the inner trace`).toBe(true);

    // and the face keeps the authored width, rather than the join eating into it
    expect(Math.max(...endpoints(defineInnerPath(p)).filter(pt => pt.y > p.height - (p.overhang + p.rib) - 1e-9).map(pt => pt.x)))
      .toBeCloseTo(p.viol.width! / 2, 9);
  });
});

describe('the arcs joining the viol neck to its top face', () => {
  /** The join arc at offset `d`, which follows V0 and is the one arc there not centred on it. */
  function joinArc(p: EnricoCerutiParams, d: number) {
    const last = defineOffsetArcs(p, d).at(-1)!;
    const onV0 = Math.abs(last.x - p.viol.V0!.x) < 1e-9 && Math.abs(last.y - p.viol.V0!.y) < 1e-9;
    return onV0 ? undefined : last;
  }

  it('centres every offset of the join on one point, radius apart by the offset', () => {
    // The whole construction rests on this: the fillet centre and its two tangency rays do not
    // move with the offset. If they did, each line would need its own join solved against its own
    // neighbours, and they would stop meeting.
    const p = violNeck('maggini-delmas', 6);
    const centre = joinArc(p, 0)!;

    for (const d of [0, 1.2, 4, 8]) {
      const arc = joinArc(p, d)!;
      expect(arc.x, `centre x at offset ${d}`).toBeCloseTo(centre.x, 9);
      expect(arc.y, `centre y at offset ${d}`).toBeCloseTo(centre.y, 9);
      expect(arc.r, `radius at offset ${d}`).toBeCloseTo(6 + d, 9);
    }
  });

  it('drops the join once an inward offset has eaten the fillet', () => {
    // Inside a convex corner the two offsets cross rather than part, so past R the join is a
    // trim, not an arc. The channel reaches this: it runs in from the edge by more than R.
    const p = violNeck('maggini-delmas', 6);
    expect(joinArc(p, -6.5)).toBeUndefined();
    // 14.5mm in from the edge is the same -6.5 once the inset comes off
    expect(closes(defineFlutingPath(p, 14.5)!), 'the channel still closes without one').toBe(true);
  });
});
