import { ImageShape, applyImageCrop, imageCenter, imageSourceBox, isCropped } from './toolbox-shape';
import { rotatePointAbout } from '../../helpers/draftMath';
import { ImageCrop } from '../../models/types';

/**
 * Cropping a reference image. The one property everything else rests on is that trimming an edge
 * doesn't move or rescale what's left — you scale a photo to a real measurement first and crop it
 * to fit a panel second, and a crop that slid or resized the picture would silently undo the
 * measurement you set.
 *
 * Expressed here as: whatever the crop, the source picture stays in the same place at the same
 * size. That is the whole invariant, since the box is derived from the source rather than the
 * other way round (see ImageCrop).
 */
describe('reference image cropping', () => {
  const shape = (over: Partial<ImageShape> = {}): ImageShape => ({
    id: 'img', type: 'image', x: 10, y: 20, width: 200, height: 120,
    imageRef: 'ref', label: 'Profiles', ...over,
  });

  const cropped = (base: ImageShape, crop: ImageCrop | undefined): ImageShape =>
    ({ ...base, ...applyImageCrop(base, crop) } as ImageShape);

  /** Where a point of the source picture — given as fractions across and up it — lands on the
   * canvas. This is what has to stay put, and it's the only thing that has to. */
  const worldPointInPicture = (s: ImageShape, u: number, v: number) => {
    const src = imageSourceBox(s);
    return rotatePointAbout(
      { x: src.x + u * src.width, y: src.y + v * src.height },
      imageCenter(s),
      s.rotationDeg ?? 0,
    );
  };

  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

  it('leaves an uncropped image reading exactly as its box', () => {
    const s = shape();
    expect(imageSourceBox(s)).toEqual({ x: 10, y: 20, width: 200, height: 120 });
  });

  it('shrinks the box to the part still showing', () => {
    const s = cropped(shape(), { left: 0.25, top: 0, right: 0.25, bottom: 0 });
    near(s.width, 100);
    near(s.height, 120);
    near(s.x, 60);
    near(s.y, 20);
  });

  it('keeps the source picture where it was, at the size it was', () => {
    const base = shape();
    const before = imageSourceBox(base);
    const after = imageSourceBox(cropped(base, { left: 0.3, top: 0.1, right: 0.05, bottom: 0.2 }));

    near(after.x, before.x);
    near(after.y, before.y);
    near(after.width, before.width);
    near(after.height, before.height);
  });

  it('keeps it there through a second, tighter crop', () => {
    const base = shape();
    const before = imageSourceBox(base);
    const once = cropped(base, { left: 0.2, top: 0, right: 0, bottom: 0 });
    const after = imageSourceBox(cropped(once, { left: 0.4, top: 0.1, right: 0.1, bottom: 0 }));

    near(after.x, before.x);
    near(after.width, before.width);
    near(after.height, before.height);
  });

  // The awkward case: rotation turns the box about its own centre, and cropping moves that
  // centre. Without the correction in applyImageCrop the picture swings as you trim.
  it('keeps it there on a rotated image too', () => {
    const base = shape({ rotationDeg: 37 });
    const before = worldPointInPicture(base, 0.8, 0.65);
    const after = worldPointInPicture(cropped(base, { left: 0.3, top: 0.15, right: 0, bottom: 0.1 }), 0.8, 0.65);

    near(after.x, before.x);
    near(after.y, before.y);
  });

  it('restores the original box when the crop is cleared', () => {
    const base = shape({ rotationDeg: 12 });
    const round = cropped(cropped(base, { left: 0.2, top: 0.3, right: 0.1, bottom: 0.05 }), undefined);

    near(round.x, base.x);
    near(round.y, base.y);
    near(round.width, base.width);
    near(round.height, base.height);
    expect(round.crop).toBeUndefined();
  });

  it('stores an all-zero crop as no crop at all, so "is it cropped" stays a presence check', () => {
    const s = cropped(shape(), { left: 0, top: 0, right: 0, bottom: 0 });
    expect(s.crop).toBeUndefined();
    expect(isCropped(s.crop)).toBe(false);
  });

  it('never lets opposite edges take the whole picture', () => {
    const s = cropped(shape(), { left: 0.9, top: 0, right: 0.9, bottom: 0 });
    expect(s.width).toBeGreaterThan(0);
    expect(s.crop!.left + s.crop!.right).toBeLessThan(1);
    // Scaled back together rather than one clamped, so the answer doesn't depend on which edge
    // was typed into last.
    near(s.crop!.left, s.crop!.right);
  });

  it('ignores a non-finite inset rather than producing a NaN box', () => {
    const s = cropped(shape(), { left: Number.NaN, top: 0, right: 0.1, bottom: 0 });
    expect(Number.isFinite(s.width)).toBe(true);
    expect(Number.isFinite(s.x)).toBe(true);
  });
});
