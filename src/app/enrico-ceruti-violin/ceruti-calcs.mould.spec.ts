// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { calculateMould } from './ceruti-calcs';

const bouts: any = {
  UBW: 168, CBW: 108, LBW: 209,
  U0: { x: 0, y: 123, r: 231, start: 1.5707963267948966, end: 1.4694323598114982 },
  U1: { x: 17, y: 290.13766780711046, r: 63, start: 1.4694323598114982, end: 0 },
  U2: { x: -6, y: 290.13766780711046, r: 86, start: 0, end: -0.3829759355325589 },
  U3: { x: 97.88634923384105, y: 248.28523128467594, r: 26, start: 2.758616718057233, end: -2.5713734447868117 },
  U31: { x: 90.43071498694279, y: 245.75892489822405, r: 18, start: -2.9951267633834764, end: -2.5009409416292696 },
  U4: null,
  C2: { x: 73.00632557215619, y: 214.76640561135164, r: 20, start: 2.806340271846125, end: 1.678732623504524 },
  C21: { x: 72.35996486182131, y: 220.73148883224098, r: 14, start: 1.6787326463525307, end: 1.3077715246233914 },
  C0: { x: 124, y: 197, r: 74, start: 2.8063402718461243, end: -2.5631593684333103 },
  C1: { x: 82.13398868431815, y: 169.66436215276474, r: 24, start: -2.5631593451814467, end: -1.669151135908297 },
  C11: { x: 81.74120316837359, y: 165.68369392513458, r: 20, start: -1.6691511221431938, end: -1.1724009979308943 },
  L4: null,
  L3: { x: 273.20329673158693, y: 197.62908533273009, r: 200, start: -2.7072671374596657, end: -2.7576825639139835 },
  L31: { x: 113.72365697301689, y: 133.20669401979663, r: 28, start: -2.7576825639139835, end: 2.616207046845472 },
  L2: { x: 6.5, y: 73.91428624829118, r: 94, start: 0, end: 0.4343255161301275 },
  L1: { x: 33.5, y: 73.91428624829118, r: 67, start: -1.3972460112652347, end: 0 },
  L0: { x: 0, y: 265, r: 261, start: 4.71238898038469, end: -1.3972460112652347 },
  UCr: { x: 76, y: 234.25 }, LCr: { x: 89.5, y: 147.25 },
};

describe('calculateMould', () => {
  // a recipe where the relief circle at the upper corner block clips U3 just past a sample
  // point, which used to flip that run's sweep and draw U3's major arc as a bubble
  it('keeps every corner arc to its minor sweep after the block cutouts', () => {
    const p: any = {
      height: 358, width: 209, overhang: 3, rib: 1, bitDiameter: 6.35, bouts,
      viol: { width: null, V0: null, neckRadius: null },
      blocks: {
        U: { Pt1: { x: -20, y: 334 }, Pt2: { x: 20, y: 354 }, height: 20, width: 40 },
        CU: { Pt1: { x: 79, y: 231.25 }, Pt2: { x: 67, y: 251.25 }, height: 20, width: 12 }, CUPad: 3,
        CL: { Pt1: { x: 92.5, y: 150.25 }, Pt2: { x: 80.5, y: 130.25 }, height: 20, width: 12 }, CLPad: 3,
        L: { Pt1: { x: -20, y: 4 }, Pt2: { x: 20, y: 24 }, height: 20, width: 40 },
      },
      options: { useViolNeck: false, useViolCornerUC: false, useViolCornerLC: false, U31DoubleArc: false, C21DoubleArc: true, C11DoubleArc: true, L31DoubleArc: true },
    };
    const d = calculateMould(p, false, true);
    expect(d).toMatch(/A 26 26 0 0 0 /);
    expect(d).not.toMatch(/A [\d.e]+ [\d.e]+ 0 1 /);
  });
});
