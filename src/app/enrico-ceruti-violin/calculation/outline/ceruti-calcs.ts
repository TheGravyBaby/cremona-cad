import { circleCircleIntersections, inscribeCircleWithinCircle, interceptCirclesAndPoint, interceptCirclesAndPointCompound, solveTangentCircleAndLine, filletRightAngleCorner } from "../../../helpers/math/draftMath";
import { angleFromCenter, dist, pointOnCircle, offsetArcRadius, flipRectAboutY, lineCircleIntersection, lineCircleIntersectionWithTolerance, lineFromPointAndSlope, lineFromTwoPoints, moveInVectorSpace, placeCircleOnPointAtAngle, redefineArcCircle, tangentUnitVectorFromLine, TURN, vectorFromSlope } from "../../../helpers/math/simpleGeometry";
import { pathFromRoundedRect, pathFromCircle, pathFromRect, combinePathStrings, translatePath, splitPathStrings } from "../../../helpers/math/pathMath";
import { differenceFromManyPaths, intersectionFromTwoPaths, mirroredLoop } from "../../../helpers/math/pathVibes";
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, Line, Pt, Rectangle } from "../../../models/types";
import { error } from "../../../shared/message-emitter";
import { reportFailures, SolveFailure, solveSection } from "../../../helpers/validators";
import { DefaultParams, EnricoCerutiParams, PathEntry, PathKey } from "../../ceruti-types";
import { cornerOffsetSign, defaultButton, defineFholePath, defineInnerPath, defineOuterPath, definePurflingPath, defineOuterPurflingPath, PlatePlan } from "./ceruti-paths";
import { calculateNeck, defineNeckPath } from "../neck/ceruti-neck";
import { solveScrollForProfile } from "../neck/ceruti-scroll";
import { LongArchSolve, solveLongArch } from "../arching/ceruti-arch-geometry";

// ===== Outline solvers =====
// Solve where the violin body's bouts/corners/center-bout arcs actually sit.
// Mould & block fabrication geometry lives below — both build on this outline
// but are a distinct downstream concern (what you cut the plate out of, not
// the plate's own shape). Path-string construction (turning this solved
// geometry into drawable/exportable SVG paths) lives in ceruti-paths.ts;
// the long-arch/cross-arch/fluting-channel profile system lives in
// ceruti-arching.ts.

export type MainBoutKey = 'U0' | 'U1' | 'L0' | 'L1';
export type MainBoutFailure = SolveFailure<MainBoutKey>;

export function calculateMainBouts(p: EnricoCerutiParams): MainBoutFailure[] {
    let inset = p.overhang + p.rib;

    // initialize bouts if not already done
    if (!p.bouts.U0) {
        let inset = p.overhang + p.rib;

        p.bouts.LBW = p.width;
        p.bouts.UBW = Math.round(p.bouts.LBW * p.ratios.UBtoLB);

        let UBWI = p.bouts.UBW - 2 * inset;
        let LBWI = p.bouts.LBW - 2 * inset;
        let HI = p.height - 2 * inset;

        let U0R = Math.round(UBWI * p.ratios.U0toUBW * 10) / 10;
        p.bouts.U0 = new Arc(0, U0R, U0R);
        let U1R = Math.round(UBWI * p.ratios.U1toUBW * 10) / 10;
        p.bouts.U1 = new Arc(0, UBWI - U1R, U1R);

        let L0R = Math.round(LBWI * p.ratios.L0toLBW * 10) / 10;
        p.bouts.L0 = new Arc(0, inset + L0R, L0R);
        let L1R = Math.round(LBWI * p.ratios.L1toLBW * 10) / 10;
        p.bouts.L1 = new Arc(0, L1R, L1R);
    }

    let UBWI = p.bouts.UBW - 2 * inset;
    let LBWI = p.bouts.LBW - 2 * inset;
    let HI = p.height - 2 * inset;

    if (p.bouts.LBW > p.width || p.bouts.UBW > p.width || (p.bouts.LBW < p.width && p.bouts.UBW < p.width)) 
        p.width = Math.max(p.bouts.LBW, p.bouts.UBW);
    
    // recalcuate display ratios
    p.ratios.UBtoLB = p.bouts.UBW / p.bouts.LBW;
    p.ratios.U0toUBW = p.bouts.U0.r / UBWI;
    p.ratios.U1toUBW = p.bouts.U1.r / UBWI;

    p.ratios.LBtoH = p.bouts.LBW / p.height;
    p.ratios.L0toLBW = p.bouts.L0.r / LBWI;
    p.ratios.L1toLBW = p.bouts.L1.r / LBWI;

    // the one way a main bout breaks: the big arc can't reach far enough out for the small one
    // to both touch it from inside and sit on the bout's width line
    let boutMiss = (
        bigKey: 'U0' | 'L0',
        smallKey: 'U1' | 'L1',
        boutName: string,
        edgeX: number,
        bottom: number,
        top: number,
    ): MainBoutFailure => {
        let big = p.bouts[bigKey]!
        let small = p.bouts[smallKey]!
        let atLeast = big.x === 0 ? ` (at least ${edgeX.toFixed(1)}mm)` : ''
        return {
            message: small.r >= big.r
                ? `${bigKey}/${smallKey}: ${smallKey} has to be smaller than ${bigKey} to turn out to the ${boutName} width.`
                : `${bigKey}/${smallKey}: ${bigKey} can't reach the ${boutName} width. Enlarge ${bigKey}${atLeast}, or narrow the ${boutName}.`,
            unsolved: [bigKey, smallKey],
            circles: [big],
            segments: [[new Pt(edgeX, bottom), new Pt(edgeX, top)]],
        }
    }

    let failures: MainBoutFailure[] = []

    solveSection(failures, 'Lower bout', ['L0', 'L1'], () => {
        p.bouts.L0.y = inset + p.bouts.L0.r;
        // we know the second circle intersects the outer edge where theta = 0
        // thus its x position MUST be R away from the edge
        p.bouts.L1.x = p.bouts.LBW / 2 - p.bouts.L1.r - inset;
        // therefore we have a vertical line where the circle could be
        // in order to cleanly intersect L0 we know the center of U1 must be along a circle
        // which is defined by being L1.r inset from L0
        // therefore the intersection of these two constrains, a vertical line, and a circle within U0 gives us our point
        let L1Ys = lineCircleIntersection(
          { m: Infinity, y: NaN, x: p.bouts.L1.x },
          { x: p.bouts.L0.x, y: p.bouts.L0.y, r: Math.abs(p.bouts.L0.r - p.bouts.L1.r) },
        )
        if (!L1Ys.length)
            return boutMiss('L0', 'L1', 'lower bout', LBWI / 2, 0, p.bouts.LBW)
        p.bouts.L1.y = L1Ys[1].y;

        let lowerIntersect = circleCircleIntersections(p.bouts.L0, p.bouts.L1);
        let L0Angle = angleFromCenter(p.bouts.L0, lowerIntersect[0]);
        let L1Angle = angleFromCenter(p.bouts.L1, lowerIntersect[0]);

        p.bouts.L0 = arcFromCircle(p.bouts.L0, 3 * TURN.quarter, L0Angle);
        p.bouts.L1 = arcFromCircle(p.bouts.L1, L1Angle, 0);
        return null
    })

    solveSection(failures, 'Upper bout', ['U0', 'U1'], () => {
        if (p.options.useViolNeck) {
            p.viol.width ??= p.bouts.UBW * .1
            p.viol.neckRadius ??= 0
            let Vr = p.viol?.V0?.r ?? p.bouts.UBW / 5
            let start = p.viol?.V0?.start ?? TURN.half * 1.05
            let end =  p.viol?.V0?.end ?? 3 * TURN.quarter * .92
            // the flat top face runs out to width/2, then a join of neckRadius turns the corner into
            // the flank. V0 begins where that join ends, so its centre goes back (Vr + R) along the
            // start ray from the join's centre — which puts V0.start *on* the tangency instead of
            // somewhere the join later trims off. At R = 0 the join centre is the corner itself and
            // this is the original placement.
            let joinCenter = new Pt(p.viol.width / 2, p.height - inset - p.viol.neckRadius)
            let VyDiff =  Math.sin(start) * (Vr + p.viol.neckRadius)
            let VxDiff = Math.cos(start) * (Vr + p.viol.neckRadius)
            p.viol.V0 = new Arc(joinCenter.x - VxDiff, joinCenter.y - VyDiff, Vr, start, end)

            let V0End = pointOnCircle(p.viol.V0,  p.viol.V0.end)
        
            // we know that U0 start is -Pi from V0 end
            let U0start = p.viol.V0.end - TURN.half
            let U0YDiff = Math.sin(U0start) * p.bouts.U0.r
            let U0XDiff = Math.cos(U0start) * p.bouts.U0.r
            p.bouts.U0.x = V0End.x - U0XDiff
            p.bouts.U0.y = V0End.y - U0YDiff
            p.bouts.U0.start = U0start

            let U1x = p.bouts.UBW / 2 - p.bouts.U1.r - inset;
            let U1Ys = lineCircleIntersection(
              { m: Infinity, y: NaN, x: U1x },
              { x: p.bouts.U0.x, y: p.bouts.U0.y, r: Math.abs(p.bouts.U0.r - p.bouts.U1.r) },
            )
            if (!U1Ys.length)
                return boutMiss('U0', 'U1', 'upper bout', UBWI / 2, p.height - p.bouts.UBW, p.height)

            p.bouts.U1 = new Arc(U1x, U1Ys[0].y, p.bouts.U1.r)
            let U1U0Int = circleCircleIntersections(p.bouts.U1, p.bouts.U0)[0]
            let U1start = angleFromCenter(p.bouts.U1, U1U0Int)
            let U0End = angleFromCenter(p.bouts.U0, U1U0Int)
            p.bouts.U0.end = U0End
            p.bouts.U1.start = U1start
            p.bouts.U1.end = 0
        }
        else {
            p.bouts.U0.y = p.height - inset - p.bouts.U0.r;
            p.bouts.U0.x = 0;
            p.bouts.U1.x = p.bouts.UBW / 2 - p.bouts.U1.r - inset;
            let U1Ys = lineCircleIntersection(
              { m: Infinity, y: NaN, x: p.bouts.U1.x },
              { x: p.bouts.U0.x, y: p.bouts.U0.y, r: Math.abs(p.bouts.U0.r - p.bouts.U1.r) },
            )
            if (!U1Ys.length)
                return boutMiss('U0', 'U1', 'upper bout', UBWI / 2, p.height - p.bouts.UBW, p.height)
            p.bouts.U1.y = U1Ys[0].y;

            let upperIntersect = circleCircleIntersections(p.bouts.U0, p.bouts.U1);
            let U0Angle = angleFromCenter(p.bouts.U0, upperIntersect[0]);
            let U1Angle = angleFromCenter(p.bouts.U1, upperIntersect[0]);

            p.bouts.U0 = arcFromCircle(p.bouts.U0, TURN.quarter, U0Angle);
            p.bouts.U1 = arcFromCircle(p.bouts.U1, U1Angle, 0);
        }
        return null
    })

    reportFailures(failures, 'Main Bouts')
    return failures
}

/**
 * How far the viol neck may reach across before U0 can no longer carry the outline out to U1.
 *
 * The viol branch above seats U0 tangent to V0's end, then inscribes U1 in it at a fixed x. The
 * point where U1 touches U0 moves *inward* as the neck grows, because a wider neck pushes U0's
 * centre toward U1's. Once that touch falls behind V0's end, U0 has to sweep backwards to reach
 * it and the outline doubles back on itself — a hook at the top of the upper bout. Nothing
 * throws: every circle still intersects, they just intersect in the wrong order.
 *
 * `reach` is V0's end in x. `limit` is where U1 touches U0 along V0's own end direction, which is
 * the furthest out that touch can ever be. Both are closed forms of the geometry solved above —
 * no arcs need placing first, so this can gate an edit rather than only report on one.
 *
 * Everything the neck controls sits in `reach`: half the neck width, plus how far V0 swings out
 * from the join (its radius and the join radius, through the start angle), less where its end
 * lands. `limit` sees none of that — only the upper bout's own width, inset and U1 radius, and
 * the angle V0 hands over at.
 */
export function violNeckJoinLimit(p: EnricoCerutiParams): { reach: number; limit: number; headroom: number } | null {
    if (!p.options.useViolNeck || !p.viol?.V0 || !p.bouts.U1 || p.viol.width == null) return null;

    const inset = p.overhang + p.rib;
    const V0 = p.viol.V0;
    const R = p.viol.neckRadius ?? 0;

    const reach = p.viol.width / 2 - (V0.r + R) * Math.cos(V0.start) + V0.r * Math.cos(V0.end);
    const limit = p.bouts.UBW / 2 - inset - p.bouts.U1.r * (1 + Math.cos(V0.end));

    return { reach, limit, headroom: limit - reach };
}

// an arc of radius r tangent to `from` and through the corner needs r to span half the gap
// between them; the compound pair has no closed form, so it only gets the generic advice
function cornerMiss<K extends string>(
    section: string,
    fromKey: K,
    from: Circle,
    arcKey: K,
    corner: Pt,
    compound: boolean,
    unsolved: K[],
): SolveFailure<K> {
    let needed = Math.abs(dist(from, corner) - from.r) / 2
    return {
        message: compound
            ? `${section}: no ${arcKey} of that radius reaches the corner from ${fromKey}. Bring the corner in toward the body, or give it a larger radius.`
            : `${section}: ${arcKey} can't reach the corner from ${fromKey}. Enlarge ${arcKey} (at least ${needed.toFixed(1)}mm), or bring the corner in toward the body.`,
        unsolved,
        circles: [from],
        segments: [],
        points: [corner],
    }
}

export type CornerKey = 'U2' | 'U3' | 'U31' | 'U4' | 'L2' | 'L3' | 'L31' | 'L4';
export type CornerFailure = SolveFailure<CornerKey>;

export function calculateCorners(p: EnricoCerutiParams): CornerFailure[] {
    let inset = p.overhang + p.rib;
    let UBWI = p.bouts.UBW - 2 * inset;
    let LBWI = p.bouts.LBW - 2 * inset;

    if (p.bouts.U1?.r == p.bouts.U2?.r) {
        p.bouts.U2 = new Arc(p.bouts.U1.x, p.bouts.U1.y, p.bouts.U1.r);
    }
    if (p.bouts.L1?.r == p.bouts.L2?.r) {
        p.bouts.L2 = new Arc(p.bouts.L1.x, p.bouts.L1.y, p.bouts.L1.r);
    }
    // the two defaults are independent, and each guards its own corner, so clearing one corner
    // re-derives just that one — which is what the panel's Reset button does
    if (!p.bouts.LCr) {
        // we set a line at the ratio height of the body, then draw a guide circle from the bout to that line
        // the intersection defines the "default" corner position, courtesy of David Beard
        let lgPt = new Pt(-(p.bouts.LBW - inset) / 2, p.bouts.L1.y);
        let lgC = new Circle(lgPt.x, lgPt.y, p.bouts.LBW - inset)  
        let lgH = p.height * p.ratios.LCYtoH
        let LCr = lineCircleIntersection(lineFromPointAndSlope({x:0, y:lgH}, 0), lgC).sort((a, b) => a.x - b.x)[1]
        p.bouts.LCr = new Pt(Math.round(LCr.x * 10) / 10, Math.round(LCr.y * 10) / 10);
    }
    if (!p.bouts.UCr) {
        let ugPt = new Pt(-p.bouts.UBW / 2, p.bouts.U1.y);
        let ugC = new Circle(ugPt.x, ugPt.y, p.bouts.UBW)
        let ugH = p.height * p.ratios.UCYtoH
        let UCr = lineCircleIntersection(lineFromPointAndSlope({x:0, y:ugH}, 0), ugC).sort((a, b) => a.x - b.x)[1]
        p.bouts.UCr = new Pt(Math.round(UCr.x * 10) / 10, Math.round(UCr.y * 10) / 10);
    }

    let U2R = p.bouts.U2?.r ?? Math.round(UBWI * p.ratios.U2toUBW);
    let U2Y = p.bouts.U2?.y ?? p.bouts.U1.y;
            
    p.bouts.U31 ??= new Arc(0, 0, Math.round(LBWI * (p.ratios.U31toLBW ?? DefaultParams.ratios.U31toLBW)), 17/16 * TURN.half)
    p.bouts.L31 ??= new Arc(0, 0, Math.round(LBWI * (p.ratios.L31toLBW ?? DefaultParams.ratios.L31toLBW)), 15/16 * TURN.half)

    let U1U2Match = false
    let allowHeightFlex = false; // this is a fiddly feature that might be cool one day, needs more work for now

  
    if (p.bouts.U2?.r == p.bouts.U1.r && p.bouts.U2?.y == p.bouts.U1.y && p.bouts.U2?.x == p.bouts.U1.x) {
        // this is a special case where the user has set U2 to be the same as U1, 
        // which causes the math below to break since we won't have two distinct circles to intersect
        U1U2Match = true;
        p.bouts.U1.end = 0
    }
    else if (allowHeightFlex && U2Y != p.bouts.U1.y) {
        let c = p.bouts.U2.r - p.bouts.U1.r;
        let b = p.bouts.U2.y - p.bouts.U1.y
        let U2xPlus = p.bouts.U1.x + Math.sqrt(c * c - b * b)
        let U2xMinus = p.bouts.U1.x - Math.sqrt(c * c - b * b)

        p.bouts.U2.x = Math.min(U2xPlus, U2xMinus);
    }
    else if (allowHeightFlex){
        p.bouts.U2 = new Arc(p.bouts.UBW / 2 - U2R - inset, U2Y, U2R);
    }
    else {
        p.bouts.U2 = new Arc(p.bouts.UBW / 2 - U2R - inset, p.bouts.U1.y, U2R);
    }


    let L2R = p.bouts.L2?.r ?? Math.round(LBWI * p.ratios.L2toLBW);
    let L2Y = p.bouts.L2?.y ?? p.bouts.L1.y;
    let L2U1Match = false
    if (p.bouts.L2?.r == p.bouts.L1.r && p.bouts.L2?.y == p.bouts.L1.y && p.bouts.L2?.x == p.bouts.L1.x) {
        // this is a special case where the user has set L2 to be the same as L1,
        // which causes the math below to break since we won't have two distinct circles to intersect
        L2U1Match = true;
        p.bouts.L1.end = 0
    }
    else if (allowHeightFlex && L2Y != p.bouts.L1.y) {
        let c = p.bouts.L2.r - p.bouts.L1.r;
        let b = p.bouts.L2.y - p.bouts.L1.y
        let L2xPlus = p.bouts.L1.x + Math.sqrt(c * c - b * b)
        let L2xMinus = p.bouts.L1.x - Math.sqrt(c * c - b * b)

        p.bouts.L2.x = Math.min(L2xPlus, L2xMinus);
    }
    else if (allowHeightFlex) {
        p.bouts.L2 = new Arc(p.bouts.LBW / 2 - L2R - inset, L2Y, L2R);
    }
    else {
        p.bouts.L2 = new Arc(p.bouts.LBW / 2 - L2R - inset, p.bouts.L1.y, L2R);
    }

    let failures: CornerFailure[] = []

    solveSection(failures, 'Upper corner', ['U2', 'U3', 'U31', 'U4'], () => {
        if (p.options.U31DoubleArc) {
            let U3r = p.bouts.U3.r
            let U31 =  p.bouts.U31.r
            let theta = p.bouts.U31.start ?? 17/16 * TURN.half
            let compoundCircles = interceptCirclesAndPointCompound(p.bouts.U2!, p.bouts.UCr, U3r, U31, theta).sort((a, b) => a.C1.y - b.C1.y)[1];
            if (!compoundCircles)
                return cornerMiss('Upper corner', 'U2', p.bouts.U2, 'U3', p.bouts.UCr, true, ['U2', 'U3', 'U31', 'U4'])
            let U3start = circleCircleIntersections(compoundCircles.C1, p.bouts.U2)[0]
            let U31start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

            p.bouts.U2 = arcFromCircle(p.bouts.U2, p.bouts.U2.start, angleFromCenter(p.bouts.U2, U3start));
            p.bouts.U3 = arcFromCircleAndPoints(compoundCircles.C1, U3start, U31start);
            p.bouts.U31 = arcFromCircleAndPoints(compoundCircles.C2, U31start, p.bouts.UCr);
        } 
        else {
            let U3R = p.bouts.U3?.r ?? Math.round(LBWI * p.ratios.U3toLBW);
            let U3Circle = interceptCirclesAndPoint(p.bouts.U2, p.bouts.UCr, U3R).sort((a, b) => a.y - b.y)[1];
            if (!U3Circle)
                return cornerMiss('Upper corner', 'U2', p.bouts.U2, 'U3', p.bouts.UCr, false, ['U2', 'U3', 'U31', 'U4'])
            p.bouts.U3 = arcFromCircle(U3Circle);

            let U2Intersect = circleCircleIntersections(p.bouts.U2, p.bouts.U3).sort((a, b) => a.y - b.y);
            let U2Angle = angleFromCenter(p.bouts.U2, U2Intersect[1]);
            let U2StartAngle = angleFromCenter(p.bouts.U2, p.bouts.U1);
            if (p.bouts.U2.r < p.bouts.U1.r) 
                U2StartAngle -= TURN.half

            if (!U1U2Match) {
                let newU1Intersect = circleCircleIntersections(p.bouts.U1, p.bouts.U2).sort((a, b) => a.y - b.y);
                let U1EndAngle = angleFromCenter(p.bouts.U1, newU1Intersect[0]); // we might have to recalculate the angle if we altered the Y height of
                p.bouts.U1.end = U1EndAngle
            }
            p.bouts.U2 = arcFromCircle(p.bouts.U2, U2StartAngle, U2Angle);
            p.bouts.U3 = arcFromCircleAndPoints(p.bouts.U3, U2Intersect[1], p.bouts.UCr);
        }
        if (p.options.useViolCornerUC) {
            let U1EndPt = pointOnCircle(p.bouts.U1!, p.bouts.U1.end);
            let a = p.bouts.UCr.y - U1EndPt.y
            let b = U1EndPt.x - p.bouts.UCr.x
            let U4r = (a * a + b * b) / (2 * b)

            let u4 = new Circle(U1EndPt.x - U4r, U1EndPt.y, U4r);
            p.bouts.U4 = arcFromCircleAndPoints(u4, U1EndPt, p.bouts.UCr);
        }
        return null
    })

    solveSection(failures, 'Lower corner', ['L2', 'L3', 'L31', 'L4'], () => {
        // L4 reads L1's end from before the solve below moves it, as it always has
        if (p.options.useViolCornerLC) {
            let L1EndPt = pointOnCircle(p.bouts.L1!, p.bouts.L1.end);
            let a = p.bouts.LCr.y - L1EndPt.y
            let b = L1EndPt.x - p.bouts.LCr.x
            let L4r = (a * a + b * b) / (2 * b)

            let l4 = new Circle(L1EndPt.x - L4r, L1EndPt.y, L4r);
            p.bouts.L4 = arcFromCircleAndPoints(l4, L1EndPt, p.bouts.LCr);
        }
        if (p.options.L31DoubleArc) {
            let L3r = p.bouts.L3.r
            let L31r =  p.bouts.L31.r
            let theta = p.bouts.L31.start ?? 15/16 * TURN.half
            let compoundCircles = interceptCirclesAndPointCompound(p.bouts.L2!, p.bouts.LCr, L3r, L31r, theta).sort((a, b) => a.C1.y - b.C1.y)[0];
            if (!compoundCircles)
                return cornerMiss('Lower corner', 'L2', p.bouts.L2, 'L3', p.bouts.LCr, true, ['L2', 'L3', 'L31', 'L4'])
            let L3start = circleCircleIntersections(compoundCircles.C1, p.bouts.L2)[0]
            let L31start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

            p.bouts.L2 = arcFromCircle(p.bouts.L2, p.bouts.L2.start, angleFromCenter(p.bouts.L2, L3start));
            p.bouts.L3 = arcFromCircleAndPoints(compoundCircles.C1, L3start, L31start);
            p.bouts.L31 = arcFromCircleAndPoints(compoundCircles.C2, L31start, p.bouts.LCr);
        }
        else {
            let L3R = p.bouts.L3?.r ?? Math.round(LBWI * p.ratios.L3toLBW);
            let L3Circle = interceptCirclesAndPoint(p.bouts.L2, p.bouts.LCr, L3R).sort((a, b) => a.y - b.y)[0];
            if (!L3Circle)
                return cornerMiss('Lower corner', 'L2', p.bouts.L2, 'L3', p.bouts.LCr, false, ['L2', 'L3', 'L31', 'L4'])
            p.bouts.L3 = arcFromCircle(L3Circle);

            let L2Intersect = circleCircleIntersections(p.bouts.L2, p.bouts.L3).sort((a, b) => a.y - b.y)[0];
            let L2Angle = angleFromCenter(p.bouts.L2, L2Intersect);
            let L2StartAngle = angleFromCenter(p.bouts.L2, p.bouts.L1);
            if (p.bouts.L2.r < p.bouts.L1.r) 
                L2StartAngle -= TURN.half

            if (!L2U1Match) {
                let newL1Intersect = circleCircleIntersections(p.bouts.L1, p.bouts.L2).sort((a, b) => a.y - b.y)[0];
                let L1EndAngle = angleFromCenter(p.bouts.L1, newL1Intersect);
                p.bouts.L1.end = L1EndAngle // we might have to recalculate the angle if we altered the Y height of
            }

            p.bouts.L2 = arcFromCircle(p.bouts.L2, L2StartAngle, L2Angle);
            p.bouts.L3 = arcFromCircleAndPoints(p.bouts.L3, L2Intersect, p.bouts.LCr);
        }
        return null
    })

    // recalculate display ratios
    p.ratios.U2toUBW = p.bouts.U2.r / UBWI;
    p.ratios.U3toLBW = p.bouts.U3.r / LBWI;
    p.ratios.U31toLBW = p.bouts.U31.r / LBWI;
    p.ratios.L2toLBW = p.bouts.L2.r / LBWI;
    p.ratios.L3toLBW = p.bouts.L3.r / LBWI;
    p.ratios.L31toLBW = p.bouts.L31.r / LBWI;
    p.ratios.UCYtoH = p.bouts.UCr.y / p.height;
    p.ratios.LCYtoH = p.bouts.LCr.y / p.height;

    reportFailures(failures, 'Corners')
    return failures
}

let lastWorkingC0: Arc | null = null;
export type CenterBoutKey = 'C0' | 'C1' | 'C11' | 'C2' | 'C21';
export type CenterBoutFailure = SolveFailure<CenterBoutKey>;

/** Reads/recalculates from `p.options.useKellyC0`; callers who need to force it toggle the flag first. */
export function calculateCenterBout(p: EnricoCerutiParams): CenterBoutFailure[] {
    let inset = p.overhang + p.rib;
    let LBWI = p.bouts.LBW - 2 * inset;

    // initialize center bout if not already done
    p.bouts.C0 ??= new Arc(0, Math.round(p.height * p.ratios.C0YtoH), Math.round(LBWI * p.ratios.C0toLBW));

    p.bouts.CBW ??= Math.round(p.bouts.LBW * p.ratios.CBWtoLBW);

    let failures: CenterBoutFailure[] = []

    if (p.options.useKellyC0) {
        let kellyMiss: CenterBoutFailure = {
            message: `Fit C0 to Bouts: no C0 of this radius touches both U2 and L2, so C0 is placed by hand again. Enlarge C0, then fit it again.`,
            unsolved: [],
            circles: [p.bouts.U2, p.bouts.L2],
            segments: [],
        }
        solveSection(failures, 'Fit C0 to Bouts', [], () => {
            let UtoL = dist(p.bouts.U2!, p.bouts.L2!);  // these joining circles are the ones that must intercept with C0, modified kelly theory
            let UtoC = p.bouts.U2.r + p.bouts.C0.r;
            let LtoC = p.bouts.L2.r + p.bouts.C0.r;

            let theta = Math.acos((UtoL * UtoL + UtoC * UtoC - LtoC * LtoC) / (2 * UtoL * UtoC));  // angle off U2 to C0, but with the Y axis as the line from U2 to L2
            // outside acos's domain no triangle closes, and the NaN would sail past the distance check below
            if (!Number.isFinite(theta))
                return kellyMiss

            // now we need to begin converting this to the proper coordinate space
            // first, the above theta needs to be referenced added to 3/2 pi, as it is pointing down
            theta = theta + 3 * TURN.quarter; // angle from U2 to C0, with the line from U2 to L2 as reference

            // now we need to convert the angle to the standard xy plane
            let angleFromU2toL2 = Math.atan2(p.bouts.L2!.y - p.bouts.U2!.y, p.bouts.L2!.x - p.bouts.U2!.x);
            let diffFromYAxis = TURN.quarter + angleFromU2toL2; // angle from the line U2 to L2, to the Y axis
            theta = theta + diffFromYAxis; // angle from U2 to C0, with the standard xy plane as reference
            

            // cos(finalAngle) = o / r = (C0.x - U2.x) / (C0.r + U2.r)
            // sin(finalAngle) = a / r = (U2.y - C0.y) / (C0.r + U2.r)
            p.bouts.C0.x = Math.abs(p.bouts.U2.x + Math.cos(theta) * UtoC);
            p.bouts.C0.y = Math.abs(p.bouts.U2.y + Math.sin(theta) * UtoC);

            let C0toL2 = dist(p.bouts.C0, p.bouts.L2!);
            let C0toU2 = dist(p.bouts.C0, p.bouts.U2!);
            let C0rU2r = p.bouts.C0.r + p.bouts.L2.r
            let C0rL2r = p.bouts.C0.r + p.bouts.U2.r
            let tolerance = .1
            if (C0toL2 > C0rU2r + tolerance || C0toU2 > C0rL2r + tolerance)
                return kellyMiss

            // makes sense to recalculate center bout width here
            p.bouts.CBW = (p.bouts.C0.x - p.bouts.C0.r + inset) * 2;
            lastWorkingC0 = JSON.parse(JSON.stringify(p.bouts.C0));
            return null
        })

        // a fit that misses falls back to placing C0 by hand, so the outline still solves
        if (failures.length) {
            p.options.useKellyC0 = false;
            if (lastWorkingC0)
                p.bouts.C0 = JSON.parse(JSON.stringify(lastWorkingC0));
        }
    }

    if (!p.options.useKellyC0) {
        p.bouts.C0 = new Arc(p.bouts.CBW / 2 - inset + p.bouts.C0.r, p.bouts.C0.y, p.bouts.C0.r);
        lastWorkingC0 = JSON.parse(JSON.stringify(p.bouts.C0));
    }

    // initialize C11 and C21
    p.bouts.C11 ??= new Arc(0, 0, Math.round(LBWI * (p.ratios.C11toLBW ?? DefaultParams.ratios.C11toLBW)), 3 * TURN.quarter)
    p.bouts.C21 ??= new Arc(0, 0, Math.round(LBWI * (p.ratios.C21toLBW ?? DefaultParams.ratios.C21toLBW)), TURN.quarter)
    let cuRadius = p.bouts.C2?.r ?? Math.round((LBWI * p.ratios.C2toLBW));
    let clRadius = p.bouts.C1?.r ?? Math.round((LBWI * p.ratios.C1toLBW));
    let CUIntercept: Pt | undefined;
    let CLIntercept: Pt | undefined;

    solveSection(failures, 'Upper corner', ['C0', 'C2', 'C21'], () => {
        if (p.options.C21DoubleArc) {
            let C2r = p.bouts.C2.r
            let C21r =  p.bouts.C21.r
            let theta = p.bouts.C21.start ?? 15/16 * TURN.half
            let compoundCircles = interceptCirclesAndPointCompound(p.bouts.C0!, p.bouts.UCr, C2r, C21r, theta).sort((a, b) => a.C1.y - b.C1.y)[0];
            if (!compoundCircles)
                return cornerMiss('Upper corner', 'C0', p.bouts.C0, 'C2', p.bouts.UCr, true, ['C0', 'C2', 'C21'])
            CUIntercept = circleCircleIntersections(compoundCircles.C1, p.bouts.C0)[1]
            let C21start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

            p.bouts.C2 = arcFromCircleAndPoints(compoundCircles.C1, CUIntercept, C21start);
            p.bouts.C21 = arcFromCircleAndPoints(compoundCircles.C2, C21start, p.bouts.UCr);
        }
        else {
            let CU = interceptCirclesAndPoint(p.bouts.C0, p.bouts.UCr!, cuRadius).sort((a, b) => b.y - a.y)[1];
            if (!CU)
                return cornerMiss('Upper corner', 'C0', p.bouts.C0, 'C2', p.bouts.UCr, false, ['C0', 'C2', 'C21'])
            CUIntercept = circleCircleIntersections(p.bouts.C0, CU).sort((a, b) => b.y - a.y)[0];
            p.bouts.C2 = arcFromCircleAndPoints(CU, CUIntercept, p.bouts.UCr);
        }
        return null
    })

    solveSection(failures, 'Lower corner', ['C0', 'C1', 'C11'], () => {
        if (p.options.C11DoubleArc) {
            let C1r = p.bouts.C1.r
            let C11r = p.bouts.C11.r
            let theta = p.bouts.C11.start ?? 17/16 * TURN.half
            let compoundCircles = interceptCirclesAndPointCompound(p.bouts.C0!, p.bouts.LCr, C1r, C11r, theta).sort((a, b) => a.C1.y - b.C1.y)[1];
            if (!compoundCircles)
                return cornerMiss('Lower corner', 'C0', p.bouts.C0, 'C1', p.bouts.LCr, true, ['C0', 'C1', 'C11'])
            CLIntercept = circleCircleIntersections(compoundCircles.C1, p.bouts.C0)[1]
            let C11start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

            p.bouts.C1 = arcFromCircleAndPoints(compoundCircles.C1, CLIntercept, C11start);
            p.bouts.C11 = arcFromCircleAndPoints(compoundCircles.C2, C11start, p.bouts.LCr);
        }
        else {
            let CL = interceptCirclesAndPoint(p.bouts.C0, p.bouts.LCr!, clRadius).sort((a, b) => a.y - b.y)[1];
            if (!CL)
                return cornerMiss('Lower corner', 'C0', p.bouts.C0, 'C1', p.bouts.LCr, false, ['C0', 'C1', 'C11'])
            CLIntercept = circleCircleIntersections(p.bouts.C0, CL).sort((a, b) => a.y - b.y)[1];
            p.bouts.C1 = arcFromCircleAndPoints(CL, CLIntercept, p.bouts.LCr);
        }
        return null
    })

    if (CUIntercept && CLIntercept)
        p.bouts.C0 = arcFromCircleAndPoints(p.bouts.C0, CUIntercept, CLIntercept);

    // recalculate display ratios
    p.ratios.CBWtoLBW = p.bouts.CBW / p.bouts.LBW;
    p.ratios.C0toLBW = p.bouts.C0.r / LBWI;
    p.ratios.C0YtoH = p.bouts.C0.y / p.height;
    p.ratios.C2toLBW = p.bouts.C2.r / LBWI;
    p.ratios.C21toLBW = p.bouts.C21!.r / LBWI;
    p.ratios.C1toLBW = p.bouts.C1.r / LBWI;
    p.ratios.C11toLBW = p.bouts.C11.r / LBWI;

    reportFailures(failures, 'Center Bout')
    return failures
}

export function calculateOuterArcs(p: EnricoCerutiParams): void {
    let inset = p.overhang + p.rib;
    p.purflingChannelDepth ??= 1.2;
    p.purflingOffset ??= inset + p.purflingChannelDepth;
    p.innerFlutingDepth ??= inset * 2;
    p.outerFlutingDepth ??=  p.overhang * .5;

    p.button ??= defaultButton(p);

    let outerCornersNotDefined = !p.outerCorners.U3 && !p.outerCorners.C2 && !p.outerCorners.C1 && !p.outerCorners.L3;

    const C2Sign = cornerOffsetSign(p, 'C2');
    const C1Sign = cornerOffsetSign(p, 'C1');
    // an outer arc saved before its corner inverted has its end on the far side of the corner, so it starts over
    const stale = (key: 'C2' | 'C21' | 'C1' | 'C11', sign: number) =>
        !!p.outerCorners[key] && Math.sign(p.outerCorners[key]!.r - p.bouts[key]!.r) !== sign;
    const C2Stale = stale('C2', C2Sign);
    const C1Stale = stale('C1', C1Sign);
    if (C2Stale) p.outerCorners.C2 = null;
    if (stale('C21', C2Sign)) p.outerCorners.C21 = null;
    if (C1Stale) p.outerCorners.C1 = null;
    if (stale('C11', C1Sign)) p.outerCorners.C11 = null;

    p.outerCorners.U3 = p.outerCorners.U3 ? redefineArcCircle(p.outerCorners.U3, p.bouts.U3, -inset) : offsetArcRadius(p.bouts.U3, -inset); // user might have redefined bouts
    p.outerCorners.C2 = p.outerCorners.C2 ? redefineArcCircle(p.outerCorners.C2, p.bouts.C2, C2Sign * inset) : offsetArcRadius(p.bouts.C2, C2Sign * inset);
    p.outerCorners.C1 = p.outerCorners.C1 ? redefineArcCircle(p.outerCorners.C1, p.bouts.C1, C1Sign * inset) : offsetArcRadius(p.bouts.C1, C1Sign * inset);
    p.outerCorners.L3 = p.outerCorners.L3 ? redefineArcCircle(p.outerCorners.L3, p.bouts.L3, -inset) : offsetArcRadius(p.bouts.L3, -inset);

    const U3Pop = TURN.half / 72;
    // an inverted C1 or C2 travels the other way round its circle, and the pop has to follow it
    const C2Pop = TURN.half / 18 * C2Sign;
    const C1Pop = TURN.half / 36 * -C1Sign;
    const L3Pop = -TURN.half / 72;

    if (outerCornersNotDefined) {
        p.outerCorners.U3.end += U3Pop;
        p.outerCorners.L3.end += L3Pop;
    }
    if (outerCornersNotDefined || C2Stale) p.outerCorners.C2.end += C2Pop;
    if (outerCornersNotDefined || C1Stale) p.outerCorners.C1.end += C1Pop;
    

    if (p.options.U31DoubleArc) {
        // initialize the data if needed
        let U31NotDefined = !p.outerCorners.U31;
        p.outerCorners.U31 = p.outerCorners.U31 ? redefineArcCircle(p.outerCorners.U31, p.bouts.U31, -inset) : offsetArcRadius(p.bouts.U31, -inset);

        // user may have changed things, make sure outer U3 is just inset U3 in this situation
        p.outerCorners.U3 = offsetArcRadius(p.bouts.U3, -inset);

        // pop rides on the secondary arc here, scaled by radius ratio to match the primary's travel
        if (U31NotDefined) p.outerCorners.U31.end += U3Pop * (p.outerCorners.U3.r / p.outerCorners.U31.r);
    }
    else if (p.outerCorners.U3.end === p.outerCorners.U31?.start) {
        // in this situation the user likely toggled back to 
        p.outerCorners.U3 = offsetArcRadius(p.bouts.U3, -inset);
    }

    if (p.options.C21DoubleArc) {
        let C21NotDefined = !p.outerCorners.C21;
        p.outerCorners.C21 = p.outerCorners.C21 ? redefineArcCircle(p.outerCorners.C21, p.bouts.C21, C2Sign * inset) : offsetArcRadius(p.bouts.C21, C2Sign * inset);
        p.outerCorners.C2 = offsetArcRadius(p.bouts.C2, C2Sign * inset);

        if (C21NotDefined) p.outerCorners.C21.end += C2Pop * (p.outerCorners.C2.r / p.outerCorners.C21.r);
    }
    else if (p.outerCorners.C2.end === p.outerCorners.C21?.start) {
        p.outerCorners.C2 = offsetArcRadius(p.bouts.C2, C2Sign * inset);
    }

    if (p.options.C11DoubleArc) {
        let C11NotDefined = !p.outerCorners.C11;
        p.outerCorners.C11 = p.outerCorners.C11 ? redefineArcCircle(p.outerCorners.C11, p.bouts.C11, C1Sign * inset) : offsetArcRadius(p.bouts.C11, C1Sign * inset);
        p.outerCorners.C1 = offsetArcRadius(p.bouts.C1, C1Sign * inset);

        if (C11NotDefined) p.outerCorners.C11.end += C1Pop * (p.outerCorners.C1.r / p.outerCorners.C11.r);
    }
    else if (p.outerCorners.C1.end === p.outerCorners.C11?.start) {
        p.outerCorners.C1 = offsetArcRadius(p.bouts.C1, C1Sign * inset);
    }

    if (p.options.L31DoubleArc) {
        let L31NotDefined = !p.outerCorners.L31;
        p.outerCorners.L31 = p.outerCorners.L31 ? redefineArcCircle(p.outerCorners.L31, p.bouts.L31, -inset) : offsetArcRadius(p.bouts.L31, -inset);
        p.outerCorners.L3 = offsetArcRadius(p.bouts.L3, -inset);

        if (L31NotDefined) p.outerCorners.L31.end += L3Pop * (p.outerCorners.L3.r / p.outerCorners.L31.r);
    }
    else if (p.outerCorners.L3.end === p.outerCorners.L31?.start) {
        p.outerCorners.L3 = offsetArcRadius(p.bouts.L3, -inset);
    }
}

// off a traced Amati, nice historical defaults
const FShtoEye = 5 / 2;
const FArmtoEye = 3;
const FStemArctoLEye = 8;
const FUWingEnd = TURN.half * 4 / 9;
const FLWingEnd = TURN.half * -19 / 36;
const FCutAt = TURN.half * 2 / 3;
const FUCutSlope = TURN.half / 3;
const FLCutSlope = TURN.half * -2 / 3;

// only need to set the radii values and instantiate the angles
export function setContourDefaults(p: EnricoCerutiParams) {
  p.fHoles.U1 ??= new Arc(0, 0, Math.round(p.fHoles.UEye.r * FShtoEye), 0, TURN.quarter)
  p.fHoles.L1 ??= new Arc(0, 0, Math.round(p.fHoles.LEye.r * FShtoEye), 0, -TURN.quarter)

  p.fHoles.U2 ??= new Arc(0, 0, Math.round(p.fHoles.UEye.r * FArmtoEye))
  p.fHoles.L2 ??= new Arc(0, 0, Math.round(p.fHoles.LEye.r * FArmtoEye))
  p.fHoles.U3 ??= new Arc(0, 0, Math.round(p.fHoles.UEye.r * FArmtoEye), 0, FUWingEnd)
  p.fHoles.L3 ??= new Arc(0, 0, Math.round(p.fHoles.LEye.r * FArmtoEye), 0, FLWingEnd)

  p.fHoles.stem.arcR ??= Math.round(p.fHoles.LEye.r * FStemArctoLEye)
  p.fHoles.S1 ??= new Arc(0, 0, p.fHoles.stem.arcR)
  p.fHoles.S2 ??= new Arc(0, 0, p.fHoles.stem.arcR)
  p.fHoles.S3 ??= new Arc(0, 0, p.fHoles.stem.arcR)
  p.fHoles.S4 ??= new Arc(0, 0, p.fHoles.stem.arcR)

  p.fHoles.UCut = {
    angleOnEye: TURN.half / 3,
    length: p.fHoles.UEye.r,
    slope: FUCutSlope
  }
  p.fHoles.LCut = {
    angleOnEye: TURN.half * 4 / 3,
    length: p.fHoles.LEye.r,
    slope: FLCutSlope
  }

}

// on some weird f-holes, we need to pull back the shoulder end angle from a simple 90 deg peak
// in this situation, it is not the shoulder that hits the upper peak, but the arm
// this method solves the difference in bounds, we can simply take he difference in height
// and get a new bounds for the shoulder height
function shoulderReach(shoulder: Arc, arm: Arc, arm2: Arc | null, extreme: number): number {
  if (shoulder.end <= extreme) return shoulder.r;

  // sin of the shoulder represents the y component of the rise 
  // multiply by the difference in the circles yields the rise in the arm
  let armCentreRise = (shoulder.r - arm.r) * Math.abs(Math.sin(shoulder.end));
  if (!arm2 || arm2.start <= extreme) return armCentreRise + arm.r;

  // a compound arm split before the peak hands it on once more, by the same rule
  let arm2CentreRise = armCentreRise + (arm.r - arm2.r) * Math.abs(Math.sin(arm2.start));
  return arm2CentreRise + arm2.r;
}

export type FholeArcKey = 'U1' | 'U2' | 'U21' | 'U3' | 'L1' | 'L2' | 'L21' | 'L3' | 'S1' | 'S2' | 'S3' | 'S4';

export type FholeFailure = SolveFailure<FholeArcKey>;

export function calculateFholeContours(p: EnricoCerutiParams): FholeFailure[] {
  if (!p.fHoles.U1)
    setContourDefaults(p);

  let stemSlope = Math.tan(p.fHoles.stem.angle)
  let outerStemPt = new Pt(p.fHoles.stem.center.x + p.fHoles.stem.width / 2, p.fHoles.stem.center.y)
  let outerStemLine = lineFromPointAndSlope(outerStemPt, stemSlope)
  let innerStemPt = new Pt(p.fHoles.stem.center.x - p.fHoles.stem.width / 2, p.fHoles.stem.center.y)
  let innerStemLine = lineFromPointAndSlope(innerStemPt, stemSlope)

  // each solve rebuilds its S arc, so the last radius survives on the arc itself
  let stemR = (s: Arc | null) => p.options.stemArcsIndependent ? s?.r ?? p.fHoles.stem.arcR : p.fHoles.stem.arcR

  let stemHalf = dist(p.fHoles.UEye, p.fHoles.LEye) / 2
  let stemEdge = (pt: Pt): [Pt, Pt] => [
    new Pt(pt.x - Math.cos(p.fHoles.stem.angle) * stemHalf, pt.y - Math.sin(p.fHoles.stem.angle) * stemHalf),
    new Pt(pt.x + Math.cos(p.fHoles.stem.angle) * stemHalf, pt.y + Math.sin(p.fHoles.stem.angle) * stemHalf),
  ]

  let shoulderMiss = (
    section: string,
    key: 'U1' | 'L1',
    eye: Circle,
    shoulderY: number,
    bound: number,
    up: 1 | -1,
    unsolved: FholeArcKey[],
  ): FholeFailure => {
    let shoulder = p.fHoles[key]!
    return {
      message: up * (shoulderY - eye.y) > 0
        ? `${section}: ${key} can't touch the eye and still reach the rise. Reduce Rise, or enlarge ${key}.`
        : `${section}: the rise is too small for ${key} to touch the eye. Increase Rise.`,
      unsolved,
      circles: [new Circle(eye.x, eye.y + up * Math.abs(shoulder.r - eye.r), shoulder.r)],
      segments: [[new Pt(eye.x - shoulder.r, bound), new Pt(eye.x + shoulder.r, bound)]],
    }
  }

  // the stem arc wraps `reach` from `side` of the edge, so it can only fail two ways: `reach`
  // already pokes across the edge, or it sits clear and the stem arc is too small to span the gap
  let stemMiss = (
    section: string,
    reachKey: FholeArcKey,
    stemKey: FholeArcKey,
    edge: Line,
    edgePt: Pt,
    edgeName: string,
    side: 1 | -1,
    shrink: string,
  ): FholeFailure => {
    let reach = p.fHoles[reachKey]!
    let normal = tangentUnitVectorFromLine(edge)
    let clearance = side * (reach.x * normal.a + (reach.y - edge.y) * normal.b) - reach.r
    let stemName = p.options.stemArcsIndependent ? stemKey : 'the stem Arc Radius'
    return {
      message: clearance < 0
        ? `${section}: ${reachKey} crosses the ${edgeName} stem edge before it can turn onto it. ${shrink}, or widen the stem.`
        : `${section}: ${stemKey} can't bridge from ${reachKey} to the ${edgeName} stem edge. Enlarge ${stemName}.`,
      unsolved: [reachKey, stemKey],
      circles: [reach],
      segments: [stemEdge(edgePt)],
    }
  }

  let failures: FholeFailure[] = []

  // first the upper curve that connects to the eye
  solveSection(failures, 'Upper arm', ['U1', 'U2', 'U21', 'S2'], () => {
    // a compound arm seeds on the arm's own circle, split halfway along the sweep the arm last
    // drew, so switching it on changes nothing until a number does
    if (p.options.U21DoubleArc)
      p.fHoles.U21 ??= new Arc(0, 0, p.fHoles.U2.r, (p.fHoles.U2.start + p.fHoles.U2.end) / 2)
    let upperArm2 = p.options.U21DoubleArc ? p.fHoles.U21! : null;

    // first we need to determine the placement of the arc that connects to each eye
    let upperBound = p.fHoles.UEye.y + p.fHoles.UEye.r + p.fHoles.URise
    let upperShoulderY = upperBound - shoulderReach(p.fHoles.U1, p.fHoles.U2, upperArm2, TURN.quarter)
    let upperShoulderXs = lineCircleIntersectionWithTolerance(
      { m: 0, y: upperShoulderY, x: 0 },
      { x: p.fHoles.UEye.x, y: p.fHoles.UEye.y, r: Math.abs(p.fHoles.U1.r - p.fHoles.UEye.r) },
    )
    if (!upperShoulderXs.length)
      return shoulderMiss('Upper arm', 'U1', p.fHoles.UEye, upperShoulderY, upperBound, 1, ['U1', 'U2', 'U21', 'S2'])

    let upperShoulder = new Arc(upperShoulderXs[0].x, upperShoulderY, p.fHoles.U1.r)
    let upperShoulderStartPt = circleCircleIntersections(p.fHoles.UEye, upperShoulder);
    let upperShoulderStartAngle = angleFromCenter(upperShoulder, upperShoulderStartPt[0]);
    upperShoulder.start = upperShoulderStartAngle;
    upperShoulder.end = p.fHoles.U1.end
    p.fHoles.U1 = upperShoulder;

    // now continue from the shoulder, we will call this the arm
    let upperArm = inscribeCircleWithinCircle(upperShoulder, p.fHoles.U2.r, upperShoulder.end)
    p.fHoles.U2 = new Arc(upperArm.x, upperArm.y, upperArm.r, upperShoulder.end, 0);

    // the arc the stem arc has to reach: the arm, or its second half once split
    let upperStemReach = p.fHoles.U2;
    if (upperArm2) {
      p.fHoles.U2.end = upperArm2.start;
      let secondArm = inscribeCircleWithinCircle(p.fHoles.U2, upperArm2.r, upperArm2.start)
      p.fHoles.U21 = new Arc(secondArm.x, secondArm.y, secondArm.r, upperArm2.start, 0);
      upperStemReach = p.fHoles.U21;
    }

    let S2 = solveTangentCircleAndLine(outerStemLine, upperStemReach, stemR(p.fHoles.S2), true, 1, p.fHoles.stem.center);
    if (!S2)
      return upperArm2
        ? stemMiss('Upper arm', 'U21', 'S2', outerStemLine, outerStemPt, 'outer', 1, 'Shrink U1, U2 or U21')
        : stemMiss('Upper arm', 'U2', 'S2', outerStemLine, outerStemPt, 'outer', 1, 'Shrink U1 or U2')

    let S2StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S2); // we are just kissing the line, sometimes we miss due to floating points
    let S2StemEndAngle = angleFromCenter(S2, S2StemIntersect[0])

    // tangent by construction, so the join sits on the line of centres: one angle serves both circles
    upperStemReach.end = angleFromCenter(S2, upperStemReach);
    p.fHoles.S2 = new Arc(S2.x, S2.y, S2.r, upperStemReach.end, S2StemEndAngle)
    return null
  })

  // now we do the upper wing
  solveSection(failures, 'Upper wing', ['U3', 'S1'], () => {
    let cutStart = pointOnCircle(p.fHoles.UEye, p.fHoles.UCut.angleOnEye);
    let cutVector = vectorFromSlope(p.fHoles.UCut.slope);
    cutVector.mag = p.fHoles.UCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    p.fHoles.UTip = cutEnd;
    let cutCircle = placeCircleOnPointAtAngle(p.fHoles.U3.r, cutEnd, p.fHoles.U3.end);
    p.fHoles.U3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, p.fHoles.U3.start, p.fHoles.U3.end);

    let S1 = solveTangentCircleAndLine(innerStemLine, cutCircle, stemR(p.fHoles.S1), true, 1, p.fHoles.stem.center);
    if (!S1)
      return stemMiss('Upper wing', 'U3', 'S1', innerStemLine, innerStemPt, 'inner', 1, 'Shrink U3 or move its tip with Wing and Slope')

    let S1U3Pt = circleCircleIntersections(S1, cutCircle);
    let S1StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S1);
    let S1StemEndAngle = angleFromCenter(S1, S1StemIntersect[0]);

    p.fHoles.U3.start = angleFromCenter(cutCircle, S1U3Pt[0]);
    p.fHoles.S1 = new Arc(S1.x, S1.y, S1.r, S1StemEndAngle, angleFromCenter(S1, S1U3Pt[0]));
    return null
  })

  // now the lower arm, upside down: bound drops below the eye, and the arm meets the inner stem
  solveSection(failures, 'Lower arm', ['L1', 'L2', 'L21', 'S3'], () => {
    if (p.options.L21DoubleArc)
      p.fHoles.L21 ??= new Arc(0, 0, p.fHoles.L2.r, (p.fHoles.L2.start + p.fHoles.L2.end) / 2)
    let lowerArm2 = p.options.L21DoubleArc ? p.fHoles.L21! : null;

    let lowerBound = p.fHoles.LEye.y - p.fHoles.LEye.r - p.fHoles.LRise
    let lowerShoulderY = lowerBound + shoulderReach(p.fHoles.L1, p.fHoles.L2, lowerArm2, -TURN.quarter)
    let lowerShoulderXs = lineCircleIntersectionWithTolerance(
      { m: 0, y: lowerShoulderY, x: 0 },
      { x: p.fHoles.LEye.x, y: p.fHoles.LEye.y, r: Math.abs(p.fHoles.L1.r - p.fHoles.LEye.r) },
    )
    if (!lowerShoulderXs.length)
      return shoulderMiss('Lower arm', 'L1', p.fHoles.LEye, lowerShoulderY, lowerBound, -1, ['L1', 'L2', 'L21', 'S3'])

    // a tangent miss comes back as one point, so the far side falls back to it
    let lowerShoulder = new Arc((lowerShoulderXs[1] ?? lowerShoulderXs[0]).x, lowerShoulderY, p.fHoles.L1.r)
    let lowerShoulderStartPt = circleCircleIntersections(p.fHoles.LEye, lowerShoulder);
    let lowerShoulderStartAngle = angleFromCenter(lowerShoulder, lowerShoulderStartPt[0]);
    lowerShoulder.start = lowerShoulderStartAngle;
    lowerShoulder.end = p.fHoles.L1.end
    p.fHoles.L1 = lowerShoulder;

    let lowerArm = inscribeCircleWithinCircle(lowerShoulder, p.fHoles.L2.r, lowerShoulder.end)
    p.fHoles.L2 = new Arc(lowerArm.x, lowerArm.y, lowerArm.r, lowerShoulder.end, 0);

    let lowerStemReach = p.fHoles.L2;
    if (lowerArm2) {
      p.fHoles.L2.end = lowerArm2.start;
      let secondArm = inscribeCircleWithinCircle(p.fHoles.L2, lowerArm2.r, lowerArm2.start)
      p.fHoles.L21 = new Arc(secondArm.x, secondArm.y, secondArm.r, lowerArm2.start, 0);
      lowerStemReach = p.fHoles.L21;
    }

    let S3 = solveTangentCircleAndLine(innerStemLine, lowerStemReach, stemR(p.fHoles.S3), true, -1, p.fHoles.stem.center);
    if (!S3)
      return lowerArm2
        ? stemMiss('Lower arm', 'L21', 'S3', innerStemLine, innerStemPt, 'inner', -1, 'Shrink L1, L2 or L21')
        : stemMiss('Lower arm', 'L2', 'S3', innerStemLine, innerStemPt, 'inner', -1, 'Shrink L1 or L2')

    let S3StemIntersect = lineCircleIntersectionWithTolerance(innerStemLine, S3);
    let S3StemEndAngle = angleFromCenter(S3, S3StemIntersect[0])

    lowerStemReach.end = angleFromCenter(S3, lowerStemReach);
    p.fHoles.S3 = new Arc(S3.x, S3.y, S3.r, lowerStemReach.end, S3StemEndAngle)
    return null
  })

  // now the lower wing, which connects to the outer stem
  solveSection(failures, 'Lower wing', ['L3', 'S4'], () => {
    let cutStart = pointOnCircle(p.fHoles.LEye, p.fHoles.LCut.angleOnEye);
    let cutVector = vectorFromSlope(p.fHoles.LCut.slope);
    cutVector.mag = p.fHoles.LCut.length;
    let cutEnd = moveInVectorSpace(cutStart, [cutVector]);
    p.fHoles.LTip = cutEnd;
    let cutCircle = placeCircleOnPointAtAngle(p.fHoles.L3.r, cutEnd, p.fHoles.L3.end);
    p.fHoles.L3 = new Arc(cutCircle.x, cutCircle.y, cutCircle.r, p.fHoles.L3.start, p.fHoles.L3.end);

    let S4 = solveTangentCircleAndLine(outerStemLine, cutCircle, stemR(p.fHoles.S4), true, -1, p.fHoles.stem.center);
    if (!S4)
      return stemMiss('Lower wing', 'L3', 'S4', outerStemLine, outerStemPt, 'outer', -1, 'Shrink L3 or move its tip with Wing and Slope')

    let S4L3Pt = circleCircleIntersections(S4, cutCircle);
    let S4StemIntersect = lineCircleIntersectionWithTolerance(outerStemLine, S4);
    let S4StemEndAngle = angleFromCenter(S4, S4StemIntersect[0]);

    p.fHoles.L3.start = angleFromCenter(cutCircle, S4L3Pt[0]);
    p.fHoles.S4 = new Arc(S4.x, S4.y, S4.r, S4StemEndAngle, angleFromCenter(S4, S4L3Pt[0]));
    return null
  })

  reportFailures(failures, 'F-hole Contour')
  return failures
}

// used to be a user-facing param; in practice one depth suited every instrument, so it's fixed
const MOULD_CHANNEL_DEPTH = 4;

export function calculateMould(p: EnricoCerutiParams, useHighAccuracy = false, simpleClampBox = false): string {
    let blocksInitialized = p.blocks.CU != null;
    let inset = p.overhang + p.rib;

    if (!blocksInitialized) {
        // first we want to determine if the instrument is roughly a violin, viola, cello, or bass
        // as each have a different block and channel size
        let isViolin = p.height < 400;
        let isViola = p.height >= 400 && p.height < 500;
        let isCello = p.height >= 500 && p.height < 800;
        let isBass = p.height >= 800;

        if (isViolin) {
            let pad = 3
            let blockHeight = 20
            let blockWidth = 12
            p.blocks.U = new Rectangle(new Pt(-20, p.height - inset - 20), new Pt(20, p.height - inset))
            p.blocks.CU = new Rectangle(new Pt(p.bouts.UCr.x + pad, p.bouts.UCr.y - pad), new Pt(p.bouts.UCr.x + pad - blockWidth, p.bouts.UCr.y - pad + blockHeight));
            p.blocks.CUPad = pad
            p.blocks.CL = new Rectangle(new Pt(p.bouts.LCr.x + pad, p.bouts.LCr.y + pad), new Pt(p.bouts.LCr.x + pad - blockWidth, p.bouts.LCr.y + pad - blockHeight));
            p.blocks.CLPad = pad
            p.blocks.L = new Rectangle(new Pt(-20, inset), new Pt(20, inset + 20));
        }

        if (isViola) {
            let pad = 4
            let blockHeight = 30
            let blockWidth = 18
            p.blocks.U = new Rectangle(new Pt(-25, p.height - inset - 25), new Pt(25, p.height - inset))
            p.blocks.CU = new Rectangle(new Pt(p.bouts.UCr.x + pad, p.bouts.UCr.y - pad), new Pt(p.bouts.UCr.x + pad - blockWidth, p.bouts.UCr.y - pad + blockHeight));
            p.blocks.CUPad = pad
            p.blocks.CL = new Rectangle(new Pt(p.bouts.LCr.x + pad, p.bouts.LCr.y + pad), new Pt(p.bouts.LCr.x + pad - blockWidth, p.bouts.LCr.y + pad - blockHeight));
            p.blocks.CLPad = pad
            p.blocks.L = new Rectangle(new Pt(-25, inset), new Pt(25, inset + 25));
        }

        if (isCello) {
            let pad = 5
            let blockHeight = 40
            let blockWidth = 24
            p.blocks.U = new Rectangle(new Pt(-45, p.height - inset - 45), new Pt(45, p.height - inset))
            p.blocks.CU = new Rectangle(new Pt(p.bouts.UCr.x + pad, p.bouts.UCr.y - pad), new Pt(p.bouts.UCr.x + pad - blockWidth, p.bouts.UCr.y - pad + blockHeight));
            p.blocks.CUPad = pad
            p.blocks.CL = new Rectangle(new Pt(p.bouts.LCr.x + pad, p.bouts.LCr.y + pad), new Pt(p.bouts.LCr.x + pad - blockWidth, p.bouts.LCr.y + pad - blockHeight));
            p.blocks.CLPad = pad
            p.blocks.L = new Rectangle(new Pt(-45, inset), new Pt(45, inset + 45));
        }

        if (isBass) {
            let pad = 8
            let blockHeight = 50
            let blockWidth = 30
            p.blocks.U = new Rectangle(new Pt(-70, p.height - inset - 70), new Pt(70, p.height - inset))
            p.blocks.CU = new Rectangle(new Pt(p.bouts.UCr.x + pad, p.bouts.UCr.y - pad), new Pt(p.bouts.UCr.x + pad - blockWidth, p.bouts.UCr.y - pad + blockHeight));
            p.blocks.CUPad = pad
            p.blocks.CL = new Rectangle(new Pt(p.bouts.LCr.x + pad, p.bouts.LCr.y + pad), new Pt(p.bouts.LCr.x + pad - blockWidth, p.bouts.LCr.y + pad - blockHeight));
            p.blocks.CLPad = pad
            p.blocks.L = new Rectangle(new Pt(-70, inset), new Pt(70, inset + 70));
        }

        if (p.options.useViolNeck) {
            // seed the block to the neck root: it hangs from where the neck join meets V0, and
            // starts out spanning the neck plus 2mm each side. width is the user's from here on
            let endPt = pointOnCircle(p.viol!.V0, p.viol!.V0.start);
            p.blocks.U = new Rectangle(new Pt(-endPt.x - 2, endPt.y - p.blocks.U.height), new Pt(endPt.x + 2, endPt.y));
        }
    }
    else {
        p.blocks.U = new Rectangle(new Pt(-p.blocks.U.width / 2, p.height - inset - p.blocks.U.height), new Pt(p.blocks.U.width / 2, p.height - inset))
        p.blocks.CU = new Rectangle(new Pt(p.bouts.UCr.x + p.blocks.CUPad, p.bouts.UCr.y - p.blocks.CUPad), new Pt(p.bouts.UCr.x + p.blocks.CUPad - p.blocks.CU.width, p.bouts.UCr.y - p.blocks.CUPad + p.blocks.CU.height));
        p.blocks.CL = new Rectangle(new Pt(p.bouts.LCr.x + p.blocks.CLPad, p.bouts.LCr.y + p.blocks.CLPad), new Pt(p.bouts.LCr.x + p.blocks.CLPad - p.blocks.CL.width, p.bouts.LCr.y + p.blocks.CLPad - p.blocks.CL.height));
        p.blocks.L = new Rectangle(new Pt(-p.blocks.L.width / 2, inset), new Pt(p.blocks.L.width / 2, inset + p.blocks.L.height));


        if (p.options.useViolNeck) {
            // only the top edge is the neck's — it sits at the join tangency rather than at
            // p.height - inset. the width stays whatever the mould panel was given
            let endPt = pointOnCircle(p.viol!.V0, p.viol!.V0.start);
            p.blocks.U = new Rectangle(new Pt(-p.blocks.U.width / 2, endPt.y - p.blocks.U.height), new Pt(p.blocks.U.width / 2, endPt.y));
        }
    }

    // now we cut out the blocks from the path
    let innerPath = defineInnerPath(p);

    let blocks: Rectangle[] = [
        p.blocks.U,
        p.blocks.CU,
        flipRectAboutY(p.blocks.CU), 
        p.blocks.CL, 
        flipRectAboutY(p.blocks.CL), 
        p.blocks.L, 
    ]

    const tolerance = 0.5;
    const bitRadius = p.bitDiameter / 2 + tolerance;
    const bitOffset = (bitRadius * Math.SQRT1_2) - tolerance;
    let circleCutouts = []
    if (p.bitDiameter > 0) {
        // these will keep the bit from making internal right angles
        circleCutouts = [
            pathFromCircle({ x: blocks[0].Pt1.x + bitOffset, y: blocks[0].Pt1.y + bitOffset, r: bitRadius }),
            pathFromCircle({ x: blocks[0].Pt2.x - bitOffset, y: blocks[0].Pt1.y + bitOffset, r: bitRadius }),

            pathFromCircle({ x: blocks[1].Pt2.x + bitOffset, y: blocks[1].Pt2.y - bitOffset, r: bitRadius }),
            pathFromCircle({ x: blocks[2].Pt2.x - bitOffset, y: blocks[2].Pt2.y - bitOffset, r: bitRadius }),

            pathFromCircle({ x: blocks[3].Pt2.x + bitOffset, y: blocks[3].Pt2.y + bitOffset, r: bitRadius }),
            pathFromCircle({ x: blocks[4].Pt2.x - bitOffset, y: blocks[4].Pt2.y + bitOffset, r: bitRadius }),
    
            pathFromCircle({ x: blocks[5].Pt1.x + bitOffset, y: blocks[5].Pt2.y - bitOffset, r: bitRadius }),
            pathFromCircle({ x: blocks[5].Pt2.x - bitOffset, y: blocks[5].Pt2.y - bitOffset, r: bitRadius }),
        ];
    }

    const blockInset = 20;
    const clampWidest = Math.max(Math.abs(p.blocks.L.Pt1.x), Math.abs(p.blocks.U.Pt1.x));

    let cutoutPaths = blocks.map(block => pathFromRect(block));
    cutoutPaths = cutoutPaths.concat(circleCutouts);

    const renderDensity = useHighAccuracy ? 0.1 : 1;
    let mouldPath = differenceFromManyPaths(innerPath, cutoutPaths, renderDensity);
   
    let clampBox: string[]
    if (simpleClampBox) {
         let halfwayPt = p.bouts.C0.y
         let blockY = Math.min(p.blocks.U.Pt2.y, p.blocks.U.Pt1.y);
        const clampBlockCutout1 = new Rectangle(
            new Pt(clampWidest * 1.3, blockY - blockInset ), 
            new Pt(clampWidest * -1.3, halfwayPt + blockInset/2)
        );
        const clampBlockCutout2 = new Rectangle(
            new Pt(clampWidest * 1.3, halfwayPt - blockInset /2), 
            new Pt(clampWidest * -1.3, p.blocks.L.Pt2.y + blockInset )
        );

        
        const rectRadius = (bitRadius > 0) ? bitRadius : 5;

        clampBox = [
            pathFromRoundedRect(clampBlockCutout1, rectRadius),
            pathFromRoundedRect(clampBlockCutout2, rectRadius)
        ];
    
    }
    else {
        let clampOffset = Math.max(p.blocks.U.height, p.blocks.L.height) + MOULD_CHANNEL_DEPTH
        if (p.options.useViolNeck)
            clampOffset = p.blocks.L.height + MOULD_CHANNEL_DEPTH

        // three closed windows rather than free chords: flanks ride the inset bout arcs, and
        // the horizontal faces sit a fixed web back from every block face, so blocks always
        // keep solid material behind them and the beams between windows contain the corner
        // blocks. every line-arc junction is filleted, so the frame has no sharp corners.
        const web = clampOffset / 2;
        const rf = web; // fillet radius — comfortably above any sane bit radius

        const rectYMin = (r: Rectangle) => Math.min(r.Pt1.y, r.Pt2.y);
        const rectYMax = (r: Rectangle) => Math.max(r.Pt1.y, r.Pt2.y);

        // wraps solveTangentCircleAndLine with the extra points this mould construction needs —
        // where the fillet touches the wall and where it touches Q — that a bare circle doesn't carry
        const fillet = (t: Line, Q: Circle, Pr: number, diff: boolean, side: 1 | -1, near: Pt) => {
            const center = solveTangentCircleAndLine(t, Q, Pr, diff, side, near);
            if (!center) return null;
            const normal = tangentUnitVectorFromLine(t);
            const lineTangent = new Pt(center.x - side * Pr * normal.a, center.y - side * Pr * normal.b);
            const circleAngle = angleFromCenter(Q, center);
            return { center, lineTangent, circleTangent: pointOnCircle(Q, circleAngle), circleAngle };
        };

        // builds the small fillet's own Arc from a fillet() result
        const filletArc = (f: { center: Pt; lineTangent: Pt; circleTangent: Pt }, radius: number) =>
            new Arc(f.center.x, f.center.y, radius, angleFromCenter(f.center, f.lineTangent), angleFromCenter(f.center, f.circleTangent));

        clampBox = [];

        // upper window: faces held web under the top block and web over the corner blocks,
        // clamped to where the inset flank arcs themselves stop
        const U1c = offsetArcRadius(p.bouts.U1, -clampOffset);
        const U2c = offsetArcRadius(p.bouts.U2, -clampOffset);
        const uTopY = Math.min(rectYMin(p.blocks.U) - web, pointOnCircle(U1c, U1c.start).y);
        const uBotY = Math.max(rectYMax(p.blocks.CU) + web, pointOnCircle(U2c, U2c.end).y);
        const uTop = fillet({ m: 0, y: uTopY, x: 0 }, U1c, rf, true, 1, pointOnCircle(U1c, U1c.start));
        const uBot = fillet({ m: 0, y: uBotY, x: 0 }, U2c, rf, true, -1, pointOnCircle(U2c, U2c.end));
        // the >rf checks mirror the old collision guard: a fillet whose tangent lands too close
        // to the centerline would cross its own mirror image
        if (uTop && uBot && uTop.lineTangent.x > rf && uBot.lineTangent.x > rf && uTopY - uBotY >= 2 * rf) {
            clampBox.push(mirroredLoop(
                [filletArc(uTop, rf),
                 new Arc(U1c.x, U1c.y, U1c.r, uTop.circleAngle, U1c.end),
                 new Arc(U2c.x, U2c.y, U2c.r, U2c.start, uBot.circleAngle),
                 filletArc(uBot, rf)],
                [[new Pt(-uTop.lineTangent.x, uTopY), new Pt(uTop.lineTangent.x, uTopY)],
                 [new Pt(-uBot.lineTangent.x, uBotY), new Pt(uBot.lineTangent.x, uBotY)]]));
        }

        // center window: the registration geometry from the old system, kept as-is — a flat
        // face flush with each corner block's outer edge, walled off from the C0 waist arc by a
        // vertical run at the block's own x. That flat face is what a caul clamps against to
        // press the corner block home, so its position and span aren't touched; only the two
        // sharp corners on each side (arc-into-wall, wall-into-face) are eased, and only as far
        // as their own leg lengths allow.
        const C0Clamp = offsetArcRadius(p.bouts.C0, clampOffset);
        const C0UpPt = lineCircleIntersection(lineFromPointAndSlope(p.blocks.CU.Pt1, 0), C0Clamp).sort((a, b) => a.x - b.x)[0];
        const C0LowPt = lineCircleIntersection(lineFromPointAndSlope(p.blocks.CL.Pt1, 0), C0Clamp).sort((a, b) => a.x - b.x)[0];
        const cTopY = C0UpPt.y + p.blocks.CU.height;
        const cBotY = C0LowPt.y - p.blocks.CL.height;
        const cTopR = Math.min(rf, p.blocks.CU.height / 3, C0UpPt.x / 3);
        const cBotR = Math.min(rf, p.blocks.CL.height / 3, C0LowPt.x / 3);

        // C0's waist curves opposite U1/U2/L1/L2 (concave toward the centerline, not away from
        // it), so this wall-to-arc fillet grows past C0Clamp's radius rather than nesting inside
        // it — same call as the flank windows above, with internal tangency flipped off.
        const cTopArc = fillet({ m: Infinity, y: NaN, x: C0UpPt.x }, C0Clamp, cTopR, false, -1, C0UpPt);
        const cBotArc = fillet({ m: Infinity, y: NaN, x: C0LowPt.x }, C0Clamp, cBotR, false, -1, C0LowPt);
        const cTopFace = filletRightAngleCorner(new Pt(C0UpPt.x, cTopY), new Pt(-1, -1), cTopR);
        const cBotFace = filletRightAngleCorner(new Pt(C0LowPt.x, cBotY), new Pt(-1, 1), cBotR);
        if (cTopArc && cTopFace && cBotArc && cBotFace) {
            const chain: (Arc | [Pt, Pt])[] = [
                cBotFace,
                [new Pt(C0LowPt.x, cBotFace.y), new Pt(C0LowPt.x, cBotArc.lineTangent.y)],
                filletArc(cBotArc, cBotR),
                new Arc(C0Clamp.x, C0Clamp.y, C0Clamp.r, cBotArc.circleAngle, cTopArc.circleAngle),
                filletArc(cTopArc, cTopR),
                [new Pt(C0UpPt.x, cTopArc.lineTangent.y), new Pt(C0UpPt.x, cTopFace.y)],
                cTopFace,
            ];
            clampBox.push(mirroredLoop(chain, [
                [new Pt(cTopFace.x, cTopY), new Pt(-cTopFace.x, cTopY)],
                [new Pt(cBotFace.x, cBotY), new Pt(-cBotFace.x, cBotY)],
            ]));
        }

        // lower window: mirror of the upper — web over the bottom block, web under the corner blocks
        const L1c = offsetArcRadius(p.bouts.L1, -clampOffset);
        const L2c = offsetArcRadius(p.bouts.L2, -clampOffset);
        const lTopY = Math.min(rectYMin(p.blocks.CL) - web, pointOnCircle(L2c, L2c.end).y);
        const lBotY = Math.max(rectYMax(p.blocks.L) + web, pointOnCircle(L1c, L1c.start).y);
        const lTop = fillet({ m: 0, y: lTopY, x: 0 }, L2c, rf, true, 1, pointOnCircle(L2c, L2c.end));
        const lBot = fillet({ m: 0, y: lBotY, x: 0 }, L1c, rf, true, -1, pointOnCircle(L1c, L1c.start));
        if (lTop && lBot && lTop.lineTangent.x > rf && lBot.lineTangent.x > rf && lTopY - lBotY >= 2 * rf) {
            clampBox.push(mirroredLoop(
                [filletArc(lTop, rf),
                 new Arc(L2c.x, L2c.y, L2c.r, L2c.start, lTop.circleAngle),
                 new Arc(L1c.x, L1c.y, L1c.r, lBot.circleAngle, L1c.end),
                 filletArc(lBot, rf)],
                [[new Pt(-lTop.lineTangent.x, lTopY), new Pt(lTop.lineTangent.x, lTopY)],
                 [new Pt(-lBot.lineTangent.x, lBotY), new Pt(lBot.lineTangent.x, lBotY)]]));
        }
    }

    return combinePathStrings([...clampBox, mouldPath]);
}

export function calculateCornerBlocks(p: EnricoCerutiParams, innerPath: string, padding = 5): string[] {
    let result = [];
    // Expand a rect by 1mm on the face that may be flush with the inner path boundary,
    // so polygon-clipping has a clean crossing rather than a tangent touch point.
    const expandedTop    = (r: Rectangle) => new Rectangle(new Pt(r.Pt1.x, Math.min(r.Pt1.y, r.Pt2.y)), new Pt(r.Pt2.x, Math.max(r.Pt1.y, r.Pt2.y) + 1));
    const expandedBottom = (r: Rectangle) => new Rectangle(new Pt(r.Pt1.x, Math.min(r.Pt1.y, r.Pt2.y) - 1), new Pt(r.Pt2.x, Math.max(r.Pt1.y, r.Pt2.y)));

    // Build clipped paths paired with their bounding rectangles.
    const cuRect   = p.blocks.CU;
    const cuMirror = flipRectAboutY(p.blocks.CU);
    const clRect   = p.blocks.CL;
    const clMirror = flipRectAboutY(p.blocks.CL);

    const cuClipped   = intersectionFromTwoPaths(pathFromRect(expandedTop(cuRect)), innerPath);
    const cuMirrorClipped = intersectionFromTwoPaths(pathFromRect(expandedTop(cuMirror)), innerPath);
    const clClipped   = intersectionFromTwoPaths(pathFromRect(expandedBottom(clRect)), innerPath);
    const clMirrorClipped = intersectionFromTwoPaths(pathFromRect(expandedBottom(clMirror)), innerPath);
    const uClipped = intersectionFromTwoPaths(pathFromRect(expandedTop(p.blocks.U)), innerPath);
    const lClipped = intersectionFromTwoPaths(pathFromRect(expandedBottom(p.blocks.L)), innerPath);

    // result.push(cuClipped, cuMirrorClipped, clClipped, clMirrorClipped, uClipped, lClipped);
    // the above code produces clean bug free paths
    // comment out to see them
    // now we need to arrange them in a nice layout for cutting
    
    const rectMinX = (r: Rectangle) => Math.min(r.Pt1.x, r.Pt2.x);
    const rectMinY = (r: Rectangle) => Math.min(r.Pt1.y, r.Pt2.y);

    // row logic is just to group these in a compact arrangement
    // might oneday be used to structure them for being cut from a single piece
    // below code is vibes, but creates a nice arrangement
    const rowWidth = (items: Array<{ rect: Rectangle }>) =>
        items.reduce((sum, { rect }) => sum + rect.width, 0) + padding * (items.length - 1);

    // Helper: place a row of items horizontally centered on x=0 at the given yOffset.
    const layoutRow = (items: Array<{ rect: Rectangle; path: string }>, yOffset: number): string[] => {
        let xCursor = -rowWidth(items) / 2;
        return items.map(({ rect, path }) => {
            const dx = xCursor - rectMinX(rect);
            const dy = yOffset - rectMinY(rect);
            const translated = translatePath(path, dx, dy);
            xCursor += rect.width + padding;
            return translated;
        });
    };

    const rowUpper = [{ rect: p.blocks.U,  path: uClipped }];
    const rowUpperCorners = [
        { rect: cuMirror, path: cuMirrorClipped },
        { rect: cuRect, path: cuClipped },
    ];
    const rowLowerCorners = [
        { rect: clMirror, path: clMirrorClipped },
        { rect: clRect, path: clClipped }
    ];
    const rowLower = [{ rect: p.blocks.L,  path: lClipped }];

    // Calculate y offsets for each row based on their heights and padding.
    // Stack rows top-to-bottom, advancing yCursor by each row's tallest piece.
    const rowHeight = (items: Array<{ rect: Rectangle }>) => Math.max(...items.map(({ rect }) => rect.height));

    let yCursor = 0;
    const r3 = layoutRow(rowLower,        yCursor); yCursor += rowHeight(rowLower)        + padding;
    const r2 = layoutRow(rowLowerCorners, yCursor); yCursor += rowHeight(rowLowerCorners) + padding;
    const r1 = layoutRow(rowUpperCorners, yCursor); yCursor += rowHeight(rowUpperCorners) + padding;
    const r0 = layoutRow(rowUpper,        yCursor); 

    result.push(...r0, ...r1, ...r2, ...r3);
    return result;
}

export const upsertPathEntry = (paths: PathEntry[], key: PathKey, path: string): void => {
  const entry = paths.find(p => p.key === key);
  if (entry) {
    entry.path = path;
    return;
  }
  paths.push({ key, path });
};

/**
 * Reads a path the caller has already guaranteed is there by calling the
 * matching `ensure*` first. Asserts, so a missing `ensure*` fails loudly at the
 * read rather than drawing nothing — see the panel notes in this folder's
 * CLAUDE.md. Lived as a private copy in four panels before this.
 */
export const getPath = (paths: PathEntry[], key: PathKey): string =>
  paths.find(entry => entry.key === key)!.path;

/** Same, for the keys that are legitimately absent (purfling not yet configured). */
export const getPathOrNull = (paths: PathEntry[], key: PathKey): string | null =>
  paths.find(entry => entry.key === key)?.path ?? null;

// the top plate's plan as the cache holds it, after ensureOuterTracePaths and, once the holes are
// placed, ensureFholePath. One path per hole, so canvas tools can pick either on its own
export const topPlatePaths = (params: EnricoCerutiParams, paths: PathEntry[]): PlatePlan => {
  const fHoles = params.fHoles ? getPathOrNull(paths, 'fHole') : null;
  return {
    outline: getPath(paths, 'top'),
    purfling: [getPathOrNull(paths, 'purfling'), getPathOrNull(paths, 'outerPurfling')].filter((d): d is string => !!d),
    fHoles: fHoles ? splitPathStrings(fHoles) : [],
  };
};

export const ensureCenterBoutInnerPath = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
): SolveFailure<CornerKey | CenterBoutKey>[] => {
  const failures = [...calculateCorners(params), ...calculateCenterBout(params)];
  if (!failures.length) upsertPathEntry(paths, 'inner', defineInnerPath(params));
  return failures;
};

export const ensureOuterTracePaths = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
): void => {
  const offset = params.overhang + params.rib;
  const topPath = defineOuterPath(params, offset, true, false);
  const backPath = defineOuterPath(params, offset, true, true);
  const purflingPath = definePurflingPath(params, offset);
  const outerPurflingPath = defineOuterPurflingPath(params, offset);

  upsertPathEntry(paths, 'top', topPath);
  upsertPathEntry(paths, 'back', backPath);
  if (purflingPath) upsertPathEntry(paths, 'purfling', purflingPath);
  if (outerPurflingPath) upsertPathEntry(paths, 'outerPurfling', outerPurflingPath);

  // No channel here. This cache feeds the plan-view sheets, and in plan the
  // channel is only a pair of rims — nothing between them says how deep it goes
  // or what section it is cut to. The arching templates state all of that
  // exactly, so a rim pair on a contour sheet would be a second and weaker
  // account of the same geometry.
};

export const ensureFholePath = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
): FholeFailure[] => {
  const failures = calculateFholeContours(params);
  // a half-solved hole won't close, so the last good outline stands until this one does
  if (!failures.length) upsertPathEntry(paths, 'fHole', defineFholePath(params));
  return failures;
};

/** Unlike the other ensure* functions, this doesn't call its own calc step: calculateNeck needs
 * arch geometry (topArch/topGouge) the panel has already solved for its own render pass, so the
 * panel calls calculateNeck itself before this. */
export const ensureNeckPath = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
): void => {
  upsertPathEntry(paths, 'neck', defineNeckPath(params));
};

// how far the user has drafted the outline, stage by stage; each stage seeds itself on its first
// solve, so these are what tell a drafted stage from one never reached
export const hasMainBouts = (params: EnricoCerutiParams): boolean => {
  const b = params.bouts;
  return !!(b.U0 && b.U1 && b.L0 && b.L1);
};

export const hasCorners = (params: EnricoCerutiParams): boolean => !!(params.bouts.UCr && params.bouts.LCr);

export const hasCenterBout = (params: EnricoCerutiParams): boolean => !!params.bouts.C0;

export const hasOuterTrace = (params: EnricoCerutiParams): boolean => {
  const o = params.outerCorners;
  return !!(o.U3 || o.C2 || o.C1 || o.L3);
};

// re-solves the rib outline on from the corners as far as the user has drafted it, so it follows an
// edit to the main bouts. Seeds nothing: a stage never reached stays unsolved. The failures name the
// sections that didn't solve. The main bouts are the caller's to solve first.
export const calculateInnerOutline = (params: EnricoCerutiParams): SolveFailure<CornerKey | CenterBoutKey>[] => [
  ...(hasCorners(params) ? calculateCorners(params) : []),
  ...(hasCenterBout(params) ? calculateCenterBout(params) : []),
];

// whether the neck and the scroll on it were re-solved this pass, and so can be drawn
export type NeckProfileSolve = { neck: boolean; scroll: boolean };
export type FrontProfileSolve = NeckProfileSolve & { failures: SolveFailure<CornerKey | CenterBoutKey>[] };

const NO_NECK: NeckProfileSolve = { neck: false, scroll: false };

// the neck the user has set, re-solved against the top arch so it follows the arch and the rib
// taper, and the scroll once its panels have started it. `topArch` for a caller that has solved
// the arch already
export const solveNeckForProfile = (params: EnricoCerutiParams, topArch?: LongArchSolve): NeckProfileSolve => {
  const gouge = params.arching?.top.fluting;
  if (!(params.neck?.neckTop && gouge)) return NO_NECK;
  calculateNeck(params, topArch ?? solveLongArch(params, params.arching!.top.arch, gouge), gouge);
  return { neck: true, scroll: solveScrollForProfile(params) };
};

// the same carried on through everything the user has reached, so a view of the whole instrument
// follows an edit made upstream. The cached paths are refreshed only once the outline closes with
// every section solved. `neck: false` leaves the neck and scroll unsolved, for a view that won't
// draw them.
export const ensureFrontProfilePaths = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
  opts: { neck?: boolean } = {},
): FrontProfileSolve => {
  const failures = calculateInnerOutline(params);
  if (failures.length || !hasCenterBout(params)) return { failures, ...NO_NECK };
  upsertPathEntry(paths, 'inner', defineInnerPath(params));
  if (!hasOuterTrace(params)) return { failures: [], ...NO_NECK };

  calculateOuterArcs(params);
  ensureOuterTracePaths(params, paths);
  if (params.fHoles) ensureFholePath(params, paths);
  return { failures: [], ...(opts.neck === false ? NO_NECK : solveNeckForProfile(params)) };
};

