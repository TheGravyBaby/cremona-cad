import { Pt } from '../../models/types';
import { battenPath } from '../../helpers/math/pathVibes';
import { PathSource, dimensionOffsetAt, makeShapeId, pathFromSource } from './toolbox-shape';
import { PREVIEW_COLOR, ThreePointTool, stylePreview } from './two-point-tool';
import { ChainTool } from './line-variant-tools';
import { ToolboxStore } from './toolbox-store';

const withSource = (source: PathSource) => ({ d: pathFromSource(source), source });

// The third click only counts for its distance off the chord, and which side it lands on is the
// side the curve bows to — so the same tool hangs a chain or raises an arch. Commits a path that
// keeps what it was drawn from, so the settings bar can reshape it once it is down.
function chordCurveTool(id: string, label: string, toolbox: ToolboxStore, source: (start: Pt, end: Pt, depth: number) => PathSource): ThreePointTool {
  return new ThreePointTool(id, label, (start, end, third) => ({
    id: makeShapeId(),
    type: 'path',
    ...withSource(source(start, end, dimensionOffsetAt(start, end, third))),
    dashed: toolbox.currentDashed,
  }), (gRoot, _gUI, _pxPerMm, start, end, third) => {
    const d = third ? pathFromSource(source(start, end, dimensionOffsetAt(start, end, third))) : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    stylePreview(gRoot.append('path').attr('d', d));
  });
}

export function createCatenaryTool(toolbox: ToolboxStore): ThreePointTool {
  return chordCurveTool('catenary', 'Catenary', toolbox, (start, end, depth) => ({ kind: 'catenary', start, end, depth }));
}

// reads the factor and percent at every draw, so the settings bar's fields reshape the preview as they change
export function createCycloidTool(toolbox: ToolboxStore): ThreePointTool {
  return chordCurveTool('cycloid', 'Cycloid', toolbox, (start, end, depth) =>
    ({ kind: 'cycloid', start, end, depth, factor: toolbox.currentCycloidFactor, pct: toolbox.currentCycloidPct }));
}

// Its pins stay on as handles, so a placed batten is faired by moving them; a double-click on the
// curve adds one there and on a pin takes it out (see the canvas's editBattenPins).
export function createBattenTool(toolbox: ToolboxStore): ChainTool {
  return new ChainTool('batten', 'Batten', {
    build: (pins, closed) => pins.length < 2 ? null
      : { id: makeShapeId(), type: 'path', ...withSource({ kind: 'batten', pins, closed }), dashed: toolbox.currentDashed },
    preview: (gRoot, points, pxPerMm) => {
      stylePreview(gRoot.append('path').attr('d', battenPath(points, false)));
      for (const p of points.slice(0, -1)) {
        gRoot.append('circle').attr('cx', p.x).attr('cy', p.y).attr('r', 3 / pxPerMm)
          .attr('fill', PREVIEW_COLOR).style('pointer-events', 'none');
      }
    },
  });
}
