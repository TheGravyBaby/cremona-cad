import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/** Click to drop a reference point marker — no drag, no further editing beyond position. */
export class PointTool implements DraftTool {
  readonly id = 'point';
  readonly label = 'Point';
  readonly oneShot = true;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    host.addShape({
      id: makeShapeId(),
      type: 'point',
      position: pt,
    });
  }

  onPointerMove(): void { }
  onPointerUp(): void { }
  renderPreview(_gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void { }
  reset(): void { }
}

export function createPointTool(): PointTool {
  return new PointTool();
}
