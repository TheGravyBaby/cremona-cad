import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewLine, PREVIEW_COLOR } from './two-point-tool';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

function previewDimension(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, start: Pt, end: Pt): void {
  previewLine(gRoot, gUI, pxPerMm, start, end);

  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 1e-6) return;

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  gUI.append('text')
    .attr('x', midX).attr('y', -midY)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', PREVIEW_COLOR)
    .attr('font-size', 12 / pxPerMm)
    .style('pointer-events', 'none')
    .style('user-select', 'none')
    .text(`${length.toFixed(1)} mm`);
}

export function createDimensionTool(): TwoPointTool {
  return new TwoPointTool('dimension', 'Distance', (start, end) => ({
    id: makeShapeId(),
    type: 'dimension',
    start,
    end,
  }), previewDimension);
}
