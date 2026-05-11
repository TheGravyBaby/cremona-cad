import { solveInscribedCircleAlongAxis, circleCircleIntersections, angleFromCenter, interceptCirclesAndPoint } from "../helpers/draftMath";
import { Arc, arcFromCircle, arcFromCircleAndPoints } from "../models/types";
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
      let U1R = Math.round(UBWI * p.ratios.U1toUBW  * 10) / 10;
      p.bouts.U1 = new Arc(0, UBWI - U1R, U1R);

      let L0R = Math.round(LBWI * p.ratios.L0toLBW * 10) / 10;
      p.bouts.L0 = new Arc(0, inset + L0R, L0R);
      let L1R = Math.round(LBWI * p.ratios.L1toLBW  * 10) / 10;
      p.bouts.L1 = new Arc(0, L1R, L1R);
    }

    let UBWI = p.bouts.UBW - 2 * inset;
    let LBWI = p.bouts.LBW - 2 * inset;
    let HI = p.height - 2 * inset;

    // recalcuate display ratios
    p.ratios.UBtoLB = p.bouts.UBW / p.bouts.LBW;
    p.ratios.U0toUBW = p.bouts.U0.r / UBWI;
    p.ratios.U1toUBW =  p.bouts.U1.r / UBWI;
    
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
    if (p.bouts.U2?.r ==p.bouts.U1.r && p.bouts.U2?.y == p.bouts.U1.y && p.bouts.U2?.x == p.bouts.U1.x) {
        // this is a special case where the user has set U2 to be the same as U1, 
        // which causes the math below to break since we won't have two distinct circles to intersect
        U1U2Match = true;
         p.bouts.U1.end = 0
    }
    else if (U2Y == p.bouts.U1.y){
        p.bouts.U2 = new Arc(p.bouts.UBW / 2 - U2R - inset, U2Y, U2R);
    }
    else {
        let c = p.bouts.U2.r -p.bouts.U1.r;
        let b = p.bouts.U2.y - p.bouts.U1.y
        let U2xPlus = p.bouts.U1.x + Math.sqrt(c*c - b*b) 
        let U2xMinus = p.bouts.U1.x - Math.sqrt(c*c - b*b)

        p.bouts.U2.x = Math.min(U2xPlus, U2xMinus);
    }
    
    
    let L2R = p.bouts.L2?.r ?? Math.round(LBWI * p.ratios.L2toLBW);
    let L2Y = p.bouts.L2?.y ?? p.bouts.L1.y;
    let L2U1Match = false
    if (p.bouts.L2?.r ==p.bouts.L1.r && p.bouts.L2?.y == p.bouts.L1.y && p.bouts.L2?.x == p.bouts.L1.x) {
        // this is a special case where the user has set L2 to be the same as L1,
        // which causes the math below to break since we won't have two distinct circles to intersect
        L2U1Match = true;
        p.bouts.L1.end = 0
    }
    if (L2Y == p.bouts.L1.y){       
        p.bouts.L2 = new Arc(p.bouts.LBW / 2 - L2R - inset, L2Y, L2R);
    }
    else {
        let c = p.bouts.L2.r -p.bouts.L1.r;
        let b = p.bouts.L2.y - p.bouts.L1.y
        let L2xPlus = p.bouts.L1.x + Math.sqrt(c*c - b*b) 
        let L2xMinus = p.bouts.L1.x - Math.sqrt(c*c - b*b)

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

    // recalculate display ratios
    p.ratios.U2toUBW = p.bouts.U2.r / UBWI;
    p.ratios.U3toLBW = p.bouts.U3.r / LBWI;
    p.ratios.L2toLBW = p.bouts.L2.r / LBWI;
    p.ratios.L3toLBW = p.bouts.L3.r / LBWI;
}

export function calculateCenterBout(p: EnricoCerutiParams): void {
    let inset = p.overhang + p.rib;
    let UBWI = p.bouts.UBW - 2 * inset;
    let LBWI = p.bouts.LBW - 2 * inset;
    let HI = p.height - 2 * inset;

    p.bouts.CBW = p.bouts.CBW ?? Math.round(p.bouts.LBW * p.ratios.CBWtoLBW);

    let c0Radius = p.bouts.C0?.r ?? Math.round(LBWI * p.ratios.C0toLBW);
    let boutMid = ((p.height - p.bouts.UBW) - p.bouts.LBW)/2 + p.bouts.LBW
    let c0Y = p.bouts.C0?.y ?? boutMid;
    p.bouts.C0 = new Arc(p.bouts.CBW / 2 - inset + c0Radius, c0Y, c0Radius);

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