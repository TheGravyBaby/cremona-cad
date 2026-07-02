import * as d3 from 'd3';
import { Pt } from '../models/types';
import { distPointToPolyline } from '../helpers/draftMath';
import { buildHeightFieldStl } from '../helpers/stlExporter';
import { cycloidZAt, flutingProfileZ, samplePathToPolyline } from '../helpers/svgPathMath';
import { ArchCurve, EnricoCerutiParams } from './ceruti-types';
import {
    defaultCrossArchParams, defaultFlutingChannelParams, defineFlutingPath, defineInsetPath,
    defineOuterPath, flutingHalfWidthAtY, longArchHeightAt, resolveTroughU,
} from './ceruti-calcs';

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

/** Precomputed geometry for evaluating the top-plate height field. Rebuild on param change, reuse across queries. */
export interface TopSurfaceModel {
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
    arch: ArchCurve;
    crossD: number;
    edgeDepth: number;
    channelDepth: number;
    troughU: number;
    /** Absolute Z of the plate outer surface (ribHeight + top thickness). */
    zBase: number;
}

export function buildTopSurfaceModel(p: EnricoCerutiParams): TopSurfaceModel | null {
    const a = p.arching;
    if (!a) return null;
    const fluting = a.top.fluting ?? defaultFlutingChannelParams();
    const innerPath = defineFlutingPath(p, p.innerFlutingDepth ?? 0);
    return {
        outerPlate: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, false)),
        platformOuter: samplePathToPolyline(defineInsetPath(p, p.outerFlutingDepth ?? 0)),
        flutingInner: innerPath ? samplePathToPolyline(innerPath) : null,
        arch: a.top.arch,
        crossD: a.top.cross?.d ?? defaultCrossArchParams().d,
        edgeDepth: a.top.edgeDepth ?? 0,
        channelDepth: fluting.channelDepth,
        troughU: resolveTroughU(p, fluting),
        zBase: a.ribHeight + a.top.thickness,
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
}

export function stationChordsAt(p: EnricoCerutiParams, model: TopSurfaceModel, y: number): StationChords {
    const landCrossings = polylineCrossingsAtY(model.platformOuter, y);
    return {
        outerHalf: maxAbsCrossingAtY(model.outerPlate, y),
        platformOuterHalf: landCrossings.length
            ? Math.max(Math.abs(landCrossings[0]), Math.abs(landCrossings[landCrossings.length - 1]))
            : null,
        // Arc-exact on purpose: this is the same query the cross arch spans,
        // so the channel meets the takeoff point by construction.
        flutingInnerHalf: flutingHalfWidthAtY(p, y),
        landCrossings,
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
export function topSurfaceZAt(p: EnricoCerutiParams, model: TopSurfaceModel, x: number, y: number, chords?: StationChords): number | null {
    chords ??= stationChordsAt(p, model, y);
    const ax = Math.abs(x);
    if (chords.outerHalf === null || ax > chords.outerHalf) return null;

    const fi = chords.flutingInnerHalf;
    if (fi !== null && ax <= fi) {
        const h = longArchHeightAt(p, model.arch, y);
        // Degenerate cap station: an inner chord with no arch height stays flat at the sunken takeoff.
        if (h <= 0) return -model.edgeDepth;
        return -model.edgeDepth + cycloidZAt(h + model.edgeDepth, 2 * fi, model.crossD, x + fi);
    }

    if (!insideCrossings(x, chords.landCrossings)) return 0; // flat edge land
    if (!model.flutingInner) return 0; // fluting unconfigured — platform stays flat

    const pt = { x, y };
    const dOut = distPointToPolyline(pt, model.platformOuter);
    const dIn = distPointToPolyline(pt, model.flutingInner);
    const u = dOut + dIn > 0 ? dOut / (dOut + dIn) : 0;
    return flutingProfileZ(u, model.channelDepth, model.troughU, model.edgeDepth);
}

/**
 * The carved fluting profile across the station, sampled from the height field
 * so the section view and the 3D surface always agree — one polyline per side
 * from the fluting inner chord out to the platform outer chord, in section
 * coordinates (canvas X = violin X, canvas Y = absolute Z). At cap stations
 * (no inner chord) the channel spans the body in a single curve.
 */
export function calculateFlutingSectionTop(p: EnricoCerutiParams, model: TopSurfaceModel, y: number): string | null {
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
            pts.push(`${pts.length === 0 ? 'M' : 'L'} ${x} ${model.zBase + z}`);
        }
        return pts.join(' ');
    };

    if (fi === null || fi <= 0) return sampleSide(-fo, fo);
    return `${sampleSide(-fo, -fi)} ${sampleSide(fi, fo)}`;
}

/**
 * Contour (topo) map of the top surface: level curves every `stepMm` of height
 * relative to the plate outer surface, computed on a `gridMm` plan grid via
 * d3-contour (marching squares). Returns plan-view path strings translated by
 * `yOffset` so the map can stack above the section view on the same canvas.
 *
 * Out-of-outline grid cells are padded below every positive threshold but
 * above every non-positive one: positive levels close naturally at the
 * outline, while channel levels (≤ 0) ring the trough band instead of
 * uselessly tracing the outline.
 */
export function computeArchContours(
    p: EnricoCerutiParams,
    model: TopSurfaceModel,
    stepMm = 1,
    gridMm = 1,
    yOffset = 0,
): { level: number; path: string }[] {
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

    const levels: number[] = [];
    for (let k = Math.ceil(zMin / stepMm); k * stepMm <= zMax; k++) levels.push(k * stepMm);

    const generator = d3.contours().size([nx, ny]).smooth(true);
    const toPath = (rings: number[][][][]): string =>
        rings.flat().map(ring =>
            ring.map(([cx, cy], idx) =>
                `${idx === 0 ? 'M' : 'L'} ${(-xMax + cx * gridMm).toFixed(2)} ${(yMin + cy * gridMm + yOffset).toFixed(2)}`
            ).join(' ') + ' Z'
        ).join(' ');

    const out: { level: number; path: string }[] = [];
    for (const level of levels) {
        const multi = generator.contour(level > 0 ? (posVals as any) : (negVals as any), level);
        const path = toPath(multi.coordinates as any);
        if (path.trim().length > 0) out.push({ level, path });
    }
    return out;
}

/**
 * Binary STL of the top plate as machined: the height-field surface on top,
 * flat base at z = 0 (the blank's gluing face on the CNC bed), vertical skirt
 * at the outline. Coordinates in mm, x/y as in plan view.
 */
export function buildTopPlateStl(p: EnricoCerutiParams, model: TopSurfaceModel, gridMm = 0.5): ArrayBuffer {
    const thickness = p.arching!.top.thickness;
    const xMax = p.width / 2 + p.overhang + p.rib + 2;

    // The exporter scans row-major, so one station's chords serve a whole row.
    let rowY: number | null = null;
    let rowChords: StationChords | null = null;
    const zAt = (x: number, y: number): number | null => {
        if (y !== rowY) { rowY = y; rowChords = stationChordsAt(p, model, y); }
        const z = topSurfaceZAt(p, model, x, y, rowChords!);
        return z === null ? null : thickness + z;
    };

    return buildHeightFieldStl(zAt, { xMin: -xMax, xMax, yMin: -1, yMax: p.height + 1, gridMm, baseZ: 0 });
}
