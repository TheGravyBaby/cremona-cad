import { Pt } from '../../models/types';
import { DraftShape } from './toolbox-shape';

function shiftPt(p: Pt, dx: number, dy: number): Pt {
  return { x: p.x + dx, y: p.y + dy };
}

/** Returns a copy of `shape` translated by (dx, dy) mm — every shape type keeps its
 * geometry (radius, angles, weights, ...) and only moves its anchor point(s). */
export function translateShape(shape: DraftShape, dx: number, dy: number): DraftShape {
  if (dx === 0 && dy === 0) return shape;
  switch (shape.type) {
    case 'line':
    case 'dimension':
    case 'boxline':
      return { ...shape, start: shiftPt(shape.start, dx, dy), end: shiftPt(shape.end, dx, dy) };
    case 'arc':
    case 'circle':
      return { ...shape, center: shiftPt(shape.center, dx, dy) };
    case 'rect':
      return { ...shape, p1: shiftPt(shape.p1, dx, dy), p2: shiftPt(shape.p2, dx, dy) };
    case 'text':
    case 'point':
      return { ...shape, position: shiftPt(shape.position, dx, dy) };
  }
}
