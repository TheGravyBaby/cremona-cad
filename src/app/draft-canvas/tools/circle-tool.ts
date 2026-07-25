import { Pt } from '../../models/types';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, previewCircle } from './two-point-tool';

function radiusOf(center: Pt, radiusPt: Pt): number {
  return Math.hypot(radiusPt.x - center.x, radiusPt.y - center.y);
}

export function createCircleTool(): TwoPointTool {
  return new TwoPointTool('circle', 'Circle', (center, radiusPt) => ({
    id: makeShapeId(),
    type: 'circle',
    center,
    radius: radiusOf(center, radiusPt),
  }), previewCircle);
}

export function createDottedCircleTool(): TwoPointTool {
  return new TwoPointTool('circle-dashed', 'Dotted Circle', (center, radiusPt) => ({
    id: makeShapeId(),
    type: 'circle',
    center,
    radius: radiusOf(center, radiusPt),
    dashed: true,
  }), previewCircle);
}
