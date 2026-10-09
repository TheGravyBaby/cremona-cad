// @vitest-environment node
import { pathsBounds } from './pathMath';

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
});
