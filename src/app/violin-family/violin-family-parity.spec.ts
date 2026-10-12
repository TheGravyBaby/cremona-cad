// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { templateKeys, templateViolin } from '../enrico-ceruti-violin/ceruti-fixtures';
import { EnricoCerutiParams } from '../enrico-ceruti-violin/ceruti-types';
import { Arc } from '../models/types';
import { TURN } from '../helpers/math/simpleGeometry';
import { solveMainBoutsRatios, solveMainBouts } from './panels/main-bouts-panel/main-bouts-panel';
import { ViolinFamilyParams } from './violin-family-types';

// The port's acceptance test: every frozen Ceruti instrument, solved by both recipes from the same
// inputs, gives the same arcs and reads the same ratios. Goes when the Ceruti recipe does.

function fromCeruti(c: EnricoCerutiParams): ViolinFamilyParams {
  let V0 = c.viol?.V0;
  return {
    body: { height: c.height, width: c.bouts.LBW!, overhang: c.overhang, rib: c.rib },
    bouts: {
      UBW: c.bouts.UBW!,
      U0R: c.bouts.U0!.r,
      U1R: c.bouts.U1!.r,
      L0R: c.bouts.L0!.r,
      L1R: c.bouts.L1!.r,
      useViolNeck: c.options.useViolNeck,
      viol: V0 ? { width: c.viol.width!, neckRadius: c.viol.neckRadius ?? 0, V0R: V0.r, V0Start: V0.start / TURN.degree, V0End: V0.end / TURN.degree } : null,
    },
  };
}

// to a millionth: the Ceruti fixtures are solved through every outline stage, and its corners
// leave a ~2e-8 residue on U1.end that its main bouts solve would have snapped to 0
const sameArc = (a: Arc | null, b: Arc | null | undefined, label: string) => {
  expect(a, `${label} solved`).not.toBeNull();
  for (const k of ['x', 'y', 'r', 'start', 'end'] as const) {
    expect(Math.abs(a![k] - b![k]), `${label}.${k}`).toBeLessThan(1e-6);
  }
};

describe.each(templateKeys())('parity with the Ceruti recipe: %s', key => {
  const c = templateViolin(key);
  const p = fromCeruti(c);
  const m = solveMainBouts(p)!;

  it('solves the main bouts to the same arcs', () => {
    expect(m.failures).toEqual([]);
    sameArc(m.U0, c.bouts.U0, 'U0');
    sameArc(m.U1, c.bouts.U1, 'U1');
    sameArc(m.L0, c.bouts.L0, 'L0');
    sameArc(m.L1, c.bouts.L1, 'L1');
    if (c.options.useViolNeck) sameArc(m.V0, c.viol.V0, 'V0');
  });

  it('reads the same ratios', () => {
    const r = solveMainBoutsRatios(p);
    for (const k of ['UBtoLB', 'U0toUBW', 'U1toUBW', 'LBtoH', 'L0toLBW', 'L1toLBW'] as const) {
      expect(r[k], k).toBeCloseTo(c.ratios[k], 12);
    }
  });
});
