import { describe, expect, it } from 'vitest';
import { ImageShape, applyImageCrop, applyImageSize, imageAspect } from './toolbox-shape';
import { withEndpoint } from './shape-grabbers';

// A reference image is a photograph of a real object being measured against, so it is never
// skewed by a resize — every path that changes one dimension takes the other from the box's own
// proportions. What's pinned here is that invariant, from each of the three ways to resize one.
describe('resizing a reference image', () => {
  const base = (over: Partial<ImageShape> = {}): ImageShape => ({
    id: 'i1', type: 'image', x: 0, y: 0, width: 200, height: 100,
    rotationDeg: 0, imageRef: 'ref', label: 'Img 1', ...over,
  });

  const asImage = (s: unknown) => s as ImageShape;

  it('holds the proportions when a width is typed', () => {
    const next = applyImageSize(base(), 'width', 50) as ImageShape;
    expect(next.width).toBeCloseTo(50);
    expect(next.height).toBeCloseTo(25);
  });

  it('holds the proportions when a height is typed', () => {
    const next = applyImageSize(base(), 'height', 400) as ImageShape;
    expect(next.height).toBeCloseTo(400);
    expect(next.width).toBeCloseTo(800);
  });

  it('scales about the centre, so a rotated image stays where it was lined up', () => {
    const shape = base({ x: 10, y: 40, rotationDeg: 37 });
    const next = applyImageSize(shape, 'width', 60) as ImageShape;
    // the centre is the rotation pivot, so holding it holds the whole placement
    expect(next.x + next.width / 2).toBeCloseTo(10 + 100);
    expect(next.y + next.height / 2).toBeCloseTo(40 + 50);
  });

  // The reported bug: dragging an edge handle inwards squashed the picture, because shrinking
  // was exempt from the proportional path that growing already took.
  it('holds the proportions when an edge handle is dragged inwards', () => {
    const shape = base();
    for (const [key, pos] of [
      ['e', { x: 60, y: 50 }],
      ['w', { x: 140, y: 50 }],
      ['n', { x: 100, y: 30 }],
      ['s', { x: 100, y: 70 }],
    ] as const) {
      const next = asImage(withEndpoint(shape, key, pos));
      expect(imageAspect(next), `dragging ${key} inwards`).toBeCloseTo(2);
      expect(next.width).toBeLessThan(shape.width);
    }
  });

  it('holds the proportions when an edge handle is dragged outwards', () => {
    const next = asImage(withEndpoint(base(), 'e', { x: 400, y: 50 }));
    expect(imageAspect(next)).toBeCloseTo(2);
    expect(next.width).toBeGreaterThan(200);
  });

  it('leaves the opposite edge where it was on an edge drag', () => {
    // dragging 'e' pins the west edge; the box only spreads across the other axis
    const next = asImage(withEndpoint(base(), 'e', { x: 120, y: 50 }));
    expect(next.x).toBeCloseTo(0);
    expect(next.x + next.width).toBeCloseTo(120);
  });

  it('holds the proportions when a corner handle is dragged', () => {
    for (const [key, pos] of [
      ['ne', { x: 40, y: 90 }],
      ['sw', { x: 170, y: 20 }],
    ] as const) {
      expect(imageAspect(asImage(withEndpoint(base(), key, pos))), `dragging ${key}`).toBeCloseTo(2);
    }
  });

  // A crop leaves the box at the cropped picture's proportions, and those are what the next
  // resize has to hold — reading the ratio off the box rather than the source pixels is what
  // makes that work without cropping and resizing having to know about each other.
  it('holds the cropped proportions, not the original ones', () => {
    const cropped = { ...base(), ...applyImageCrop(base(), { left: 0.5, top: 0, right: 0, bottom: 0 }) };
    expect(imageAspect(cropped)).toBeCloseTo(1);

    const typed = applyImageSize(cropped, 'width', 30) as ImageShape;
    expect(typed.height).toBeCloseTo(30);

    const dragged = asImage(withEndpoint(cropped, 'e', { x: cropped.x + 40, y: 50 }));
    expect(imageAspect(dragged)).toBeCloseTo(1);
  });
});
