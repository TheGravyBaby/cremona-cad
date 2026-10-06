// @vitest-environment node
import { applyMatrix, multiplyMatrices, parseSvgTransform, samplePathToPolyline, transformPath } from './pathMath';

describe('parseSvgTransform', () => {
  it('reads translate, scale, rotate and matrix in attribute order', () => {
    const m = parseSvgTransform('translate(10, 5) scale(2)');
    expect(applyMatrix(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 7 });

    const r = parseSvgTransform('rotate(90)');
    const p = applyMatrix(r, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);

    const pivot = parseSvgTransform('rotate(180, 5, 5)');
    expect(applyMatrix(pivot, { x: 0, y: 0 }).x).toBeCloseTo(10, 9);

    expect(applyMatrix(parseSvgTransform('matrix(1 0 0 -1 0 0)'), { x: 2, y: 3 })).toEqual({ x: 2, y: -3 });
  });

  it('is the identity for nothing, and ignores what it does not know', () => {
    expect(applyMatrix(parseSvgTransform(undefined), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
    expect(applyMatrix(parseSvgTransform('skewX(30)'), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('composes as the attribute list does', () => {
    const a = parseSvgTransform('translate(1,0)');
    const b = parseSvgTransform('scale(3)');
    expect(applyMatrix(multiplyMatrices(a, b), { x: 1, y: 0 })).toEqual({ x: 4, y: 0 });
    expect(applyMatrix(multiplyMatrices(b, a), { x: 1, y: 0 })).toEqual({ x: 6, y: 0 });
  });
});

describe('transformPath', () => {
  const quarter = 'M 10 0 A 10 10 0 0 1 0 10';

  it('moves every kind of point and scales the arc radius', () => {
    expect(transformPath('M 1 2 L 3 4 Q 5 6 7 8 C 1 1 2 2 3 3 Z', parseSvgTransform('translate(1,1)')))
      .toBe('M 2 3 L 4 5 Q 6 7 8 9 C 2 2 3 3 4 4 Z');
    expect(transformPath(quarter, parseSvgTransform('scale(2)'))).toBe('M 20 0 A 20 20 0 0 1 0 20');
  });

  it('flips the sweep under a mirror so the arc still bows the same way', () => {
    const mirrored = transformPath(quarter, parseSvgTransform('scale(1,-1)'));
    expect(mirrored).toBe('M 10 0 A 10 10 0 0 0 0 -10');
    // the mirrored arc passes through the mirrored midpoint, not the chord's other side
    const pts = samplePathToPolyline(mirrored, 0.5, true);
    const near = pts.some(p => Math.hypot(p.x - 7.071, p.y + 7.071) < 0.2);
    expect(near).toBe(true);
  });

  it('keeps a rotated arc on its circle', () => {
    const turned = transformPath(quarter, parseSvgTransform('rotate(90)'));
    const pts = samplePathToPolyline(turned, 0.5, true);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 3);
  });
});
