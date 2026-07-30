import { Pt } from '../../models/types';
import { DraftShape, ImageShape, imageCenter, imageCorners, imageEdgeMidpoints } from './toolbox-shape';
import { pointOnCircle } from './arc-geometry';
import { normalizeDegrees, rotatePointAbout } from '../../helpers/draftMath';

const TWO_PI = Math.PI * 2;
function normalizeAngle(a: number): number {
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Where the square "move" handle renders/hit-tests for a selected shape — grabbing it
 * translates the whole shape, as opposed to grabbing an endpoint to edit just that point (see
 * endpointGrabbers below). Null for Text/Point, which are already a single anchor point: the
 * shape body itself is the unambiguous drag target, so a separate handle would be redundant.
 */
export function moveGrabberPosition(shape: DraftShape): Pt | null {
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'boxline':
      return { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 };
    case 'circle':
      return { x: shape.center.x, y: shape.center.y };
    case 'rect':
      return { x: (shape.p1.x + shape.p2.x) / 2, y: (shape.p1.y + shape.p2.y) / 2 };
    case 'arc':
      return { x: shape.center.x, y: shape.center.y };
    case 'text':
    case 'point':
      return null;
    case 'image':
      // Null for the same reason as Text/Point: the whole picture is already an unambiguous
      // drag target (distanceToShape returns 0 inside it), so a handle in the middle would just
      // sit on top of what the user is trying to trace.
      return null;
  }
}

/** The point on an arc's circle midway (by angle) between its start and end — where the
 * radius-resize handle sits, since it's the most "on the arc" point to grab. */
function arcMidpoint(shape: Extract<DraftShape, { type: 'arc' }>): Pt {
  const span = normalizeAngle(shape.endAngle - shape.startAngle);
  const midAngle = shape.startAngle + span / 2;
  return pointOnCircle(shape.center, shape.radius, midAngle);
}

// 'start'/'end' — Line/Dimension/Box Line's endpoints.
// 'p1'/'p2' — Rect's corners (either can go anywhere; drawShape already takes the
//   min/max of the two, so there's no "wrong" corner to drag).
// 'radius' — Circle's edge, or Arc's midpoint; only the drag point's distance from center
//   matters (center and, for Arc, both angles stay fixed).
// 'startAngle'/'endAngle' — Arc's sweep ends; only the drag point's angle from center
//   matters (radius is fixed), matching how the Arc tool's own third click behaves.
// 'nw'…'w' — Image's box handles: corners resize proportionally, edges resize one dimension.
//   Named for the Y-up world, matching imageCorners/imageEdgeMidpoints.
// 'rotate' — Image's rotation handle; only the drag point's angle about the box center matters.
export type EndpointKey =
  | 'start' | 'end' | 'p1' | 'p2' | 'radius' | 'startAngle' | 'endAngle'
  | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rotate';

/** How a handle should be drawn (see shape-renderer.ts's drawEndpointGrabber). Defaults to
 * `point` — the triangle every pre-image shape uses. */
export type GrabberKind = 'point' | 'corner' | 'edge' | 'rotate';
export type EndpointGrabber = { key: EndpointKey; pos: Pt; kind?: GrabberKind };

const MIN_RADIUS_MM = 0.01;
/** Floor for an image's box dimensions while dragging a handle, matching the old reference
 * controller's limit — small enough to be usable, large enough that a box can't vanish. */
const MIN_IMAGE_MM = 10;
/** How far past the top edge the rotation handle floats, in screen px (constant on-screen, like
 * every other grabber). */
const ROTATE_GRABBER_OFFSET_PX = 26;

/**
 * The draggable endpoint handles for a shape — triangles, so they read as visually distinct
 * from the square move handle. Null for Text/Point, which have no geometry beyond the single
 * point the move handle already covers.
 *
 * `pxPerMm` is only consulted by handles whose position is a constant screen offset rather than
 * a point on the geometry itself (currently just Image's rotation handle).
 */
export function endpointGrabbers(shape: DraftShape, pxPerMm: number): EndpointGrabber[] | null {
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'boxline':
      return [{ key: 'start', pos: shape.start }, { key: 'end', pos: shape.end }];
    case 'rect':
      return [{ key: 'p1', pos: shape.p1 }, { key: 'p2', pos: shape.p2 }];
    case 'circle':
      return [{ key: 'radius', pos: { x: shape.center.x + shape.radius, y: shape.center.y } }];
    case 'arc':
      return [
        { key: 'startAngle', pos: pointOnCircle(shape.center, shape.radius, shape.startAngle) },
        { key: 'endAngle', pos: pointOnCircle(shape.center, shape.radius, shape.endAngle) },
        { key: 'radius', pos: arcMidpoint(shape) },
      ];
    case 'text':
    case 'point':
      return null;
    case 'image': {
      const corners = imageCorners(shape);
      const mids = imageEdgeMidpoints(shape);
      const center = imageCenter(shape);
      const deg = shape.rotationDeg ?? 0;
      // Floats above the north edge, rotating with the box so it always reads as "the top".
      const rotatePos = rotatePointAbout(
        { x: center.x, y: shape.y + shape.height + ROTATE_GRABBER_OFFSET_PX / pxPerMm },
        center, deg,
      );
      return [
        ...(['nw', 'ne', 'sw', 'se'] as const).map(key => ({ key, pos: corners[key], kind: 'corner' as const })),
        ...(['n', 's', 'e', 'w'] as const).map(key => ({ key, pos: mids[key], kind: 'edge' as const })),
        { key: 'rotate', pos: rotatePos, kind: 'rotate' as const },
      ];
    }
  }
}

/** Applies a dragged endpoint's new position back onto the shape it belongs to. */
export function withEndpoint(shape: DraftShape, key: EndpointKey, pos: Pt): DraftShape {
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'boxline':
      if (key === 'start' || key === 'end') return { ...shape, [key]: pos };
      return shape;
    case 'rect':
      if (key === 'p1' || key === 'p2') return { ...shape, [key]: pos };
      return shape;
    case 'circle':
      if (key === 'radius') {
        const radius = Math.max(MIN_RADIUS_MM, Math.hypot(pos.x - shape.center.x, pos.y - shape.center.y));
        return { ...shape, radius };
      }
      return shape;
    case 'arc':
      if (key === 'startAngle' || key === 'endAngle') {
        const angle = Math.atan2(pos.y - shape.center.y, pos.x - shape.center.x);
        return { ...shape, [key]: angle };
      }
      if (key === 'radius') {
        const radius = Math.max(MIN_RADIUS_MM, Math.hypot(pos.x - shape.center.x, pos.y - shape.center.y));
        return { ...shape, radius };
      }
      return shape;
    case 'image':
      return withImageHandle(shape, key, pos);
    default:
      return shape;
  }
}

/**
 * Applies an image box/rotation handle drag. `shape` is the pre-drag original (draft-canvas
 * passes `dragEndpoint.original`, not the live shape), so every value here is measured against
 * where the box started — which is what makes a drag past the anchor behave predictably instead
 * of accumulating.
 *
 * All the box math happens in the image's unrotated local frame; the final step re-anchors the
 * result in world space so the handle opposite the one being dragged stays put even when the
 * image is rotated.
 */
function withImageHandle(shape: ImageShape, key: EndpointKey, pos: Pt): DraftShape {
  const deg = shape.rotationDeg ?? 0;
  const center = imageCenter(shape);

  if (key === 'rotate') {
    // The handle sits due north of the center at zero rotation, so the box's rotation is the
    // cursor's bearing from center, less that quarter turn.
    const bearing = Math.atan2(pos.y - center.y, pos.x - center.x) * 180 / Math.PI;
    return { ...shape, rotationDeg: normalizeDegrees(bearing - 90) };
  }

  const isCorner = key === 'nw' || key === 'ne' || key === 'sw' || key === 'se';
  const isEdge = key === 'n' || key === 's' || key === 'e' || key === 'w';
  if (!isCorner && !isEdge) return shape;

  const localPt = rotatePointAbout(pos, center, -deg);
  const x1 = shape.x + shape.width;
  const y1 = shape.y + shape.height;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const aspect = Math.abs(shape.width / shape.height) || 1;

  // The point that must stay fixed: the opposite corner, or the opposite edge's midpoint.
  const anchor: Pt =
    key === 'nw' ? { x: x1, y: shape.y } :
    key === 'ne' ? { x: shape.x, y: shape.y } :
    key === 'sw' ? { x: x1, y: y1 } :
    key === 'se' ? { x: shape.x, y: y1 } :
    key === 'n' ? { x: cx, y: shape.y } :
    key === 's' ? { x: cx, y: y1 } :
    key === 'e' ? { x: shape.x, y: cy } :
                  { x: x1, y: cy };

  let box: { x: number; y: number; width: number; height: number };

  if (isCorner) {
    // Proportional: take whichever of the two cursor deltas implies the larger box, so the
    // dragged corner tracks the pointer as closely as the aspect ratio allows.
    let width = Math.abs(localPt.x - anchor.x);
    let height = Math.abs(localPt.y - anchor.y);
    if (width / Math.max(height, 1e-6) > aspect) width = height * aspect;
    else height = width / aspect;
    width = Math.max(MIN_IMAGE_MM, width);
    height = Math.max(MIN_IMAGE_MM, height);

    const anchorIsWest = key === 'ne' || key === 'se';
    const anchorIsSouth = key === 'ne' || key === 'nw';
    box = {
      x: anchorIsWest ? anchor.x : anchor.x - width,
      y: anchorIsSouth ? anchor.y : anchor.y - height,
      width, height,
    };
  } else {
    // One dimension follows the cursor. Growing past the original size falls back to
    // proportional (re-centering on the anchor across the other axis) so an image can be scaled
    // up from an edge without being stretched out of shape.
    let { x, y, width, height } = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    if (key === 'n' || key === 's') {
      height = Math.max(MIN_IMAGE_MM, key === 'n' ? localPt.y - anchor.y : anchor.y - localPt.y);
      y = key === 'n' ? anchor.y : anchor.y - height;
      if (height > shape.height) {
        width = height * aspect;
        x = anchor.x - width / 2;
      }
    } else {
      width = Math.max(MIN_IMAGE_MM, key === 'e' ? localPt.x - anchor.x : anchor.x - localPt.x);
      x = key === 'e' ? anchor.x : anchor.x - width;
      if (width > shape.width) {
        height = width / aspect;
        y = anchor.y - height / 2;
      }
    }
    box = { x, y, width, height };
  }

  // Re-anchor in world space. Resizing moves the box center, and the center is the rotation
  // pivot — so without this the anchor would swing away as soon as the image is rotated.
  const anchorWorld = rotatePointAbout(anchor, center, deg);
  const newCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const anchorAfter = rotatePointAbout(anchor, newCenter, deg);
  return {
    ...shape,
    x: box.x + (anchorWorld.x - anchorAfter.x),
    y: box.y + (anchorWorld.y - anchorAfter.y),
    width: box.width,
    height: box.height,
  };
}
