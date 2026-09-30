import { DimensionShape, dimensionOffsetAt, makeShapeId } from './toolbox-shape';
import { drawDimension } from './shape-renderer';
import { PREVIEW_COLOR, ThreePointTool } from './two-point-tool';

// The third click is where the dimension line carrying the number parks — what every CAD package
// asks for, and what keeps several measurements on one feature readable. Only its perpendicular
// component is kept (see dimensionOffsetAt), and a third click back on the measurement stores no
// offset at all, giving the flat dimension this tool used to be.
export function createDimensionTool(): ThreePointTool {
  return new ThreePointTool('dimension', 'Distance', (start, end, third) => {
    const shape: DimensionShape = { id: makeShapeId(), type: 'dimension', start, end };
    const offset = dimensionOffsetAt(start, end, third);
    if (Math.abs(offset) > 1e-9) shape.offset = offset;
    return shape;
  }, (gRoot, gUI, pxPerMm, start, end, third) => {
    const offset = third ? dimensionOffsetAt(start, end, third) : 0;
    drawDimension(gRoot, gUI, { start, end, offset }, PREVIEW_COLOR, pxPerMm, true);
  });
}
