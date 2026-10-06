import { circleCircleIntersections, findJoiningArcs } from "../helpers/math/draftMath";
import { angleFromCenter, dist, normalizeRadians, pointOnCircle, TURN, offsetArcRadius, flipArcAboutY, flipPointAboutY, lineCircleIntersection, lineFromTwoPoints, pointInPolygon, closestPointOnSegment, moveInVectorSpace, pointAtDistanceToward, vectorFromSlope } from "../helpers/math/simpleGeometry";
import { arcPathData, pathFromArc, pathFromLine, pathFromCornerCubic, unifyConnectedSvgPaths, unifyConnectedSvgPathGroups, combinePathStrings, samplePathToPolyline, occludePath, pathFromPolygon, Matrix2D, transformPath } from "../helpers/math/pathMath";
import { Arc, arcFromCircle, Pt } from "../models/types";
import { error } from "../shared/message-emitter";
import { ButtonParams, EnricoCerutiParams } from "./ceruti-types";

// ===== Path/contour builders =====
// Takes the outline already solved by ceruti-calcs.ts (calculateMainBouts,
// calculateCorners, calculateCenterBout, calculateOuterArcs) and stitches it
// into the actual SVG path strings the app draws or exports: inner trace,
// outer trace, insets, purfling, fluting; the scroll's side profile, and the
// instrument's front profile with the neck laid over the body. Split out of ceruti-calcs.ts because
// "where do the arcs go" and "how do you turn solved arcs into a path string"
// are different questions a reader is usually asking one at a time.

// C1 and C2 normally curl the same way as C0, their centres outside the body. When a corner sits
// outside C0's circle the solve wraps its arc around C0 instead (a Prescott-style S into the
// corner), the centre lands inside the body, and every outward offset of it changes sign. C11 and
// C21 sit inside their arc and curl with it, so they take the same sign
export function cornerOffsetSign(p: EnricoCerutiParams, key: 'C1' | 'C2'): 1 | -1 {
    return dist(p.bouts[key]!, p.bouts.C0!) > p.bouts.C0!.r ? 1 : -1;
}

/**
 * The viol neck's top face meets the V0 sweep through a join arc of radius `viol.neckRadius`,
 * and the offset of that join at distance d is the same arc at radius R + d.
 *
 * `calculateMainBouts` seats V0 against the join rather than against the face, so V0.start is
 * already the tangency and needs no trimming: the centre sits (V0.r + R) along the start ray,
 * which is also (V0.r - d) + (R + d) for every d. One centre, one pair of tangency rays, every
 * offset — which is what makes the outer trace, the purfling, the channel and the inner trace
 * all agree at the neck without each solving its own join.
 *
 * A corner still has to be rounded even at R = 0, because offsetting a convex corner outward
 * cannot land the two offset pieces on one point: the arc's end slides along its own radial
 * normal while the face slides straight up. At R = 0 the join centres on the corner itself, so
 * the rib line keeps its mitre and only the offsets round it.
 *
 * Offsets far enough inward to use the join up (R + d <= 0, which the channel reaches) fall back
 * to the crossing point of the two offsets, since inside a convex corner they meet rather than
 * part. That is the one case where V0 does get trimmed.
 *
 * Returns null when there is no viol neck, or when the geometry leaves no face to run out onto.
 */
export function violNeckCap(p: EnricoCerutiParams, d: number): { v0Start: number; fillet: Arc | null; topX: number; topY: number } | null {
    const V0 = p.viol?.V0;
    if (!V0) return null;

    const R = p.viol.neckRadius ?? 0;

    if (R + d > 1e-9) {
        // back down the start ray to the join's centre — the point V0 was seated against
        const C = { x: V0.x + (V0.r + R) * Math.cos(V0.start), y: V0.y + (V0.r + R) * Math.sin(V0.start) };
        if (C.x <= 0) return null;
        return { v0Start: V0.start, fillet: new Arc(C.x, C.y, R + d, V0.start + TURN.half, TURN.quarter), topX: C.x, topY: C.y + R + d };
    }

    const topY = V0.y + (V0.r + R) * Math.sin(V0.start) + R + d;
    const P = neckSeat(V0, V0.r - d, topY, pointOnCircle(V0, V0.start));
    if (!P || P.x <= 0) return null;
    return { v0Start: angleFromCenter(V0, P), fillet: null, topX: P.x, topY };
}

/** Where a circle about V0's centre crosses a height, on whichever branch the neck sits on. */
function neckSeat(V0: Arc, r: number, y: number, corner: Pt): Pt | null {
    const dy = y - V0.y;
    const span = r * r - dy * dy;
    if (span <= 0) return null;
    const root = Math.sqrt(span);
    const x = Math.abs(V0.x - root - corner.x) <= Math.abs(V0.x + root - corner.x) ? V0.x - root : V0.x + root;
    return { x, y };
}

/** The neck's top face at offset `d` — the segment that closes a loop across the neck. */
function violNeckTopLine(p: EnricoCerutiParams, d: number): string | null {
    const cap = violNeckCap(p, d);
    return cap ? pathFromLine({ x: cap.topX, y: cap.topY }, { x: -cap.topX, y: cap.topY }) : null;
}

// an arc not drafted yet, or named in `unsolved` because its section failed this pass, is left out,
// so an outline still being drafted comes back as far as it goes
export function defineInnerArcs(p: EnricoCerutiParams, unsolved: readonly string[] = []): Arc[] {
    const keys: (keyof EnricoCerutiParams['bouts'])[] = ['L0', 'L1'];
    if (p.options.useViolCornerLC) {
        keys.push('L4');
    } else {
        keys.push('L2', 'L3');
        if (p.options.L31DoubleArc) keys.push('L31');
    }

    keys.push('C0', 'C1', 'C2');
    if (p.options.C21DoubleArc) keys.push('C21');
    if (p.options.C11DoubleArc) keys.push('C11');

    if (p.options.useViolCornerUC) {
        keys.push('U4');
    } else {
        keys.push('U3', 'U2');
        if (p.options.U31DoubleArc) keys.push('U31');
    }
    keys.push('U1', 'U0');

    const fullPath = keys
        .filter(key => p.bouts[key] && !unsolved.includes(key))
        .map(key => p.bouts[key] as Arc);
    if (p.options.useViolNeck && p.viol?.V0 && !unsolved.includes('U0')) {
        // a copy, trimmed back to where the neck fillet takes over — p.viol.V0 itself is the
        // authored arc and stays as the user set it
        const cap = violNeckCap(p, 0);
        fullPath.push(arcFromCircle(p.viol.V0, cap?.v0Start ?? p.viol.V0.start, p.viol.V0.end));
        if (cap?.fillet) fullPath.push(cap.fillet);
    }

    return fullPath;
}

export function defineOffsetArcs(p: EnricoCerutiParams, offset?: number, corners: boolean = false, centerOffset?: number): Arc[] {
    offset ??= p.overhang + p.rib;
    let arcs = [];


    // a viol corner's flank (L4/U4) is itself the arc that reaches the corner tip,
    // so the `corners` block below pushes it trimmed to the new intersection.
    // don't add it here as well — the untrimmed copy runs past the corner.
    arcs.push(offsetArcRadius(p.bouts.L0, offset), offsetArcRadius(p.bouts.L1, offset));
    if (!p.options.useViolCornerLC) {
        arcs.push(offsetArcRadius(p.bouts.L2, offset));
        // corners && fullPath.push(offsetArcRadius(p.bouts.L3, -offset));
    }


    // centerOffset code is half baked, but largely unnecessary
    // it was intended to allow fluting along the c-bout to be a different
    // width than the rest of the purfling channel, but this is not a common use case
    if (centerOffset) 
        arcs.push(offsetArcRadius(p.bouts.C0, -centerOffset));
    else
        arcs.push(offsetArcRadius(p.bouts.C0, -offset));
    // if (corners) {
    //     arcs.push(offsetArcRadius(p.bouts.C1, -offset));
    //     arcs.push(offsetArcRadius(p.bouts.C2, -offset));
    // }

    if (!p.options.useViolCornerUC) {
        // corners && arcs.push(offsetArcRadius(p.bouts.U3, -offset));
        arcs.push(offsetArcRadius(p.bouts.U2, offset));
    }
    arcs.push(offsetArcRadius(p.bouts.U1, offset));
    arcs.push(offsetArcRadius(p.bouts.U0, offset));
    if (p.options.useViolNeck) {
        const cap = violNeckCap(p, offset);
        const V0off = offsetArcRadius(p.viol?.V0!, -offset);
        if (cap) V0off.start = cap.v0Start;
        arcs.push(V0off);
        if (cap?.fillet) arcs.push(cap.fillet);
    }

    // if we include corners we need to calculate the new corner intersection point
    // these corners are distinct from the "outer corners" which have unique ends, and are joined by 
    // a "cutoff" line
    // instead these arcs are used as a PURE offset from the inner path
    // this can be used to move the purfling line around, for example
    if (corners) {
        let U3Offset = offsetArcRadius(p.bouts.U3, -offset);
        let U31Offset = p.options.U31DoubleArc ? offsetArcRadius(p.bouts.U31, -offset) : null;
        let C2Offset = offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * offset);
        let C21Offset = p.options.C21DoubleArc ?  offsetArcRadius(p.bouts.C21!, cornerOffsetSign(p, 'C2') * offset) : null;
        let L3Offset = offsetArcRadius(p.bouts.L3, -offset);
        let L31Offset = p.options.L31DoubleArc ? offsetArcRadius(p.bouts.L31!, -offset) : null;
        let C1Offset = offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * offset);
        let C11Offset = p.options.C11DoubleArc ? offsetArcRadius(p.bouts.C11!, cornerOffsetSign(p, 'C1') * offset) : null;

        let U4Offset = p.options.useViolCornerUC ? offsetArcRadius(p.bouts.U4!, offset) : null;
        let L4Offset = p.options.useViolCornerLC ? offsetArcRadius(p.bouts.L4!, offset) : null;

        // the end state of our new corner will depend on which arcs we are using
        // leftmost stops being the corner once C1 or C2 wraps around C0, but nearest the tip always is
        let nearUpperCorner = (a: Pt, b: Pt) => dist(a, p.bouts.UCr) - dist(b, p.bouts.UCr);
        let upperCorner;
        if (p.options.useViolCornerUC)
            upperCorner = circleCircleIntersections(U4Offset, C2Offset).sort((a, b) => a.x - b.x)[1];
        else if (p.options.U31DoubleArc && p.options.C21DoubleArc)
            upperCorner = circleCircleIntersections(U31Offset, C21Offset).sort(nearUpperCorner)[0];
        else if (p.options.U31DoubleArc)
            upperCorner = circleCircleIntersections(U31Offset, C2Offset).sort(nearUpperCorner)[0];
        else if (p.options.C21DoubleArc)
            upperCorner = circleCircleIntersections(U3Offset, C21Offset).sort(nearUpperCorner)[0];
        else
            upperCorner = circleCircleIntersections(U3Offset, C2Offset).sort(nearUpperCorner)[0];

        let nearLowerCorner = (a: Pt, b: Pt) => dist(a, p.bouts.LCr) - dist(b, p.bouts.LCr);
        let lowerCorner;
        if (p.options.useViolCornerLC)
            lowerCorner = circleCircleIntersections(L4Offset, C1Offset).sort((a, b) => a.x - b.x)[1];
        else if (p.options.L31DoubleArc && p.options.C11DoubleArc)
            lowerCorner = circleCircleIntersections(L31Offset, C11Offset).sort(nearLowerCorner)[0];
        else if (p.options.L31DoubleArc)
            lowerCorner = circleCircleIntersections(L31Offset, C1Offset).sort(nearLowerCorner)[0];
        else if (p.options.C11DoubleArc)
            lowerCorner = circleCircleIntersections(L3Offset, C11Offset).sort(nearLowerCorner)[0];
        else
            lowerCorner = circleCircleIntersections(L3Offset, C1Offset).sort(nearLowerCorner)[0];

        if(!upperCorner || !lowerCorner) {
            error("The offset is too small, and the corner circles no longer intersect. Try reducing the purfling offset.", "Purfling Error");
            return [];
        }

        // now that we have the new corners, lets modify the ends of the terminal arcs.
        // Primary arcs (U3, C2, L3, C1) keep their original end angles when a secondary
        // arc follows them; only the arc that actually reaches the corner tip is trimmed.
        if (p.options.useViolCornerUC) {
            U4Offset.end = angleFromCenter(U4Offset, upperCorner);
            C2Offset.end = angleFromCenter(C2Offset, upperCorner);
            arcs.push(U4Offset, C2Offset);
        }
        else if (p.options.U31DoubleArc && p.options.C21DoubleArc) {
            U31Offset.end = angleFromCenter(U31Offset, upperCorner);
            C21Offset.end = angleFromCenter(C21Offset, upperCorner);
            arcs.push(U3Offset, U31Offset, C2Offset, C21Offset);
        }
        else if (p.options.U31DoubleArc) {
            U31Offset.end = angleFromCenter(U31Offset, upperCorner);
            C2Offset.end = angleFromCenter(C2Offset, upperCorner);
            arcs.push(U3Offset, U31Offset, C2Offset);
        }
        else if (p.options.C21DoubleArc) {
            U3Offset.end = angleFromCenter(U3Offset, upperCorner);
            C21Offset.end = angleFromCenter(C21Offset, upperCorner);
            arcs.push(U3Offset, C2Offset, C21Offset);
        }
        else {
            U3Offset.end = angleFromCenter(U3Offset, upperCorner);
            C2Offset.end = angleFromCenter(C2Offset, upperCorner);
            arcs.push(U3Offset, C2Offset);
        }

        if (p.options.useViolCornerLC) {
            L4Offset.end = angleFromCenter(L4Offset, lowerCorner);
            C1Offset.end = angleFromCenter(C1Offset, lowerCorner);
            arcs.push(L4Offset, C1Offset);
        }
        else if (p.options.L31DoubleArc && p.options.C11DoubleArc) {
            L31Offset.end = angleFromCenter(L31Offset, lowerCorner);
            C11Offset.end = angleFromCenter(C11Offset, lowerCorner);
            arcs.push(L3Offset, L31Offset, C1Offset, C11Offset);
        }
        else if (p.options.L31DoubleArc) {
            L31Offset.end = angleFromCenter(L31Offset, lowerCorner);
            C1Offset.end = angleFromCenter(C1Offset, lowerCorner);
            arcs.push(L3Offset, L31Offset, C1Offset);
        }
        else if (p.options.C11DoubleArc) {
            L3Offset.end = angleFromCenter(L3Offset, lowerCorner);
            C11Offset.end = angleFromCenter(C11Offset, lowerCorner);
            arcs.push(L3Offset, C1Offset, C11Offset);
        }
        else {
            L3Offset.end = angleFromCenter(L3Offset, lowerCorner);
            C1Offset.end = angleFromCenter(C1Offset, lowerCorner);
            arcs.push(L3Offset, C1Offset);
        }      
    }

    return arcs;
}

/**
 * Given a scaled corner arc and the cutoff line defined by two full-inset endpoints,
 * returns the angle at which the scaled arc intersects that line.
 * Picks the intersection closest to refPt (i.e. the full-inset endpoint for that arc).
 * Falls back to `fallback` if no intersection exists.
 */
function cutoffEndAtOffset(scaledArc: Arc, cutPt1: Pt, cutPt2: Pt, refPt: Pt, fallback: number): number {
    const ints = lineCircleIntersection(lineFromTwoPoints(cutPt1, cutPt2), scaledArc);
    if (ints.length === 0) return fallback;
    const best = ints.sort((a, b) => dist(a, refPt) - dist(b, refPt))[0];
    return angleFromCenter(scaledArc, best);
}

function insetCutoffLine(pt1: Pt, pt2: Pt, delta: number, interior: Pt): { p1: Pt; p2: Pt } {
    const dx = pt2.x - pt1.x;
    const dy = pt2.y - pt1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;
    const sign = (interior.x - pt1.x) * nx + (interior.y - pt1.y) * ny >= 0 ? -1 : 1;
    return {
        p1: { x: pt1.x + sign * delta * nx, y: pt1.y + sign * delta * ny },
        p2: { x: pt2.x + sign * delta * nx, y: pt2.y + sign * delta * ny },
    };
}

export function defineOuterCornerArcs(p: EnricoCerutiParams, offset: number): Arc[] {
    let arcs: Arc[] = [];

    if (p.options.useViolCornerUC) {
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        let intersects = circleCircleIntersections(U4Offset, p.outerCorners.C2);
        let U4Angle = angleFromCenter(U4Offset, intersects[0]);
        let CU1Angle = angleFromCenter(p.outerCorners.C2, intersects[0]);
        U4Offset.end = U4Angle;
        p.outerCorners.C2.end = CU1Angle;
        arcs.push(U4Offset);
        arcs.push(flipArcAboutY(U4Offset));
        arcs.push(p.outerCorners.C2);
        arcs.push(flipArcAboutY(p.outerCorners.C2));
    }
    else {
        const inset = p.overhang + p.rib;
        const ucPt1 = p.options.U31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.U31, -inset), p.outerCorners.U31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.U3, -inset), p.outerCorners.U3.end);
        const ucPt2 = p.options.C21DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * inset), p.outerCorners.C21!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * inset), p.outerCorners.C2.end);

        const U3off = offsetArcRadius(p.bouts.U3, -offset);
        if (!p.options.U31DoubleArc) U3off.end = cutoffEndAtOffset(U3off, ucPt1, ucPt2, ucPt1, p.outerCorners.U3.end);
        arcs.push(U3off);
        arcs.push(flipArcAboutY(U3off));
        if (p.options.U31DoubleArc) {
            const U31off = offsetArcRadius(p.bouts.U31, -offset);
            U31off.end = cutoffEndAtOffset(U31off, ucPt1, ucPt2, ucPt1, p.outerCorners.U31!.end);
            arcs.push(U31off);
            arcs.push(flipArcAboutY(U31off));
        }
        const C2off = offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * offset);
        if (!p.options.C21DoubleArc) C2off.end = cutoffEndAtOffset(C2off, ucPt1, ucPt2, ucPt2, p.outerCorners.C2.end);
        arcs.push(C2off);
        arcs.push(flipArcAboutY(C2off));
        if (p.options.C21DoubleArc) {
            const C21off = offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * offset);
            C21off.end = cutoffEndAtOffset(C21off, ucPt1, ucPt2, ucPt2, p.outerCorners.C21!.end);
            arcs.push(C21off);
            arcs.push(flipArcAboutY(C21off));
        }
    }

    if (p.options.useViolCornerLC) {
        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        let intersects = circleCircleIntersections(L4Offset, p.outerCorners.C1);
        let L4Angle = angleFromCenter(L4Offset, intersects[1]);
        let CL1Angle = angleFromCenter(p.outerCorners.C1, intersects[1]);
        L4Offset.end = L4Angle;
        p.outerCorners.C1.end = CL1Angle;
        arcs.push(L4Offset);
        arcs.push(flipArcAboutY(L4Offset));
        arcs.push(p.outerCorners.C1);
        arcs.push(flipArcAboutY(p.outerCorners.C1));
    }
    else {
        const inset = p.overhang + p.rib;
        const lcPt1 = p.options.C11DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * inset), p.outerCorners.C11!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * inset), p.outerCorners.C1.end);
        const lcPt2 = p.options.L31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.L31, -inset), p.outerCorners.L31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.L3, -inset), p.outerCorners.L3.end);

        const C1off = offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * offset);
        if (!p.options.C11DoubleArc) C1off.end = cutoffEndAtOffset(C1off, lcPt1, lcPt2, lcPt1, p.outerCorners.C1.end);
        arcs.push(C1off);
        arcs.push(flipArcAboutY(C1off));
        if (p.options.C11DoubleArc) {
            const C11off = offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * offset);
            C11off.end = cutoffEndAtOffset(C11off, lcPt1, lcPt2, lcPt1, p.outerCorners.C11!.end);
            arcs.push(C11off);
            arcs.push(flipArcAboutY(C11off));
        }
        const L3off = offsetArcRadius(p.bouts.L3, -offset);
        if (!p.options.L31DoubleArc) L3off.end = cutoffEndAtOffset(L3off, lcPt1, lcPt2, lcPt2, p.outerCorners.L3.end);
        arcs.push(L3off);
        arcs.push(flipArcAboutY(L3off));
        if (p.options.L31DoubleArc) {
            const L31off = offsetArcRadius(p.bouts.L31, -offset);
            L31off.end = cutoffEndAtOffset(L31off, lcPt1, lcPt2, lcPt2, p.outerCorners.L31!.end);
            arcs.push(L31off);
            arcs.push(flipArcAboutY(L31off));
        }
    }

    return arcs;
}

// Returns the angle `degrees` back from arc.end, moving toward arc.start along
// whichever direction the arc actually sweeps (sign of the shortest start->end delta).
// a long flat flank can be shorter than that, and going past its start would join from
// somewhere up the next bout, so it stops there
function angleBeforeEnd(arc: Arc, degrees: number): number {
    const delta = Math.atan2(Math.sin(arc.end - arc.start), Math.cos(arc.end - arc.start));
    const dir = Math.sign(delta) || 1;
    return arc.end - dir * Math.min(degrees * TURN.degree, Math.abs(delta));
}


// some center bout / main bout fluting combinations degenerate, this catches those
const MAX_JOIN_RADIUS_TO_CHORD = 10;
// how far the search below is willing to walk the c-bout arc's own endpoint back before
// admitting no join is possible and falling back to the error
const MAX_CBOUT_RETREAT_DEG = 45;

// the join is an S, and which way round depends on which side of the chord each tangent falls. an
// inverted corner swings C0's end past the chord and the usual S loops out to reach it, its joint
// straying off the chord; flipping both inverts mirrors the S, and that's tried only then, so
// anything the usual S handled is left to it. a join tighter than half its chord curls into the
// corner the channel is meant to bypass, and one that crosses the land's edge at the corner is cut
// outside the land it bypasses
function attemptJoin(arc1: Arc, side1: "start" | "end", arc2: Arc, side2: "start" | "end", invert: boolean, land: Pt[] | null): Arc[] | null {
    const P1 = pointOnCircle(arc1, side1 === "end" ? arc1.end : arc1.start);
    const P2 = pointOnCircle(arc2, side2 === "end" ? arc2.end : arc2.start);
    const chord = dist(P1, P2);
    const mid = new Pt((P1.x + P2.x) / 2, (P1.y + P2.y) / 2);
    const loops = (join: Arc[]) => dist(pointOnCircle(join[0], join[0].end), mid) > chord / 2;
    const fits = (join: Arc[]) => join[0].r <= MAX_JOIN_RADIUS_TO_CHORD * chord && join[0].r >= chord / 2;
    const outside = (q: Pt) => !pointInPolygon(q, land!)
        && land!.every((a, i) => i === 0 || closestPointOnSegment(q, land![i - 1], a).dist > 0.01);
    const crosses = (join: Arc[]) => land !== null && join.some(arc => {
        const sweep = Math.atan2(Math.sin(arc.end - arc.start), Math.cos(arc.end - arc.start));
        const steps = Math.max(16, Math.ceil(arc.r * Math.abs(sweep) / 0.5));
        return Array.from({ length: steps + 1 }, (_, i) => pointOnCircle(arc, arc.start + sweep * i / steps)).some(outside);
    });

    let join = findJoiningArcs(arc1, side1, arc2, side2, invert);
    if (join.length === 0) return null;
    if (loops(join)) join = findJoiningArcs(arc1, side1, arc2, side2, !invert, true);
    return join.length > 0 && !loops(join) && fits(join) && !crosses(join) ? join : null;
}

// a c-bout usually ends heading within a few degrees of the bout arc it joins, but one whose corner
// wraps around it ends turned out towards the corner, and a join from there scoops. past the
// trigger its end is drawn back along C0 until the headings agree to the target, though no further
// than the given share of the way to the waist. the trigger sits clear of every ordinary corner
const JOIN_HEADING_TRIGGER = 15 * TURN.degree;
const JOIN_HEADING_TARGET = 4 * TURN.degree;
const MAX_CBOUT_EASE_TO_WAIST = 0.8;

function easeCBoutEnd(cBout: Arc, side: "start" | "end", bout: Arc, boutSide: "start" | "end"): void {
    // tangents are square to their radii, so two headings differ by the angle between the radii, mod pi
    let gap = ((side === "end" ? cBout.end : cBout.start) - (boutSide === "end" ? bout.end : bout.start)) % TURN.half;
    if (gap > TURN.quarter) gap -= TURN.half;
    if (gap < -TURN.quarter) gap += TURN.half;
    if (Math.abs(gap) <= JOIN_HEADING_TRIGGER) return;

    const span = Math.atan2(Math.sin(cBout.end - cBout.start), Math.cos(cBout.end - cBout.start));
    const inward = side === "end" ? -Math.sign(span) : Math.sign(span);
    const move = Math.sign(gap) * JOIN_HEADING_TARGET - gap;
    if (Math.sign(move) !== inward) return;
    const eased = Math.sign(move) * Math.min(Math.abs(move), Math.abs(span) / 2 * MAX_CBOUT_EASE_TO_WAIST);
    if (side === "end") cBout.end += eased; else cBout.start += eased;
}

function retreatAngle(startAngle: number, endAngle: number, side: "start" | "end", degrees: number): number {
    const delta = Math.atan2(Math.sin(endAngle - startAngle), Math.cos(endAngle - startAngle));
    const dir = Math.sign(delta) || 1;
    return side === "end" ? endAngle - dir * degrees * TURN.degree : startAngle + dir * degrees * TURN.degree;
}

// some arcs cannot be joined given their ends, this system will recursively "peel back" until a suitable 
// angle is found for a joi
function joinFlutingTransition(
    arc1: Arc, side1: "start" | "end",
    arc2: Arc, side2: "start" | "end",
    invert = false,
    cBoutSide: 1 | 2 = 2,
    land: Pt[] | null = null,
): Arc[] {
    const cBoutArc = cBoutSide === 1 ? arc1 : arc2;
    const cBoutJoinSide = cBoutSide === 1 ? side1 : side2;
    const originalStart = cBoutArc.start;
    const originalEnd = cBoutArc.end;

    for (let degrees = 0; degrees <= MAX_CBOUT_RETREAT_DEG; degrees++) {
        if (degrees > 0) {
            const angle = retreatAngle(originalStart, originalEnd, cBoutJoinSide, degrees);
            if (cBoutJoinSide === "end") cBoutArc.end = angle; else cBoutArc.start = angle;
        }
        const join = attemptJoin(arc1, side1, arc2, side2, invert, land);
        if (join) return join;
    }

    cBoutArc.start = originalStart;
    cBoutArc.end = originalEnd;
    error("Cannot join fluting on main body and c-bout, as the difference in fluting width is too large", "Fluting Error");
    return [];
}

// the platform edge at the channel edge's own offset, which the corner joins mustn't cross; taken at
// the outer of the two offsets when the c-bout's differs, or C0's own end would sit outside it. an
// offset too far in for the corner arcs to exist has no land to check against
function flutingLand(p: EnricoCerutiParams, offset: number): Pt[] | null {
    try {
        return samplePathToPolyline(defineInsetPath(p, p.overhang + p.rib - offset), 0.5);
    } catch {
        return null;
    }
}

export function defineFlutingArcs(p: EnricoCerutiParams, offset: number, centerOffset?: number): Arc[] {
    const flutingArcs = defineOffsetArcs(p, offset, false, centerOffset);
    // flutingArcs[2] is always C0off here: whichever side is viol, its corner arc(s)
    // (L2/U2) drop out of defineOffsetArcs, leaving C0 adjacent to L1/U1 in the array.
    const land = flutingLand(p, Math.max(offset, centerOffset ?? offset));

    if (p.options.useViolCornerLC && p.options.useViolCornerUC) {
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        U4Offset.end = angleBeforeEnd(U4Offset, 10);
        let upperJoin = joinFlutingTransition(flutingArcs[2], "start", U4Offset, "end", true, 1, land)
        flutingArcs.push(U4Offset);
        for (const arc of upperJoin) {
            flutingArcs.push(arc);
        }

        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        L4Offset.end = angleBeforeEnd(L4Offset, 10);
        let lowerJoin = joinFlutingTransition(L4Offset, "end", flutingArcs[2], "end", false, 2, land)
        flutingArcs.push(L4Offset);
        for (const arc of lowerJoin) {
            flutingArcs.push(arc);
        }
        return flutingArcs;
    }


    if (p.options.useViolCornerUC){
        easeCBoutEnd(flutingArcs[3], "end", flutingArcs[2], "end");
        let lowerJoin = joinFlutingTransition(flutingArcs[2], "end", flutingArcs[3], "end", false, 2, land)
        for (const arc of lowerJoin) {
            flutingArcs.push(arc);
        }
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        U4Offset.end = angleBeforeEnd(U4Offset, 12);
        let upperJoin = joinFlutingTransition(flutingArcs[3], "start", U4Offset, "end", true, 1, land)
        flutingArcs.push(U4Offset);
        for (const arc of upperJoin) {
            flutingArcs.push(arc);
        }
        return flutingArcs;
    }
    if (p.options.useViolCornerLC) {
        easeCBoutEnd(flutingArcs[2], "start", flutingArcs[3], "end");
        let upperJoin = joinFlutingTransition(flutingArcs[2], "start", flutingArcs[3], "end", true, 1, land)
        for (const arc of upperJoin) {
            flutingArcs.push(arc);
        }
        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        L4Offset.end = angleBeforeEnd(L4Offset, 12);
        let lowerJoin = joinFlutingTransition(L4Offset, "end", flutingArcs[2], "end", false, 2, land)
        flutingArcs.push(L4Offset);
        for (const arc of lowerJoin) {
            flutingArcs.push(arc);
        }

        return flutingArcs;
    }

    easeCBoutEnd(flutingArcs[3], "end", flutingArcs[2], "end");
    easeCBoutEnd(flutingArcs[3], "start", flutingArcs[4], "end");
    let lowerJoin = joinFlutingTransition(flutingArcs[2], "end", flutingArcs[3], "end", false, 2, land)
    for (const arc of lowerJoin) {
        flutingArcs.push(arc);
    }

    let upperJoin = joinFlutingTransition(flutingArcs[3], "start", flutingArcs[4], "end", true, 1, land)
    for (const arc of upperJoin) {
        flutingArcs.push(arc);
    }

    return flutingArcs;
}

export function defineInnerPath(p: EnricoCerutiParams, unsolved: readonly string[] = []): string {
    let arcs = defineInnerArcs(p, unsolved);
    let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
    arcs = arcs.concat(mirroredArcs);

    let paths: string[] = arcs.map(arc => pathFromArc(arc));

    if (p.options.useViolNeck && !unsolved.includes('U0')) {
        const top = violNeckTopLine(p, 0);
        if (top) paths.push(top);
    }

    // a finished outline is one closed loop, and a gap in it fails loudly; one still being drafted
    // is whichever chains of it exist so far
    const finished = !unsolved.length && !!p.bouts.C0;
    return finished ? unifyConnectedSvgPaths(paths) : unifyConnectedSvgPathGroups(paths);
}

/** Violin numbers scaled by body length, so the larger sizes get a button in proportion. */
export function defaultButton(p: EnricoCerutiParams): ButtonParams {
    const k = p.height / 355;
    return { width: Math.round(20 * k * 2) / 2, height: Math.round(14 * k * 2) / 2 };
}

/** The cap's circle: one radius short of the tip, on the centreline. */
function buttonCap(b: ButtonParams, plateEndY: number): { x: number; y: number; r: number } {
    return { x: 0, y: plateEndY + b.height - b.width / 2, r: b.width / 2 };
}

// the button is built from its tip down: a cap circle, and vertical walls dropped from its
// equator to wherever the plate's edge crosses them. A height under the cap's radius puts the
// equator below the edge, so the walls vanish and the cap itself is trimmed against the edge — a
// circular segment. `wallHit` gives the edge under a wall at x; `capHit` the cap's own crossing
// of the edge on the right, or null when the cap never clears it. `leaves` is where the edge
// hands over to the button, for the caller to trim the edge at.
function buttonShape(
    b: ButtonParams, plateEndY: number,
    wallHit: (x: number) => Pt | null, capHit: () => Pt | null,
): { paths: string[]; leaves: Pt; cap: Arc } | null {
    const cap = buttonCap(b, plateEndY);
    const foot = wallHit(cap.r);
    if (foot && cap.y >= foot.y) {
        const shoulder = { x: cap.r, y: cap.y };
        const arc = arcFromCircle(cap, 0, TURN.half);
        return {
            leaves: foot,
            cap: arc,
            paths: [
                pathFromLine(foot, shoulder),
                pathFromLine(flipPointAboutY(foot), flipPointAboutY(shoulder)),
                pathFromArc(arc),
            ],
        };
    }
    const hit = capHit();
    if (!hit) return null;
    const from = angleFromCenter(cap, hit);
    const arc = arcFromCircle(cap, from, TURN.half - from);
    return { leaves: hit, cap: arc, paths: [pathFromArc(arc)] };
}

// the button standing off the back plate's outline at `offset`, and the U0 offset it hands over from
function outerButton(p: EnricoCerutiParams, offset: number): { paths: string[]; leaves: Pt; cap: Arc; U0: Arc } | null {
    if (p.options.useViolNeck || !p.button || p.button.height <= 0) return null;
    const U0 = offsetArcRadius(p.bouts.U0, offset);
    const b = buttonShape(p.button, p.height, x => lineCircleIntersection(lineFromTwoPoints(new Pt(x, p.height), new Pt(x, 0)), U0).sort((a, c) => a.y - c.y).pop() ?? null,
        () => circleCircleIntersections(buttonCap(p.button!, p.height), U0).find(h => h.x > 0) ?? null);
    return b ? { ...b, U0 } : null;
}

// the button on its own, the part of the back's outline its fields set: the cap, and the walls when
// it stands tall enough to have them
export function defineButton(p: EnricoCerutiParams, offset?: number): { path: string; cap: Arc } | null {
    const b = outerButton(p, offset ?? p.overhang + p.rib);
    return b ? { path: combinePathStrings(b.paths), cap: b.cap } : null;
}

// offset should be positive to go outside of the inner path,
// but technically its up to the caller
// this is technically an outer path function due to the corner logic
export function defineOuterPath(p: EnricoCerutiParams, offset?: number, closeArcs = true, button = false): string {
    offset ??= p.overhang + p.rib;
    let arcs = defineOffsetArcs(p, offset);

    let buttonPaths: string[] = [];
    const b = button ? outerButton(p, offset) : null;
    if (b) {
        buttonPaths.push(...b.paths);
        arcs[arcs.length - 1].start = angleFromCenter(b.U0, b.leaves);
    }

    let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
    arcs = arcs.concat(mirroredArcs);

    // Compute outer corner arcs (also mutates p.outerCorners end angles for viol corner cases)
    const outerCornerArcs = defineOuterCornerArcs(p, offset);
    arcs.push(...outerCornerArcs);

    let paths: string[] = [];

    // render corner connectors — sharpness > 0 uses a shaped bezier, 0 uses a straight line
    const ucs = p.options.ucCornerSharpness ?? 0;
    const lcs = p.options.lcCornerSharpness ?? 0;
    const ucCornerPath = (a1: Arc, a2: Arc) => ucs > 0
      ? pathFromCornerCubic(a1, a2, ucs)
      : pathFromLine(pointOnCircle(a1, a1.end), pointOnCircle(a2, a2.end));
    const lcCornerPath = (a1: Arc, a2: Arc) => lcs > 0
      ? pathFromCornerCubic(a1, a2, lcs)
      : pathFromLine(pointOnCircle(a1, a1.end), pointOnCircle(a2, a2.end));

    if (closeArcs && !p.options.useViolCornerUC) {
        const inset = p.overhang + p.rib;
        const ucPt1 = p.options.U31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.U31, -inset), p.outerCorners.U31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.U3, -inset), p.outerCorners.U3.end);
        const ucPt2 = p.options.C21DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * inset), p.outerCorners.C21!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * inset), p.outerCorners.C2.end);

        if (p.options.U31DoubleArc && p.options.C21DoubleArc) {
            const U31c = offsetArcRadius(p.bouts.U31, -offset);
            U31c.end = cutoffEndAtOffset(U31c, ucPt1, ucPt2, ucPt1, p.outerCorners.U31!.end);
            const C21c = offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * offset);
            C21c.end = cutoffEndAtOffset(C21c, ucPt1, ucPt2, ucPt2, p.outerCorners.C21!.end);
            paths.push(ucCornerPath(U31c, C21c));
            paths.push(ucCornerPath(flipArcAboutY(U31c), flipArcAboutY(C21c)));
        }
        else if (p.options.U31DoubleArc) {
            const U31c = offsetArcRadius(p.bouts.U31, -offset);
            U31c.end = cutoffEndAtOffset(U31c, ucPt1, ucPt2, ucPt1, p.outerCorners.U31!.end);
            const C2c = offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * offset);
            C2c.end = cutoffEndAtOffset(C2c, ucPt1, ucPt2, ucPt2, p.outerCorners.C2.end);
            paths.push(ucCornerPath(U31c, C2c));
            paths.push(ucCornerPath(flipArcAboutY(U31c), flipArcAboutY(C2c)));
        }
        else if (p.options.C21DoubleArc) {
            const U3c = offsetArcRadius(p.bouts.U3, -offset);
            U3c.end = cutoffEndAtOffset(U3c, ucPt1, ucPt2, ucPt1, p.outerCorners.U3.end);
            const C21c = offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * offset);
            C21c.end = cutoffEndAtOffset(C21c, ucPt1, ucPt2, ucPt2, p.outerCorners.C21!.end);
            paths.push(ucCornerPath(U3c, C21c));
            paths.push(ucCornerPath(flipArcAboutY(U3c), flipArcAboutY(C21c)));
        }
        else {
            const U3c = offsetArcRadius(p.bouts.U3, -offset);
            U3c.end = cutoffEndAtOffset(U3c, ucPt1, ucPt2, ucPt1, p.outerCorners.U3.end);
            const C2c = offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * offset);
            C2c.end = cutoffEndAtOffset(C2c, ucPt1, ucPt2, ucPt2, p.outerCorners.C2.end);
            paths.push(ucCornerPath(U3c, C2c));
            paths.push(ucCornerPath(flipArcAboutY(U3c), flipArcAboutY(C2c)));
        }
    }

    if (closeArcs && !p.options.useViolCornerLC) {
        const inset = p.overhang + p.rib;
        const lcPt1 = p.options.C11DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * inset), p.outerCorners.C11!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * inset), p.outerCorners.C1.end);
        const lcPt2 = p.options.L31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.L31, -inset), p.outerCorners.L31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.L3, -inset), p.outerCorners.L3.end);

        if (p.options.C11DoubleArc && p.options.L31DoubleArc) {
            const C11c = offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * offset);
            C11c.end = cutoffEndAtOffset(C11c, lcPt1, lcPt2, lcPt1, p.outerCorners.C11!.end);
            const L31c = offsetArcRadius(p.bouts.L31, -offset);
            L31c.end = cutoffEndAtOffset(L31c, lcPt1, lcPt2, lcPt2, p.outerCorners.L31!.end);
            paths.push(lcCornerPath(C11c, L31c));
            paths.push(lcCornerPath(flipArcAboutY(C11c), flipArcAboutY(L31c)));
        }
        else if (p.options.C11DoubleArc) {
            const C11c = offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * offset);
            C11c.end = cutoffEndAtOffset(C11c, lcPt1, lcPt2, lcPt1, p.outerCorners.C11!.end);
            const L3c = offsetArcRadius(p.bouts.L3, -offset);
            L3c.end = cutoffEndAtOffset(L3c, lcPt1, lcPt2, lcPt2, p.outerCorners.L3.end);
            paths.push(lcCornerPath(C11c, L3c));
            paths.push(lcCornerPath(flipArcAboutY(C11c), flipArcAboutY(L3c)));
        }
        else if (p.options.L31DoubleArc) {
            const C1c = offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * offset);
            C1c.end = cutoffEndAtOffset(C1c, lcPt1, lcPt2, lcPt1, p.outerCorners.C1.end);
            const L31c = offsetArcRadius(p.bouts.L31, -offset);
            L31c.end = cutoffEndAtOffset(L31c, lcPt1, lcPt2, lcPt2, p.outerCorners.L31!.end);
            paths.push(lcCornerPath(C1c, L31c));
            paths.push(lcCornerPath(flipArcAboutY(C1c), flipArcAboutY(L31c)));
        }
        else {
            const C1c = offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * offset);
            C1c.end = cutoffEndAtOffset(C1c, lcPt1, lcPt2, lcPt1, p.outerCorners.C1.end);
            const L3c = offsetArcRadius(p.bouts.L3, -offset);
            L3c.end = cutoffEndAtOffset(L3c, lcPt1, lcPt2, lcPt2, p.outerCorners.L3.end);
            paths.push(lcCornerPath(C1c, L3c));
            paths.push(lcCornerPath(flipArcAboutY(C1c), flipArcAboutY(L3c)));
        }
    }

    paths.push(...arcs.map(arc => pathFromArc(arc)));

    // the neck's fillets already came through defineOffsetArcs above and were mirrored with the
    // rest; all that is left is the top face they run out onto
    const cap = p.options.useViolNeck ? violNeckCap(p, offset) : null;
    if (cap) {
        const faceEnd = { x: cap.topX, y: cap.topY };
        // a button wider than the neck face has nothing to stand on, so it takes the face
        const fits = button && p.button && p.button.height > 0
            ? { width: Math.min(p.button.width, 2 * cap.topX), height: p.button.height } : null;
        const onFace = fits && buttonShape(fits, cap.topY, x => ({ x, y: cap.topY }), () => {
            const c = buttonCap(fits, cap.topY);
            const dy = cap.topY - c.y;
            return dy < c.r ? { x: Math.sqrt(c.r * c.r - dy * dy), y: cap.topY } : null;
        });
        if (onFace) {
            paths.push(pathFromLine(faceEnd, onFace.leaves));
            paths.push(pathFromLine(flipPointAboutY(faceEnd), flipPointAboutY(onFace.leaves)));
            buttonPaths.push(...onFace.paths);
        }
        else {
            paths.push(pathFromLine(faceEnd, flipPointAboutY(faceEnd)));
        }
    }

    let path = unifyConnectedSvgPaths([...paths, ...buttonPaths]);
    return path;
}

/**
 * Builds an inset path starting from the outer edge, offset inward by `delta`.
 * This is expressly different from the inner path
 * here we carry over the corner connectors and cutoff lines
 */
export function defineInsetPath(p: EnricoCerutiParams, delta: number): string {
    const inset = p.overhang + p.rib;
    const innerOffset = inset - delta;

    const arcs = defineOffsetArcs(p, innerOffset);
    const mirroredArcs = arcs.map(arc => flipArcAboutY(arc));

    const paths: string[] = [];
    const cornerArcs: Arc[] = [];

    const ucs = p.options.ucCornerSharpness ?? 0;
    const lcs = p.options.lcCornerSharpness ?? 0;
    const ucCornerPath = (a1: Arc, a2: Arc) => ucs > 0
        ? pathFromCornerCubic(a1, a2, ucs)
        : pathFromLine(pointOnCircle(a1, a1.end), pointOnCircle(a2, a2.end));
    const lcCornerPath = (a1: Arc, a2: Arc) => lcs > 0
        ? pathFromCornerCubic(a1, a2, lcs)
        : pathFromLine(pointOnCircle(a1, a1.end), pointOnCircle(a2, a2.end));

    if (p.options.useViolCornerUC) {
        const U4off = offsetArcRadius(p.bouts.U4!, innerOffset);
        const C2off = offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * innerOffset);
        const int = circleCircleIntersections(U4off, C2off);
        U4off.end = angleFromCenter(U4off, int[0]);
        C2off.end = angleFromCenter(C2off, int[0]);
        cornerArcs.push(U4off, flipArcAboutY(U4off), C2off, flipArcAboutY(C2off));
    } else {
        const ucPt1 = p.options.U31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.U31, -inset), p.outerCorners.U31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.U3, -inset), p.outerCorners.U3.end);
        const ucPt2 = p.options.C21DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * inset), p.outerCorners.C21!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * inset), p.outerCorners.C2.end);
        const ucLine = insetCutoffLine(ucPt1, ucPt2, delta, p.bouts.C0);

        const U3off = offsetArcRadius(p.bouts.U3, -innerOffset);
        let U31off: Arc | null = null;
        if (!p.options.U31DoubleArc) {
            U3off.end = cutoffEndAtOffset(U3off, ucLine.p1, ucLine.p2, ucLine.p1, p.outerCorners.U3.end);
        }
        cornerArcs.push(U3off, flipArcAboutY(U3off));

        if (p.options.U31DoubleArc) {
            U31off = offsetArcRadius(p.bouts.U31, -innerOffset);
            U31off.end = cutoffEndAtOffset(U31off, ucLine.p1, ucLine.p2, ucLine.p1, p.outerCorners.U31!.end);
            cornerArcs.push(U31off, flipArcAboutY(U31off));
        }

        const C2off = offsetArcRadius(p.bouts.C2, cornerOffsetSign(p, 'C2') * innerOffset);
        let C21off: Arc | null = null;
        if (!p.options.C21DoubleArc) {
            C2off.end = cutoffEndAtOffset(C2off, ucLine.p1, ucLine.p2, ucLine.p2, p.outerCorners.C2.end);
        }
        cornerArcs.push(C2off, flipArcAboutY(C2off));

        if (p.options.C21DoubleArc) {
            C21off = offsetArcRadius(p.bouts.C21, cornerOffsetSign(p, 'C2') * innerOffset);
            C21off.end = cutoffEndAtOffset(C21off, ucLine.p1, ucLine.p2, ucLine.p2, p.outerCorners.C21!.end);
            cornerArcs.push(C21off, flipArcAboutY(C21off));
        }

        const ucTerm1 = U31off ?? U3off;
        const ucTerm2 = C21off ?? C2off;
        paths.push(ucCornerPath(ucTerm1, ucTerm2));
        paths.push(ucCornerPath(flipArcAboutY(ucTerm1), flipArcAboutY(ucTerm2)));
    }

    if (p.options.useViolCornerLC) {
        const L4off = offsetArcRadius(p.bouts.L4!, innerOffset);
        const C1off = offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * innerOffset);
        const int = circleCircleIntersections(L4off, C1off);
        L4off.end = angleFromCenter(L4off, int[1]);
        C1off.end = angleFromCenter(C1off, int[1]);
        cornerArcs.push(L4off, flipArcAboutY(L4off), C1off, flipArcAboutY(C1off));
    } else {
        const lcPt1 = p.options.C11DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * inset), p.outerCorners.C11!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * inset), p.outerCorners.C1.end);
        const lcPt2 = p.options.L31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.L31, -inset), p.outerCorners.L31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.L3, -inset), p.outerCorners.L3.end);
        const lcLine = insetCutoffLine(lcPt1, lcPt2, delta, p.bouts.C0);

        const C1off = offsetArcRadius(p.bouts.C1, cornerOffsetSign(p, 'C1') * innerOffset);
        let C11off: Arc | null = null;
        if (!p.options.C11DoubleArc) {
            C1off.end = cutoffEndAtOffset(C1off, lcLine.p1, lcLine.p2, lcLine.p1, p.outerCorners.C1.end);
        }
        cornerArcs.push(C1off, flipArcAboutY(C1off));

        if (p.options.C11DoubleArc) {
            C11off = offsetArcRadius(p.bouts.C11, cornerOffsetSign(p, 'C1') * innerOffset);
            C11off.end = cutoffEndAtOffset(C11off, lcLine.p1, lcLine.p2, lcLine.p1, p.outerCorners.C11!.end);
            cornerArcs.push(C11off, flipArcAboutY(C11off));
        }

        const L3off = offsetArcRadius(p.bouts.L3, -innerOffset);
        let L31off: Arc | null = null;
        if (!p.options.L31DoubleArc) {
            L3off.end = cutoffEndAtOffset(L3off, lcLine.p1, lcLine.p2, lcLine.p2, p.outerCorners.L3.end);
        }
        cornerArcs.push(L3off, flipArcAboutY(L3off));

        if (p.options.L31DoubleArc) {
            L31off = offsetArcRadius(p.bouts.L31, -innerOffset);
            L31off.end = cutoffEndAtOffset(L31off, lcLine.p1, lcLine.p2, lcLine.p2, p.outerCorners.L31!.end);
            cornerArcs.push(L31off, flipArcAboutY(L31off));
        }

        const lcTerm1 = C11off ?? C1off;
        const lcTerm2 = L31off ?? L3off;
        paths.push(lcCornerPath(lcTerm1, lcTerm2));
        paths.push(lcCornerPath(flipArcAboutY(lcTerm1), flipArcAboutY(lcTerm2)));
    }

    if (p.options.useViolNeck) {
        const top = violNeckTopLine(p, innerOffset);
        if (top) paths.push(top);
    }

    paths.push(...[...arcs, ...mirroredArcs].map(arc => pathFromArc(arc)));
    paths.push(...cornerArcs.map(arc => pathFromArc(arc)));
    return unifyConnectedSvgPaths(paths);
}

/**
 * Returns the inner purfling line path. Returns null if purflingOffset is not set.
 */
export function definePurflingPath(p: EnricoCerutiParams, offset: number): string | null {
    p.purflingOffset ??= p.rib + p.overhang;
    const purflingArcOffset = offset - p.purflingOffset;
    const arcs = defineOffsetArcs(p, purflingArcOffset, true);
    const mirrored = arcs.map(arc => flipArcAboutY(arc));
    const paths = [...arcs, ...mirrored].map(arc => pathFromArc(arc));
    if (p.options.useViolNeck) {
        const top = violNeckTopLine(p, purflingArcOffset);
        if (top) paths.push(top);
    }
    return unifyConnectedSvgPaths(paths);
}

/**
 * Returns the outer purfling channel line path. Returns null if purflingOffset or
 * purflingChannelDepth is not set.
 */
export function defineOuterPurflingPath(p: EnricoCerutiParams, offset: number): string | null {
    p.purflingOffset ??= p.rib + p.overhang;
    p.purflingChannelDepth ??= 1.2;
    const outerPurflingArcOffset = offset - p.purflingOffset + p.purflingChannelDepth;
    const arcs = defineOffsetArcs(p, outerPurflingArcOffset, true);
    const mirrored = arcs.map(arc => flipArcAboutY(arc));
    const paths = [...arcs, ...mirrored].map(arc => pathFromArc(arc));
    if (p.options.useViolNeck) {
        const top = violNeckTopLine(p, outerPurflingArcOffset);
        if (top) paths.push(top);
    }
    return unifyConnectedSvgPaths(paths);
}

/**
 * Builds a closed loop inset from the plate edge by `offset`, following the
 * body but *bypassing* the corners — the curve a channel is run along.
 *
 * Returns null before the outline is laid out. Tested through `purflingOffset`
 * because that is what the offset arcs are built against; the old test also
 * required `innerFlutingDepth`, which no longer decides anything here: the
 * channel's reach is an output of the gouge, and callers pass the offset they
 * want directly.
 */
export function defineFlutingPath(p: EnricoCerutiParams, offset: number, centerOffset?: number): string | null {
    if (p.purflingOffset === null) return null;
    const flutingOffset = offset - p.rib - p.overhang;
    const centerFlutingOffet = centerOffset !== undefined ? centerOffset - p.rib - p.overhang : flutingOffset;
    const flutingArcs = defineFlutingArcs(p, -flutingOffset, -centerFlutingOffet);
    const mirrored = flutingArcs.map(arc => flipArcAboutY(arc));
    const paths = [...flutingArcs, ...mirrored].map(arc => pathFromArc(arc));
    if (p.options.useViolNeck) {
        const top = violNeckTopLine(p, -flutingOffset);
        if (top) paths.push(top);
    }
    try {
        return unifyConnectedSvgPaths(paths);
    } catch {
        // joinFlutingTransition already reported why (a c-bout/main-body join too degenerate to
        // draw) and dropped the connecting arc, which is what leaves this gap. Null hands the
        // panel the same "nothing to draw yet" case it already has for an unconfigured channel.
        return null;
    }
}

/**
 * An eye's visible rim runs the long way around, from the point where its shoulder arc peels off
 * tangentially to the point where the cut departs — the short arc between those two points is the
 * notch the wing cuts into, and isn't drawn. `pathFromArc` always takes the short way, so this
 * forces the complementary sweep instead — the path-string counterpart of `renderArcFromArc`'s
 * `longArc` flag.
 */
function pathFromArcLongWay(arc: Arc): string {
    const startPt = pointOnCircle(arc, arc.start);
    const endPt = pointOnCircle(arc, arc.end);

    const largeArcFlag = 1;
    const sweepFlag = normalizeRadians(arc.end - arc.start) <= TURN.half ? 0 : 1;

    return `M ${startPt.x} ${startPt.y} A ${arc.r} ${arc.r} 0 ${largeArcFlag} ${sweepFlag} ${endPt.x} ${endPt.y}`;
}

/**
 * Stitches one f-hole's already-solved arcs (`calculateFholeContours` in ceruti-calcs.ts) into a
 * single closed outline, the way `renderFholeContours` draws them but as one path string instead
 * of ten colored segments — `flip` mirrors it to the bass side. The eye arcs aren't stored on
 * `p.fHoles` — like `violNeckCap`'s fillet, they're cheap to re-derive from what's already solved,
 * and it keeps the eye-rim geometry here with the rest of the path assembly rather than splitting
 * it across two files.
 *
 * Exported (rather than folded into `defineFholePath`) for the cutting-template export, which
 * wants one unmirrored hole on its own sheet, not the pair `defineFholePath` draws on the plate.
 */
export function defineOneFholePath(p: EnricoCerutiParams, flip: boolean, renderEyes: boolean = true): string {
    const f = p.fHoles!;
    const xf = flip ? flipArcAboutY : (arc: Arc) => arc;
    const pxf = flip ? flipPointAboutY : (pt: Pt) => pt;

    const upperEyeJoin = circleCircleIntersections(f.UEye!, f.U1!)[0];
    const upperEyeArc = new Arc(f.UEye!.x, f.UEye!.y, f.UEye!.r, angleFromCenter(f.UEye!, upperEyeJoin), f.UCut!.angleOnEye!);
    const upperCutPt = pointOnCircle(f.UEye!, f.UCut!.angleOnEye!);

    const lowerEyeJoin = circleCircleIntersections(f.LEye!, f.L1!)[0];
    const lowerEyeArc = new Arc(f.LEye!.x, f.LEye!.y, f.LEye!.r, angleFromCenter(f.LEye!, lowerEyeJoin), f.LCut!.angleOnEye!);
    const lowerCutPt = pointOnCircle(f.LEye!, f.LCut!.angleOnEye!);

    const outerStemTop = pointOnCircle(f.S2!, f.S2!.end);
    const outerStemBottom = pointOnCircle(f.S4!, f.S4!.start);
    const innerStemTop = pointOnCircle(f.S1!, f.S1!.start);
    const innerStemBottom = pointOnCircle(f.S3!, f.S3!.end);

    const paths = [
        renderEyes ? pathFromArcLongWay(xf(upperEyeArc)) : pathFromArc(xf(upperEyeArc)),
        pathFromArc(xf(f.U1!)),
        pathFromArc(xf(f.U2!)),
        ...(p.options.U21DoubleArc ? [pathFromArc(xf(f.U21!))] : []),
        pathFromArc(xf(f.S2!)),
        pathFromLine(pxf(outerStemTop), pxf(outerStemBottom)),
        pathFromArc(xf(f.S4!)),
        pathFromArc(xf(f.L3!)),
        pathFromLine(pxf(f.LTip!), pxf(lowerCutPt)),
        renderEyes ? pathFromArcLongWay(xf(lowerEyeArc)) : pathFromArc(xf(lowerEyeArc)),
        pathFromArc(xf(f.L1!)),
        pathFromArc(xf(f.L2!)),
        ...(p.options.L21DoubleArc ? [pathFromArc(xf(f.L21!))] : []),
        pathFromArc(xf(f.S3!)),
        pathFromLine(pxf(innerStemBottom), pxf(innerStemTop)),
        pathFromArc(xf(f.S1!)),
        pathFromArc(xf(f.U3!)),
        pathFromLine(pxf(f.UTip!), pxf(upperCutPt)),
    ];

    return unifyConnectedSvgPaths(paths);
}

/**
 * Both f-holes, as they sit on the actual plate — `p.fHoles` is authored once on the treble
 * (positive-x) side, same as every bout arc, so the bass-side hole is its mirror rather than a
 * second solve. The two loops don't meet, so they're joined by plain concatenation rather than
 * `unifyConnectedSvgPaths`, which would (rightly) throw trying to stitch two disconnected shapes
 * into one.
 */
export function defineFholePath(p: EnricoCerutiParams): string {
    return combinePathStrings([defineOneFholePath(p, false), defineOneFholePath(p, true)]);
}

// the scroll's side profile in ceruti-scroll.ts's frame, off a scroll calculateScroll solved whole:
// the back from the eye's back under the eye and out round the spiral and down to where the nape
// meets the neck's back, then the front up from the nut. Each
// straight runs between the arcs either side of it, so none is read off its stored length
export function defineSideScrollPath(p: EnricoCerutiParams): string {
    const v = p.scroll!;
    const arc = (a: Arc) => arcPathData(a, a.r, a.start, a.end);
    // S3, the nape and F1 are stored counterclockwise but turn clockwise along the edge, so they're
    // drawn end to start to keep every piece running on from the last
    const backward = (a: Arc) => {
        const from = pointOnCircle(a, a.end);
        const to = pointOnCircle(a, a.start);
        const large = normalizeRadians(a.end - a.start) > TURN.half ? 1 : 0;
        return `M ${from.x},${from.y} A ${a.r},${a.r} 0 ${large},0 ${to.x},${to.y}`;
    };
    const at = pointOnCircle;
    const flatTop = at(v.F0, v.F0.start);

    const back = [
        arcPathData(v.eye, v.eye.r, -TURN.half, 0),
        ...[...v.spiral!].reverse().map(arc),
        arc(v.S0), arc(v.S1), arc(v.S2),
        pathFromLine(at(v.S2, v.S2.end), at(v.S3, v.S3.end)),
        backward(v.S3),
        pathFromLine(at(v.S3, v.S3.start), at(v.nape, v.nape.end)),
        backward(v.nape),
    ];
    const front = [
        pathFromLine(new Pt(flatTop.x, flatTop.y - v.flat), flatTop),
        arc(v.F0),
        pathFromLine(at(v.F0, v.F0.end), at(v.F1, v.F1.end)),
        backward(v.F1),
    ];
    return combinePathStrings([...back, ...front]);
}

// the scroll's frame set on the neck in the body's side elevation: its origin is the nut on the neck's
// front, +x the neck's normal toward the fingerboard and +y up the neck, so the neck angle turns it
// and the nut's place moves it there
export function scrollOnNeck(p: EnricoCerutiParams): Matrix2D {
    const nk = p.neck!;
    const normal = vectorFromSlope(nk.angle);
    const up = vectorFromSlope(nk.angle + TURN.quarter);
    return [normal.a, normal.b, up.a, up.b, nk.neckTop!.x, nk.neckTop!.y];
}

export function definePlacedSideScrollPath(p: EnricoCerutiParams): string {
    return transformPath(defineSideScrollPath(p), scrollOnNeck(p));
}

// the mortise floor, inside the rib's outer face by the mortise depth
export function mortiseFloorY(p: EnricoCerutiParams): number {
  return p.height - p.overhang - p.neck!.mortiseDepth;
}

// the neck's half-width seen from the front, top width at the nut to root width at the mortise
// floor; the fingerboard carries the same taper on down over the body
export function neckHalfWidthAt(p: EnricoCerutiParams, y: number): number {
  const nk = p.neck!;
  const topY = nk.neckTop!.y;
  return (nk.topWidth + (nk.rootWidth - nk.topWidth) * (topY - y) / (topY - mortiseFloorY(p))) / 2;
}

// the fingerboard's end, its length down the neck from the nut
export function fingerboardEnd(p: EnricoCerutiParams): Pt {
  const nk = p.neck!;
  return pointAtDistanceToward(nk.neckTop!, nk.root!, p.stringSetup!.fingerboardLength);
}

// a plate in plan: its outline, the purfling lines it has, and the f-holes one path each
export interface PlatePlan {
  outline: string;
  purfling: string[];
  fHoles: string[];
}

// the instrument from the front, in the plan's frame: the plate with whatever the neck covers cut
// away, and the outlines laid over it — the fingerboard, or the bare neck with the board off, and
// the nut past its end
export function defineFrontProfilePath(p: EnricoCerutiParams, body: PlatePlan, showFingerboard = true): { body: PlatePlan; neck: string; nut: string } {
  const nk = p.neck!;
  const rootY = mortiseFloorY(p);
  const topY = nk.neckTop!.y;
  const neck = pathFromPolygon([
    new Pt(-nk.rootWidth / 2, rootY), new Pt(nk.rootWidth / 2, rootY),
    new Pt(nk.topWidth / 2, topY), new Pt(-nk.topWidth / 2, topY),
  ]);
  const fbEndY = fingerboardEnd(p).y;
  const fbEndHalf = neckHalfWidthAt(p, fbEndY);
  const board = pathFromPolygon([
    new Pt(-fbEndHalf, fbEndY), new Pt(fbEndHalf, fbEndY),
    new Pt(nk.topWidth / 2, topY), new Pt(-nk.topWidth / 2, topY),
  ]);

  const { nutHeight, nutWidth } = p.stringSetup!;
  const nutY = moveInVectorSpace(nk.neckTop!, [{ ...vectorFromSlope(nk.angle + TURN.quarter), mag: nutHeight }]).y;
  const nut = pathFromPolygon([
    new Pt(-nutWidth / 2, topY), new Pt(nutWidth / 2, topY),
    new Pt(nutWidth / 2, nutY), new Pt(-nutWidth / 2, nutY),
  ]);

  // the neck too under the board, in case a short board ends above the mortise floor
  const cover = showFingerboard ? [neck, board] : [neck];
  const cut = (d: string) => occludePath(d, cover).visible;
  return {
    body: {
      outline: cut(body.outline),
      purfling: body.purfling.map(cut).filter(d => !!d),
      fHoles: body.fHoles.map(cut).filter(d => !!d),
    },
    neck: showFingerboard ? board : neck,
    nut,
  };
}

// the neck from behind, in the plan's frame: its two sides from where they come out past the back
// plate's `outline` up to the nut. The plate is nearest the eye, so it hides the foot in the body
export function defineBackNeckPath(p: EnricoCerutiParams, outline: string): string {
  const nk = p.neck!;
  const rootY = mortiseFloorY(p);
  const topY = nk.neckTop!.y;
  return combinePathStrings([1, -1].map(side =>
    occludePath(pathFromLine(new Pt(side * nk.rootWidth / 2, rootY), new Pt(side * nk.topWidth / 2, topY)), outline).visible,
  ).filter(d => !!d));
}

