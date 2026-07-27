import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewLine, angleLockModifier } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

/** Reads `currentDashed` at commit time (like Box Line reads its weights/colors) so dashed
 * is a pen setting, not a separate tool — see the Dashed checkbox in the Line settings panel. */
export function createLineTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('line', 'Line', (start, end) => ({
    id: makeShapeId(),
    type: 'line',
    start,
    end,
    dashed: toolbox.currentDashed,
  }), previewLine, angleLockModifier);
}
