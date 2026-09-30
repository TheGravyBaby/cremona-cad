import { Pt } from '../../models/types';
import { dist, regularPolygonVertices } from '../../helpers/math/simpleGeometry';
import { pathFromPolygon } from '../../helpers/math/pathMath';
import { makeShapeId } from './toolbox-shape';
import { TwoPointTool, angleLockModifier, previewCircle, stylePreview } from './two-point-tool';
import { ToolboxStore } from './toolbox-store';

/** Reads `currentDashed` at commit time (like Section reads its weights/colors) so dashed
 * is a pen setting, not a separate tool — see the Dashed checkbox in the Circle settings panel. */
export function createCircleTool(toolbox: ToolboxStore): TwoPointTool {
  return new TwoPointTool('circle', 'Circle', (center, radiusPt) => ({
    id: makeShapeId(),
    type: 'circle',
    center,
    radius: dist(radiusPt, center),
    dashed: toolbox.currentDashed,
  }), previewCircle);
}

const REGULAR_POLYGONS: [sides: number, label: string][] = [
  [3, 'Triangle'], [4, 'Square'], [5, 'Pentagon'], [6, 'Hexagon'], [8, 'Octagon'],
];

function polygonPath(center: Pt, vertex: Pt, sides: number): string {
  return pathFromPolygon(regularPolygonVertices(center, vertex, sides));
}

// the second point is a corner rather than a bare radius, so the same drag that sizes the
// polygon also turns it, and a corner can be snapped straight onto existing geometry.
export function createRegularPolygonTools(toolbox: ToolboxStore): TwoPointTool[] {
  return REGULAR_POLYGONS.map(([sides, label]) => new TwoPointTool(`polygon-${sides}`, label, (center, vertex) => ({
    id: makeShapeId(),
    type: 'path',
    d: polygonPath(center, vertex, sides),
    dashed: toolbox.currentDashed,
  }), (gRoot, _gUI, _pxPerMm, center, vertex) => {
    stylePreview(gRoot.append('path').attr('d', polygonPath(center, vertex, sides)));
  }, angleLockModifier));
}
