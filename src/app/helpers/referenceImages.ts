import { NamedReferenceImage, ReferenceImage } from '../models/types';

let refIdSeq = 0;

/** Generates a stable-enough unique id for a reference-image tab. */
export function makeReferenceImageId(): string {
  refIdSeq += 1;
  return `ref-${Date.now().toString(36)}-${refIdSeq.toString(36)}`;
}

/** Wraps a bare ReferenceImage in tab identity (id + label). */
export function toNamedReferenceImage(img: ReferenceImage, label: string): NamedReferenceImage {
  return { ...img, id: makeReferenceImageId(), label };
}

/**
 * Returns a recipe's reference images as a normalized array, folding the
 * legacy singular `referenceImage` field into a one-element list. Never
 * mutates the source; every returned entry is a fresh object with a
 * guaranteed id and label so callers can edit it freely.
 */
export function normalizeReferenceImages(
  source:
    | { referenceImages?: NamedReferenceImage[] | null; referenceImage?: ReferenceImage | null }
    | null
    | undefined,
): NamedReferenceImage[] {
  if (!source) return [];

  if (Array.isArray(source.referenceImages)) {
    return source.referenceImages.map((img, i) => ({
      ...img,
      id: img.id || makeReferenceImageId(),
      label: img.label || `Img ${i + 1}`,
    }));
  }

  // A blank legacy placeholder (empty href) is not a real image — drop it.
  if (source.referenceImage && source.referenceImage.href) {
    return [toNamedReferenceImage(source.referenceImage, 'Img 1')];
  }

  return [];
}
