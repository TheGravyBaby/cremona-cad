import { closeProfileToBlank, pathsBounds, samplePathToPolyline } from './svgPathMath';

describe('closeProfileToBlank', () => {
  // A simple hump: flat (y=0) at both ends, peaking at y=3 in the middle — stands
  // in for a convex cross-arch profile (heightAxis 'y'). The template must be the
  // *negative* of this: a concave trough, backed on the correct side of it.
  const hump = 'M -5 0 L 0 3 L 5 0';
  const margin = 4;

  it('closes the path into a loop', () => {
    const { path } = closeProfileToBlank(hump, 'y', 1, margin);
    expect(path.trim().endsWith('Z')).toBe(true);
  });

  it('mirrors a convex hump into a concave trough, backed below it', () => {
    const { path, backing, positionMid } = closeProfileToBlank(hump, 'y', 1, margin);
    const pts = samplePathToPolyline(path, 0.25);
    const minY = Math.min(...pts.map(pt => pt.y));
    const maxY = Math.max(...pts.map(pt => pt.y));
    // The +3 peak mirrors to a −3 trough; the backing sits margin *below* that trough,
    // so material stays thin near the peak and thickens toward the flat (≈0) ends.
    expect(minY).toBeCloseTo(-3 - margin, 0);
    expect(maxY).toBeCloseTo(0, 0);
    expect(backing).toBeCloseTo(-3 - margin, 0);
    expect(positionMid).toBeCloseTo(0, 0); // hump spans x = -5..5, symmetric about 0
  });

  it('flips the backing to the high side when direction is -1', () => {
    // Mirrors the back plate: on the mirrored curve the peak sits on the opposite
    // side, so the backing flips with it, but the same "thin near the peak" shape holds.
    const { path, backing } = closeProfileToBlank(hump, 'y', -1, margin);
    const pts = samplePathToPolyline(path, 0.25);
    const minY = Math.min(...pts.map(pt => pt.y));
    const maxY = Math.max(...pts.map(pt => pt.y));
    expect(minY).toBeCloseTo(-3, 0); // the mirrored trough itself, unmoved
    expect(maxY).toBeCloseTo(0 + margin, 0); // backing now above
    expect(backing).toBeCloseTo(0 + margin, 0);
  });

  it('mirrors on the x axis for a long-arch-style profile', () => {
    // Height (x) rises from 2 at the ends to 6 at the peak as position (y) runs 0→10 —
    // asymmetric about x=0 so the mirror is unambiguous to check.
    const rise = 'M 2 0 L 6 5 L 2 10';
    const { path, backing, positionMid } = closeProfileToBlank(rise, 'x', 1, margin);
    const pts = samplePathToPolyline(path, 0.25);
    const minX = Math.min(...pts.map(pt => pt.x));
    const maxX = Math.max(...pts.map(pt => pt.x));
    // Peak (6) mirrors to −6; flat ends (2) mirror to −2; backing sits margin past −6.
    expect(minX).toBeCloseTo(-6 - margin, 0);
    expect(maxX).toBeCloseTo(-2, 0);
    expect(backing).toBeCloseTo(-6 - margin, 0);
    expect(positionMid).toBeCloseTo(5, 0); // rise spans y = 0..10
  });

  it('leaves a degenerate (single-point) path unchanged', () => {
    expect(closeProfileToBlank('M 0 0', 'y', 1).path).toBe('M 0 0');
  });
});

describe('pathsBounds', () => {
  it('reports the combined bounding box across multiple paths', () => {
    const b = pathsBounds(['M -5 0 L 5 0 L 5 3 L -5 3 Z', 'M -2 -4 L 2 -4 L 2 -1 L -2 -1 Z']);
    expect(b.minX).toBeCloseTo(-5, 1);
    expect(b.maxX).toBeCloseTo(5, 1);
    expect(b.minY).toBeCloseTo(-4, 1);
    expect(b.maxY).toBeCloseTo(3, 1);
    expect(b.width).toBeCloseTo(10, 1);
    expect(b.height).toBeCloseTo(7, 1);
  });

  it('returns a zero-sized box for an empty list', () => {
    expect(pathsBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
  });
});
