import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, angleLockModifier } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';
import { drawSection } from './shape-renderer';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Reads current weights/colors from the store at drag-release time so the tool
 * always picks up whatever the Section panel has most recently been set to —
 * mirrors how `currentColor` is stamped onto every other new shape.
 */
export function createSectionTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('section', 'Section', (start, end) => ({
    id: makeShapeId(),
    type: 'section',
    start,
    end,
    weights: toolbox.currentSectionWeights,
    color2: toolbox.currentSectionColor2,
    label: true,
  }), (gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt) => {
    drawSection(gRoot, gUI, {
      start, end,
      weights: toolbox.currentSectionWeights,
      color1: toolbox.currentColor,
      color2: toolbox.currentSectionColor2,
      label: true,
    }, pxPerMm);
  }, angleLockModifier);
}
