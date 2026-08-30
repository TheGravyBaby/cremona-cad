import { describe, expect, it } from 'vitest';
import { planUploadResize } from './image-asset-store';

// The canvas half of prepareUploadedImage can't run under jsdom (no getContext), so what's
// pinned here is the decision: when an upload is left alone, and what it's scaled to when not.
describe('planUploadResize', () => {
  const SMALL = 200_000;
  const BIG = 4_000_000;

  it('leaves a small, modest-resolution image untouched', () => {
    // a clean line drawing — re-encoding this only costs it sharp edges
    expect(planUploadResize(560, 800, SMALL)).toBeNull();
  });

  it('leaves an image alone right up to the cap', () => {
    expect(planUploadResize(2400, 1600, SMALL)).toBeNull();
  });

  it('scales a phone photo down to the cap on its long edge', () => {
    expect(planUploadResize(4032, 3024, BIG)).toEqual({ width: 2400, height: 1800 });
  });

  it('caps the long edge whichever way the image is turned', () => {
    // a cello scan is portrait; the cap has to follow the height, not the width
    expect(planUploadResize(1500, 2500, BIG)).toEqual({ width: 1440, height: 2400 });
  });

  it('preserves aspect ratio to within a pixel of rounding', () => {
    const plan = planUploadResize(4000, 2251, BIG)!;
    expect(Math.abs(plan.width / plan.height - 4000 / 2251)).toBeLessThan(0.001);
  });

  it('re-encodes at the original size when a small image carries a large payload', () => {
    // under the cap, so nothing to scale — but 8MB of it still has to be re-encoded
    expect(planUploadResize(1200, 900, 8_000_000)).toEqual({ width: 1200, height: 900 });
  });

  it('never plans a zero dimension for an extreme aspect ratio', () => {
    const plan = planUploadResize(12000, 3, BIG)!;
    expect(plan.width).toBe(2400);
    expect(plan.height).toBeGreaterThanOrEqual(1);
  });

  it('returns null for an image that failed to measure', () => {
    expect(planUploadResize(0, 0, BIG)).toBeNull();
    expect(planUploadResize(NaN, NaN, BIG)).toBeNull();
  });
});
