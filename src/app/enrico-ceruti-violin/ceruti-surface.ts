import * as d3 from 'd3';
import * as polygonClipping from 'polygon-clipping';
import { Pt } from '../models/types';
// polygon-clipping ships as either an ESM default or a CJS namespace depending on bundler.
const polyClipper: any = (polygonClipping as any).default ?? polygonClipping;
import { buildPolylineIndex, closestPointToPolylineIndexed, PolylineIndex } from '../helpers/draftMath';
import { buildHeightFieldStl } from '../helpers/stlExporter';
import { closeProfileToBlank, cycloidEdgeSlope, cycloidZAt, flutingProfileZ, pathsBounds, rotatePath180, samplePathToPolyline, translatePath } from '../helpers/svgPathMath';
import { ArchCurve, EnricoCerutiParams } from './ceruti-types';
import { defineFlutingPath, defineInsetPath, defineOuterPath } from './ceruti-paths';
import { calculateLongArch, defaultCrossArchParams, defaultFlutingChannelParams, flutingHalfWidthAtY, longArchHeightAt } from './ceruti-arching';

// The evaluable top-plate surface: a height field z(x, y) over the plan view,
// stitched from three regions classified by station chords (so it always
// agrees with the cross-section render at the same station):
//   |x| ≤ fluting inner chord      → cross-arch trochoid, takeoff at −edgeDepth
//   outside the platform outer loop → flat edge land at plate-surface level (0)
//   between the two                 → fluting channel, transverse position u
//                                     from the distance ratio to the two loops
// Heights are relative to the plate outer surface (ribHeight + top thickness);
// the channel dips negative. Distance-ratio u (never normal projection) keeps
// the corners fold-free where the annulus widens.

/** Precomputed geometry for evaluating a plate's height field. Rebuild on param change, reuse across queries. */
export interface PlateSurfaceModel {
    /**
     * The plate edge (outer path) as a sampled closed loop. Chords come from
     * this polyline, not the offset arcs: the corner tips are cubic Béziers
     * that arc-only queries miss entirely, voiding the corner-band stations.
     */
    outerPlate: Pt[];
    /** Platform outer boundary (plan mm), sampled as a closed loop. */
    platformOuter: Pt[];
    /** Fluting inner boundary loop; null when fluting isn't configured (platform stays flat). */
    flutingInner: Pt[] | null;
    /** Spatial indexes over the two loops — channel distance queries run per grid point. */
    platformOuterIdx: PolylineIndex;
    flutingInnerIdx: PolylineIndex | null;
    arch: ArchCurve;
    crossD: number;
    crossPct: number;
    edgeDepth: number;
    /** Flat pre-channel platform with a ledge at the inner boundary instead of a carved channel. */
    flatPlatform: boolean;
    /** Absolute Z of the plate outer surface: top = ribHeight + top thickness, back = −bottom thickness. */
    zBase: number;
    /**
     * Direction the relative height field folds into absolute Z: top plate grows
     * up (+1), back plate grows down (−1). The field math (peak positive, channel
     * negative) is identical for both plates; only the placement flips.
     */
    signZ: 1 | -1;
}

export function buildPlateSurfaceModel(p: EnricoCerutiParams, side: 'top' | 'bottom' = 'top'): PlateSurfaceModel | null {
    const a = p.arching;
    if (!a) return null;
    const plate = a[side];
    const fluting = plate.fluting ?? defaultFlutingChannelParams();
    const innerPath = defineFlutingPath(p, p.innerFlutingDepth ?? 0);
    const platformOuter = samplePathToPolyline(defineInsetPath(p, p.outerFlutingDepth ?? 0));
    const flutingInner = innerPath ? samplePathToPolyline(innerPath) : null;
    // The back plate carries the neck-root button in its outline; the top does not.
    const outerPlate = samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, side === 'bottom'));
    return {
        outerPlate,
        platformOuter,
        flutingInner,
        platformOuterIdx: buildPolylineIndex(platformOuter),
        flutingInnerIdx: flutingInner ? buildPolylineIndex(flutingInner) : null,
        arch: plate.arch,
        crossD: plate.cross?.d ?? defaultCrossArchParams().d,
        crossPct: plate.cross?.pct ?? defaultCrossArchParams().pct,
        edgeDepth: plate.edgeDepth ?? 0,
        flatPlatform: fluting.flatPlatform ?? false,
        zBase: side === 'top' ? a.ribHeight + plate.thickness : -plate.thickness,
        signZ: side === 'top' ? 1 : -1,
    };
}

/** Per-station bounds, computed once per grid row / section slice. */
export interface StationChords {
    outerHalf: number | null;
    /** Outermost |x| of the platform outer boundary — where the flat edge land ends. */
    platformOuterHalf: number | null;
    flutingInnerHalf: number | null;
    /** Sorted x-crossings of the platform outer loop at this station (land/channel split). */
    landCrossings: number[];
    /**
     * Long-arch centerline height at this station. Hoisted here because it is
     * x-independent but iterative to evaluate (catenary/cycloid inversion) —
     * per-point evaluation dominated the contour grid.
     */
    archH: number;
}

/**
 * The fluting inner half-chord at station `y`. Arc-exact when available: same
 * query the cross arch spans, so the channel meets the takeoff point by
 * construction. Falls back to the sampled polyline at corner-band stations where
 * the arc-only query misses the cubic Bézier tips — without this,
 * calculateFlutingSectionTop would treat those stations as cap stations and
 * sweep a full-width channel profile over the arch region, creating strange
 * shapes.
 */
function flutingInnerHalfAt(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number): number | null {
    return flutingHalfWidthAtY(p, y)
        ?? (model.flutingInner ? maxAbsCrossingAtY(model.flutingInner, y) : null);
}

/**
 * Cross-arch trochoid height (relative to the plate outer surface) at width x,
 * for a station whose fluting inner half-chord is `fi` and long-arch centerline
 * height is `archH`. The takeoff sits at −edgeDepth; a degenerate cap station
 * (no arch height) stays flat there.
 */
function crossArchZAt(model: PlateSurfaceModel, fi: number, archH: number, x: number): number {
    if (archH <= 0) return -model.edgeDepth;
    return -model.edgeDepth + cycloidZAt(archH + model.edgeDepth, 2 * fi, model.crossD, x + fi, model.crossPct);
}

export function stationChordsAt(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number): StationChords {
    const landCrossings = polylineCrossingsAtY(model.platformOuter, y);
    const flutingInnerHalf = flutingInnerHalfAt(p, model, y);
    return {
        outerHalf: maxAbsCrossingAtY(model.outerPlate, y),
        platformOuterHalf: landCrossings.length
            ? Math.max(Math.abs(landCrossings[0]), Math.abs(landCrossings[landCrossings.length - 1]))
            : null,
        flutingInnerHalf,
        landCrossings,
        archH: longArchHeightAt(p, model.arch, y),
    };
}

/** Outermost |x| where the station line crosses the loop; null when it misses. */
function maxAbsCrossingAtY(poly: Pt[], y: number): number | null {
    const xs = polylineCrossingsAtY(poly, y);
    return xs.length ? Math.max(Math.abs(xs[0]), Math.abs(xs[xs.length - 1])) : null;
}

function polylineCrossingsAtY(poly: Pt[], y: number): number[] {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        // Half-open test so a vertex exactly on the station line isn't counted twice.
        if ((a.y <= y) !== (b.y <= y)) {
            xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
    }
    return xs.sort((m, n) => m - n);
}

/** Even-odd rule against the precomputed row crossings. */
function insideCrossings(x: number, xs: number[]): boolean {
    let count = 0;
    for (const c of xs) if (c > x) count++;
    return count % 2 === 1;
}

const CHANNEL_SLOPE_PROBE_EPS = 0.3; // mm inward from the fluting inner boundary to sample the arch's takeoff slope

/**
 * The cross-arch's own edge slope at a station — today's channel target, kept as
 * the fallback where the directional probe can't land a clean arch sample. Same
 * hEff/span the arch branch builds its cycloid from; 0 at cap/degenerate stations.
 */
function crossEdgeSlopeFallback(model: PlateSurfaceModel, fi: number | null, archH: number): number {
    return fi !== null && fi > 0 && archH > 0
        ? cycloidEdgeSlope(archH + model.edgeDepth, 2 * fi, model.crossD, model.crossPct)
        : 0;
}

/** The arch-region surface height at (x, y), or null when (x, y) isn't under the arch (channel/land/off-body). */
function archSampleZAt(p: EnricoCerutiParams, model: PlateSurfaceModel, x: number, y: number): number | null {
    const fi = flutingInnerHalfAt(p, model, y);
    if (fi === null || Math.abs(x) > fi) return null;
    return crossArchZAt(model, fi, longArchHeightAt(p, model.arch, y), x);
}

/**
 * The arch surface's slope at the fluting inner boundary, measured along the
 * boundary's inward normal — the direction the channel profile actually meets
 * the arch. This is the slope the channel's gouge arc must be tangent to so it
 * meets the arch tangentially in 3D — along the bouts it equals the cross-arch
 * edge slope, at the caps the long-arch slope, and it blends around the corners
 * without a seam. It picks up both the cross (∂x) and long (∂y) contributions at
 * once.
 *
 * The probe direction is `innerPt − queryPt`: for a channel point strictly
 * outside the inner loop, that vector is the loop's inward normal (nearest-point
 * property), and it reliably points into the arch even at the high-curvature
 * caps — where the inter-loop chord would skew and miss the narrow arch sliver,
 * seaming cap points onto the cross-arch fallback.
 *
 * The finite difference is taken between two points *inside* the arch (ε and 2ε
 * past the boundary), never the boundary itself: the arch sits at −edgeDepth on
 * the boundary but rises from 0 just inside, so a boundary-anchored difference
 * would fold that edgeDepth takeoff step into the slope. Differencing two
 * interior samples cancels it, leaving the arch's genuine rise. Null when a
 * probe steps outside the arch region, where the caller falls back to the
 * cross-arch slope.
 */
function archTransverseSlopeAt(
    p: EnricoCerutiParams, model: PlateSurfaceModel, innerPt: Pt, queryPt: Pt,
): number | null {
    const dx = innerPt.x - queryPt.x, dy = innerPt.y - queryPt.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len, uy = dy / len;
    const e = CHANNEL_SLOPE_PROBE_EPS;
    const z1 = archSampleZAt(p, model, innerPt.x + e * ux, innerPt.y + e * uy);
    const z2 = archSampleZAt(p, model, innerPt.x + 2 * e * ux, innerPt.y + 2 * e * uy);
    if (z1 === null || z2 === null) return null;
    return (z2 - z1) / e;
}

/**
 * Top-plate surface height at plan point (x, y), relative to the plate outer
 * surface. Returns null outside the plate outline. Pass `chords` when
 * evaluating many points on one station row.
 */
export function topSurfaceZAt(p: EnricoCerutiParams, model: PlateSurfaceModel, x: number, y: number, chords?: StationChords): number | null {
    chords ??= stationChordsAt(p, model, y);
    const ax = Math.abs(x);
    if (chords.outerHalf === null || ax > chords.outerHalf) return null;

    const fi = chords.flutingInnerHalf;
    if (fi !== null && ax <= fi) return crossArchZAt(model, fi, chords.archH, x);

    if (!insideCrossings(x, chords.landCrossings)) return 0; // flat edge land
    if (!model.flutingInner) return 0; // fluting unconfigured — platform stays flat

    const pt = { x, y };
    const outer = closestPointToPolylineIndexed(pt, model.platformOuterIdx);
    const inner = closestPointToPolylineIndexed(pt, model.flutingInnerIdx!);
    const width = outer.dist + inner.dist;
    const u = width > 0 ? outer.dist / width : 0;
    // Meet the arch tangentially in 3D: the takeoff slope comes from the arch
    // surface along the fluting inner boundary's normal (cross along the bouts,
    // long at the caps), not from the cross arch alone.
    const slope = archTransverseSlopeAt(p, model, inner.point, pt)
        ?? crossEdgeSlopeFallback(model, fi, chords.archH);
    return flutingProfileZ(u, model.edgeDepth, width, slope, model.flatPlatform);
}

/**
 * The carved fluting profile across the station, sampled from the height field
 * so the section view and the 3D surface always agree — one polyline per side
 * from the fluting inner chord out to the platform outer chord, in section
 * coordinates (canvas X = violin X, canvas Y = absolute Z). At cap stations
 * (no inner chord) the channel spans the body in a single curve.
 */
export function calculateFlutingSectionTop(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number): string | null {
    const chords = stationChordsAt(p, model, y);
    if (chords.outerHalf === null) return null;
    const fo = Math.min(chords.platformOuterHalf ?? chords.outerHalf, chords.outerHalf);
    const fi = chords.flutingInnerHalf;

    const sampleSide = (x0: number, x1: number): string => {
        const n = Math.max(8, Math.ceil(Math.abs(x1 - x0) / 0.25));
        const pts: string[] = [];
        for (let i = 0; i <= n; i++) {
            const x = x0 + ((x1 - x0) * i) / n;
            const z = topSurfaceZAt(p, model, x, y, chords);
            if (z === null) continue;
            pts.push(`${pts.length === 0 ? 'M' : 'L'} ${x} ${model.zBase + model.signZ * z}`);
        }
        return pts.join(' ');
    };

    if (fi === null || fi <= 0) return sampleSide(-fo, fo);

    // Flat pre-channel platform: a crisp 90° ledge at the inner boundary rather
    // than the sampled gouge arc — flat land out to the platform outer chord,
    // then a vertical drop to the arch takeoff at −edgeDepth.
    if (model.flatPlatform) {
        const zTop = model.zBase;
        const zTake = model.zBase - model.signZ * model.edgeDepth;
        const ledgeSide = (fInner: number, fOuter: number): string =>
            `M ${fInner} ${zTake} L ${fInner} ${zTop} L ${fOuter} ${zTop}`;
        return `${ledgeSide(-fi, -fo)} ${ledgeSide(fi, fo)}`;
    }

    return `${sampleSide(-fo, -fi)} ${sampleSide(fi, fo)}`;
}

/**
 * Full-width surface profile at station `y` — arch hump, fluting channel, and
 * flat edge land in one continuous sweep from edge to edge, in absolute (x, Z)
 * coordinates. Unlike {@link calculateFlutingSectionTop}, which only traces the
 * channel/land portion (meant to be paired with {@link calculateCrossArchTop}'s
 * hump when rendering), this sweeps the whole half-width in a single pass since
 * {@link topSurfaceZAt} already classifies arch/channel/land internally. Basis
 * for cut-out arching templates, which need one uninterrupted cutting edge.
 */
export function computeArchSectionProfile(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number, stepMm = 0.25): string | null {
    const chords = stationChordsAt(p, model, y);
    if (chords.outerHalf === null) return null;
    const half = chords.outerHalf;
    const n = Math.max(8, Math.ceil((2 * half) / stepMm));
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
        const x = -half + (2 * half * i) / n;
        const z = topSurfaceZAt(p, model, x, y, chords);
        if (z === null) continue;
        pts.push(`${pts.length === 0 ? 'M' : 'L'} ${x} ${model.zBase + model.signZ * z}`);
    }
    return pts.length ? pts.join(' ') : null;
}

// ===== Arching templates =====
// Physical cutout templates for traditional hand-carving: a rectangular blank
// with one edge cut to an arch profile, built from {@link computeArchSectionProfile}
// (cross arch) or {@link calculateLongArch} (long arch) via {@link closeProfileToBlank}.

const TEMPLATE_GAP = 5;    // mm between laid-out template blanks, so a combined export doesn't overlap.
const TEMPLATE_MARGIN = 10; // mm of backing past the arch's peak — must match closeProfileToBlank's default.

/** A closed template blank plus where/how to print its identifying label. */
export interface TemplateShape {
    path: string;
    label: string;
    labelPos: Pt;
    /** Text rotation in degrees: 0 for the wide cross-arch strips, 90 for the long, narrow long-arch strips. */
    labelRotation: number;
}

function translateTemplateShape(shape: TemplateShape, dx: number, dy: number): TemplateShape {
    return {
        ...shape,
        path: translatePath(shape.path, dx, dy),
        labelPos: { x: shape.labelPos.x + dx, y: shape.labelPos.y + dy },
    };
}

/** 5 evenly-spaced interior body-length stations across the long arch's valid
 * span. Deliberately excludes the span's own endpoints — those are the cusp
 * points where the long arch height is 0 ({@link longArchHeightAt}), so a
 * cross-arch template there would be degenerate. */
export function crossArchTemplateStationYs(p: EnricoCerutiParams): number[] {
    const { span, yStart } = calculateLongArch(p);
    return [1, 2, 3, 4, 5].map(i => yStart + (i / 6) * span);
}

/** Center each shape on x = 0 and place them left-to-right with a gap between, the row itself centered on x = 0. */
function rowTemplates(shapes: TemplateShape[]): TemplateShape[] {
    const bounds = shapes.map(s => pathsBounds([s.path]));
    const totalWidth = bounds.reduce((sum, b) => sum + b.width, 0) + TEMPLATE_GAP * Math.max(shapes.length - 1, 0);
    let xCursor = -totalWidth / 2;
    return shapes.map((shape, i) => {
        const b = bounds[i];
        const placed = translateTemplateShape(shape, xCursor - b.minX, -b.minY);
        xCursor += b.width + TEMPLATE_GAP;
        return placed;
    });
}

/** Center each shape on x = 0 and stack them bottom-to-top with a gap between. */
function stackTemplates(shapes: TemplateShape[]): TemplateShape[] {
    let yCursor = 0;
    return shapes.map(shape => {
        const b = pathsBounds([shape.path]);
        const placed = translateTemplateShape(shape, -b.minX - b.width / 2, yCursor - b.minY);
        yCursor += b.height + TEMPLATE_GAP;
        return placed;
    });
}

/**
 * The five cross-arch template blanks for one plate side, each traced from
 * {@link computeArchSectionProfile} at a {@link crossArchTemplateStationYs}
 * station and closed into a blank via {@link closeProfileToBlank}. `model.signZ`
 * (+1 top, −1 back) picks which side of the (already-mirrored) cutout curve the
 * backing attaches to — this is the only value that keeps material thin at the
 * arch's peak and thick at the flat edges; the two plates' mirrored curves are
 * shaped oppositely (valley vs. hump), so they need opposite backing sides to
 * get the same thin-at-peak result. The returned `backing` coordinate places
 * the label a half margin in from that edge — always in solid material.
 */
function calculateCrossArchTemplatesForSide(p: EnricoCerutiParams, model: PlateSurfaceModel, sideLabel: string): TemplateShape[] {
    return crossArchTemplateStationYs(p)
        .map((y): TemplateShape | null => {
            const profile = computeArchSectionProfile(p, model, y);
            if (profile === null) return null;
            const { path, backing, positionMid } = closeProfileToBlank(profile, 'y', model.signZ, TEMPLATE_MARGIN);
            return {
                path,
                label: `${sideLabel} ${Math.round(y)}mm`,
                labelPos: { x: positionMid, y: backing + model.signZ * TEMPLATE_MARGIN / 2 },
                labelRotation: 0,
            };
        })
        .filter((shape): shape is TemplateShape => shape !== null);
}

/**
 * Rotates a template blank 180° about the origin — unlike a mirror, a point
 * rotation preserves concavity, so it re-orients which edge faces "up" for
 * presentation without flipping the (already-correct) cutout curve back to
 * the wrong hand. The label's own position rotates along with it, but its
 * `labelRotation` is untouched — text is always rendered upright at its
 * position regardless of the shape's rotation, so it stays readable.
 */
function rotateTemplateShape180(shape: TemplateShape): TemplateShape {
    return {
        ...shape,
        path: rotatePath180(shape.path),
        labelPos: { x: -shape.labelPos.x, y: -shape.labelPos.y },
    };
}

/**
 * All ten cross-arch template blanks (5 stations × top/back), stacked into one
 * combined, non-overlapping layout — back plate's row below the top plate's,
 * each station ordered by increasing body-length position. Both plates present
 * with the flat backing edge up: the back plate's already lands there
 * (model.signZ = −1), while the top plate's naturally lands at the bottom, so
 * its blanks are rotated 180° after the fact ({@link rotateTemplateShape180}).
 * Returns `[]` if the arching modules haven't been configured yet.
 */
export function calculateCrossArchTemplates(p: EnricoCerutiParams): TemplateShape[] {
    if (!p.arching) return [];
    const sides: Array<{ key: 'top' | 'bottom'; label: string }> = [{ key: 'bottom', label: 'Back' }, { key: 'top', label: 'Top' }];
    const templates = sides.flatMap(({ key, label }) => {
        const plate = p.arching![key];
        plate.cross ??= defaultCrossArchParams();
        plate.fluting ??= defaultFlutingChannelParams();
        const model = buildPlateSurfaceModel(p, key);
        if (!model) return [];
        const shapes = calculateCrossArchTemplatesForSide(p, model, label);
        return key === 'top' ? shapes.map(rotateTemplateShape180) : shapes;
    });
    return stackTemplates(templates);
}

/**
 * The two long-arch template blanks (top, back), traced directly from
 * {@link calculateLongArch}'s `topPath`/`backPath` (already the exact
 * centerline elevation curves, canvas X = Z, canvas Y = body length) and
 * closed into blanks via {@link closeProfileToBlank}, placed side by side.
 * Labels run rotated 90° along the strip's length, same backing-relative
 * placement as the cross-arch templates. Both present with the flat backing
 * edge on the left: the top plate's naturally lands there (direction = +1),
 * while the back plate's naturally lands on the right, so it's rotated 180°
 * after the fact — same {@link rotateTemplateShape180} used to re-orient the
 * top cross-arch templates, since a plain mirror would flip the cutout back
 * to convex. Returns `[]` if the arching modules haven't been configured yet.
 */
export function calculateLongArchTemplates(p: EnricoCerutiParams): TemplateShape[] {
    if (!p.arching) return [];
    const { topPath, backPath } = calculateLongArch(p);
    const templates: TemplateShape[] = [];
    if (backPath) {
        const { path, backing, positionMid } = closeProfileToBlank(backPath, 'x', -1, TEMPLATE_MARGIN);
        const shape: TemplateShape = { path, label: 'Back Long', labelPos: { x: backing - TEMPLATE_MARGIN / 2, y: positionMid }, labelRotation: 90 };
        templates.push(rotateTemplateShape180(shape));
    }
    if (topPath) {
        const { path, backing, positionMid } = closeProfileToBlank(topPath, 'x', 1, TEMPLATE_MARGIN);
        templates.push({ path, label: 'Top Long', labelPos: { x: backing + TEMPLATE_MARGIN / 2, y: positionMid }, labelRotation: 90 });
    }
    return rowTemplates(templates);
}

/**
 * Contour (topo) map of the top surface: level curves every `stepMm` of height
 * relative to the plate outer surface, computed on a `gridMm` plan grid via
 * d3-contour (marching squares). Returns plan-view path strings translated by
 * `xOffset`/`yOffset` so the map can sit beside a sibling plate's map and stack
 * above the section view on the same canvas.
 *
 * The height field is relative to the plate outer surface (peak positive,
 * channel negative) for both plates, so the level curves are plate-agnostic —
 * only the on-canvas offset differs between top and back.
 *
 * Out-of-outline grid cells are padded below every positive threshold but
 * above every non-positive one: positive levels close naturally at the
 * outline, while channel levels (≤ 0) ring the trough band instead of
 * uselessly tracing the outline.
 */
/** One contour level's rings in local plate (x, y) coordinates — no canvas offset applied. */
export interface ArchContourLevel {
    level: number;
    rings: [number, number][][];
}

/**
 * The expensive, rotation-independent part shared by both consumers: builds
 * the height-field grid, runs marching squares, and clips every ring to the
 * exact instrument outline. Returns local plate coordinates so callers can
 * either flatten straight to a plan-view path (`computeArchContours`) or
 * project each ring through an arbitrary rotation (`computeArchContourRings`,
 * used by the 3D contour view — every ring point sits at z = its level, so
 * projecting them is exactly like projecting a wireframe rib).
 */
function computeArchContourRingsRaw(
    p: EnricoCerutiParams,
    model: PlateSurfaceModel,
    stepMm: number,
    gridMm: number,
): { xMax: number; levels: ArchContourLevel[] } {
    const xMax = p.width / 2 + p.overhang + p.rib + 2;
    const yMin = -1, yMax = p.height + 1;
    const nx = Math.floor((2 * xMax) / gridMm) + 1;
    const ny = Math.floor((yMax - yMin) / gridMm) + 1;

    const posVals = new Float64Array(nx * ny);
    const negVals = new Float64Array(nx * ny);
    let zMin = 0, zMax = 0;

    for (let j = 0; j < ny; j++) {
        const y = yMin + j * gridMm;
        const chords = stationChordsAt(p, model, y);
        // The outline is x-symmetric: evaluate x ≥ 0 and mirror.
        for (let x = 0; x <= xMax; x += gridMm) {
            const z = topSurfaceZAt(p, model, x, y, chords);
            const i = Math.round((x + xMax) / gridMm);
            const iMirror = Math.round((xMax - x) / gridMm);
            const pos = z ?? -1e6;
            const neg = z ?? 1e6;
            posVals[j * nx + i] = pos;
            negVals[j * nx + i] = neg;
            if (iMirror >= 0 && iMirror < nx) {
                posVals[j * nx + iMirror] = pos;
                negVals[j * nx + iMirror] = neg;
            }
            if (z !== null) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
        }
    }

    const levelVals: number[] = [];
    for (let k = Math.ceil(zMin / stepMm); k * stepMm <= zMax; k++) levelVals.push(k * stepMm);

    const generator = d3.contours().size([nx, ny]).smooth(true);
    const toLocalRings = (rings: number[][][][]): [number, number][][] =>
        rings.flat().map(ring => ring.map(([cx, cy]) => [-xMax + cx * gridMm, yMin + cy * gridMm] as [number, number]));

    // Build the outline clip polygon in grid-index coordinates so marching-squares
    // contour rings are clipped to the exact instrument boundary rather than the
    // quantised grid staircase.
    const toGridI = (x: number) => (x + xMax) / gridMm;
    const toGridJ = (y: number) => (y - yMin) / gridMm;
    const outlineRing: [number, number][] = model.outerPlate.map(
        pt => [toGridI(pt.x), toGridJ(pt.y)] as [number, number]
    );
    outlineRing.push(outlineRing[0]); // polygon-clipping requires a closed ring
    const outlineClip: [number, number][][][] = [[outlineRing]];

    const levels: ArchContourLevel[] = [];
    for (const level of levelVals) {
        const multi = generator.contour(level > 0 ? (posVals as any) : (negVals as any), level);
        // Clip marching-squares rings to the exact outline so every contour boundary
        // follows the instrument shape rather than a grid staircase. Positive levels
        // never reach the outline (the flat edge land at z = 0 always separates the
        // dome from the plate edge), so the intersection would be a no-op for them.
        const rawRings: number[][][][] = level > 0
            ? (multi.coordinates as any)
            : ((polyClipper.intersection(multi.coordinates as any, outlineClip) ?? []) as any);
        const rings = toLocalRings(rawRings);
        if (rings.length > 0) levels.push({ level, rings });
    }
    return { xMax, levels };
}

/**
 * Contour (topo) map of the top surface: level curves every `stepMm` of height
 * relative to the plate outer surface, computed on a `gridMm` plan grid via
 * d3-contour (marching squares). Returns plan-view path strings translated by
 * `xOffset`/`yOffset` so the map can sit beside a sibling plate's map and stack
 * above the section view on the same canvas.
 *
 * The height field is relative to the plate outer surface (peak positive,
 * channel negative) for both plates, so the level curves are plate-agnostic —
 * only the on-canvas offset differs between top and back.
 *
 * Out-of-outline grid cells are padded below every positive threshold but
 * above every non-positive one: positive levels close naturally at the
 * outline, while channel levels (≤ 0) ring the trough band instead of
 * uselessly tracing the outline.
 */
export function computeArchContours(
    p: EnricoCerutiParams,
    model: PlateSurfaceModel,
    stepMm = 1,
    gridMm = 1,
    yOffset = 0,
    xOffset = 0,
): { level: number; path: string }[] {
    const { levels } = computeArchContourRingsRaw(p, model, stepMm, gridMm);
    return levels.map(({ level, rings }) => ({
        level,
        path: rings.map(ring =>
            ring.map(([x, y], idx) =>
                `${idx === 0 ? 'M' : 'L'} ${(x + xOffset).toFixed(2)} ${(y + yOffset).toFixed(2)}`
            ).join(' ') + ' Z'
        ).join(' '),
    }));
}

/**
 * Same contour geometry as `computeArchContours`, but in local plate
 * coordinates (no canvas offset) so each ring point can be projected through
 * an arbitrary rotation for the 3D contour view — every point in a ring sits
 * at z = that ring's level by construction.
 */
export function computeArchContourRings(
    p: EnricoCerutiParams,
    model: PlateSurfaceModel,
    stepMm = 1,
    gridMm = 1,
): ArchContourLevel[] {
    return computeArchContourRingsRaw(p, model, stepMm, gridMm).levels;
}

/**
 * Binary STL of one plate as machined: the height-field surface on top, flat
 * base at z = 0 (the blank's gluing face on the CNC bed), vertical skirt at the
 * outline. Coordinates in mm, x/y as in plan view. The height field is
 * plate-agnostic (peak positive above the gluing face), so the back plate is
 * machined the same way — only the thickness and the button-bearing outline
 * differ, both carried by `side`/`model`.
 */
export function buildPlateStl(p: EnricoCerutiParams, model: PlateSurfaceModel, side: 'top' | 'bottom' = 'top', gridMm = 0.5): ArrayBuffer {
    const thickness = p.arching![side].thickness;
    const xMax = p.width / 2 + p.overhang + p.rib + 2;

    // The exporter scans row-major, so one station's chords serve a whole row.
    let rowY: number | null = null;
    let rowChords: StationChords | null = null;
    const zAt = (x: number, y: number): number | null => {
        if (y !== rowY) { rowY = y; rowChords = stationChordsAt(p, model, y); }
        const z = topSurfaceZAt(p, model, x, y, rowChords!);
        return z === null ? null : thickness + z;
    };

    return buildHeightFieldStl(zAt, {
        xMin: -xMax, xMax, yMin: -1, yMax: p.height + 1, gridMm, baseZ: 0,
        // Exact outline walls replace the grid staircase at the instrument boundary.
        outline: model.outerPlate.map(pt => [pt.x, pt.y] as [number, number]),
        outlineTopZ: thickness,
    });
}
