import { Pt } from '../models/types';
import {
  buildPolylineIndex, clamp, closestPointToPolylineIndexed, makeC2SplineWithFlatKnot, makeMonotoneSpline,
  PolylineIndex,
} from '../helpers/draftMath';
import {
  catenaryZAt, cycloidZAt, samplePathToPolyline, splineZAt,
} from '../helpers/svgPathMath';
import {
  ArchCurve, EnricoCerutiParams, GougedCrossCycloidParams, GougedCrossCycloidShape, GougedCrossParams,
  GougedCrossShape, GougedCrossSplineParams, GougedCrossStation, GougedFlutingParams,
} from './ceruti-types';
import { defineFlutingPath, defineInsetPath } from './ceruti-paths';
import { archFromLoweredTakeoff, normalizeCrossArchStations } from './ceruti-arching';

/**
 * The gouged arching model's geometry — the half of it that concerns the
 * channel itself. See the block comment above {@link GougedFlutingParams} for
 * why this model exists at all.
 *
 * Nothing in the classic path imports from this file, and this file writes
 * nothing back into it: the two models coexist so they can be compared, and
 * `buildPlateSurfaceModel` deliberately keeps returning the classic surface so
 * the STL export and physical templates stay on known-good geometry until it's
 * clear which model survives.
 */

/** A gouge sweep this shallow relative to its depth isn't a real tool; guards the sqrt below. */
const MIN_SWEEP_RATIO = 1.0001;

/**
 * Half-width of the cut a gouge of sweep radius `R` leaves at depth `D` — the
 * chord where the circular section returns to the plate surface.
 *
 * This is the number that makes the whole model work: it depends only on the
 * tool, so it is the same at the waist, at the widest bout, and around the
 * corners. In the classic model the corresponding width is the gap between two
 * boundary loops that disagree about the corners, and it swings hard there.
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

/**
 * A starting gouge for a plate: one that cuts a channel of about the width the
 * outline itself implies, so the panel opens on something a maker recognises
 * and adjusts rather than on an arbitrary tool.
 *
 * The width comes from the plate's own edge geometry — the land edge outward of
 * the purfling, and twice the edge inset inward of it, which is where a channel
 * of ordinary proportions reaches on an instrument of this size. Given that
 * target half-width `w` and a depth `D`, R = (w² + D²) / 2D falls straight out
 * of the half-width formula and names the gouge that cuts it.
 *
 * Deliberately derived from the outline rather than from the classic model's
 * `innerFlutingDepth`: under this model the channel's reach is an *output* of
 * the tool, so seeding the tool from a stored reach would run the dependency
 * backwards at the one moment it is most likely to be believed.
 */
export function defaultGougedFlutingParams(p: EnricoCerutiParams): GougedFlutingParams {
  const inner = 2 * (p.overhang + p.rib);
  const outer = p.outerFlutingDepth ?? p.overhang * 0.5;
  const depth = 1.2;
  const halfWidth = Math.max(Math.abs(inner - outer) / 2, 0.5);
  return {
    sweepRadius: +((halfWidth * halfWidth + depth * depth) / (2 * depth)).toFixed(2),
    depth,
    sweepRadius_cBout: null,
    cornerGouge: true,
  };
}

/**
 * The sweep actually in force through the C-bout: the override when it is set
 * and can cut to `depth`, else the main gouge. A sweep smaller than the depth
 * describes no real tool, so it falls back rather than producing a degenerate
 * channel through the waist.
 */
export function effectiveCBoutSweep(g: GougedFlutingParams): number {
  const c = g.sweepRadius_cBout;
  return c !== null && gougeHalfWidth(c, g.depth) > 0 ? c : g.sweepRadius;
}

/** Whether the corner pass is cutting. Absent reads as on — see {@link GougedFlutingParams.cornerGouge}. */
export function cornerGougeOn(g: GougedFlutingParams): boolean {
  return g.cornerGouge ?? true;
}

/**
 * The corner pass, as a height field: the same gouge run a second time with its
 * outer edge on the *platform boundary* rather than on the channel's own outer
 * loop.
 *
 * `edgeDist` is distance inward from that boundary, so the cut's outer flank
 * starts at 0 there and its trough sits a half-width in. Two consequences fall
 * straight out of that anchoring, and both are the point:
 *
 * - Along the flanks the platform boundary and the channel's outer loop are the
 *   same curve, so this returns exactly what the channel already returns and
 *   composing the two changes nothing. No band to feather, no weight to tune —
 *   the second pass is a no-op wherever there was nothing left to cut.
 * - At a corner the platform boundary *follows* the point while the channel
 *   bypasses it, so the cut wraps the corner on its own, and the wedge between
 *   the two loops — the region the panel shades — is carved by construction.
 *
 * Composed with {@link Math.min}: two passes of a gouge leave the deeper of the
 * two, which is also what makes this incapable of adding material anywhere.
 * Returns 0 past its own reach, so the minimum is inert there.
 *
 * `wedge` is how much wider than one gouge the gap is here, and it is what makes
 * this a *pass count* rather than a single cut. One pass anchored on the
 * boundary and one on the channel leaves a ridge of untouched wood between them
 * wherever the two loops are further apart than 2w — measurably so: about 5 mm
 * of full-height plate at the widest part of a violin corner. A maker meeting
 * that keeps taking passes until the two runs join. Sliding the same tool across
 * the gap sweeps a flat floor at its own depth with its own radius left standing
 * at either wall, which is exactly this: the arc, opened at the trough.
 *
 * The floor is at the gouge's depth and no deeper — the tool cannot be pushed
 * past its setting, however many passes it makes — so this stays a statement
 * about the tool rather than about the gap it happens to be crossing. At
 * `wedge = 0` it is the single cut again, term for term.
 */
export function cornerGougeZ(edgeDist: number, sweepRadius: number, depth: number, wedge = 0): number {
  const w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0) return 0;
  const flat = Math.max(wedge, 0);
  if (edgeDist <= w) return gougeProfileZ(edgeDist - w, sweepRadius, depth);
  if (edgeDist <= w + flat) return -depth;
  return gougeProfileZ(edgeDist - w - flat, sweepRadius, depth);
}

/**
 * A default crown shape: one mirrored knot, three quarters of the way out at
 * under a third of the height.
 *
 * Deliberately a single point. The crown is anchored at both ends already — the
 * peak at the centerline and the solved takeoff at the channel — so one knot is
 * all it takes to describe a curve, and it is the shortest route to seeing what
 * the knot does. Points are cheap to add; a default that arrives pre-shaped
 * mostly gives the maker someone else's arch to argue with.
 */
export function defaultGougedCrossParams(): GougedCrossSplineParams {
  return { type: 'gouged', points: [{ x: 0.7, z: 0.4, mirror: true }] };
}

/**
 * A default trochoid crown: the same `d`/`pct` {@link defaultCrossArchParams}
 * gives the classic model, so switching a plate to this curve type is a
 * like-for-like comparison of the two channel models rather than a change of
 * crown family at the same time.
 */
export function defaultGougedCrossCycloidParams(): GougedCrossCycloidParams {
  return { type: 'gouged-cycloid', d: 0.4, pct: 0.9 };
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
 * So {@link innerEdgeOffset} — the counterpart of the classic model's
 * `innerFlutingDepth` — is an output here, not an input.
 *
 * Built with {@link defineFlutingPath}, which bypasses the corners via
 * `findJoiningArcs`. Offsetting an arc by a constant gives a concentric arc, so
 * the constant width is exact by construction — not sampled, not approximated,
 * and true through the corner joins as well. That is the property the classic
 * model cannot state about its own channel.
 *
 * Null where the fluting isn't configured yet (no purfling offset).
 */
export interface GougedChannelPaths {
  center: string;
  inner: string;
  outer: string;
  /** mm inward from the plate edge to the channel's inner edge — the derived `innerFlutingDepth`. */
  innerEdgeOffset: number;
  /** The same, through the C-bout, where a second gouge may be in force. */
  innerEdgeOffset_cBout: number;
}

export function gougedChannelPaths(p: EnricoCerutiParams, g: GougedFlutingParams): GougedChannelPaths | null {
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
export function gougedChannelAreaPath(paths: GougedChannelPaths): string {
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
 * That it shows up as a real, nameable region is the point: under this model
 * the corners are a separate operation, instead of being allowed to distort the
 * channel the way they do in the classic one.
 */
export function gougedCornerJoinAreaPath(p: EnricoCerutiParams, paths: GougedChannelPaths): string {
  return `${defineInsetPath(p, p.outerFlutingDepth ?? 0)} Z ${paths.outer} Z`;
}

// ===== The transition solve =====
// Where the arch stops being the template and becomes the run into the channel.
//
// The whole model turns on this staying an *answer* rather than a question. The
// classic model is pleasant to use not because it has few knobs but because it
// solves for something — flutingArc's own comment says "there is no free trough
// position to choose". Invert the dependency and that solving has to go
// somewhere, or the maker inherits it as a pile of new parameters.
//
// It goes here. Tangency against a known circle is one equation, so exactly one
// unknown is needed to satisfy it: the contact point, free to slide along the
// channel's inner flank. Nobody chooses where the blend begins at the bench
// either — the tool and the wood decide.

/** Where an arch lands on the channel, and how deep it is when it gets there. */
export interface GougedTakeoff {
  /** Distance from the channel centerline to the contact point (mm); 0 is the trough. */
  contactS: number;
  /** How far below the plate surface the arch takes off (mm) — 0 at the channel's inner edge. */
  takeoffDepth: number;
  /** The channel's slope there, which the arch matches. */
  slope: number;
}

/** Depth below the plate surface at `s` from the centerline — {@link gougeProfileZ} negated. */
function takeoffDepthAt(s: number, sweepRadius: number, depth: number): number {
  return -gougeProfileZ(s, sweepRadius, depth);
}

/**
 * Solves for the contact point where an arch meets the channel tangentially.
 *
 * `archSlopeAt` reports the slope the arch would arrive with if it took off at
 * a given contact — supplied by the caller, since the long arch and the cross
 * arch build their curves differently while sharing this geometry exactly.
 * The residual is that slope minus the channel's own, and a root of it is a
 * tangent meeting.
 *
 * Bracketed by a coarse scan before bisecting rather than assuming the residual
 * is monotone: it is generically well-behaved (at the trough the channel is
 * flat while the arch arrives steep; at the inner edge the channel is at its
 * steepest while the arch has the shortest drop) but both the span and the
 * takeoff depth move with the contact, so monotonicity is not something to
 * bet the geometry on.
 *
 * Null when no root exists — the arch and channel genuinely cannot meet, which
 * is real information about an unbuildable instrument rather than an error to
 * paper over. A maker resolves it by cheating the arch; the panel says so.
 */
export function solveGougedTakeoff(
  sweepRadius: number,
  depth: number,
  archSlopeAt: (takeoffDepth: number, contactS: number) => number,
  scanSteps = 32,
): GougedTakeoff | null {
  const w = gougeHalfWidth(sweepRadius, depth);
  if (w <= 0) return null;

  // Held just inside both ends: at s = 0 the channel is exactly flat and at
  // s = w it has left the cut, and neither endpoint is a meeting we want to
  // return as a solution in its own right.
  const lo = w * 1e-3, hi = w * (1 - 1e-3);
  const residual = (s: number): number =>
    archSlopeAt(takeoffDepthAt(s, sweepRadius, depth), s) - gougeProfileSlope(s, sweepRadius, depth);

  let aS = lo, aR = residual(lo);
  let bracket: [number, number] | null = null;
  for (let i = 1; i <= scanSteps; i++) {
    const s = lo + ((hi - lo) * i) / scanSteps;
    const r = residual(s);
    if (aR === 0) { bracket = [aS, aS]; break; }
    if (aR * r < 0) { bracket = [aS, s]; break; }
    aS = s; aR = r;
  }
  if (!bracket) return null;

  let [x0, x1] = bracket;
  for (let i = 0; i < 60 && x1 - x0 > 1e-9; i++) {
    const mid = (x0 + x1) / 2;
    if (residual(x0) * residual(mid) <= 0) x1 = mid; else x0 = mid;
  }
  const contactS = (x0 + x1) / 2;
  return {
    contactS,
    takeoffDepth: takeoffDepthAt(contactS, sweepRadius, depth),
    slope: gougeProfileSlope(contactS, sweepRadius, depth),
  };
}

/** Arch height at `s` along a span, for whichever curve type the plate carries. */
function archZAt(arch: ArchCurve, span: number, s: number): number {
  switch (arch.type) {
    case 'catenary': return catenaryZAt(arch.archHeight, span, s);
    case 'cycloid':  return cycloidZAt(arch.archHeight, span, arch.d, s);
    case 'spline':   return splineZAt(arch.archHeight, span, arch.points, arch.peak ?? 0.5, s);
  }
}

/**
 * The long arch under the gouged model: the same {@link ArchCurve} the classic
 * panel authors, but terminated where it meets the channel at the body caps
 * instead of at an entered `edgeDepth`.
 *
 * The two models deliberately share the long-arch curve. A catenary or spline
 * over body length means the same thing either way, and sharing it is what
 * makes the comparison direct — one arch, two channel treatments.
 *
 * `span`/`yStart` come out of the solve rather than from `innerFlutingDepth`,
 * so the arch reaches slightly further toward the ends than the classic one:
 * it runs *into* the channel's inner flank, not up to its edge.
 */
export interface GougedLongArch {
  span: number;
  yStart: number;
  /** The plate-surface-relative Z the arch takes off from, i.e. −takeoffDepth. */
  takeoff: GougedTakeoff;
  /** The arch restated against its solved takeoff, ready for the path builders. */
  lowered: ArchCurve;
}

export function solveGougedLongArch(
  p: EnricoCerutiParams, arch: ArchCurve, g: GougedFlutingParams,
): GougedLongArch | null {
  const w = gougeHalfWidth(g.sweepRadius, g.depth);
  if (w <= 0 || arch.archHeight <= 0) return null;
  // Channel centerline at the caps. The C-bout gouge never applies here — it
  // only ever affects the waist — so the main sweep governs at both ends, and
  // the two ends solve identically by symmetry.
  const centerY = (p.outerFlutingDepth ?? 0) + w;
  const eps = Math.max(p.height * 1e-5, 1e-4);

  const archSlopeAt = (takeoffDepth: number, contactS: number): number => {
    const span = p.height - 2 * (centerY + contactS);
    if (span <= 0) return 0;
    const lowered = archFromLoweredTakeoff(arch, takeoffDepth);
    // Forward difference from the takeoff, which sits at exactly 0 in the
    // lowered arch's own frame — no cancellation to worry about.
    return archZAt(lowered, span, eps) / eps;
  };

  const takeoff = solveGougedTakeoff(g.sweepRadius, g.depth, archSlopeAt);
  if (!takeoff) return null;
  const yStart = centerY + takeoff.contactS;
  const span = p.height - 2 * yStart;
  if (span <= 0) return null;
  return { span, yStart, takeoff, lowered: archFromLoweredTakeoff(arch, takeoff.takeoffDepth) };
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
 * the whole model exists for, and the long-arch template is where a maker would
 * first notice if it failed.
 *
 * `la` is the plate's solved long arch; without one the plate is channel and
 * land only, which is what an arch too high to meet its channel leaves.
 */
export function gougedCenterlineZAt(
  p: EnricoCerutiParams, g: GougedFlutingParams, la: GougedLongArch | null, y: number,
): number {
  const w = gougeHalfWidth(g.sweepRadius, g.depth);
  const centerY = (p.outerFlutingDepth ?? 0) + w;
  // Distance from the nearer cap's channel centerline, so both ends are the
  // same arithmetic — the caps are identical by symmetry, and the C-bout gouge
  // never reaches either of them.
  const s = Math.min(y, p.height - y) - centerY;
  if (la && y > la.yStart && y < p.height - la.yStart) {
    return archZAt(la.lowered, la.span, y - la.yStart) - la.takeoff.takeoffDepth;
  }
  return s <= -w ? 0 : gougeProfileZ(Math.min(s, w), g.sweepRadius, g.depth);
}

/**
 * The centerline elevation as a path, in the long-arch section frame (canvas
 * X = Z, canvas Y = body length) — the long-arch template's cutting edge.
 *
 * Runs the full body length. Where the blank *stops* is decided afterwards, by
 * trimming the flat off what this returns rather than by working out in advance
 * where the flat begins — see `trimProfileFlats`.
 */
export function gougedLongArchProfilePath(
  p: EnricoCerutiParams, g: GougedFlutingParams, la: GougedLongArch | null,
  xBase: number, sign: 1 | -1, stepMm = 0.5,
): string {
  const n = Math.max(16, Math.ceil(p.height / stepMm));
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const y = (p.height * i) / n;
    pts.push(`${i === 0 ? 'M' : 'L'} ${xBase + sign * gougedCenterlineZAt(p, g, la, y)} ${y}`);
  }
  return pts.join(' ');
}

/**
 * The channel's own section at a body cap, in the long-arch section view
 * (canvas X = Z, canvas Y = body length) — the counterpart of the classic
 * model's recurve, except that this one is the same at both ends and at every
 * station, because it is the tool rather than a fitted curve.
 */
export function gougedChannelCapPath(
  p: EnricoCerutiParams, g: GougedFlutingParams, xBase: number, sign: 1 | -1, atStart: boolean,
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

// ===== The cross-arch template =====

/**
 * How many knots a trochoid crown is sampled into, evenly across the crown's
 * span. Enough that re-splining them reproduces the curve closely, and small
 * enough that the transition solve — which rebuilds this spline at every
 * bisection step — stays cheap.
 *
 * Evenly, and *stopping short of the channel*, both matter. The takeoff can
 * only ever land within a gouge half-width of the centerline, which on a real
 * plate is the outermost couple of percent of the half-width. Bunching knots
 * there — which sampling by the trochoid's own parameter does, since that is
 * where it bends hardest — drops them into the one region the solve moves
 * through. Each knot the takeoff passes leaves the spline, so the arrival slope
 * steps rather than varies, and the bisection is left hunting a root on a
 * staircase: it finds one on either side of a step and misses the middle.
 *
 * The last sampled knot therefore sits at N/(N+1) of the way out, leaving the
 * final stretch unauthored — which is what this model says it is anyway.
 */
const CYCLOID_CROWN_KNOTS = 24;


/** One authored knot of a crown shape, both coordinates as fractions. */
export interface GougedCrossKnot {
  /** Distance from the centerline as a fraction of the local half-width — positive; sides are resolved first. */
  x: number;
  /** Height as a fraction of the local arch height. */
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
export function gougedCrossKnots(shape: GougedCrossShape, side: 1 | -1): GougedCrossKnot[] {
  // A trochoid is symmetric about the crown, so `side` has nothing to select.
  if (shape.type === 'gouged-cycloid') return cycloidCrownKnots(shape);

  const out: GougedCrossKnot[] = [];
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
 * carries — crown outward to the channel centerline.
 *
 * Sampling rather than evaluating is deliberate, and it is what makes this a
 * small change instead of a second code path. Everything downstream of the
 * knots — the station ramp, the full-width spline, the tangency solve, the
 * surface — already works in terms of a knot list and needs no notion of which
 * curve family produced it. A shape can even ramp from a trochoid station to an
 * authored one, because the resolver interpolates positions, not parameters.
 *
 * The price is that the curve the surface actually carries is a monotone cubic
 * *through* the trochoid rather than the trochoid itself. At this knot count
 * the two are indistinguishable next to the wood, and the reconstruction is
 * strictly better behaved: the spline cannot overshoot, whereas a true d=1 cusp
 * has an infinite edge slope for the solve to run into.
 *
 * Positions are walked evenly and stop short of the channel — see
 * {@link CYCLOID_CROWN_KNOTS} for why that is a correctness matter and not a
 * question of sampling taste.
 */
function cycloidCrownKnots(shape: GougedCrossCycloidShape): GougedCrossKnot[] {
  const d = clamp(shape.d, 0, 1);
  const pct = clamp(shape.pct, 0.05, 1);
  const n = CYCLOID_CROWN_KNOTS;
  const out: GougedCrossKnot[] = [];
  for (let i = 1; i <= n; i++) {
    // Crown fraction (0 = crown, 1 = channel centerline) back onto the
    // trochoid's own span, where 0.5 is the peak and 0 the outer end.
    const x = i / (n + 1);
    out.push({ x, z: clamp(cycloidZAt(1, 1, d, 0.5 * (1 - x), pct), 0, 1) });
  }
  return out;
}

/**
 * The defined shape nearest a body-length position — the base shape (which
 * anchors both body ends) or the closest station.
 *
 * Used for the panel's readout while browsing between stations, and *not* an
 * evaluation of the surface there: {@link makeGougedCrossResolver} ramps the
 * sampled knot positions, so the real shape at an in-between station is a blend
 * of its neighbours. There is nothing to show for that blend in the fields —
 * two shapes can differ in knot count entirely, and a ramped trochoid is no
 * longer a trochoid of any `d`. Showing the nearest real shape is at least a
 * shape the maker authored, and every edit opens a draft station here anyway
 * rather than writing back to it.
 */
export function nearestGougedCrossShape(
  cross: GougedCrossParams, y: number, bodyHeight: number,
): GougedCrossShape {
  // Widened explicitly: `stations` is a union of two arrays, and inference
  // would otherwise pin the type parameter to whichever arm comes first.
  const stations = normalizeCrossArchStations<GougedCrossStation>(cross.stations, bodyHeight);
  let best: GougedCrossShape = cross;
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
 * Those anchors are not assumptions, they are what the fractional form means:
 * `x` is measured from the crown out to the takeoff and `z` up from the takeoff
 * to the crown, so (0, 1) and (1, 0) are true of every shape by definition.
 * With both in place this is exactly the curve {@link crossProfile} draws, since
 * that builds the same knots plus the same two endpoints and only scales the
 * axes — an affine map a spline is indifferent to.
 *
 * It used to hold flat past the outermost knot on the grounds that nothing is
 * authored out there. Alone that was harmless, but it made the resolver invent
 * plateaus: a station knot at some other position forces every *other* shape to
 * report a height there, and a held-flat answer claims "level with my outermost
 * knot" — a definite statement the shape never made. Two ramped columns then
 * land at nearly equal heights and the monotone spline, correctly, draws a flat
 * between them. Descending toward the takeoff instead says what the shape
 * actually does out there.
 */
function knotFunction(knots: GougedCrossKnot[]): (x: number) => number {
  const xs = [0, ...knots.map(k => k.x), 1];
  const zs = [1, ...knots.map(k => k.z), 0];
  const f = makeMonotoneSpline(xs, zs);
  return x => f(clamp(x, 0, 1));
}

/** A crown shape resolved to one body station: its knots on each side, still fractional. */
export interface GougedCrossRow {
  left: GougedCrossKnot[];
  right: GougedCrossKnot[];
  /**
   * Where the crown sits, as a fraction of the full centerline chord — 0.5 is
   * the joint. Optional for the same reason the shape's own `peak` is: absent
   * means centred, which is what every row meant before the crown could move.
   */
  peak?: number;
}

export type GougedCrossResolver = (y: number) => GougedCrossRow;

/**
 * Ramps a plate's crown shape along the body — the gouged counterpart of
 * {@link makeCrossArchSplineResolver}.
 *
 * Two stations can carry entirely different knot lists, so there is no knot to
 * knot correspondence to interpolate. The classic spline resolver solves that
 * by sampling each shape onto a dense fixed grid and ramping every column. Here
 * the union of every station's own knot positions serves the same purpose and
 * is far smaller — a handful of columns rather than 161 — which matters because
 * these knots are re-splined at query time to solve the transition, where the
 * classic grid is only ever read by linear interpolation.
 *
 * A station with no knot at some position contributes its own shape's value
 * there, read off its own curve — see {@link knotFunction}.
 *
 * The crown position ramps alongside as a plain scalar. It has no column to
 * belong to: it is the origin the fractional positions are measured from, so
 * ramping it with them would be circular.
 */
export function makeGougedCrossResolver(
  cross: GougedCrossParams, bodyHeight: number,
): GougedCrossResolver {
  // Widened explicitly: `stations` is a union of two arrays, and inference
  // would otherwise pin the type parameter to whichever arm comes first.
  const stations = normalizeCrossArchStations<GougedCrossStation>(cross.stations, bodyHeight);
  const shapes = [cross as GougedCrossShape, ...stations];

  const sideTracks = (side: 1 | -1) => {
    const perShape = shapes.map(s => gougedCrossKnots(s, side));
    const xs = [...new Set(perShape.flat().map(k => +k.x.toFixed(4)))].sort((a, b) => a - b);
    if (!stations.length || bodyHeight <= 0) {
      const base = knotFunction(perShape[0]);
      return { xs, tracks: xs.map(x => { const v = base(x); return () => v; }) };
    }
    // The base shape anchors both body ends, stations override in between —
    // the same edges-plus-interior-points arrangement the classic resolvers use.
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
  const read = (s: { xs: number[]; tracks: ((y: number) => number)[] }, y: number): GougedCrossKnot[] =>
    s.xs.map((x, i) => ({ x, z: clamp(s.tracks[i](y), 0, 1) }));

  // Only a template carries a crown position; a trochoid is symmetric by
  // construction and peaks where its two halves meet.
  const peakOf = (s: GougedCrossShape) => (s.type === 'gouged' ? s.peak ?? 0.5 : 0.5);
  const peakTrack = stations.length && bodyHeight > 0
    ? makeMonotoneSpline(
      [0, ...stations.map(s => s.y), bodyHeight],
      [peakOf(shapes[0]), ...shapes.slice(1).map(peakOf), peakOf(shapes[0])],
    )
    : () => peakOf(shapes[0]);

  return (y: number) => ({ left: read(left, y), right: read(right, y), peak: peakTrack(y) });
}

/** Which gouge is cutting at body station `y` — the C-bout tool between the corners, else the main one. */
export function gougeAtY(
  p: EnricoCerutiParams, g: GougedFlutingParams, y: number,
): { sweepRadius: number; halfWidth: number } {
  const corners = [p.bouts.UCr?.y, p.bouts.LCr?.y].filter((v): v is number => v !== null && v !== undefined);
  const inCBout = corners.length === 2 && y >= Math.min(...corners) && y <= Math.max(...corners);
  const sweepRadius = inCBout ? effectiveCBoutSweep(g) : g.sweepRadius;
  return { sweepRadius, halfWidth: gougeHalfWidth(sweepRadius, g.depth) };
}

/** A candidate landing for one side: where the arch stops, and how deep it is there. */
interface SideEnd { xEnd: number; zEnd: number; }

/**
 * Where a knot fraction lands across the plate: `frac` measured from the joint
 * out to this side's takeoff at `side * xEnd`.
 *
 * Measured from the joint rather than from the crown, so moving the crown does
 * not drag every knot along with it. A knot is a place on the section — the
 * position a maker read off a scan, or off a plate with a caliper — and it
 * should stay there while the ridge is dialled into place around it.
 *
 * The consequence is that a knot can end up on the far side of the crown from
 * the one it was authored on; see {@link crossProfile}, which sorts rather than
 * assuming.
 *
 * The single place the fractional form becomes a position, so the profile, the
 * module guide and the panel's halos cannot drift apart about it.
 */
function knotXAt(xEnd: number, side: 1 | -1, frac: number): number {
  return side * frac * xEnd;
}

/** {@link knotXAt} against a solved station — what the guide and the panel's halos use. */
export function gougedCrossKnotX(section: GougedCrossSection, side: 1 | -1, frac: number): number {
  return knotXAt(side < 0 ? section.xEndLeft : section.xEndRight, side, frac);
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
  archH: number, xPeak: number,
  left: GougedCrossKnot[], right: GougedCrossKnot[], endL: SideEnd, endR: SideEnd,
): (x: number) => number {
  // Fractions become millimetres here and nowhere else, and *both* axes are
  // measured against that side's own takeoff: position from the crown out to
  // it, height up from it toward the crown. The latter is the classic model's
  // `hEff = archH + edgeDepth` convention.
  //
  // Measuring height from the takeoff is what lets the recurve bands near the
  // body caps work at all. There the crown sits below plate level, so `archH`
  // is negative, and scaling a knot as `z × archH` would lift it *above* the
  // crown and invert the section. Measured from the takeoff the shape stays
  // right whichever side of plate level the crown is on.
  //
  // Measuring position from the takeoff — rather than from the channel
  // centerline, with knots outside the takeoff discarded — is what makes the
  // tangency solvable. Discarding is a step change: the solve moves the takeoff
  // inward looking for its root, and each knot it passes leaves the spline, so
  // the slope it arrives with jumps rather than varies. Bisection on a staircase
  // does not find roots, it finds risers — it converges neatly onto the drop
  // point and reports a tangency that isn't one. Stretching the shape instead
  // means no knot ever crosses the takeoff, the arrival slope moves smoothly,
  // and the root is a root. It is also the more honest reading of a fractional
  // template: the shape spans the part of the plate the maker actually carves,
  // which ends where the channel begins.
  //
  // Positions run from the joint, not from the crown — see {@link knotXAt} for
  // why. So the crown is not necessarily between the two runs of knots: move it
  // and a knot authored on the treble side can end up on the bass flank of it.
  // The list is therefore sorted rather than assembled in assumed order.
  const heightAt = (z: number, end: SideEnd) => end.zEnd + z * (archH - end.zEnd);
  const place = (knots: GougedCrossKnot[], end: SideEnd, side: 1 | -1) => knots
    .map(k => ({ x: knotXAt(end.xEnd, side, k.x), z: heightAt(k.z, end) }))
    // Defensive: authored fractions are held below 1, so this never fires.
    .filter(k => k.x > -endL.xEnd + 1e-6 && k.x < endR.xEnd - 1e-6);

  const inner = [...place(left, endL, -1), ...place(right, endR, 1)].sort((a, b) => a.x - b.x);

  // A knot landing *on* the crown would hand the spline a zero-width interval.
  // It is held clear rather than dropped: dropping is a step change, and a step
  // is what the tangency solve cannot survive — the same lesson the takeoff
  // anchoring above records. At this gap the nudge is far below anything the
  // wood or the mesh could resolve.
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

  // A centred crown is already curvature-continuous: the two flanks are mirror
  // images, so the monotone spline's filter has nothing asymmetric to clamp and
  // its second derivatives match across the crown by symmetry. Taking the plain
  // path here is not just an optimisation — it guarantees that adding this
  // machinery changed nothing for every recipe that does not use a moved crown.
  if (Math.abs(xPeak) < 1e-9) return makeMonotoneSpline(xs, zs);

  const smooth = makeC2SplineWithFlatKnot(xs, zs, crown);
  if (smooth && !overshoots(smooth, xs, zs, archH)) return smooth;
  return makeMonotoneSpline(xs, zs);
}

/**
 * How far a profile may stray outside the knots bracketing it, as a fraction of
 * the crown's own rise, before it is judged unusable.
 *
 * Generous on purpose. The curvature-continuous spline buys its smoothness by
 * giving up the no-overshoot guarantee, and a fraction of a millimetre of
 * wander on a 15mm arch is far below what the wood, the mesh or the eye
 * resolves — whereas the crease it removes is plainly visible. This is the
 * "nudge the curve to make it smooth" trade, with a number on it.
 */
const PROFILE_OVERSHOOT_TOLERANCE = 0.02;

/**
 * Whether a profile wanders outside the knots it passes through.
 *
 * Checked per interval rather than against the crown alone, because the
 * curvature-continuous spline does not misbehave where one would expect. Its
 * crown is exact by construction; where it can swing is the outermost interval,
 * the long unauthored run from the last knot down into the channel — which is
 * also the stretch the tangency solve reads its arrival slope from, so a swing
 * there would not merely look wrong, it would move the contact.
 */
function overshoots(f: (x: number) => number, xs: number[], zs: number[], archH: number): boolean {
  const rise = Math.max(archH - Math.min(zs[0], zs[zs.length - 1]), 1e-6);
  const tol = PROFILE_OVERSHOOT_TOLERANCE * rise;
  for (let i = 0; i < xs.length - 1; i++) {
    const lo = Math.min(zs[i], zs[i + 1]) - tol;
    const hi = Math.max(zs[i], zs[i + 1]) + tol;
    // A cubic's extremum on an interval is interior; quarter points catch any
    // excursion big enough to matter at this tolerance.
    for (const t of [0.25, 0.5, 0.75]) {
      const v = f(xs[i] + t * (xs[i + 1] - xs[i]));
      if (v < lo || v > hi) return true;
    }
  }
  return false;
}

/** A plate's transverse surface at one body station, with the transition solved on both sides. */
export interface GougedCrossSection {
  /** Channel centerline half-chord here. */
  centerHalf: number;
  halfWidth: number;
  sweepRadius: number;
  /** Crown height above the plate outer surface — negative in the recurve bands near the caps. */
  archH: number;
  /** Where the crown sits across the plate (mm), after tapering. 0 is the joint. */
  xPeak: number;
  left: GougedTakeoff | null;
  right: GougedTakeoff | null;
  /** |x| where the arch hands over to the channel on each side — where one is drawn in place of the other. */
  xEndLeft: number;
  xEndRight: number;
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
 * is leaning on distance. Same curve, both places: see `gougedZAt` and the
 * offset taper in {@link solveGougedCrossSection}.
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

/** Hermite smoothstep from 0 at `lo` to 1 at `hi`, flat in slope at both ends. */
function smoothstep(v: number, lo: number, hi: number): number {
  const k = clamp((v - lo) / (hi - lo), 0, 1);
  return k * k * (3 - 2 * k);
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
export function solveGougedCrossSection(
  archH: number, centerHalf: number, sweepRadius: number, depth: number, row: GougedCrossRow,
  chordFrac = 1,
): GougedCrossSection | null {
  const halfWidth = gougeHalfWidth(sweepRadius, depth);
  // The crown may sit *below* plate level — that is the recurve band near each
  // body cap, where the long arch has not yet climbed clear of its own takeoff.
  // A station is only genuinely archless once the crown reaches the channel's
  // trough, at which point there is nothing left for the channel to run into.
  // Requiring a positive crown here instead is what left a flat ring around
  // both caps, with a straight seam where the height crossed zero.
  if (halfWidth <= 0 || centerHalf <= halfWidth || archH <= -depth) return null;

  // The crown, in millimetres. Anchored to the centerline half-chord — a
  // quantity the solve never touches — so it holds still while both takeoffs
  // hunt for their contacts.
  //
  // Tapered by how much crown there is to move. The ridge line's path along the
  // body is `(peak − ½)·2·centerHalf(y)`, so an offset crown inherits every
  // property of `centerHalf` — a chord read off a sampled loop that runs nearly
  // horizontal at the caps, where it therefore swings fastest per mm of body and
  // carries the most of the sampling's own wobble. The ridge is a curvature
  // feature of the section; steering one with that folds the surface. Centred,
  // the whole term is zero and none of it can reach the plate, which is why this
  // only ever appeared once the crown could move.
  //
  // Tapering on the arch height fixes it at the cause and says something true
  // besides: where the long arch has not yet climbed clear of the channel there
  // is no crown, and a ridge is a feature of a crown. It costs nothing to plumb,
  // since `archH` is already the first thing this function is handed.
  //
  // Smoothstepped rather than clamped. A clamp is C⁰ in slope at both ends of
  // the band, and a kink in the ridge line is precisely the fold this exists to
  // remove — it would move the problem inward rather than solve it.
  //
  // Two conditions, both about whether an offset ridge means anything here, and
  // both multiplied in because either one alone is a reason to be centred:
  //
  //   how much crown there is — a ridge is a feature of a crown, and near the
  //   caps the arch has barely climbed clear of the channel; and
  //
  //   how much the station chord describes — see {@link crownOffsetTrust}. This is
  //   the one that keeps the *surface* whole rather than the section pretty:
  //   where the height field falls back on distance it cannot tell one side of
  //   the joint from the other, so it picks a flank by the sign of x. An
  //   asymmetric crown makes those two flanks disagree, and the disagreement
  //   lands as a step down the joint. Centring the crown there is not a
  //   cosmetic choice — it is the condition under which the sign of x stops
  //   mattering.
  const t = clamp(archH / (PEAK_TAPER_DEPTHS * depth), 0, 1);
  const taper = t * t * (3 - 2 * t) * crownOffsetTrust(chordFrac);

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

  // Where a side lands if it never finds a tangency: the channel's inner edge,
  // at plate level. The section still draws — with a visible crease, which is
  // the honest picture of an arch that cannot meet its channel — and the panel
  // reports it rather than the model quietly fudging a meeting.
  let endL = endAt(halfWidth * (1 - 1e-3));
  let endR = endL;
  let takeL: GougedTakeoff | null = null;
  let takeR: GougedTakeoff | null = null;

  const solveSide = (side: 1 | -1): GougedTakeoff | null => {
    const slopeAt = (takeoffDepth: number, contactS: number): number => {
      const mine: SideEnd = { xEnd: centerHalf - contactS, zEnd: -takeoffDepth };
      if (mine.xEnd <= 1e-3) return 0;
      const f = side === 1
        ? crossProfile(archH, xPeak, row.left, row.right, endL, mine)
        : crossProfile(archH, xPeak, row.left, row.right, mine, endR);
      const eps = Math.max(mine.xEnd * 1e-4, 1e-6);
      // Measured inward, matching the channel's own slope convention: `s` grows
      // toward the centerline, so a rising arch reads positive on both.
      return (f(side * (mine.xEnd - eps)) - mine.zEnd) / eps;
    };
    return solveGougedTakeoff(sweepRadius, depth, slopeAt);
  };

  // Both sides live on one spline now, so each landing nudges the other's
  // arrival slope. The coupling is weak — a cubic spline's influence decays
  // geometrically along its knots, and the crown plus its neighbours sit
  // between the two ends — so a few sweeps settle it, and a symmetric template
  // converges on the first.
  for (let i = 0; i < 4; i++) {
    takeR = solveSide(1);
    if (takeR) endR = endAt(takeR.contactS);
    takeL = solveSide(-1);
    if (takeL) endL = endAt(takeL.contactS);
  }

  const profile = crossProfile(archH, xPeak, row.left, row.right, endL, endR);
  const zAt = (x: number): number => {
    if (x >= -endL.xEnd && x <= endR.xEnd) return profile(x);
    // Past the arch's reach the channel is the surface, and past that the flat
    // land — both of which {@link gougeProfileZ} already describes, measured
    // inward from the centerline on whichever side we are.
    return gougeProfileZ(centerHalf - Math.abs(x), sweepRadius, depth);
  };

  return {
    centerHalf, halfWidth, sweepRadius, archH, xPeak,
    left: takeL, right: takeR,
    xEndLeft: endL.xEnd, xEndRight: endR.xEnd,
    zAt,
  };
}

/** One crosshair of a crown guide — where an authored knot landed at this station. */
export interface GougedCrossGuideKnot {
  x: number;
  /** Height above the plate outer surface. */
  z: number;
  /** This side's takeoff level: the zero the knot's height percentage counts up from. */
  base: number;
}

/**
 * A trochoid crown's generating circle on one side. Centered under the crown,
 * which for a trochoid is always the joint — the curve is symmetric by
 * construction, so there is no crown position to move.
 */
export interface GougedCrossGuideCircle {
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
 * what generates it is a rolling circle, so the guide draws that instead, the
 * same construction the classic cross-arch guide shows.
 *
 * Knots come from `shape` rather than from the station's resolved row, and the
 * difference matters: the row carries the *union* of every station's knot
 * positions, since that is how {@link makeGougedCrossResolver} ramps shapes
 * whose point lists don't correspond. Marking those would show a maker two
 * crosshairs per side for one authored point. The guide marks what was
 * authored, so it agrees with the panel's own rows.
 *
 * Their placement is still read off the *solved* station: positions are
 * fractions of this side's crown and heights fractions of its rise from the
 * takeoff, so neither means anything in millimetres until the transition has
 * been solved. Each side is placed against its own takeoff, so an asymmetric
 * template puts its mirrored knots at two heights — the model's whole subject,
 * and a guide that hid it would be lying.
 *
 * Between stations, `shape` is the nearest authored one while the curve drawn
 * is a ramp through it, so the crosshairs can sit a little off the section.
 * They mark the shape the panel's fields are editing, which is the question
 * they exist to answer; the classic cross-arch guide behaves the same way.
 */
export interface GougedCrossGuide {
  knots: GougedCrossGuideKnot[];
  circles: GougedCrossGuideCircle[];
  /** The crown itself, always marked — at `section.xPeak`, which need not be the joint. */
  peakZ: number;
}

export function gougedCrossGuide(shape: GougedCrossShape, section: GougedCrossSection): GougedCrossGuide {
  const out: GougedCrossGuide = { knots: [], circles: [], peakZ: section.archH };

  for (const side of [-1, 1] as const) {
    const xEnd = side < 0 ? section.xEndLeft : section.xEndRight;
    // The endpoint of the profile spline, which is exactly the takeoff.
    const base = section.zAt(side * xEnd);
    const hEff = section.archH - base;

    if (shape.type === 'gouged-cycloid') {
      // A trochoid of rise `hEff` and factor `d` is traced by a circle of
      // radius hEff/(2d) rolling at half that rise. Below 0.01 the curve has
      // flattened into a raised cosine and the circle runs off to infinity —
      // there is nothing honest left to draw.
      const d = clamp(shape.d, 0, 1);
      if (d > 0.01) out.circles.push({ centerZ: base + hEff / 2, radius: hEff / (2 * d) });
    } else {
      for (const k of gougedCrossKnots(shape, side)) {
        out.knots.push({ x: gougedCrossKnotX(section, side, k.x), z: base + k.z * hEff, base });
      }
    }
  }
  return out;
}

/**
 * Outermost |x| where a station line crosses a sampled loop, or null when it
 * misses. A local copy of the same query {@link PlateSurfaceModel} runs against
 * its own boundaries — kept here rather than imported so the gouged math stays
 * free of any dependency on the classic surface module.
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
export interface GougedPlateGeometry {
  gouge: GougedFlutingParams;
  /** Sampled channel centerline, for half-chord queries along the body. */
  centerPoly: Pt[];
  /** The same loop indexed for distance queries — how the height field measures the channel. */
  centerIdx: PolylineIndex;
  resolveCross: GougedCrossResolver;
  /** The plate's long arch, already terminated against the channel at the caps. */
  longArch: GougedLongArch | null;
  /**
   * The widest the corner wedge gets anywhere on this plate — how much further
   * apart than one gouge the platform boundary and the channel ever run.
   *
   * Zero on the flanks by construction, so this is a pure corner measurement.
   * It bounds the corner pass in both directions: nothing further inside the
   * boundary than `2w + this` can be reached by it, which lets the height field
   * skip the query outright over most of the plate, and no local wedge estimate
   * is allowed to exceed it, which makes a runaway floor impossible rather than
   * merely unlikely.
   */
  cornerWedgeMax: number;
}

/**
 * How far the channel runs from the platform boundary, in excess of the one
 * gouge width that separates them along the flanks.
 *
 * Measured *at the boundary* rather than at an arbitrary point, because the gap
 * is a property of the two loops and not of whoever is asking. Sampled coarsely:
 * this only sets a bound, and the corner is tens of millimetres of arc.
 */
function maxCornerWedge(p: EnricoCerutiParams, g: GougedFlutingParams, centerIdx: PolylineIndex): number {
  const boundary = samplePathToPolyline(defineInsetPath(p, p.outerFlutingDepth ?? 0), 2);
  let max = 0;
  for (const v of boundary) {
    const gap = closestPointToPolylineIndexed(v, centerIdx).dist - gougeAtY(p, g, v.y).halfWidth;
    if (gap > max) max = gap;
  }
  return max;
}

export function buildGougedPlateGeometry(
  p: EnricoCerutiParams, arch: ArchCurve, g: GougedFlutingParams, cross: GougedCrossParams,
): GougedPlateGeometry | null {
  const paths = gougedChannelPaths(p, g);
  if (!paths) return null;
  const centerPoly = samplePathToPolyline(paths.center, 1);
  const centerIdx = buildPolylineIndex(centerPoly);
  return {
    gouge: g,
    centerPoly,
    centerIdx,
    resolveCross: makeGougedCrossResolver(cross, p.height),
    longArch: solveGougedLongArch(p, arch, g),
    cornerWedgeMax: cornerGougeOn(g) ? maxCornerWedge(p, g, centerIdx) : 0,
  };
}

/**
 * The long arch's height at station `y` under the gouged model — the crown the
 * cross template hangs from.
 *
 * Read off the *solved* arch rather than the classic {@link longArchHeightAt},
 * whose span is pinned to `innerFlutingDepth`. Here the span comes out of the
 * cap solve, so the two disagree slightly near the ends.
 */
export function gougedLongArchHeightAt(geo: GougedPlateGeometry, y: number): number {
  const la = geo.longArch;
  if (!la) return 0;
  const s = y - la.yStart;
  if (s <= 0 || s >= la.span) return -la.takeoff.takeoffDepth;
  return archZAt(la.lowered, la.span, s) - la.takeoff.takeoffDepth;
}

/** The solved transverse section at station `y`, or null where the plate has no arch there. */
export function gougedCrossSectionAt(
  p: EnricoCerutiParams, geo: GougedPlateGeometry, y: number,
): GougedCrossSection | null {
  const centerHalf = loopHalfChordAtY(geo.centerPoly, y);
  if (centerHalf === null) return null;
  const { sweepRadius } = gougeAtY(p, geo.gouge, y);
  // Measured at the joint, which is where the sign-of-x ambiguity lives and so
  // the only place the answer matters. Equals the half-chord through the body,
  // and falls away as the channel wraps round each cap.
  const chordFrac = centerHalf > 1e-9
    ? closestPointToPolylineIndexed({ x: 0, y }, geo.centerIdx).dist / centerHalf
    : 1;
  return solveGougedCrossSection(
    gougedLongArchHeightAt(geo, y), centerHalf, sweepRadius, geo.gouge.depth, geo.resolveCross(y),
    chordFrac,
  );
}

/**
 * The full-width section at a station, in section coordinates (canvas X =
 * violin X, canvas Y = absolute Z) — crown, both transitions, both channels and
 * the flat land beyond, as one continuous curve.
 *
 * Sampled from {@link GougedCrossSection.zAt} rather than assembled piecewise,
 * so what is drawn is exactly the surface the model evaluates. There is no seam
 * to line up: the arch and the channel are one function.
 */
export function gougedCrossSectionPath(
  section: GougedCrossSection, xFrom: number, xTo: number, zBase: number, sign: 1 | -1, n = 160,
): string {
  if (!(xTo > xFrom)) return '';
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xFrom + ((xTo - xFrom) * i) / n;
    pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${zBase + sign * section.zAt(x)}`);
  }
  return pts.join(' ');
}

/**
 * How far apart the two plates are drawn when shown side by side, as a
 * fraction of body width. Overlaying them buries one under the other; laid out
 * left and right, the top and back channels can be compared at a glance.
 */
export const PLATE_LAYOUT_GAP = 0.55;

/** Plan-view x-shift for a plate in the side-by-side layout: top right, back left. */
export function plateLayoutOffset(p: EnricoCerutiParams, plate: 'top' | 'bottom'): number {
  return (plate === 'top' ? 1 : -1) * p.width * PLATE_LAYOUT_GAP;
}
