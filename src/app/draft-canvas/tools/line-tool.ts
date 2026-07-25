import { makeShapeId } from './toolbox-shape';
import { TwoPointTool } from './two-point-tool';

export function createLineTool(): TwoPointTool {
  return new TwoPointTool('line', 'Line', (start, end) => ({
    id: makeShapeId(),
    type: 'line',
    start,
    end,
  }));
}

export function createDottedLineTool(): TwoPointTool {
  return new TwoPointTool('line-dashed', 'Dotted Line', (start, end) => ({
    id: makeShapeId(),
    type: 'line',
    start,
    end,
    dashed: true,
  }));
}
