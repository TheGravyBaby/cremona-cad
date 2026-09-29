import { PathShape } from './toolbox-shape';
import { distanceToShape, shapeBounds } from './shape-hit-test';
import { translateShape } from './shape-transform';
import { endpointGrabbers, moveGrabberPosition } from './shape-grabbers';

describe('PathShape', () => {
  // a quarter circle of radius 10 about the origin, from (10,0) up to (0,10)
  const quarter: PathShape = { id: 'q', type: 'path', d: 'M 10 0 A 10 10 0 0 1 0 10' };
  const square: PathShape = { id: 's', type: 'path', d: 'M 0 0 L 20 0 L 20 20 L 0 20 Z' };

  it('is hit along its curve and not across the chord', () => {
    expect(distanceToShape({ x: 7.07, y: 7.07 }, quarter)).toBeLessThan(0.1);
    expect(distanceToShape({ x: 0, y: 0 }, quarter)).toBeCloseTo(10, 0);
    expect(distanceToShape({ x: 10, y: 10 }, square)).toBeCloseTo(10, 0);
    expect(distanceToShape({ x: 20, y: 5 }, square)).toBeLessThan(0.01);
  });

  it('is hit at the far end of an open path', () => {
    expect(distanceToShape({ x: 0, y: 10 }, quarter)).toBeLessThan(0.01);
  });

  it('bounds the drawn curve, not its control geometry', () => {
    const b = shapeBounds(quarter);
    expect(b.x0).toBeCloseTo(0, 1);
    expect(b.y0).toBeCloseTo(0, 1);
    expect(b.x1).toBeCloseTo(10, 1);
    expect(b.y1).toBeCloseTo(10, 1);
    expect(shapeBounds(square)).toEqual({ x0: 0, y0: 0, x1: 20, y1: 20 });
  });

  it('translates by rewriting its path data', () => {
    const moved = translateShape(square, 5, -3) as PathShape;
    expect(shapeBounds(moved)).toEqual({ x0: 5, y0: -3, x1: 25, y1: 17 });
    expect(translateShape(square, 0, 0)).toBe(square);
  });

  it('moves as a rigid body with no handles', () => {
    expect(moveGrabberPosition(square)).toBeNull();
    expect(endpointGrabbers(square, 1.5)).toBeNull();
  });

  it('tolerates path data it cannot parse', () => {
    const broken: PathShape = { id: 'b', type: 'path', d: 'not a path' };
    expect(distanceToShape({ x: 1, y: 1 }, broken)).toBe(Infinity);
    expect(shapeBounds(broken)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });
});
