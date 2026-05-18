import { Arc, Pt, Rectangle, ReferenceImage } from "../models/types";

export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bitDiameter: number;
  clampChannelWidth: number;
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
    L31DoubleArc: false
  }
}
