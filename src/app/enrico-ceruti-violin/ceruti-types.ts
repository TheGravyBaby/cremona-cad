import { Arc, Circle, Pt, Rectangle, ReferenceImage } from "../models/types";

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
  referenceImage?: ReferenceImage;
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
    UCXtoUBW: 10/11,
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

const CerutiParams: EnricoCerutiParams = {
  "height": 336,
  "width": 200,
  "overhang": 3,
  "rib": 1,
  "ratios": {
    "HtoW": 1.68,
    "UBtoLB": 0.745,
    "U0toH": 0.31097560975609756,
    "U1toUBW": 0.2907801418439716,
    "U2toUBW": 0.46099290780141844,
    "U3toLBW": 0.125,
    "CBWtoLBW": 0.5,
    "C0YtoH": 0.5487804878048781,
    "C0toLBW": 0.34375,
    "CUtoLBW": 0.052083333333333336,
    "CLtoLBW": 0.10416666666666667,
    "LBtoH": 0.5714285714285714,
    "L0toH": 0.5,
    "L1toLBW": 0.3333333333333333,
    "L2toLBW": 0.59375,
    "L3toLBW": 0.13020833333333334,
    "UCYtoH": 0.6666666666666666,
    "UCXtoUBW": 0.9166666666666666,
    "LCYtoH": 0.4,
    "LCXtoLBW": 0.875
  },
  "bouts": {
    "UBW": 149,
    "U0": {
      "x": 0,
      "y": 230,
      "r": 102,
      "start": 1.5707963267948966,
      "end": 1.0660258656771382
    },
    "U1": {
      "x": 29.5,
      "y": 283.3924151916731,
      "r": 41,
      "start": 1.0660258934983402,
      "end": 0.643106105043117
    },
    "U2": {
      "x": 10.294313733935518,
      "y": 269,
      "r": 65,
      "start": 0.6431061251871714,
      "end": -0.42699431479044336
    },
    "U3": {
      "x": 91.30341453479278,
      "y": 232.14181790380124,
      "r": 24,
      "start": 2.7145982618543343,
      "end": -2.599037666215535
    },
    "CBW": 100,
    "CU": {
      "x": 65.51615798818102,
      "y": 211.22903187452746,
      "r": 10,
      "start": 2.550027026827887,
      "end": 1.0199785824686358
    },
    "C0": {
      "x": 112,
      "y": 180,
      "r": 66,
      "start": 2.5500270268278884,
      "end": -2.5214301384136877
    },
    "CL": {
      "x": 74.5659351313468,
      "y": 153.26629865863194,
      "r": 20,
      "start": -2.5214301384136877,
      "end": -1.121642722952846
    },
    "LBW": 200,
    "L3": {
      "x": 106.1056691649556,
      "y": 125.11992660332129,
      "r": 25,
      "start": -2.63765529602085,
      "end": 2.7243918584702493
    },
    "L2": {
      "x": -15.6149759728548,
      "y": 58,
      "r": 114,
      "start": 0.31011159985061604,
      "end": 0.5039373575689428
    },
    "L1": {
      "x": 32,
      "y": 73.25824574138392,
      "r": 64,
      "start": -1.2450668395002666,
      "end": 0.3101115740410476
    },
    "L0": {
      "x": 0,
      "y": 168,
      "r": 164,
      "start": 4.71238898038469,
      "end": -1.2450668395002664
    },
    "UC": {
      "x": 70.75,
      "y": 219.75
    },
    "LC": {
      "x": 83.25,
      "y": 135.25
    }
  },
  "outerCorners": {
    "U31": null,
    "U31Cutoff": 0,
    "U31Orbit": 0,
    "CU1": null,
    "CU1Cutoff": 0,
    "CU1Orbit": 0,
    "CL1": null,
    "CL1Cutoff": 0,
    "CL1Orbit": 0,
    "L31": null,
    "L31Cutoff": 0,
    "L31Orbit": 0
  },
  "blocks": {
    U: null,
    CU: null,
    CL: null,
    L: null
  },
  "options": {
    "useViolNeck": false,
    "useViolCornerUC": false,
    "useViolCornerLC": false
  }
}

// =====================================================
// Default template
// =====================================================

export const CERUTI_TEMPLATES: EnricoCerutiTemplate[] = [
  {
    key: 'ceruti-new',
    label: 'New Fiddle',
    recipeName: 'Enrico Ceruti Violin',
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
    key: 'ceruti-drawing',
    label: 'Ceruti Drawing',
    recipeName: 'Enrico Ceruti Violin',
    fileName: 'Ceruti Original',
    version: '0.1',
    description: 'From the Ceruti workshop drawing C. 1820',
    params : CerutiParams,
    paths: [],
    referenceImage: {
      "href": "/CerutiDrawing.png",
      "xlink:href": "/CerutiDrawing.png",
      "x": -121.1624002456665,
      "y": 1.8812885284423828,
      "width": 237,
      "height": 336,
      "rotationDeg": 0.4
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