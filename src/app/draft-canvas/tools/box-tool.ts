import { Pt } from '../../models/types';
import { pathFromPolygon } from '../../helpers/math/pathMath';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewRect, stylePreview } from './two-point-tool';
import { DraftToolHost } from './draft-tool';
import { ToolboxStore } from './toolbox-store';

/** The opposite corner forced to make a square — same side length as the larger dimension, same drag direction. */
function squareCorner(p1: Pt, p2: Pt): Pt {
  const size = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  const sx = p2.x >= p1.x ? 1 : -1;
  const sy = p2.y >= p1.y ? 1 : -1;
  return { x: p1.x + sx * size, y: p1.y + sy * size };
}

/** Holding the angle-lock modifier (Shift) forces the box into a square — same "Shift changes
 * this drag's constraint" convention as Line's angle-lock, just constraining shape instead of angle. */
function squareLockModifier(p1: Pt, p2: Pt, host: DraftToolHost): Pt {
  return host.isAngleLockHeld() ? squareCorner(p1, p2) : p2;
}

/** Reads `currentDashed` at commit time (like Line/Circle) so dashed is a pen setting, not a
 * separate tool — see the Dashed checkbox in the Box settings panel. Holding Shift while
 * dragging constrains it to a square (see squareLockModifier) instead of needing a separate tool. */
export function createRectTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('rect', 'Rectangle', (p1, p2) => ({
    id: makeShapeId(),
    type: 'rect',
    p1,
    p2,
    dashed: toolbox.currentDashed,
  }), previewRect, squareLockModifier);
}

// the right angle sits on the first click, the one corner placed deliberately, so it can be
// snapped onto a point; the drag direction picks which way the legs run.
function rightTrianglePath(p1: Pt, p2: Pt): string {
  return pathFromPolygon([p1, { x: p2.x, y: p1.y }, { x: p1.x, y: p2.y }]);
}

export function createRightTriangleTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('right-triangle', 'Right Triangle', (p1, p2) => ({
    id: makeShapeId(),
    type: 'path',
    d: rightTrianglePath(p1, p2),
    dashed: toolbox.currentDashed,
  }), (gRoot, _gUI, _pxPerMm, p1, p2) => {
    stylePreview(gRoot.append('path').attr('d', rightTrianglePath(p1, p2)));
  }, squareLockModifier);
}
