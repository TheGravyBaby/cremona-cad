import * as d3 from 'd3';
import * as polygonClipping from 'polygon-clipping';
import { Pt } from '../models/types';
// polygon-clipping ships as either an ESM default or a CJS namespace depending on bundler.
const polyClipper: any = (polygonClipping as any).default ?? polygonClipping;
import { buildPolylineIndex, clamp, closestPointToPolylineIndexed, PolylineIndex } from '../helpers/draftMath';
import { buildHeightFieldStl } from '../helpers/stlExporter';
import {
    closeProfileToBlank, pathsBounds, rotatePath180, samplePathToPolyline, translatePath,
} from '../helpers/svgPathMath';
import { ArchCurve, ArchPlate, EnricoCerutiParams } from './ceruti-types';
import { defineInsetPath, defineOuterPath } from './ceruti-paths';
import {
    buildPlateGeometry, defaultCrossArchParams, defaultFlutingParams,
    chordTrust, cornerGougeOn, cornerGougeZ, gougeAtY, CrossArchSection, crossArchSectionAt,
    longArchProfilePath, PlateGeometry, gougeProfileZ, solveLongArch,
} from './ceruti-arch-geometry';
import {
    bodyLandmarks, longArchHeightAt, normalizeCrossArchStations, STATION_MERGE_EPS_MM,
} from './ceruti-arching';

// The evaluable plate surface: a height field z(x, y) over the plan view.
//
// The channel is cut first, at constant section, and the arch runs into it and
// stops where it meets it tangentially. So a point's height is decided by which
// side of that contact it falls on:
//   inboard of the solved contact  → the station's crown, run out to its takeoff
//   outboard of it                 → the gouge's own circular section, which
//                                    flattens to 0 of its own accord at the cut's
//                                    edge, so the flat edge land needs no case
// with a second gouging pass laid over the channel side at the corners.
//
// Which measure decides "how far across" differs between the two, deliberately:
// the channel goes by true distance to the centerline loop (that is what keeps
// the cut one gouge wide the whole way round, corners included) and the arch by
// station chord. See `archedZAt`, which blends them across the handover.
//
// Heights are relative to the plate outer surface (ribHeight + top thickness);
// the channel dips negative.

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
    /** Spatial index over that loop — the corner pass's distance query runs per grid point. */
    platformOuterIdx: PolylineIndex;
    arch: ArchCurve;
    /** Absolute Z of the plate outer surface: top = ribHeight + top thickness, back = −bottom thickness. */
    zBase: number;
    /**
     * Direction the relative height field folds into absolute Z: top plate grows
     * up (+1), back grows down (−1). The field math is identical for both; only
     * the placement flips.
     */
    signZ: 1 | -1;
    /** The channel loops, the gouge, and the crown resolver — what the height field is actually built from. */
    geometry: PlateGeometry;
}

/**
 * A plate's evaluable surface.
 *
 * Everything downstream — the contour rings, the 3D wireframe, the section
 * slices, the template blanks and the STL builder — takes one of these and asks
 * it for heights. None of them reaches past this into the arching params, which
 * is what let the model underneath be replaced without any of them changing.
 */
export function buildPlateSurfaceModel(p: EnricoCerutiParams, side: 'top' | 'bottom' = 'top'): PlateSurfaceModel | null {
    const a = p.arching;
    if (!a) return null;
    const plate = a[side];
    const geometry = buildPlateGeometry(
        p,
        plate.arch,
        plate.fluting ?? defaultFlutingParams(p),
        plate.cross ?? defaultCrossArchParams(),
    );
    if (!geometry) return null;
    const platformOuter = samplePathToPolyline(defineInsetPath(p, p.outerFlutingDepth ?? 0));
    // The back plate carries the neck-root button in its outline; the top does not.
    const outerPlate = samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, side === 'bottom'));
    return {
        outerPlate,
        platformOuter,
        platformOuterIdx: buildPolylineIndex(platformOuter),
        arch: plate.arch,
        zBase: side === 'top' ? a.ribHeight + plate.thickness : -plate.thickness,
        signZ: side === 'top' ? 1 : -1,
        geometry,
    };
}

/** Per-station bounds, computed once per grid row / section slice. */
export interface StationChords {
    outerHalf: number | null;
    /** Outermost |x| of the platform outer boundary — where the flat edge land ends. */
    platformOuterHalf: number | null;
    /** Sorted x-crossings of the platform outer loop at this station (land/channel split). */
    landCrossings: number[];
    /**
     * Long-arch centerline height at this station. Hoisted because it is
     * x-independent but iterative to evaluate (catenary/cycloid inversion).
     */
    archH: number;
    /**
     * The solved transverse section here, hoisted because solving it runs a
     * root-find per side and every sample on this row shares the answer. Null
     * where the plate has no arch — the cap bands past the long arch's reach,
     * which still carry a channel.
     */
    crossSection: CrossArchSection | null;
    /** X-crossings of the channel centerline, for the inside/outside test. */
    channelCenterCrossings: number[];
}

export function stationChordsAt(p: EnricoCerutiParams, model: PlateSurfaceModel, y: number): StationChords {
    const landCrossings = polylineCrossingsAtY(model.platformOuter, y);
    return {
        outerHalf: plateHalfChordAtY(model.outerPlate, y),
        platformOuterHalf: landCrossings.length
            ? Math.max(Math.abs(landCrossings[0]), Math.abs(landCrossings[landCrossings.length - 1]))
            : null,
        landCrossings,
        archH: longArchHeightAt(p, model.arch, y),
        crossSection: crossArchSectionAt(p, model.geometry, y),
        channelCenterCrossings: polylineCrossingsAtY(model.geometry.centerPoly, y),
    };
}


/**
 * Half-width of the run of plate the centerline sits in, at station `y`; null
 * where the station line misses the loop entirely.
 *
 * Bounded by the crossings either side of x = 0 rather than by the outermost
 * crossing of all. Where the outline turns a corner it runs very nearly
 * horizontally for several mm, and a station line laid across that run clips it
 * more than once — leaving a short detached sliver out at the corner tip. The
 * outermost crossing is that sliver's far edge, which reaches the plate across
 * a gap that isn't wood.
 */
export function plateHalfChordAtY(poly: Pt[], y: number): number | null {
    const xs = polylineCrossingsAtY(poly, y);
    if (!xs.length) return null;
    const right = xs.find(x => x >= 0);
    const left = xs.filter(x => x <= 0).pop();
    // A station line that lands wholly to one side has no run around the
    // centerline to bound; the loop's own extent is the only answer available.
    return right === undefined || left === undefined
        ? Math.max(Math.abs(xs[0]), Math.abs(xs[xs.length - 1]))
        : Math.max(-left, right);
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
 * Surface height at (x, y), relative to the plate outer surface.
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
function archedZAt(
    p: EnricoCerutiParams, g: PlateGeometry, chords: StationChords,
    platformOuterIdx: PolylineIndex, x: number, y: number,
): number {
    // Signed distance from the channel centerline, positive toward the plate
    // centre. Inside the centerline loop is inward, which is the direction the
    // gouge section's own `s` runs.
    const dist = closestPointToPolylineIndexed({ x, y }, g.centerIdx).dist;
    const s = insideCrossings(x, chords.channelCenterCrossings ?? []) ? dist : -dist;

    const section = chords.crossSection;
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
    p: EnricoCerutiParams, g: PlateGeometry, chords: StationChords,
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
    if (chords.outerHalf === null || Math.abs(x) > chords.outerHalf) return null;
    return archedZAt(p, model.geometry, chords, model.platformOuterIdx, x, y);
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
    // Clamped, so an override may only ever narrow the sweep. Past the plate
    // edge there is no surface to sample and the points would simply be dropped,
    // leaving a profile whose extent silently disagreed with what was asked for.
    const half = halfOverride === undefined ? chords.outerHalf : Math.min(halfOverride, chords.outerHalf);
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

/** The vertices of a plain `M x y L x y …` polyline, exactly as written. */
function parsePolyline(path: string): Pt[] {
    return [...path.matchAll(/[ML]\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)/gi)]
        .map(m => ({ x: +m[1], y: +m[2] }));
}

/**
 * Cuts a sampled profile back to the bottom of the fluting trough at each end,
 * keeping the peak and everything between.
 *
 * What a template is for is the run from the high point to the low point, and
 * the trough is where the low point actually is. Everything outboard of it —
 * the channel's outer flank, the land beyond — is either already cut by the time
 * the template is picked up or is flat, and a flat is nothing to sight against.
 *
 * Read off the sampled surface, which is what makes this hold at the corners.
 * Placing the cut arithmetically instead — at the channel centerline's
 * half-chord plus the gouge's half-width — is right along a bout and wrong at a
 * corner, because the surface reads its transverse position there off a
 * distance field rather than off the chord (see `chordTrust`), exactly where a
 * horizontal chord stops describing the plate. An extremum has no such blind
 * spot: it is wherever the surface puts it.
 *
 * The cut therefore lands where the surface's own tangent is horizontal, which
 * is the property to check it by: a blank whose cutting edge leaves the wood at
 * a grade has not reached the trough.
 *
 * `base` and `direction` convert a sample's coordinate to height above the
 * plate surface, so "lowest" means lowest on the wood for either plate rather
 * than lowest on the canvas.
 *
 * Returns null if the profile has no interior at all.
 */
export function trimProfileToTroughs(
    profile: string, base: number, heightAxis: 'x' | 'y', direction: 1 | -1,
): string | null {
    // Read straight off the profile's own samples rather than re-sampled by arc
    // length. Both callers hand over a plain polyline, and arc-length sampling
    // would slide the cut off the vertex it identified — by a fraction of a
    // millimetre, but onto a part of the arc that is no longer its bottom.
    const pts = parsePolyline(profile);
    if (pts.length < 3) return profile;
    const h = (pt: Pt): number => direction * ((heightAxis === 'x' ? pt.x : pt.y) - base);

    // The peak first, so each trough is sought on its own side of it. A single
    // global minimum would find only the deeper of the two channels, and the
    // two are free to differ — the crown is not obliged to sit centred.
    let peak = 0;
    for (let i = 1; i < pts.length; i++) if (h(pts[i]) > h(pts[peak])) peak = i;

    // Ties resolved inward, toward the peak: a trough sampled flat across its
    // bottom then cuts at the innermost of those samples, which keeps the blank
    // to the shape it is describing rather than a fraction past it.
    let lo = 0;
    for (let i = 1; i <= peak; i++) if (h(pts[i]) <= h(pts[lo])) lo = i;
    let hi = pts.length - 1;
    for (let i = pts.length - 2; i >= peak; i--) if (h(pts[i]) <= h(pts[hi])) hi = i;

    if (lo >= hi) return null;
    return pts.slice(lo, hi + 1).map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
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
        plate?.cross?.stations as Array<{ y: number }> | undefined, p.height,
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
 * Swept the full station width and then cut back to the bottom of the fluting
 * trough at each end: crown, both run-outs, and the inner flank of each channel.
 * What the blank has to describe is the arch from its highest point to its
 * lowest, and the trough is the lowest. The channel is gouged before the arch is
 * carved, so by the time this template is picked up the trough is already there
 * to sit in.
 *
 * Not clipped at the takeoff, which is the other place this could stop: that
 * point is on a curve, and where a curve leaves a curve is exactly what the eye
 * cannot judge. The height field is continuous across it either way — arch and
 * channel are one function here — so the choice is only about what the maker
 * can line up.
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
            const swept = computeArchSectionProfile(p, model, y, 0.25);
            const profile = swept && trimProfileToTroughs(swept, model.zBase, 'y', model.signZ);
            if (!profile) return null;
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
function ensureArchPlate(p: EnricoCerutiParams, key: 'top' | 'bottom'): ArchPlate {
    const plate = p.arching![key];
    plate.fluting ??= defaultFlutingParams(p);
    plate.cross ??= defaultCrossArchParams();
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
        const plate = ensureArchPlate(p, key);
        const model = buildPlateSurfaceModel(p, key);
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
 * {@link solveLongArch} rather than at an entered edge depth, so the two
 * blanks can differ in length as well as in height — a deeper gouge takes off
 * further in.
 *
 * Both stop at the bottom of the channel trough at each cap rather than running
 * the whole body — highest point to lowest, and nothing past it.
 */
export function calculateLongArchTemplates(p: EnricoCerutiParams): TemplateShape[] {
    if (!p.arching) return [];
    const a = p.arching;
    const templates: TemplateShape[] = [];
    for (const { key, label } of TEMPLATE_SIDES) {
        const plate = ensureArchPlate(p, key);
        const gouge = plate.fluting!;
        const sign: 1 | -1 = key === 'top' ? 1 : -1;
        const zBase = key === 'top' ? a.ribHeight + plate.thickness : -plate.thickness;
        const swept = longArchProfilePath(p, gouge, solveLongArch(p, plate.arch, gouge), zBase, sign);
        const profile = trimProfileToTroughs(swept, zBase, 'x', sign);
        if (!profile) continue;
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
        // surface. A cross arch can be asymmetric: an unmirrored control point
        // or a moved crown. Mirroring then stamps the treble half onto the bass half
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
