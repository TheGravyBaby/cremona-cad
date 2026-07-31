import { gougeHalfWidth, gougeProfileSlope, gougeProfileZ, solveGougedTakeoff } from './ceruti-gouged';

/**
 * The gouged model's two load-bearing claims, in the order they matter:
 *
 *  1. the channel section is decided by the tool alone, and
 *  2. where the arch meets it is *solved*, not entered.
 *
 * The second is what keeps this model from costing the maker more parameters
 * than the classic one, so it is worth pinning rather than eyeballing.
 */

// A gouge that cuts 4mm wide at 1.2mm deep — the default seeding for a violin.
const R = 2.2667;
const D = 1.2;

describe('gouge section', () => {
  it('spans the chord its own sweep and depth imply', () => {
    // w = sqrt(2RD - D²); with these numbers exactly 2mm, so a 4mm channel.
    expect(gougeHalfWidth(R, D)).toBeCloseTo(2, 3);
  });

  it('reaches full depth at the trough and plate level at both edges', () => {
    const w = gougeHalfWidth(R, D);
    expect(gougeProfileZ(0, R, D)).toBeCloseTo(-D, 9);
    expect(gougeProfileZ(w, R, D)).toBeCloseTo(0, 9);
    expect(gougeProfileZ(-w, R, D)).toBeCloseTo(0, 9);
  });

  it('is flat outside the cut, so the land either side stays land', () => {
    const w = gougeHalfWidth(R, D);
    expect(gougeProfileZ(w + 0.5, R, D)).toBe(0);
    expect(gougeProfileSlope(w + 0.5, R, D)).toBe(0);
  });

  it('reports a slope matching its own finite difference', () => {
    // The solve matches the arch against this slope, so an analytic/numeric
    // disagreement here would be a silently wrong tangency everywhere.
    for (const s of [0.2, 0.8, 1.4, 1.9]) {
      const e = 1e-6;
      const fd = (gougeProfileZ(s + e, R, D) - gougeProfileZ(s - e, R, D)) / (2 * e);
      expect(gougeProfileSlope(s, R, D)).toBeCloseTo(fd, 5);
    }
  });

  it('refuses a tool that cannot reach its own depth', () => {
    expect(gougeHalfWidth(1, 2)).toBe(0);
    expect(gougeProfileZ(0, 1, 2)).toBe(0);
  });
});

describe('solveGougedTakeoff', () => {
  /** A stand-in arch that always arrives at a fixed grade, so the root is checkable by hand. */
  const constantSlope = (grade: number) => () => grade;

  it('lands where the channel matches the arch grade', () => {
    const grade = 0.187; // a violin long arch's takeoff slope over a ~348mm span
    const t = solveGougedTakeoff(R, D, constantSlope(grade));
    expect(t).not.toBeNull();
    // Tangency is the whole point: the channel's slope at the contact must be
    // the grade the arch arrived with.
    expect(gougeProfileSlope(t!.contactS, R, D)).toBeCloseTo(grade, 6);
    // s / sqrt(R² − s²) = grade  ⇒  s = grade·R / sqrt(1 + grade²)
    expect(t!.contactS).toBeCloseTo((grade * R) / Math.sqrt(1 + grade * grade), 6);
  });

  it('reports a takeoff depth on the channel it contacts', () => {
    const t = solveGougedTakeoff(R, D, constantSlope(0.187))!;
    expect(t.takeoffDepth).toBeCloseTo(-gougeProfileZ(t.contactS, R, D), 9);
    // A shallow arch contacts near the trough, so it takes off nearly full depth.
    expect(t.takeoffDepth).toBeGreaterThan(0);
    expect(t.takeoffDepth).toBeLessThanOrEqual(D);
  });

  it('contacts further out as the arch arrives steeper', () => {
    // The physical claim behind the sliding contact point: a steeper arch meets
    // the channel higher up its inner flank, eating less of it.
    const shallow = solveGougedTakeoff(R, D, constantSlope(0.2))!;
    const steep = solveGougedTakeoff(R, D, constantSlope(1.0))!;
    expect(steep.contactS).toBeGreaterThan(shallow.contactS);
    expect(steep.takeoffDepth).toBeLessThan(shallow.takeoffDepth);
  });

  it('returns null rather than a bad root when no tangency exists', () => {
    const w = gougeHalfWidth(R, D);
    // Steeper than the channel ever gets, so the arch can never come tangent to it.
    const beyond = gougeProfileSlope(w * (1 - 1e-3), R, D) * 2;
    expect(solveGougedTakeoff(R, D, constantSlope(beyond))).toBeNull();
  });

  it('returns null for a tool that cuts nothing', () => {
    expect(solveGougedTakeoff(1, 2, constantSlope(0.2))).toBeNull();
  });

  it('handles an arch whose grade depends on where it lands', () => {
    // The real callers do this: moving the contact changes the span and the
    // takeoff depth, which changes the slope the arch arrives with. The solver
    // brackets by scanning rather than assuming that stays monotone.
    const t = solveGougedTakeoff(R, D, (takeoffDepth, contactS) => 0.15 + 0.3 * takeoffDepth - 0.05 * contactS);
    expect(t).not.toBeNull();
    const arrived = 0.15 + 0.3 * t!.takeoffDepth - 0.05 * t!.contactS;
    expect(gougeProfileSlope(t!.contactS, R, D)).toBeCloseTo(arrived, 5);
  });
});
