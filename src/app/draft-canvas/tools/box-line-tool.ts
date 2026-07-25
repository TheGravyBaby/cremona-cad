import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';
import { drawBoxLine } from './shape-renderer';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Reads current weights/colors from the store at drag-release time so the tool
 * always picks up whatever the Box Line panel has most recently been set to —
 * mirrors how `currentColor` is stamped onto every other new shape.
 */
export function createBoxLineTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('boxline', 'Box Line', (start, end) => ({
    id: makeShapeId(),
    type: 'boxline',
    start,
    end,
    weights: toolbox.currentBoxLineWeights,
    color2: toolbox.currentBoxLineColor2,
    label: true,
  }), (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt) => {
    drawBoxLine(gRoot, gUI, {
      start, end,
      weights: toolbox.currentBoxLineWeights,
      color1: toolbox.currentColor,
      color2: toolbox.currentBoxLineColor2,
      label: true,
    }, pxPerMm);
  }, true);
}
