import { Arc, Circle, Pt, Rectangle } from "../models/types";

export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bouts: {
    UBW: number | null;
    U0: Arc | null;
    U1: Arc | null;
    U2: Arc | null;
    U3: Arc | null;
    CBW: number | null;
    CU: Arc | null;
    C0: Arc | null;
    CL: Arc | null;
    LBW: number | null;
    L3: Arc | null;
    L2: Arc | null;
    L1: Arc | null;
    L0: Arc | null;
    UC: Pt | null;
    LC: Pt | null;
  },
  outerCorners: {
    U31: Circle | null;
    U31Cutoff: number | null;
    U31Orbit: number | null
    CU1: Circle | null;
    CU1Cutoff: number | null;
    CU1Orbit: number | null;
    CL1: Circle | null;
    CL1Cutoff: number | null;
    CL1Orbit: number | null;
    L31: Circle | null;
    L31Cutoff: number | null;
    L31Orbit: number | null;
  },
  blocks: {
    U: Rectangle | null;
    CU: Rectangle | null;
    CL: Rectangle | null;
    L: Rectangle | null;
  },
  viol?: {
    height: number;
    V0: Circle | null;
  },
  options: {
    useViolNeck: boolean,
    useViolCornerUC: boolean,
    useViolCornerLC: boolean,
  },
  ratios: {
    HtoW: number;
    UBtoLB: number;
    U0toH: number;
    U1toUBW: number;
    U2toUBW: number;
    U3toLBW: number;
    CBWtoLBW: number;
    C0toLBW: number;
    C0YtoH: number;
    CUtoLBW: number;
    CLtoLBW: number;
    LBtoH: number;
    L0toH: number;
    L1toLBW: number;
    L2toLBW: number;
    L3toLBW: number;
    UCYtoH: number;
    UCXtoUBW: number;
    LCYtoH: number;
    LCXtoLBW: number;
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
  referenceImage?: any;
}

const DefaultParams: EnricoCerutiParams = {
  height: 350,
  width: 200,
  overhang: 3,
  rib: 1,
  ratios: {
    HtoW: 7 / 4,
    
    UBtoLB: 4 / 5,
    U0toH: 1 / 3,
    U1toUBW: 1 / 3,
    U2toUBW: 1 / 2,
    U3toLBW: 1 / 8,
    
    CBWtoLBW: 1 / 2,
    C0YtoH: 9 / 16,
    C0toLBW: 3/8,
    CUtoLBW: 1 / 12,
    CLtoLBW: 1 / 8,
    
    LBtoH: 4 / 7,
    L0toH: 1 / 2,
    L1toLBW: 1 / 3,
    L2toLBW: 1 / 2,
    L3toLBW: 1 / 8,
    
    UCYtoH: 2 / 3,
    UCXtoUBW: 11/12,
    LCYtoH: 6 / 15,
    LCXtoLBW: 7 / 8,
  },
  bouts: {
    UBW: undefined,
    U0: undefined,
    U1: undefined,
    U2: undefined,
    U3: undefined,
    CBW: undefined,
    CU: undefined,
    C0: undefined,
    CL: undefined,
    LBW: undefined,
    L3: undefined,
    L2: undefined,
    L1: undefined,
    L0: undefined,
    UC: undefined,
    LC: undefined,
  },
  outerCorners: {
    U31: undefined,
    U31Cutoff: 0,
    U31Orbit: 0,
    CU1: undefined,
    CU1Cutoff: 0,
    CU1Orbit: 0,
    CL1: undefined,
    CL1Cutoff: 0,
    CL1Orbit: 0,
    L31: undefined,
    L31Cutoff: 0,
    L31Orbit: 0
  },
  blocks: {
    U: undefined,
    CU: undefined,
    CL: undefined,
    L: undefined
  },
  options: {
    useViolNeck: false,
    useViolCornerUC: false,
    useViolCornerLC: false,
  }
}

// =====================================================
// Default template
// =====================================================

export const CERUTI_TEMPLATES: EnricoCerutiTemplate[] = [
  {
    key: 'ceruti-new',
    label: 'New Fiddle',
    recipeName: 'enrico-ceruti-violin',
    fileName: 'NewFiddle',
    description: 'A blank template to start from...',
    version: '0.1',
    params: DefaultParams,
    paths: [],
    referenceImage: {
      "href": "",
      "xlink:href": "",
      "x": 0,
      "y": 0,
      "width": 0,
      "height": 0,
    },
  },
  {
    key: 'strad-goetz',
    label: 'Strad Goetz',
    recipeName: 'enrico-ceruti-violin',
    fileName: 'Strad Goetz',
    version: '0.1',
    description: 'C. 1695, Long Strad',
    referenceImage: {
      "href": "/StradGoetz.jpg",
      "xlink:href": "/StradGoetz.jpg",
      "x": -158.7095239572227,
      "y": -196.6448444843292,
      "width": 319,
      "height": 779,
    },
    params: DefaultParams,
    paths: [],
  },
];