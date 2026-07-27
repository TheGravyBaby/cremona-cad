import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewCircle } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

function radiusOf(center: Pt, radiusPt: Pt): number {
  return Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
}

/** Reads `currentDashed` at commit time (like Box Line reads its weights/colors) so dashed
 * is a pen setting, not a separate tool — see the Dashed checkbox in the Circle settings panel. */
export function createCircleTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('circle', 'Circle', (center, radiusPt) => ({
    id: makeShapeId(),
    type: 'circle',
    center,
    radius: radiusOf(center, radiusPt),
    dashed: toolbox.currentDashed,
  }), previewCircle);
}
