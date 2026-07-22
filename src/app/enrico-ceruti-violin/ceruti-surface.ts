import * as d3 from 'd3';
import * as polygonClipping from 'polygon-clipping';
import { Pt } from '../models/types';
// polygon-clipping ships as either an ESM default or a CJS namespace depending on bundler.
const polyClipper: any = (polygonClipping as any).default ?? polygonClipping;
import { buildPolylineIndex, distPointToPolylineIndexed, PolylineIndex } from '../helpers/draftMath';
import { buildHeightFieldStl } from '../helpers/stlExporter';
import { cycloidEdgeSlope, cycloidZAt, flutingProfileZ, samplePathToPolyline } from '../helpers/svgPathMath';
import { ArchCurve, EnricoCerutiParams } from './ceruti-types';
import { defineFlutingPath, defineInsetPath, defineOuterPath } from './ceruti-paths';
import { defaultCrossArchParams, defaultFlutingChannelParams, flutingHalfWidthAtY, longArchHeightAt } from './ceruti-arching';

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

export function stationChordsAt(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number): StationChords {
    const landCrossings = polylineCrossingsAtY(model.platformOuter, y);
    // Arc-exact when available: same query the cross arch spans, so the channel meets the
    // takeoff point by construction. Falls back to the sampled polyline at corner-band
    // stations where the arc-only query misses the cubic Bézier tips — without this,
    // calculateFlutingSectionTop would treat those stations as cap stations and sweep a
    // full-width channel profile over the arch region, creating strange shapes.
    const flutingInnerHalf = flutingHalfWidthAtY(p, y)
        ?? (model.flutingInner ? maxAbsCrossingAtY(model.flutingInner, y) : null);
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
    if (fi !== null && ax <= fi) {
        const h = chords.archH;
        // Degenerate cap station: an inner chord with no arch height stays flat at the sunken takeoff.
        if (h <= 0) return -model.edgeDepth;
        return -model.edgeDepth + cycloidZAt(h + model.edgeDepth, 2 * fi, model.crossD, x + fi, model.crossPct);
    }

    if (!insideCrossings(x, chords.landCrossings)) return 0; // flat edge land
    if (!model.flutingInner) return 0; // fluting unconfigured — platform stays flat

    const pt = { x, y };
    const dOut = distPointToPolylineIndexed(pt, model.platformOuterIdx);
    const dIn = distPointToPolylineIndexed(pt, model.flutingInnerIdx!);
    const width = dOut + dIn;
    const u = width > 0 ? dOut / width : 0;
    // Same hEff/span the arch branch above builds its cycloid from, so the
    // channel's target slope always matches what's actually taking off at fi.
    const slope = fi !== null && fi > 0 && chords.archH > 0
        ? cycloidEdgeSlope(chords.archH + model.edgeDepth, 2 * fi, model.crossD, model.crossPct)
        : 0;
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
