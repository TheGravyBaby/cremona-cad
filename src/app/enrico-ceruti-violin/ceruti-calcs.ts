import { solveInscribedCircleAlongAxis, circleCircleIntersections, angleFromCenter, interceptCirclesAndPoint, dist, lineFromTwoPoints, pointOnCircle, offsetCircleRadius, offsetArcRadius, inscribeCircleWithinCircle, pathFromArc, pathFromLine, flipArcAboutY, flipPointAboutY } from "../helpers/draftMath";
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, increaseArcAngle } from "../models/types";
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

    if (!p.bouts.UC) {
        p.bouts.UC = { x: Math.round(p.bouts.UBW / 2 * p.ratios.UCXtoUBW), y: Math.round(p.height * p.ratios.UCYtoH) };
        p.bouts.LC = { x: Math.round(p.bouts.LBW / 2 * p.ratios.LCXtoLBW), y: Math.round(p.height * p.ratios.LCYtoH) };
    }

    let U2R = p.bouts.U2?.r ?? Math.round(UBWI * p.ratios.U2toUBW);
    let U2Y = p.bouts.U2?.y ?? p.bouts.U1.y;

    let U1U2Match = false
    if (p.bouts.U2?.r == p.bouts.U1.r && p.bouts.U2?.y == p.bouts.U1.y && p.bouts.U2?.x == p.bouts.U1.x) {
        // this is a special case where the user has set U2 to be the same as U1, 
        // which causes the math below to break since we won't have two distinct circles to intersect
        U1U2Match = true;
        p.bouts.U1.end = 0
    }
    else if (U2Y == p.bouts.U1.y) {
        p.bouts.U2 = new Arc(p.bouts.UBW / 2 - U2R - inset, U2Y, U2R);
    }
    else {
        let c = p.bouts.U2.r - p.bouts.U1.r;
        let b = p.bouts.U2.y - p.bouts.U1.y
        let U2xPlus = p.bouts.U1.x + Math.sqrt(c * c - b * b)
        let U2xMinus = p.bouts.U1.x - Math.sqrt(c * c - b * b)

        p.bouts.U2.x = Math.min(U2xPlus, U2xMinus);
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
    if (L2Y == p.bouts.L1.y) {
        p.bouts.L2 = new Arc(p.bouts.LBW / 2 - L2R - inset, L2Y, L2R);
    }
    else {
        let c = p.bouts.L2.r - p.bouts.L1.r;
        let b = p.bouts.L2.y - p.bouts.L1.y
        let L2xPlus = p.bouts.L1.x + Math.sqrt(c * c - b * b)
        let L2xMinus = p.bouts.L1.x - Math.sqrt(c * c - b * b)

        p.bouts.L2.x = Math.min(L2xPlus, L2xMinus);
    }

    let U3R = p.bouts.U3?.r ?? Math.round(LBWI * p.ratios.U3toLBW);
    p.bouts.U3 = arcFromCircle(interceptCirclesAndPoint(p.bouts.U2, p.bouts.UC, U3R).sort((a, b) => a.y - b.y)[1]);

    let L3R = p.bouts.L3?.r ?? Math.round(LBWI * p.ratios.L3toLBW);
    p.bouts.L3 = arcFromCircle(interceptCirclesAndPoint(p.bouts.L2, p.bouts.LC, L3R).sort((a, b) => a.y - b.y)[0]);

    let U2Intersect = circleCircleIntersections(p.bouts.U2, p.bouts.U3).sort((a, b) => a.y - b.y);
    let U2Angle = angleFromCenter(p.bouts.U2, U2Intersect[1]);
    let U2StartAngle = angleFromCenter(p.bouts.U2, p.bouts.U1);

    if (!U1U2Match) {
        let newU1Intersect = circleCircleIntersections(p.bouts.U1, p.bouts.U2).sort((a, b) => a.y - b.y);
        let U1EndAngle = angleFromCenter(p.bouts.U1, newU1Intersect[0]); // we might have to recalculate the angle if we altered the Y height of
        p.bouts.U1.end = U1EndAngle
    }
    p.bouts.U2 = arcFromCircle(p.bouts.U2, U2StartAngle, U2Angle);
    p.bouts.U3 = arcFromCircleAndPoints(p.bouts.U3, U2Intersect[1], p.bouts.UC);


    let L2Intersect = circleCircleIntersections(p.bouts.L2, p.bouts.L3).sort((a, b) => a.y - b.y)[0];
    let L2Angle = angleFromCenter(p.bouts.L2, L2Intersect);
    let L2StartAngle = angleFromCenter(p.bouts.L2, p.bouts.L1);

    if (!L2U1Match) {
        let newL1Intersect = circleCircleIntersections(p.bouts.L1, p.bouts.L2).sort((a, b) => a.y - b.y)[0];
        let L1EndAngle = angleFromCenter(p.bouts.L1, newL1Intersect);
        p.bouts.L1.end = L1EndAngle // we might have to recalculate the angle if we altered the Y height of
    }

    p.bouts.L2 = arcFromCircle(p.bouts.L2, L2StartAngle, L2Angle);
    p.bouts.L3 = arcFromCircleAndPoints(p.bouts.L3, L2Intersect, p.bouts.LC);

    // viol corner calcs
    if (p.options.useViolCornerLC) {
        let L1EndPt = pointOnCircle(p.bouts.L1!, p.bouts.L1.end);
        let a = p.bouts.LC.y - L1EndPt.y
        let b = L1EndPt.x - p.bouts.LC.x
        let L4r = (a * a + b * b) / (2 * b)

        let l4 = new Circle(L1EndPt.x - L4r, L1EndPt.y, L4r);
        p.bouts.L4 = arcFromCircleAndPoints(l4, L1EndPt, p.bouts.LC);
    }

    if (p.options.useViolCornerUC) {
        let U1EndPt = pointOnCircle(p.bouts.U1!, p.bouts.U1.end);
        let a = p.bouts.UC.y - U1EndPt.y
        let b = U1EndPt.x - p.bouts.UC.x
        let U4r = (a * a + b * b) / (2 * b)

        let u4 = new Circle(U1EndPt.x - U4r, U1EndPt.y, U4r);
        p.bouts.U4 = arcFromCircleAndPoints(u4, U1EndPt, p.bouts.UC);
    }

    // recalculate display ratios
    p.ratios.U2toUBW = p.bouts.U2.r / UBWI;
    p.ratios.U3toLBW = p.bouts.U3.r / LBWI;
    p.ratios.L2toLBW = p.bouts.L2.r / LBWI;
    p.ratios.L3toLBW = p.bouts.L3.r / LBWI;
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

    let cuRadius = p.bouts.CU?.r ?? Math.round((LBWI * p.ratios.CUtoLBW));
    let clRadius = p.bouts.CL?.r ?? Math.round((LBWI * p.ratios.CLtoLBW));

    let CU = interceptCirclesAndPoint(p.bouts.C0, p.bouts.UC!, cuRadius).sort((a, b) => b.y - a.y)[1];
    let CL = interceptCirclesAndPoint(p.bouts.C0, p.bouts.LC!, clRadius).sort((a, b) => a.y - b.y)[1];
    let CUIntercept = circleCircleIntersections(p.bouts.C0, CU).sort((a, b) => b.y - a.y)[0];
    let CLIntercept = circleCircleIntersections(p.bouts.C0, CL).sort((a, b) => a.y - b.y)[1];

    p.bouts.CU = arcFromCircleAndPoints(CU, CUIntercept, p.bouts.UC);
    p.bouts.CL = arcFromCircleAndPoints(CL, CLIntercept, p.bouts.LC);
    p.bouts.C0 = arcFromCircleAndPoints(p.bouts.C0, CUIntercept, CLIntercept);

    // recalculate display ratios
    p.ratios.CBWtoLBW = p.bouts.CBW / p.bouts.LBW;
    p.ratios.C0toLBW = p.bouts.C0.r / LBWI;
    p.ratios.C0YtoH = p.bouts.C0.y / HI;
    p.ratios.CUtoLBW = CU.r / LBWI;
    p.ratios.CLtoLBW = CL.r / LBWI;

}

export function calculateOuterCorners(p: EnricoCerutiParams): void {
    let inset = p.overhang + p.rib;

    // initalize the possibly undefined values
    let initialized = p.outerCorners.U31 != null
    p.outerCorners.U31 = p.outerCorners.U31 ?? offsetArcRadius(p.bouts.U3, -inset);
    p.outerCorners.CU1 = p.outerCorners.CU1 ?? offsetArcRadius(p.bouts.CU, -inset);
    p.outerCorners.CL1 = p.outerCorners.CL1 ?? offsetArcRadius(p.bouts.CL, -inset);
    p.outerCorners.L31 = p.outerCorners.L31 ?? offsetArcRadius(p.bouts.L3, -inset);

    // we want to increase the angle by the default corners a little bit
    if (!initialized) {
        // p.outerCorners.U31 = increaseArcAngle(p.outerCorners.U31, 5);
        p.outerCorners.CU1 = increaseArcAngle(p.outerCorners.CU1, -12);
        p.outerCorners.CL1 = increaseArcAngle(p.outerCorners.CL1, 12);
        // p.outerCorners.L31 = increaseArcAngle(p.outerCorners.L31, -5);
    }

    p.outerCorners.U31.end = p.outerCorners.U31.start + p.outerCorners.U31.diffDeg * Math.PI / 180;
    p.outerCorners.CU1.end = p.outerCorners.CU1.start - p.outerCorners.CU1.diffDeg * Math.PI / 180;
    p.outerCorners.CL1.end = p.outerCorners.CL1.start + p.outerCorners.CL1.diffDeg * Math.PI / 180;
    p.outerCorners.L31.end = p.outerCorners.L31.start - p.outerCorners.L31.diffDeg * Math.PI / 180;

    if (p.options.U31DoubleArc) {
        // initialize the data if needed
        p.outerCorners.U32 = p.outerCorners.U32 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.U31, p.outerCorners.U31.r * .8, p.outerCorners.U31.end), p.outerCorners.U31.end, p.outerCorners.U31.end * 1.1);

        // now recalculate based on last inputed values
        let radDiff = p.outerCorners.U32.diffDeg * Math.PI / 180;
        p.outerCorners.U32 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.U31, p.outerCorners.U32.r, p.outerCorners.U31.end), p.outerCorners.U31.end, p.outerCorners.U31.end + radDiff);
    }

    if (p.options.CU1DoubleArc) {
        p.outerCorners.CU2 = p.outerCorners.CU2 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.CU1, p.outerCorners.CU1.r * .8, p.outerCorners.CU1.end), p.outerCorners.CU1.end, p.outerCorners.CU1.end * 0.9);
        let radDiffCU = p.outerCorners.CU2.diffDeg * Math.PI / 180;
        p.outerCorners.CU2 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.CU1, p.outerCorners.CU2.r, p.outerCorners.CU1.end), p.outerCorners.CU1.end, p.outerCorners.CU1.end - radDiffCU);
    }

    if (p.options.CL1DoubleArc) {
        p.outerCorners.CL2 = p.outerCorners.CL2 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.CL1, p.outerCorners.CL1.r * .8, p.outerCorners.CL1.end), p.outerCorners.CL1.end, p.outerCorners.CL1.end * 1.1);
        let radDiffCL = p.outerCorners.CL2.diffDeg * Math.PI / 180;
        p.outerCorners.CL2 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.CL1, p.outerCorners.CL2.r, p.outerCorners.CL1.end), p.outerCorners.CL1.end, p.outerCorners.CL1.end + radDiffCL);
    }

    if (p.options.L31DoubleArc) {
        p.outerCorners.L32 = p.outerCorners.L32 ?? arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.L31, p.outerCorners.L31.r * .8, p.outerCorners.L31.end), p.outerCorners.L31.end, p.outerCorners.L31.end * 0.9);
        let radDiffL3 = p.outerCorners.L32.diffDeg * Math.PI / 180;
        p.outerCorners.L32 = arcFromCircle(inscribeCircleWithinCircle(p.outerCorners.L31, p.outerCorners.L32.r, p.outerCorners.L31.end), p.outerCorners.L31.end, p.outerCorners.L31.end - radDiffL3);
    }

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
    fullPath.push(p.bouts.C0, p.bouts.CL, p.bouts.CU);

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

export function defineInnerPath(p: EnricoCerutiParams): string[] {
    let arcs = defineInnerArcs(p);
    let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
    arcs = arcs.concat(mirroredArcs);

    let paths: string[] = arcs.map(arc => pathFromArc(arc));

    return paths;
}

export function defineOuterPath(p: EnricoCerutiParams, offset?: number): string[] {
    offset = offset ?? p.overhang + p.rib;

    let arcs = defineOuterArcsNoCorners(p, offset);
    let mirroredArcs = arcs.map(arc => flipArcAboutY(arc));
    arcs = arcs.concat(mirroredArcs);

    let paths: string[] = [];

    if (p.options.useViolCornerUC) {
        let U4Offset = offsetArcRadius(p.bouts.U4!, offset);
        let intersects = circleCircleIntersections(U4Offset, p.outerCorners.CU1);
        let U4Angle = angleFromCenter(U4Offset, intersects[0])
        let CU1Angle = angleFromCenter(p.outerCorners.CU1, intersects[0])
        U4Offset.end = U4Angle
        p.outerCorners.CU1.end = CU1Angle
        arcs.push(U4Offset);
        arcs.push(flipArcAboutY(U4Offset));
        arcs.push(p.outerCorners.CU1);
        arcs.push(flipArcAboutY(p.outerCorners.CU1));
    }
    else {
        arcs.push(p.outerCorners.U31);
        arcs.push(flipArcAboutY(p.outerCorners.U31));
        p.options.U31DoubleArc && arcs.push(p.outerCorners.U32);
        p.options.U31DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.U32));
        arcs.push(p.outerCorners.CU1);
        arcs.push(flipArcAboutY(p.outerCorners.CU1));
        p.options.CU1DoubleArc && arcs.push(p.outerCorners.CU2);
        p.options.CU1DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.CU2));

        // render the lines from the ends of each corners
        if (p.options.U31DoubleArc && p.options.CU1DoubleArc) {
            let U32End = pointOnCircle(p.outerCorners.U32, p.outerCorners.U32.end)
            let CU2End = pointOnCircle(p.outerCorners.CU2, p.outerCorners.CU2.end)
            paths.push(pathFromLine(U32End, CU2End));
            paths.push(pathFromLine(flipPointAboutY(U32End), flipPointAboutY(CU2End)));
        }
        else if (p.options.U31DoubleArc) {
            let U32End = pointOnCircle(p.outerCorners.U32, p.outerCorners.U32.end)
            let CU1End = pointOnCircle(p.outerCorners.CU1, p.outerCorners.CU1.end)
            paths.push(pathFromLine(U32End, CU1End));
            paths.push(pathFromLine(flipPointAboutY(U32End), flipPointAboutY(CU1End)));
        }
        else if (p.options.CU1DoubleArc) {
            let U31End = pointOnCircle(p.outerCorners.U31, p.outerCorners.U31.end)
            let CU2End = pointOnCircle(p.outerCorners.CU2, p.outerCorners.CU2.end)
            paths.push(pathFromLine(U31End, CU2End));
            paths.push(pathFromLine(flipPointAboutY(U31End), flipPointAboutY(CU2End)));
        }
        else {
            let U31End = pointOnCircle(p.outerCorners.U31, p.outerCorners.U31.end)
            let CU1End = pointOnCircle(p.outerCorners.CU1, p.outerCorners.CU1.end)
            paths.push(pathFromLine(U31End, CU1End));
            paths.push(pathFromLine(flipPointAboutY(U31End), flipPointAboutY(CU1End)));
        }
    }
    if (p.options.useViolCornerLC) {
        let L4Offset = offsetArcRadius(p.bouts.L4!, offset);
        let intersects = circleCircleIntersections(L4Offset, p.outerCorners.CL1);
        let L4Angle = angleFromCenter(L4Offset, intersects[1])
        let CL1Angle = angleFromCenter(p.outerCorners.CL1, intersects[1])
        L4Offset.end = L4Angle
        p.outerCorners.CL1.end = CL1Angle
        arcs.push(L4Offset);
        arcs.push(flipArcAboutY(L4Offset));
        arcs.push(p.outerCorners.CL1);
        arcs.push(flipArcAboutY(p.outerCorners.CL1));
    }
    else {
        arcs.push(p.outerCorners.CL1);
        arcs.push(flipArcAboutY(p.outerCorners.CL1));
        p.options.CL1DoubleArc && arcs.push(p.outerCorners.CL2);
        p.options.CL1DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.CL2));
        arcs.push(p.outerCorners.L31);
        arcs.push(flipArcAboutY(p.outerCorners.L31));
        p.options.L31DoubleArc && arcs.push(p.outerCorners.L32);
        p.options.L31DoubleArc && arcs.push(flipArcAboutY(p.outerCorners.L32));

        if (p.options.CL1DoubleArc && p.options.L31DoubleArc) {
            let CL2End = pointOnCircle(p.outerCorners.CL2, p.outerCorners.CL2.end)
            let L32End = pointOnCircle(p.outerCorners.L32, p.outerCorners.L32.end)
            paths.push(pathFromLine(CL2End, L32End));
            paths.push(pathFromLine(flipPointAboutY(CL2End), flipPointAboutY(L32End)));
        }
        else if (p.options.CL1DoubleArc) {
            let CL2End = pointOnCircle(p.outerCorners.CL2, p.outerCorners.CL2.end)
            let L31End = pointOnCircle(p.outerCorners.L31, p.outerCorners.L31.end)
            paths.push(pathFromLine(CL2End, L31End));
            paths.push(pathFromLine(flipPointAboutY(CL2End), flipPointAboutY(L31End)));
        }
        else if (p.options.L31DoubleArc) {
            let CL1End = pointOnCircle(p.outerCorners.CL1, p.outerCorners.CL1.end)
            let L32End = pointOnCircle(p.outerCorners.L32, p.outerCorners.L32.end)
            paths.push(pathFromLine(CL1End, L32End));
            paths.push(pathFromLine(flipPointAboutY(CL1End), flipPointAboutY(L32End)));
        }
        else {
            let CL1End = pointOnCircle(p.outerCorners.CL1, p.outerCorners.CL1.end)
            let L31End = pointOnCircle(p.outerCorners.L31, p.outerCorners.L31.end)
            paths.push(pathFromLine(CL1End, L31End));
            paths.push(pathFromLine(flipPointAboutY(CL1End), flipPointAboutY(L31End)));
        }
    }

    paths.push(...arcs.map(arc => pathFromArc(arc)));

    return paths;
}