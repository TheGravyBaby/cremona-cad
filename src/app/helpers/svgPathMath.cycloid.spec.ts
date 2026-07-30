import { cycloidZAt } from './svgPathMath';

describe('cycloidZAt windowed percentage', () => {
  const hEff = 12;
  const span = 40;

  it('pct=1 reproduces the classic (1 - cos t)/2 normalisation', () => {
    // At the centre the peak is hEff; at the edges it is 0, for any d.
    for (const d of [0, 0.6, 1]) {
      expect(cycloidZAt(hEff, span, d, span / 2, 1)).toBeCloseTo(hEff, 6);
      expect(cycloidZAt(hEff, span, d, 1e-6, 1)).toBeCloseTo(0, 3);
      expect(cycloidZAt(hEff, span, d, span - 1e-6, 1)).toBeCloseTo(0, 3);
    }
  });

  it('omitting pct matches pct=1 (back-compat default)', () => {
    for (const s of [4, 12, 20, 28, 36]) {
      expect(cycloidZAt(hEff, span, 0.6, s)).toBeCloseTo(cycloidZAt(hEff, span, 0.6, s, 1), 9);
    }
  });

  it('keeps the peak anchored and stays symmetric for pct<1', () => {
    for (const pct of [0.4, 0.7, 0.9]) {
      expect(cycloidZAt(hEff, span, 0.6, span / 2, pct)).toBeCloseTo(hEff, 6);
      // Symmetric about the centre station.
      for (const s of [3, 9, 15]) {
        expect(cycloidZAt(hEff, span, 0.6, s, pct))
          .toBeCloseTo(cycloidZAt(hEff, span, 0.6, span - s, pct), 6);
      }
    }
  });

  it('rises monotonically from edge to peak', () => {
    for (const pct of [0.4, 1]) {
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const z = cycloidZAt(hEff, span, 0.6, (i / 20) * (span / 2), pct);
        expect(z).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = z;
      }
    }
  });

  it('gives a steeper edge takeoff once the window is clipped', () => {
    // Slope near the edge, approximated over the first millimetre of span.
    const edgeSlope = (pct: number) =>
      cycloidZAt(hEff, span, 0.6, 1, pct) - cycloidZAt(hEff, span, 0.6, 1e-6, pct);
    // Full window leaves the edge essentially tangent; clipping it steepens.
    for (const pct of [0.9, 0.7, 0.5, 0.3]) {
      expect(edgeSlope(1)).toBeLessThan(edgeSlope(pct));
    }
  });

  it('peaks in edge steepness partway down, rather than steepening all the way', () => {
    // Deliberately pinned, because it is the surprising half of how `pct` behaves and an
    // earlier version of the test above assumed the opposite. The curve is renormalised to
    // reach exactly hEff, so past roughly pct = 0.6 further clipping stretches the retained
    // window back over the same span and the takeoff flattens off again.
    const edgeSlope = (pct: number) =>
      cycloidZAt(hEff, span, 0.6, 1, pct) - cycloidZAt(hEff, span, 0.6, 1e-6, pct);
    expect(edgeSlope(0.6)).toBeGreaterThan(edgeSlope(0.9));
    expect(edgeSlope(0.6)).toBeGreaterThan(edgeSlope(0.3));
  });
});
