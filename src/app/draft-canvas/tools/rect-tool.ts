import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewRect } from './two-point-tool';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export function createRectTool(): TwoPointTool {
  return new TwoPointTool('rect', 'Box', (p1, p2) => ({
    id: makeShapeId(),
    type: 'rect',
    p1,
    p2,
  }), previewRect);
}

/** The opposite corner forced to make a square — same side length as the larger dimension, same drag direction. */
function squareCorner(p1: Pt, p2: Pt): Pt {
  const size = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  const sx = p2.x >= p1.x ? 1 : -1;
  const sy = p2.y >= p1.y ? 1 : -1;
  return { x: p1.x + sx * size, y: p1.y + sy * size };
}

function previewSquare(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number, p1: Pt, p2: Pt): void {
  previewRect(gRoot, gUI, pxPerMm, p1, squareCorner(p1, p2));
}

export function createSquareTool(): TwoPointTool {
  return new TwoPointTool('square', 'Square', (p1, p2) => ({
    id: makeShapeId(),
    type: 'rect',
    p1,
    p2: squareCorner(p1, p2),
  }), previewSquare);
}
