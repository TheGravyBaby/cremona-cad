import { arcHorizontalIntersections, clamp, makeMonotoneSpline } from "../helpers/draftMath";
import { buildCatenaryPath, buildCycloidPath, buildSplinePath, buildCycloidPathAcross, catenaryZAt, cycloidZAt, splineZAt, cycloidEdgeSlope } from "../helpers/svgPathMath";
import { Arc } from "../models/types";
import { ArchCurve, ArchingParams, CrossArchParams, CrossArchShape, CrossArchSide, CrossArchStation, EnricoCerutiParams, FlutingChannelParams } from "./ceruti-types";
import { defineFlutingArcs, defineInnerArcs, defineOffsetArcs, defineOuterCornerArcs } from "./ceruti-paths";

// ===== Arching & fluting profile system =====
// The long-arch/cross-arch/fluting-channel height profile — a distinct concern
// from the flat 2D outline in ceruti-calcs.ts/ceruti-paths.ts. Everything here
// is about the arch's Z profile: how high it rises, its cross-sectional shape
// at a given body height, and the *AtY half-width queries the renderers sample
// it with.

/** Returns instrument-appropriate arching defaults based on body length (p.height). */
export function defaultArchingParams(bodyHeight: number): ArchingParams {
  const cat = (archHeight: number) => ({ type: 'catenary' as const, archHeight });
  // Each plate carries its own cross-arch and fluting-channel params so the top
  // and back can be shaped independently.
  const plate = (archHeight: number, thickness: number) => ({
    arch: cat(archHeight), thickness, edgeDepth: 0,
    cross: defaultCrossArchParams(), fluting: defaultFlutingChannelParams(),
  });

  if (bodyHeight < 400) {
    // Violin
    return { surfaceMethod: 'proportional', ribHeight: 32,
      top: plate(15, 3.5), bottom: plate(14, 3.5) };
  }
  if (bodyHeight < 500) {
    // Viola
    return { surfaceMethod: 'proportional', ribHeight: 40,
      top: plate(20, 4.0), bottom: plate(18, 4.0) };
  }
  if (bodyHeight < 800) {
    // Cello
    return { surfaceMethod: 'proportional', ribHeight: 120,
      top: plate(27, 6.0), bottom: plate(25, 6.0) };
  }
  // Double bass
  return { surfaceMethod: 'proportional', ribHeight: 185,
    top: plate(55, 9.0), bottom: plate(50, 9.0) };
}

/**
 * The wireframe/contour step sizes below were tuned by eye against a
 * standard violin. Body height, body width, and arch height all vary a
 * lot across the instrument family (see defaultArchingParams) — a cello or
 * bass plugged into the same fixed mm steps would render 2-3x the wires and
 * contours of a violin, which is what actually caused the lag. Scaling each
 * step relative to these reference dimensions keeps rendered density (and
 * cost) roughly constant across the whole size range instead.
 */
const REFERENCE_BODY_HEIGHT = 350; // mm, violin body length
const REFERENCE_BODY_WIDTH = 200;  // mm, violin body width
const REFERENCE_ARCH_HEIGHT = 15;  // mm, violin top-plate default
const REFERENCE_STATION_STEP_MM = 4;
const REFERENCE_SAMPLE_STEP_MM = 1.5;
const REFERENCE_GRID_MM = 1.25;
const REFERENCE_LEVEL_STEP_MM = 1;

/** Wireframe cross-section spacing and per-strip sample spacing, scaled to keep strip/point counts constant. */
export function wireframeSampleSteps(p: EnricoCerutiParams): { stationStepMm: number; sampleStepMm: number } {
  const stationStepMm = clamp(
    REFERENCE_STATION_STEP_MM * (p.height / REFERENCE_BODY_HEIGHT), 2, 15,
  );
  const sampleStepMm = clamp(
    REFERENCE_SAMPLE_STEP_MM * (p.width / REFERENCE_BODY_WIDTH), 0.75, 5,
  );
  return { stationStepMm, sampleStepMm };
}

/** Contour height step and marching-squares grid spacing, scaled to keep level count and grid point count constant. */
export function contourSampleSteps(p: EnricoCerutiParams, archHeight: number): { stepMm: number; gridMm: number } {
  const areaScale = Math.sqrt(
    (p.width * p.height) / (REFERENCE_BODY_WIDTH * REFERENCE_BODY_HEIGHT),
  );
  const stepMm = clamp(
    REFERENCE_LEVEL_STEP_MM * (archHeight / REFERENCE_ARCH_HEIGHT), 0.5, 6,
  );
  const gridMm = clamp(REFERENCE_GRID_MM * areaScale, 0.75, 4);
  return { stepMm, gridMm };
}

function buildArchPath(arch: ArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1): string {
  const h = arch.archHeight;
  switch (arch.type) {
    case 'catenary': return buildCatenaryPath(h, span, yStart, xBase, sign);
    case 'cycloid':  return buildCycloidPath(h, span, yStart, xBase, sign, arch.d);
    case 'spline':   return buildSplinePath(h, span, yStart, xBase, sign, arch.points, arch.peak);
  }
}

/**
 * Restates an arch against a takeoff `edgeDepth` mm below the plate surface.
 * Every height a user enters — the peak and each spline control point alike —
 * is measured from the plate edge, so all of them gain edgeDepth once the
 * builders measure z up from the lowered takeoff instead.
 */
function archFromLoweredTakeoff(arch: ArchCurve, edgeDepth: number): ArchCurve {
  const raised = { ...arch, archHeight: arch.archHeight + edgeDepth };
  return raised.type === 'spline'
    ? { ...raised, points: raised.points.map(p => ({ ...p, z: p.z + edgeDepth })) }
    : raised;
}

/**
 * Brings an arch loaded from an older recipe up to the current shape, in place.
 * Spline control points predating asymmetric arches carry no `mirror` flag and
 * a `t` measured over the half-span (0 = plate edge, 1 = peak); they become
 * mirrored points at half that t over the full span, which is the same curve.
 *
 * **Must run on every recipe that enters the app** — see
 * {@link normalizeArchingParams}, the single caller, which every load path goes
 * through. It cannot be deferred to the render path and it cannot be applied
 * lazily on read: in the current format an absent `mirror` means an unmirrored
 * point, so only a loader — which knows the data just came off disk — can tell a
 * legacy point from a deliberately unmirrored one.
 */
export function normalizeArchCurve(arch: ArchCurve): void {
  if (arch.type !== 'spline') return;
  arch.peak ??= 0.5;
  for (const p of arch.points) {
    if (p.mirror === undefined) {
      p.t = p.t / 2;
      p.mirror = true;
    }
  }
  arch.points.sort((a, b) => a.t - b.t);
}

/**
 * Migrates a freshly loaded recipe's arching in place, if it has any. Call this
 * once per recipe entering the app — a template, a file off disk, or a session
 * restore — and before anything reads `arching`.
 *
 * This exists as its own function so the migration is not tied to a panel being
 * opened: the surface builder, the 3D preview and the STL/template exports all
 * read spline arches directly (see ceruti-surface.ts), so a recipe that reached
 * Export without passing through here would be interpolated from legacy
 * coordinates and quietly cut wrong.
 */
export function normalizeArchingParams(p: EnricoCerutiParams | undefined | null): void {
  if (!p?.arching) return;
  normalizeArchCurve(p.arching.top.arch);
  normalizeArchCurve(p.arching.bottom.arch);
}

export function calculateLongArch(p: EnricoCerutiParams): { span: number; yStart: number; topPath: string; backPath: string } {
  const a = p.arching!;
  const span   = p.height - 2 * (p.innerFlutingDepth ?? 0);
  const yStart =  p.innerFlutingDepth ?? 0;

  // edgeDepth lowers the arch takeoff below the plate surface by that many mm, increasing
  // hEff by the same amount so the peak stays anchored at the user-entered archHeight.
  const topED  = a.top.edgeDepth;
  const botED  = a.bottom.edgeDepth;

  const topPath  = buildArchPath(
    archFromLoweredTakeoff(a.top.arch, topED),
    span, yStart, a.ribHeight + a.top.thickness - topED, 1,
  );
  const backPath = buildArchPath(
    archFromLoweredTakeoff(a.bottom.arch, botED),
    span, yStart, -a.bottom.thickness + botED, -1,
  );
  return { span, yStart, topPath, backPath };
}

/**
 * Long-arch height above the plate-edge reference at body height `y` — the
 * evaluable counterpart of calculateLongArch's paths. Returns 0 outside the
 * arch span. This is the centerline (x = 0) peak constraint for cross arches.
 */
export function longArchHeightAt(p: EnricoCerutiParams, arch: ArchCurve, y: number): number {
  const span   = p.height - 2 * (p.innerFlutingDepth ?? 0);
  const yStart = p.innerFlutingDepth ?? 0;
  const s = y - yStart;
  switch (arch.type) {
    case 'catenary': return catenaryZAt(arch.archHeight, span, s);
    case 'cycloid':  return cycloidZAt(arch.archHeight, span, arch.d, s);
    case 'spline':   return splineZAt(arch.archHeight, span, arch.points, arch.peak ?? 0.5, s);
  }
}

/** Default cross-arch shape: a mid-range curtate factor, full cycloid window. */
export function defaultCrossArchParams(): CrossArchParams {
  return { d: 0.4, pct: .9 };
}

/** A cross-arch shape split into the two halves the section is actually built from. */
export interface CrossArchSides {
  left: CrossArchSide;
  right: CrossArchSide;
}

/** The cross-arch shape at a body-length station. Constant unless stations are set. */
export type CrossArchResolver = (y: number) => CrossArchSides;

/**
 * Splits one shape into its per-side pair: `left`/`right` when the plate is
 * asymmetric (falling back to the shared `d`/`pct` for a side not populated
 * yet — e.g. a station added before the toggle was flipped), otherwise both
 * sides share `d`/`pct`. The trochoid's peak is always exactly zero-slope
 * regardless of d/pct (see {@link cycloidEdgeSlope}'s doc), so left and right
 * halves built from different shapes still meet the center height without a
 * seam — there is no extra blending to do beyond picking which pair applies
 * on which side.
 */
function crossShapeSides(shape: CrossArchShape, asymmetric: boolean): CrossArchSides {
  const shared: CrossArchSide = { d: shape.d, pct: shape.pct };
  if (!asymmetric) return { left: shared, right: shared };
  return { left: shape.left ?? shared, right: shape.right ?? shared };
}

/** The plate's base (station-free) per-side shape — what anchors both body ends. */
export function resolveCrossArchSides(cross: CrossArchParams): CrossArchSides {
  return crossShapeSides(cross, !!cross.asymmetric);
}

/** Stations nearer than this (mm) are the same station — see {@link normalizeCrossArchStations}. */
export const STATION_MERGE_EPS_MM = 0.5;
/** Stations are held this far (mm) inside the body ends so they stay interior knots. */
const STATION_MARGIN_MM = 1;

/**
 * The station list the resolver actually interpolates: clamped inside the body
 * ends, sorted by y, and with stations that landed on top of one another
 * collapsed (earlier wins) so the interpolator always gets strictly increasing
 * knots. Does not mutate the input.
 */
export function normalizeCrossArchStations(
  stations: CrossArchStation[] | undefined, bodyHeight: number,
): CrossArchStation[] {
  if (!stations?.length) return [];
  const hi = Math.max(STATION_MARGIN_MM, bodyHeight - STATION_MARGIN_MM);
  const sorted = stations
    .map(s => ({ ...s, y: clamp(s.y, STATION_MARGIN_MM, hi) }))
    .sort((a, b) => a.y - b.y);
  const out: CrossArchStation[] = [];
  for (const s of sorted) {
    if (out.length && s.y - out[out.length - 1].y <= STATION_MERGE_EPS_MM) continue;
    out.push(s);
  }
  return out;
}

/**
 * Builds the cross-arch shape track along the body once, for repeated querying
 * — the surface height field samples it per grid row, so the interpolators are
 * constructed here rather than per query.
 *
 * With no stations this is a constant function (the plate's base shape), which
 * is exactly the behaviour before stations existed. With stations, each of
 * d/pct ramps from the base at y=0, through every station, and back to the base
 * at y=bodyHeight, via the same shape-preserving monotone spline the long arch
 * uses: it cannot overshoot between knots, so an interpolated d/pct can never
 * swing outside the range the maker actually entered.
 */
export function makeCrossArchResolver(cross: CrossArchParams, bodyHeight: number): CrossArchResolver {
  const asymmetric = !!cross.asymmetric;
  const base = crossShapeSides(cross, asymmetric);
  const stations = normalizeCrossArchStations(cross.stations, bodyHeight);
  if (!stations.length || bodyHeight <= 0) return () => base;

  const ys = [0, ...stations.map(s => s.y), bodyHeight];
  const sides = stations.map(s => crossShapeSides(s, asymmetric));
  const track = (pick: (s: CrossArchSides) => number, baseValue: number) =>
    makeMonotoneSpline(ys, [baseValue, ...sides.map(pick), baseValue]);

  const leftD = track(s => s.left.d, base.left.d);
  const leftPct = track(s => s.left.pct, base.left.pct);
  // Symmetric plates track one shape; reusing the same interpolators keeps the
  // two sides bit-identical rather than merely equal.
  const rightD = asymmetric ? track(s => s.right.d, base.right.d) : leftD;
  const rightPct = asymmetric ? track(s => s.right.pct, base.right.pct) : leftPct;

  return (y: number) => ({
    left: { d: clamp(leftD(y), 0, 1), pct: clamp(leftPct(y), 0.05, 1) },
    right: { d: clamp(rightD(y), 0, 1), pct: clamp(rightPct(y), 0.05, 1) },
  });
}

/**
 * One-shot {@link makeCrossArchResolver} for callers querying a single station
 * (panel readouts, section renders). Hot paths should build the resolver once
 * and reuse it instead.
 */
export function resolveCrossArchSidesAt(cross: CrossArchParams, y: number, bodyHeight: number): CrossArchSides {
  return makeCrossArchResolver(cross, bodyHeight)(y);
}

/** Default fluting channel: the carved gouge-arc, tangent to the cross arch. */
export function defaultFlutingChannelParams(): FlutingChannelParams {
  return { flatPlatform: false };
}

/**
 * The top-plate cross arch at body height `y`: a trochoid spanning the fluting
 * inner-boundary chord, peaking at the long arch's height at that station —
 * built in section coordinates (canvas X = violin X, canvas Y = Z, taking off
 * from the plate's outer edge surface). Returns null where no arch exists.
 *
 * `edgeDepth` lowers the cycloid's edge takeoff below the plate surface by that
 * many mm, increasing hEff by the same amount so the center peak stays anchored
 * at the long arch height. This gives the fluting channel a meaningful slope to
 * meet regardless of the trochoid factor.
 */
export function calculateCrossArchTop(p: EnricoCerutiParams, y: number, side: 'top' | 'bottom' = 'top'): { path: string; halfSpan: number } | null {
  const a = p.arching!;
  const plate = a[side];
  const halfSpan = flutingHalfWidthAtY(p, y);
  if (halfSpan === null || halfSpan <= 0) return null;
  const h = longArchHeightAt(p, plate.arch, y);
  if (h <= 0) return null;
  const cross = plate.cross ?? defaultCrossArchParams();
  const edgeDepth = plate.edgeDepth;
  // Outer-surface Z of the plate: top grows up from the rib, back grows down.
  // sign folds the arch (and its edge-depth takeoff) to the correct side.
  const sign: 1 | -1 = side === 'top' ? 1 : -1;
  const outerZ = side === 'top' ? a.ribHeight + plate.thickness : -plate.thickness;
  const zBase = outerZ - sign * edgeDepth;
  const hEff  = h + edgeDepth;
  const { left, right } = resolveCrossArchSidesAt(cross, y, p.height);
  // Both halves share one trochoid parametrisation when they're the same shape,
  // which samples evenly in the curve's own parameter rather than in x.
  if (left.d === right.d && left.pct === right.pct) {
    return { path: buildCycloidPathAcross(hEff, 2 * halfSpan, -halfSpan, zBase, sign, left.d, 80, left.pct), halfSpan };
  }
  return { path: buildCycloidPathAcrossAsym(hEff, halfSpan, zBase, sign, left, right), halfSpan };
}

/**
 * Asymmetric counterpart of {@link buildCycloidPathAcross}: samples the
 * cross-arch height at even physical-x steps (rather than even parametric
 * steps, since a single trochoid parametrisation no longer spans the whole
 * curve) via {@link cycloidZAt}, using `left`'s shape for x<0 and `right`'s
 * for x≥0. Both halves reach exactly `hEff` at x=0 regardless of how
 * differently their d/pct are set — see {@link resolveCrossArchSides}.
 */
function buildCycloidPathAcrossAsym(
  hEff: number, halfSpan: number, zBase: number, sign: 1 | -1,
  left: CrossArchSide, right: CrossArchSide, N = 80,
): string {
  if (hEff <= 0 || halfSpan <= 0) return '';
  const span = 2 * halfSpan;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -halfSpan + (span * i) / N;
    const shape = x < 0 ? left : right;
    const z = cycloidZAt(hEff, span, shape.d, x + halfSpan, shape.pct);
    pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${zBase + sign * z}`);
  }
  return pts.join(' ');
}

/**
 * The cross arch's own slope at its takeoff (the fluting inner boundary) at
 * body height `y` — what the fluting channel's gouge arc must be tangent to
 * there. Same hEff/span construction as {@link calculateCrossArchTop}; 0
 * where no arch exists at this station (cap stations, or pct = 1's flat
 * takeoff). `atLeft` selects which side's shape applies when the plate's
 * cross arch is asymmetric; ignored (both sides equal) otherwise.
 */
export function crossArchEdgeSlopeAt(p: EnricoCerutiParams, y: number, side: 'top' | 'bottom' = 'top', atLeft = false): number {
  const plate = p.arching![side];
  const halfSpan = flutingHalfWidthAtY(p, y);
  if (halfSpan === null || halfSpan <= 0) return 0;
  const h = longArchHeightAt(p, plate.arch, y);
  if (h <= 0) return 0;
  const cross = plate.cross ?? defaultCrossArchParams();
  const sides = resolveCrossArchSidesAt(cross, y, p.height);
  const shape = atLeft ? sides.left : sides.right;
  const edgeDepth = plate.edgeDepth;
  return cycloidEdgeSlope(h + edgeDepth, 2 * halfSpan, shape.d, shape.pct);
}

/** Outermost |x| where the horizontal station line crosses any of the arcs' drawn spans; null if none. */
function maxAbsXAtY(arcs: Arc[], y: number): number | null {
    let best: number | null = null;
    for (const arc of arcs) {
        if (!arc) continue;
        for (const pt of arcHorizontalIntersections(arc, y)) {
            if (best === null || Math.abs(pt.x) > best) best = Math.abs(pt.x);
        }
    }
    return best;
}

/**
 * Half-width of the inner (mould) outline at body height `y`. The outline is
 * symmetric about x = 0 so the unmirrored arcs suffice. Returns null when the
 * station line misses the outline entirely (beyond the top/bottom caps).
 */
export function innerHalfWidthAtY(p: EnricoCerutiParams, y: number): number | null {
    return maxAbsXAtY(defineInnerArcs(p), y);
}

/**
 * Half-width of the finished plate edge (outer path) at body height `y`.
 * Requires p.outerCorners to be current (calculateOuterArcs) since the corner
 * region's outermost extent lies on the outer corner arcs.
 */
export function outerHalfWidthAtY(p: EnricoCerutiParams, y: number, offset?: number): number | null {
    offset ??= p.overhang + p.rib;
    const arcs = [...defineOffsetArcs(p, offset), ...defineOuterCornerArcs(p, offset)];
    return maxAbsXAtY(arcs, y);
}

/**
 * Half-width of the fluting platform's inner boundary at body height `y` —
 * the outer path inset by innerFlutingDepth. This is where the cross arches
 * take off. Falls back to the plate edge when fluting isn't configured.
 */
export function flutingHalfWidthAtY(p: EnricoCerutiParams, y: number): number | null {
    if (p.innerFlutingDepth === null) return outerHalfWidthAtY(p, y);
    const offset = p.overhang + p.rib - p.innerFlutingDepth;
    return maxAbsXAtY(defineFlutingArcs(p, offset), y);
}

/**
 * Half-width of the fluting platform's outer boundary (the outer path inset by
 * outerFlutingDepth, per defineInsetPath) at body height `y`. Chords the bout
 * offset arcs only — near the corner cutoffs this reads slightly inboard of
 * the true boundary, which only shifts the trace/fluting colour transition
 * there, never the platform's connection to the cross arch.
 */
export function flutingOuterHalfWidthAtY(p: EnricoCerutiParams, y: number): number | null {
    const offset = p.overhang + p.rib - (p.outerFlutingDepth ?? 0);
    return maxAbsXAtY(defineOffsetArcs(p, offset), y);
}
