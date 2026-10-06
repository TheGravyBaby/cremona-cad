// @vitest-environment node
import { reflectAcross, rotateAbout, scaleAbout, transformShape } from './shape-transform';
import { ArcShape, DimensionShape, ImageShape, PathShape, RectShape, TextShape } from './toolbox-shape';
import { dimensionGeometry } from './toolbox-shape';
import { applyMatrix } from '../../helpers/math/pathMath';

describe('transformShape', () => {
  const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  };
  const arcEnds = (arc: ArcShape) => [arc.startAngle, arc.endAngle].map(t => ({
    x: arc.center.x + arc.radius * Math.cos(t), y: arc.center.y + arc.radius * Math.sin(t),
  }));
  const sweep = (arc: ArcShape) => ((arc.endAngle - arc.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const quarter: ArcShape = { id: 'a', type: 'arc', center: { x: 10, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2 };

  // the same quarter must come back, not the three-quarter complement a naive angle flip gives
  it.each([
    ['a vertical mirror', reflectAcross({ x: 0, y: 0 }, Math.PI / 2)],
    ['a slanted mirror', reflectAcross({ x: 1, y: 2 }, 0.7)],
    ['a rotation', rotateAbout({ x: 3, y: -1 }, 2)],
  ])('keeps an arc the same sweep under %s', (_, m) => {
    const out = transformShape(quarter, m) as ArcShape;
    const [s, e] = arcEnds(quarter).map(p => applyMatrix(m, p));
    const [s2, e2] = arcEnds(out);
    const mirrored = m[0] * m[3] - m[1] * m[2] < 0;
    close(s2, mirrored ? e : s);
    close(e2, mirrored ? s : e);
    expect(sweep(out)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('scales an arc radius with the drawing', () => {
    expect((transformShape(quarter, scaleAbout({ x: 0, y: 0 }, 2)) as ArcShape).radius).toBe(10);
  });

  it('keeps a dimension line on the mirrored side of its measurement', () => {
    const dim: DimensionShape = { id: 'd', type: 'dimension', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, offset: 4 };
    const out = transformShape(dim, reflectAcross({ x: 20, y: 0 }, Math.PI / 2)) as DimensionShape;
    close(dimensionGeometry(out.start, out.end, out.offset)!.mid, { x: 35, y: 4 });
  });

  it('reflects path data and flips its arc sweeps', () => {
    const path: PathShape = { id: 'p', type: 'path', d: 'M 1 0 A 1 1 0 0 1 0 1' };
    const out = transformShape(path, reflectAcross({ x: 0, y: 0 }, Math.PI / 2)) as PathShape;
    expect(out.d).toBe('M -1 0 A 1 1 0 0 0 0 1');
  });

  it('keeps a quarter-turned rect a rect, and makes any other turn a path with the same id', () => {
    const rect: RectShape = { id: 'r', type: 'rect', p1: { x: 0, y: 0 }, p2: { x: 4, y: 2 }, dashed: true, layerId: 'L' };
    const turned = transformShape(rect, rotateAbout({ x: 0, y: 0 }, Math.PI / 2)) as RectShape;
    expect(turned.type).toBe('rect');
    close(turned.p2, { x: -2, y: 4 });

    const slanted = transformShape(rect, rotateAbout({ x: 0, y: 0 }, 0.3));
    expect(slanted).toMatchObject({ id: 'r', type: 'path', dashed: true, layerId: 'L' });
    expect(Object.keys(slanted!)).not.toContain('p1');
  });

  it('keeps text reading forwards along its reflected baseline, and scales its size', () => {
    const text: TextShape = { id: 't', type: 'text', position: { x: 3, y: 1 }, text: 'f', rotationDeg: 30 };
    const mirrored = transformShape(text, reflectAcross({ x: 0, y: 0 }, Math.PI / 2)) as TextShape;
    close(mirrored.position, { x: -3, y: 1 });
    expect(mirrored.rotationDeg).toBeCloseTo(-30, 9);

    const scaled = transformShape({ ...text, fontSize: 5 }, scaleAbout({ x: 0, y: 0 }, 2)) as TextShape;
    expect(scaled.fontSize).toBeCloseTo(10, 9);
    expect(scaled.rotationDeg).toBeCloseTo(30, 9);
  });

  it('turns and sizes an image about its centre, but never mirrors one', () => {
    const image: ImageShape = { id: 'i', type: 'image', x: 0, y: 0, width: 4, height: 2, imageRef: 'r', label: '' };
    const out = transformShape(image, scaleAbout({ x: 2, y: 1 }, 2)) as ImageShape;
    expect(out).toMatchObject({ x: -2, y: -1, width: 8, height: 4 });
    expect((transformShape(image, rotateAbout({ x: 2, y: 1 }, Math.PI / 2)) as ImageShape).rotationDeg).toBeCloseTo(90, 9);
    expect(transformShape(image, reflectAcross({ x: 0, y: 0 }, 0))).toBeNull();
  });
});
