import { Pt } from '../models/types';
import {
  buildPolylineIndex, clamp, closestPointToPolylineIndexed, makeMonotoneSpline, PolylineIndex,
} from '../helpers/draftMath';
import {
  catenaryZAt, cycloidZAt, flutingArc, samplePathToPolyline, splineZAt,
} from '../helpers/svgPathMath';
import {
  ArchCurve, EnricoCerutiParams, GougedCrossCycloidParams, GougedCrossCycloidShape, GougedCrossParams,
  GougedCrossShape, GougedCrossSplineParams, GougedFlutingParams,
} from './ceruti-types';
import { defineFlutingPath, defineInsetPath } from './ceruti-paths';
import { archFromLoweredTakeoff, crossArchEdgeSlopeAt, normalizeCrossArchStations } from './ceruti-arching';

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
 * A starting gouge for a plate, seeded from whatever fluting the classic model
 * already has configured so the two open on comparable geometry rather than
 * the gouged panel starting from nothing.
 *
 * The sweep is picked so the cut's width matches the classic annulus width at
 * its nominal setting: given a target half-width `w` and depth `D`,
 * R = (w² + D²) / 2D falls straight out of the half-width formula. That makes
 * the first render a fair side-by-side rather than an arbitrary one.
 */
export function defaultGougedFlutingParams(p: EnricoCerutiParams): GougedFlutingParams {
  const inner = p.innerFlutingDepth ?? 6;
  const outer = p.outerFlutingDepth ?? 2;
  const depth = 1.2;
  const halfWidth = Math.max(Math.abs(inner - outer) / 2, 0.5);
  return {
    sweepRadius: +((halfWidth * halfWidth + depth * depth) / (2 * depth)).toFixed(2),
    depth,
    sweepRadius_cBout: null,
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

/**
 * One sample of the *classic* model's channel, taken along its own inner
 * boundary — the diagnostic that decides whether the gouged model is worth
 * finishing.
 *
 * `width` is the annulus the classic `flutingProfileZ` is handed at that point,
 * and `radius` is the gouge sweep its {@link flutingArc} therefore produces.
 * Both are outputs there, so both drift; the point of plotting them is to see
 * by how much, and where. A real gouge cannot change sweep as it travels, so
 * every millimetre of swing here is geometry the classic model asks for and no
 * maker could cut.
 */
export interface ClassicChannelSample {
  pt: Pt;
  /** Outward unit normal of the boundary loop, for drawing a ribbon off it. */
  normal: Pt;
  width: number;
  radius: number | null;
}

export function classicChannelProfile(
  p: EnricoCerutiParams, side: 'top' | 'bottom' = 'top', step = 2,
): ClassicChannelSample[] {
  const innerPath = defineFlutingPath(p, p.innerFlutingDepth ?? 0);
  if (!innerPath) return [];
  const inner = samplePathToPolyline(innerPath, step);
  const platformIdx = buildPolylineIndex(samplePathToPolyline(defineInsetPath(p, p.outerFlutingDepth ?? 0), 1));
  const edgeDepth = p.arching?.[side].edgeDepth ?? 0;

  const out: ClassicChannelSample[] = [];
  for (let i = 0; i < inner.length; i++) {
    const pt = inner[i];
    const prev = inner[(i - 1 + inner.length) % inner.length];
    const next = inner[(i + 1) % inner.length];
    const tx = next.x - prev.x, ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // Loops run one consistent way, so a fixed 90° turn of the tangent points
    // outward the whole way round; sign only has to be right relative to itself.
    const normal = new Pt(ty / len, -tx / len);
    const width = closestPointToPolylineIndexed(pt, platformIdx).dist;
    // The arch's takeoff slope varies along the body, and it is the third input
    // that makes the classic radius drift even where the width holds steady.
    const slope = crossArchEdgeSlopeAt(p, pt.y, side, pt.x < 0);
    out.push({ pt, normal, width, radius: flutingArc(edgeDepth, width, slope)?.r ?? null });
  }
  return out;
}

/** Min/max/ratio of a diagnostic series, for the panel's numeric read-out. */
export function channelSwing(values: (number | null)[]): { min: number; max: number; ratio: number } | null {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!real.length) return null;
  const min = Math.min(...real), max = Math.max(...real);
  return { min, max, ratio: min > 0 ? max / min : Infinity };
}

/**
 * Wraps a diagnostic series around its own loop as a ribbon: each sample pushed
 * out along the boundary's normal in proportion to where it sits between the
 * series min and max. Reads as a wavy band beside the outline — flat where the
 * quantity is stable, bulging where it swings.
 */
export function diagnosticRibbonPath(
  samples: ClassicChannelSample[], values: (number | null)[], amplitude: number,
): string | null {
  const swing = channelSwing(values);
  if (!swing || samples.length < 2) return null;
  const span = swing.max - swing.min || 1;
  const pts: string[] = [];
  for (let i = 0; i < samples.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    const t = clamp((v - swing.min) / span, 0, 1);
    const s = samples[i];
    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${s.pt.x + s.normal.x * t * amplitude} ${s.pt.y + s.normal.y * t * amplitude}`);
  }
  return pts.length > 1 ? pts.join(' ') : null;
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
 * A shape's height fraction as a continuous function of position fraction,
 * anchored at the crown. Flat beyond the outermost knot: nothing is authored
 * out there, because that stretch is the transition and belongs to the solve.
 */
function knotFunction(knots: GougedCrossKnot[]): (x: number) => number {
  if (!knots.length) return () => 1;
  const xs = [0, ...knots.map(k => k.x)];
  const zs = [1, ...knots.map(k => k.z)];
  const f = makeMonotoneSpline(xs, zs);
  const last = xs[xs.length - 1];
  const lastZ = zs[zs.length - 1];
  return x => (x <= last ? f(Math.max(x, 0)) : lastZ);
}

/** A crown shape resolved to one body station: its knots on each side, still fractional. */
export interface GougedCrossRow {
  left: GougedCrossKnot[];
  right: GougedCrossKnot[];
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
 * there, held flat past its outermost knot.
 */
export function makeGougedCrossResolver(
  cross: GougedCrossParams, bodyHeight: number,
): GougedCrossResolver {
  const stations = normalizeCrossArchStations(cross.stations, bodyHeight);
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

  return (y: number) => ({ left: read(left, y), right: read(right, y) });
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
 * The whole transverse profile as one spline: left takeoff, left knots, the
 * crown, right knots, right takeoff.
 *
 * Built across the full width rather than as two curves meeting at the middle,
 * and that is not a detail. As an *endpoint* of a one-sided spline the crown
 * gets a natural end condition, which leaves it with a nonzero slope — so the
 * two sides arrive at the centerline at an angle and the arch peaks in a sharp
 * ridge. As an *interior* knot it sits between secants of opposite sign, which
 * is precisely the case Hyman's filter zeroes, giving a genuine smooth maximum.
 *
 * It is also the only correct answer: a nonzero slope at x = 0 would put the
 * real high spot somewhere off the centerline, and the entered arch height
 * would stop describing the plate — the same invariant the peak clamp protects.
 *
 * The transition is not a separate curve either. It is this spline's outermost
 * segment on each side, which is why it arrives curvature-continuous with the
 * rest of the arch for free: there is no blend primitive to match up, because
 * there is no blend.
 */
function crossProfile(
  archH: number,
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
  const heightAt = (z: number, end: SideEnd) => end.zEnd + z * (archH - end.zEnd);
  const place = (knots: GougedCrossKnot[], end: SideEnd) => knots
    .map(k => ({ x: k.x * end.xEnd, z: heightAt(k.z, end) }))
    .filter(k => k.x > 1e-6 && k.x < end.xEnd - 1e-6);

  const keptL = place(left, endL);
  const keptR = place(right, endR);

  const xs: number[] = [-endL.xEnd];
  const zs: number[] = [endL.zEnd];
  for (let i = keptL.length - 1; i >= 0; i--) {
    xs.push(-keptL[i].x);
    zs.push(keptL[i].z);
  }
  xs.push(0);
  zs.push(archH);
  for (const k of keptR) {
    xs.push(k.x);
    zs.push(k.z);
  }
  xs.push(endR.xEnd);
  zs.push(endR.zEnd);
  return makeMonotoneSpline(xs, zs);
}

/** A plate's transverse surface at one body station, with the transition solved on both sides. */
export interface GougedCrossSection {
  /** Channel centerline half-chord here. */
  centerHalf: number;
  halfWidth: number;
  sweepRadius: number;
  /** Crown height above the plate outer surface — negative in the recurve bands near the caps. */
  archH: number;
  /** The crown shape resolved to this station, as the solve saw it. */
  row: GougedCrossRow;
  left: GougedTakeoff | null;
  right: GougedTakeoff | null;
  /** |x| where the arch hands over to the channel on each side — where one is drawn in place of the other. */
  xEndLeft: number;
  xEndRight: number;
  /** Surface height above the plate outer surface at transverse position `x`. */
  zAt: (x: number) => number;
}

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
): GougedCrossSection | null {
  const halfWidth = gougeHalfWidth(sweepRadius, depth);
  // The crown may sit *below* plate level — that is the recurve band near each
  // body cap, where the long arch has not yet climbed clear of its own takeoff.
  // A station is only genuinely archless once the crown reaches the channel's
  // trough, at which point there is nothing left for the channel to run into.
  // Requiring a positive crown here instead is what left a flat ring around
  // both caps, with a straight seam where the height crossed zero.
  if (halfWidth <= 0 || centerHalf <= halfWidth || archH <= -depth) return null;

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
        ? crossProfile(archH, row.left, row.right, endL, mine)
        : crossProfile(archH, row.left, row.right, mine, endR);
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

  const profile = crossProfile(archH, row.left, row.right, endL, endR);
  const zAt = (x: number): number => {
    if (x >= -endL.xEnd && x <= endR.xEnd) return profile(x);
    // Past the arch's reach the channel is the surface, and past that the flat
    // land — both of which {@link gougeProfileZ} already describes, measured
    // inward from the centerline on whichever side we are.
    return gougeProfileZ(centerHalf - Math.abs(x), sweepRadius, depth);
  };

  return {
    centerHalf, halfWidth, sweepRadius, archH, row,
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

/** A trochoid crown's generating circle on one side, centered on the centerline. */
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
 * Both are read off the *solved* station rather than the shape's own numbers.
 * Knot positions are fractions of this side's crown and heights fractions of
 * its rise from the takeoff, so neither means anything in millimetres until the
 * transition has been solved — and each side is placed against its own takeoff,
 * so an asymmetric template puts its mirrored knots at two heights. That is the
 * model's whole subject, and a guide that hid it would be lying.
 */
export interface GougedCrossGuide {
  knots: GougedCrossGuideKnot[];
  circles: GougedCrossGuideCircle[];
  /** The crown itself, always marked. */
  peakZ: number;
}

export function gougedCrossGuide(shape: GougedCrossShape, section: GougedCrossSection): GougedCrossGuide {
  const out: GougedCrossGuide = { knots: [], circles: [], peakZ: section.archH };

  for (const side of [-1, 1] as const) {
    const xEnd = side < 0 ? section.xEndLeft : section.xEndRight;
    const knots = side < 0 ? section.row.left : section.row.right;
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
      for (const k of knots) out.knots.push({ x: side * k.x * xEnd, z: base + k.z * hEff, base });
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
}

export function buildGougedPlateGeometry(
  p: EnricoCerutiParams, arch: ArchCurve, g: GougedFlutingParams, cross: GougedCrossParams,
): GougedPlateGeometry | null {
  const paths = gougedChannelPaths(p, g);
  if (!paths) return null;
  const centerPoly = samplePathToPolyline(paths.center, 1);
  return {
    gouge: g,
    centerPoly,
    centerIdx: buildPolylineIndex(centerPoly),
    resolveCross: makeGougedCrossResolver(cross, p.height),
    longArch: solveGougedLongArch(p, arch, g),
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
  return solveGougedCrossSection(
    gougedLongArchHeightAt(geo, y), centerHalf, sweepRadius, geo.gouge.depth, geo.resolveCross(y),
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
