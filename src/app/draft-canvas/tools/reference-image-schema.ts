import { NamedReferenceImage, ReferenceImage } from '../../models/types';
import { ImageShape, makeShapeId } from './toolbox-shape';
import { ImageAssetStore } from './image-asset-store';

/**
 * The boundary between the recipe *file format* and the canvas's own object model.
 *
 * Recipes — both the built-in templates in ceruti-templates.ts and every `.json` a user has
 * saved — describe reference images as a `referenceImages` array of `NamedReferenceImage`, with
 * the pixels inline as an `href` (a `data:` URL for an upload, a path like `/StradGoetz.jpg` for
 * an image a template ships with). The canvas works in `ImageShape`s that carry only an
 * `imageRef` into ImageAssetStore.
 *
 * Keeping that translation in one place is what lets the file format stay frozen while the canvas
 * side was rewritten: no template needed editing, old files still load (including the long-
 * deprecated singular `referenceImage`), and saves still emit exactly the same field, so a file
 * written today still opens in an older build.
 */

/** The subset of a recipe this module reads. Structural, so it accepts RecipeInterface, any
 * template object, and the raw parsed JSON of a saved file alike. */
export type ReferenceImageSource = {
  referenceImages?: NamedReferenceImage[] | null;
  /** @deprecated singular pre-multi-image field; folded into the array on load. */
  referenceImage?: ReferenceImage | null;
};

/**
 * Reads a recipe's reference images into canvas shapes, interning each image's pixels into
 * `assets` and returning shapes that point at them. Never mutates `source`.
 *
 * A legacy singular `referenceImage` is folded in as a one-element list; a blank one (empty
 * `href`, which some older saves carry as a placeholder) is dropped rather than becoming an
 * invisible zero-size shape the user can't find.
 */
export function imageShapesFromRecipe(
  source: ReferenceImageSource | null | undefined,
  assets: ImageAssetStore,
): ImageShape[] {
  if (!source) return [];

  const entries: NamedReferenceImage[] = Array.isArray(source.referenceImages)
    ? source.referenceImages
    : source.referenceImage?.href
      ? [source.referenceImage as NamedReferenceImage]
      : [];

  return entries
    .filter(entry => !!entry?.href)
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
      };
      return shape;
    });
}

/**
 * Converts canvas shapes back into the recipe field, resolving each `imageRef` to the href it was
 * interned from. Shapes whose asset has gone missing are skipped rather than written out with an
 * empty href, which would fail to load as anything but an invisible box.
 *
 * `xlink:href` is emitted alongside `href` because that's what the format has always contained,
 * and dropping it would break files opened in an older build.
 */
export function imageShapesToRecipe(
  shapes: ImageShape[],
  assets: ImageAssetStore,
): NamedReferenceImage[] {
  const out: NamedReferenceImage[] = [];
  for (const shape of shapes) {
    const href = assets.href(shape.imageRef);
    if (!href) continue;
    out.push({
      id: shape.id,
      label: shape.label,
      href,
      'xlink:href': href,
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
    });
  }
  return out;
}
