import { ReferenceImage } from '../../models/types';
import { ImageShape, makeShapeId } from './toolbox-shape';
import { ImageAssetStore } from './image-asset-store';

/**
 * The boundary between the recipe *file format* and the canvas's own object model.
 *
 * Recipes describe reference images as a `referenceImages` array of `ReferenceImage`, pixels
 * inline as an `href` (a `data:` URL for an upload, a path like `/StradGoetz.jpg` for one a
 * template ships with). The canvas works in `ImageShape`s carrying only an `imageRef` into
 * ImageAssetStore.
 *
 * Keeping that translation in one place is what lets the file format stay put while the canvas
 * side changes.
 */

/** The subset of a recipe this module reads. Structural, so it accepts RecipeInterface, any
 * template object, and the raw parsed JSON of a saved file alike. */
export type ReferenceImageSource = {
  referenceImages?: ReferenceImage[] | null;
};

/**
 * Reads a recipe's reference images into canvas shapes, interning each image's pixels into
 * `assets` and returning shapes that point at them. Never mutates `source`.
 */
export function imageShapesFromRecipe(
  source: ReferenceImageSource | null | undefined,
  assets: ImageAssetStore,
): ImageShape[] {
  return (source?.referenceImages ?? [])
    .map((entry, i) => {
      const shape: ImageShape = {
        // Reuse the file's id when it has one, so re-saving doesn't churn ids in the JSON diff.
        id: entry.id || makeShapeId(),
        type: 'image',
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        rotationDeg: entry.rotationDeg,
        imageRef: assets.intern(entry.href),
        label: entry.label || `Img ${i + 1}`,
        opacity: entry.opacity,
        suppressWhite: entry.suppressWhite,
        mirrored: entry.mirrored,
        hidden: entry.hidden,
        // An absent `locked` means locked — so the built-in templates and every file saved before
        // the field existed open protected. See ImageShape.locked.
        locked: entry.locked ?? true,
        // copied, not shared, so editing the shape can't reach back into the template constant.
        panels: entry.panels ? [...entry.panels] : undefined,
        excludePanels: entry.excludePanels ? [...entry.excludePanels] : undefined,
        isDefault: entry.isDefault,
        crop: entry.crop ? { ...entry.crop } : undefined,
        credit: entry.credit ? { ...entry.credit } : undefined,
      };
      return shape;
    });
}

/**
 * Converts canvas shapes back into the recipe field, resolving each `imageRef` to the href it was
 * interned from. Shapes whose asset has gone missing are skipped rather than written out with an
 * empty href, which would fail to load as anything but an invisible box.
 */
export function imageShapesToRecipe(
  shapes: ImageShape[],
  assets: ImageAssetStore,
): ReferenceImage[] {
  const out: ReferenceImage[] = [];
  for (const shape of shapes) {
    const href = assets.href(shape.imageRef);
    if (!href) continue;
    out.push({
      id: shape.id,
      label: shape.label,
      href,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rotationDeg: shape.rotationDeg ?? 0,
      opacity: shape.opacity,
      suppressWhite: shape.suppressWhite,
      mirrored: shape.mirrored,
      hidden: shape.hidden,
      // Written explicitly rather than left absent, so an image the user deliberately unlocked
      // reopens unlocked instead of silently re-locking under the absent-means-locked default.
      locked: shape.locked ?? true,
      // this result replaces `referenceImages` wholesale on every change, so anything not
      // written back here is erased the first time the user touches the canvas.
      panels: shape.panels ? [...shape.panels] : undefined,
      excludePanels: shape.excludePanels ? [...shape.excludePanels] : undefined,
      isDefault: shape.isDefault,
      crop: shape.crop ? { ...shape.crop } : undefined,
      credit: shape.credit ? { ...shape.credit } : undefined,
    });
  }
  return out;
}
