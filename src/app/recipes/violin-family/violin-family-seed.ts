import { NeckParams, StringSetupParams, ViolinFamilyParams } from './violin-family-types';

// What the Violin Family recipe is drawn from before the user types anything: the ratios one
// instrument is drawn from, the trade's standards by size class, and the default file they seed.

// what a drafted outline reads as, named <thing>to<datum>. The radius ratios are taken against the
// bout's inner width (the width less the inset both sides), as the Ceruti recipe always measured
// them, so the two compare. Stamped on the file for study; nothing reads them back
export interface ViolinFamilyRatios {
  HtoW: number;
  UBtoLB: number;
  U0toUBW: number;
  U1toUBW: number;
  LBtoH: number;
  L0toLBW: number;
  L1toLBW: number;
  U2toUBW: number;
  U3toLBW: number;
  U31toLBW: number;
  L2toLBW: number;
  L3toLBW: number;
  L31toLBW: number;
  UCYtoH: number;
  LCYtoH: number;
  CBWtoLBW: number;
  C0toLBW: number;
  C0YtoH: number;
  C2toLBW: number;
  C21toLBW: number;
  C1toLBW: number;
  C11toLBW: number;
  BWtoLBW: number;
  BHtoBW: number;
}

// the f-holes' proportions, named the same way. The lower eye is drawn from the body's width and
// everything after it from an eye: the placement guides (the lower eye in from the lower corner;
// the upper eye where a circle about the lower eye, through the waist, meets one about the waist),
// the rises, the stem's seat in the frame the eyes and rises carve out, and each cut's length
// against its eye. The contours describe how smooth the curve is: the stem arc is the largest,
// set against the eye span (the hole's own length), and every shoulder, arm and wing is a
// fraction of it. The four stem arcs share one radius
export interface FholeRatios {
  LEyetoW: number;
  UEyetoLEye: number;
  LEyeXtoLCX: number;
  LEyeYtoLCY: number;
  UEyeGuidetoWaist: number;
  EyeSpantoWaist: number;
  URisetoUEye: number;
  LRisetoLEye: number;
  StemXtoFrame: number;
  StemYtoFrame: number;
  StemWtoUEye: number;
  UCuttoUEye: number;
  LCuttoLEye: number;
  StoEyeSpan: number;
  U1toS: number;
  U2toS: number;
  U3toS: number;
  L1toS: number;
  L2toS: number;
  L3toS: number;
}

// the one instrument the app drafts from nothing: a height, and the ratios every outline value is
// drawn from it by. The base stage has no absolute number anywhere else
export const SEED_RATIOS: ViolinFamilyRatios & { height: number } = {
  height: 356,
  HtoW: 7 / 4,
  UBtoLB: 4 / 5,
  U0toUBW: 8 / 9,
  U1toUBW: 2 / 5,
  LBtoH: 4 / 7,
  L0toLBW: 2 / 1,
  L1toLBW: 1 / 3,
  U2toUBW: 3 / 5,
  U3toLBW: 1 / 8,
  U31toLBW: 1 / 16,
  L2toLBW: 1 / 2,
  L3toLBW: 1 / 8,
  L31toLBW: 1 / 16,
  UCYtoH: 23 / 36,
  LCYtoH: 6 / 15,
  CBWtoLBW: 1 / 2,
  C0toLBW: 1 / 2,
  C0YtoH: 9 / 16,
  C2toLBW: 1 / 12,
  C21toLBW: 1 / 16,
  C1toLBW: 1 / 8,
  C11toLBW: 1 / 16,
  BWtoLBW: 1 / 10,
  BHtoBW: 7 / 10,
};

// the f-holes drafted from nothing but the outline: keyed off the lower eye, itself a fraction of
// the width. One drawing rather than a corpus mean: a Stradivari-pattern hole drawn by hand on the
// seed outline (2026-10), with the Betts and the Ward as the check. The angles ride with the
// fractions because a radius says nothing without where its arc takes off and hands over: how far
// the shoulders sweep from their eyes, the angle each wing meets its cut at, where each cut leaves its eye and the
// slope it leaves on, and the stem's lean, all in degrees
export const FHOLE_SEED_RATIOS: FholeRatios & {
  U1Sweep: number; U3Angle: number; UCutAt: number; UCutSlope: number;
  L1Sweep: number; L3Angle: number; LCutAt: number; LCutSlope: number;
  stemAngle: number;
} = {
  LEyetoW: 3 / 128,
  UEyetoLEye: 5 / 8,

  LEyeXtoLCX: 2 / 3, // these numbers do not really capture accurately how eyes were placed
  LEyeYtoLCY: 14 / 15, // they do work cosmetically though
  UEyeGuidetoWaist: 4 / 7,

  // a very simple scaler that sets the eye gap
  // what we really need is a better theory on eye placement
  // rather than a BS number I pulled out of a hat
  // but for now this produces good looking results
  // fake it till u make it baybee
  EyeSpantoWaist: .95, 
  URisetoUEye: 5 / 3,
  LRisetoLEye: 11 / 8,
  StemXtoFrame: 5 / 12,
  StemYtoFrame: 1 / 2, // this may conflic with standard stop lengths but come on ain't that beautiful?
  StemWtoUEye: 2,
  UCuttoUEye: 2,
  LCuttoLEye: 8 / 5,
  StoEyeSpan: 5 / 8,
  U1toS: 1 / 5,
  U2toS: 3 / 10,
  U3toS: 2 / 5,
  L1toS: 1 / 4,
  L2toS: 3 / 8,
  L3toS: 1 / 2,
  U1Sweep: 120,
  U3Angle: 85,
  UCutAt: 70,
  UCutSlope: 45,
  L1Sweep: 105,
  L3Angle: 100,
  LCutAt: 255,
  LCutSlope: -130,
  stemAngle: 92,
};

// The trade's figures: what a shop holds fixed for an instrument's size because the hand and the
// string set it, not the drawing. They step by size class rather than scaling with the body, so
// each class is a row, by body height, and a seed takes its row's figures as they are. Millimetres
// and degrees. The neck stop is the trade's, plate edge to nut, which the neck seed turns into its
// length from the mortise floor; the string setup is the modern setup, the ribs are the caliper
// readings at the lower bout and the upper block, the edge is the plate's thickness at the edge
// and the blocks are the mould's. The rows are the 4/4 violin, the 16½" viola, the 4/4 cello and
// the 3/4 bass of the Woodsound setup chart, with the violin's bench figures from
// makingtheviolin.com; the thicknesses and widths the chart gives are kept where the seed outline
// had rounded them
export interface FamilyStandards {
  family: 'violin' | 'viola' | 'cello' | 'bass';
  // body heights under this fall in the class
  below: number;
  overhang: number;
  rib: number;
  ribHeightLower: number;
  ribHeightUpper: number;
  edgeThickness: number;
  neckStop: number;
  neck: Omit<NeckParams, 'length'>;
  strings: StringSetupParams;
  // the corner blocks' pad, height and width, and the neck and end blocks' height
  blocks: { pad: number; height: number; width: number; end: number };
}

export const FAMILY_STANDARDS: readonly FamilyStandards[] = [
  {
    family: 'violin', below: 400, overhang: 2.5, rib: 1, ribHeightLower: 32, ribHeightUpper: 30, edgeThickness: 3.5,
    neckStop: 130,
    neck: { angle: 7.5, upperThickness: 13, lowerThickness: 15, topWidth: 24, rootWidth: 33, heelRadius: 10, mortiseDepth: 6.5, overstand: 6.5, nutHeight: 6, nutWidth: 24 },
    strings: { bodyStop: 195, bridgeHeight: 33, nutThickness: 7.5, fingerboardLength: 270, fingerboardThickness: 5, fingerboardRadius: 42 },
    blocks: { pad: 3, height: 20, width: 12, end: 20 },
  },
  {
    family: 'viola', below: 500, overhang: 3, rib: 1.2, ribHeightLower: 40, ribHeightUpper: 38, edgeThickness: 4,
    neckStop: 150,
    neck: { angle: 7.5, upperThickness: 14, lowerThickness: 15, topWidth: 25, rootWidth: 36, heelRadius: 11, mortiseDepth: 7, overstand: 9, nutHeight: 6.5, nutWidth: 25 },
    strings: { bodyStop: 225, bridgeHeight: 38, nutThickness: 8, fingerboardLength: 305, fingerboardThickness: 5.5, fingerboardRadius: 38 },
    blocks: { pad: 4, height: 30, width: 18, end: 25 },
  },
  {
    family: 'cello', below: 800, overhang: 4, rib: 1.5, ribHeightLower: 120, ribHeightUpper: 116, edgeThickness: 6,
    neckStop: 280,
    neck: { angle: 7.5, upperThickness: 17, lowerThickness: 19, topWidth: 31, rootWidth: 46, heelRadius: 20, mortiseDepth: 10, overstand: 19, nutHeight: 9, nutWidth: 31 },
    strings: { bodyStop: 400, bridgeHeight: 90, nutThickness: 11, fingerboardLength: 580, fingerboardThickness: 7.5, fingerboardRadius: 62 },
    blocks: { pad: 5, height: 40, width: 24, end: 45 },
  },
  {
    family: 'bass', below: Infinity, overhang: 6, rib: 2.5, ribHeightLower: 185, ribHeightUpper: 179, edgeThickness: 9,
    neckStop: 425,
    neck: { angle: 7.5, upperThickness: 22, lowerThickness: 30, topWidth: 42, rootWidth: 60, heelRadius: 30, mortiseDepth: 15, overstand: 25, nutHeight: 10, nutWidth: 42 },
    strings: { bodyStop: 610, bridgeHeight: 165, nutThickness: 15, fingerboardLength: 850, fingerboardThickness: 10, fingerboardRadius: 95 },
    blocks: { pad: 8, height: 50, width: 30, end: 70 },
  },
];

export function familyStandards(bodyHeight: number): FamilyStandards {
  return FAMILY_STANDARDS.find(s => bodyHeight < s.below)!;
}

export const DEFAULT_VIOLIN_FAMILY_PARAMS: ViolinFamilyParams = {
  body: {
    height: SEED_RATIOS.height,
    width: Math.round(SEED_RATIOS.height / SEED_RATIOS.HtoW),
    overhang: familyStandards(SEED_RATIOS.height).overhang,
    rib: familyStandards(SEED_RATIOS.height).rib,
  },
};
