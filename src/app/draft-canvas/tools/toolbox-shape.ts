import { ImageCredit, ImageCrop, Pt } from '../../models/types';
import { rotatePointAbout } from '../../helpers/draftMath';

export const DEFAULT_SHAPE_COLOR = '#1d4ed8';

// Properties shared by every shape type, regardless of geometry — extend here
// as more per-object properties (stroke width, ...) are added.
type ShapeBase = {
  id: string;
  color?: string;
  // Missing on shapes persisted before layers existed — treat as DEFAULT_LAYER_ID
  // (see layer.ts) rather than migrating stored data.
  layerId?: string;
};

export type LineShape = ShapeBase & {
  type: 'line';
  start: Pt;
  end: Pt;
  dashed?: boolean;
};

/**
 * Counterclockwise-sweep convention: the arc runs CCW from `startAngle` to `endAngle`, so the
 * ordering of the two angles selects minor vs major between the same pair of boundary points —
 * swapping them gives the *other* arc. See arcPathData and pickArcOrientation in draftMath.ts.
 *
 * Deliberately **not** the convention of models/types.ts's `Arc`, which always renders the minor
 * arc; converting this type to that one is lossy past 180°.
 */
export type ArcShape = ShapeBase & {
  type: 'arc';
  center: Pt;
  radius: number;
  startAngle: number; // radians
  endAngle: number; // radians
  showCenterGuides?: boolean; // "fancy" arc: dashed radius lines + crosshair at center
};

export type CircleShape = ShapeBase & {
  type: 'circle';
  center: Pt;
  radius: number;
  dashed?: boolean;
};

// A measured distance. `start`/`end` are the two points being measured and are the only thing the
// number reads from; the dimension line that carries that number is free to sit somewhere else.
export type DimensionShape = ShapeBase & {
  type: 'dimension';
  start: Pt;
  end: Pt;
  /**
   * How far off the measured segment the dimension line and its text are drawn, in mm, signed
   * along the segment's left normal (see dimensionGeometry). This is what lets several
   * measurements of the same feature stack clear of the drawing and of each other instead of
   * lying across it.
   *
   * Undefined means zero, which is exactly what a dimension drawn before the offset existed looks
   * like — so old shapes need no migration, and the Distance tool still omits the field entirely
   * when the third click lands back on the measurement.
   */
  offset?: number;
};

export type RectShape = ShapeBase & {
  type: 'rect';
  p1: Pt;
  p2: Pt; // opposite corner — the box is axis-aligned between p1 and p2
  dashed?: boolean;
};

// A line divided into weighted ratio segments, alternating `color`/`color2` per
// segment — for illustrating ratios (e.g. vesica radius-to-gap) the way
// helpers/renderFuncs.ts's renderBoxLine does for recipe drafts (that legacy
// renderer keeps its own name — it's a separate feature).
export type SectionShape = ShapeBase & {
  type: 'section';
  start: Pt;
  end: Pt;
  weights: number[];
  color2: string;
  label: boolean;
};

// A free-floating text annotation, anchored at a single point — independent
// of any other shape, unlike the auto-generated labels on Dimension/Section.
export type TextShape = ShapeBase & {
  type: 'text';
  position: Pt;
  text: string;
  /**
   * Font size in world mm. Deliberately *not* the screen-constant sizing Dimension and Section
   * labels use: a label written onto a drawing is part of the drawing, so it has to hold its
   * proportion against the geometry as the camera zooms. Undefined means DEFAULT_TEXT_SIZE_MM.
   */
  fontSize?: number;
  /** Turned about `position`, degrees CCW in the Y-up world — for reading along a rib or a
   * centerline. Undefined means level. */
  rotationDeg?: number;
};

/**
 * 14px at the default camera of 1.5 px/mm — the size every label happened to render at before
 * text carried a size of its own. Chosen to keep existing annotations looking as they did at
 * the zoom the canvas opens on; nothing records what mm size an older label *meant*, so at any
 * other zoom it necessarily lands somewhere new.
 */
export const DEFAULT_TEXT_SIZE_MM = 9.3;

// A single marked reference point — no geometry beyond its location, for calling
// out or snapping to a spot that isn't already an endpoint/center of something else.
export type PointShape = ShapeBase & {
  type: 'point';
  position: Pt;
};

// A hand-drawn scribble — raw pointer positions sampled during a drag, rendered as a smoothed
// polyline. Annotation only, like Text/Point: moved as a single rigid body rather than edited
// point-by-point, and never a snap candidate (see shape-renderer.ts's `data-no-snap`) since a
// scribble isn't construction geometry a later tool should click onto.
export type FreehandShape = ShapeBase & {
  type: 'freehand';
  points: Pt[];
  /** Screen-pixel stroke width — non-scaling like every other shape's outline (see
   * shape-renderer.ts), so the pen reads the same thickness at any zoom. Undefined means
   * DEFAULT_FREEHAND_WIDTH. */
  strokeWidth?: number;
  /** 0 (invisible) to 1 (opaque). Undefined means opaque — dials a stroke down toward a
   * highlighter-style translucent mark without a separate tool. */
  opacity?: number;
};

export const DEFAULT_FREEHAND_WIDTH = 2;

// A photo or scan placed on the canvas to trace over — an instrument's plan view, a long-arch
// profile, a drawing from a book. Geometry only: the pixels live in ImageAssetStore under
// `imageRef`, so undo snapshots and sessionStorage writes stay cheap (see image-asset-store.ts).
//
// `x`/`y` are the low corner of the *unrotated* box and `rotationDeg` spins it about the box
// center — the same convention the recipe file's `referenceImages` entries use, so
// reference-image-schema.ts converts between the two with no geometry math.
export type ImageShape = ShapeBase & {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  imageRef: string;
  /** Shown in the settings bar and written back out as the file's `label` — how the user tells
   * "plan view" from "long arch" when several are placed. */
  label: string;
  /** Recipe panels this image shows on, by id; absent/empty means every panel. */
  panels?: string[];
  /** Panels this image is deliberately kept off; absolute — beats isDefault and panels alike. */
  excludePanels?: string[];
  /** Marks the set's default view: shows on any panel no other image has claimed by name. */
  isDefault?: boolean;
  /** Part of the source picture shown, as fractions inset per edge; absent means all of it. See
   * imageSourceBox and applyImageCrop. */
  crop?: ImageCrop;
  /** Provenance and licence for the pixels — see ImageCredit. */
  credit?: ImageCredit;
  /** Per-image, unlike the single global slider the old reference popup had. Undefined means
   * DEFAULT_IMAGE_OPACITY, which is what every pre-existing recipe file effectively had. */
  opacity?: number;
  /** Fades the image's background to transparent so a scan reads on a dark canvas — see
   * white-suppression.ts. Undefined means on, matching the old always-on behavior. */
  suppressWhite?: boolean;
  /**
   * Mirrors the image content left-right about its own center. No separate vertical mirror:
   * combined with the already-free `rotationDeg`, one axis reaches every orientation a second
   * would. Purely a rendering flag — the box is untouched, so mirroring doesn't move handles or
   * change hit-testing. Undefined means unmirrored.
   */
  mirrored?: boolean;
  /** Hidden from the canvas, and unselectable while hidden. Per-image, so one reference can be
   * parked without disturbing the others — this is what the old tab strip's active-tab-only
   * display was really for. */
  hidden?: boolean;
  /**
   * Locked images can't be selected, moved or resized on the canvas — a click passes straight
   * through them. **Undefined means locked**, so every template image and every recipe saved
   * before this field existed opens protected: you trace over a reference far more often than you
   * adjust one, and an accidental drag is expensive. The Image tool places new images explicitly
   * unlocked, since you add one in order to scale it.
   */
  locked?: boolean;
  /**
   * Unlike every other shape, an image's `layerId` (inherited from ShapeBase) is unused and never
   * stamped. Images render in their own pass beneath everything, so layer z-order is meaningless
   * for them, and `hidden`/`locked` above give them the two things they'd otherwise borrow from a
   * layer — per image rather than per group. See ToolboxStore.getVisibleImages.
   */
};

/** What an image renders at when its shape doesn't say — the old global reference opacity. */
export const DEFAULT_IMAGE_OPACITY = 0.25;

/**
 * Every shape the canvas can hold. Extend this union as new tools are added.
 *
 * Deliberately plain objects with no methods or getters, and deliberately not built on
 * models/types.ts's `Circle`/`Arc`/`Rectangle` classes. ToolboxStore round-trips this union
 * through JSON constantly (sessionStorage on every edit, plus a 50-deep undo stack), and there is
 * no calc pass here to restore prototypes the way the recipe side has — so anything living on a
 * prototype would survive until the first undo and then vanish. See the note in models/types.ts.
 *
 * Sharing geometry *math* between the two is encouraged: `{ ...center, r: radius }` is
 * structurally a `Circle`, so helpers/draftMath.ts solvers take canvas shapes as-is.
 */
export type DraftShape =
  | LineShape | ArcShape | CircleShape | DimensionShape | RectShape | SectionShape | TextShape | PointShape
  | FreehandShape | ImageShape;

/** An image's box center, about which `rotationDeg` turns it. */
export function imageCenter(shape: ImageShape): Pt {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

// reads the ratio off the box, not the source pixels, so it survives cropping (see
// applyImageCrop) and a hand-authored template out of proportion keeps what it has.
export function imageAspect(shape: ImageShape): number {
  return Math.abs(shape.width / shape.height) || 1;
}

/** Fingerprint of everything drawImageShape's output depends on — lets draft-canvas skip
 * rebuilding (and redecoding) an image whose shape hasn't actually changed since the last draw. */
export function imageRenderKey(shape: ImageShape, href: string): string {
  const crop = shape.crop;
  return [
    href, shape.x, shape.y, shape.width, shape.height, shape.rotationDeg ?? 0,
    shape.opacity ?? DEFAULT_IMAGE_OPACITY, shape.mirrored ?? false,
    crop?.left ?? 0, crop?.top ?? 0, crop?.right ?? 0, crop?.bottom ?? 0,
  ].join('|');
}

// a reference image is never skewed — every resize takes its other dimension from imageAspect.
// sized about the centre, which is also the rotation pivot, so a rotated image stays put.
export function applyImageSize(
  shape: ImageShape, key: 'width' | 'height', value: number,
): Partial<ImageShape> {
  const aspect = imageAspect(shape);
  const width = key === 'width' ? value : value * aspect;
  const height = key === 'width' ? value / aspect : value;
  const center = imageCenter(shape);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/** An image's four corners in world space, rotation applied. Named for the Y-up world, so `sw`
 * is the low-x/low-y corner of the unrotated box. */
export function imageCorners(shape: ImageShape): Record<'sw' | 'se' | 'nw' | 'ne', Pt> {
  const center = imageCenter(shape);
  const deg = shape.rotationDeg ?? 0;
  const x1 = shape.x + shape.width;
  const y1 = shape.y + shape.height;
  return {
    sw: rotatePointAbout({ x: shape.x, y: shape.y }, center, deg),
    se: rotatePointAbout({ x: x1, y: shape.y }, center, deg),
    nw: rotatePointAbout({ x: shape.x, y: y1 }, center, deg),
    ne: rotatePointAbout({ x: x1, y: y1 }, center, deg),
  };
}

// opposite insets are scaled back to leave at least this much showing; zero divides by zero in
// imageSourceBox and leaves nothing to grab.
const MIN_CROP_SPAN = 0.02;

// an all-zero crop is stored as no crop, so "is this cropped" stays a plain presence check.
export function isCropped(crop: ImageCrop | undefined): crop is ImageCrop {
  return !!crop && (crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0);
}

// scales both insets together (not clamping the larger) so the result doesn't depend on which
// one the user just typed into.
function clampCropPair(a: number, b: number): [number, number] {
  const lo = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 0));
  const hi = Math.max(0, Math.min(1, Number.isFinite(b) ? b : 0));
  const total = lo + hi;
  const max = 1 - MIN_CROP_SPAN;
  return total <= max ? [lo, hi] : [lo * (max / total), hi * (max / total)];
}

// the whole source picture's rectangle in the shape's unrotated frame, before crop clips it back
// to the box; equal to the box when uncropped.
export function imageSourceBox(shape: ImageShape): { x: number; y: number; width: number; height: number } {
  if (!isCropped(shape.crop)) {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  const [left, right] = clampCropPair(shape.crop.left, shape.crop.right);
  const [top, bottom] = clampCropPair(shape.crop.top, shape.crop.bottom);
  const width = shape.width / (1 - left - right);
  const height = shape.height / (1 - top - bottom);
  return {
    x: shape.x - left * width,
    // top is the picture's top, the high-y edge here, so bottom is what's below the box.
    y: shape.y - bottom * height,
    width,
    height,
  };
}

// gives `shape` crop `crop` (undefined to uncrop), leaving the retained picture in the same
// place at the same scale and rotation. The only thing that should write `crop`.
export function applyImageCrop(shape: ImageShape, crop: ImageCrop | undefined): Partial<ImageShape> {
  const src = imageSourceBox(shape);
  const [left, right] = clampCropPair(crop?.left ?? 0, crop?.right ?? 0);
  const [top, bottom] = clampCropPair(crop?.top ?? 0, crop?.bottom ?? 0);

  const next = {
    x: src.x + left * src.width,
    y: src.y + bottom * src.height,
    width: src.width * (1 - left - right),
    height: src.height * (1 - top - bottom),
  };

  const oldCenter = imageCenter(shape);
  const newCenter = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
  const spun = rotatePointAbout(newCenter, oldCenter, shape.rotationDeg ?? 0);
  next.x += spun.x - newCenter.x;
  next.y += spun.y - newCenter.y;

  const clamped: ImageCrop = { left, top, right, bottom };
  return { ...next, crop: isCropped(clamped) ? clamped : undefined };
}

/** An image's four edge midpoints in world space, rotation applied. */
export function imageEdgeMidpoints(shape: ImageShape): Record<'n' | 's' | 'e' | 'w', Pt> {
  const center = imageCenter(shape);
  const deg = shape.rotationDeg ?? 0;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  return {
    n: rotatePointAbout({ x: cx, y: shape.y + shape.height }, center, deg),
    s: rotatePointAbout({ x: cx, y: shape.y }, center, deg),
    e: rotatePointAbout({ x: shape.x + shape.width, y: cy }, center, deg),
    w: rotatePointAbout({ x: shape.x, y: cy }, center, deg),
  };
}

/**
 * Where a dimension actually draws, for a given measured pair and offset: the segment's unit
 * direction and left normal, and the dimension line's two ends and midpoint pushed out along that
 * normal. Null for a zero-length measurement, which has no direction to offset along.
 *
 * One definition because the renderer, the handles and hit-testing all have to agree on which side
 * of the measurement a positive offset is, and they each derive it from a different starting point.
 * Takes loose points rather than a shape so the Distance tool can call it mid-gesture, before there
 * is a shape to pass.
 */
export function dimensionGeometry(start: Pt, end: Pt, offset = 0): {
  dir: Pt; normal: Pt; p1: Pt; p2: Pt; mid: Pt; length: number;
} | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;

  const dir = { x: dx / length, y: dy / length };
  const normal = { x: -dir.y, y: dir.x };
  const p1 = { x: start.x + normal.x * offset, y: start.y + normal.y * offset };
  const p2 = { x: end.x + normal.x * offset, y: end.y + normal.y * offset };
  return { dir, normal, p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, length };
}

/** The offset that would put a dimension line under `pt` — the component of pt perpendicular to
 * the measurement, so sliding the pointer along the measurement doesn't move the line. */
export function dimensionOffsetAt(start: Pt, end: Pt, pt: Pt): number {
  const geo = dimensionGeometry(start, end);
  if (!geo) return 0;
  return (pt.x - start.x) * geo.normal.x + (pt.y - start.y) * geo.normal.y;
}

let shapeIdSeq = 0;

export function makeShapeId(): string {
  shapeIdSeq += 1;
  return `shape-${Date.now().toString(36)}-${shapeIdSeq.toString(36)}`;
}
