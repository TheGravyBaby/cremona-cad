// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { templateKeys, templateViolin } from '../enrico-ceruti-violin/ceruti-fixtures';
import { calculateCorners } from '../enrico-ceruti-violin/calculation/outline/ceruti-calcs';
import { EnricoCerutiParams } from '../enrico-ceruti-violin/ceruti-types';
import { Arc } from '../models/types';
import { TURN } from '../helpers/math/simpleGeometry';
import { solveMainBoutsRatios, solveMainBouts } from './panels/main-bouts-panel/main-bouts-panel';
import { solveCorners, solveCornersRatios } from './panels/corners-panel/corners-panel';
import { ViolinFamilyParams } from './violin-family-types';

// The port's acceptance test: every frozen Ceruti instrument, solved by both recipes from the same
// inputs, gives the same arcs and reads the same ratios. Goes when the Ceruti recipe does.

function fromCeruti(c: EnricoCerutiParams): ViolinFamilyParams {
  let V0 = c.viol?.V0;
  let b = c.bouts;
  return {
    body: { height: c.height, width: b.LBW!, overhang: c.overhang, rib: c.rib },
    bouts: {
      UBW: b.UBW!,
      U0R: b.U0!.r,
      U1R: b.U1!.r,
      L0R: b.L0!.r,
      L1R: b.L1!.r,
      useViolNeck: c.options.useViolNeck,
      viol: V0 ? { width: c.viol.width!, neckRadius: c.viol.neckRadius ?? 0, V0R: V0.r, V0Start: V0.start / TURN.degree, V0End: V0.end / TURN.degree } : null,
    },
    // a solved Ceruti compound arc's start is the split direction it was solved at, so it reads
    // straight across as the authored angle
    corners: {
      UCr: { x: b.UCr!.x, y: b.UCr!.y },
      LCr: { x: b.LCr!.x, y: b.LCr!.y },
      U2R: b.U2!.r,
      U3R: b.U3!.r,
      U31R: b.U31!.r,
      U31Start: b.U31!.start / TURN.degree,
      U31DoubleArc: c.options.U31DoubleArc,
      useViolCornerUC: c.options.useViolCornerUC,
      L2R: b.L2!.r,
      L3R: b.L3!.r,
      L31R: b.L31!.r,
      L31Start: b.L31!.start / TURN.degree,
      L31DoubleArc: c.options.L31DoubleArc,
      useViolCornerLC: c.options.useViolCornerLC,
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

// every corner arc the options draw, both recipes solved from the same Ceruti instrument
const sameCorners = (c: EnricoCerutiParams, p = fromCeruti(c)) => {
  const s = solveCorners(p)!;
  const b = c.bouts;
  const o = c.options;
  expect(s.failures).toEqual([]);
  sameArc(s.U1, b.U1, 'U1');
  sameArc(s.L1, b.L1, 'L1');
  sameArc(s.U2, b.U2, 'U2');
  sameArc(s.U3, b.U3, 'U3');
  sameArc(s.L2, b.L2, 'L2');
  sameArc(s.L3, b.L3, 'L3');
  if (o.U31DoubleArc) sameArc(s.U31, b.U31, 'U31');
  if (o.L31DoubleArc) sameArc(s.L31, b.L31, 'L31');
  if (o.useViolCornerUC) sameArc(s.U4, b.U4, 'U4');
  if (o.useViolCornerLC) sameArc(s.L4, b.L4, 'L4');
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

  it('solves the corners to the same arcs', () => {
    sameCorners(c);
  });

  // no fixture ships with a viol corner, and only some with a compound arc, so each instrument is
  // also re-solved by both recipes with those options turned on. The Violin Family params are
  // read before the Ceruti re-solve: that rewrites the compound arc's start with the handover it
  // found, a micron off the angle it was given. Where that corner is out of reach for the
  // instrument, both recipes have to say so
  it('solves the viol corners to the same arcs', () => {
    const viol = templateViolin(key);
    viol.options.useViolCornerUC = true;
    viol.options.useViolCornerLC = true;
    const p = fromCeruti(viol);
    calculateCorners(viol);
    sameCorners(viol, p);
  });

  it('solves the compound corners to the same arcs, or misses them together', () => {
    const compound = templateViolin(key);
    compound.options.U31DoubleArc = true;
    compound.options.L31DoubleArc = true;
    const p = fromCeruti(compound);
    const failures = calculateCorners(compound);
    if (failures.length) {
      expect(solveCorners(p)!.failures.map(f => f.unsolved)).toEqual(failures.map(f => f.unsolved));
    } else {
      sameCorners(compound, p);
    }
  });

  it('reads the same ratios', () => {
    const r = { ...solveMainBoutsRatios(p), ...solveCornersRatios(p) };
    for (const k of [
      'UBtoLB', 'U0toUBW', 'U1toUBW', 'LBtoH', 'L0toLBW', 'L1toLBW',
      'U2toUBW', 'U3toLBW', 'U31toLBW', 'L2toLBW', 'L3toLBW', 'L31toLBW', 'UCYtoH', 'LCYtoH',
    ] as const) {
      expect(r[k], k).toBeCloseTo(c.ratios[k], 12);
    }
  });
});
