import { circleCircleIntersections, angleFromCenter, dist, pointOnCircle, offsetArcRadius, flipArcAboutY, flipPointAboutY, lineCircleIntersection, findJoiningArcs } from "../helpers/draftMath";
import { pathFromArc, pathFromLine, pathFromCornerCubic, unifyConnectedSvgPaths } from "../helpers/svgPathMath";
import { Arc, arcFromCircle, Pt, Rectangle } from "../models/types";
import { error } from "../shared/message-emitter";
import { EnricoCerutiParams } from "./ceruti-types";

// ===== Path/contour builders =====
// Takes the outline already solved by ceruti-calcs.ts (calculateMainBouts,
// calculateCorners, calculateCenterBout, calculateOuterArcs) and stitches it
// into the actual SVG path strings the app draws or exports: inner trace,
// outer trace, insets, purfling, fluting. Split out of ceruti-calcs.ts because
// "where do the arcs go" and "how do you turn solved arcs into a path string"
// are different questions a reader is usually asking one at a time.

export function defineInnerArcs(p: EnricoCerutiParams): Arc[] {
    let fullPath = [];
    fullPath.push(p.bouts.L0, p.bouts.L1);
    if (p.options.useViolCornerLC) {
        fullPath.push(p.bouts.L4);
    } else {
        fullPath.push(p.bouts.L2);
        fullPath.push(p.bouts.L3);

        if (p.options.L31DoubleArc) 
            fullPath.push(p.bouts.L31);
    }

    fullPath.push(p.bouts.C0, p.bouts.C1, p.bouts.C2);
        if (p.options.C21DoubleArc) 
            fullPath.push(p.bouts.C21);
        if (p.options.C11DoubleArc) 
            fullPath.push(p.bouts.C11);

    if (p.options.useViolCornerUC) {
        fullPath.push(p.bouts.U4);
    } else {
        fullPath.push(p.bouts.U3);
        fullPath.push(p.bouts.U2);

        if (p.options.U31DoubleArc)
            fullPath.push(p.bouts.U31);
    }
    fullPath.push(p.bouts.U1);
    fullPath.push(p.bouts.U0);
    if (p.options.useViolNeck)
        fullPath.push(p.viol?.V0!);

    return fullPath;
}

export function defineOffsetArcs(p: EnricoCerutiParams, offset?: number, corners: boolean = false, centerOffset?: number): Arc[] {
    offset ??= p.overhang + p.rib;
    let arcs = [];


    arcs.push(offsetArcRadius(p.bouts.L0, offset), offsetArcRadius(p.bouts.L1, offset));
    if (p.options.useViolCornerLC) {
        corners && arcs.push(offsetArcRadius(p.bouts.L4, offset));
    } else {
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

    if (p.options.useViolCornerUC) {
       corners && arcs.push(offsetArcRadius(p.bouts.U4, offset));
    } else {
        // corners && arcs.push(offsetArcRadius(p.bouts.U3, -offset));
        arcs.push(offsetArcRadius(p.bouts.U2, offset));
    }
    arcs.push(offsetArcRadius(p.bouts.U1, offset));
    arcs.push(offsetArcRadius(p.bouts.U0, offset));
    if (p.options.useViolNeck)
        arcs.push(offsetArcRadius(p.viol?.V0!, -offset));

    // if we include corners we need to calculate the new corner intersection point
    // these corners are distinct from the "outer corners" which have unique ends, and are joined by 
    // a "cutoff" line
    // instead these arcs are used as a PURE offset from the inner path
    // this can be used to move the purfling line around, for example
    if (corners) {
        let U3Offset = offsetArcRadius(p.bouts.U3, -offset);
        let U31Offset = p.options.U31DoubleArc ? offsetArcRadius(p.bouts.U31, -offset) : null;
        let C2Offset = offsetArcRadius(p.bouts.C2, -offset);
        let C21Offset = p.options.C21DoubleArc ?  offsetArcRadius(p.bouts.C21!, -offset) : null;
        let L3Offset = offsetArcRadius(p.bouts.L3, -offset);
        let L31Offset = p.options.L31DoubleArc ? offsetArcRadius(p.bouts.L31!, -offset) : null;
        let C1Offset = offsetArcRadius(p.bouts.C1, -offset);
        let C11Offset = p.options.C11DoubleArc ? offsetArcRadius(p.bouts.C11!, -offset) : null;

        let U4Offset = p.options.useViolCornerUC ? offsetArcRadius(p.bouts.U4!, offset) : null;
        let L4Offset = p.options.useViolCornerLC ? offsetArcRadius(p.bouts.L4!, offset) : null;

        // the end state of our new corner will depend on which arcs we are using
        let upperCorner;
        if (p.options.useViolCornerUC)
            upperCorner = circleCircleIntersections(U4Offset, C2Offset).sort((a, b) => a.x - b.x)[1];
        else if (p.options.U31DoubleArc && p.options.C21DoubleArc)
            upperCorner = circleCircleIntersections(U31Offset, C21Offset).sort((a, b) => a.x - b.x)[0];
        else if (p.options.U31DoubleArc)
            upperCorner = circleCircleIntersections(U31Offset, C2Offset).sort((a, b) => a.x - b.x)[0];
        else if (p.options.C21DoubleArc)
            upperCorner = circleCircleIntersections(U3Offset, C21Offset).sort((a, b) => a.x - b.x)[0];
        else
            upperCorner = circleCircleIntersections(U3Offset, C2Offset).sort((a, b) => a.x - b.x)[0];

        let lowerCorner;
        if (p.options.useViolCornerLC)
            lowerCorner = circleCircleIntersections(L4Offset, C1Offset).sort((a, b) => a.x - b.x)[1];
        else if (p.options.L31DoubleArc && p.options.C11DoubleArc)
            lowerCorner = circleCircleIntersections(L31Offset, C11Offset).sort((a, b) => a.x - b.x)[0];
        else if (p.options.L31DoubleArc)
            lowerCorner = circleCircleIntersections(L31Offset, C1Offset).sort((a, b) => a.x - b.x)[0];
        else if (p.options.C11DoubleArc)
            lowerCorner = circleCircleIntersections(L3Offset, C11Offset).sort((a, b) => a.x - b.x)[0];
        else
            lowerCorner = circleCircleIntersections(L3Offset, C1Offset).sort((a, b) => a.x - b.x)[0];

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
    const ints = lineCircleIntersection(cutPt1, cutPt2, scaledArc);
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
            ? pointOnCircle(offsetArcRadius(p.bouts.C21, -inset), p.outerCorners.C21!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C2, -inset), p.outerCorners.C2.end);

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
        const C2off = offsetArcRadius(p.bouts.C2, -offset);
        if (!p.options.C21DoubleArc) C2off.end = cutoffEndAtOffset(C2off, ucPt1, ucPt2, ucPt2, p.outerCorners.C2.end);
        arcs.push(C2off);
        arcs.push(flipArcAboutY(C2off));
        if (p.options.C21DoubleArc) {
            const C21off = offsetArcRadius(p.bouts.C21, -offset);
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
            ? pointOnCircle(offsetArcRadius(p.bouts.C11, -inset), p.outerCorners.C11!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C1, -inset), p.outerCorners.C1.end);
        const lcPt2 = p.options.L31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.L31, -inset), p.outerCorners.L31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.L3, -inset), p.outerCorners.L3.end);

        const C1off = offsetArcRadius(p.bouts.C1, -offset);
        if (!p.options.C11DoubleArc) C1off.end = cutoffEndAtOffset(C1off, lcPt1, lcPt2, lcPt1, p.outerCorners.C1.end);
        arcs.push(C1off);
        arcs.push(flipArcAboutY(C1off));
        if (p.options.C11DoubleArc) {
            const C11off = offsetArcRadius(p.bouts.C11, -offset);
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
function angleBeforeEnd(arc: Arc, degrees: number): number {
    const delta = Math.atan2(Math.sin(arc.end - arc.start), Math.cos(arc.end - arc.start));
    const dir = Math.sign(delta) || 1;
    return arc.end - dir * degrees * Math.PI / 180;
}

export function defineFlutingArcs(p: EnricoCerutiParams, offset: number, centerOffset?: number): Arc[] {
    const flutingArcs = defineOffsetArcs(p, offset, false, centerOffset);
    // flutingArcs[2] is always C0off here: whichever side is viol, its corner arc(s)
    // (L2/U2) drop out of defineOffsetArcs, leaving C0 adjacent to L1/U1 in the array.

    if (p.options.useViolCornerLC && p.options.useViolCornerUC) {
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        U4Offset.end = angleBeforeEnd(U4Offset, 10);
        let upperJoin = findJoiningArcs(flutingArcs[2], "start", U4Offset, "end", true)
        flutingArcs.push(U4Offset);
        for (const arc of upperJoin) {
            flutingArcs.push(arc);
        }

        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        L4Offset.end = angleBeforeEnd(L4Offset, 10);
        let lowerJoin = findJoiningArcs(L4Offset, "end", flutingArcs[2], "end", false)
        flutingArcs.push(L4Offset);
        for (const arc of lowerJoin) {
            flutingArcs.push(arc);
        }
        return flutingArcs;
    }


    if (p.options.useViolCornerUC){
        let lowerJoin = findJoiningArcs(flutingArcs[2], "end", flutingArcs[3], "end", false)
        for (const arc of lowerJoin) {
            flutingArcs.push(arc);
        }
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        U4Offset.end = angleBeforeEnd(U4Offset, 12);
        let upperJoin = findJoiningArcs(flutingArcs[3], "start", U4Offset, "end", true)
        flutingArcs.push(U4Offset);
        for (const arc of upperJoin) {
            flutingArcs.push(arc);
        }
        return flutingArcs;
    }
    if (p.options.useViolCornerLC) {
        let upperJoin = findJoiningArcs(flutingArcs[2], "start", flutingArcs[3], "end", true)
        for (const arc of upperJoin) {
            flutingArcs.push(arc);
        }
        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        L4Offset.end = angleBeforeEnd(L4Offset, 12);
        let lowerJoin = findJoiningArcs(L4Offset, "end", flutingArcs[2], "end", false)
        flutingArcs.push(L4Offset);
        for (const arc of lowerJoin) {
            flutingArcs.push(arc);
        }

        return flutingArcs;
    }

    let lowerJoin = findJoiningArcs(flutingArcs[2], "end", flutingArcs[3], "end")
    for (const arc of lowerJoin) {
        flutingArcs.push(arc);
    }

    let upperJoin = findJoiningArcs(flutingArcs[3], "start", flutingArcs[4], "end", true)
    for (const arc of upperJoin) {
        flutingArcs.push(arc);
    }

    return flutingArcs;
}

export function defineInnerPath(p: EnricoCerutiParams): string {
    let arcs = defineInnerArcs(p);
    let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
    arcs = arcs.concat(mirroredArcs);

    let paths: string[] = arcs.map(arc => pathFromArc(arc));

    if (p.options.useViolNeck) {
        let EndPt = pointOnCircle(p.viol?.V0!, p.viol?.V0.start ?? 0);
        paths.push(pathFromLine(EndPt, flipPointAboutY(EndPt)))
    }

    let path = unifyConnectedSvgPaths(paths);
    return path;
}

// offset should be positive to go outside of the inner path,
// but technically its up to the caller
// this is technically an outer path function due to the corner logic
export function defineOuterPath(p: EnricoCerutiParams, offset?: number, closeArcs = true, button = false): string {
    offset ??= p.overhang + p.rib;
    let arcs = defineOffsetArcs(p, offset);

    let U0ForButton = offsetArcRadius(p.bouts.U0, offset);
    let buttonPaths: string[] = [];
    if (button && !p.options.useViolNeck) {
        p.button ??= new Rectangle(new Pt(-10, p.height - offset), new Pt(10, p.height - offset + 5));
        let U0Intersect = lineCircleIntersection(new Pt(p.button.width / 2, p.height), new Pt(p.button.width / 2, 0), U0ForButton).sort((a, b) => a.y - b.y)[1]; // long vertical line
        buttonPaths.push(pathFromLine(U0Intersect, {...U0Intersect , y: U0Intersect.y + p.button.height}));
        buttonPaths.push(pathFromLine(flipPointAboutY(U0Intersect), flipPointAboutY({...U0Intersect , y: U0Intersect.y + p.button.height})));
        let buttonCircle = {y: U0Intersect.y + p.button.height, x: 0, r: p.button.width / 2};
        let buttonArc = arcFromCircle(buttonCircle, 0, Math.PI)

        buttonPaths.push(pathFromArc(buttonArc));

        // we need to edit U0 as well
        // TODO, perhaps vesica if the join is weird?
        // U0 should be the final arc
        let U0Angle = angleFromCenter(U0ForButton, U0Intersect);
        arcs[arcs.length - 1].start = U0Angle
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
            ? pointOnCircle(offsetArcRadius(p.bouts.C21, -inset), p.outerCorners.C21!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C2, -inset), p.outerCorners.C2.end);

        if (p.options.U31DoubleArc && p.options.C21DoubleArc) {
            const U31c = offsetArcRadius(p.bouts.U31, -offset);
            U31c.end = cutoffEndAtOffset(U31c, ucPt1, ucPt2, ucPt1, p.outerCorners.U31!.end);
            const C21c = offsetArcRadius(p.bouts.C21, -offset);
            C21c.end = cutoffEndAtOffset(C21c, ucPt1, ucPt2, ucPt2, p.outerCorners.C21!.end);
            paths.push(ucCornerPath(U31c, C21c));
            paths.push(ucCornerPath(flipArcAboutY(U31c), flipArcAboutY(C21c)));
        }
        else if (p.options.U31DoubleArc) {
            const U31c = offsetArcRadius(p.bouts.U31, -offset);
            U31c.end = cutoffEndAtOffset(U31c, ucPt1, ucPt2, ucPt1, p.outerCorners.U31!.end);
            const C2c = offsetArcRadius(p.bouts.C2, -offset);
            C2c.end = cutoffEndAtOffset(C2c, ucPt1, ucPt2, ucPt2, p.outerCorners.C2.end);
            paths.push(ucCornerPath(U31c, C2c));
            paths.push(ucCornerPath(flipArcAboutY(U31c), flipArcAboutY(C2c)));
        }
        else if (p.options.C21DoubleArc) {
            const U3c = offsetArcRadius(p.bouts.U3, -offset);
            U3c.end = cutoffEndAtOffset(U3c, ucPt1, ucPt2, ucPt1, p.outerCorners.U3.end);
            const C21c = offsetArcRadius(p.bouts.C21, -offset);
            C21c.end = cutoffEndAtOffset(C21c, ucPt1, ucPt2, ucPt2, p.outerCorners.C21!.end);
            paths.push(ucCornerPath(U3c, C21c));
            paths.push(ucCornerPath(flipArcAboutY(U3c), flipArcAboutY(C21c)));
        }
        else {
            const U3c = offsetArcRadius(p.bouts.U3, -offset);
            U3c.end = cutoffEndAtOffset(U3c, ucPt1, ucPt2, ucPt1, p.outerCorners.U3.end);
            const C2c = offsetArcRadius(p.bouts.C2, -offset);
            C2c.end = cutoffEndAtOffset(C2c, ucPt1, ucPt2, ucPt2, p.outerCorners.C2.end);
            paths.push(ucCornerPath(U3c, C2c));
            paths.push(ucCornerPath(flipArcAboutY(U3c), flipArcAboutY(C2c)));
        }
    }

    if (closeArcs && !p.options.useViolCornerLC) {
        const inset = p.overhang + p.rib;
        const lcPt1 = p.options.C11DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C11, -inset), p.outerCorners.C11!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C1, -inset), p.outerCorners.C1.end);
        const lcPt2 = p.options.L31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.L31, -inset), p.outerCorners.L31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.L3, -inset), p.outerCorners.L3.end);

        if (p.options.C11DoubleArc && p.options.L31DoubleArc) {
            const C11c = offsetArcRadius(p.bouts.C11, -offset);
            C11c.end = cutoffEndAtOffset(C11c, lcPt1, lcPt2, lcPt1, p.outerCorners.C11!.end);
            const L31c = offsetArcRadius(p.bouts.L31, -offset);
            L31c.end = cutoffEndAtOffset(L31c, lcPt1, lcPt2, lcPt2, p.outerCorners.L31!.end);
            paths.push(lcCornerPath(C11c, L31c));
            paths.push(lcCornerPath(flipArcAboutY(C11c), flipArcAboutY(L31c)));
        }
        else if (p.options.C11DoubleArc) {
            const C11c = offsetArcRadius(p.bouts.C11, -offset);
            C11c.end = cutoffEndAtOffset(C11c, lcPt1, lcPt2, lcPt1, p.outerCorners.C11!.end);
            const L3c = offsetArcRadius(p.bouts.L3, -offset);
            L3c.end = cutoffEndAtOffset(L3c, lcPt1, lcPt2, lcPt2, p.outerCorners.L3.end);
            paths.push(lcCornerPath(C11c, L3c));
            paths.push(lcCornerPath(flipArcAboutY(C11c), flipArcAboutY(L3c)));
        }
        else if (p.options.L31DoubleArc) {
            const C1c = offsetArcRadius(p.bouts.C1, -offset);
            C1c.end = cutoffEndAtOffset(C1c, lcPt1, lcPt2, lcPt1, p.outerCorners.C1.end);
            const L31c = offsetArcRadius(p.bouts.L31, -offset);
            L31c.end = cutoffEndAtOffset(L31c, lcPt1, lcPt2, lcPt2, p.outerCorners.L31!.end);
            paths.push(lcCornerPath(C1c, L31c));
            paths.push(lcCornerPath(flipArcAboutY(C1c), flipArcAboutY(L31c)));
        }
        else {
            const C1c = offsetArcRadius(p.bouts.C1, -offset);
            C1c.end = cutoffEndAtOffset(C1c, lcPt1, lcPt2, lcPt1, p.outerCorners.C1.end);
            const L3c = offsetArcRadius(p.bouts.L3, -offset);
            L3c.end = cutoffEndAtOffset(L3c, lcPt1, lcPt2, lcPt2, p.outerCorners.L3.end);
            paths.push(lcCornerPath(C1c, L3c));
            paths.push(lcCornerPath(flipArcAboutY(C1c), flipArcAboutY(L3c)));
        }
    }

    paths.push(...arcs.map(arc => pathFromArc(arc)));

     if (p.options.useViolNeck) {
        if (button) {
            let offsetV0 = offsetArcRadius(p.viol?.V0!, - offset);
            let EndPt = pointOnCircle(offsetV0, offsetV0.start ?? 0);
            let EndPtOffset = {...EndPt, y: EndPt.y + offset} // we need to offset the end point so that the line doesn't intersect with the arc, but rather is tangent to it, which is more manufacturable
            paths.push(pathFromLine(EndPt, EndPtOffset))
            paths.push(pathFromLine(flipPointAboutY(EndPtOffset), flipPointAboutY(EndPt)))

            p.button ??= new Rectangle(new Pt(10, EndPtOffset.y), new Pt(-10, EndPtOffset.y + 5));
            buttonPaths.push(pathFromLine({x: p.button.width / 2, y: EndPtOffset.y}, {x: p.button.width / 2, y: EndPtOffset.y + p.button.height}));
            buttonPaths.push(pathFromLine({x: -p.button.width / 2, y: EndPtOffset.y}, {x: -p.button.width / 2, y: EndPtOffset.y + p.button.height}));

            let buttonCircle = {y: EndPtOffset.y + p.button.height, x: 0, r: p.button.width / 2};
            let buttonArc = arcFromCircle(buttonCircle, 0, Math.PI)
            buttonPaths.push(pathFromArc(buttonArc));

            paths.push(pathFromLine(EndPtOffset, {x: p.button.width / 2, y: EndPtOffset.y}))
            paths.push(pathFromLine(flipPointAboutY(EndPtOffset), {x: -p.button.width / 2, y: EndPtOffset.y}))

        }
        else {
            let offsetV0 = offsetArcRadius(p.viol?.V0!, - offset);
            let EndPt = pointOnCircle(offsetV0, offsetV0.start ?? 0);
            let EndPtOffset = {...EndPt, y: EndPt.y + offset} // we need to offset the end point so that the line doesn't intersect with the arc, but rather is tangent to it, which is more manufacturable
            // we need to make small risers for the offset
            paths.push(pathFromLine(EndPt, EndPtOffset))

            paths.push(pathFromLine(EndPtOffset, flipPointAboutY(EndPtOffset)))
            paths.push(pathFromLine(flipPointAboutY(EndPtOffset), flipPointAboutY(EndPt)))
        }

    }
    
    let path = unifyConnectedSvgPaths([...paths, ...buttonPaths]);
    return path;
}

/**
 * Builds an inset path starting from the outer edge, offset inward by `delta`.
 * The cutoff connector at each corner is parallel to the outer cutoff line and
 * separated from it by exactly `delta` (perpendicular distance).
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
        const C2off = offsetArcRadius(p.bouts.C2, -innerOffset);
        const int = circleCircleIntersections(U4off, C2off);
        U4off.end = angleFromCenter(U4off, int[0]);
        C2off.end = angleFromCenter(C2off, int[0]);
        cornerArcs.push(U4off, flipArcAboutY(U4off), C2off, flipArcAboutY(C2off));
    } else {
        const ucPt1 = p.options.U31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.U31, -inset), p.outerCorners.U31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.U3, -inset), p.outerCorners.U3.end);
        const ucPt2 = p.options.C21DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C21, -inset), p.outerCorners.C21!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C2, -inset), p.outerCorners.C2.end);
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

        const C2off = offsetArcRadius(p.bouts.C2, -innerOffset);
        let C21off: Arc | null = null;
        if (!p.options.C21DoubleArc) {
            C2off.end = cutoffEndAtOffset(C2off, ucLine.p1, ucLine.p2, ucLine.p2, p.outerCorners.C2.end);
        }
        cornerArcs.push(C2off, flipArcAboutY(C2off));

        if (p.options.C21DoubleArc) {
            C21off = offsetArcRadius(p.bouts.C21, -innerOffset);
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
        const C1off = offsetArcRadius(p.bouts.C1, -innerOffset);
        const int = circleCircleIntersections(L4off, C1off);
        L4off.end = angleFromCenter(L4off, int[1]);
        C1off.end = angleFromCenter(C1off, int[1]);
        cornerArcs.push(L4off, flipArcAboutY(L4off), C1off, flipArcAboutY(C1off));
    } else {
        const lcPt1 = p.options.C11DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.C11, -inset), p.outerCorners.C11!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.C1, -inset), p.outerCorners.C1.end);
        const lcPt2 = p.options.L31DoubleArc
            ? pointOnCircle(offsetArcRadius(p.bouts.L31, -inset), p.outerCorners.L31!.end)
            : pointOnCircle(offsetArcRadius(p.bouts.L3, -inset), p.outerCorners.L3.end);
        const lcLine = insetCutoffLine(lcPt1, lcPt2, delta, p.bouts.C0);

        const C1off = offsetArcRadius(p.bouts.C1, -innerOffset);
        let C11off: Arc | null = null;
        if (!p.options.C11DoubleArc) {
            C1off.end = cutoffEndAtOffset(C1off, lcLine.p1, lcLine.p2, lcLine.p1, p.outerCorners.C1.end);
        }
        cornerArcs.push(C1off, flipArcAboutY(C1off));

        if (p.options.C11DoubleArc) {
            C11off = offsetArcRadius(p.bouts.C11, -innerOffset);
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
    return unifyConnectedSvgPaths([...arcs, ...mirrored].map(arc => pathFromArc(arc)));
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
    return unifyConnectedSvgPaths([...arcs, ...mirrored].map(arc => pathFromArc(arc)));
}

/**
 * Builds the closed inner-boundary path of the fluting platform region.
 * Returns null if either purflingOffset or flutingWidth is not yet set.
 */
export function defineFlutingPath(p: EnricoCerutiParams, offset: number, centerOffset?: number): string | null {
    if (p.purflingOffset === null || p.innerFlutingDepth === null) return null;
    const flutingOffset = offset - p.rib - p.overhang;
    const centerFlutingOffet = centerOffset !== undefined ? centerOffset - p.rib - p.overhang : flutingOffset;
    const flutingArcs = defineFlutingArcs(p, -flutingOffset, -centerFlutingOffet);
    const mirrored = flutingArcs.map(arc => flipArcAboutY(arc));
    return unifyConnectedSvgPaths([...flutingArcs, ...mirrored].map(arc => pathFromArc(arc)));
}

/**
 * Returns the complete SVG path `d` string for the fluting platform area —
 * the outer trace as the outer boundary and the inner fluting edge as a hole,
 * combined with fill-rule="evenodd". Suitable for SVG/PDF export and rendering.
 * Returns null if the fluting platform is not yet configured.
 */
export function defineFlutingAreaPath(p: EnricoCerutiParams, innerOffset: number, outerOffset: number, centerOffset: number): string | null {
    const innerPath = defineFlutingPath(p, innerOffset, centerOffset);
    if (innerPath === null) return null;
    const outerPath = defineInsetPath(p, outerOffset);
    return `${outerPath} Z ${innerPath} Z`;
}
