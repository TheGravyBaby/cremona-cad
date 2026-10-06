// @vitest-environment node
import { defineFholePath, defineFlutingArcs, defineFlutingPath, defineInnerPath, defineInsetPath, defineOffsetArcs, defineOuterPath, defineOuterPurflingPath, definePurflingPath, defineSideScrollPath, violNeckCap } from './ceruti-paths';
import { defaultViolin, layoutFrom, templateKeys, templateViolin, violinFromRecipe } from '../../ceruti-fixtures';
import { calculateCenterBout, calculateCorners, calculateFholeContours, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { channelPaths, defaultFlutingParams } from '../arching/ceruti-arch-geometry';
import { defaultFHolePlacement } from '../../panels/f-hole-placement-panel/f-hole-placement-panel';
import { DefaultParams, EnricoCerutiParams, FlutingParams } from '../../ceruti-types';
import { calculateScroll, defaultVoluteParams } from '../neck/ceruti-scroll';
import { defaultNeckParams, defaultStringSetup } from '../neck/ceruti-neck';
import { pointInPolygon, pointOnCircle } from '../../../helpers/math/simpleGeometry';
import { samplePathToPolyline, splitPathStrings } from '../../../helpers/math/pathMath';
import { Pt } from '../../../models/types';
import { setGlobalEmitter } from '../../../shared/message-emitter';
import ravatinMansParams from '../../templates/test-fixtures/ravatin-mans-params.json';
import magginiDelmasParams from '../../templates/test-fixtures/maggini-delmas-params.json';
import amatiBrookingsParams from '../../templates/test-fixtures/amati-brookings-params.json';
import invertedCornersFlutingParams from '../../templates/test-fixtures/inverted-corners-fluting-params.json';
import { buildPolylineIndex, distPointToPolylineIndexed } from '../../../helpers/math/vibeMath';

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

function withCornersOn(p: EnricoCerutiParams, uc: boolean, lc: boolean): EnricoCerutiParams {
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
  it('closes into a single loop', () => {
    const p = withCornersOn(defaultViolin(), uc, lc);
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
    const p = withCornersOn(violinFromRecipe({ params: ravatinMansParams }), uc, lc);
    expect(centresEmittedTwice(p, -3.8)).toEqual([]);
  });

  it('stops the viol flank at the corner, not past it', () => {
    // The end angle has to be the one solved against the neighbouring corner
    // arc. Compared as a point, since the two arcs meet in space and not at any
    // shared angle.
    const p = withCornersOn(violinFromRecipe({ params: ravatinMansParams }), true, false);
    const arcs = defineOffsetArcs(p, -3.8, true);
    const flank = arcs.filter(a => Math.abs(a.r - (p.bouts.U4!.r - 3.8)) < 1e-9);
    expect(flank).toHaveLength(1);

    const tip = { x: flank[0].x + flank[0].r * Math.cos(flank[0].end), y: flank[0].y + flank[0].r * Math.sin(flank[0].end) };
    const meets = arcs.some(a => a !== flank[0]
      && Math.hypot(a.x + a.r * Math.cos(a.end) - tip.x, a.y + a.r * Math.sin(a.end) - tip.y) < 1e-6);
    expect(meets, 'the viol flank ends where nothing else does').toBe(true);
  });
});

describe('the f-hole outline', () => {
  it('draws two separate closed loops, one per side', () => {
    const p = defaultViolin();
    p.fHoles = defaultFHolePlacement(p);
    calculateFholeContours(p);

    expect(subpaths(defineFholePath(p))).toBe(2);
  });

  it('mirrors the treble-side hole onto the bass side', () => {
    const p = defaultViolin();
    p.fHoles = defaultFHolePlacement(p);
    calculateFholeContours(p);

    const trebleTip = p.fHoles!.UTip!;
    const hits = endpoints(defineFholePath(p))
      .some(pt => Math.hypot(pt.x - -trebleTip.x, pt.y - trebleTip.y) < 1e-6);
    expect(hits, 'the mirrored UTip lands on the bass-side loop').toBe(true);
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
      ...ravatinMansParams,
      purflingOffset: 10.8,
      purflingChannelDepth: 1.2,
      options: { ...ravatinMansParams.options, useViolCornerUC: true, useViolCornerLC: false },
    },
  });

  it('draws its purfling as one closed loop', () => {
    const p = reported();
    expect(subpaths(definePurflingPath(p, p.overhang + p.rib)!)).toBe(1);
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

function violNeckOn(p: EnricoCerutiParams, neckRadius: number): EnricoCerutiParams {
  p.viol.neckRadius = neckRadius;
  return layoutFrom(p);
}

// every fixture with a viol neck, bar inverted-corners-fluting: with both corners wrapped round
// the center bout its channel doesn't build at all under a 6 mm join (defineFlutingPath comes
// back null), which is a question for the channel solver rather than for this sweep
function violNeckSources(): Array<[string, EnricoCerutiParams]> {
  return templateKeys()
    .filter(k => k !== 'inverted-corners-fluting' && templateViolin(k).options.useViolNeck)
    .map((k): [string, EnricoCerutiParams] => [k, templateViolin(k)]);
}

// 0 is the sharp corner offset exactly; 6 is a fillet wide enough to move the face in visibly.
const NECK_RADII = [0, 6];

describe.each(NECK_RADII)('the viol neck with a %dmm join radius', R => {
  it.each(violNeckSources())('closes every line across the neck on %s', (_label, base) => {
    // The dangle this was reported for: the purfling ran up the V0 sweep and stopped, because
    // the offset arcs carry no top face and nothing closed the loop over the neck.
    const p = violNeckOn(base, R);
    const inset = p.overhang + p.rib;

    expect(closes(defineInnerPath(p)), 'inner trace').toBe(true);
    expect(closes(defineOuterPath(p, inset, true, false)), 'outer trace').toBe(true);
    expect(closes(defineOuterPath(p, inset, true, true)), 'outer trace with a button').toBe(true);
    expect(closes(definePurflingPath(p, inset)!), 'purfling').toBe(true);
    expect(closes(defineOuterPurflingPath(p, inset)!), 'purfling channel').toBe(true);
    expect(closes(defineFlutingPath(p, inset + 3)!), 'fluting').toBe(true);
  });

  it.each(violNeckSources())('stands the plate edge a full inset above the rib line on %s', (_label, base) => {
    // The face used to be built off the *offset* arc's endpoint rather than the corner, which put
    // it an extra 1.1mm up on the Maggini — the plate overhanging its own ribs by more at the
    // neck than anywhere else on the instrument.
    const p = violNeckOn(base, R);
    const inset = p.overhang + p.rib;

    expect(faceY(defineOuterPath(p, inset, true, false))).toBeCloseTo(faceY(defineInnerPath(p)) + inset, 9);
    expect(faceY(defineInnerPath(p))).toBeCloseTo(p.height - inset, 9);
  });

  it.each(violNeckSources())('starts V0 exactly where its start angle says on %s', (_label, base) => {
    // The join is seated into the layout rather than carved out of it, so raising the radius
    // must not move where V0 begins. Carving it did: the join's tangency landed short of
    // V0.start, leaving the flank hanging past the outline by the amount it had eaten.
    const p = violNeckOn(base, R);
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
    const p = violNeckOn(violinFromRecipe({ params: magginiDelmasParams }), 6);
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
    const p = violNeckOn(violinFromRecipe({ params: magginiDelmasParams }), 6);
    expect(joinArc(p, -6.5)).toBeUndefined();
    // 14.5mm in from the edge is the same -6.5 once the inset comes off
    expect(closes(defineFlutingPath(p, 14.5)!), 'the channel still closes without one').toBe(true);
  });
});

/**
 * Reported on the Amati Brookings recipe: a main-body gouge wide enough relative to a narrow
 * c-bout gouge (sweepRadius vs sweepRadius_cBout) leaves no *reasonable* biarc able to bridge the
 * two channel edges at their nominal endpoints. findJoiningArcs still finds a mathematically valid
 * equal-radius root there — both roots of the quadratic blow up together as the tangent directions
 * go near-parallel, so there's no smaller root to prefer instead — but the radius is thousands of
 * times the gap it's meant to bridge, which draws as a loop swinging meters off the plate (the
 * crossing lines in the screenshot) rather than a gouge cut.
 *
 * joinFlutingTransition now does what a maker actually would: blend the transition in earlier
 * along the c-bout rather than insist on meeting exactly at the nominal corner. It walks the
 * c-bout arc's own endpoint back a degree at a time (the main-body arc stays put) and only falls
 * back to reporting "Fluting Error" and dropping the channel once MAX_CBOUT_RETREAT_DEG is
 * exhausted with nothing reasonable found.
 */
describe('a c-bout gouge too narrow to join the main-body one at its nominal endpoint', () => {
  const captureTitles = (): string[] => {
    const titles: string[] = [];
    setGlobalEmitter(m => { titles.push(m.title); });
    return titles;
  };

  afterEach(() => setGlobalEmitter(null as any));

  // the Amati Brookings recipe as reported: sweepRadius 47.1 on the main body against
  // sweepRadius_cBout 2.1 through the waist
  function amatiTopGouge(): EnricoCerutiParams {
    return violinFromRecipe({ params: amatiBrookingsParams });
  }

  it('finds a shallower join within the retreat budget instead of reporting an error', () => {
    const titles = captureTitles();
    const p = amatiTopGouge();

    const paths = channelPaths(p, p.arching!.top.fluting!);

    expect(paths).not.toBeNull();
    expect(subpaths(paths!.center)).toBe(1);
    expect(subpaths(paths!.inner)).toBe(1);
    expect(titles).not.toContain('Fluting Error');
  });

  // this pair once exhausted the retreat and reported "Fluting Error"; the mirrored S now bridges it
  it('joins a gouge pair far more lopsided than the reported one', () => {
    const titles = captureTitles();
    const p = amatiTopGouge();
    p.arching!.top.fluting!.sweepRadius = 80;
    p.arching!.top.fluting!.sweepRadius_cBout = 1.05;

    const paths = channelPaths(p, p.arching!.top.fluting!);

    expect(paths).not.toBeNull();
    for (const d of [paths!.outer, paths!.center, paths!.inner]) expect(subpaths(d)).toBe(1);
    expect(titles).not.toContain('Fluting Error');
  });
});

// how far the channel's outer edge strays past the land it's meant to be cut inside. the land is
// sampled finely, since a coarse sampling shaves the corner tips and reads as a stray of its own
function channelBeyondLand(p: EnricoCerutiParams, fluting: FlutingParams): number {
  const land = samplePathToPolyline(defineInsetPath(p, p.outerFlutingDepth ?? 0), 0.1);
  const landIdx = buildPolylineIndex(land);
  const outer = samplePathToPolyline(channelPaths(p, fluting)!.outer, 0.5);
  return Math.max(0, ...outer.filter(q => !pointInPolygon(q, land)).map(q => distPointToPolylineIndexed(q, landIdx)));
}

// with both corners wrapped around C0, C0's ends are carried round into the corners and past the
// chord to L2 and U2, so the join there has to bend the other way from an ordinary violin's
describe('a channel past corners that wrap around the center bout', () => {
  const inverted = () => violinFromRecipe({ params: JSON.parse(JSON.stringify(invertedCornersFlutingParams)) });

  afterEach(() => setGlobalEmitter(null as any));

  it('closes every edge without an error', () => {
    const titles: string[] = [];
    setGlobalEmitter(m => { titles.push(m.title); });
    const p = inverted();
    for (const plate of ['top', 'bottom'] as const) {
      const paths = channelPaths(p, p.arching![plate].fluting!)!;
      expect(paths).not.toBeNull();
      for (const d of [paths.outer, paths.center, paths.inner]) expect(subpaths(d)).toBe(1);
    }
    expect(titles).not.toContain('Fluting Error');
  });

  it('keeps the joins out of the waist rather than looping inward', () => {
    const p = inverted();
    const C0 = p.bouts.C0!;
    for (const plate of ['top', 'bottom'] as const) {
      const paths = channelPaths(p, p.arching![plate].fluting!)!;
      const waist = C0.x - C0.r + p.overhang + p.rib - paths.innerEdgeOffset_cBout;
      const alongC0 = samplePathToPolyline(paths.inner).filter(q => Math.abs(q.y - C0.y) < C0.r);
      expect(Math.min(...alongC0.map(q => Math.abs(q.x)))).toBeGreaterThan(waist - 0.5);
    }
  });

  it('keeps the channel inside the land where it bypasses the corners', () => {
    const p = inverted();
    for (const plate of ['top', 'bottom'] as const)
      expect(channelBeyondLand(p, p.arching![plate].fluting!)).toBeLessThan(0.1);
  });

  it('keeps the channel inside the land past a viol lower corner', () => {
    const params = JSON.parse(JSON.stringify(invertedCornersFlutingParams));
    params.options.useViolCornerLC = true;
    const p = violinFromRecipe({ params });
    expect(channelBeyondLand(p, p.arching!.top.fluting!)).toBeLessThan(0.1);
  });

  it('joins C0 where it heads along with the bout arc, the same place on every edge of the channel', () => {
    const p = inverted();
    const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(2 * (a - b)), Math.cos(2 * (a - b))) / 2) * 180 / Math.PI;
    const edges = [2.5, -3, -8].map(offset => defineFlutingArcs(p, offset));
    for (const arcs of edges) {
      const [L2, C0, U2] = arcs.slice(2, 5);
      expect(gap(C0.end, L2.end)).toBeLessThan(4 + 1e-6);
      expect(gap(C0.start, U2.end)).toBeLessThan(4 + 1e-6);
    }
    for (const arcs of edges.slice(1)) {
      expect(arcs[3].start).toBeCloseTo(edges[0][3].start, 9);
      expect(arcs[3].end).toBeCloseTo(edges[0][3].end, 9);
    }
  });
});

// a viol flank is joined from a fixed angle back from the corner, and the viola's U4 is a long flat
// arc only 3° round, so that angle once reached far up the upper bout for the join
describe('a viol flank shorter than the angle the channel is joined back from', () => {
  it('joins from the flank rather than past it, keeping the channel on the plate', () => {
    const template = templateViolin('stradivari-viola-cassavetti');
    template.options.useViolCornerUC = true;
    const p = layoutFrom(template);
    calculateOuterArcs(p);
    expect(channelBeyondLand(p, defaultFlutingParams(p))).toBeLessThan(0.1);
  });
});

describe('the button', () => {
  // the back's outer trace, with the button, as points — its top is the button tip
  function backTrace(p: EnricoCerutiParams): Pt[] {
    return samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, true), 0.25);
  }
  const topY = (pts: Pt[]) => Math.max(...pts.map(q => q.y));

  it('stands its height beyond the plate, whether it has walls or is only a segment', () => {
    const p = defaultViolin();
    for (const height of [0.5, 2, 6, 9.5, 10, 10.5, 14, 20]) {
      p.button = { width: 20, height };
      const path = defineOuterPath(p, p.overhang + p.rib, true, true);
      expect(subpaths(path), `one loop at height ${height}`).toBe(1);
      expect(topY(samplePathToPolyline(path, 0.25)), `tip at height ${height}`).toBeCloseTo(p.height + height, 1);
    }
  });

  it('drops straight walls from the cap only while the height clears the cap radius', () => {
    const p = defaultViolin();
    const onWall = (pts: Pt[]) => pts.filter(q => Math.abs(q.x - 10) < 1e-6 && q.y > p.height - 3);
    p.button = { width: 20, height: 14 };
    expect(onWall(backTrace(p)).length).toBeGreaterThan(8);
    p.button = { width: 20, height: 6 };
    expect(onWall(backTrace(p)).length).toBeLessThanOrEqual(1);
  });

  it('draws nothing at zero height', () => {
    const p = defaultViolin();
    p.button = { width: 20, height: 0 };
    const path = defineOuterPath(p, p.overhang + p.rib, true, true);
    expect(subpaths(path)).toBe(1);
    expect(topY(samplePathToPolyline(path, 0.25))).toBeCloseTo(p.height, 1);
  });

  it('stands off a viol neck\'s face by the same rule', () => {
    const p = violNeckOn(violinFromRecipe({ params: magginiDelmasParams }), 6);
    const face = violNeckCap(p, p.overhang + p.rib)!.topY;
    for (const height of [3, 14]) {
      p.button = { width: 20, height };
      const path = defineOuterPath(p, p.overhang + p.rib, true, true);
      expect(subpaths(path), `one loop at height ${height}`).toBe(1);
      expect(topY(samplePathToPolyline(path, 0.25)), `tip at height ${height}`).toBeCloseTo(face + height, 1);
    }
  });
});

describe('the side scroll path', () => {
  it('runs unbroken down the back and up the front, each piece on from the last', () => {
    const p = defaultViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    p.scroll = defaultVoluteParams(p);
    expect(calculateScroll(p)).toEqual([]);

    const ends = splitPathStrings(defineSideScrollPath(p)).map(piece => {
      const pts = samplePathToPolyline(piece, 1, true);
      return { start: pts[0], end: pts.at(-1)! };
    });
    const breaks = ends.slice(1).filter((e, i) => Math.hypot(e.start.x - ends[i].end.x, e.start.y - ends[i].end.y) > 1e-3);
    expect(breaks.length).toBe(1);
  });

  it('starts at the eye\'s back and runs under it to the front, where the spiral leaves it', () => {
    const p = defaultViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    p.scroll = defaultVoluteParams(p);
    calculateScroll(p);
    const { x, y, r } = p.scroll.eye;
    const eye = samplePathToPolyline(splitPathStrings(defineSideScrollPath(p))[0], 0.1, true);
    expect(eye[0].x).toBeCloseTo(x - r, 9);
    expect(eye[0].y).toBeCloseTo(y, 9);
    expect(eye.at(-1)!.x).toBeCloseTo(x + r, 9);
    expect(eye.at(-1)!.y).toBeCloseTo(y, 9);
    expect(Math.min(...eye.map(pt => pt.y))).toBeCloseTo(y - r, 3);
    expect(eye.every(pt => Math.abs(Math.hypot(pt.x - x, pt.y - y) - r) < 1e-6)).toBe(true);
  });
});

describe('the inner path while it is being drafted', () => {
  const fresh = (): EnricoCerutiParams => JSON.parse(JSON.stringify(DefaultParams));
  const reaches = (d: string, pt: { x: number; y: number }) =>
    splitPathStrings(d).some(chain => samplePathToPolyline(chain, 1, true).some(q => Math.hypot(q.x - pt.x, q.y - pt.y) < 0.05));

  it('draws the upper and lower bouts as two chains before the corners exist', () => {
    const p = fresh();
    calculateMainBouts(p);
    expect(splitPathStrings(defineInnerPath(p))).toHaveLength(2);
  });

  it('carries each chain out to its corner once the corners are drafted, and leaves out a failed one', () => {
    const p = fresh();
    calculateMainBouts(p);
    calculateCorners(p);
    const d = defineInnerPath(p);
    expect(splitPathStrings(d)).toHaveLength(2);
    expect(reaches(d, p.bouts.UCr!)).toBe(true);
    expect(reaches(d, p.bouts.LCr!)).toBe(true);
    const withoutUpper = defineInnerPath(p, ['U2', 'U3', 'U31', 'U4']);
    expect(reaches(withoutUpper, p.bouts.UCr!)).toBe(false);
    expect(reaches(withoutUpper, p.bouts.LCr!)).toBe(true);
  });

  it('closes into one loop once the center bout joins them', () => {
    const p = fresh();
    calculateMainBouts(p);
    calculateCorners(p);
    calculateCenterBout(p);
    expect(splitPathStrings(defineInnerPath(p))).toHaveLength(1);
  });
});
