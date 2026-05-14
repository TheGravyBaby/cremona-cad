import { Arc, Circle, Pt, Rectangle, ReferenceImage } from "../models/types";

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
    U4?: Arc | null;
    CBW: number | null;
    CU: Arc | null;
    C0: Arc | null;
    CL: Arc | null;
    LBW: number | null;
    L4?: Arc | null;
    L3: Arc | null;
    L2: Arc | null;
    L1: Arc | null;
    L0: Arc | null;
    UCr: Pt | null;
    LCr: Pt | null;
  },
  outerCorners: {
    U31 : Arc | null,
    U32: Arc | null,
    CU1: Arc | null,
    CU2: Arc | null,
    CL1: Arc | null,
    CL2: Arc | null,
    L31: Arc | null,
    L32: Arc | null
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
    CU1DoubleArc: boolean;
    CL1DoubleArc: boolean;
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
    CUtoLBW: number;
    CLtoLBW: number;
    LBtoH: number;
    L0toLBW: number;
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
    C0toLBW: 3 / 8,
    CUtoLBW: 1 / 12,
    CLtoLBW: 1 / 8,

    LBtoH: 4 / 7,
    L0toLBW: 7 / 8,
    L1toLBW: 1 / 3,
    L2toLBW: 1 / 2,
    L3toLBW: 1 / 8,

    UCYtoH: 2 / 3,
    UCXtoUBW: 8 / 9,
    LCYtoH: 6 / 15,
    LCXtoLBW: 8 / 9,
  },
  bouts: {
    UBW: undefined,
    U0: undefined,
    U1: undefined,
    U2: undefined,
    U3: undefined,
    U4: undefined,
    CBW: undefined,
    CU: undefined,
    C0: undefined,
    CL: undefined,
    LBW: undefined,
    L4: undefined,
    L3: undefined,
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
    U31: null,
    U32: null,
    CU1: null,
    CU2: null,
    CL1: null,
    CL2: null,
    L31: null,
    L32: null
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
    CU1DoubleArc: false,
    CL1DoubleArc: false,
    L31DoubleArc: false
  }
}

const CerutiParams: EnricoCerutiParams = {
  ...DefaultParams,
  "height": 336,
  "width": 200,
  "overhang": 3,
  "rib": 1,
  "ratios": {
    "HtoW": 1.68,
    "UBtoLB": 0.745,
    "U0toUBW": 0.31097560975609756,
    "U1toUBW": 0.2907801418439716,
    "U2toUBW": 0.46099290780141844,
    "U3toLBW": 0.125,
    "CBWtoLBW": 0.5,
    "C0YtoH": 0.5487804878048781,
    "C0toLBW": 0.34375,
    "CUtoLBW": 0.052083333333333336,
    "CLtoLBW": 0.10416666666666667,
    "LBtoH": 0.5714285714285714,
    "L0toLBW": 0.5,
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
      "end": 1.0660258656771382,
      "diff": null,
      "diffDeg": null
    },
    "U1": {
      "x": 29.5,
      "y": 283.3924151916731,
      "r": 41,
      "start": 1.0660258934983402,
      "end": 0.643106105043117,
      "diff": null,
      "diffDeg": null
    },
    "U2": {
      "x": 10.294313733935518,
      "y": 269,
      "r": 65,
      "start": 0.6431061251871714,
      "end": -0.42699431479044336,
      "diff": null,
      "diffDeg": null
    },
    "U3": {
      "x": 91.30341453479278,
      "y": 232.14181790380124,
      "r": 24,
      "start": 2.7145982618543343,
      "end": -2.599037666215535,
      "diff": null,
      "diffDeg": null
    },
    "CBW": 100,
    "CU": {
      "x": 65.51615798818102,
      "y": 211.22903187452746,
      "r": 10,
      "start": 2.550027026827887,
      "end": 1.0199785824686358,
      "diff": null,
      "diffDeg": null
    },
    "C0": {
      "x": 112,
      "y": 180,
      "r": 66,
      "start": 2.5500270268278884,
      "end": -2.5214301384136877,
      "diff": null,
      "diffDeg": null
    },
    "CL": {
      "x": 74.5659351313468,
      "y": 153.26629865863194,
      "r": 20,
      "start": -2.5214301384136877,
      "end": -1.121642722952846,
      "diff": null,
      "diffDeg": null
    },
    "LBW": 200,
    "L3": {
      "x": 106.1056691649556,
      "y": 125.11992660332129,
      "r": 25,
      "start": -2.63765529602085,
      "end": 2.7243918584702493,
      "diff": null,
      "diffDeg": null
    },
    "L2": {
      "x": -15.6149759728548,
      "y": 58,
      "r": 114,
      "start": 0.31011159985061604,
      "end": 0.5039373575689428,
      "diff": null,
      "diffDeg": null
    },
    "L1": {
      "x": 32,
      "y": 73.25824574138392,
      "r": 64,
      "start": -1.2450668395002666,
      "end": 0.3101115740410476,
      "diff": null,
      "diffDeg": null
    },
    "L0": {
      "x": 0,
      "y": 168,
      "r": 164,
      "start": 4.71238898038469,
      "end": -1.2450668395002664,
      "diff": null,
      "diffDeg": null
    },
    "UCr": {
      "x": 70.75,
      "y": 219.75
    },
    "LCr": {
      "x": 83.25,
      "y": 135.25
    }
  },
  "options": {
    "useViolNeck": false,
    "useViolCornerUC": false,
    "useViolCornerLC": false,
    "useKellyC0": false, // four circles based theory of clean intersection along center bout
    "U31DoubleArc": false,
    "CU1DoubleArc": false,
    "CL1DoubleArc": false,
    "L31DoubleArc": false
  }
}

const stradGoetzParams: EnricoCerutiParams = {
    ...DefaultParams,
  "height": 360,
  "width": 200,
  "overhang": 3,
  "rib": 1,
  "ratios": {
    "HtoW": 1.8,
    "UBtoLB": 0.8,
    "U0toUBW": 0.33238636363636365,
    "U1toUBW": 0.4276315789473684,
    "U2toUBW": 0.6578947368421053,
    "U3toLBW": 0.140625,
    "CBWtoLBW": 0.5,
    "C0YtoH": 0.5681818181818182,
    "C0toLBW": 0.390625,
    "CUtoLBW": 0.08333333333333333,
    "CLtoLBW": 0.125,
    "LBtoH": 0.5714285714285714,
    "L0toLBW": 0.5,
    "L1toLBW": 0.375,
    "L2toLBW": 0.5,
    "L3toLBW": 0.16666666666666666,
    "UCYtoH": 0.6666666666666666,
    "UCXtoUBW": 0.875,
    "LCYtoH": 0.4,
    "LCXtoLBW": 0.875
  },
  "bouts": {
  "UBW": 160,
  "U0": {
    "x": 0,
    "y": 239,
    "r": 117,
    "start": 1.5707963267948966,
    "end": 1.3576475739242813,
    "diff": null,
    "diffDeg": null
  },
  "U1": {
    "x": 11,
    "y": 289.82322303829227,
    "r": 65,
    "start": 1.3576475923680302,
    "end": 0,
      "diff": null,
      "diffDeg": null
  },
  "U2": {
    "x": -23.749885384158425,
    "y": 294,
    "r": 100,
    "start": -0.11962156442651989,
    "end": -0.34871636265320916,
      "diff": null,
      "diffDeg": null
  },
  "U3": {
    "x": 95.60624988420405,
    "y": 250.60515037702797,
    "r": 27,
    "start": 2.7928762012205564,
    "end": -2.6347995503560626,
      "diff": null,
      "diffDeg": null
  },
  "CBW": 100,
  "CU": {
    "x": 66.45522067005395,
    "y": 222.49148834220384,
    "r": 16,
    "start": 2.7504859905840764,
    "end": 1.2169070256968206,
      "diff": null,
      "diffDeg": null
  },
  "C0": {
    "x": 121,
    "y": 200,
    "r": 75,
    "start": 2.750486056895119,
    "end": -2.5237749168168118,
      "diff": null,
      "diffDeg": null
  },
  "CL": {
    "x": 79.427631573594,
    "y": 170.45785750120416,
    "r": 24,
    "start": -2.5237749550299546,
    "end": -1.3578417180548068,
      "diff": null,
      "diffDeg": null
  },
  "LBW": 200,
  "L3": {
    "x": 113.80703487630812,
    "y": 134.15096475377004,
    "r": 32,
    "start": -2.639511516686113,
    "end": 2.7284032638025835,
      "diff": null,
      "diffDeg": null
  },
  "L2": {
    "x": 13,
    "y": 78.80711487461186,
    "r": 83,
    "start": 0,
    "end": 0.5020811369036803,
      "diff": null,
      "diffDeg": null
  },
  "L1": {
    "x": 24,
    "y": 78.80711487461186,
    "r": 72,
    "start": -1.3379281485368144,
    "end": 0,
      "diff": null,
      "diffDeg": null
  },
  "L0": {
    "x": 0,
    "y": 180,
    "r": 176,
    "start": 4.71238898038469,
    "end": -1.3379281485368142,
      "diff": null,
      "diffDeg": null
  },
  "UCr": {
    "x": 72,
    "y": 237.5
  },
  "LCr": {
    "x": 84.5,
    "y": 147
  }
},
  "blocks": {
    U: null,
    CU: null,
    CUPad: null,
    CL: null,
    CLPad: null,
    L: null,
  },
  "options": {
    "useViolNeck": false,
    "useViolCornerUC": false,
    "useViolCornerLC": false,
    "useKellyC0": false, // four circles based theory of clean intersection along center bout
    "U31DoubleArc": false,
    "CU1DoubleArc": false,
    "CL1DoubleArc": false,
    "L31DoubleArc": false

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
    params: CerutiParams,
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
      "rotationDeg": 359.5
    },
    params: stradGoetzParams,
    paths: [],
  },
  {
      key: "ravatinMans",
      label: "Cello - Ravatin - Mans",
      recipeName: 'enrico-ceruti-violin',
      fileName: 'Ravatin Mans Cello',
      version: '0.1',
      description: '',
      referenceImage: {
        "href": "/Ravatin_Mans.jpg",
        "xlink:href": "/Ravatin_Mans.jpg",
        "x": -272.160400390625,
        "y": -58.821990966796875,
        "width": 541,
        "height": 1262,
      },
      params : DefaultParams,
      paths: []
    },
];