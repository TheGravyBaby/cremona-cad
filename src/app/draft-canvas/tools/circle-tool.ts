import { Pt } from '../../models/types';
import { dist } from '../../helpers/draftMath';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewCircle } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

function radiusOf(center: Pt, radiusPt: Pt): number {
  return dist(radiusPt, center);
}

/** Reads `currentDashed` at commit time (like Section reads its weights/colors) so dashed
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
