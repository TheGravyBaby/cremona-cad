import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, angleLockModifier } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';
import { drawTicks } from './shape-renderer';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export function createTicksTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('ticks', 'Ticks', (start, end) => ({
    id: makeShapeId(),
    type: 'ticks',
    start,
    end,
    weights: toolbox.currentTickWeights,
  }), (gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number, start: Pt, end: Pt) => {
    drawTicks(gRoot, start, end, toolbox.currentTickWeights, toolbox.currentColor);
  }, angleLockModifier);
}
