import { Pt } from '../../models/types';
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

export type ArcShape = ShapeBase & {
  type: 'arc';
  center: Pt;
  radius: number;
  startAngle: number; // radians
  endAngle: number; // radians; sweeps counterclockwise from startAngle — see arc-geometry.ts
  showCenterGuides?: boolean; // "fancy" arc: dashed radius lines + crosshair at center
};

export type CircleShape = ShapeBase & {
  type: 'circle';
  center: Pt;
  radius: number;
  dashed?: boolean;
};

export type DimensionShape = ShapeBase & {
  type: 'dimension';
  start: Pt;
  end: Pt;
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
};

// A single marked reference point — no geometry beyond its location, for calling
// out or snapping to a spot that isn't already an endpoint/center of something else.
export type PointShape = ShapeBase & {
  type: 'point';
  position: Pt;
};

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
  /** Per-image, unlike the single global slider the old reference popup had. Undefined means
   * DEFAULT_IMAGE_OPACITY, which is what every pre-existing recipe file effectively had. */
  opacity?: number;
  /** Fades near-white pixels to transparent so a scan on white paper reads on a dark canvas.
   * Undefined means on, matching the old always-on behavior. */
  suppressWhite?: boolean;
  /**
   * Mirrors the image content left-right about its own center — for a scan that came out
   * reversed, or to compare a traced half against its opposite. There's deliberately no separate
   * vertical mirror: combined with `rotationDeg` (already free), one mirror axis reaches every
   * orientation a second axis would — mirroring twice is just a 180° rotation, and a vertical
   * mirror is this same horizontal mirror plus a 180° rotation. Purely a rendering flag: the box
   * (x/y/width/height/rotationDeg) is untouched, so mirroring doesn't move handles or change
   * hit-testing. Undefined means unmirrored.
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

// Extend this union as new tools are added.
export type DraftShape =
  | LineShape | ArcShape | CircleShape | DimensionShape | RectShape | SectionShape | TextShape | PointShape
  | ImageShape;

/** An image's box center, about which `rotationDeg` turns it. */
export function imageCenter(shape: ImageShape): Pt {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
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

let shapeIdSeq = 0;

/** Generates a stable-enough unique id for a toolbox shape. */
export function makeShapeId(): string {
  shapeIdSeq += 1;
  return `shape-${Date.now().toString(36)}-${shapeIdSeq.toString(36)}`;
}
