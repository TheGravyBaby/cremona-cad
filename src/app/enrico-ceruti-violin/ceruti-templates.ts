import { EnricoCerutiTemplate, DefaultParams, EnricoCerutiParams } from "./ceruti-types";

/**
 * Converts a raw recipe object copied from session storage into an
 * EnricoCerutiTemplate. The session-storage JSON wraps the params under a
 * nested `params` key alongside top-level metadata fields (`key`, `label`,
 * `fileName`, `referenceImage`, `paths`, etc.).  Pass the pasted object
 * directly – no manual editing required.
 */
function templateFromRecipeJson(raw: any): EnricoCerutiTemplate {
  return {
    key:           raw.key          ?? '',
    label:         raw.label        ?? '',
    recipeName:    raw.recipeName   ?? 'enrico-ceruti-violin',
    fileName:      raw.fileName     ?? '',
    version:       raw.version      ?? '0.1',
    description:   raw.description  ?? '',
    referenceImage: raw.referenceImage,
    params:        (raw.params      ?? raw) as EnricoCerutiParams,
    paths:         raw.paths        ?? [],
  };
}


const GoetzParams = {
  "key": "strad-goetz",
  "label": "Violin - Stradvarius - Goetz",
  "recipeName": "enrico-ceruti-violin",
  "fileName": "Strad Goetz",
  "version": "0.1",
  "description": "C. 1695, Long Strad",
  "referenceImage": {
    "href": "/StradGoetz.jpg",
    "xlink:href": "/StradGoetz.jpg",
    "x": -157.7095239572227,
    "y": -196.6448444843292,
    "width": 319,
    "height": 779,
    "rotationDeg": 359.6
  },
  "params": {
    "height": 363,
    "width": 200,
    "overhang": 3,
    "rib": 1,
    "bitDiameter": 6.35,
    "clampChannelWidth": 5,
    "ratios": {
      "HtoW": 1.815,
      "UBtoLB": 0.8,
      "U0toUBW": 0.8026315789473685,
      "U1toUBW": 0.4276315789473684,
      "U2toUBW": 0.625,
      "U3toLBW": 0.13020833333333334,
      "CBWtoLBW": 0.52,
      "C0YtoH": 0.5690140845070423,
      "C0toLBW": 0.5,
      "C2toLBW": 0.109375,
      "C1toLBW": 0.140625,
      "LBtoH": 0.5509641873278237,
      "L0toLBW": 0.875,
      "L1toLBW": 0.3645833333333333,
      "L2toLBW": 0.5,
      "L3toLBW": 0.14583333333333334,
      "UCYtoH": 0.65633608815427,
      "LCYtoH": 0.4049586776859504
    },
    "bouts": {
      "UBW": 160,
      "U0": {
        "x": 0,
        "y": 237,
        "r": 122,
        "start": 1.5707963267948966,
        "end": 1.3765955054606738
      },
      "U1": {
        "x": 11,
        "y": 292.92852581643825,
        "r": 65,
        "start": 1.3765955191704937,
        "end": 0
      },
      "U2": {
        "x": -19,
        "y": 292.92852581643825,
        "r": 95,
        "start": 0,
        "end": -0.35631302113815466
      },
      "U3": {
        "x": 93.46271446290403,
        "y": 251.06998002665577,
        "r": 25,
        "start": 2.785279632451638,
        "end": -2.6031504870270683
      },
      "U31": {
        "x": 84.42181247503567,
        "y": 248.33457112796816,
        "r": 16,
        "start": -2.945242411073957,
        "end": -2.4596715049428206
      },
      "LBW": 200,
      "L3": {
        "x": 110.09112319936273,
        "y": 134.5727904743502,
        "r": 28,
        "start": -2.663407758251101,
        "end": 2.6817256719210505
      },
      "L31": {
        "x": 0,
        "y": 0,
        "r": 12,
        "start": 2.945243112740431,
        "end": 6.283185307179586
      },
      "L2": {
        "x": 0,
        "y": 77.51190551185827,
        "r": 96,
        "start": 0,
        "end": 0.4781848953386925
      },
      "L1": {
        "x": 26,
        "y": 77.51190551185827,
        "r": 70,
        "start": -1.3022749180203774,
        "end": 0
      },
      "L0": {
        "x": 0,
        "y": 172,
        "r": 168,
        "start": 4.71238898038469,
        "end": -1.3022749180203774
      },
      "UCr": {
        "x": 72,
        "y": 238.25
      },
      "LCr": {
        "x": 85,
        "y": 147
      },
      "C0": {
        "x": 144,
        "y": 202,
        "r": 96,
        "start": 2.9313049910987106,
        "end": -2.717371243834006
      },
      "CBW": 104,
      "C11": {
        "x": 81.11619520299584,
        "y": 165.59881878772865,
        "r": 19,
        "start": -1.5707963267948966,
        "end": -1.3649345882653523
      },
      "C21": {
        "x": 69.27244466788507,
        "y": 224.51826879413042,
        "r": 14,
        "start": 1.7692008167111737,
        "end": 1.3747169103465584
      },
      "C2": {
        "x": 70.65218188762438,
        "y": 217.655592551988,
        "r": 21,
        "start": 2.9313049910987106,
        "end": 1.769200797883912
      },
      "C1": {
        "x": 81.11619520299584,
        "y": 173.59881878772865,
        "r": 27,
        "start": -2.717371218446842,
        "end": -1.5707963267948966
      }
    },
    "viol": {
      "width": null,
      "V0": null
    },
    "button": {
      "Pt1": {
        "x": -10,
        "y": 359
      },
      "Pt2": {
        "x": 10,
        "y": 364
      },
      "height": 5,
      "width": 20
    },
    "outerCorners": {
      "U3": {
        "x": 93.46271446290403,
        "y": 251.06998002665577,
        "r": 21,
        "start": 2.785279632451638,
        "end": -2.4856147085712372
      },
      "U31": null,
      "C2": {
        "x": 70.65218188762438,
        "y": 217.655592551988,
        "r": 17,
        "start": 2.9313049910987106,
        "end": 1.769200797883912
      },
      "C21": {
        "x": 69.27244466788507,
        "y": 224.51826879413042,
        "r": 10,
        "start": 1.7692008167111737,
        "end": 0.9488954746144915
      },
      "C1": {
        "x": 81.11619520299584,
        "y": 173.59881878772865,
        "r": 23,
        "start": -2.717371218446842,
        "end": -1.5707963267948966
      },
      "C11": {
        "x": 81.11619520299584,
        "y": 165.59881878772865,
        "r": 15,
        "start": -1.5707963267948966,
        "end": -1.064650843716541
      },
      "L3": {
        "x": 110.09112319936273,
        "y": 134.5727904743502,
        "r": 24,
        "start": -2.663407758251101,
        "end": 2.555126705211945
      },
      "L31": null
    },
    "blocks": {
      "U": {
        "Pt1": {
          "x": -20,
          "y": 339
        },
        "Pt2": {
          "x": 20,
          "y": 359
        },
        "height": 20,
        "width": 40
      },
      "CU": {
        "Pt1": {
          "x": 74,
          "y": 236.25
        },
        "Pt2": {
          "x": 62,
          "y": 256.25
        },
        "height": 20,
        "width": 12
      },
      "CUPad": 2,
      "CL": {
        "Pt1": {
          "x": 87,
          "y": 149
        },
        "Pt2": {
          "x": 75,
          "y": 129
        },
        "height": 20,
        "width": 12
      },
      "CLPad": 2,
      "L": {
        "Pt1": {
          "x": -20,
          "y": 4
        },
        "Pt2": {
          "x": 20,
          "y": 24
        },
        "height": 20,
        "width": 40
      }
    },
    "options": {
      "useViolNeck": false,
      "useViolCornerUC": false,
      "useViolCornerLC": false,
      "useKellyC0": false,
      "U31DoubleArc": false,
      "C21DoubleArc": true,
      "C11DoubleArc": true,
      "L31DoubleArc": false
    }
  },
  "paths": []
}

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

  templateFromRecipeJson(GoetzParams),
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