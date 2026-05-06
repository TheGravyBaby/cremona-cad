import { Circle, Rectangle } from "../models/types";

export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bouts: {
    UBW: number | null;
      U0: Circle | null;
      U1: Circle | null;
      U2: Circle | null;
      U3: Circle | null;
    CBW: number | null;
      CU: Circle | null;
      C0: Circle | null;
      CL: Circle | null;
    LBW: number | null;
      L3: Circle | null;
      L2: Circle | null;
      L1: Circle | null;
      L0: Circle | null;
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
  viol? : {
    height: number;
    V0: Circle | null;
  },
  ratios?: {
    HtoW: number;
    UBtoLB: number;
      U0toH: number;
      U1toUBW: number;
      U2toUBW: number;
      U3toUBW: number;
    C0toH: number;
      CUtoCB: number;
      CLtoCB: number;
    LBtoH: number;
      L0toH: number; 
      L1toLBW: number;
      L2toLBW: number;
      L3toLBW: number;

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
    params: {
      height: 350,
      width: 200,
      overhang: 3,
      rib: 1,
      ratios: {
        HtoW: 7 / 4,
        UBtoLB: 4 / 5,
          U0toH: 3/5,
          U1toUBW: 2/5,
          U2toUBW: 2/5,
          U3toUBW: 0,
        C0toH: 0,
          CUtoCB: 0,
          CLtoCB: 0,
        LBtoH: 4 / 7,
          L0toH: 3/5,
          L1toLBW: 2/5,
          L2toLBW: 2/5,
          L3toLBW: 0
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
          L0: undefined
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
      }
    },
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
  // {
  //   key: 'ceruti-default',
  //   label: 'Strad Goetz',
  //   recipeName: 'enrico-ceruti-violin',
  //   fileName: 'Strad Goetz',
  //   version: '0.1',
  //   description: 'C. 1695, Long Strad',
  //   referenceImage: {
  //     "href": "/StradGoetz.jpg",
  //     "xlink:href": "/StradGoetz.jpg",
  //     "x": -158.7095239572227,
  //     "y": -196.6448444843292,
  //     "width": 319,
  //     "height": 779,
  //   },
  //   params: {
  //     height: 362,
  //     width: 201,
  //     overhang: 2,
  //     ribThickness: 1,
  //   },
  //   paths: [],
  // },
];