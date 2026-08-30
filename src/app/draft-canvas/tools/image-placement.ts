import { Pt } from '../../models/types';
import { ImageShape, makeShapeId } from './toolbox-shape';

/** Width a placed image falls back to when no recipe has set design bounds yet. */
const FALLBACK_WIDTH_MM = 200;

/**
 * Sizes a newly placed image to sit over the design it will be traced against: fitted inside the
 * recipe's bounds, aspect preserved, centered on them. That's the workflow this exists for — drop
 * a photo of an instrument onto the drawing, then scale it to real dimensions off the axis or the
 * bounding box. Once placed it's an ordinary selected shape, so nudging or resizing from there
 * needs nothing image-specific.
 */
function fitToBounds(
  naturalW: number, naturalH: number, bounds: { pt1: Pt; pt2: Pt } | null,
): { x: number; y: number; width: number; height: number } {
  const aspect = naturalW / naturalH || 1;

  if (!bounds) {
    const width = FALLBACK_WIDTH_MM;
    const height = width / aspect;
    return { x: -width / 2, y: 0, width, height };
  }

  const boundsW = Math.abs(bounds.pt2.x - bounds.pt1.x);
  const boundsH = Math.abs(bounds.pt2.y - bounds.pt1.y);
  const centerX = (bounds.pt1.x + bounds.pt2.x) / 2;
  const centerY = (bounds.pt1.y + bounds.pt2.y) / 2;

  const width = boundsW / boundsH > aspect ? boundsH * aspect : boundsW;
  const height = boundsW / boundsH > aspect ? boundsH : boundsW / aspect;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/**
 * Builds the shape for a reference image — a photo, scan or drawing to trace over — about to be
 * placed on the canvas. Nothing else lives here: moving, resizing, rotating, deleting and undoing
 * a placed image are all the generic shape machinery.
 *
 * The pixels never touch the shape: `imageRef` points into ImageAssetStore, which keeps base64
 * payloads out of undo history and sessionStorage.
 *
 * This was a palette tool until the reference-image controls were gathered into the bottom bar's
 * image list. It never behaved like one — its input was a file rather than a click, so it did its
 * whole job in onActivate and handed control straight back — and having the same feature reachable
 * from two places meant two ways to place an image and only one of them next to the list of what
 * you had placed. What survives the tool is this function; draft-canvas calls it.
 */
export function placedImageShape(
  imageRef: string,
  naturalWidth: number,
  naturalHeight: number,
  bounds: { pt1: Pt; pt2: Pt } | null,
  existingImageCount: number,
): ImageShape {
  return {
    id: makeShapeId(),
    type: 'image',
    ...fitToBounds(naturalWidth, naturalHeight, bounds),
    rotationDeg: 0,
    imageRef,
    // Numbered like the recipe loader's own default (see reference-image-schema.ts), so several
    // placed images are told apart in the image list without renaming each one first.
    label: `Img ${existingImageCount + 1}`,
    // Explicitly unlocked, against the absent-means-locked default: you add an image in order to
    // position and scale it, so it has to be grabbable straight away. It saves as unlocked and
    // can be locked from the image list or the settings bar once it's placed.
    locked: false,
  };
}
