import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export class LineTool implements DraftTool {
  readonly id = 'line';
  readonly label = 'Line';

  private startPt: Pt | null = null;
  private currentPt: Pt | null = null;

  onPointerDown(pt: Pt, _host: DraftToolHost): void {
    this.startPt = pt;
    this.currentPt = pt;
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    this.currentPt = pt;
    host.requestDraw();
  }

  onPointerUp(pt: Pt, host: DraftToolHost): void {
    if (!this.startPt) return;
    if (this.startPt.x !== pt.x || this.startPt.y !== pt.y) {
      host.addShape({ id: makeShapeId(), type: 'line', start: this.startPt, end: pt });
    }
    this.reset();
    host.requestDraw();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.startPt) {
      this.reset();
      return true;
    }
    return false;
  }

  renderPreview(gRoot: RootGroup): void {
    if (!this.startPt || !this.currentPt) return;
    gRoot.append('line')
      .attr('x1', this.startPt.x).attr('y1', this.startPt.y)
      .attr('x2', this.currentPt.x).attr('y2', this.currentPt.y)
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3')
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }

  reset(): void {
    this.startPt = null;
    this.currentPt = null;
  }
}
