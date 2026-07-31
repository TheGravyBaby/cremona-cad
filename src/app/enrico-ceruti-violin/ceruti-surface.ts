import * as d3 from 'd3';
import * as polygonClipping from 'polygon-clipping';
import { Pt } from '../models/types';
// polygon-clipping ships as either an ESM default or a CJS namespace depending on bundler.
const polyClipper: any = (polygonClipping as any).default ?? polygonClipping;
import { buildPolylineIndex, clamp, closestPointToPolylineIndexed, PolylineIndex } from '../helpers/draftMath';
import { buildHeightFieldStl } from '../helpers/stlExporter';
import {
    closeProfileToBlank, cycloidEdgeSlope, cycloidZAt, flutingProfileZ, pathsBounds, rotatePath180, samplePathToPolyline, translatePath,
    crossArchSplineZAt, crossArchSplineEdgeSlope,
} from '../helpers/svgPathMath';
import { ArchCurve, ArchPlate, EnricoCerutiParams } from './ceruti-types';
import { defineFlutingPath, defineInsetPath, defineOuterPath } from './ceruti-paths';
import {
    buildGougedPlateGeometry, defaultGougedCrossParams, defaultGougedFlutingParams,
    chordTrust, cornerGougeOn, cornerGougeZ, gougeAtY, GougedCrossSection, gougedCrossSectionAt,
    gougedLongArchProfilePath, GougedPlateGeometry, gougeProfileZ, solveGougedLongArch,
} from './ceruti-gouged';
import {
    bodyLandmarks, CrossArchAtY, CrossArchQuery, defaultCrossArchParams, defaultFlutingChannelParams,
    flutingHalfWidthAtY, longArchHeightAt, makeCrossArchAtY, normalizeCrossArchStations,
    STATION_MERGE_EPS_MM,
} from './ceruti-arching';

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
     * The plate edge as a sampled closed loop. Chords come from this polyline,
     * not the offset arcs — the corner tips are cubic Béziers that arc-only
     * queries miss entirely.
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
    /**
     * Cross-arch shape at a body station, cycloid sides or a spline profile
     * depending on the plate's curve type. A constant function unless the
     * plate has stations set.
     */
    crossAt: CrossArchAtY;
    edgeDepth: number;
    /** Flat pre-channel platform with a ledge at the inner boundary instead of a carved channel. */
    flatPlatform: boolean;
    /** Absolute Z of the plate outer surface: top = ribHeight + top thickness, back = −bottom thickness. */
    zBase: number;
    /**
     * Direction the relative height field folds into absolute Z: top plate grows
     * up (+1), back grows down (−1). The field math is identical for both; only
     * the placement flips.
     */
    signZ: 1 | -1;
    /**
     * Gouged-model geometry. Present only on models from
     * {@link buildGougedPlateSurfaceModel}; absent means the classic model, and
     * every field above then behaves exactly as it always has.
     *
     * When present it takes over the height field entirely — the classic
     * `crossAt`/`edgeDepth`/`flutingInner` route is not consulted at all. The
     * two models describe the same instrument through opposite dependencies, so
     * mixing them would be meaningless.
     */
    gouged?: GougedPlateGeometry;
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
        crossAt: makeCrossArchAtY(plate.cross ?? defaultCrossArchParams(), p.height),
        edgeDepth: plate.edgeDepth ?? 0,
        flatPlatform: fluting.flatPlatform ?? false,
        zBase: side === 'top' ? a.ribHeight + plate.thickness : -plate.thickness,
        signZ: side === 'top' ? 1 : -1,
    };
}

/**
 * The same plate under the gouged model — a classic model with a `gouged` block
 * attached, which is what lets every consumer downstream take it unchanged.
 * The contour rings, the 3D wireframe, the section slices and the STL builder
 * all take a {@link PlateSurfaceModel} and ask it for heights; none of them
 * needs to know which model produced them.
 *
 * Deliberately a *separate entry point*. {@link buildPlateSurfaceModel} keeps
 * returning the classic surface whatever a recipe carries, so the exports and
 * the physical templates stay on known-good geometry until it is settled which
 * model survives. Only the gouged panels call this one.
 */
export function buildGougedPlateSurfaceModel(p: EnricoCerutiParams, side: 'top' | 'bottom' = 'top'): PlateSurfaceModel | null {
    const model = buildPlateSurfaceModel(p, side);
    if (!model) return null;
    const plate = p.arching![side];
    const gouged = buildGougedPlateGeometry(
        p,
        plate.arch,
        plate.gougedFluting ?? defaultGougedFlutingParams(p),
        plate.gougedCross ?? defaultGougedCrossParams(),
    );
    return gouged ? { ...model, gouged } : null;
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
     * Long-arch centerline height at this station. Hoisted because it is
     * x-independent but iterative to evaluate (catenary/cycloid inversion).
     */
    archH: number;
    /** Cross-arch shape at this station — hoisted for the same reason as archH. */
    cross: CrossArchQuery;
    /**
     * Gouged model only: the solved transverse section here, hoisted because
     * solving it runs a root-find per side and every sample on this row shares
     * the answer. Null on classic models, or where the plate has no arch here.
     */
    gougedSection?: GougedCrossSection | null;
    /** Gouged model only: x-crossings of the channel centerline, for the inside/outside test. */
    gougedCenterCrossings?: number[];
}

/**
 * The fluting inner half-chord at station `y`. Arc-exact when available — the
 * same query the cross arch spans, so the channel meets the takeoff point by
 * construction. Falls back to the sampled polyline at corner-band stations,
 * where the arc-only query misses the cubic Bézier tips and callers would
 * otherwise mistake them for cap stations.
 */
function flutingInnerHalfAt(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number): number | null {
    return flutingHalfWidthAtY(p, y)
        ?? (model.flutingInner ? maxAbsCrossingAtY(model.flutingInner, y) : null);
}

/**
 * Cross-arch trochoid height (relative to the plate outer surface) at width x,
 * for a station whose fluting inner half-chord is `fi`, long-arch centerline
 * height is `archH`, and cross-arch shape is `cross`. The takeoff sits at
 * −edgeDepth; a degenerate cap station (no arch height) stays flat there.
 */
function crossArchZAt(model: PlateSurfaceModel, fi: number, archH: number, x: number, cross: CrossArchQuery): number {
    if (archH <= 0) return -model.edgeDepth;
    const hEff = archH + model.edgeDepth;
    if (cross.type === 'spline') return -model.edgeDepth + crossArchSplineZAt(cross.row.zFracGrid, hEff, fi, x);
    const side = x < 0 ? cross.sides.left : cross.sides.right;
    return -model.edgeDepth + cycloidZAt(hEff, 2 * fi, side.d, x + fi, side.pct);
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
        cross: model.crossAt(y),
        gougedSection: model.gouged ? gougedCrossSectionAt(p, model.gouged, y) : null,
        gougedCenterCrossings: model.gouged ? polylineCrossingsAtY(model.gouged.centerPoly, y) : undefined,
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
 * The cross-arch's own edge slope at a station — the fallback for where the
 * directional probe can't land a clean arch sample. Same hEff/span the arch
 * branch builds its cycloid from; 0 at cap/degenerate stations.
 */
function crossEdgeSlopeFallback(
    model: PlateSurfaceModel, fi: number | null, archH: number, cross: CrossArchQuery, atLeft: boolean,
): number {
    if (fi === null || fi <= 0 || archH <= 0) return 0;
    const hEff = archH + model.edgeDepth;
    if (cross.type === 'spline') {
        return crossArchSplineEdgeSlope(atLeft ? cross.row.leftEdgeSlopeFrac : cross.row.rightEdgeSlopeFrac, hEff, fi);
    }
    const side = atLeft ? cross.sides.left : cross.sides.right;
    return cycloidEdgeSlope(hEff, 2 * fi, side.d, side.pct);
}

/**
 * The arch-region surface height at (x, y), or null when (x, y) isn't under the
 * arch (channel/land/off-body). Resolves the cross-arch shape at its own y
 * rather than taking a station's — the slope probe steps off the station row.
 */
function archSampleZAt(p: EnricoCerutiParams, model: PlateSurfaceModel, x: number, y: number): number | null {
    const fi = flutingInnerHalfAt(p, model, y);
    if (fi === null || Math.abs(x) > fi) return null;
    return crossArchZAt(model, fi, longArchHeightAt(p, model.arch, y), x, model.crossAt(y));
}

/**
 * The arch surface's slope at the fluting inner boundary, measured along the
 * boundary's inward normal — the slope the channel's gouge arc must be tangent
 * to so it meets the arch tangentially in 3D. Picks up both the cross (∂x) and
 * long (∂y) contributions at once, so it blends around the corners seamlessly.
 *
 * Two wrinkles. The probe direction is `innerPt − queryPt` (the loop's inward
 * normal by the nearest-point property), which still points into the arch at the
 * high-curvature caps where an inter-loop chord would skew and miss. And the
 * finite difference is taken between two points *inside* the arch (ε and 2ε past
 * the boundary), never the boundary itself — the arch sits at −edgeDepth on the
 * boundary but rises from 0 just inside, so a boundary-anchored difference would
 * fold that takeoff step into the slope.
 *
 * Null when a probe steps outside the arch region; the caller falls back to the
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
 * Gouged-model surface height at (x, y), relative to the plate outer surface.
 *
 * Two measures, deliberately. The **channel** is measured by true distance to
 * the centerline loop, not by the station chord — that is what makes the cut
 * exactly one gouge wide the whole way round, corners included, which is the
 * property the model exists to demonstrate. The **arch** is per-station, since
 * a crown is a chord-wise shape and its knots are fractions of the station's
 * own half-width.
 *
 * They meet where the distance equals the solved contact. On the flanks the two
 * measures agree to floating point; at a tight corner they differ by the usual
 * offset-times-curvature term, which shows up as a small disagreement about
 * exactly where the arch hands over — never as a step, since both sides
 * evaluate the same channel there.
 */
function gougedZAt(
    p: EnricoCerutiParams, g: GougedPlateGeometry, chords: StationChords,
    platformOuterIdx: PolylineIndex, x: number, y: number,
): number {
    // Signed distance from the channel centerline, positive toward the plate
    // centre. Inside the centerline loop is inward, which is the direction the
    // gouge section's own `s` runs.
    const dist = closestPointToPolylineIndexed({ x, y }, g.centerIdx).dist;
    const s = insideCrossings(x, chords.gougedCenterCrossings ?? []) ? dist : -dist;

    const section = chords.gougedSection;
    if (section) {
        const contact = (x < 0 ? section.left : section.right)?.contactS ?? section.halfWidth;
        if (s >= contact) {
            // Two ways to say "how far across the arch am I", each right in one
            // place and wrong in the other, blended between.
            //
            // By *distance* the handover is exact: at the contact contour the
            // arch is at its takeoff, which is precisely what the channel
            // branch returns there. Measured by chord it is not, because chord
            // and distance disagree wherever the centerline is tilted, and the
            // surface steps.
            //
            // But a distance field carries a medial axis — the locus where the
            // nearest channel point jumps from one part of the loop to another,
            // across which its gradient is discontinuous. Driving the arch with
            // it all the way in stamps that skeleton into the surface as
            // creases: a spine down the plate with branches toward the corners.
            // Chord position has no such structure.
            //
            // So: distance at the handover, chord by the time we are a third of
            // the way in, smoothstepped between.
            //
            // Scheduling that on the *distance* is load-bearing and cannot be
            // swapped for the chord, tempting though it looks. Near the caps the
            // channel wraps across the body, so the handover happens *at the
            // joint* — where the chord reads 1, "all the way in". Weighting by
            // chord there would hand back the crown height at the very point the
            // surface has to equal the takeoff, and the arch would part company
            // with its channel by a tenth of a millimetre all round both caps.
            //
            // The price is that the arch is driven by distance in the cap bands,
            // and distance cannot tell the two sides of the joint apart: the
            // return below picks a flank by the sign of x, and the two flanks of
            // an asymmetric crown disagree. That is a step down the joint —
            // which is why the weight is {@link chordTrust}, the same curve the
            // crown-offset taper is scaled by. The crown is centred wherever
            // this leans on distance, so there the two flanks agree and the sign
            // of x stops mattering. Change one and the other must follow, so
            // they are one function.
            const xEnd = x < 0 ? section.xEndLeft : section.xEndRight;
            const span = section.centerHalf - contact;
            const tDist = span > 1e-9 ? clamp((s - contact) / span, 0, 1) : 1;
            const tChord = xEnd > 1e-9 ? clamp(1 - Math.abs(x) / xEnd, 0, 1) : 1;
            const w = chordTrust(tDist);
            const t = (1 - w) * tDist + w * tChord;
            return section.zAt((x < 0 ? -1 : 1) * xEnd * (1 - t));
        }
        // Channel, then flat land beyond it — gougeProfileZ already flattens to
        // 0 once past the cut's own edge, so the land needs no separate case.
        return withCornerPass(p, g, chords, platformOuterIdx, x, y, s, gougeProfileZ(s, section.sweepRadius, g.gouge.depth));
    }

    // Past the long arch's reach — the cap bands beyond where it met the
    // channel — there is no crown to solve against. The channel still runs
    // through, though: it is cut before any arching exists, which is the whole
    // premise. Falling back to flat here would erase it across both caps.
    const capZ = gougeProfileZ(s, gougeAtY(p, g.gouge, y).sweepRadius, g.gouge.depth);
    return withCornerPass(p, g, chords, platformOuterIdx, x, y, s, capZ);
}

/**
 * The corner pass applied over whatever the channel left — the second gouging,
 * run to meet a channel that is already established.
 *
 * Called only from the two channel-side returns above, never from the arch
 * branch, and that placement is the whole guarantee. A maker gouging corners
 * does take wood out of the channel where the two meet, but they are not
 * re-cutting the arch, and neither is this: the takeoff, the tangency solve and
 * every station's section are decided before it runs and cannot be moved by it.
 * A `Math.min` here can only deepen, and only outboard of the contact.
 *
 * Outside the platform boundary is the flat edge land, which is not gouged at
 * all — hence the crossings test rather than a bare distance.
 */
function withCornerPass(
    p: EnricoCerutiParams, g: GougedPlateGeometry, chords: StationChords,
    platformOuterIdx: PolylineIndex, x: number, y: number, s: number, z: number,
): number {
    if (!cornerGougeOn(g.gouge)) return z;
    if (!insideCrossings(x, chords.landCrossings)) return z;
    const { sweepRadius, halfWidth } = gougeAtY(p, g.gouge, y);
    const edgeDist = closestPointToPolylineIndexed({ x, y }, platformOuterIdx).dist;
    // Nothing this far in is reachable by the pass however wide the wedge gets,
    // and that is most of the plate — so the arithmetic below runs only near the
    // edge, where it means something.
    if (edgeDist > 2 * halfWidth + g.cornerWedgeMax) return z;
    // How much wider than one gouge the gap is *here*: distance to the boundary
    // plus distance outboard of the channel's own outer edge, which is −(s + w).
    // Identically zero along the flanks, where the boundary and that edge are
    // the same curve — so the extra passes appear only where wood is left.
    // Clamped to the plate's own maximum so no local estimate can run away.
    const wedge = clamp(edgeDist - halfWidth - s, 0, g.cornerWedgeMax);
    return Math.min(z, cornerGougeZ(edgeDist, sweepRadius, g.gouge.depth, wedge));
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

    if (model.gouged) return gougedZAt(p, model.gouged, chords, model.platformOuterIdx, x, y);

    const fi = chords.flutingInnerHalf;
    if (fi !== null && ax <= fi) return crossArchZAt(model, fi, chords.archH, x, chords.cross);

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
        ?? crossEdgeSlopeFallback(model, fi, chords.archH, chords.cross, x < 0);
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
 * The long-arch section's fluting recurve at both body ends, sampled straight
 * from the plate surface along the centerline (x = 0), so the panel's channel is
 * exactly what the 3D surface carries with no separate slope reconstruction to
 * drift from it.
 *
 * Long-arch section coordinates (canvas X = plate depth Z, canvas Y = body
 * length) — the transpose of {@link calculateFlutingSectionTop}. Null when no
 * channel band exists.
 */
export function calculateLongArchSectionFluting(
    p: EnricoCerutiParams, model: PlateSurfaceModel,
): { startPath: string; endPath: string } | null {
    const inner = p.innerFlutingDepth ?? 0;
    const outer = p.outerFlutingDepth ?? 0;
    if (inner - outer <= 0) return null;

    // Walk the centerline from the platform outer boundary (land, z = 0) in to the
    // fluting inner boundary (arch takeoff, z = −edgeDepth); topSurfaceZAt classifies
    // each point, so the recurve between them is the real carved channel.
    const sampleBand = (yOuter: number, yInner: number): string => {
        const n = Math.max(8, Math.ceil(Math.abs(yInner - yOuter) / 0.25));
        const pts: string[] = [];
        for (let i = 0; i <= n; i++) {
            const y = yOuter + ((yInner - yOuter) * i) / n;
            const z = topSurfaceZAt(p, model, 0, y);
            if (z === null) continue;
            pts.push(`${pts.length === 0 ? 'M' : 'L'} ${model.zBase + model.signZ * z} ${y}`);
        }
        return pts.join(' ');
    };

    return {
        startPath: sampleBand(outer, inner),
        endPath: sampleBand(p.height - outer, p.height - inner),
    };
}

/**
 * Full-width surface profile at station `y` — arch hump, fluting channel, and
 * flat edge land in one continuous sweep from edge to edge, in absolute (x, Z)
 * coordinates. Unlike {@link calculateFlutingSectionTop}, which traces only the
 * channel/land portion, this sweeps the whole half-width in one pass.
 *
 * `halfOverride` stops the sweep short of the full outer edge.
 */
export function computeArchSectionProfile(
    p: EnricoCerutiParams, model: PlateSurfaceModel, y: number, stepMm = 0.25, halfOverride?: number,
): string | null {
    const chords = stationChordsAt(p, model, y);
    if (chords.outerHalf === null) return null;
    const half = halfOverride ?? chords.outerHalf;
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

/** A body position to cut a cross-arch template at, and what to call the blank. */
export interface TemplateStation {
    y: number;
    /** Landmark code (`LB`…`UB`), or empty for a station the maker set themselves. */
    code: string;
}

/**
 * Where a plate gets cross-arch templates: the five body landmarks, plus any
 * station the maker actually set that isn't already one of them.
 *
 * The landmarks are the set because they are what a section is sighted against
 * — the same five the station slider marks, from the same {@link bodyLandmarks},
 * so a tick and a blank cannot disagree about where the waist is. They are
 * unconditional: a plate's shape is judged at its widest points and its corners
 * whether or not the maker chose to author a station there.
 *
 * An authored station is a deliberate statement about the shape, so it gets its
 * own blank too — unless it lands on a landmark, where it would be the same
 * template cut twice. `STATION_MERGE_EPS_MM` is the same tolerance the station
 * list itself dedupes with, so "on" means here what it means there.
 */
export function crossArchTemplateStations(p: EnricoCerutiParams, plate?: ArchPlate): TemplateStation[] {
    const landmarks: TemplateStation[] = bodyLandmarks(p).map(m => ({ y: m.y, code: m.code }));
    const authored = normalizeCrossArchStations(
        plate?.gougedCross?.stations as Array<{ y: number }> | undefined, p.height,
    )
        .map(s => Math.round(s.y))
        .filter(y => !landmarks.some(m => Math.abs(m.y - y) <= STATION_MERGE_EPS_MM))
        .map((y): TemplateStation => ({ y, code: '' }));
    return [...landmarks, ...authored].sort((a, b) => a.y - b.y);
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
 * The cross-arch template blanks for one plate side, one per station.
 *
 * Swept to the full plate edge, not clipped back to the arch's dome. Under this
 * model the channel is gouged first and the arch is carved down to meet it, so
 * by the time a maker holds this template to the wood the channel and the flat
 * land are already there — and they are what the blank registers against. A
 * template that stopped at the takeoff would have to be positioned against a
 * point on a curve, which is exactly the thing the eye cannot judge. The height
 * field runs continuously from centerline to plate edge here, so nothing has to
 * be stitched on to reach it.
 *
 * `model.signZ` picks which side of the cutout curve the backing attaches to —
 * the two plates' mirrored curves are shaped oppositely (valley vs. hump), so
 * they need opposite backing sides to both come out thin at the peak.
 */
function calculateCrossArchTemplatesForSide(
    p: EnricoCerutiParams, model: PlateSurfaceModel, sideLabel: string, stations: TemplateStation[],
): TemplateShape[] {
    return stations
        .map(({ y, code }): TemplateShape | null => {
            const profile = computeArchSectionProfile(p, model, y, 0.25);
            if (profile === null) return null;
            const { path, backing, positionMid } = closeProfileToBlank(profile, 'y', model.signZ, TEMPLATE_MARGIN);
            return {
                path,
                label: `${sideLabel} ${code ? `${code} ` : ''}${Math.round(y)}mm`,
                labelPos: { x: positionMid, y: backing + model.signZ * TEMPLATE_MARGIN / 2 },
                labelRotation: 0,
            };
        })
        .filter((shape): shape is TemplateShape => shape !== null);
}

/**
 * Rotates a template blank 180° about the origin, re-orienting which edge faces
 * "up" for presentation. A rotation, not a mirror: it preserves concavity, so
 * the cutout curve keeps its correct hand. `labelRotation` is untouched — text
 * renders upright regardless of the shape's rotation.
 */
function rotateTemplateShape180(shape: TemplateShape): TemplateShape {
    return {
        ...shape,
        path: rotatePath180(shape.path),
        labelPos: { x: -shape.labelPos.x, y: -shape.labelPos.y },
    };
}

/** The two plates, back first — the order the blanks stack in on the sheet. */
const TEMPLATE_SIDES: Array<{ key: 'top' | 'bottom'; label: string }> =
    [{ key: 'bottom', label: 'Back' }, { key: 'top', label: 'Top' }];

/** A plate's gouge and crown, seeded if the maker hasn't been into those panels yet. */
function ensureGougedPlate(p: EnricoCerutiParams, key: 'top' | 'bottom'): ArchPlate {
    const plate = p.arching![key];
    plate.gougedFluting ??= defaultGougedFlutingParams(p);
    plate.gougedCross ??= defaultGougedCrossParams();
    return plate;
}

/**
 * Cross-arch template blanks for both plates, stacked into one non-overlapping
 * layout. Both plates present with the flat backing edge up; the top plate's
 * naturally lands at the bottom, so its blanks are rotated 180° after the fact.
 *
 * Each plate is cut at its own stations — the landmarks both share, plus
 * whatever either has been given of its own — so a back with three extra
 * stations doesn't force three blank duplicates onto the top.
 */
export function calculateCrossArchTemplates(p: EnricoCerutiParams): TemplateShape[] {
    if (!p.arching) return [];
    const templates = TEMPLATE_SIDES.flatMap(({ key, label }) => {
        const plate = ensureGougedPlate(p, key);
        const model = buildGougedPlateSurfaceModel(p, key);
        if (!model) return [];
        const shapes = calculateCrossArchTemplatesForSide(p, model, label, crossArchTemplateStations(p, plate));
        return key === 'top' ? shapes.map(rotateTemplateShape180) : shapes;
    });
    return stackTemplates(templates);
}

/**
 * The two long-arch template blanks (top, back), traced from each plate's
 * centerline elevation and placed side by side. Labels run rotated 90° along
 * the strip's length. Both present with the flat backing edge on the left, so
 * the back plate's blank is rotated 180° after the fact.
 *
 * Each plate's arch is terminated against its own channel by
 * {@link solveGougedLongArch} rather than at an entered edge depth, so the two
 * blanks can differ in length as well as in height — a deeper gouge takes off
 * further in. Both run the full body length regardless, including the flat land
 * at the caps that the template seats on.
 */
export function calculateLongArchTemplates(p: EnricoCerutiParams): TemplateShape[] {
    if (!p.arching) return [];
    const a = p.arching;
    const templates: TemplateShape[] = [];
    for (const { key, label } of TEMPLATE_SIDES) {
        const plate = ensureGougedPlate(p, key);
        const gouge = plate.gougedFluting!;
        const sign: 1 | -1 = key === 'top' ? 1 : -1;
        const zBase = key === 'top' ? a.ribHeight + plate.thickness : -plate.thickness;
        const profile = gougedLongArchProfilePath(
            p, gouge, solveGougedLongArch(p, plate.arch, gouge), zBase, sign,
        );
        const { path, backing, positionMid } = closeProfileToBlank(profile, 'x', sign, TEMPLATE_MARGIN);
        const shape: TemplateShape = {
            path,
            label: `${label} Long`,
            labelPos: { x: backing + sign * TEMPLATE_MARGIN / 2, y: positionMid },
            labelRotation: 90,
        };
        templates.push(key === 'bottom' ? rotateTemplateShape180(shape) : shape);
    }
    return rowTemplates(templates);
}

/** One contour level's rings in local plate (x, y) coordinates — no canvas offset applied. */
export interface ArchContourLevel {
    level: number;
    rings: [number, number][][];
}

/**
 * The expensive, rotation-independent part shared by both consumers: builds the
 * height-field grid, runs marching squares, and clips every ring to the exact
 * instrument outline. Returns local plate coordinates so callers can either
 * flatten to a plan-view path or project each ring through a rotation.
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
        // Both halves, evaluated. The *outline* is x-symmetric, and this used to
        // sample x ≥ 0 and mirror on that basis — but the outline is not the
        // surface. A cross arch can be asymmetric in either model: an unmirrored
        // control point, a moved crown, or the classic model's own left/right
        // cycloid pair. Mirroring then stamps the treble half onto the bass half
        // and leaves a seam down the joint where the two copies meet, which is
        // not in the height field at all — only in the picture of it. The saving
        // was half the samples on a grid that is already cached per recipe.
        for (let i = 0; i < nx; i++) {
            const x = -xMax + i * gridMm;
            const z = topSurfaceZAt(p, model, x, y, chords);
            posVals[j * nx + i] = z ?? -1e6;
            negVals[j * nx + i] = z ?? 1e6;
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
 * Contour (topo) map of the plate surface: level curves every `stepMm` of
 * height, returned as plan-view path strings translated by `xOffset`/`yOffset`
 * so two plates' maps can sit side by side on one canvas. The level curves
 * themselves are plate-agnostic — only the offset differs between top and back.
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
 * outline. Coordinates in mm, x/y as in plan view. Both plates machine the same
 * way — only thickness and the button-bearing outline differ.
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
