import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { dist } from '../../helpers/draftMath';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { freehandPathData } from './shape-renderer';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

// Screen-space, not world-mm, so the sampled polyline has the same visual fidelity at any zoom.
const MIN_POINT_SPACING_PX = 3;

/**
 * Hand-drawn scribble: hold and drag to sketch, for marking up or highlighting on top of a
 * drafting rather than constructing geometry. Points are sampled at a fixed screen-pixel
 * spacing rather than on every pointermove, so a slow stroke doesn't balloon the stored polyline.
 *
 * `disableSnapping` keeps a stroke from jumping onto nearby construction geometry mid-draw — see
 * draft-tool.ts. Not oneShot: like Line/Rect, it stays active so consecutive strokes stay fluid.
 */
export class FreehandTool implements DraftTool {
  readonly id = 'freehand';
  readonly label = 'Draw';
  readonly disableSnapping = true;

  private points: Pt[] = [];

  constructor(private toolbox: ToolboxStore) { }

  onPointerDown(pt: Pt, _host: DraftToolHost): void {
    this.points = [pt];
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.points.length === 0) return;
    const last = this.points[this.points.length - 1];
    const minSpacingMm = MIN_POINT_SPACING_PX / host.getPxPerMm();
    if (dist(last, pt) < minSpacingMm) return;
    this.points.push(pt);
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (this.points.length === 0) return;
    if (dist(this.points[this.points.length - 1], pt) > 1e-6) this.points.push(pt);
    if (this.points.length >= 2) {
      host.addShape({
        id: makeShapeId(),
        type: 'freehand',
        points: this.points,
        strokeWidth: this.toolbox.currentStrokeWidth,
        opacity: this.toolbox.currentOpacity,
      });
    }
    this.points = [];
    host.requestDraw();
  }

  renderPreview(gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void {
    if (this.points.length < 2) return;
    gRoot.append('path')
      .attr('d', freehandPathData(this.points))
      .attr('fill', 'none')
      .attr('stroke', this.toolbox.currentColor)
      .attr('stroke-width', this.toolbox.currentStrokeWidth)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('opacity', this.toolbox.currentOpacity)
      .attr('vector-effect', 'non-scaling-stroke');
  }

  reset(): void {
    this.points = [];
  }
}

export function createFreehandTool(toolbox: ToolboxStore): FreehandTool {
  return new FreehandTool(toolbox);
}
