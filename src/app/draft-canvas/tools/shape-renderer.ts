import * as d3 from 'd3';
import { DraftShape } from './toolbox-shape';
import { arcPathData } from './arc-geometry';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/** Draws a single committed toolbox shape into gRoot. Extend as shape types grow. */
export function drawShape(gRoot: RootGroup, shape: DraftShape): void {
  switch (shape.type) {
    case 'line':
      gRoot.append('line')
        .attr('x1', shape.start.x).attr('y1', shape.start.y)
        .attr('x2', shape.end.x).attr('y2', shape.end.y)
        .attr('stroke', '#1d4ed8')
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      break;
    case 'arc':
      gRoot.append('path')
        .attr('d', arcPathData(shape.center, shape.radius, shape.startAngle, shape.endAngle))
        .attr('fill', 'none')
        .attr('stroke', '#1d4ed8')
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      break;
  }
}

const SELECTION_HALO_COLOR = '#f59e0b';

/** Draws a soft highlight behind a selected shape — append before drawShape so it sits underneath. */
export function drawSelectionHalo(gRoot: RootGroup, shape: DraftShape): void {
  const halo = (sel: d3.Selection<any, unknown, null, undefined>) => sel
    .attr('fill', 'none')
    .attr('stroke', SELECTION_HALO_COLOR)
    .attr('stroke-width', 6)
    .attr('stroke-linecap', 'round')
    .attr('opacity', 0.4)
    .attr('vector-effect', 'non-scaling-stroke');

  switch (shape.type) {
    case 'line':
      halo(gRoot.append('line')
        .attr('x1', shape.start.x).attr('y1', shape.start.y)
        .attr('x2', shape.end.x).attr('y2', shape.end.y));
      break;
    case 'arc':
      halo(gRoot.append('path')
        .attr('d', arcPathData(shape.center, shape.radius, shape.startAngle, shape.endAngle)));
      break;
  }
}
