import { arcHorizontalIntersections, clamp, makeMonotoneSpline } from "../helpers/draftMath";
import {
  buildCatenaryPath, buildCycloidPath, buildSplinePath, buildCycloidPathAcross, catenaryZAt, cycloidZAt, splineZAt, cycloidEdgeSlope,
  crossArchSplineProfileGrid, crossArchSplineEdgeSlopeFrac, crossArchSplineZAt, crossArchSplineEdgeSlope, buildCrossArchSplinePathAcross,
  archSplineKnots,
} from "../helpers/svgPathMath";
import { Arc, Pt } from "../models/types";
import {
  ArchCurve, ArchingParams, CrossArchCycloidParams, CrossArchCycloidShape, CrossArchParams, CrossArchShape, CrossArchSide,
  CrossArchSplineParams, CrossArchSplineShape, CrossArchStation, EnricoCerutiParams, FlutingChannelParams,
} from "./ceruti-types";
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
 * The wireframe/contour step sizes below were tuned by eye against a standard
 * violin. Body dimensions vary a lot across the instrument family, so a cello
 * on fixed mm steps would render 2-3x the wires and contours of a violin.
 * Scaling each step against these reference dimensions keeps rendered density
 * roughly constant across the size range.
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
export function archFromLoweredTakeoff(arch: ArchCurve, edgeDepth: number): ArchCurve {
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
 * **Must run on every recipe that enters the app**, via its single caller
 * {@link normalizeArchingParams}. It cannot be applied lazily on read: an
 * absent `mirror` means an unmirrored point in the current format, so only a
 * loader can tell a legacy point from a deliberately unmirrored one.
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
  clampSplinePointHeights(arch.points, arch.archHeight);
}

/**
 * Holds a spline's control points at or below its peak — the one knot that pins
 * the arch's real height. For a long arch that ceiling is the entered Arch
 * Height; for a cross arch the peak is always the full local hEff, so `peakZ`
 * is 1 in that shape's own fractional units.
 *
 * Without this a control point can quietly become the true high spot, and then
 * the height label, the surface model and the exports all disagree with the
 * number the maker typed. Lowering the peak therefore drags any point above it
 * down with it; raising the peak again leaves them where they landed, since
 * nothing records which of them the maker wanted brought back up.
 */
export function clampSplinePointHeights(points: { z: number }[], peakZ: number): void {
  for (const p of points) p.z = clamp(p.z, 0, peakZ);
}

/**
 * Migrates a freshly loaded recipe's arching in place, if it has any. Call this
 * once per recipe entering the app — a template, a file off disk, or a session
 * restore — and before anything reads `arching`.
 *
 * Separate from any panel so the migration isn't tied to one being opened: the
 * surface builder, 3D preview and STL/template exports all read spline arches
 * directly, and a recipe reaching Export without passing through here would be
 * interpolated from legacy coordinates and quietly cut wrong.
 */
export function normalizeArchingParams(p: EnricoCerutiParams | undefined | null): void {
  if (!p?.arching) return;
  normalizeArchCurve(p.arching.top.arch);
  normalizeArchCurve(p.arching.bottom.arch);
  normalizeCrossArchParams(p.arching.top.cross);
  normalizeCrossArchParams(p.arching.bottom.cross);
}

/**
 * Brings a cross-arch block loaded from an older recipe up to the current
 * shape, in place. Cross-arch was cycloid-only before spline support existed,
 * so an absent `type` — on the base shape or any station — is unambiguously
 * legacy cycloid, unlike the long arch's `mirror` migration (no similar
 * ambiguity to resolve here). Called from {@link normalizeArchingParams}, the
 * same single trust boundary `normalizeArchCurve` relies on.
 */
export function normalizeCrossArchParams(cross: CrossArchParams | undefined): void {
  if (!cross) return;
  (cross as { type?: 'cycloid' | 'spline' }).type ??= 'cycloid';
  for (const s of cross.stations ?? []) (s as { type?: 'cycloid' | 'spline' }).type ??= 'cycloid';
  // A cross-arch peak is always the full local hEff, so 1 is the ceiling here.
  for (const shape of [cross, ...(cross.stations ?? [])]) {
    if (shape.type === 'spline') clampSplinePointHeights(shape.points, 1);
  }
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
export function defaultCrossArchParams(): CrossArchCycloidParams {
  return { type: 'cycloid', d: 0.4, pct: .9 };
}

/** Default spline cross-arch shape: a gentle single-point rise to the center peak. */
export function defaultCrossArchSplineParams(): CrossArchSplineParams {
  return { type: 'spline', peak: 0.5, points: [{ t: 0.2, z: 0.85, mirror: true }] };
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
 * asymmetric, falling back to the shared `d`/`pct` for a side not populated yet
 * (a station added before the toggle was flipped). The trochoid's peak is
 * always zero-slope regardless of d/pct, so halves built from different shapes
 * still meet at the center without a seam — no blending needed beyond picking
 * which pair applies where.
 */
function crossShapeSides(shape: CrossArchCycloidShape, asymmetric: boolean): CrossArchSides {
  const shared: CrossArchSide = { d: shape.d, pct: shape.pct };
  if (!asymmetric) return { left: shared, right: shared };
  return { left: shape.left ?? shared, right: shape.right ?? shared };
}

/** The plate's base (station-free) per-side shape — what anchors both body ends. */
export function resolveCrossArchSides(cross: CrossArchCycloidParams): CrossArchSides {
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
export function normalizeCrossArchStations<T extends { y: number }>(
  stations: T[] | undefined, bodyHeight: number,
): T[] {
  if (!stations?.length) return [];
  const hi = Math.max(STATION_MARGIN_MM, bodyHeight - STATION_MARGIN_MM);
  const sorted = stations
    .map(s => ({ ...s, y: clamp(s.y, STATION_MARGIN_MM, hi) }))
    .sort((a, b) => a.y - b.y);
  const out: T[] = [];
  for (const s of sorted) {
    if (out.length && s.y - out[out.length - 1].y <= STATION_MERGE_EPS_MM) continue;
    out.push(s);
  }
  return out;
}

/**
 * Builds the cross-arch shape track along the body once, for repeated querying —
 * the surface height field samples it per grid row.
 *
 * With no stations this is a constant function (the plate's base shape). With
 * stations, d/pct each ramp from the base at y=0, through every station, and
 * back to the base at y=bodyHeight, via the same shape-preserving monotone
 * spline the long arch uses — it cannot overshoot between knots, so an
 * interpolated d/pct never swings outside the range the maker entered.
 */
export function makeCrossArchResolver(cross: CrossArchCycloidParams, bodyHeight: number): CrossArchResolver {
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
export function resolveCrossArchSidesAt(cross: CrossArchCycloidParams, y: number, bodyHeight: number): CrossArchSides {
  return makeCrossArchResolver(cross, bodyHeight)(y);
}

/** A spline cross-arch shape's height profile, already interpolated to one body-length station. */
export interface CrossArchSplineRow {
  /** Height fraction of hEff at each of CROSS_ARCH_SPLINE_GRID_N evenly-spaced transverse positions. */
  zFracGrid: number[];
  leftEdgeSlopeFrac: number;
  rightEdgeSlopeFrac: number;
}

/** The spline cross-arch shape at a body-length station. Constant unless stations are set. */
export type CrossArchSplineResolver = (y: number) => CrossArchSplineRow;

/** Samples one spline shape into the profile + edge slopes a station track ramps between. */
function splineShapeProfile(shape: CrossArchSplineShape): { grid: number[]; leftSlope: number; rightSlope: number } {
  const peak = shape.peak ?? 0.5;
  return {
    grid: crossArchSplineProfileGrid(shape.points, peak),
    leftSlope: crossArchSplineEdgeSlopeFrac(shape.points, peak, true),
    rightSlope: crossArchSplineEdgeSlopeFrac(shape.points, peak, false),
  };
}

/**
 * Builds the spline cross-arch shape track along the body once, for repeated
 * querying — the spline counterpart of {@link makeCrossArchResolver}.
 *
 * Rather than ramping the control points directly (there's no correspondence
 * between one station's Nth point and another's — they can differ in count
 * and position entirely), every defined shape (base + each station) is first
 * sampled into a dense, fixed-size height profile ({@link crossArchSplineProfileGrid}).
 * Each of those grid columns is then ramped across the body length with its
 * own shape-preserving monotone spline, exactly like `d`/`pct` are ramped
 * today — just ~160 ramps instead of 4. A moving peak position falls out for
 * free, since its effect on the profile is already baked in before any
 * y-interpolation happens.
 */
export function makeCrossArchSplineResolver(cross: CrossArchSplineParams, bodyHeight: number): CrossArchSplineResolver {
  const base = splineShapeProfile(cross);
  const stations = normalizeCrossArchStations(cross.stations, bodyHeight);
  if (!stations.length || bodyHeight <= 0) {
    return () => ({ zFracGrid: base.grid, leftEdgeSlopeFrac: base.leftSlope, rightEdgeSlopeFrac: base.rightSlope });
  }

  const ys = [0, ...stations.map(s => s.y), bodyHeight];
  const profiles = stations.map(splineShapeProfile);
  const columnTracks = base.grid.map((baseZ, col) =>
    makeMonotoneSpline(ys, [baseZ, ...profiles.map(p => p.grid[col]), baseZ]));
  const leftSlopeTrack = makeMonotoneSpline(ys, [base.leftSlope, ...profiles.map(p => p.leftSlope), base.leftSlope]);
  const rightSlopeTrack = makeMonotoneSpline(ys, [base.rightSlope, ...profiles.map(p => p.rightSlope), base.rightSlope]);

  return (y: number) => ({
    zFracGrid: columnTracks.map(track => track(y)),
    leftEdgeSlopeFrac: leftSlopeTrack(y),
    rightEdgeSlopeFrac: rightSlopeTrack(y),
  });
}

/**
 * One-shot {@link makeCrossArchSplineResolver} for callers querying a single
 * station. Hot paths should build the resolver once and reuse it instead.
 */
export function resolveCrossArchSplineRowAt(cross: CrossArchSplineParams, y: number, bodyHeight: number): CrossArchSplineRow {
  return makeCrossArchSplineResolver(cross, bodyHeight)(y);
}

/**
 * The cross-arch shape at a body-length station, however it's built — the
 * dispatcher seam where `cross.type` is resolved once (used by
 * {@link PlateSurfaceModel.crossAt}). Cheap to call at query time despite the
 * name: it just closes over whichever resolver already got built.
 */
export type CrossArchQuery =
  | { type: 'cycloid'; sides: CrossArchSides }
  | { type: 'spline'; row: CrossArchSplineRow };
export type CrossArchAtY = (y: number) => CrossArchQuery;

export function makeCrossArchAtY(cross: CrossArchParams, bodyHeight: number): CrossArchAtY {
  if (cross.type === 'spline') {
    const resolve = makeCrossArchSplineResolver(cross, bodyHeight);
    return y => ({ type: 'spline', row: resolve(y) });
  }
  const resolve = makeCrossArchResolver(cross, bodyHeight);
  return y => ({ type: 'cycloid', sides: resolve(y) });
}

/** Default fluting channel: the carved gouge-arc, tangent to the cross arch. */
export function defaultFlutingChannelParams(): FlutingChannelParams {
  return { flatPlatform: false };
}

/**
 * The per-station geometry every cross-arch builder/guide below needs before
 * it can even look at the shape itself: the fluting half-span, the effective
 * peak height (long-arch height at `y` plus the edge-depth takeoff), and where
 * that takeoff sits in section coordinates (canvas X = violin X, canvas Y = Z).
 * Null where no arch exists at this station (cap stations, or a missing/zero
 * fluting chord).
 */
function crossArchStationGeometry(
  p: EnricoCerutiParams, y: number, side: 'top' | 'bottom',
): { halfSpan: number; hEff: number; zBase: number; sign: 1 | -1; cross: CrossArchParams } | null {
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
  const hEff = h + edgeDepth;
  return { halfSpan, hEff, zBase, sign, cross };
}

/**
 * The top-plate cross arch at body height `y`: a trochoid spanning the fluting
 * inner-boundary chord, peaking at the long arch's height at that station.
 * Returns null where no arch exists.
 *
 * `edgeDepth` lowers the cycloid's edge takeoff below the plate surface by that
 * many mm, increasing hEff by the same amount so the center peak stays anchored
 * at the long arch height. This gives the fluting channel a meaningful slope to
 * meet regardless of the trochoid factor.
 */
export function calculateCrossArchTop(p: EnricoCerutiParams, y: number, side: 'top' | 'bottom' = 'top'): { path: string; halfSpan: number } | null {
  const geo = crossArchStationGeometry(p, y, side);
  if (!geo) return null;
  const { halfSpan, hEff, zBase, sign, cross } = geo;
  if (cross.type === 'spline') {
    const { zFracGrid } = resolveCrossArchSplineRowAt(cross, y, p.height);
    return { path: buildCrossArchSplinePathAcross(hEff, halfSpan, zBase, sign, zFracGrid, 80), halfSpan };
  }
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
 * cross-arch height at even physical-x steps rather than even parametric ones,
 * since a single trochoid parametrisation no longer spans the whole curve.
 * Uses `left`'s shape for x<0 and `right`'s for x≥0; both halves reach exactly
 * `hEff` at x=0 however differently their d/pct are set.
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
  const geo = crossArchStationGeometry(p, y, side);
  if (!geo) return 0;
  const { halfSpan, hEff, cross } = geo;
  if (cross.type === 'spline') {
    const row = resolveCrossArchSplineRowAt(cross, y, p.height);
    return crossArchSplineEdgeSlope(atLeft ? row.leftEdgeSlopeFrac : row.rightEdgeSlopeFrac, hEff, halfSpan);
  }
  const sides = resolveCrossArchSidesAt(cross, y, p.height);
  const shape = atLeft ? sides.left : sides.right;
  return cycloidEdgeSlope(hEff, 2 * halfSpan, shape.d, shape.pct);
}

/**
 * Generating-circle guide for a cycloid cross-arch at station `y` — the two
 * circles (one per side, concentric and equal-radius when symmetric) whose
 * rolling traces the takeoff-to-peak rise, plus the peak point itself. The
 * same geometry the long-arch panel's own cycloid guide draws (a circle of
 * radius hEff/(2·d) centered at half the peak height), just built per side
 * since a cross arch can be asymmetric. Null where no arch exists at this
 * station, or the plate's cross arch isn't a cycloid. A side's radius is null
 * when its factor is too small (d ≤ 0.01) for a meaningful circle.
 */
export interface CrossArchCycloidGuide {
  center: Pt;
  peak: Pt;
  leftR: number | null;
  rightR: number | null;
}

export function calculateCrossArchCycloidGuide(p: EnricoCerutiParams, y: number, side: 'top' | 'bottom' = 'top'): CrossArchCycloidGuide | null {
  const geo = crossArchStationGeometry(p, y, side);
  if (!geo) return null;
  const { hEff, zBase, sign, cross } = geo;
  if (cross.type !== 'cycloid') return null;
  const { left, right } = resolveCrossArchSidesAt(cross, y, p.height);
  const guideR = (d: number): number | null => d > 0.01 ? hEff / (2 * d) : null;
  return {
    center: new Pt(0, zBase + sign * (hEff / 2)),
    peak: new Pt(0, zBase + sign * hEff),
    leftR: guideR(left.d),
    rightR: guideR(right.d),
  };
}

/**
 * The defined spline shape nearest a body-length position — the base shape
 * (anchoring both body ends) or the closest station. Shared by the panel
 * (seeding a new draft/preview) and {@link calculateCrossArchSplineGuide}
 * (deciding which shape's control points to mark): a spline's control-point
 * list has no well-defined continuous interpolation between stations the way
 * a scalar d/pct does, so both read off whichever real shape is nearest
 * rather than attempting to reconstruct an in-between one.
 */
export function nearestCrossArchSplineShape(cross: CrossArchSplineParams, y: number, bodyHeight: number): CrossArchSplineShape {
  const stations = normalizeCrossArchStations(cross.stations, bodyHeight);
  let best: CrossArchSplineShape = cross;
  let bestDist = Math.min(y, bodyHeight - y);
  for (const s of stations) {
    const d = Math.abs(s.y - y);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/** One spline cross-arch knot in section coordinates, tagged with the control point it came from. */
export interface CrossArchSplineGuideKnot {
  point: Pt;
  /** Matches ArchSplineKnot.source — the panel's row index, or SPLINE_PEAK_SOURCE. */
  source: number;
}

/**
 * Control-point guide for a spline cross-arch at station `y` — the crosshair
 * positions the module-guide overlay marks, in section coordinates. Drawn
 * from whichever shape (a station or the base) is nearest `y` — see
 * {@link nearestCrossArchSplineShape} — since control points don't ramp
 * point-by-point between stations the way a scalar does. That is the same
 * shape the panel's own control-point rows edit, so `source` indexes those
 * rows directly. Null where no arch exists at this station, or the plate's
 * cross arch isn't a spline.
 */
export function calculateCrossArchSplineGuide(p: EnricoCerutiParams, y: number, side: 'top' | 'bottom' = 'top'): CrossArchSplineGuideKnot[] | null {
  const geo = crossArchStationGeometry(p, y, side);
  if (!geo) return null;
  const { halfSpan, hEff, zBase, sign, cross } = geo;
  if (cross.type !== 'spline') return null;
  const shape = nearestCrossArchSplineShape(cross, y, p.height);
  return archSplineKnots(1, shape.points, shape.peak ?? 0.5).map(k => ({
    point: new Pt(-halfSpan + k.t * 2 * halfSpan, zBase + sign * k.z * hEff),
    source: k.source,
  }));
}

/** A named position along the body that a maker would sight a section against. */
export interface BodyLandmark {
    /** Short code — what a template blank is labelled with, and what the station slider ticks read. */
    code: 'LB' | 'LC' | 'C' | 'UC' | 'UB';
    /** Full name, for tooltips and anywhere there's room to spell it out. */
    name: string;
    /** Body height in mm, rounded — stations are whole millimetres everywhere else too. */
    y: number;
}

/**
 * The five positions that decide a plate's shape: the two widest points, the
 * two corners, and the waist. Sections are sighted against these, so both the
 * station slider's ticks and the cross-arch template set are built from them —
 * which is the point of having one function rather than two lists that can
 * drift apart.
 *
 * None of the five is measured or searched for. All are already in the recipe:
 * the bout flank circles are placed so their outermost point *is* the widest
 * point of that bout, the C-bout arc's leftmost point is the waist, and the
 * corner tips are stored outright. Reading them back off the finished outline
 * would let the marks disagree with the numbers that produced them.
 *
 * Landmarks outside the body — or on a recipe whose bouts aren't laid out yet —
 * are dropped rather than clamped, since a tick or a template at a position the
 * instrument doesn't have would be a fiction.
 */
export function bodyLandmarks(p: EnricoCerutiParams): BodyLandmark[] {
    const b = p.bouts;
    const marks: Array<{ code: BodyLandmark['code']; name: string; y: number | undefined }> = [
        { code: 'LB', name: 'Widest point of the lower bout', y: b.L1?.y },
        { code: 'LC', name: 'Lower corner', y: b.LCr?.y },
        { code: 'C', name: 'Narrowest point of the center bout', y: b.C0?.y },
        { code: 'UC', name: 'Upper corner', y: b.UCr?.y },
        { code: 'UB', name: 'Widest point of the upper bout', y: b.U1?.y },
    ];
    const lo = 1, hi = p.height - 1;
    if (hi <= lo) return [];
    return marks
        .filter((m): m is BodyLandmark => Number.isFinite(m.y) && m.y! > lo && m.y! < hi)
        .map(m => ({ code: m.code, name: m.name, y: Math.round(m.y) }));
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
