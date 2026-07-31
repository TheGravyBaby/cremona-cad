import { Pt } from '../models/types';
import { buildPolylineIndex, clamp, closestPointToPolylineIndexed } from '../helpers/draftMath';
import { catenaryZAt, cycloidZAt, flutingArc, samplePathToPolyline, splineZAt } from '../helpers/svgPathMath';
import { ArchCurve, EnricoCerutiParams, GougedCrossParams, GougedFlutingParams } from './ceruti-types';
import { defineFlutingPath, defineInsetPath } from './ceruti-paths';
import { archFromLoweredTakeoff, crossArchEdgeSlopeAt } from './ceruti-arching';

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

/** A default crown template: a flat-shouldered rise, in mm from the centerline. */
export function defaultGougedCrossParams(): GougedCrossParams {
  return { type: 'gouged', points: [{ x: 45, z: 9, mirror: true }, { x: 70, z: 4, mirror: true }] };
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
