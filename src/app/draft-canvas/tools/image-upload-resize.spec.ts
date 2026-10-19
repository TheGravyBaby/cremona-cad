// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { imageFromClipboard, planUploadResize } from './image-asset-store';

// The canvas half of prepareUploadedImage can't run under jsdom (no getContext), so what's
// pinned here is the decision: when an upload is left alone, and what it's scaled to when not.
describe('planUploadResize', () => {
  const SMALL = 200_000;
  const BIG = 4_000_000;

  it('leaves a small, modest-resolution image untouched', () => {
    // a clean line drawing — re-encoding this only costs it sharp edges
    expect(planUploadResize(560, 800, SMALL)).toBeNull();
  });

  it('scales a phone photo down to the cap on its long edge', () => {
    expect(planUploadResize(4032, 3024, BIG)).toEqual({ width: 2400, height: 1800 });
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

describe('imageFromClipboard', () => {
  const clipboard = (items: Record<string, string>, files: File[] = []) =>
    ({ getData: (type: string) => items[type] ?? '', files });
  const png = new File([new Uint8Array(8)], 'image.png', { type: 'image/png' });

  it('takes both the picture and its address from a browser\'s "Copy image"', () => {
    const got = imageFromClipboard(clipboard({ 'text/html': '<meta charset="utf-8"><img src="https://x.org/a.jpg?w=1&amp;h=2" alt="">' }, [png]));
    expect(got).toEqual({ url: 'https://x.org/a.jpg?w=1&h=2', file: png });
  });

  it('takes a pasted address on its own', () => {
    expect(imageFromClipboard(clipboard({ 'text/plain': '  https://x.org/a.jpg\n' }))).toEqual({ url: 'https://x.org/a.jpg', file: undefined });
  });

  it('ignores prose and files that are not images', () => {
    const pdf = new File([new Uint8Array(8)], 'plan.pdf', { type: 'application/pdf' });
    expect(imageFromClipboard(clipboard({ 'text/plain': 'see https://x.org/a.jpg for the scroll' }, [pdf]))).toBeNull();
  });
});
