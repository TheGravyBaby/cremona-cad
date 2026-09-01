import { clamp } from "../helpers/draftMath";
import { catenaryZAt, cycloidZAt, splineZAt } from "../helpers/svgPathMath";
import {
  ArchCurve, ArchingParams, ArchPlate, CrossArchParams, CrossArchPoint, EnricoCerutiParams, FlutingParams,
} from "./ceruti-types";

// ===== Arching profile system =====
// The long-arch height profile and the body-position queries every arching
// consumer shares — a distinct concern from the flat 2D outline in
// ceruti-calcs.ts/ceruti-paths.ts.
//
// The cross-arch shape and the channel section live in ceruti-arch-geometry.ts,
// with the gouge they are solved against. What stays here is what stands apart
// from the gouge: the long arch, the station list normalizer, the body
// landmarks, and the *AtY half-width queries.

/**
 * Returns instrument-appropriate arching defaults based on body length (p.height).
 *
 * The rib pair carries a typical taper — roughly 0.6% of body length, which is
 * the 2mm a violin usually loses between bottom block and top. These are generic
 * defaults for a size class, not measurements of any instrument.
 */
export function defaultArchingParams(bodyHeight: number): ArchingParams {
  const cat = (archHeight: number) => ({ type: 'catenary' as const, archHeight });
  // The gouge and crown are seeded lazily, by whichever of the surface builder
  // or the arching panels reaches the plate first — both of which have the
  // recipe on hand, which `defaultFlutingParams` needs and this does not.
  const plate = (archHeight: number, thickness: number) => ({
    arch: cat(archHeight), thickness,
  });

  if (bodyHeight < 400) {
    // Violin
    return { surfaceMethod: 'proportional', ribHeightLower: 32, ribHeightUpper: 30,
      top: plate(15, 3.5), bottom: plate(14, 3.5) };
  }
  if (bodyHeight < 500) {
    // Viola
    return { surfaceMethod: 'proportional', ribHeightLower: 40, ribHeightUpper: 38,
      top: plate(20, 4.0), bottom: plate(18, 4.0) };
  }
  if (bodyHeight < 800) {
    // Cello
    return { surfaceMethod: 'proportional', ribHeightLower: 120, ribHeightUpper: 116,
      top: plate(27, 6.0), bottom: plate(25, 6.0) };
  }
  // Double bass
  return { surfaceMethod: 'proportional', ribHeightLower: 185, ribHeightUpper: 179,
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
/**
 * Marching-squares grid for the contour map.
 *
 * Held against the level spacing rather than chosen for its own sake: the rings
 * are drawn 1mm apart in height, and a grid finer than the features those rings
 * can express is just samples that cost time and change nothing on screen. At
 * 2mm a violin plate is ~17,000 samples where 1.25mm was ~45,000, and the map
 * that comes out is the same map — this is the single most expensive number in
 * the arching panels, at roughly 380ms per rebuild before the change.
 *
 * It is *only* the contour preview. The STL carries its own grid (finer, and
 * set per export), and the template blanks are read off the surface directly.
 */
const REFERENCE_GRID_MM = 2;
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
  let migrated = false;
  for (const p of arch.points) {
    if (p.mirror === undefined) {
      p.t = p.t / 2;
      p.mirror = true;
      migrated = true;
    }
  }
  // only what the migration rewrote. A current recipe's order is the maker's
  // arrangement of the table, and `peakRow` counts rows against it, so sorting
  // on load would move the peak out from between the points it was listed with.
  if (migrated) arch.points.sort((a, b) => a.t - b.t);
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
 * Which row of a spline's table the peak is listed in, held inside the table.
 *
 * Shared by both arching panels, which list a peak among control points in the
 * same way and store its place the same way — see {@link ArchSpline.peakRow}.
 * Read through this rather than off the field: a recipe can carry a row that
 * the points have since been deleted out from under.
 */
export function splinePeakRow(shape: { points: unknown[]; peakRow?: number }): number {
  return clamp(Math.round(shape.peakRow ?? 0), 0, shape.points.length);
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
  normalizeRibHeights(p.arching);
  normalizeArchCurve(p.arching.top.arch);
  normalizeArchCurve(p.arching.bottom.arch);
  normalizeArchPlate(p.arching.top);
  normalizeArchPlate(p.arching.bottom);
}

/**
 * Splits a recipe's single `ribHeight` into the tapered pair.
 *
 * Both ends take the old value rather than a default taper: the number in the
 * file is the one its author measured, and seeding a taper here would tilt
 * somebody's saved instrument on load without them asking. An untapered pair
 * reproduces exactly what that recipe drew before.
 *
 * Recognises the current format positively, like {@link normalizeArchPlate}, so
 * running twice is a no-op.
 */
function normalizeRibHeights(a: ArchingParams): void {
  const legacy = a as ArchingParams & { ribHeight?: number };
  if (typeof legacy.ribHeight === 'number') {
    a.ribHeightLower ??= legacy.ribHeight;
    a.ribHeightUpper ??= legacy.ribHeight;
    delete legacy.ribHeight;
  }
  // A pair with only one side written is half a plane; the missing end mirrors
  // the one that is there, which is the untapered rib the recipe described.
  a.ribHeightLower ??= a.ribHeightUpper;
  a.ribHeightUpper ??= a.ribHeightLower;
}

/**
 * Brings one plate's gouge and crown blocks up to the current names.
 *
 * There were two arching models for a few days, and the second one's blocks
 * were called `gougedFluting` / `gougedCross` to sit alongside the first one's
 * `fluting` / `cross`. Only the second survives, so it has the plain names now
 * and a saved recipe can be carrying either.
 *
 * A leftover from the retired model is dropped rather than read: its crown was
 * authored in fractions of the local chord against a channel derived from the
 * arch, so nothing about it can be reinterpreted against a fixed gouge. The
 * plate falls back to defaults, which is the honest outcome and the visible one.
 *
 * Recognising the current format positively — rather than assuming a bare
 * `cross` is legacy — is what makes this safe to run twice, which it is: every
 * recipe entering the app passes through here, including ones already migrated
 * in an earlier session and saved back.
 */
function normalizeArchPlate(plate: ArchPlate): void {
  const legacy = plate as ArchPlate & { gougedFluting?: FlutingParams; gougedCross?: CrossArchParams };

  if (legacy.gougedFluting) plate.fluting = legacy.gougedFluting;
  else if (plate.fluting && plate.fluting.sweepRadius === undefined) delete plate.fluting;
  delete legacy.gougedFluting;

  if (legacy.gougedCross) plate.cross = legacy.gougedCross;
  else if (plate.cross && !isCurrentCrossArch(plate.cross)) delete plate.cross;
  delete legacy.gougedCross;
}

/**
 * Whether a crown block is in the current model's terms. The retired one shared
 * both curve-type names, so the tell is inside the shape: its control points
 * were `t`/`z` fractions of the chord where these are signed `x`, and its
 * trochoid carried a `left`/`right` pair for asymmetry that this one expresses
 * per point. Older still, the block carried no `type` at all.
 */
function isCurrentCrossArch(cross: CrossArchParams): boolean {
  if (cross.type !== 'spline' && cross.type !== 'cycloid') return false;
  return cross.type === 'spline'
    ? cross.points.every(pt => typeof (pt as CrossArchPoint).x === 'number')
    : !('left' in cross || 'right' in cross);
}

/**
 * Long-arch centerline height at body position `y`, relative to the takeoff.
 *
 * Spanned between the channel's inner reach at each cap rather than the bare
 * body ends — the arch is a feature of the carved area, and starting it at the
 * outline would compress the whole curve toward the caps. Where that reach
 * actually falls comes back out of {@link solveLongArch}; this is the
 * chord-wise height the cross-arch solve rides on, so it stays on the authored
 * band.
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

// ===== Rib taper =====
// The ribs are not the same height end to end. Once the back is glued on they
// are planed down toward the upper block, so the back's gluing plane stays
// square to the body and the top's tilts. Nothing in the arch, the channel or
// the crown depends on this — a plate is carved against its own gluing plane,
// and that is the frame the surface model, the templates and the STL all work
// in. What the taper decides is where the top plate *sits*, which is why it
// shows up in the two section views and nowhere else.
//
// Both entered heights are perpendicular to the rib's top edge — a caliper
// across the stock — so they are shorter than the vertical rise by cos of the
// tilt. That inverts in closed form rather than iteratively: a perpendicular
// width is w = z·cosθ, and the plane rises z_lower − z_upper = L·tanθ over the
// run L between the two, so w_lower − w_upper = L·sinθ. At violin scale the
// correction is half a micron and at cello scale 26 — it is here because it is
// the definition the numbers are quoted under, not because it moves anything.

/** The tilted plane the top plate glues to, solved from the two entered rib heights. */
export interface RibTaper {
  /** Body positions the two heights are measured at. */
  yLower: number;
  yUpper: number;
  /** Those heights as vertical rise above the back plane, which is what everything draws with. */
  zLower: number;
  zUpper: number;
  /** Tilt of the top plane off the back plane, radians. Zero for untapered ribs. */
  angle: number;
}

/**
 * Body positions the two rib heights are measured at: the lower at the body
 * datum, the upper at the rib's own top end, which is where the plate stops
 * overhanging it. The one place either anchor is stated.
 */
function ribAnchors(p: EnricoCerutiParams): { yLower: number; yUpper: number } {
  return { yLower: 0, yUpper: p.height - p.overhang };
}

export function solveRibTaper(p: EnricoCerutiParams): RibTaper {
  const a = p.arching;
  const { yLower, yUpper } = ribAnchors(p);
  const wLower = a?.ribHeightLower ?? 0;
  const wUpper = a?.ribHeightUpper ?? wLower;
  const run = yUpper - yLower;
  // A taper steeper than the body is long has no angle to solve, and asin would
  // hand back a NaN that every height downstream would inherit.
  const angle = run > 0 ? Math.asin(clamp((wLower - wUpper) / run, -1, 1)) : 0;
  const cos = Math.cos(angle);
  return { yLower, yUpper, zLower: wLower / cos, zUpper: wUpper / cos, angle };
}

/**
 * The most the two rib heights may differ by before the taper stops describing
 * an instrument.
 *
 * Tilting the rib's top edge lengthens it — it is the hypotenuse over the run
 * between the two measurements, so it measures run/cosθ. At the point where
 * that outgrows the body it belongs to, the top plate spanning it would have to
 * be longer than the instrument, and the section view can only draw that by
 * stretching the plate to reach. Solving run/cosθ = body length for the height
 * difference is where this comes from.
 *
 * It is a long way past anything a maker would plane — tens of millimetres on a
 * violin. The point is to keep an impossible garland out of the model, not to
 * express a taste about how much ribs should taper.
 */
export function maxRibTaperMm(p: EnricoCerutiParams): number {
  const { yLower, yUpper } = ribAnchors(p);
  const run = yUpper - yLower;
  // No run to tilt over, or a body no longer than the rib it carries: the only
  // taper either can hold is none.
  if (run <= 0 || p.height <= run) return 0;
  const cosMin = run / p.height;
  return run * Math.sqrt(1 - cosMin * cosMin);
}

/**
 * Height of the top plate's gluing plane above the back plane at body position
 * `y`, in vertical millimetres.
 *
 * Linear in y, and deliberately extrapolating past both anchors: the plane runs
 * on past the rib it was measured from, and the plate overhangs onto it at each
 * end. Pass a solved {@link RibTaper} when querying repeatedly.
 */
export function ribHeightAt(p: EnricoCerutiParams, y: number, taper?: RibTaper): number {
  const t = taper ?? solveRibTaper(p);
  const run = t.yUpper - t.yLower;
  if (run <= 0) return t.zLower;
  return t.zLower + (y - t.yLower) * (t.zUpper - t.zLower) / run;
}

/** Two stations closer together than this (mm) are the same station. */
export const STATION_MERGE_EPS_MM = 0.5;

/** Stations are held this far (mm) inside the body ends so they stay interior knots. */
export const STATION_MARGIN_MM = 1;

/**
 * A station list put in the order and the bounds everything downstream assumes:
 * sorted along the body, held inside both ends, and deduped.
 *
 * Generic over `{ y: number }` and returning the caller's own element type, so
 * a crown shape rides through untouched — {@link makeCrossArchResolver},
 * `nearestCrossArchShape` and the template station list all lean on that.
 * Non-mutating: the panel keeps its own row order deliberately, and normalizing
 * must not reorder the array behind it.
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

// A station's half-width used to be read off the outline's arcs here. It is now
// read off the sampled loop instead (`plateHalfChordAtY`), because the arcs
// answer wrongly at the corners: the plate edge rounds each corner on a cubic
// that no arc covers, and the bout arcs that do answer run past the corner they
// were cut at. The loops are also what the surface model itself measures.

