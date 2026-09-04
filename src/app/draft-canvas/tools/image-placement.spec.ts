import { describe, expect, it } from 'vitest';
import { placedImageShape } from './image-placement';

// a newly added image arrives fitted over the drawing it will be traced against.
describe('placedImageShape', () => {
  const bounds = { pt1: { x: -100, y: 0 }, pt2: { x: 100, y: 350 } };

  it('centers a placed image on the design bounds', () => {
    const shape = placedImageShape('ref', 400, 700, bounds, 0);
    expect(shape.x + shape.width / 2).toBeCloseTo(0);
    expect(shape.y + shape.height / 2).toBeCloseTo(175);
  });

  it('fits inside the bounds on whichever axis binds, keeping the aspect', () => {
    // a wide photo against a tall body: the width runs out first
    const wide = placedImageShape('ref', 1000, 250, bounds, 0);
    expect(wide.width).toBeCloseTo(200);
    expect(wide.height).toBeCloseTo(50);
    expect(wide.height).toBeLessThanOrEqual(350);

    // a portrait scan of a violin back: the height runs out first
    const tall = placedImageShape('ref', 400, 1400, bounds, 0);
    expect(tall.height).toBeCloseTo(350);
    expect(tall.width).toBeCloseTo(100);
    expect(tall.width).toBeLessThanOrEqual(200);
  });

  it('falls back to a visible size on an empty canvas', () => {
    const shape = placedImageShape('ref', 800, 400, null, 0);
    expect(shape.width).toBeCloseTo(200);
    expect(shape.height).toBeCloseTo(100);
    // straddling the centerline, sitting on the origin — where the drawing will appear
    expect(shape.x + shape.width / 2).toBeCloseTo(0);
    expect(shape.y).toBeCloseTo(0);
  });

  it('arrives unlocked and numbered past the images already placed', () => {
    const shape = placedImageShape('ref', 400, 700, bounds, 2);
    expect(shape.locked).toBe(false);
    expect(shape.label).toBe('Img 3');
    expect(shape.imageRef).toBe('ref');
    expect(shape.rotationDeg).toBe(0);
  });
});
