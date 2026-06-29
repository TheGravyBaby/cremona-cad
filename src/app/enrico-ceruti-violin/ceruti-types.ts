import { Arc, Pt, Rectangle, ReferenceImage } from "../models/types";

/** Resolved palette returned by CerutiViolin's `colors` getter, threaded into every panel and render fn. */
export interface CerutiColors {
  upperBout: string;
  upperBoutOff: string;
  upperBoutOff2: string;
  centerBoutUp: string;
  centerBoutUpOff: string;
  centerBoutUpOff2: string;
  centerBout: string;
  centerBoutOff: string;
  centerBoutOff2: string;
  centerBoutLow: string;
  centerBoutLowOff: string;
  centerBoutLowOff2: string;
  lowerBout: string;
  lowerBoutOff: string;
  lowerBoutOff2: string;
  violNeck: string;
  innerTrace: string;
  outerTrace: string;
  mouldTrace: string;
  fluting: string;
  archTop: string;
  archBack: string;
}

/** Ephemeral, non-persisted view toggles shared across panels and their render functions. */
export interface CerutiViewFlags {
  showModuleArcs: boolean;
  showModuleCircles: boolean;
  showAllArcs: boolean;
  showAllCircles: boolean;
  showModuleGuides: boolean;
  renderOuterPath: boolean;
  showBlocks: boolean;
  showInnerPath: boolean;
  simpleClampBox: boolean;
}

export const DEFAULT_CERUTI_VIEW_FLAGS: CerutiViewFlags = {
  showModuleArcs: true,
  showModuleCircles: false,
  showAllArcs: false,
  showAllCircles: false,
  showModuleGuides: false,
  renderOuterPath: true,
  showBlocks: true,
  showInnerPath: false,
  simpleClampBox: false,
};

/**
 * Increment this when the shape of a saved recipe file changes in a
 * backward-incompatible (or additive) way. Old files will still load
 * but the user will see a warning in the message center.
 */
export const RECIPE_SCHEMA_VERSION = '1';

export interface ArchCatenary {
  type: 'catenary';
  archHeight: number;
}

export interface ArchCycloid {
  type: 'cycloid';
  archHeight: number;
  d: number; // trochoid factor: 0 = raised cosine, 1 = standard cycloid (valid range 0–1)
}

export interface ArchSplinePoint {
  t: number; // normalized half-span position: 0 = plate edge, 1 = peak
  z: number; // arch height at this point (mm)
}

export interface ArchSpline {
  type: 'spline';
  archHeight: number;
  points: ArchSplinePoint[]; // interior points only, t strictly in (0, 1), kept sorted by t
}

export type ArchCurve = ArchCatenary | ArchCycloid | ArchSpline;

export interface ArchPlate {
  arch: ArchCurve;
  thickness: number;
}

export interface ArchingParams {
  surfaceMethod: 'proportional';
  ribHeight: number;
  top: ArchPlate;
  bottom: ArchPlate;
}

export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bitDiameter: number;
  clampChannelWidth: number;
  purflingOffset: number | null;
  purflingChannelDepth: number | null;
  flutingWidth: number | null;
  button: Rectangle | null,
  bouts: {
    UBW: number | null;
    U0: Arc | null;
    U1: Arc | null;
    U2: Arc | null;
    U3: Arc | null;
    U31: Arc | null;
    U4?: Arc | null;
    CBW: number | null;
    C2: Arc | null;
    C21?: Arc | null;
    C0: Arc | null;
    C1: Arc | null;
    C11: Arc | null;
    LBW: number | null;
    L4?: Arc | null;
    L3: Arc | null;
    L31: Arc | null;
    L2: Arc | null;
    L1: Arc | null;
    L0: Arc | null;
    UCr: Pt | null;
    LCr: Pt | null;
  },
  outerCorners: {
    U3 : Arc | null,
    U31: Arc | null,
    C2: Arc | null,
    C21: Arc | null,
    C1: Arc | null,
    C11: Arc | null,
    L3: Arc | null,
    L31: Arc | null
  },
  blocks: {
    U: Rectangle | null;
    CU: Rectangle | null;
    CUPad: number | null;
    CL: Rectangle | null;
    CLPad: number | null;
    L: Rectangle | null;
  },
  viol: {
    width: number | null;
    V0: Arc | null;
  },
  options: {
    useViolNeck: boolean,
    useViolCornerUC: boolean,
    useViolCornerLC: boolean,
    useKellyC0: boolean // four circles based theory of clean intersection along center bout,
    U31DoubleArc: boolean;
    C21DoubleArc: boolean;
    C11DoubleArc: boolean;
    L31DoubleArc: boolean;
    ucCornerSharpness?: number;
    lcCornerSharpness?: number;
    outerCornerSharpness?: number;
  },
  ratios: {
    HtoW: number;
    UBtoLB: number;
    U0toUBW: number;
    U1toUBW: number;
    U2toUBW: number;
    U3toLBW: number;
    CBWtoLBW: number;
    C0toLBW: number;
    C0YtoH: number;
    C2toLBW: number;
    C1toLBW: number;
    LBtoH: number;
    L0toLBW: number;
    L1toLBW: number;
    L2toLBW: number;
    L3toLBW: number;
    UCYtoH: number;
    LCYtoH: number;
  };
  arching?: ArchingParams;
}

export interface EnricoCerutiTemplate {
  key: string;
  label: string;
  recipeName: string;
  fileName: string;
  version: string;
  description?: string;
  params: EnricoCerutiParams;
  paths: any[];
  referenceImage?: ReferenceImage;
}

export const DefaultParams: EnricoCerutiParams = {
  height: 350,
  width: 200,
  overhang: 3,
  rib: 1,
  bitDiameter: 6.35,
  clampChannelWidth: 5,
  purflingOffset: null,
  purflingChannelDepth: null,
  flutingWidth: null,
  ratios: {
    HtoW: 7 / 4,

    UBtoLB: 4 / 5,
    U0toUBW: 5 / 8,
    U1toUBW: 1 / 3,
    U2toUBW: 1 / 2,
    U3toLBW: 1 / 8,

    CBWtoLBW: 1 / 2,
    C0YtoH: 9 / 16,
    C0toLBW: 4/9,
    C2toLBW: 1 / 12,
    C1toLBW: 1 / 8,

    LBtoH: 4 / 7,
    L0toLBW: 7 / 8,
    L1toLBW: 1 / 3,
    L2toLBW: 1 / 2,
    L3toLBW: 1 / 8,

    UCYtoH: 2 / 3,
    LCYtoH: 6 / 15,
  },
  bouts: {
    UBW: undefined,
    U0: undefined,
    U1: undefined,
    U2: undefined,
    U3: undefined,
    U31: undefined,
    U4: undefined,
    CBW: undefined,
    C2: undefined,
    C21: undefined,
    C0: undefined,
    C1: undefined,
    C11: undefined,
    LBW: undefined,
    L4: undefined,
    L3: undefined,
    L31: undefined,
    L2: undefined,
    L1: undefined,
    L0: undefined,
    UCr: undefined,
    LCr: undefined,
  },
  viol: {
    width: null,
    V0: null
  },
  button: null,
  outerCorners: {
    U3: null,
    U31: null,
    C2: null,
    C21: null,
    C1: null,
    C11: null,
    L3: null,
    L31: null
  },
  blocks: {
    U: undefined,
    CU: undefined,
    CUPad: undefined,
    CL: undefined,
    CLPad: undefined,
    L: undefined,
  },
  options: {
    useViolNeck: false,
    useViolCornerUC: false,
    useViolCornerLC: false,
    useKellyC0: false, // four circles based theory of clean intersection along center bout
    U31DoubleArc: false,
    C21DoubleArc: false,
    C11DoubleArc: false,
    L31DoubleArc: false,
    ucCornerSharpness: 0,
    lcCornerSharpness: 0,
    outerCornerSharpness: 0.1
  }
}
