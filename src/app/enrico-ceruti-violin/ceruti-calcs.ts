import { solveInscribedCircleAlongAxis, circleCircleIntersections, angleFromCenter, interceptCirclesAndPoint, dist, lineFromTwoPoints, pointOnCircle, offsetCircleRadius, offsetArcRadius, inscribeCircleWithinCircle, pathFromArc, pathFromLine, flipArcAboutY, flipPointAboutY, unifyConnectedSvgPaths, pathFromRoundedRect, flipRectAboutY, pathFromCircle, pathFromRect, combinePathStrings, differenceFromTwoPaths, lineCircleIntersection, redefineArcCircle, intersectionFromTwoPaths, translatePath, flipCircleAboutY, interceptCirclesAndPointCompound } from "../helpers/draftMath";
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, increaseArcAngle, Line, Pt, Rectangle } from "../models/types";
import { error } from "../shared/message-emitter";
import { EnricoCerutiParams } from "./ceruti-types";

export function calculateMainBouts(p: EnricoCerutiParams): void {
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

    // recalcuate display ratios
    p.ratios.UBtoLB = p.bouts.UBW / p.bouts.LBW;
    p.ratios.U0toUBW = p.bouts.U0.r / UBWI;
    p.ratios.U1toUBW = p.bouts.U1.r / UBWI;

    p.ratios.LBtoH = p.bouts.LBW / p.height;
    p.ratios.L0toLBW = p.bouts.L0.r / LBWI;
    p.ratios.L1toLBW = p.bouts.L1.r / LBWI;

    p.bouts.U0.y = p.height - inset - p.bouts.U0.r;
    p.bouts.L0.y = inset + p.bouts.L0.r;
    p.bouts.U1.x = p.bouts.UBW / 2 - p.bouts.U1.r - inset;
    p.bouts.U1.y = solveInscribedCircleAlongAxis(p.bouts.U0, p.bouts.U1.r, "x", p.bouts.U1.x, true);
    p.bouts.L1.x = p.bouts.LBW / 2 - p.bouts.L1.r - inset;
    p.bouts.L1.y = solveInscribedCircleAlongAxis(p.bouts.L0, p.bouts.L1.r, "x", p.bouts.L1.x, false);

    let upperIntersect = circleCircleIntersections(p.bouts.U0, p.bouts.U1);
    let U0Angle = angleFromCenter(p.bouts.U0, upperIntersect[0]);
    let U1Angle = angleFromCenter(p.bouts.U1, upperIntersect[0]);

    p.bouts.U0 = arcFromCircle(p.bouts.U0, 1 / 2 * Math.PI, U0Angle);
    p.bouts.U1 = arcFromCircle(p.bouts.U1, U1Angle, 0);

    let lowerIntersect = circleCircleIntersections(p.bouts.L0, p.bouts.L1);
    let L0Angle = angleFromCenter(p.bouts.L0, lowerIntersect[0]);
    let L1Angle = angleFromCenter(p.bouts.L1, lowerIntersect[0]);

    p.bouts.L0 = arcFromCircle(p.bouts.L0, 3 / 2 * Math.PI, L0Angle);
    p.bouts.L1 = arcFromCircle(p.bouts.L1, L1Angle, 0);

    if (p.options.useViolNeck) {
        let Vr = p.viol?.V0?.r ?? p.bouts.UBW / 5
        let x = p.viol?.width ? p.viol?.width / 2 : p.bouts.UBW / 10

        let Vx = Vr + x
        let c = Vr + p.bouts.U0.r
        let Vy = Math.sqrt(c * c - Vx * Vx) - p.bouts.U0.r
        Vy += (p.bouts.U0.y + p.bouts.U0.r)

        if (p.viol && p.viol.width) {
            p.viol.V0 = new Arc(Vx, Vy, Vr)
        }
        else {
            p.viol = {
                V0: new Arc(Vx, Vy, Vr),
                width: 2 * x
            }
        }

        let V0intersect = circleCircleIntersections(p.bouts.U0, p.viol.V0)[0];
        let V0Angle = angleFromCenter(p.viol.V0, V0intersect);
        let U0Angle = angleFromCenter(p.bouts.U0, V0intersect);

        p.bouts.U0.start = U0Angle;
        p.viol.V0.start = V0Angle
        p.viol.V0.end = Math.PI
    }

}

export function calculateCorners(p: EnricoCerutiParams): void {
    let inset = p.overhang + p.rib;
    let UBWI = p.bouts.UBW - 2 * inset;
    let LBWI = p.bouts.LBW - 2 * inset;

    if (!p.bouts.UCr) {
        // we set a line at the ratio height of the body, then draw a guide circle from the bout to that line
        // the intersection defines the "default" corner position, courtesy of David Beard
        let lgPt = new Pt(-p.bouts.LBW / 2, p.bouts.L1.y);
        let lgC = new Circle(lgPt.x, lgPt.y, p.bouts.LBW) 
        let lgH = p.height * p.ratios.LCYtoH
        let LCr = lineCircleIntersection({x:0, y:lgH}, {x:100, y:lgH}, lgC).sort((a, b) => a.x - b.x)[1] 
        p.bouts.LCr = new Pt(LCr.x, LCr.y);

        let ugPt = new Pt(-p.bouts.UBW / 2, p.bouts.U1.y);
        let ugC = new Circle(ugPt.x, ugPt.y, p.bouts.UBW)
        let ugH = p.height * p.ratios.UCYtoH
        let UCr = lineCircleIntersection({x:0, y:ugH}, {x:100, y:ugH}, ugC).sort((a, b) => a.x - b.x)[1]
        p.bouts.UCr = new Pt(UCr.x, UCr.y);

        p.bouts.UCr.x = Math.round(p.bouts.UCr.x * 10) / 10
        p.bouts.UCr.y = Math.round(p.bouts.UCr.y * 10) / 10
        p.bouts.LCr.x = Math.round(p.bouts.LCr.x * 10) / 10
        p.bouts.UCr.y = Math.round(p.bouts.UCr.y * 10) / 10
      
    }

    let U2R = p.bouts.U2?.r ?? Math.round(UBWI * p.ratios.U2toUBW);
    let U2Y = p.bouts.U2?.y ?? p.bouts.U1.y;
            
    p.bouts.U31 = p.bouts.U31 ?? new Arc(0,0,12, 17/16 * Math.PI)
    p.bouts.L31 = p.bouts.L31 ?? new Arc(0,0,12, 15/16 * Math.PI)

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

    if (p.options.U31DoubleArc) {
        let U3r = p.bouts.U3.r
        let U31 =  p.bouts.U31.r
        let theta = p.bouts.U31.start ?? 17/16 * Math.PI
        let compoundCircles = interceptCirclesAndPointCompound(p.bouts.U2!, p.bouts.UCr, U3r, U31, theta).sort((a, b) => a.C1.y - b.C1.y)[1];
        let U3start = circleCircleIntersections(compoundCircles.C1, p.bouts.U2)[0]
        let U31start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

        p.bouts.U2 = arcFromCircle(p.bouts.U2, p.bouts.U2.start, angleFromCenter(p.bouts.U2, U3start));
        p.bouts.U3 = arcFromCircleAndPoints(compoundCircles.C1, U3start, U31start);
        p.bouts.U31 = arcFromCircleAndPoints(compoundCircles.C2, U31start, p.bouts.UCr);
    }
    else {
        // viol corner calcs
        if (p.options.useViolCornerLC) {
            let L1EndPt = pointOnCircle(p.bouts.L1!, p.bouts.L1.end);
            let a = p.bouts.LCr.y - L1EndPt.y
            let b = L1EndPt.x - p.bouts.LCr.x
            let L4r = (a * a + b * b) / (2 * b)

            let l4 = new Circle(L1EndPt.x - L4r, L1EndPt.y, L4r);
            p.bouts.L4 = arcFromCircleAndPoints(l4, L1EndPt, p.bouts.LCr);
        }

        let U3R = p.bouts.U3?.r ?? Math.round(LBWI * p.ratios.U3toLBW);
        p.bouts.U3 = arcFromCircle(interceptCirclesAndPoint(p.bouts.U2, p.bouts.UCr, U3R).sort((a, b) => a.y - b.y)[1]);

        let L3R = p.bouts.L3?.r ?? Math.round(LBWI * p.ratios.L3toLBW);
        p.bouts.L3 = arcFromCircle(interceptCirclesAndPoint(p.bouts.L2, p.bouts.LCr, L3R).sort((a, b) => a.y - b.y)[0]);

        let U2Intersect = circleCircleIntersections(p.bouts.U2, p.bouts.U3).sort((a, b) => a.y - b.y);
        let U2Angle = angleFromCenter(p.bouts.U2, U2Intersect[1]);
        let U2StartAngle = angleFromCenter(p.bouts.U2, p.bouts.U1);

        if (!U1U2Match) {
            let newU1Intersect = circleCircleIntersections(p.bouts.U1, p.bouts.U2).sort((a, b) => a.y - b.y);
            let U1EndAngle = angleFromCenter(p.bouts.U1, newU1Intersect[0]); // we might have to recalculate the angle if we altered the Y height of
            p.bouts.U1.end = U1EndAngle
        }
        p.bouts.U2 = arcFromCircle(p.bouts.U2, U2StartAngle, U2Angle);
        p.bouts.U3 = arcFromCircleAndPoints(p.bouts.U3, U2Intersect[1], p.bouts.UCr);
    }


    if (p.options.L31DoubleArc) {
        let L3r = p.bouts.L3.r
        let L31r =  p.bouts.L31.r
        let theta = p.bouts.L31.start ?? 15/16 * Math.PI
        let compoundCircles = interceptCirclesAndPointCompound(p.bouts.L2!, p.bouts.LCr, L3r, L31r, theta).sort((a, b) => a.C1.y - b.C1.y)[0];
        let L3start = circleCircleIntersections(compoundCircles.C1, p.bouts.L2)[0]
        let L31start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

        p.bouts.L2 = arcFromCircle(p.bouts.L2, p.bouts.L2.start, angleFromCenter(p.bouts.L2, L3start));
        p.bouts.L3 = arcFromCircleAndPoints(compoundCircles.C1, L3start, L31start);
        p.bouts.L31 = arcFromCircleAndPoints(compoundCircles.C2, L31start, p.bouts.LCr);
    }
    else {
        let L2Intersect = circleCircleIntersections(p.bouts.L2, p.bouts.L3).sort((a, b) => a.y - b.y)[0];
        let L2Angle = angleFromCenter(p.bouts.L2, L2Intersect);
        let L2StartAngle = angleFromCenter(p.bouts.L2, p.bouts.L1);

        if (!L2U1Match) {
            let newL1Intersect = circleCircleIntersections(p.bouts.L1, p.bouts.L2).sort((a, b) => a.y - b.y)[0];
            let L1EndAngle = angleFromCenter(p.bouts.L1, newL1Intersect);
            p.bouts.L1.end = L1EndAngle // we might have to recalculate the angle if we altered the Y height of
        }

        p.bouts.L2 = arcFromCircle(p.bouts.L2, L2StartAngle, L2Angle);
        p.bouts.L3 = arcFromCircleAndPoints(p.bouts.L3, L2Intersect, p.bouts.LCr);
    }
    if (p.options.useViolCornerUC) {
        let U1EndPt = pointOnCircle(p.bouts.U1!, p.bouts.U1.end);
        let a = p.bouts.UCr.y - U1EndPt.y
        let b = U1EndPt.x - p.bouts.UCr.x
        let U4r = (a * a + b * b) / (2 * b)

        let u4 = new Circle(U1EndPt.x - U4r, U1EndPt.y, U4r);
        p.bouts.U4 = arcFromCircleAndPoints(u4, U1EndPt, p.bouts.UCr);
    }

    // recalculate display ratios
    p.ratios.U2toUBW = p.bouts.U2.r / UBWI;
    p.ratios.U3toLBW = p.bouts.U3.r / LBWI;
    p.ratios.L2toLBW = p.bouts.L2.r / LBWI;
    p.ratios.L3toLBW = p.bouts.L3.r / LBWI;
    p.ratios.UCYtoH = p.bouts.UCr.y / p.height;
    p.ratios.LCYtoH = p.bouts.LCr.y / p.height;
}

let lastWorkingC0: Arc | null = null;
export function calculateCenterBout(p: EnricoCerutiParams, solveC0?: boolean): void {
    let inset = p.overhang + p.rib;
    let UBWI = p.bouts.UBW - 2 * inset;
    let LBWI = p.bouts.LBW - 2 * inset;
    let HI = p.height - 2 * inset;

    if (solveC0 !== undefined)
        p.options.useKellyC0 = solveC0; // if solveC0 is passed in, then we want to toggle whether C0 is fixed or not, and remember on future calcs 

    p.bouts.CBW = p.bouts.CBW ?? Math.round(p.bouts.LBW * p.ratios.CBWtoLBW);

    if (p.options.useKellyC0) {
        try {
            let UtoL = dist(p.bouts.U2!, p.bouts.L2!);  // these joining circles are the ones that must intercept with C0, modified kelly theory
            let UtoC = p.bouts.U2.r + p.bouts.C0.r;
            let LtoC = p.bouts.L2.r + p.bouts.C0.r;

            let theta = Math.acos((UtoL * UtoL + UtoC * UtoC - LtoC * LtoC) / (2 * UtoL * UtoC));  // angle off U2 to C0, but with the Y axis as the line from U2 to L2

            // now we need to begin converting this to the proper coordinate space
            // first, the above theta needs to be referenced added to 3/2 pi, as it is pointing down
            theta = theta + 3 * Math.PI / 2; // angle from U2 to C0, with the line from U2 to L2 as reference

            // now we need to convert the angle to the standard xy plane
            let lineFromU2toL2 = lineFromTwoPoints(p.bouts.U2!, p.bouts.L2!);
            if (lineFromU2toL2.m !== Infinity && lineFromU2toL2.m !== -Infinity) {
                let angleFromU2toL2 = Math.atan(lineFromU2toL2.m); // angle of the line from U2 to L2, with the standard xy plane as reference
                let diffFromYAxis = Math.PI / 2 - angleFromU2toL2; // angle from the line U2 to L2, to the Y axis
                theta = theta - diffFromYAxis; // angle from U2 to C0, with the standard xy plane as reference
            }

            // cos(finalAngle) = o / r = (C0.x - U2.x) / (C0.r + U2.r)
            // sin(finalAngle) = a / r = (U2.y - C0.y) / (C0.r + U2.r)
            p.bouts.C0.x = p.bouts.U2.x + Math.cos(theta) * UtoC;
            p.bouts.C0.y = p.bouts.U2.y + Math.sin(theta) * UtoC;

            // if the above calculations result in a C0 that doesn't intersect with L2, then we have an impossible C0 and should throw an error
            let C0toL2 = dist(p.bouts.C0, p.bouts.L2!);
            let C0toU2 = dist(p.bouts.C0, p.bouts.U2!);
            if (C0toL2 > p.bouts.C0.r + p.bouts.L2.r + 1 || C0toU2 > p.bouts.C0.r + p.bouts.U2.r + 1)
                throw new Error("Given the radii of C0, L2 and U2, there is no condition where C0 can be fit. Likely, you can increase the radius of C0 and try again.")

            // makes sense to recalculate center bout width here
            p.bouts.CBW = (p.bouts.C0.x - p.bouts.C0.r + inset) * 2;
            lastWorkingC0 = JSON.parse(JSON.stringify(p.bouts.C0));
        }
        catch (e) {
            p.options.useKellyC0 = false; // if we fail to solve for C0 using the kelly method, we should turn it off so that the user can still get a valid C0 by adjusting the main bouts and corners
            error("Given the radii of C0, L2 and U2, there is no condition where C0 can be fit. Likely, you can increase the radius of C0 and try again.", "Failed to fit C0.");
            if (lastWorkingC0)
                p.bouts.C0 = JSON.parse(JSON.stringify(lastWorkingC0));

            return calculateCenterBout(p, false); // recalculate with Kelly method disabled
        }
    }

    if (!p.options.useKellyC0) {
        let c0Radius = p.bouts.C0?.r ?? Math.round(LBWI * p.ratios.C0toLBW);
        let boutMid = ((p.height - p.bouts.UBW) - p.bouts.LBW) / 2 + p.bouts.LBW
        let c0Y = p.bouts.C0?.y ?? boutMid;
        p.bouts.C0 = new Arc(p.bouts.CBW / 2 - inset + c0Radius, c0Y, c0Radius);
        lastWorkingC0 = JSON.parse(JSON.stringify(p.bouts.C0));
    }

    // initialize C11 and C21
    p.bouts.C11 = p.bouts.C11 ?? new Arc(0,0,12, 24/16 * Math.PI)
    p.bouts.C21 = p.bouts.C21 ?? new Arc(0,0,12, 8/16 * Math.PI)
    let cuRadius = p.bouts.C2?.r ?? Math.round((LBWI * p.ratios.C2toLBW));
    let clRadius = p.bouts.C1?.r ?? Math.round((LBWI * p.ratios.C1toLBW));
    let CUIntercept;
    let CLIntercept;

    if (p.options.C21DoubleArc) {
        let C2r = p.bouts.C2.r
        let C21r =  p.bouts.C21.r
        let theta = p.bouts.C21.start ?? 15/16 * Math.PI
        let compoundCircles = interceptCirclesAndPointCompound(p.bouts.C0!, p.bouts.UCr, C2r, C21r, theta).sort((a, b) => a.C1.y - b.C1.y)[0];
        CUIntercept = circleCircleIntersections(compoundCircles.C1, p.bouts.C0)[1]
        let C21start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

        p.bouts.C2 = arcFromCircleAndPoints(compoundCircles.C1, CUIntercept, C21start);
        p.bouts.C21 = arcFromCircleAndPoints(compoundCircles.C2, C21start, p.bouts.UCr);

    }
    else {
        let CU = interceptCirclesAndPoint(p.bouts.C0, p.bouts.UCr!, cuRadius).sort((a, b) => b.y - a.y)[1];
        CUIntercept = circleCircleIntersections(p.bouts.C0, CU).sort((a, b) => b.y - a.y)[0];
        p.bouts.C2 = arcFromCircleAndPoints(CU, CUIntercept, p.bouts.UCr);

    }
    if (p.options.C11DoubleArc) {
        let C1r = p.bouts.C1.r
        let C11r = p.bouts.C11.r
        let theta = p.bouts.C11.start ?? 17/16 * Math.PI
        let compoundCircles = interceptCirclesAndPointCompound(p.bouts.C0!, p.bouts.LCr, C1r, C11r, theta).sort((a, b) => a.C1.y - b.C1.y)[1];
        CLIntercept = circleCircleIntersections(compoundCircles.C1, p.bouts.C0)[1]
        let C11start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

        p.bouts.C1 = arcFromCircleAndPoints(compoundCircles.C1, CLIntercept, C11start);
        p.bouts.C11 = arcFromCircleAndPoints(compoundCircles.C2, C11start, p.bouts.LCr);
    }
    else {
        let CL = interceptCirclesAndPoint(p.bouts.C0, p.bouts.LCr!, clRadius).sort((a, b) => a.y - b.y)[1];
        CLIntercept = circleCircleIntersections(p.bouts.C0, CL).sort((a, b) => a.y - b.y)[1];
        p.bouts.C1 = arcFromCircleAndPoints(CL, CLIntercept, p.bouts.LCr);
    }

    p.bouts.C0 = arcFromCircleAndPoints(p.bouts.C0, CUIntercept, CLIntercept);

    // recalculate display ratios
    p.ratios.CBWtoLBW = p.bouts.CBW / p.bouts.LBW;
    p.ratios.C0toLBW = p.bouts.C0.r / LBWI;
    p.ratios.C0YtoH = p.bouts.C0.y / HI;
    p.ratios.C2toLBW = p.bouts.C2.r / LBWI;
    p.ratios.C1toLBW = p.bouts.C1.r / LBWI;

}

export function calculateOuterCorners(p: EnricoCerutiParams): void {
    let inset = p.overhang + p.rib;

    // initalize the possibly undefined values
    let initialized = p.outerCorners.U3 != null
    p.outerCorners.U3 = p.outerCorners.U3 ? redefineArcCircle(p.outerCorners.U3, p.bouts.U3, -inset) : offsetArcRadius(p.bouts.U3, -inset); // user might have redefined bouts
    p.outerCorners.C2 = p.outerCorners.C2 ? redefineArcCircle(p.outerCorners.C2, p.bouts.C2, -inset) : offsetArcRadius(p.bouts.C2, -inset);
    p.outerCorners.C1 = p.outerCorners.C1 ? redefineArcCircle(p.outerCorners.C1, p.bouts.C1, -inset) : offsetArcRadius(p.bouts.C1, -inset);
    p.outerCorners.L3 = p.outerCorners.L3 ? redefineArcCircle(p.outerCorners.L3, p.bouts.L3, -inset) : offsetArcRadius(p.bouts.L3, -inset);


    // we want to increase the angle by the default corners a little bit
    if (!initialized) {
        // p.outerCorners.U31 = increaseArcAngle(p.outerCorners.U31, 5);
        p.outerCorners.C2 = increaseArcAngle(p.outerCorners.C2, -10);
        p.outerCorners.C1 = increaseArcAngle(p.outerCorners.C1, 10);
        // p.outerCorners.L31 = increaseArcAngle(p.outerCorners.L31, -5);
    }

    p.outerCorners.U3.end = p.outerCorners.U3.start + p.outerCorners.U3.diffDeg * Math.PI / 180;
    p.outerCorners.C2.end = p.outerCorners.C2.start - p.outerCorners.C2.diffDeg * Math.PI / 180;
    p.outerCorners.C1.end = p.outerCorners.C1.start + p.outerCorners.C1.diffDeg * Math.PI / 180;
    p.outerCorners.L3.end = p.outerCorners.L3.start - p.outerCorners.L3.diffDeg * Math.PI / 180;

    if (p.options.U31DoubleArc) {
        // initialize the data if needed
        p.outerCorners.U31 = p.outerCorners.U31 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.U3, p.outerCorners.U3.r * .8, p.outerCorners.U3.end), p.outerCorners.U3.end, p.outerCorners.U3.end * 1.1);

        // now recalculate based on last inputed values
        let radDiff = p.outerCorners.U31.diffDeg * Math.PI / 180;
        p.outerCorners.U31 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.U3, p.outerCorners.U31.r, p.outerCorners.U3.end), p.outerCorners.U3.end, p.outerCorners.U3.end + radDiff);
    }

    if (p.options.C21DoubleArc) {
        p.outerCorners.C21 = p.outerCorners.C21 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.C2, p.outerCorners.C2.r * .8, p.outerCorners.C2.end), p.outerCorners.C2.end, p.outerCorners.C2.end * 0.9);
        let radDiffCU = p.outerCorners.C21.diffDeg * Math.PI / 180;
        p.outerCorners.C21 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.C2, p.outerCorners.C21.r, p.outerCorners.C2.end), p.outerCorners.C2.end, p.outerCorners.C2.end - radDiffCU);
    }

    if (p.options.C11DoubleArc) {
        p.outerCorners.C11 = p.outerCorners.C11 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.C1, p.outerCorners.C1.r * .8, p.outerCorners.C1.end), p.outerCorners.C1.end, p.outerCorners.C1.end * 1.1);
        let radDiffCL = p.outerCorners.C11.diffDeg * Math.PI / 180;
        p.outerCorners.C11 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.C1, p.outerCorners.C11.r, p.outerCorners.C1.end), p.outerCorners.C1.end, p.outerCorners.C1.end + radDiffCL);
    }

    if (p.options.L31DoubleArc) {
        p.outerCorners.L31 = p.outerCorners.L31 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.L3, p.outerCorners.L3.r * .8, p.outerCorners.L3.end), p.outerCorners.L3.end, p.outerCorners.L3.end * 0.9);
        let radDiffL3 = p.outerCorners.L31.diffDeg * Math.PI / 180;
        p.outerCorners.L31 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.L3, p.outerCorners.L31.r, p.outerCorners.L3.end), p.outerCorners.L3.end, p.outerCorners.L3.end - radDiffL3);
    }
}


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
            let pad = 2
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
            let pad = 3
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
            let endPt = pointOnCircle(p.viol!.V0, p.viol!.V0.end);
            p.blocks.U = new Rectangle(new Pt(endPt.x+2, endPt.y), new Pt(-endPt.x - 2, endPt.y - p.blocks.U.height));
        }
    }
    else {
        p.blocks.U = new Rectangle(new Pt(-p.blocks.U.width / 2, p.height - inset - p.blocks.U.height), new Pt(p.blocks.U.width / 2, p.height - inset))
        p.blocks.CU = new Rectangle(new Pt(p.bouts.UCr.x + p.blocks.CUPad, p.bouts.UCr.y - p.blocks.CUPad), new Pt(p.bouts.UCr.x + p.blocks.CUPad - p.blocks.CU.width, p.bouts.UCr.y - p.blocks.CUPad + p.blocks.CU.height));
        p.blocks.CL = new Rectangle(new Pt(p.bouts.LCr.x + p.blocks.CLPad, p.bouts.LCr.y + p.blocks.CLPad), new Pt(p.bouts.LCr.x + p.blocks.CLPad - p.blocks.CL.width, p.bouts.LCr.y + p.blocks.CLPad - p.blocks.CL.height));
        p.blocks.L = new Rectangle(new Pt(-p.blocks.L.width / 2, inset), new Pt(p.blocks.L.width / 2, inset + p.blocks.L.height));


        if (p.options.useViolNeck) {
            let endPt = pointOnCircle(p.viol!.V0, p.viol!.V0.end);
            p.blocks.U = new Rectangle(new Pt(endPt.x+2, endPt.y), new Pt(-endPt.x - 2, endPt.y - p.blocks.U.height));
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
    const bitOffset = (bitRadius * Math.sqrt(2) / 2) - tolerance;

    // these will keep the bit from making internal right angles
    const circleCutouts = [
        pathFromCircle({ x: blocks[0].Pt1.x + bitOffset, y: blocks[0].Pt1.y + bitOffset, r: bitRadius }),
        pathFromCircle({ x: blocks[0].Pt2.x - bitOffset, y: blocks[0].Pt1.y + bitOffset, r: bitRadius }),

        pathFromCircle({ x: blocks[1].Pt2.x + bitOffset, y: blocks[1].Pt2.y - bitOffset, r: bitRadius }),
        pathFromCircle({ x: blocks[2].Pt2.x - bitOffset, y: blocks[2].Pt2.y - bitOffset, r: bitRadius }),

        pathFromCircle({ x: blocks[3].Pt2.x + bitOffset, y: blocks[3].Pt2.y + bitOffset, r: bitRadius }),
        pathFromCircle({ x: blocks[4].Pt2.x - bitOffset, y: blocks[4].Pt2.y + bitOffset, r: bitRadius }),
 
        pathFromCircle({ x: blocks[5].Pt1.x + bitOffset, y: blocks[5].Pt2.y - bitOffset, r: bitRadius }),
        pathFromCircle({ x: blocks[5].Pt2.x - bitOffset, y: blocks[5].Pt2.y - bitOffset, r: bitRadius }),
    ];

    const blockInset = 20;
    const clampWidest = Math.max(Math.abs(p.blocks.L.Pt1.x), Math.abs(p.blocks.U.Pt1.x));

    let cutoutPaths = blocks.map(block => pathFromRect(block));
    cutoutPaths = cutoutPaths.concat(circleCutouts);

    const renderDensity = useHighAccuracy ? 0.1 : 1;
    let mouldPath = innerPath

    for (let cutoutPath of cutoutPaths) {
        mouldPath = differenceFromTwoPaths(mouldPath, cutoutPath, renderDensity);
    }
   
    let clampBox: string[]
    if (simpleClampBox) {
         let halfwayPt = p.bouts.C0.y
        const clampBlockCutout1 = new Rectangle(
            new Pt(clampWidest * 1.3, p.blocks.U.Pt1.y - blockInset ), 
            new Pt(clampWidest * -1.3, halfwayPt + blockInset/2)
        );
        const clampBlockCutout2 = new Rectangle(
            new Pt(clampWidest * 1.3, halfwayPt - blockInset /2), 
            new Pt(clampWidest * -1.3, p.blocks.L.Pt2.y + blockInset )
        );

        clampBox = [
            pathFromRoundedRect(clampBlockCutout1, bitRadius),
            pathFromRoundedRect(clampBlockCutout2, bitRadius)
        ]
    
    }
    else {
        let clampOffset = Math.max(p.blocks.U.height, p.blocks.L.height) + p.clampChannelWidth
        if (p.options.useViolNeck) 
            clampOffset = p.blocks.L.height + p.clampChannelWidth
        let U1End = pointOnCircle(offsetArcRadius(p.bouts.U1, -clampOffset), offsetArcRadius(p.bouts.U1, -clampOffset).start);
        let U2End = pointOnCircle(offsetArcRadius(p.bouts.U2, -clampOffset), offsetArcRadius(p.bouts.U2, -clampOffset).end);
        let L1End = pointOnCircle(offsetArcRadius(p.bouts.L1, -clampOffset), offsetArcRadius(p.bouts.L1, -clampOffset).start);
        let L2End = pointOnCircle(offsetArcRadius(p.bouts.L2, -clampOffset), offsetArcRadius(p.bouts.L2, -clampOffset).end);

        let V0;
        let V0End;
        if (p.options.useViolNeck) {
            V0 = offsetArcRadius(p.viol.V0, clampOffset)
            V0End = pointOnCircle(V0, V0.end);
        }

        let C0Clamp = offsetArcRadius(p.bouts.C0, clampOffset)
        let C0UpPt = lineCircleIntersection(p.blocks.CU.Pt1, flipPointAboutY(p.blocks.CU.Pt1), C0Clamp).sort((a, b) => a.x - b.x)[0];
        let C0LowPt = lineCircleIntersection(p.blocks.CL.Pt1, flipPointAboutY(p.blocks.CL.Pt1), C0Clamp).sort((a, b) => a.x - b.x)[0];
        C0Clamp.end = angleFromCenter(C0Clamp, C0UpPt);
        C0Clamp.start = angleFromCenter(C0Clamp, C0LowPt);

        clampBox = [
            pathFromArc(offsetArcRadius(p.bouts.U1, -clampOffset)),
            pathFromArc(offsetArcRadius(p.bouts.U2, -clampOffset)),
            pathFromArc(flipArcAboutY(offsetArcRadius(p.bouts.U1, -clampOffset))),
            pathFromArc(flipArcAboutY(offsetArcRadius(p.bouts.U2, -clampOffset))),

            pathFromArc(offsetArcRadius(p.bouts.L1, -clampOffset)),
            pathFromArc(offsetArcRadius(p.bouts.L2, -clampOffset)),
            pathFromArc(flipArcAboutY(offsetArcRadius(p.bouts.L1, -clampOffset))),
            pathFromArc(flipArcAboutY(offsetArcRadius(p.bouts.L2, -clampOffset))),
        ]
        clampBox.push(pathFromLine(U1End, flipPointAboutY(U1End)));
        clampBox.push(pathFromLine(U2End, flipPointAboutY(U2End)));
        clampBox.push(pathFromLine(L1End, flipPointAboutY(L1End)));
        clampBox.push(pathFromLine(L2End, flipPointAboutY(L2End)));

        // clampBox.push(pathFromLine(p.blocks.CU.Pt1, flipPointAboutY(p.blocks.CU.Pt1)))
        // clampBox.push(pathFromLine(p.blocks.CL.Pt1, flipPointAboutY(p.blocks.CL.Pt1)))
        clampBox.push(pathFromArc(C0Clamp));
        clampBox.push(pathFromArc(flipArcAboutY(C0Clamp)));

        // TODO
        // if (p.options.useViolNeck) {
        //     clampBox.push(pathFromArc(V0));
        //     clampBox.push(pathFromArc(flipArcAboutY(V0)));
        //     clampBox.push(pathFromLine(V0End, flipPointAboutY(V0End)));
        // }
        // else {  
        // }

        clampBox.push(pathFromLine(C0UpPt, {... C0UpPt, y: C0UpPt.y + p.blocks.CU.height}));
        clampBox.push(pathFromLine(C0LowPt, {... C0LowPt, y: C0LowPt.y - p.blocks.CL.height}));
        clampBox.push(pathFromLine(flipPointAboutY(C0UpPt), {... flipPointAboutY(C0UpPt), y: C0UpPt.y + p.blocks.CU.height}));
        clampBox.push(pathFromLine(flipPointAboutY(C0LowPt), {... flipPointAboutY(C0LowPt), y: C0LowPt.y - p.blocks.CL.height}));

        clampBox.push(pathFromLine({... C0UpPt, y: C0UpPt.y + p.blocks.CU.height}, {... flipPointAboutY(C0UpPt), y: C0UpPt.y + p.blocks.CU.height}));
        clampBox.push(pathFromLine({... C0LowPt, y: C0LowPt.y - p.blocks.CL.height}, {... flipPointAboutY(C0LowPt), y: C0LowPt.y - p.blocks.CL.height}));

    }

    return combinePathStrings([...clampBox, mouldPath]);
}

export function calculateCornerBlocks(p: EnricoCerutiParams, innerPath: string, padding = 5): string[] {
    const rectMinX = (r: Rectangle) => Math.min(r.Pt1.x, r.Pt2.x);
    const rectMinY = (r: Rectangle) => Math.min(r.Pt1.y, r.Pt2.y);

    // Total width of a row including inter-piece padding.
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

    // Build clipped paths paired with their bounding rectangles.
    const cuRect   = p.blocks.CU;
    const cuMirror = flipRectAboutY(p.blocks.CU);
    const clRect   = p.blocks.CL;
    const clMirror = flipRectAboutY(p.blocks.CL);

    const rowUpper        = [{ rect: p.blocks.U,  path: intersectionFromTwoPaths(pathFromRect(p.blocks.U), innerPath) }];
    const rowUpperCorners = [
        { rect: cuMirror, path: intersectionFromTwoPaths(pathFromRect(cuMirror), innerPath) },
        { rect: cuRect,   path: intersectionFromTwoPaths(pathFromRect(cuRect), innerPath) },
    ];
    const rowLowerCorners = [
        { rect: clMirror, path: intersectionFromTwoPaths(pathFromRect(clMirror), innerPath) },
        { rect: clRect,   path: intersectionFromTwoPaths(pathFromRect(clRect), innerPath) },
    ];
    const rowLower        = [{ rect: p.blocks.L,  path: intersectionFromTwoPaths(pathFromRect(p.blocks.L), innerPath) }];

    // Stack rows top-to-bottom, advancing yCursor by each row's tallest piece.
    const rowHeight = (items: Array<{ rect: Rectangle }>) => Math.max(...items.map(({ rect }) => rect.height));

    let yCursor = 0;
    const r3 = layoutRow(rowLower,        yCursor); yCursor += rowHeight(rowUpper)        + padding;
    const r2 = layoutRow(rowLowerCorners, yCursor); yCursor += rowHeight(rowLowerCorners) + padding;
    const r1 = layoutRow(rowUpperCorners, yCursor); yCursor += rowHeight(rowUpperCorners) + padding;
    const r0 = layoutRow(rowUpper,        yCursor); 


    return [...r0, ...r2, ...r1, ...r3];
}

export function defineInnerArcs(p: EnricoCerutiParams): Arc[] {
    let fullPath = [];
    fullPath.push(p.bouts.L0, p.bouts.L1);
    if (p.options.useViolCornerLC) {
        fullPath.push(p.bouts.L4);
    } else {
        fullPath.push(p.bouts.L2);
        fullPath.push(p.bouts.L3);
    }
    fullPath.push(p.bouts.C0, p.bouts.C1, p.bouts.C2);

    if (p.options.useViolCornerUC) {
        fullPath.push(p.bouts.U4);
    } else {
        fullPath.push(p.bouts.U3);
        fullPath.push(p.bouts.U2);
    }
    fullPath.push(p.bouts.U1);
    fullPath.push(p.bouts.U0);
    if (p.options.useViolNeck)
        fullPath.push(p.viol?.V0!);

    return fullPath;
}

export function defineOuterArcsNoCorners(p: EnricoCerutiParams, offset?: number): Arc[] {
    offset = offset ?? p.overhang + p.rib;
    let fullPath = [];
    fullPath.push(offsetArcRadius(p.bouts.L0, offset), offsetArcRadius(p.bouts.L1, offset));
    if (p.options.useViolCornerLC) {
        // fullPath.push(offsetArcRadius(p.bouts.L4, offset));
    } else {
        fullPath.push(offsetArcRadius(p.bouts.L2, offset));
        // fullPath.push(offsetArcRadius(p.bouts.L3, -inset));
    }

    fullPath.push(
        offsetArcRadius(p.bouts.C0, -offset),
        // offsetArcRadius(p.bouts.CL, -inset), 
        // offsetArcRadius(p.bouts.CU, -inset)
    );

    if (p.options.useViolCornerUC) {
        // fullPath.push(offsetArcRadius(p.bouts.U4, offset));
    } else {
        // fullPath.push(offsetArcRadius(p.bouts.U3, -inset));
        fullPath.push(offsetArcRadius(p.bouts.U2, offset));
    }
    fullPath.push(offsetArcRadius(p.bouts.U1, offset));
    fullPath.push(offsetArcRadius(p.bouts.U0, offset));
    if (p.options.useViolNeck)
        fullPath.push(offsetArcRadius(p.viol?.V0!, -offset));


    return fullPath;
}

export function defineInnerPath(p: EnricoCerutiParams): string {
    let arcs = defineInnerArcs(p);
    let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
    arcs = arcs.concat(mirroredArcs);

    let paths: string[] = arcs.map(arc => pathFromArc(arc));

    if (p.options.useViolNeck) {
        let EndPt = pointOnCircle(p.viol?.V0!, p.viol?.V0.end ?? 0);
        paths.push(pathFromLine(EndPt, flipPointAboutY(EndPt)))
    }

    let path = unifyConnectedSvgPaths(paths);
    return path;
}

export function defineOuterPath(p: EnricoCerutiParams, offset?: number, button = false): string {
    offset = offset ?? p.overhang + p.rib;
    let arcs = defineOuterArcsNoCorners(p, offset);

    let U0ForButton = offsetArcRadius(p.bouts.U0, offset);
    let buttonPaths: string[] = [];
    if (button && !p.options.useViolNeck) {
        p.button = p.button ?? new Rectangle(new Pt(-10, p.height - offset), new Pt(10, p.height - offset + 5));
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

    let paths: string[] = [];

    if (p.options.useViolCornerUC) {
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        let intersects = circleCircleIntersections(U4Offset, p.outerCorners.C2);
        let U4Angle = angleFromCenter(U4Offset, intersects[0])
        let CU1Angle = angleFromCenter(p.outerCorners.C2, intersects[0])
        U4Offset.end = U4Angle
        p.outerCorners.C2.end = CU1Angle
        arcs.push(U4Offset);
        arcs.push(flipArcAboutY(U4Offset));
        arcs.push(p.outerCorners.C2);
        arcs.push(flipArcAboutY(p.outerCorners.C2));
    }
    else {
        arcs.push(p.outerCorners.U3);
        arcs.push(flipArcAboutY(p.outerCorners.U3));
        p.options.U31DoubleArc && arcs.push(p.outerCorners.U31);
        p.options.U31DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.U31));
        arcs.push(p.outerCorners.C2);
        arcs.push(flipArcAboutY(p.outerCorners.C2));
        p.options.C21DoubleArc && arcs.push(p.outerCorners.C21);
        p.options.C21DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.C21));

        // render the lines from the ends of each corners
        if (p.options.U31DoubleArc && p.options.C21DoubleArc) {
            let U32End = pointOnCircle(p.outerCorners.U31, p.outerCorners.U31.end)
            let CU2End = pointOnCircle(p.outerCorners.C21, p.outerCorners.C21.end)
            paths.push(pathFromLine(U32End, CU2End));
            paths.push(pathFromLine(flipPointAboutY(U32End), flipPointAboutY(CU2End)));
        }
        else if (p.options.U31DoubleArc) {
            let U32End = pointOnCircle(p.outerCorners.U31, p.outerCorners.U31.end)
            let CU1End = pointOnCircle(p.outerCorners.C2, p.outerCorners.C2.end)
            paths.push(pathFromLine(U32End, CU1End));
            paths.push(pathFromLine(flipPointAboutY(U32End), flipPointAboutY(CU1End)));
        }
        else if (p.options.C21DoubleArc) {
            let U31End = pointOnCircle(p.outerCorners.U3, p.outerCorners.U3.end)
            let CU2End = pointOnCircle(p.outerCorners.C21, p.outerCorners.C21.end)
            paths.push(pathFromLine(U31End, CU2End));
            paths.push(pathFromLine(flipPointAboutY(U31End), flipPointAboutY(CU2End)));
        }
        else {
            let U31End = pointOnCircle(p.outerCorners.U3, p.outerCorners.U3.end)
            let CU1End = pointOnCircle(p.outerCorners.C2, p.outerCorners.C2.end)
            paths.push(pathFromLine(U31End, CU1End));
            paths.push(pathFromLine(flipPointAboutY(U31End), flipPointAboutY(CU1End)));
        }
    }
    if (p.options.useViolCornerLC) {
        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        let intersects = circleCircleIntersections(L4Offset, p.outerCorners.C1);
        let L4Angle = angleFromCenter(L4Offset, intersects[1])
        let CL1Angle = angleFromCenter(p.outerCorners.C1, intersects[1])
        L4Offset.end = L4Angle
        p.outerCorners.C1.end = CL1Angle
        arcs.push(L4Offset);
        arcs.push(flipArcAboutY(L4Offset));
        arcs.push(p.outerCorners.C1);
        arcs.push(flipArcAboutY(p.outerCorners.C1));
    }
    else {
        arcs.push(p.outerCorners.C1);
        arcs.push(flipArcAboutY(p.outerCorners.C1));
        p.options.C11DoubleArc && arcs.push(p.outerCorners.C11);
        p.options.C11DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.C11));
        arcs.push(p.outerCorners.L3);
        arcs.push(flipArcAboutY(p.outerCorners.L3));
        p.options.L31DoubleArc && arcs.push(p.outerCorners.L31);
        p.options.L31DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.L31));

        if (p.options.C11DoubleArc && p.options.L31DoubleArc) {
            let CL2End = pointOnCircle(p.outerCorners.C11, p.outerCorners.C11.end)
            let L32End = pointOnCircle(p.outerCorners.L31, p.outerCorners.L31.end)
            paths.push(pathFromLine(CL2End, L32End));
            paths.push(pathFromLine(flipPointAboutY(CL2End), flipPointAboutY(L32End)));
        }
        else if (p.options.C11DoubleArc) {
            let CL2End = pointOnCircle(p.outerCorners.C11, p.outerCorners.C11.end)
            let L31End = pointOnCircle(p.outerCorners.L3, p.outerCorners.L3.end)
            paths.push(pathFromLine(CL2End, L31End));
            paths.push(pathFromLine(flipPointAboutY(CL2End), flipPointAboutY(L31End)));
        }
        else if (p.options.L31DoubleArc) {
            let CL1End = pointOnCircle(p.outerCorners.C1, p.outerCorners.C1.end)
            let L32End = pointOnCircle(p.outerCorners.L31, p.outerCorners.L31.end)
            paths.push(pathFromLine(CL1End, L32End));
            paths.push(pathFromLine(flipPointAboutY(CL1End), flipPointAboutY(L32End)));
        }
        else {
            let CL1End = pointOnCircle(p.outerCorners.C1, p.outerCorners.C1.end)
            let L31End = pointOnCircle(p.outerCorners.L3, p.outerCorners.L3.end)
            paths.push(pathFromLine(CL1End, L31End));
            paths.push(pathFromLine(flipPointAboutY(CL1End), flipPointAboutY(L31End)));
        }
    }

    paths.push(...arcs.map(arc => pathFromArc(arc)));

     if (p.options.useViolNeck) {
        if (button) {
            let offsetV0 = offsetArcRadius(p.viol?.V0!, - offset);
            let EndPt = pointOnCircle(offsetV0, offsetV0.end ?? 0);
            let EndPtOffset = {...EndPt, y: EndPt.y + offset} // we need to offset the end point so that the line doesn't intersect with the arc, but rather is tangent to it, which is more manufacturable
            paths.push(pathFromLine(EndPt, EndPtOffset))
            paths.push(pathFromLine(flipPointAboutY(EndPtOffset), flipPointAboutY(EndPt)))

            p.button = p.button ?? new Rectangle(new Pt(10, EndPtOffset.y), new Pt(-10, EndPtOffset.y + 5));
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
            let EndPt = pointOnCircle(offsetV0, offsetV0.end ?? 0);
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

