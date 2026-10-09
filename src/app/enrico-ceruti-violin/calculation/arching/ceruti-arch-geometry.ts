import { Pt } from '../../../models/types';
import { clamp, smoothstep } from '../../../helpers/math/simpleGeometry';
import { buildPolylineIndex, closestPointToPolylineIndexed, makeC2SplineWithFlatKnot, makeMonotoneSpline, PolylineIndex, archSplineKnots, catenaryZAt, cycloidZAt, splineZAt } from '../../../helpers/math/vibeMath';
import { samplePathToPolyline } from '../../../helpers/math/pathMath';
import { ArchCurve, EnricoCerutiParams, CrossArchShape, CrossArchCycloid, CrossArchSpline, FlutingParams } from '../../ceruti-types';
import { defineFlutingPath, defineInsetPath } from '../outline/ceruti-paths';
import { archFromLoweredTakeoff, normalizeCrossArchStations } from './ceruti-arching';

// The three things the arch is actually solved from: the gouge's own circular
// section, the crown across the plate, and the tangency that joins them. Plus
// the plate geometry that holds all of it together for a given recipe.
//
// See the block comment above {@link FlutingParams} for the order of operations
// the whole model follows — it is the bench order, and this file follows it.
//
// The long-arch profile and the station bookkeeping live next door in
// ceruti-arching.ts, which is the layer above: it decides *where* a section is
// taken and how tall the arch stands there, and asks here for its shape.

/** A gouge sweep this shallow relative to its depth isn't a real tool; guards the sqrt below. */
const MIN_SWEEP_RATIO = 1.0001;

/**
 * Half-width of the cut a gouge of sweep radius `R` leaves at depth `D` — the
 * chord where the circular section returns to the plate surface.
 *
 * This is the number that makes the whole model work: it depends only on the
 * tool, so it is the same at the waist, at the widest bout, and around the
 * corners.
 *
 * Zero when the gouge is too shallow to reach `D` at all (D ≥ R), which the
 * panel prevents but a hand-edited recipe could carry.
 */
export function gougeHalfWidth(sweepRadius: number, depth: number): number {
  if (sweepRadius <= 0 || depth <= 0) return 0;
  if (depth * MIN_SWEEP_RATIO >= sweepRadius) return 0;
  return Math.sqrt(2 * sweepRadius * depth - depth * depth);
}

/**
 * The channel's transverse section: height relative to the plate outer surface
 * at `s` mm from the channel centerline. −`depth` at the trough (s = 0), rising
 * to 0 at ±{@link gougeHalfWidth}, and flat 0 beyond — the arc a gouge of this
 * sweep actually cuts, not a fitted approximation to one.
 */
export function gougeProfileZ(s: number, sweepRadius: number, depth: number): number {
  const w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0 || Math.abs(s) >= w) return 0;
  return -depth + sweepRadius - Math.sqrt(Math.max(sweepRadius * sweepRadius - s * s, 0));
}

/**
 * dz/ds of {@link gougeProfileZ} — the slope the arch's transition must match
 * where it lands on the channel. Positive moving away from the trough in either
 * direction, so callers working on the inner flank (s > 0) can use it directly.
 */
export function gougeProfileSlope(s: number, sweepRadius: number, depth: number): number {
  const w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0 || Math.abs(s) >= w) return 0;
  const denom = Math.sqrt(Math.max(sweepRadius * sweepRadius - s * s, 0));
  return denom <= 0 ? 0 : s / denom;
}

/** A starting gouge for a plate, sized by instrument family like {@link defaultArchingParams}. */
export function defaultFlutingParams(p: EnricoCerutiParams): FlutingParams {
  const [sweepRadius, depth, sweepRadius_cBout] =
    p.height < 400 ? [15, 1, 7.5] :    // violin
    p.height < 500 ? [18, 1.5, 9] :    // viola
    p.height < 800 ? [28, 2, 14] :     // cello
    [38, 2.5, 19];                     // bass
  return { sweepRadius, depth, sweepRadius_cBout, cornerGouge: true };
}

/**
 * The sweep actually in force through the C-bout: the override when it is set
 * and can cut to `depth`, else the main gouge. A sweep smaller than the depth
 * describes no real tool, so it falls back rather than producing a degenerate
 * channel through the waist.
 */
export function effectiveCBoutSweep(g: FlutingParams): number {
  const c = g.sweepRadius_cBout;
  return c !== null && gougeHalfWidth(c, g.depth) > 0 ? c : g.sweepRadius;
}

/**
 * The corner smoothing, as a height field: the wedge of flat wood the bypassing
 * channel leaves at each corner, taken down by hand to meet the channel.
 *
 * The arch meets the channel first, and the smoothing runs from wherever that
 * is out to the land edge, however far that has become. So this is the
 * channel's outer flank stretched across the run from `from` (the arch's
 * contact when it lands past the trough, else the trough itself; `s` is negative
 * outboard) to the land edge (`edgeDist` inward from it). Along the flanks that
 * run is exactly the flank's own length and the stretch is 1, so this returns
 * what the channel already does; it only departs from it where the corner has
 * pulled the land edge away.
 *
 * Starting at the contact rather than always at the trough is what keeps the
 * surface whole there: an arch past 100% lands on the outer flank, and a flank
 * lowered under its landing left a step down at the corners.
 *
 * Stretched uniformly from the trough, where the flank is level and any stretch
 * leaves it level. From a landing up the flank the arch arrives at a grade, and
 * a uniform stretch of what is left flattens that grade into a crease. So the
 * stretch eases out instead — leaving at the flank's own grade and flattening
 * toward the land edge — by exactly as much as the landing is up the flank. A
 * maker carries the arch's climb on and lets it run out flat across the wedge.
 *
 * Never above the channel's own outer flank, so composing it by minimum can only
 * remove wood, and is inert inboard of `from` and past the land edge.
 */
export function cornerSmoothZ(s: number, edgeDist: number, sweepRadius: number, depth: number, from = 0): number {
  const w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0 || s >= from || edgeDist <= 0) return 0;
  // the flank left to climb from the landing, and how long that climb is here, wedge included
  const left = w + from;
  const run = Math.max(edgeDist - s + from, left);
  const u = (from - s) / run;
  const stretch = run / left;
  const ease = 1 + (stretch - 1) * smoothstep(-from, 0, CORNER_EASE_BAND * w);
  return gougeProfileZ(from - left * (1 - Math.pow(1 - u, ease)), sweepRadius, depth);
}

/**
 * How far up the outer flank a landing must sit, in half-widths, before the
 * corner stretch eases out fully. Under this the flank is nearly level at the
 * landing, so a uniform stretch leaves next to no crease — and the ease has to
 * come in gradually, since a landing crossing the trough between two stations
 * would otherwise switch the wedge's whole shape between them.
 */
const CORNER_EASE_BAND = 0.25;

/**
 * The crown a plate is seeded with when it has none — a trochoid, to match the
 * catenary long arch `defaultArchingParams` seeds alongside it.
 *
 * Both are one-line curves with nothing to author: no instrument in
 * `ceruti-templates.ts` ships measured arching, so what the maker meets on
 * opening a template should be the shape that states itself in two numbers
 * rather than a control-point template inviting them to move knots around a
 * curve nobody measured.
 */
export function defaultCrossArchParams(): CrossArchCycloid {
  return defaultCrossArchCycloidParams();
}

/**
 * A control-point crown: one mirrored knot, part way out from the joint.
 *
 * Deliberately a single point. The crown is anchored at both ends already — the
 * peak at the centerline and the solved takeoff in the channel — so one knot is
 * all it takes to describe a curve, and it is the shortest route to seeing what
 * the knot does. Points are cheap to add; a default that arrives pre-shaped
 * mostly gives the maker someone else's arch to argue with.
 *
 * Out toward the channel rather than in near the joint, which is where a maker
 * reading a section would put the one point they were given: the crown's own
 * height is already pinned, so a knot earns its place by saying where the arch
 * turns over into the run-out.
 */
export function defaultCrossArchSplineParams(): CrossArchSpline {
  return { type: 'spline', points: [{ x: 0.66, z: 0.5, mirror: true }] };
}

/**
 * A trochoid crown, a little fuller than a raised cosine and clipped just short
 * of the flat cusp — a plate that reads as arched from the moment it is seeded
 * or the curve type is switched, rather than one the maker has to dial out of a
 * degenerate shape.
 */
export function defaultCrossArchCycloidParams(): CrossArchCycloid {
  return { type: 'cycloid', d: 0.4, pct: 0.9 };
}

/** The catenary crown — see {@link CrossArchShape}, nothing to seed beyond the tag. */
export function defaultCrossArchCatenaryShape(): CrossArchShape {
  return { type: 'catenary' };
}

/**
 * The three loops a gouged channel is drawn from: its outer edge, the
 * centerline the gouge follows, and its inner edge.
 *
 * There is no free centerline parameter. The channel's outer edge *is* the
 * edge of the flat land — `outerFlutingDepth`, already authored in the Outer
 * Path panel alongside the purfling, and a real thing the maker cuts to. The
 * gouge then decides everything inward of it: the centerline sits one
 * half-width in, the inner edge two. A separately-positioned channel could
 * only ever disagree with the land it is supposed to start at.
 *
 * So {@link innerEdgeOffset}, how far in the channel reaches, is an output
 * here and not an input.
 *
 * Built with {@link defineFlutingPath}, which bypasses the corners via
 * `findJoiningArcs`. Offsetting an arc by a constant gives a concentric arc, so
 * the constant width is exact by construction — not sampled, not approximated,
 * and true through the corner joins as well.
 *
 * Null where the fluting isn't configured yet (no purfling offset).
 */
export interface ChannelPaths {
  center: string;
  inner: string;
  outer: string;
  /** mm inward from the plate edge to the channel's inner edge — the derived `innerFlutingDepth`. */
  innerEdgeOffset: number;
  /** The same, through the C-bout, where a second gouge may be in force. */
  innerEdgeOffset_cBout: number;
}

export function channelPaths(p: EnricoCerutiParams, g: FlutingParams): ChannelPaths | null {
  const w = gougeHalfWidth(g.sweepRadius, g.depth);
  if (w <= 0) return null;
  const wC = gougeHalfWidth(effectiveCBoutSweep(g), g.depth);

  // Anchored at the land's edge and growing inward, so the outer edge lands on
  // the platform boundary by construction rather than by the maker matching two
  // numbers up. The two curves still differ at the corners — this one bypasses
  // them, the platform boundary follows them — and that difference is exactly
  // the corner-join region, with no spurious ring along the flanks.
  const edge = p.outerFlutingDepth ?? 0;

  // A second gouge through the waist moves only the inward offsets, which is
  // what defineFlutingPath's third argument varies (it re-offsets the C-bout
  // arc alone). The arcs either side of it no longer meet it head-on, but
  // defineFlutingArcs joins every C-bout junction with findJoiningArcs — a
  // biarc solve from each neighbour's endpoint *and tangent* — so the join
  // simply re-solves at the new radius and the loop stays closed and tangent.
  // Passed only when it actually differs, since defineOffsetArcs tests the
  // argument for truthiness and a coincidental zero would silently fall back.
  const at = (offset: number, offsetC: number): string | null =>
    defineFlutingPath(p, offset, Math.abs(offsetC - offset) > 1e-9 ? offsetC : undefined);

  // The outer edge is the land edge everywhere — that is what the maker cuts
  // to, and it is the one line the second gouge must not move.
  const outer = at(edge, edge);
  const center = at(edge + w, edge + wC);
  const inner = at(edge + 2 * w, edge + 2 * wC);
  return center && inner && outer
    ? { center, inner, outer, innerEdgeOffset: edge + 2 * w, innerEdgeOffset_cBout: edge + 2 * wC }
    : null;
}

/** The carved channel itself, as a fillable annulus between its two edges. */
export function channelAreaPath(paths: ChannelPaths): string {
  return `${paths.outer} Z ${paths.inner} Z`;
}

/**
 * The corner-join region: wood the gouge never reaches, which a maker carves
 * out by hand to *meet* the channel.
 *
 * It is simply the area between the platform's outer boundary and the channel's
 * outer edge — near-nothing along the flanks, ballooning at the corners,
 * because the platform boundary *follows* the corners while the channel
 * *bypasses* them. Expressed as one even-odd fill of the two loops rather than
 * a sampled distance test, so it is exact and needs no tolerance.
 *
 * That it shows up as a real, nameable region is the point: the corners are a
 * separate operation at the bench, and letting them distort the channel instead
 * would put a widening in the one place no maker's channel widens.
 */
export function cornerJoinAreaPath(p: EnricoCerutiParams, paths: ChannelPaths): string {
  return `${defineInsetPath(p, p.outerFlutingDepth ?? 0)} Z ${paths.outer} Z`;
}

// Where the arch stops being the template and becomes the run into the channel.
//
// The whole model turns on this staying an *answer* rather than a question. A
// model earns its keep by solving for something, not by having few knobs; make
// the gouge an input and that solving has to go somewhere, or the maker
// inherits it as a pile of new parameters.
//
// It goes here. Tangency against a known circle is one equation, so exactly one
// unknown is needed to satisfy it: the contact point, free to slide along the
// channel's inner flank. Nobody chooses where the blend begins at the bench
// either — the tool and the wood decide.

/** Where an arch lands on the channel, and how deep it is when it gets there. */
export interface ArchTakeoff {
  /** Distance from the channel centerline to the contact point (mm); 0 is the trough, negative on the outer flank. */
  contactS: number;
  /** How far below the plate surface the arch takes off (mm) — 0 at the channel's inner edge. */
  takeoffDepth: number;
  /** The channel's slope there, which the arch matches — or comes nearest to matching. */
  slope: number;
  /**
   * Whether this is a true tangency.
   *
   * False means the arch cannot come tangent to the channel anywhere along the
   * flank, and this is its closest approach instead. The distinction is for
   * *reporting*, not for geometry: the surface uses this point either way, so a
   * station that cannot quite solve still lands beside the ones that can.
   */
  tangent: boolean;
}

/** Depth below the plate surface at `s` from the centerline — {@link gougeProfileZ} negated. */
function takeoffDepthAt(s: number, sweepRadius: number, depth: number): number {
  return -gougeProfileZ(s, sweepRadius, depth);
}

/**
 * Solves for the contact point where an arch meets the channel tangentially.
 *
 * `archSlopeAt` reports the slope the arch would arrive with at a given
 * contact — supplied by the caller, since the long arch and the cross arch
 * build their curves differently while sharing this geometry exactly. The
 * residual is that slope minus the channel's own, and a root of it is a
 * tangent meeting.
 *
 * Bracketed by a coarse scan before bisecting rather than assuming the
 * residual is monotone: it is generically well-behaved (at the trough the
 * channel is flat while the arch arrives steep; at the inner edge the channel
 * is at its steepest while the arch has the shortest drop) but both the span
 * and the takeoff depth move with the contact, so monotonicity isn't
 * something to bet the geometry on.
 *
 * When no root exists, the closest approach is returned instead, flagged
 * `tangent: false` — the arch and channel genuinely cannot meet, which is real
 * information about an unbuildable instrument, but it's for the *panel* to
 * report rather than grounds for handing back no geometry at all.
 *
 * That's why this doesn't just return null. The residual is a difference of
 * two small slopes, and near the body caps — where the long arch has barely
 * climbed clear of the channel — both terms go to zero together, so whether
 * the difference crosses zero comes down to the last few digits. Solvability
 * then flickers off for a single station between two that solve fine, which
 * is not a fact about the instrument.
 *
 * The old fallback made that flicker visible badly: a station with no root
 * was pinned at the channel's inner edge (s ≈ w, the top of the flank) while
 * its neighbours had solved to s ≈ 0.02·w, down at the trough — opposite ends
 * of the same flank, so the surface stepped by nearly the full channel depth
 * at one station and rang a seam round the cap. Closest approach lands beside
 * the neighbours instead, because a residual that only just fails to cross
 * zero is nearest to zero right about where it would have crossed.
 *
 * Null is now reserved for a channel with no flank to land on at all.
 */
export function solveArchTakeoff(
  sweepRadius: number,
  depth: number,
  archSlopeAt: (takeoffDepth: number, contactS: number) => number,
  scanSteps = 32,
): ArchTakeoff | null {
  const w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0) return null;

  // Held just inside both ends: at s = 0 the channel is exactly flat and at
  // s = w it has left the cut, and neither endpoint is a meeting we want to
  // return as a solution in its own right.
  const lo = w * 1e-3, hi = w * (1 - 1e-3);
  const residual = (s: number): number =>
    archSlopeAt(takeoffDepthAt(s, sweepRadius, depth), s) - gougeProfileSlope(s, sweepRadius, depth);

  const takeoffAt = (contactS: number, tangent: boolean): ArchTakeoff => ({
    contactS,
    takeoffDepth: takeoffDepthAt(contactS, sweepRadius, depth),
    slope: gougeProfileSlope(contactS, sweepRadius, depth),
    tangent,
  });

  // Tracked alongside the bracket hunt rather than in a second pass, so the
  // fallback costs nothing when a root is found and no extra residuals when it
  // is not — each one rebuilds the profile spline, which is the expensive part.
  let nearest = { s: lo, mag: Infinity };
  // The inner flank first, so every arch that already met it lands where it did.
  // An arch that arrives sloping down — its first knot below the takeoff — has
  // no tangent there, and meets the outer flank instead, past the trough.
  const bracketOn = (dir: 1 | -1): [number, number, number] | null => {
    let aS = dir * lo, aR = residual(aS);
    if (Math.abs(aR) < nearest.mag) nearest = { s: aS, mag: Math.abs(aR) };
    for (let i = 1; i <= scanSteps; i++) {
      const s = dir * (lo + ((hi - lo) * i) / scanSteps);
      const r = residual(s);
      if (Math.abs(r) < nearest.mag) nearest = { s, mag: Math.abs(r) };
      if (aR === 0) return [aS, aR, aS];
      if (aR * r < 0) return aS < s ? [aS, aR, s] : [s, r, aS];
      aS = s; aR = r;
    }
    return null;
  };
  const bracket = bracketOn(1) ?? bracketOn(-1);
  if (!bracket) return takeoffAt(nearest.s, false);

  let [x0, r0, x1] = bracket;
  for (let i = 0; i < 60 && x1 - x0 > 1e-9; i++) {
    const mid = (x0 + x1) / 2;
    const rMid = residual(mid);
    if (r0 * rMid <= 0) x1 = mid; else { x0 = mid; r0 = rMid; }
  }
  return takeoffAt((x0 + x1) / 2, true);
}

/** Arch height at `s` along a span, for whichever curve type the plate carries. */
function archZAt(arch: ArchCurve, span: number, s: number, endZ = 0): number {
  switch (arch.type) {
    case 'catenary': return catenaryZAt(arch.archHeight, span, s);
    case 'cycloid':  return cycloidZAt(arch.archHeight, span, arch.d, s);
    case 'spline':   return splineZAt(arch.archHeight, span, arch.points, arch.peak ?? 0.5, s, endZ);
  }
}

/**
 * The long arch, terminated where it meets the channel at the body caps.
 *
 * `span`/`yStart` come out of the solve rather than from a stored channel
 * reach, so the arch runs *into* the channel's inner flank rather than stopping
 * at its edge.
 */
export interface LongArchSolve {
  span: number;
  yStart: number;
  yEnd: number;
  /** The start end's landing; the plate-surface-relative Z the arch takes off from is −takeoffDepth. */
  takeoff: ArchTakeoff;
  /** The far end's landing. It differs from `takeoff` only for an arch that is not symmetric end to end. */
  farTakeoff: ArchTakeoff;
  /** The arch restated against the start takeoff, ready for the path builders. */
  lowered: ArchCurve;
  /** The far end's height in the `lowered` frame — zero when both ends land alike. */
  farZ: number;
}

function isSymmetric(arch: ArchCurve): boolean {
  if (arch.type !== 'spline') return true;
  const k = archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5);
  return k.every((a, i) => {
    const b = k[k.length - 1 - i];
    return Math.abs(a.t + b.t - 1) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
  });
}

function mirrored(arch: ArchCurve): ArchCurve {
  return arch.type === 'spline'
    ? { ...arch, peak: 1 - (arch.peak ?? 0.5), points: arch.points.map(pt => ({ ...pt, t: 1 - pt.t })) }
    : arch;
}

export function solveLongArch(
  p: EnricoCerutiParams, arch: ArchCurve, g: FlutingParams,
): LongArchSolve | null {
  const w = gougeHalfWidth(g.sweepRadius, g.depth);
  if (w <= 0 || arch.archHeight <= 0) return null;
  // Channel centerline at the caps. The C-bout gouge never applies here — it
  // only ever affects the waist — so the main sweep governs at both ends.
  const centerY = (p.outerFlutingDepth ?? 0) + w;
  const eps = Math.max(p.height * 1e-5, 1e-4);

  // Each end is solved as the start of its own view of the arch, against
  // wherever the other end currently lands; the far end sees the mirrored arch.
  const solveEnd = (a: ArchCurve, other: ArchTakeoff | null): ArchTakeoff | null =>
    solveArchTakeoff(g.sweepRadius, g.depth, (takeoffDepth, contactS) => {
      const o = other ?? { takeoffDepth, contactS };
      const span = p.height - 2 * centerY - contactS - o.contactS;
      if (span <= 0) return 0;
      const lowered = archFromLoweredTakeoff(a, takeoffDepth);
      // Forward difference from the takeoff, which sits at exactly 0 in the
      // lowered arch's own frame — no cancellation to worry about.
      return archZAt(lowered, span, eps, takeoffDepth - o.takeoffDepth) / eps;
    });

  let start = solveEnd(arch, null);
  if (!start) return null;
  let far = start;
  if (!isSymmetric(arch)) {
    // the ends nudge each other's span and level only weakly, so a few sweeps settle it
    const flipped = mirrored(arch);
    for (let i = 0; i < 3; i++) {
      far = solveEnd(flipped, start) ?? far;
      start = solveEnd(arch, far) ?? start;
    }
  }
  const yStart = centerY + start.contactS;
  const yEnd = p.height - centerY - far.contactS;
  const span = yEnd - yStart;
  if (span <= 0) return null;
  return {
    span, yStart, yEnd, takeoff: start, farTakeoff: far,
    lowered: archFromLoweredTakeoff(arch, start.takeoffDepth),
    farZ: start.takeoffDepth - far.takeoffDepth,
  };
}

/**
 * The plate's centerline elevation at body height `y`, relative to the plate
 * surface — flat land at the caps, then down through the channel, then the arch
 * all the way over and back.
 *
 * One function across the whole body rather than three pieces stitched at the
 * ends, because there is no seam to stitch: the arch's takeoff was solved to
 * meet the channel's flank at the same height *and* the same slope, so the two
 * branches agree to the tolerance the solve was run to. That is the property
 * the whole model exists for.
 *
 * `la` is the plate's solved long arch; without one the plate is channel and
 * land only, which is what an arch too high to meet its channel leaves.
 */
export function channelCenterlineZAt(
  p: EnricoCerutiParams, g: FlutingParams, la: LongArchSolve | null, y: number,
): number {
  const w = gougeHalfWidth(g.sweepRadius, g.depth);
  const centerY = (p.outerFlutingDepth ?? 0) + w;
  // Distance from the nearer cap's channel centerline, so both ends are the
  // same arithmetic — the caps are identical by symmetry, and the C-bout gouge
  // never reaches either of them.
  const s = Math.min(y, p.height - y) - centerY;
  if (la && y > la.yStart && y < la.yEnd) {
    return archZAt(la.lowered, la.span, y - la.yStart, la.farZ) - la.takeoff.takeoffDepth;
  }
  return s <= -w ? 0 : gougeProfileZ(Math.min(s, w), g.sweepRadius, g.depth);
}

/**
 * The channel's own section at a body cap, in the long-arch section view
 * (canvas X = Z, canvas Y = body length). This is the recurve, and it is the
 * same at both ends and at every station, because it is the tool rather than a
 * fitted curve.
 */
export function channelCapPath(
  p: EnricoCerutiParams, g: FlutingParams, xBase: number, sign: 1 | -1, atStart: boolean,
  sEnd?: number, n = 40,
): string {
  const w = gougeHalfWidth(g.sweepRadius, g.depth);
  if (w <= 0) return '';
  const centerY = (p.outerFlutingDepth ?? 0) + w;
  // Stops at the arch's contact when one is given: past that point the arch is
  // the surface, and drawing the full cut over the top of it would show wood
  // that isn't there.
  const end = Math.min(sEnd ?? w, w);
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const s = -w + ((end + w) * i) / n;
    const y = atStart ? centerY + s : p.height - centerY - s;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * gougeProfileZ(s, g.sweepRadius, g.depth)} ${y}`);
  }
  return pts.join(' ');
}

/**
 * How many knots a trochoid crown is sampled into, evenly across the crown's
 * span. Enough that re-splining reproduces the curve closely, and small enough
 * that the transition solve — which rebuilds this spline at every bisection
 * step — stays cheap.
 *
 * The last sampled knot sits at N/(N+1) of the way to the takeoff, leaving
 * the final stretch into the channel to the solve.
 */
const CYCLOID_CROWN_KNOTS = 24;

// past 1 the window runs beyond the cusp, so the ends curl under the takeoff and back up; 1.5 dips a full rise
export const CYCLOID_MAX_PCT = 1.5;

/** One authored knot of a crown shape, both coordinates as fractions. */
export interface CrossArchKnot {
  /** Distance from the joint as a fraction of the way to the channel's inner edge — positive; sides are resolved first. */
  x: number;
  /** Height above plate level as a fraction of the local arch height. */
  z: number;
}

/**
 * A shape's knots on one side, unsigned and sorted outward.
 *
 * Nothing is scaled here: knots are fractions of the station's own half-width
 * and arch height, so they mean the same shape wherever they are carried. That
 * is the point of the fractional form — a crown described in millimetres is a
 * rigid object, and a plate that narrows toward the ends would wear it badly.
 */
export function crossArchKnots(shape: CrossArchShape, side: 1 | -1): CrossArchKnot[] {
  // A trochoid is symmetric about the crown, so `side` has nothing to select.
  if (shape.type === 'cycloid') return cycloidCrownKnots(shape);
  // Never actually reached — solveCrossArchSection and crossArchGuide both branch around the
  // knot pipeline for a catenary — but the type is still CrossArchShape here.
  if (shape.type === 'catenary') return [];

  const out: CrossArchKnot[] = [];
  for (const pt of shape.points) {
    const onThisSide = Math.sign(pt.x) === side;
    if (!onThisSide && !pt.mirror) continue;
    const x = Math.abs(pt.x);
    if (x <= 1e-6) continue;
    out.push({ x, z: pt.z });
  }
  out.sort((a, b) => a.x - b.x);
  // Two knots at the same position describe one place on the shape; the first
  // wins, matching how archSplineKnots collapses colliding knots.
  return out.filter((k, i) => i === 0 || k.x - out[i - 1].x > 1e-6);
}

/**
 * Half a trochoid, sampled into the same fractional knots an authored template
 * carries — crown outward to the takeoff.
 *
 * Sampling rather than evaluating is deliberate: everything downstream of the
 * knots — the station ramp, the full-width spline, the tangency solve, the
 * surface — already works in terms of a knot list and needs no notion of which
 * curve family produced it. A shape can even ramp from a trochoid station to
 * an authored one, because the resolver interpolates positions, not
 * parameters.
 *
 * The price is that the curve the surface actually carries is a monotone
 * cubic *through* the trochoid rather than the trochoid itself. At this knot
 * count the two are indistinguishable next to the wood, and the
 * reconstruction is strictly better behaved: the spline cannot overshoot,
 * whereas a true d=1 cusp has an infinite edge slope for the solve to run
 * into.
 *
 * Positions are walked evenly and stop short of the takeoff — see
 * {@link CYCLOID_CROWN_KNOTS}.
 */
function cycloidCrownKnots(shape: CrossArchCycloid): CrossArchKnot[] {
  const d = clamp(shape.d, 0, 1);
  const pct = clamp(shape.pct, 0.05, CYCLOID_MAX_PCT);
  const n = CYCLOID_CROWN_KNOTS;
  const out: CrossArchKnot[] = [];
  for (let i = 1; i <= n; i++) {
    // Crown fraction (0 = crown, 1 = channel centerline) back onto the
    // trochoid's own span, where 0.5 is the peak and 0 the outer end.
    const x = i / (n + 1);
    out.push({ x, z: clamp(cycloidZAt(1, 1, d, 0.5 * (1 - x), pct), -1, 1) });
  }
  return out;
}

/**
 * The defined shape nearest a body-length position — the base shape (which
 * anchors both body ends) or the closest station.
 *
 * Used for the panel's readout while browsing between stations, and *not* an
 * evaluation of the surface there: {@link makeCrossArchResolver} ramps the
 * sampled knot positions, so the real shape at an in-between station is a blend
 * of its neighbours. There is nothing to show for that blend in the fields —
 * two shapes can differ in knot count entirely, and a ramped trochoid is no
 * longer a trochoid of any `d`. Showing the nearest real shape is at least a
 * shape the maker authored, and every edit opens a draft station here anyway
 * rather than writing back to it.
 */
export function nearestCrossArchShape(
  cross: CrossArchShape, y: number, bodyHeight: number,
): CrossArchShape {
  // A catenary has no stations to be nearer to — it is the same shape everywhere.
  if (cross.type === 'catenary') return cross;
  // Widened explicitly: `stations` is a union of two arrays, and inference
  // would otherwise pin the type parameter to whichever arm comes first.
  const stations = normalizeCrossArchStations<CrossArchShape>(cross.stations, bodyHeight);
  let best: CrossArchShape = cross;
  let bestDist = Math.min(y, bodyHeight - y);
  for (const s of stations) {
    const d = Math.abs(s.y - y);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/**
 * A shape's height fraction as a continuous function of position fraction,
 * anchored at *both* ends.
 *
 * Those anchors are what the frame means (see {@link KnotFrame}): the crown at
 * (0, 1), and the channel's inner edge, which is at plate level, at (1, 0). The
 * profile itself runs on past that edge to the solved takeoff, but a shape read
 * at another shape's knot position only ever needs the part inside the frame.
 *
 * It used to hold flat past the outermost knot on the grounds that nothing is
 * authored out there. Alone that was harmless, but it made the resolver invent
 * plateaus: a station knot at some other position forces every *other* shape to
 * report a height there, and a held-flat answer claims "level with my outermost
 * knot" — a definite statement the shape never made. Two ramped columns then
 * land at nearly equal heights and the monotone spline, correctly, draws a flat
 * between them. Descending toward the channel instead says what the shape
 * actually does out there.
 */
function knotFunction(knots: CrossArchKnot[]): (x: number) => number {
  const xs = [0, ...knots.map(k => k.x), 1];
  const zs = [1, ...knots.map(k => k.z), 0];
  const f = makeMonotoneSpline(xs, zs);
  return x => f(clamp(x, 0, 1));
}

/**
 * A crown shape resolved to one body station: its knots on each side, still fractional.
 *
 * A catenary row carries no knots at all — `left`/`right` sit empty and `catenary` is what
 * `solveCrossArchSection` actually branches on. Folded into this one shape rather than a
 * separate union member so the resolver keeps one return type regardless of curve type, and so
 * every existing `{ left, right, peak? }` call site (the specs included) stays a valid row.
 */
export interface CrossArchRow {
  left: CrossArchKnot[];
  right: CrossArchKnot[];
  /**
   * Where the crown sits, as a fraction of the full centerline chord — 0.5 is
   * the joint. Optional for the same reason the shape's own `peak` is: absent
   * means centred, which is what every row meant before the crown could move.
   */
  peak?: number;
  /** True for a catenary crown — see the type header. */
  catenary?: boolean;
  /**
   * True for a trochoid: its knots are sampled from a curve whose end *is* the takeoff, so they
   * are fractions of each side's takeoff rather than of the fixed frame (see {@link KnotFrame}).
   */
  fromTakeoff?: boolean;
}

export type CrossArchResolver = (y: number) => CrossArchRow;

/**
 * Ramps a plate's crown shape along the body.
 *
 * Two stations can carry entirely different knot lists, so there is no knot to
 * knot correspondence to interpolate. Sampling every shape onto one dense fixed
 * grid would give that correspondence, but the union of the stations' own knot
 * positions gives it too and is far smaller — a handful of columns rather than
 * a couple of hundred. That matters here because these knots are re-splined at
 * query time to solve the transition, not merely read off.
 *
 * A station with no knot at some position contributes its own shape's value
 * there, read off its own curve — see {@link knotFunction}.
 *
 * The crown position ramps alongside as a plain scalar. It has no column to
 * belong to: it is the origin the fractional positions are measured from, so
 * ramping it with them would be circular.
 */
export function makeCrossArchResolver(
  cross: CrossArchShape, bodyHeight: number,
): CrossArchResolver {
  // A catenary has nothing to ramp — every station gets the same computed shape.
  if (cross.type === 'catenary') return () => ({ left: [], right: [], catenary: true });
  // Widened explicitly: `stations` is a union of two arrays, and inference
  // would otherwise pin the type parameter to whichever arm comes first.
  const stations = normalizeCrossArchStations<CrossArchShape>(cross.stations, bodyHeight);
  const shapes = [cross as CrossArchShape, ...stations];

  const sideTracks = (side: 1 | -1) => {
    const perShape = shapes.map(s => crossArchKnots(s, side));
    const xs = [...new Set(perShape.flat().map(k => +k.x.toFixed(4)))].sort((a, b) => a - b);
    if (!stations.length || bodyHeight <= 0) {
      const base = knotFunction(perShape[0]);
      return { xs, tracks: xs.map(x => { const v = base(x); return () => v; }) };
    }
    // The base shape anchors both body ends, stations override in between.
    const ys = [0, ...stations.map(s => s.y), bodyHeight];
    const fns = perShape.map(knotFunction);
    const tracks = xs.map(x => {
      const baseZ = fns[0](x);
      return makeMonotoneSpline(ys, [baseZ, ...fns.slice(1).map(f => f(x)), baseZ]);
    });
    return { xs, tracks };
  };

  const right = sideTracks(1);
  const left = sideTracks(-1);
  const read = (s: { xs: number[]; tracks: ((y: number) => number)[] }, y: number): CrossArchKnot[] =>
    s.xs.map((x, i) => ({ x, z: Math.min(s.tracks[i](y), 1) }));

  // Only a template carries a crown position; a trochoid is symmetric by
  // construction and peaks where its two halves meet.
  const peakOf = (s: CrossArchShape) => (s.type === 'spline' ? s.peak ?? 0.5 : 0.5);
  const peakTrack = stations.length && bodyHeight > 0
    ? makeMonotoneSpline(
      [0, ...stations.map(s => s.y), bodyHeight],
      [peakOf(shapes[0]), ...shapes.slice(1).map(peakOf), peakOf(shapes[0])],
    )
    : () => peakOf(shapes[0]);

  const fromTakeoff = cross.type === 'cycloid';
  return (y: number) => ({ left: read(left, y), right: read(right, y), peak: peakTrack(y), fromTakeoff });
}

/**
 * Which gouge is cutting at body station `y` — the C-bout tool between the
 * corners, else the main one, eased across each corner over one gouge width
 * rather than switched outright. A hard switch is a step in sweep radius at an
 * arbitrary station, and since every per-station solve downstream (the takeoff,
 * the tangency, the corner wedge) treats its inputs as varying continuously in
 * y, that step becomes a seam in the surface exactly at the corner — invisible
 * only while the two radii happened to be equal.
 */
export function gougeAtY(
  p: EnricoCerutiParams, g: FlutingParams, y: number,
): { sweepRadius: number; halfWidth: number } {
  const uc = p.bouts.UCr?.y, lc = p.bouts.LCr?.y;
  if (uc == null || lc == null) {
    return { sweepRadius: g.sweepRadius, halfWidth: gougeHalfWidth(g.sweepRadius, g.depth) };
  }
  const lo = Math.min(uc, lc), hi = Math.max(uc, lc);
  const cSweep = effectiveCBoutSweep(g);
  const band = Math.max(gougeHalfWidth(g.sweepRadius, g.depth), gougeHalfWidth(cSweep, g.depth));
  const wC = smoothstep(y, lo - band, lo + band) * (1 - smoothstep(y, hi - band, hi + band));
  const sweepRadius = g.sweepRadius + wC * (cSweep - g.sweepRadius);
  return { sweepRadius, halfWidth: gougeHalfWidth(sweepRadius, g.depth) };
}

/** A candidate landing for one side: where the arch stops, and how deep it is there. */
interface SideEnd { xEnd: number; zEnd: number; }

/**
 * What a crown's knots are measured against at one station — the wood as it stands before the
 * cross arch is carved, so the frame never moves when a knot does.
 *
 * Across: from the joint out to the channel's inner edge. A takeoff can only land on the
 * channel's flank, outboard of that edge, so every knot inside the frame is inboard of whatever
 * takeoff the solve finds — the takeoff is an output, not part of the ruler.
 *
 * Height: up from plate level, the same datum the long arch's height is measured from, as a
 * fraction of the crown's height here. Where the crown hasn't climbed a couple of gouge depths
 * clear of the plate (the cap recurve bands) a fraction of it means nothing — it goes to zero
 * and then negative, and would invert the section — so over that band the datum eases down
 * onto each side's takeoff. `lift` is how far it has eased: 1 is plate level.
 *
 * Authored knots only. A trochoid or catenary is a generated curve whose end is the takeoff, so
 * with `fromTakeoff` both axes run to each side's takeoff instead, and the curve lands on it.
 */
interface KnotFrame {
  innerEdge: number;
  lift: number;
  fromTakeoff: boolean;
  /** The channel's floor, −depth: the lowest a smooth profile may go unless a knot asks for lower. */
  trough: number;
}

/** A knot's height above the plate, on the side whose takeoff is `end`. */
function knotHeight(archH: number, frame: KnotFrame, end: SideEnd, z: number): number {
  const datum = frame.fromTakeoff ? end.zEnd : (1 - frame.lift) * end.zEnd;
  return datum + z * (archH - datum);
}

/**
 * Where a knot fraction lands across the plate. Measured from the joint rather than from the
 * crown, so moving the crown does not drag every knot along with it — a knot can therefore end
 * up on the far side of the crown from the one it was authored on; see {@link crossProfile},
 * which sorts rather than assuming.
 *
 * The single place the fractional form becomes a position, so the profile, the module guide and
 * the panel's halos cannot drift apart about it.
 */
export function crossArchKnotX(section: CrossArchSection, side: 1 | -1, frac: number): number {
  return side * frac * section.innerEdge;
}

/**
 * The whole transverse profile as one spline: left takeoff, left knots, the
 * crown, right knots, right takeoff.
 *
 * Built across the full width rather than as two curves meeting at the middle,
 * and that is not a detail. As an *endpoint* of a one-sided spline the crown
 * gets a natural end condition, which leaves it with a nonzero slope — so the
 * two sides arrive at the crown at an angle and the arch peaks in a sharp
 * ridge. As an *interior* knot it sits between secants of opposite sign, which
 * is precisely the case Hyman's filter zeroes, giving a genuine smooth maximum.
 * That argument is about the knot being interior, not about where it sits, so
 * it survives the crown moving off the joint.
 *
 * The transition is not a separate curve either. It is this spline's outermost
 * segment on each side, which is why it arrives curvature-continuous with the
 * rest of the arch for free: there is no blend primitive to match up, because
 * there is no blend.
 */
function crossProfile(
  archH: number, xPeak: number, frame: KnotFrame,
  left: CrossArchKnot[], right: CrossArchKnot[], endL: SideEnd, endR: SideEnd,
): (x: number) => number {
  // Fractions become millimetres here and nowhere else, against the fixed
  // frame (see {@link KnotFrame}). Because every knot sits inboard of the
  // channel's inner edge and every takeoff outboard of it, the solve can slide
  // a takeoff anywhere along the flank without ever passing a knot — so the
  // arrival slope varies continuously and bisection finds a real root.
  const place = (knots: CrossArchKnot[], end: SideEnd, side: 1 | -1) => knots
    .map(k => ({ x: side * k.x * (frame.fromTakeoff ? end.xEnd : frame.innerEdge), z: knotHeight(archH, frame, end, k.z) }))
    // Defensive: authored fractions are held below 1, so this never fires.
    .filter(k => k.x > -endL.xEnd + 1e-6 && k.x < endR.xEnd - 1e-6);

  const inner = [...place(left, endL, -1), ...place(right, endR, 1)].sort((a, b) => a.x - b.x);

  // A knot landing on the crown would hand the spline a zero-width interval.
  // Held clear rather than dropped: a dropped knot is a step in the arrival
  // slope, which the tangency solve can't survive. The gap is far below anything the wood or the mesh
  // resolves.
  const CROWN_GAP = 1e-4;
  const xs: number[] = [-endL.xEnd];
  const zs: number[] = [endL.zEnd];
  for (const k of inner) {
    if (k.x < xPeak) { xs.push(Math.min(k.x, xPeak - CROWN_GAP)); zs.push(k.z); }
  }
  const crown = xs.length;
  xs.push(xPeak);
  zs.push(archH);
  for (const k of inner) {
    if (k.x >= xPeak) { xs.push(Math.max(k.x, xPeak + CROWN_GAP)); zs.push(k.z); }
  }
  xs.push(endR.xEnd);
  zs.push(endR.zEnd);

  // A centred crown is already curvature-continuous: the two flanks mirror
  // each other, so the monotone spline's filter has nothing asymmetric to
  // clamp. Branching here isn't just an optimisation — it guarantees this
  // machinery changed nothing for any recipe that doesn't use a moved crown.
  if (Math.abs(xPeak) < 1e-9) return makeMonotoneSpline(xs, zs);

  const smooth = makeC2SplineWithFlatKnot(xs, zs, crown);
  if (smooth && !breaksSpec(smooth, xs, zs, frame.trough)) return smooth;
  return makeMonotoneSpline(xs, zs);
}

/**
 * Whether a smooth profile carves outside what the maker specified — the only
 * reason to give up its smoothness for the monotone spline.
 *
 * The knots are abstractions; the spec is the arch height and the channel. So
 * the curve may wander off its knots as it likes, but it may not rise above the
 * highest height asked for (normally the crown — the arch height stays exact),
 * nor sink below the channel's trough, which would cut the channel deeper than
 * the gouge did. A knot or crown deliberately set below the trough lowers that
 * floor to itself.
 *
 * Sampled about every millimetre rather than at a few points per interval: the
 * run from the last knot into the channel can be tens of millimetres long, and
 * a sag through the trough fits between quarter points of it.
 */
function breaksSpec(f: (x: number) => number, xs: number[], zs: number[], trough: number): boolean {
  const ceiling = Math.max(...zs) + 1e-4;
  const floor = Math.min(...zs, trough) - 1e-4;
  for (let i = 0; i < xs.length - 1; i++) {
    const n = Math.max(4, Math.ceil(xs[i + 1] - xs[i]));
    for (let j = 1; j < n; j++) {
      const v = f(xs[i] + (j / n) * (xs[i + 1] - xs[i]));
      if (v > ceiling || v < floor) return true;
    }
  }
  return false;
}

/**
 * Height at `x` (measured from the crown, which sits at `archH`) along a one-sided catenary
 * running out to `xEnd`, where it meets the channel at `zEnd`.
 *
 * The catenary counterpart of `crossProfile`, evaluated directly rather than through a knot
 * spline. A catenary's normalized shape depends on the height/span ratio — unlike a trochoid's,
 * which is scale-invariant and so can be sampled once into fixed knots — and the span here is
 * exactly what {@link solveArchTakeoff}'s tangency search is hunting for. So this is re-evaluated
 * at whatever `xEnd` the search is currently trying, via `catenaryZAt`'s own span parameter,
 * rather than precomputed. Each side stands alone: there is no crown offset to author for a
 * catenary, so a side's shape depends only on its own solved width, never the other side's.
 */
function catenarySideZAt(archH: number, zEnd: number, xEnd: number, x: number): number {
  if (xEnd <= 0) return archH;
  const rise = archH - zEnd;
  return rise >= 0
    ? zEnd + catenaryZAt(rise, 2 * xEnd, xEnd - Math.abs(x))
    : zEnd - catenaryZAt(-rise, 2 * xEnd, xEnd - Math.abs(x));
}

/** A plate's transverse surface at one body station, with the transition solved on both sides. */
export interface CrossArchSection {
  /** Channel centerline half-chord here. */
  centerHalf: number;
  halfWidth: number;
  sweepRadius: number;
  /** Crown height above the plate outer surface — negative in the recurve bands near the caps. */
  archH: number;
  /** Where the crown sits across the plate (mm), after tapering. 0 is the joint. */
  xPeak: number;
  left: ArchTakeoff | null;
  right: ArchTakeoff | null;
  /** |x| where the arch hands over to the channel on each side — where one is drawn in place of the other. */
  xEndLeft: number;
  xEndRight: number;
  /** |x| of the channel's inner edge — what knot positions are fractions of. */
  innerEdge: number;
  /** The height knot heights count up from on each side: plate level, except in the cap recurve bands. */
  datumLeft: number;
  datumRight: number;
  /** Surface height above the plate outer surface at transverse position `x`. */
  zAt: (x: number) => number;
}

/**
 * How much of a station's geometry its own chord coordinate actually describes,
 * from `chordFrac` — the distance from the joint to the nearest channel, over
 * the station's half-chord.
 *
 * Through the body the nearest channel from the joint is straight out to the
 * side, so the ratio is 1 and the chord is the whole story. Approaching a cap
 * the channel wraps across the body and the nearest one is *ahead*, not beside:
 * the ratio falls, and a station line stops being a sensible description of a
 * plate that is closing in from three directions at once.
 *
 * Two things have to agree about where that happens, which is why this is one
 * function rather than two thresholds. The surface reads its transverse
 * position by blending true distance against chord, and has to lean on distance
 * exactly where the chord stops describing the plate. But distance cannot tell
 * the two sides of the joint apart — it is a scalar, and the surface has to
 * pick a flank by the sign of x. That is only harmless while the two flanks
 * agree, so the crown offset has to be back on the joint wherever the surface
 * is leaning on distance. Same curve, both places: see `archedZAt` and the
 * offset taper in {@link solveCrossArchSection}.
 */
export function chordTrust(chordFrac: number): number {
  return smoothstep(chordFrac, CHORD_TRUST_LO, CHORD_TRUST_FULL);
}

/** Below this the chord says nothing useful and the surface reads position by distance alone. */
const CHORD_TRUST_LO = 0.15;
/** At and above this the chord is the whole story: {@link chordTrust} is exactly 1. */
const CHORD_TRUST_FULL = 0.5;
/** How far past that the crown's offset is eased in — see {@link crownOffsetTrust}. */
const CROWN_OFFSET_BAND = 0.2;

/**
 * How much of its authored offset the crown may take, from the same ratio.
 *
 * Deliberately stricter than {@link chordTrust}, and the gap between them is the
 * whole point rather than slack. Scaling the offset *in proportion* to the
 * blend is not enough: at a station that is 40% chord-driven, the crown sits at
 * 40% of its offset and the surface is still 60% distance-driven, so the two
 * flanks still disagree and the step at the joint is merely smaller. It has to
 * be *gone*, which means the offset may only begin once the blend has finished.
 *
 * So this starts where `chordTrust` ends. The invariant it exists to hold:
 * `crownOffsetTrust(f) > 0` implies `chordTrust(f) === 1`. Wherever the crown is
 * off the joint at all, the height field is reading position purely by chord,
 * and the sign of x is a real answer rather than a coin toss.
 *
 * The cost is that the crown stays centred a little further into each cap than
 * strictly needed — which is where a ridge means least anyway.
 */
export function crownOffsetTrust(chordFrac: number): number {
  return smoothstep(chordFrac, CHORD_TRUST_FULL, CHORD_TRUST_FULL + CROWN_OFFSET_BAND);
}

/**
 * How far above plate level the crown must climb, in gouge depths, before the
 * ridge may sit fully where it was asked to.
 *
 * Measured against the gouge rather than against the arch height because the
 * gouge is what the crown has to clear: below a couple of depths the section is
 * mostly channel with a rumour of arch on top, and there is nothing there to
 * call a ridge. It also keeps this function self-contained — the plate's own
 * arch height is not among its arguments and should not have to be.
 *
 * The consequence to know: on the default violin gouge the band is 0–2.4mm, so
 * a 15mm arch is at full offset over all but the last stretch into each cap.
 * A very low arch over a deep gouge would taper across more of the body.
 */
const PEAK_TAPER_DEPTHS = 2;

/**
 * Solves a station: the crown template runs out from the peak until it meets
 * the channel tangentially, once on each side.
 *
 * Both sides are solved separately even though the channel is symmetric — an
 * unmirrored knot makes the template asymmetric, and then the two sides reach
 * the channel at different points. That the contact wanders while the channel's
 * outer edge stays put is the observable this whole model was built for.
 */
export function solveCrossArchSection(
  archH: number, centerHalf: number, sweepRadius: number, depth: number, row: CrossArchRow,
  chordFrac = 1,
): CrossArchSection | null {
  const halfWidth = gougeHalfWidth(sweepRadius, depth);
  // The crown may sit *below* plate level — that is the recurve band near each
  // body cap, where the long arch has not yet climbed clear of its own takeoff —
  // and even below the trough, where both sides meet the channel's outer flank.
  // Requiring a positive crown here instead is what left a flat ring around
  // both caps, with a straight seam where the height crossed zero.
  if (halfWidth <= 0 || centerHalf <= halfWidth) return null;
  const isCatenary = !!row.catenary;

  // The crown, in millimetres, anchored to the centerline half-chord — a
  // quantity the solve never touches, so it holds still while both takeoffs
  // hunt for their contacts.
  //
  // Tapered by how much crown there is to move. The ridge line's path along
  // the body is `(peak − ½)·2·centerHalf(y)`, so an offset crown inherits
  // every property of `centerHalf` — a chord read off a sampled loop that
  // runs nearly horizontal at the caps, where it swings fastest per mm of
  // body and carries the most sampling wobble. The ridge is a curvature
  // feature of the section; steering one with that folds the surface.
  // Centred, the whole term is zero and none of it can reach the plate,
  // which is why this only appeared once the crown could move.
  //
  // Tapering on the arch height fixes it at the cause: where the long arch
  // hasn't yet climbed clear of the channel there is no crown, and a ridge is
  // a feature of a crown. Costs nothing to plumb since `archH` is already the
  // first argument here.
  //
  // Smoothstepped rather than clamped, since a clamp is C⁰ in slope at both
  // ends of the band and a kink in the ridge line is exactly the fold this
  // exists to remove.
  //
  // Two conditions multiplied in, because either alone is a reason to stay
  // centred: how much crown there is to feature a ridge at all, and how much
  // the station chord describes (see {@link crownOffsetTrust}) — where the
  // height field falls back on distance it can't tell one side of the joint
  // from the other, so it picks a flank by the sign of x. An asymmetric crown
  // makes the two flanks disagree, landing as a step down the joint; centring
  // there is the condition under which the sign of x stops mattering.
  const t = clamp(archH / (PEAK_TAPER_DEPTHS * depth), 0, 1);
  const lift = t * t * (3 - 2 * t);
  const taper = lift * crownOffsetTrust(chordFrac);
  // the same band decides when there is enough crown to measure knot heights against
  const frame: KnotFrame = {
    innerEdge: centerHalf - halfWidth, lift, trough: -depth, fromTakeoff: !!row.fromTakeoff || isCatenary,
  };

  // Held well inside the channel's inner edge, which is the innermost a takeoff
  // can ever land. The crown has to stay a strictly interior knot: landing it on
  // a takeoff would put two knots at one position and the spline's interval
  // widths would include a zero. With the taper in place this is a backstop
  // rather than something reached — a narrow station is a shallow one, and a
  // shallow one has already tapered its crown back to the joint.
  const peakLimit = 0.9 * Math.max(centerHalf - halfWidth, 0);
  const xPeak = clamp(((row.peak ?? 0.5) - 0.5) * 2 * centerHalf * taper, -peakLimit, peakLimit);

  const endAt = (s: number): SideEnd => ({
    xEnd: centerHalf - s,
    zEnd: gougeProfileZ(s, sweepRadius, depth),
  });

  // The seed the sweeps below start from, not a resting place: the solve
  // returns a landing on every side it can reach a flank at all — its closest
  // approach when no true tangency exists — so this is overwritten on the first
  // pass in every case that draws. See {@link solveArchTakeoff} for why an
  // unsolved side must land *near* its neighbours rather than at a fixed edge.
  let endL = endAt(halfWidth * (1 - 1e-3));
  let endR = endL;
  let takeL: ArchTakeoff | null = null;
  let takeR: ArchTakeoff | null = null;

  // a centred crown on mirrored knots lands alike on both sides: one solve, both ends moving together
  const symmetric = Math.abs(xPeak) < 1e-9 && row.left.length === row.right.length
    && row.left.every((k, i) => k.x === row.right[i].x && k.z === row.right[i].z);

  const solveSide = (side: 1 | -1): ArchTakeoff | null => {
    const slopeAt = (takeoffDepth: number, contactS: number): number => {
      const mine: SideEnd = { xEnd: centerHalf - contactS, zEnd: -takeoffDepth };
      if (mine.xEnd <= 1e-3) return 0;
      const eps = Math.max(mine.xEnd * 1e-4, 1e-6);
      // Measured inward, matching the channel's own slope convention: `s` grows
      // toward the centerline, so a rising arch reads positive on both.
      if (isCatenary) {
        return (catenarySideZAt(archH, mine.zEnd, mine.xEnd, side * (mine.xEnd - eps)) - mine.zEnd) / eps;
      }
      const f = symmetric ? crossProfile(archH, xPeak, frame, row.left, row.right, mine, mine)
        : side === 1 ? crossProfile(archH, xPeak, frame, row.left, row.right, endL, mine)
        : crossProfile(archH, xPeak, frame, row.left, row.right, mine, endR);
      return (f(side * (mine.xEnd - eps)) - mine.zEnd) / eps;
    };
    return solveArchTakeoff(sweepRadius, depth, slopeAt);
  };

  // Both sides live on one spline now, so each landing nudges the other's
  // arrival slope. The coupling is weak — a cubic spline's influence decays
  // geometrically along its knots, and the crown plus its neighbours sit
  // between the two ends — so a few sweeps settle it.
  if (symmetric) {
    takeR = takeL = solveSide(1);
    if (takeR) endR = endL = endAt(takeR.contactS);
  }
  else for (let i = 0; i < 4; i++) {
    const before = [takeR?.contactS, takeL?.contactS];
    takeR = solveSide(1);
    if (takeR) endR = endAt(takeR.contactS);
    takeL = solveSide(-1);
    if (takeL) endL = endAt(takeL.contactS);
    // settled: another sweep would re-solve the same two landings
    if (before[0] === takeR?.contactS && before[1] === takeL?.contactS) break;
  }

  const profile = isCatenary ? null : crossProfile(archH, xPeak, frame, row.left, row.right, endL, endR);
  const zAt = (x: number): number => {
    if (x >= -endL.xEnd && x <= endR.xEnd) {
      return isCatenary
        ? catenarySideZAt(archH, x < 0 ? endL.zEnd : endR.zEnd, x < 0 ? endL.xEnd : endR.xEnd, x)
        : profile!(x);
    }
    // Past the arch's reach the channel is the surface, and past that the flat
    // land — both of which {@link gougeProfileZ} already describes, measured
    // inward from the centerline on whichever side we are.
    return gougeProfileZ(centerHalf - Math.abs(x), sweepRadius, depth);
  };

  return {
    centerHalf, halfWidth, sweepRadius, archH, xPeak,
    left: takeL, right: takeR,
    xEndLeft: endL.xEnd, xEndRight: endR.xEnd,
    innerEdge: frame.innerEdge,
    datumLeft: knotHeight(archH, frame, endL, 0), datumRight: knotHeight(archH, frame, endR, 0),
    zAt,
  };
}

/** One crosshair of a crown guide — where an authored knot landed at this station. */
export interface CrossArchGuideKnot {
  x: number;
  /** Height above the plate outer surface. */
  z: number;
  /** The datum the knot's height percentage counts up from — plate level through the body. */
  base: number;
}

/**
 * One side's height datum, run from the channel's inner edge in to the crown —
 * the frame every knot on that side is measured in. Plate level through the
 * body, so the two sides meet as one line; only in the cap recurve bands does
 * each ease down toward its own takeoff.
 */
export interface CrossArchGuideBaseline {
  /** Signed x of the channel's inner edge, the outer end of the knot frame. */
  fromX: number;
  /** Signed x of the crown end, i.e. the peak. */
  toX: number;
  /** Height above the plate outer surface. */
  z: number;
}

/**
 * A trochoid crown's generating circle on one side. Centered under the crown,
 * which for a trochoid is always the joint — the curve is symmetric by
 * construction, so there is no crown position to move.
 */
export interface CrossArchGuideCircle {
  centerZ: number;
  radius: number;
}

/**
 * The module-guide geometry for a station's crown: what the shape was built
 * from, rather than what it came out as.
 *
 * Which of the two lists is filled depends on the curve type, because the two
 * are authored in genuinely different terms. An authored crown *is* its control
 * points, so the guide marks them. A trochoid has no control points to mark —
 * what generates it is a rolling circle, so the guide draws that instead.
 *
 * Knots come from `shape` rather than from the station's resolved row, and the
 * difference matters: the row carries the *union* of every station's knot
 * positions, since that is how {@link makeCrossArchResolver} ramps shapes
 * whose point lists don't correspond. Marking those would show a maker two
 * crosshairs per side for one authored point. The guide marks what was
 * authored, so it agrees with the panel's own rows.
 *
 * Placement is read off the station's fixed frame (see {@link KnotFrame}), not
 * off the solved takeoff, so a knot's crosshair stays put while the transition
 * moves around it. The takeoffs are marked separately, as where the solve landed.
 *
 * Between stations, `shape` is the nearest authored one while the curve drawn
 * is a ramp through it, so the crosshairs can sit a little off the section.
 * They mark the shape the panel's fields are editing, which is the question
 * they exist to answer.
 */
export interface CrossArchGuide {
  knots: CrossArchGuideKnot[];
  circles: CrossArchGuideCircle[];
  /** Both sides' datums, drawn whatever the curve type — a trochoid's rise counts from them too. */
  baselines: CrossArchGuideBaseline[];
  /** Where each side's arch was solved to meet the channel — an output, marked apart from the frame. */
  takeoffs: Pt[];
  /** The crown itself, always marked — at `section.xPeak`, which need not be the joint. */
  peakZ: number;
}

export function crossArchGuide(shape: CrossArchShape, section: CrossArchSection): CrossArchGuide {
  const out: CrossArchGuide = { knots: [], circles: [], baselines: [], takeoffs: [], peakZ: section.archH };

  for (const side of [-1, 1] as const) {
    const xEnd = side < 0 ? section.xEndLeft : section.xEndRight;
    const base = side < 0 ? section.datumLeft : section.datumRight;
    const hEff = section.archH - base;
    // a generated curve's rise counts from its takeoff; authored knots from the fixed frame
    const frameEnd = shape.type === 'spline' ? section.innerEdge : xEnd;
    out.baselines.push({ fromX: side * frameEnd, toX: section.xPeak, z: base });
    out.takeoffs.push(new Pt(side * xEnd, section.zAt(side * xEnd)));

    if (shape.type === 'cycloid') {
      // A trochoid of rise `hEff` and factor `d` is traced by a circle of
      // radius hEff/(2d) rolling at half that rise. Below 0.01 the curve has
      // flattened into a raised cosine and the circle runs off to infinity —
      // there is nothing honest left to draw.
      const d = clamp(shape.d, 0, 1);
      if (d > 0.01) out.circles.push({ centerZ: base + hEff / 2, radius: hEff / (2 * d) });
    } else if (shape.type === 'spline') {
      for (const k of crossArchKnots(shape, side)) {
        out.knots.push({ x: crossArchKnotX(section, side, k.x), z: base + k.z * hEff, base });
      }
    }
    // A catenary has nothing to mark beyond the baseline above and the crown apex
    // every curve type gets from `peakZ` — see archGuideKnots' long-arch counterpart.
  }
  return out;
}

/**
 * Outermost |x| where a station line crosses a sampled loop, or null when it
 * misses. Kept here rather than imported so the gouged math stays free of any
 * dependency on the surface module.
 *
 * Deliberately the outermost crossing and not the run around the centerline,
 * which is what the plate's own edge needs (`plateHalfChordAtY`): this is only
 * ever asked of the channel centerline, and that loop is inset far enough that
 * the corners round away entirely — it is a single span at every station on the
 * body, so the two rules cannot disagree here.
 */
export function loopHalfChordAtY(poly: Pt[], y: number): number | null {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // Half-open, so a vertex sitting exactly on the station line counts once.
    if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  if (!xs.length) return null;
  return Math.max(...xs.map(Math.abs));
}

/** Everything a station needs about a plate, built once and queried per station. */
export interface PlateGeometry {
  gouge: FlutingParams;
  /** Sampled channel centerline, for half-chord queries along the body. */
  centerPoly: Pt[];
  /** The same loop indexed for distance queries — how the height field measures the channel. */
  centerIdx: PolylineIndex;
  resolveCross: CrossArchResolver;
  /** The plate's long arch, already terminated against the channel at the caps. */
  longArch: LongArchSolve | null;
}

export function buildPlateGeometry(
  p: EnricoCerutiParams, arch: ArchCurve, g: FlutingParams, cross: CrossArchShape,
): PlateGeometry | null {
  const paths = channelPaths(p, g);
  if (!paths) return null;
  const centerPoly = samplePathToPolyline(paths.center, 1);
  const centerIdx = buildPolylineIndex(centerPoly);
  return {
    gouge: g,
    centerPoly,
    centerIdx,
    resolveCross: makeCrossArchResolver(cross, p.height),
    longArch: solveLongArch(p, arch, g),
  };
}

/**
 * The long arch's height at station `y` — the crown the cross template hangs
 * from.
 *
 * Read off the *solved* arch rather than off {@link longArchHeightAt}, whose
 * span is pinned to `innerFlutingDepth`. Here the span comes out of the cap
 * solve, so the two disagree slightly near the ends.
 */
export function solvedLongArchHeightAt(geo: PlateGeometry, y: number): number {
  const la = geo.longArch;
  if (!la) return 0;
  const s = y - la.yStart;
  if (s <= 0) return -la.takeoff.takeoffDepth;
  if (s >= la.span) return -la.farTakeoff.takeoffDepth;
  return archZAt(la.lowered, la.span, s, la.farZ) - la.takeoff.takeoffDepth;
}

/** The solved transverse section at station `y`, or null where the plate has no arch there. */
export function crossArchSectionAt(
  p: EnricoCerutiParams, geo: PlateGeometry, y: number,
): CrossArchSection | null {
  const centerHalf = loopHalfChordAtY(geo.centerPoly, y);
  if (centerHalf === null) return null;
  const { sweepRadius } = gougeAtY(p, geo.gouge, y);
  // Measured at the joint, which is where the sign-of-x ambiguity lives and so
  // the only place the answer matters. Equals the half-chord through the body,
  // and falls away as the channel wraps round each cap.
  const chordFrac = centerHalf > 1e-9
    ? closestPointToPolylineIndexed({ x: 0, y }, geo.centerIdx).dist / centerHalf
    : 1;
  return solveCrossArchSection(
    solvedLongArchHeightAt(geo, y), centerHalf, sweepRadius, geo.gouge.depth, geo.resolveCross(y),
    chordFrac,
  );
}

// how far apart the two plates' centrelines are drawn side by side, in body widths. Overlaying them
// buries one under the other; side by side, the top and back can be compared at a glance
export const PLATE_LAYOUT_GAP = 1.1;

// the top stays centred on x = 0, where every other plan view draws it, and the back goes to its left
export function plateLayoutOffset(p: EnricoCerutiParams, plate: 'top' | 'bottom'): number {
  return plate === 'top' ? 0 : -p.width * PLATE_LAYOUT_GAP;
}
