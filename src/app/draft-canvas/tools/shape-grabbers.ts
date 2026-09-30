import { Pt } from '../../models/types';
import {
  DEFAULT_TEXT_SIZE_MM, DraftShape, ImageShape, PathShape, TextShape,
  angleSweep, dimensionGeometry, dimensionOffsetAt, imageAspect, imageCenter, imageCorners, imageEdgeMidpoints,
  pathFromSource, placeAngle,
} from './toolbox-shape';
import { angleFromCenter, cubicBezierPoint, dist, normalizeDegrees, normalizeRadians, pointOnCircle, rotatePointAbout } from '../../helpers/math/simpleGeometry';
import { battenBeziers } from '../../helpers/math/vibeMath';

/** The point on an arc's circle midway (by angle) between its start and end — where the
 * radius-resize handle sits, since it's the most "on the arc" point to grab. */
function arcMidpoint(shape: Extract<DraftShape, { type: 'arc' }>): Pt {
  const span = normalizeRadians(shape.endAngle - shape.startAngle);
  const midAngle = shape.startAngle + span / 2;
  return pointOnCircle({ ...shape.center, r: shape.radius }, midAngle);
}

// 'start'/'end' — Line/Dimension/Section/Ticks' endpoints.
// 'offset' — Dimension's dimension line, at its midpoint; only the drag point's distance
//   perpendicular to the measurement matters, so the line slides off the measured points without
//   changing what is being measured.
// 'vertex'/'radius' — Angle's vertex, and its arc at the midpoint, which also picks the side
//   measured: dragged outside the arms it reads the reflex angle (see placeAngle).
// 'p1'/'p2' — Rect's corners (either can go anywhere; drawShape already takes the
//   min/max of the two, so there's no "wrong" corner to drag).
// 'radius' — Circle's edge, or Arc's midpoint; only the drag point's distance from center
//   matters (center and, for Arc, both angles stay fixed).
// 'startAngle'/'endAngle' — Arc's sweep ends; only the drag point's angle from center
//   matters (radius is fixed), matching how the Arc tool's own third click behaves.
// 'nw'…'w' — Image's box handles: corners resize proportionally, edges resize one dimension.
//   Named for the Y-up world, matching imageCorners/imageEdgeMidpoints.
// 'rotate' — Image's rotation handle (about the box center) or Text's (about its anchor);
//   only the drag point's angle about that pivot matters.
// 'pin-N' — a Batten's Nth pin; the curve re-fairs through wherever it is dropped.
export type EndpointKey =
  | 'start' | 'end' | 'vertex' | 'p1' | 'p2' | 'radius' | 'startAngle' | 'endAngle' | 'offset'
  | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rotate' | `pin-${number}`;

/** How a handle should be drawn (see shape-renderer.ts's drawEndpointGrabber). Defaults to
 * `point` — the triangle every pre-image shape uses. */
export type GrabberKind = 'point' | 'corner' | 'edge' | 'rotate';
export type EndpointGrabber = { key: EndpointKey; pos: Pt; kind?: GrabberKind };

const MIN_RADIUS_MM = 0.01;
/** Floor for an image's box dimensions while dragging a handle — small enough to be usable,
 * large enough that a box can't be collapsed to nothing and lost. */
const MIN_IMAGE_MM = 10;
/** How far past the top edge the rotation handle floats, in screen px (constant on-screen, like
 * every other grabber). */
const ROTATE_GRABBER_OFFSET_PX = 26;

/**
 * The draggable endpoint handles for a shape; the shape's own outline is what moves it whole.
 * Null for Point and Freehand, which have no geometry beyond what dragging the outline already
 * covers; Text has no endpoint either but does have an orientation, so it gets the rotation
 * handle alone.
 *
 * `pxPerMm` is only consulted by handles whose position is a constant screen offset rather than
 * a point on the geometry itself — Image's and Text's rotation handles.
 */
export function endpointGrabbers(shape: DraftShape, pxPerMm: number): EndpointGrabber[] | null {
  switch (shape.type) {
    case 'line':
    case 'section':
    case 'ticks':
      return [{ key: 'start', pos: shape.start }, { key: 'end', pos: shape.end }];
    case 'dimension': {
      const ends: EndpointGrabber[] = [{ key: 'start', pos: shape.start }, { key: 'end', pos: shape.end }];
      const geo = dimensionGeometry(shape.start, shape.end, shape.offset);
      return geo ? [...ends, { key: 'offset', pos: geo.mid }] : ends;
    }
    case 'angle': {
      const { startAngle, sweep } = angleSweep(shape.vertex, shape.start, shape.end);
      return [
        { key: 'vertex', pos: shape.vertex }, { key: 'start', pos: shape.start }, { key: 'end', pos: shape.end },
        { key: 'radius', pos: pointOnCircle({ ...shape.vertex, r: shape.radius }, startAngle + sweep / 2) },
      ];
    }
    case 'rect':
      return [{ key: 'p1', pos: shape.p1 }, { key: 'p2', pos: shape.p2 }];
    case 'circle':
      return [{ key: 'radius', pos: { x: shape.center.x + shape.radius, y: shape.center.y } }];
    case 'arc':
      return [
        { key: 'startAngle', pos: pointOnCircle({ ...shape.center, r: shape.radius }, shape.startAngle) },
        { key: 'endAngle', pos: pointOnCircle({ ...shape.center, r: shape.radius }, shape.endAngle) },
        { key: 'radius', pos: arcMidpoint(shape) },
      ];
    case 'text': {
      // The one handle a label has: it is a single anchor point, so there is no endpoint to
      // drag, but there is an orientation. Floats above the anchor and turns with the label, the
      // same way the image handle rides above its box's north edge.
      const angle = (shape.rotationDeg ?? 0) * Math.PI / 180;
      const above = (shape.fontSize ?? DEFAULT_TEXT_SIZE_MM) * 0.7 + ROTATE_GRABBER_OFFSET_PX / pxPerMm;
      const pos = rotatePointAbout(
        { x: shape.position.x, y: shape.position.y + above }, shape.position, angle);
      return [{ key: 'rotate', pos, kind: 'rotate' }];
    }
    case 'path':
      return shape.source?.kind === 'batten' ? shape.source.pins.map((pos, i) => ({ key: `pin-${i}` as const, pos })) : null;
    case 'point':
    case 'freehand':
    case 'curve-length':
    case 'curve-ticks':
      return null;
    case 'image': {
      const corners = imageCorners(shape);
      const mids = imageEdgeMidpoints(shape);
      const center = imageCenter(shape);
      const angle = (shape.rotationDeg ?? 0) * Math.PI / 180;
      // Floats above the north edge, rotating with the box so it always reads as "the top".
      const rotatePos = rotatePointAbout(
        { x: center.x, y: shape.y + shape.height + ROTATE_GRABBER_OFFSET_PX / pxPerMm },
        center, angle,
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
    case 'section':
    case 'ticks':
      if (key === 'start' || key === 'end') return { ...shape, [key]: pos };
      return shape;
    case 'dimension':
      if (key === 'start' || key === 'end') return { ...shape, [key]: pos };
      if (key === 'offset') return { ...shape, offset: dimensionOffsetAt(shape.start, shape.end, pos) };
      return shape;
    case 'angle':
      if (key === 'vertex' || key === 'start' || key === 'end') return { ...shape, [key]: pos };
      if (key === 'radius') return { ...shape, ...placeAngle(shape.vertex, shape.start, shape.end, pos) };
      return shape;
    case 'rect':
      if (key === 'p1' || key === 'p2') return { ...shape, [key]: pos };
      return shape;
    case 'circle':
      if (key === 'radius') {
        const radius = Math.max(MIN_RADIUS_MM, dist(pos, shape.center));
        return { ...shape, radius };
      }
      return shape;
    case 'arc':
      if (key === 'startAngle' || key === 'endAngle') {
        const angle = angleFromCenter(shape.center, pos);
        return { ...shape, [key]: angle };
      }
      if (key === 'radius') {
        const radius = Math.max(MIN_RADIUS_MM, dist(pos, shape.center));
        return { ...shape, radius };
      }
      return shape;
    case 'text':
      return key === 'rotate' ? withTextRotation(shape, pos) : shape;
    case 'image':
      return withImageHandle(shape, key, pos);
    case 'path': {
      const i = key.startsWith('pin-') ? Number(key.slice(4)) : -1;
      if (shape.source?.kind !== 'batten' || !(i in shape.source.pins)) return shape;
      const source = { ...shape.source, pins: shape.source.pins.map((p, j) => j === i ? pos : p) };
      return { ...shape, source, d: pathFromSource(source) };
    }
    default:
      return shape;
  }
}

/** The handle sits due north of the anchor when level, so the label's rotation is the cursor's
 * bearing from the anchor less that quarter turn — same reading as the image handle. */
function withTextRotation(shape: TextShape, pos: Pt): DraftShape {
  const bearing = angleFromCenter(shape.position, pos) * 180 / Math.PI;
  return { ...shape, rotationDeg: normalizeDegrees(bearing - 90) };
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
  const angle = (shape.rotationDeg ?? 0) * Math.PI / 180;
  const center = imageCenter(shape);

  if (key === 'rotate') {
    // The handle sits due north of the center at zero rotation, so the box's rotation is the
    // cursor's bearing from center, less that quarter turn.
    const bearing = angleFromCenter(center, pos) * 180 / Math.PI;
    return { ...shape, rotationDeg: normalizeDegrees(bearing - 90) };
  }

  const isCorner = key === 'nw' || key === 'ne' || key === 'sw' || key === 'se';
  const isEdge = key === 'n' || key === 's' || key === 'e' || key === 'w';
  if (!isCorner && !isEdge) return shape;

  const localPt = rotatePointAbout(pos, center, -angle);
  const x1 = shape.x + shape.width;
  const y1 = shape.y + shape.height;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const aspect = imageAspect(shape);

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
    // dragged edge follows the cursor; the other axis follows aspect, centered on the anchor edge.
    let x: number, y: number, width: number, height: number;
    if (key === 'n' || key === 's') {
      height = Math.max(MIN_IMAGE_MM, key === 'n' ? localPt.y - anchor.y : anchor.y - localPt.y);
      y = key === 'n' ? anchor.y : anchor.y - height;
      width = height * aspect;
      x = anchor.x - width / 2;
    } else {
      width = Math.max(MIN_IMAGE_MM, key === 'e' ? localPt.x - anchor.x : anchor.x - localPt.x);
      x = key === 'e' ? anchor.x : anchor.x - width;
      height = width / aspect;
      y = anchor.y - height / 2;
    }
    box = { x, y, width, height };
  }

  // Re-anchor in world space. Resizing moves the box center, and the center is the rotation
  // pivot — so without this the anchor would swing away as soon as the image is rotated.
  const anchorWorld = rotatePointAbout(anchor, center, angle);
  const newCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const anchorAfter = rotatePointAbout(anchor, newCenter, angle);
  return {
    ...shape,
    x: box.x + (anchorWorld.x - anchorAfter.x),
    y: box.y + (anchorWorld.y - anchorAfter.y),
    width: box.width,
    height: box.height,
  };
}

// a double-click's edits to a batten. A new pin goes on the curve where it was hit, in the span it
// was hit in, so the strip barely moves until the pin is dragged; a batten keeps at least two pins,
// three for a loop, and null means there was nothing to take out.
export function withBattenPinAdded(shape: PathShape, pt: Pt): PathShape {
  if (shape.source?.kind !== 'batten') return shape;
  const { pins, closed } = shape.source;
  let best = { span: 0, at: pins[0], d: Infinity };
  battenBeziers(pins, closed).forEach(([a, c1, c2, b], span) => {
    for (let k = 0; k <= 64; k++) {
      const p = cubicBezierPoint(a, c1, c2, b, k / 64);
      const d = dist(p, pt);
      if (d < best.d) best = { span, at: p, d };
    }
  });
  const source = { ...shape.source, pins: [...pins.slice(0, best.span + 1), best.at, ...pins.slice(best.span + 1)] };
  return { ...shape, source, d: pathFromSource(source) };
}

export function withBattenPinRemoved(shape: PathShape, index: number): PathShape | null {
  if (shape.source?.kind !== 'batten' || shape.source.pins.length <= (shape.source.closed ? 3 : 2)) return null;
  const source = { ...shape.source, pins: shape.source.pins.filter((_, i) => i !== index) };
  return { ...shape, source, d: pathFromSource(source) };
}
