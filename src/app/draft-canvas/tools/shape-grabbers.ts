import { Pt } from '../../models/types';
import { DraftShape } from './toolbox-shape';
import { pointOnCircle } from './arc-geometry';

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
    case 'arc': {
      const span = normalizeAngle(shape.endAngle - shape.startAngle);
      const midAngle = shape.startAngle + span / 2;
      return {
        x: shape.center.x + shape.radius * Math.cos(midAngle),
        y: shape.center.y + shape.radius * Math.sin(midAngle),
      };
    }
    case 'text':
    case 'point':
      return null;
  }
}

// 'start'/'end' — Line/Dimension/Box Line's endpoints.
// 'p1'/'p2' — Rect's corners (either can go anywhere; drawShape already takes the
//   min/max of the two, so there's no "wrong" corner to drag).
// 'radius' — Circle's edge; only the drag point's distance from center matters.
// 'startAngle'/'endAngle' — Arc's sweep ends; only the drag point's angle from center
//   matters (radius is fixed), matching how the Arc tool's own third click behaves.
export type EndpointKey = 'start' | 'end' | 'p1' | 'p2' | 'radius' | 'startAngle' | 'endAngle';
export type EndpointGrabber = { key: EndpointKey; pos: Pt };

const MIN_RADIUS_MM = 0.01;

/**
 * The draggable endpoint handles for a shape — triangles, so they read as visually distinct
 * from the square move handle. Null for Text/Point, which have no geometry beyond the single
 * point the move handle already covers.
 */
export function endpointGrabbers(shape: DraftShape): EndpointGrabber[] | null {
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
      ];
    case 'text':
    case 'point':
      return null;
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
      return shape;
    default:
      return shape;
  }
}
