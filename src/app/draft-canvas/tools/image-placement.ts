import { Pt } from '../../models/types';
import { ImageShape, makeShapeId } from './toolbox-shape';

/** Width a placed image falls back to when no recipe has set design bounds yet. */
const FALLBACK_WIDTH_MM = 200;

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

// imageRef points into ImageAssetStore, so base64 payloads stay out of undo history and sessionStorage.
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
    // numbered like the recipe loader's default, so multiple placed images are told apart.
    label: `Img ${existingImageCount + 1}`,
    // explicit, since absent means locked by default and a just-placed image must be grabbable.
    locked: false,
  };
}
