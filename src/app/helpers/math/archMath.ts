import { clamp, smoothstep, TURN } from './simpleGeometry';
import { makeC2SplineWithFlatKnot, makeMonotoneSpline } from './vibeMath';

// arching math for any carved plate: the channel a gouge cuts as a circular segment, the arch
// curves (catenary, trochoid, spline through knots), an arch landing tangent on the channel's
// flank, and the crown profile between two landings. Heights are relative to the plate's surface,
// negative into the wood. Channel section, then the curves, then the landing, then the crown

// half the channel's width, the chord where its circular section comes back up to the plate's
// surface. Zero when nothing cuts it: a channel no wider than twice its depth is past a semicircle,
// undercut
export function calcChannelHalfWidth(width: number, depth: number): number {
  if (!(width > 0 && depth > 0) || width <= 2 * depth) return 0;
  return width / 2;
}

// the sweep radius of the gouge that cuts a channel this wide and deep: the circle through the
// chord's two ends and the trough
export function calcChannelSweep(width: number, depth: number): number {
  return (width * width / 4 + depth * depth) / (2 * depth);
}

// the channel's section across its run: the height relative to the plate's surface at s mm from
// the centreline, -depth at the trough, 0 at the cut's edges and flat beyond. A true arc, not a
// curve fitted to it; the arching lands on it
export function channelProfileZAt(s: number, width: number, depth: number): number {
  let w = calcChannelHalfWidth(width, depth);
  if (w <= 0 || Math.abs(s) >= w) return 0;
  let R = calcChannelSweep(width, depth);
  return -depth + R - Math.sqrt(Math.max(R * R - s * s, 0));
}

// its slope, dz/ds: positive climbing away from the trough either way, so the inner flank reads
// straight
export function channelProfileSlopeAt(s: number, width: number, depth: number): number {
  let w = calcChannelHalfWidth(width, depth);
  if (w <= 0 || Math.abs(s) >= w) return 0;
  let R = calcChannelSweep(width, depth);
  let denom = Math.sqrt(Math.max(R * R - s * s, 0));
  return denom <= 0 ? 0 : s / denom;
}

// the catenary's shape parameter a for a sag H over a span L, from a (cosh(L / 2a) - 1) = H by
// bisection. Station sweeps re-solve the same arch hundreds of times a redraw and the bisection is
// 64 cosh evaluations, so a single-entry memo pays for itself
let lastCatenary: { H: number; L: number; a: number } | null = null;
export function solveCatenaryA(H: number, L: number): number {
  if (lastCatenary && lastCatenary.H === H && lastCatenary.L === L) return lastCatenary.a;
  let lo = L * 1e-4;
  let hi = L * 1e4;
  for (let i = 0; i < 64; i++) {
    let mid = (lo + hi) / 2;
    if (mid * (Math.cosh(L / (2 * mid)) - 1) - H > 0) lo = mid; else hi = mid;
  }
  let a = (lo + hi) / 2;
  lastCatenary = { H, L, a };
  return a;
}

// arch height at s along a catenary arch of height hEff over span
export function catenaryZAt(hEff: number, span: number, s: number): number {
  if (hEff <= 0 || span <= 0 || s <= 0 || s >= span) return 0;
  let a = solveCatenaryA(hEff, span);
  return hEff + a - a * Math.cosh((s - span / 2) / a);
}

// a point of the windowed trochoid arch, x and z both normalised to [0, 1], at frac of the way
// through the window. pct in (0, 1] takes the central share of the full cusp-to-cusp arch
// (t in [0, 2π]) and stretches it over the span: 1 is the whole arch, leaving the baseline tangent,
// less clips the flat cusps for a takeoff slope a channel can meet at more than a graze. frac is
// linear in the generating parameter, not in x, so uniform steps cluster where the curve bends
// hardest, which is what a sampler wants
export function trochoidNorm(frac: number, d: number, pct: number): { x: number; z: number } {
  let t0 = (1 - pct) * TURN.half;
  let t1 = TURN.full - t0;
  let t = t0 + frac * (t1 - t0);
  let xRaw = (tt: number) => tt - d * Math.sin(tt);
  let x0 = xRaw(t0);
  let denom = xRaw(t1) - x0;
  let c0 = Math.cos(t0);
  return {
    x: denom !== 0 ? (xRaw(t) - x0) / denom : frac,
    z: (c0 - Math.cos(t)) / (c0 + 1),
  };
}

// arch height at s along a trochoid arch. Inverts the monotone windowed x-map (Kepler's equation)
// by bisection, which holds at the d = 1 cusps where Newton stalls; 24 halvings bound t to
// sub-micron in z, and this runs once per surface sample, so the count is a real cost
export function cycloidZAt(hEff: number, span: number, d: number, s: number, pct = 1): number {
  if (hEff <= 0 || span <= 0 || s <= 0 || s >= span) return 0;
  let t0 = (1 - pct) * TURN.half;
  let t1 = TURN.full - t0;
  let xRaw = (tt: number) => tt - d * Math.sin(tt);
  let x0 = xRaw(t0);
  let m = x0 + (s / span) * (xRaw(t1) - x0);
  let lo = t0;
  let hi = t1;
  for (let i = 0; i < 24; i++) {
    let t = (lo + hi) / 2;
    if (xRaw(t) < m) lo = t; else hi = t;
  }
  let t = (lo + hi) / 2;
  let c0 = Math.cos(t0);
  return ((c0 - Math.cos(t)) / (c0 + 1)) * hEff;
}

// a spline arch's control point in normalised full-span coordinates
export interface ArchSplineControlPoint {
  t: number;
  z: number;
  mirror?: boolean;
}

// ArchSplineKnot.source for the peak, which every spline has exactly one of
export const SPLINE_PEAK_SOURCE = -1;

// one knot the spline passes through, tagged with the control point it came from: its index in
// the points, or SPLINE_PEAK_SOURCE. A mirrored twin carries its origin's index, so both knots of
// one point share a source and a panel can highlight the pair together
export interface ArchSplineKnot {
  t: number;
  z: number;
  source: number;
}

// two knots closer than this collapse to the first; points and the peak are held off the ends
const SPLINE_KNOT_EPS = 1e-3;
const SPLINE_POINT_MARGIN = 0.005;
const SPLINE_PEAK_MARGIN = 0.02;

// the interior knots a spline arch interpolates, in normalised full-span position: the peak at
// hEff, every control point and, for a mirrored one, its reflection about the mid-span. Sorted by
// t with coincident knots collapsed, the peak outranking a point it lands on and earlier points
// outranking later. The two ends, (0, 0) and (1, 0), are not included. Shared by the path builder,
// the height evaluator and the panels' guides so all agree where the knots ended up
export function archSplineKnots(hEff: number, points: ArchSplineControlPoint[], peak = 0.5): ArchSplineKnot[] {
  let hold = (t: number, margin: number) => Math.min(Math.max(t, margin), 1 - margin);
  let raw = [{ t: hold(peak, SPLINE_PEAK_MARGIN), z: hEff, rank: 0, source: SPLINE_PEAK_SOURCE }];
  points.forEach((p, i) => {
    let t = hold(p.t, SPLINE_POINT_MARGIN);
    raw.push({ t, z: p.z, rank: 1, source: i });
    if (p.mirror) raw.push({ t: 1 - t, z: p.z, rank: 1, source: i });
  });
  raw.sort((a, b) => a.t - b.t || a.rank - b.rank);
  let knots: ArchSplineKnot[] = [];
  for (let k of raw) {
    if (knots.length && k.t - knots[knots.length - 1].t <= SPLINE_KNOT_EPS) continue;
    knots.push({ t: k.t, z: k.z, source: k.source });
  }
  return knots;
}

// z(s) over [0, span] for a spline arch, endZ the far end's height when it lands off the baseline
export function makeArchSplineZOf(hEff: number, span: number, points: ArchSplineControlPoint[], peak: number, endZ = 0): (s: number) => number {
  let knots = archSplineKnots(hEff, points, peak);
  let ys = [0, ...knots.map(k => k.t * span), span];
  let zs = [0, ...knots.map(k => k.z), endZ];
  return makeMonotoneSpline(ys, zs);
}

// arch height at s along a spline arch
export function splineZAt(hEff: number, span: number, points: ArchSplineControlPoint[], peak: number, s: number, endZ = 0): number {
  if (hEff <= 0 || span <= 0 || s <= 0) return 0;
  if (s >= span) return endZ;
  return makeArchSplineZOf(hEff, span, points, peak, endZ)(s);
}

// where an arch lands on the channel: how far from the channel's centreline (0 the trough,
// negative on the outer flank), how deep it is there, the channel's slope there, and whether the
// meeting is a true tangency or the closest the arch could come
export interface ArchTakeoff {
  contactS: number;
  takeoffDepth: number;
  slope: number;
  tangent: boolean;
}

// the slope the arch arrives with if it is made to land at contactS, takeoffDepth deep there.
// Picking the contact fixes everything else about the arch (its depth from the channel, its span
// from the contacts, its height as typed), so the caller builds that arch and reads its end slope.
// The long arch and the cross arch build their curves differently, which is why it is supplied
export type ArchArrivalSlopeAt = (takeoffDepth: number, contactS: number) => number;

// how far from tangent a landing at s would be: the arch's arrival slope minus the channel's own.
// Zero is a tangent meeting
function calcSlopeMismatchAt(width: number, depth: number, arrivalSlopeAt: ArchArrivalSlopeAt, s: number): number {
  return arrivalSlopeAt(-channelProfileZAt(s, width, depth), s) - channelProfileSlopeAt(s, width, depth);
}

function buildTakeoffAt(width: number, depth: number, contactS: number, tangent: boolean): ArchTakeoff {
  return { contactS, takeoffDepth: -channelProfileZAt(contactS, width, depth), slope: channelProfileSlopeAt(contactS, width, depth), tangent };
}

// walks one flank from the trough outward in coarse steps until the mismatch changes sign, and
// hands back the two steps it changed between as [s0, mismatch0, s1]; null when it never does.
// Along the way `nearest` remembers the step that came closest to tangent
function scanFlankForSlopeCrossing(
  width: number, depth: number, arrivalSlopeAt: ArchArrivalSlopeAt, lo: number, hi: number, dir: 1 | -1, steps: number,
  nearest: { s: number; mag: number },
): [number, number, number] | null {
  let aS = dir * lo, aR = calcSlopeMismatchAt(width, depth, arrivalSlopeAt, aS);
  if (Math.abs(aR) < nearest.mag) { nearest.s = aS; nearest.mag = Math.abs(aR); }
  for (let i = 1; i <= steps; i++) {
    let s = dir * (lo + ((hi - lo) * i) / steps);
    let r = calcSlopeMismatchAt(width, depth, arrivalSlopeAt, s);
    if (Math.abs(r) < nearest.mag) { nearest.s = s; nearest.mag = Math.abs(r); }
    if (aR === 0) return [aS, aR, aS];
    if (aR * r < 0) return aS < s ? [aS, aR, s] : [s, r, aS];
    aS = s; aR = r;
  }
  return null;
}

// Where an arch lands on the channel: the one point on the flank where the arch, made to end
// there, arrives at the flank's own slope. Nobody chooses where the blend begins at the bench
// either; the tool and the wood decide.
//
// The arch never lowers to meet the channel: its height stays as typed and the contact slides
// along the flank, which shortens the span. So the search is one-dimensional, along the flank.
// It scans the inner flank first in coarse steps for the mismatch between the two slopes to
// change sign, then the outer flank (past the trough, where an arch arriving sloping down lands),
// then bisects inside the step it found to pin the contact. The inner flank goes first so an arch
// that met it lands where it did. With no crossing anywhere the closest approach comes back
// flagged, never nothing: near the caps the two slopes go to zero together and whether they cross
// comes down to the last digits, and a station pinned at the flank's top beside neighbours at the
// trough rang a seam round the cap
export function solveArchTakeoff(width: number, depth: number, arrivalSlopeAt: ArchArrivalSlopeAt, scanSteps = 32): ArchTakeoff | null {
  let w = calcChannelHalfWidth(width, depth);
  if (w <= 0) return null;
  // held just inside both ends: at 0 the channel is exactly flat, at w it has left the cut
  let lo = w * 1e-3, hi = w * (1 - 1e-3);
  let nearest = { s: lo, mag: Infinity };
  let crossing = scanFlankForSlopeCrossing(width, depth, arrivalSlopeAt, lo, hi, 1, scanSteps, nearest)
    ?? scanFlankForSlopeCrossing(width, depth, arrivalSlopeAt, lo, hi, -1, scanSteps, nearest);
  if (!crossing) return buildTakeoffAt(width, depth, nearest.s, false);

  let [x0, r0, x1] = crossing;
  for (let i = 0; i < 60 && x1 - x0 > 1e-9; i++) {
    let mid = (x0 + x1) / 2;
    let rMid = calcSlopeMismatchAt(width, depth, arrivalSlopeAt, mid);
    if (r0 * rMid <= 0) x1 = mid; else { x0 = mid; r0 = rMid; }
  }
  return buildTakeoffAt(width, depth, (x0 + x1) / 2, true);
}

// a one-sided catenary from the crown out to xEnd, where it meets the channel at zEnd. Evaluated
// afresh at each xEnd the tangency search tries, since a catenary's shape depends on its
// height-to-span ratio; each side stands alone
export function catenarySideZAt(archH: number, zEnd: number, xEnd: number, x: number): number {
  if (xEnd <= 0) return archH;
  let rise = archH - zEnd;
  return rise >= 0 ? zEnd + catenaryZAt(rise, 2 * xEnd, xEnd - Math.abs(x)) : zEnd - catenaryZAt(-rise, 2 * xEnd, xEnd - Math.abs(x));
}

// one authored knot of a crown, as fractions: x of the way out from the joint, z of the arch height
export interface CrownKnot {
  x: number;
  z: number;
}

// where one side of a crown ends: how far out, and how high there
export interface CrownEnd {
  xEnd: number;
  zEnd: number;
}

// what a crown's knots are measured against: the wood before the cross arch is carved, so the
// frame never moves when a knot does. Across, from the joint to innerEdge; every takeoff lands
// outboard of it. Up, from plate level as a fraction of the crown's height; where the crown hasn't
// climbed clear the datum eases down onto each side's end, `lift` 1 at plate level. A generated
// curve whose end is the takeoff sets fromTakeoff, and both axes then run to it. trough is the
// lowest the channel goes
export interface CrownFrame {
  innerEdge: number;
  lift: number;
  fromTakeoff: boolean;
  trough: number;
}

export function calcCrownKnotHeight(archH: number, frame: CrownFrame, end: CrownEnd, z: number): number {
  let datum = frame.fromTakeoff ? end.zEnd : (1 - frame.lift) * end.zEnd;
  return datum + z * (archH - datum);
}

// one side's knots placed in mm, signed by side, those landing on or past either end dropped
function placeCrownKnots(archH: number, frame: CrownFrame, knots: CrownKnot[], end: CrownEnd, side: 1 | -1, endL: CrownEnd, endR: CrownEnd): { x: number; z: number }[] {
  return knots
    .map(k => ({ x: side * k.x * (frame.fromTakeoff ? end.xEnd : frame.innerEdge), z: calcCrownKnotHeight(archH, frame, end, k.z) }))
    .filter(k => k.x > -endL.xEnd + 1e-6 && k.x < endR.xEnd - 1e-6);
}

// a knot landing on the crown is held this far clear rather than dropped: a dropped point is a
// step in the arrival slope
const CROWN_GAP = 1e-4;

// the whole transverse profile as one spline: left end, left knots, the crown, right knots, right
// end. Built across the full width so the crown is an interior knot between secants of opposite
// sign, which the monotone filter zeroes into a smooth maximum; as an endpoint of a one-sided
// spline it would carry a slope and peak in a ridge. The run into each end is this spline's
// outermost segment, curvature-continuous with the rest for free
export function buildCrownProfile(archH: number, xPeak: number, frame: CrownFrame, left: CrownKnot[], right: CrownKnot[], endL: CrownEnd, endR: CrownEnd): (x: number) => number {
  let inner = [...placeCrownKnots(archH, frame, left, endL, -1, endL, endR), ...placeCrownKnots(archH, frame, right, endR, 1, endL, endR)].sort((a, b) => a.x - b.x);

  let xs: number[] = [-endL.xEnd], zs: number[] = [endL.zEnd];
  for (let k of inner) if (k.x < xPeak) { xs.push(Math.min(k.x, xPeak - CROWN_GAP)); zs.push(k.z); }
  let crown = xs.length;
  xs.push(xPeak); zs.push(archH);
  for (let k of inner) if (k.x >= xPeak) { xs.push(Math.max(k.x, xPeak + CROWN_GAP)); zs.push(k.z); }
  xs.push(endR.xEnd); zs.push(endR.zEnd);

  // a centred crown is already curvature-continuous, its two flanks mirroring each other
  if (Math.abs(xPeak) < 1e-9) return makeMonotoneSpline(xs, zs);
  let smooth = makeC2SplineWithFlatKnot(xs, zs, crown);
  if (smooth && !isOutsideSpec(smooth, xs, zs, frame.trough)) return smooth;
  return makeMonotoneSpline(xs, zs);
}

// whether a smooth profile carves outside what was asked: above the highest height or below the
// channel's trough (a knot set below it lowers the floor). Sampled about every millimetre, since
// a sag through the trough fits between quarter points of a long run into the channel
function isOutsideSpec(f: (x: number) => number, xs: number[], zs: number[], trough: number): boolean {
  let ceiling = Math.max(...zs) + 1e-4;
  let floor = Math.min(...zs, trough) - 1e-4;
  for (let i = 0; i < xs.length - 1; i++) {
    let n = Math.max(4, Math.ceil(xs[i + 1] - xs[i]));
    for (let j = 1; j < n; j++) {
      let v = f(xs[i] + (j / n) * (xs[i + 1] - xs[i]));
      if (v > ceiling || v < floor) return true;
    }
  }
  return false;
}

// how far up the outer flank a landing must sit, in half widths, before the corner stretch eases out
const CORNER_EASE_BAND = 0.25;

// the corner smoothing as a height field: the wedge of flat wood a bypassing channel leaves at a
// corner, taken down by hand. The channel's outer flank stretched from `from` (the arch's contact
// when it lands past the trough, else the trough) out to the flat's edge, edgeDist away. Along the
// flanks the stretch is 1 and this is the channel itself. From a landing up the flank the stretch
// eases out, leaving at the flank's grade and flattening toward the edge, so the arch's climb runs
// out flat across the wedge instead of creasing. Never above the flank, so composing by minimum
// only removes wood
export function cornerSmoothZAt(s: number, edgeDist: number, width: number, depth: number, from = 0): number {
  let w = calcChannelHalfWidth(width, depth);
  if (w <= 0 || s >= from || edgeDist <= 0) return 0;
  let left = w + from;
  let run = Math.max(edgeDist - s + from, left);
  let u = (from - s) / run;
  let stretch = run / left;
  let ease = 1 + (stretch - 1) * smoothstep(-from, 0, CORNER_EASE_BAND * w);
  return channelProfileZAt(from - left * (1 - Math.pow(1 - u, ease)), width, depth);
}

// how much of a station its chord describes, from the distance from the joint to the nearest
// channel over the station's half chord. Through the body that is 1; approaching a cap the channel
// wraps across and the nearest one is ahead, not beside. A surface reads position by distance
// exactly where the chord stops describing the plate, and distance can't tell the two sides of the
// joint apart, so the crown's offset has to be gone wherever distance is leaned on: one curve for
// both, the offset only beginning once the blend has finished
const CHORD_TRUST_LO = 0.15;
const CHORD_TRUST_FULL = 0.5;
const CROWN_OFFSET_BAND = 0.2;

export function calcChordTrust(chordFrac: number): number {
  return smoothstep(chordFrac, CHORD_TRUST_LO, CHORD_TRUST_FULL);
}

export function calcCrownOffsetTrust(chordFrac: number): number {
  return smoothstep(chordFrac, CHORD_TRUST_FULL, CHORD_TRUST_FULL + CROWN_OFFSET_BAND);
}
