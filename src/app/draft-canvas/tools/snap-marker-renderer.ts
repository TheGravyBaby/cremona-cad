import * as d3 from 'd3';
import { SnapCandidate } from './snap-engine';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const SNAP_COLOR = '#16a34a';
const SNAP_STROKE_WIDTH = 2;
const SNAP_MARKER_PX = 5;

/** Draws the glyph indicating an active snap: a square for endpoints, a circled cross for centers, a diamond for on-path. */
export function drawSnapMarker(gRoot: RootGroup, candidate: SnapCandidate, pxPerMm: number): void {
  const half = SNAP_MARKER_PX / pxPerMm;
  const { x, y } = candidate.pt;

  const style = (sel: d3.Selection<any, unknown, null, undefined>) => sel
    .attr('fill', 'none')
    .attr('stroke', SNAP_COLOR)
    .attr('stroke-width', SNAP_STROKE_WIDTH)
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');

  switch (candidate.kind) {
    case 'endpoint':
      style(gRoot.append('rect')
        .attr('x', x - half).attr('y', y - half)
        .attr('width', half * 2).attr('height', half * 2));
      break;

    case 'center':
      style(gRoot.append('circle').attr('cx', x).attr('cy', y).attr('r', half));
      style(gRoot.append('line')
        .attr('x1', x - half * 0.6).attr('y1', y)
        .attr('x2', x + half * 0.6).attr('y2', y));
      style(gRoot.append('line')
        .attr('x1', x).attr('y1', y - half * 0.6)
        .attr('x2', x).attr('y2', y + half * 0.6));
      break;

    case 'path':
      style(gRoot.append('polygon')
        .attr('points', `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`));
      break;
  }
}
