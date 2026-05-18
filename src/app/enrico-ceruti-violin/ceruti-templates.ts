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

const RavatinMans = {
  "key": "ravatinMans",
  "label": "Cello - Ravatin - Mans",
  "recipeName": "enrico-ceruti-violin",
  "fileName": "Ravatin Mans Cello",
  "version": "0.1",
  "description": "",
  "referenceImage": {
    "href": "/Ravatin_Mans.jpg",
    "xlink:href": "/Ravatin_Mans.jpg",
    "x": -270.98718678951263,
    "y": -244.2769876886315,
    "width": 539.1827434301376,
    "height": 1272.3834126331224,
    "rotationDeg": 0
  },
  "params": {
    "height": 758,
    "width": 457.4,
    "overhang": 5.4,
    "rib": 1.5,
    "bitDiameter": 6.35,
    "clampChannelWidth": 8,
    "ratios": {
      "HtoW": 1.6571928290336686,
      "UBtoLB": 0.7673808482728466,
      "U0toUBW": 0.7651245551601423,
      "U1toUBW": 0.3973902728351127,
      "U2toUBW": 0.5160142348754448,
      "U3toLBW": 0.1352569882777277,
      "CBWtoLBW": 0.524704853519895,
      "C0YtoH": 0.5872077398548777,
      "C0toLBW": 0.3922452660054103,
      "C2toLBW": 0.087917042380523,
      "C1toLBW": 0.12623985572587917,
      "LBtoH": 0.6034300791556728,
      "L0toLBW": 1.2759242560865647,
      "L1toLBW": 0.3606853020739405,
      "L2toLBW": 0.5184851217312895,
      "L3toLBW": 0.23444544634806133,
      "UCYtoH": 0.662269129287599,
      "LCYtoH": 0.4277704485488127
    },
    "bouts": {
      "UBW": 351,
      "U0": {
        "x": 0,
        "y": 493.1,
        "r": 258,
        "start": 1.5707963267948966,
        "end": 1.2880101550319685
      },
      "U1": {
        "x": 34.6,
        "y": 612.1749343900722,
        "r": 134,
        "start": 1.2880101743815804,
        "end": 0
      },
      "LBW": 457.4,
      "L1": {
        "x": 61.79999999999999,
        "y": 171.6310627521736,
        "r": 160,
        "start": -1.417985554585304,
        "end": 0
      },
      "L0": {
        "x": 0,
        "y": 572.9,
        "r": 566,
        "start": 4.71238898038469,
        "end": -1.417985554585304
      },
      "LCr": {
        "x": 194,
        "y": 324.25
      },
      "UCr": {
        "x": 159.5,
        "y": 502
      },
      "U31": {
        "x": 190.957575083497,
        "y": 523.3171520111423,
        "r": 38,
        "start": -2.96527544536804,
        "end": -2.5460263059815906
      },
      "L31": {
        "x": 222.7811652268449,
        "y": 306.1490462078633,
        "r": 34,
        "start": -2.9598516561244486,
        "end": 2.5801818329445676
      },
      "U2": {
        "x": -5.4,
        "y": 612.1749343900722,
        "r": 174,
        "start": 0,
        "end": -0.37174634620689945
      },
      "L2": {
        "x": -8.200000000000012,
        "y": 171.6310627521736,
        "r": 230,
        "start": 0,
        "end": 0.45629873857134085
      },
      "U3": {
        "x": 212.6164947402082,
        "y": 527.1760636846753,
        "r": 60,
        "start": 2.7698463444062744,
        "end": -2.9652754453680403
      },
      "L3": {
        "x": 291.62830105716955,
        "y": 318.80099815058065,
        "r": 104,
        "start": -2.6852939150184523,
        "end": -2.9598516561244486
      },
      "C0": {
        "x": 287.1,
        "y": 437,
        "r": 174,
        "start": 2.926493996763126,
        "end": -2.626486440691055
      },
      "CBW": 240,
      "C11": {
        "x": 184.41163184369464,
        "y": 356.86998154657886,
        "r": 34,
        "start": -1.5707963267948966,
        "end": -1.2849069632002428
      },
      "C21": {
        "x": 150.10015696456315,
        "y": 479.91736087082995,
        "r": 24,
        "start": 1.9184840723406682,
        "end": 1.168361155796071
      },
      "C2": {
        "x": 155.21102892826593,
        "y": 465.81491470817303,
        "r": 39,
        "start": 2.9264939967631256,
        "end": 1.9184840615337837
      },
      "C1": {
        "x": 184.41163184369464,
        "y": 378.86998154657886,
        "r": 56,
        "start": -2.6264864224304643,
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
        "y": 751.1
      },
      "Pt2": {
        "x": 10,
        "y": 756.1
      },
      "height": 2,
      "width": 38
    },
    "outerCorners": {
      "U3": {
        "x": 212.6164947402082,
        "y": 527.1760636846753,
        "r": 53.1,
        "start": 2.7698463444062744,
        "end": -2.9652754453680403
      },
      "U31": {
        "x": 190.957575083497,
        "y": 523.3171520111423,
        "r": 31.1,
        "start": -2.96527544536804,
        "end": -2.4067700847298545
      },
      "C2": {
        "x": 155.21102892826593,
        "y": 465.81491470817303,
        "r": 32.1,
        "start": 2.9264939967631256,
        "end": 1.9184840615337837
      },
      "C21": {
        "x": 150.10015696456315,
        "y": 479.91736087082995,
        "r": 17.1,
        "start": 1.9184840723406682,
        "end": 0.8189266435842406
      },
      "C1": {
        "x": 184.41163184369464,
        "y": 378.86998154657886,
        "r": 49.1,
        "start": -2.6264864224304643,
        "end": -1.5707963267948966
      },
      "C11": {
        "x": 184.41163184369464,
        "y": 356.86998154657886,
        "r": 27.1,
        "start": -1.5707963267948966,
        "end": -1.0297442586766543
      },
      "L3": {
        "x": 291.62830105716955,
        "y": 318.80099815058065,
        "r": 97.1,
        "start": -2.6852939150184523,
        "end": -2.9598516561244486
      },
      "L31": {
        "x": 222.7811652268449,
        "y": 306.1490462078633,
        "r": 27.1,
        "start": -2.9598516561244486,
        "end": 2.503028902617803
      }
    },
    "blocks": {
      "U": {
        "Pt1": {
          "x": -45,
          "y": 721.1
        },
        "Pt2": {
          "x": 45,
          "y": 751.1
        },
        "height": 30,
        "width": 90
      },
      "CU": {
        "Pt1": {
          "x": 164.5,
          "y": 497
        },
        "Pt2": {
          "x": 140.5,
          "y": 537
        },
        "height": 40,
        "width": 24
      },
      "CUPad": 5,
      "CL": {
        "Pt1": {
          "x": 199,
          "y": 329.25
        },
        "Pt2": {
          "x": 175,
          "y": 289.25
        },
        "height": 40,
        "width": 24
      },
      "CLPad": 5,
      "L": {
        "Pt1": {
          "x": -45,
          "y": 6.9
        },
        "Pt2": {
          "x": 45,
          "y": 36.9
        },
        "height": 30,
        "width": 90
      }
    },
    "options": {
      "useViolNeck": false,
      "useViolCornerUC": false,
      "useViolCornerLC": false,
      "useKellyC0": false,
      "U31DoubleArc": true,
      "C21DoubleArc": true,
      "C11DoubleArc": true,
      "L31DoubleArc": true
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
  templateFromRecipeJson(RavatinMans),
];