import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftShape, DEFAULT_SHAPE_COLOR } from './toolbox-shape';
import { arcPathData, pointOnCircle } from './arc-geometry';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const DASH_PATTERN = '4 3';

/** Draws a single committed toolbox shape into gRoot (and gUI, for shapes with a text label). */
export function drawShape(gRoot: RootGroup, gUI: RootGroup, shape: DraftShape, pxPerMm: number): void {
  const color = shape.color ?? DEFAULT_SHAPE_COLOR;
  switch (shape.type) {
    case 'line': {
      const line = gRoot.append('line')
        .attr('x1', shape.start.x).attr('y1', shape.start.y)
        .attr('x2', shape.end.x).attr('y2', shape.end.y)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      if (shape.dashed) line.attr('stroke-dasharray', DASH_PATTERN);
      break;
    }
    case 'circle': {
      const circle = gRoot.append('circle')
        .attr('cx', shape.center.x).attr('cy', shape.center.y).attr('r', shape.radius)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      if (shape.dashed) circle.attr('stroke-dasharray', DASH_PATTERN);
      break;
    }
    case 'arc': {
      gRoot.append('path')
        .attr('d', arcPathData(shape.center, shape.radius, shape.startAngle, shape.endAngle))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      if (shape.showCenterGuides) {
        drawArcCenterGuides(gRoot, shape.center, shape.radius, shape.startAngle, shape.endAngle, color, pxPerMm);
      }
      break;
    }
    case 'dimension':
      drawDimension(gRoot, gUI, shape.start, shape.end, color, pxPerMm);
      break;
    case 'rect':
      gRoot.append('rect')
        .attr('x', Math.min(shape.p1.x, shape.p2.x)).attr('y', Math.min(shape.p1.y, shape.p2.y))
        .attr('width', Math.abs(shape.p2.x - shape.p1.x)).attr('height', Math.abs(shape.p2.y - shape.p1.y))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      break;
  }
}

function drawArcCenterGuides(
  gRoot: RootGroup, center: Pt, radius: number, startAngle: number, endAngle: number, color: string, pxPerMm: number,
): void {
  const startPt = pointOnCircle(center, radius, startAngle);
  const endPt = pointOnCircle(center, radius, endAngle);

  const guideLine = (a: Pt, b: Pt) => gRoot.append('line')
    .attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y)
    .attr('stroke', color)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3 3')
    .attr('opacity', 0.7)
    .attr('vector-effect', 'non-scaling-stroke');

  guideLine(center, startPt);
  guideLine(center, endPt);

  // small crosshair marking the center
  const half = 4 / pxPerMm;
  gRoot.append('line')
    .attr('x1', center.x - half).attr('y1', center.y)
    .attr('x2', center.x + half).attr('y2', center.y)
    .attr('stroke', color).attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');
  gRoot.append('line')
    .attr('x1', center.x).attr('y1', center.y - half)
    .attr('x2', center.x).attr('y2', center.y + half)
    .attr('stroke', color).attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');
}

function drawDimension(gRoot: RootGroup, gUI: RootGroup, start: Pt, end: Pt, color: string, pxPerMm: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  gRoot.append('line')
    .attr('x1', start.x).attr('y1', start.y)
    .attr('x2', end.x).attr('y2', end.y)
    .attr('stroke', color)
    .attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');

  if (length < 1e-6) return;

  const nx = -dy / length;
  const ny = dx / length;
  const tick = 4 / pxPerMm;

  const drawTick = (p: Pt) => gRoot.append('line')
    .attr('x1', p.x - nx * tick).attr('y1', p.y - ny * tick)
    .attr('x2', p.x + nx * tick).attr('y2', p.y + ny * tick)
    .attr('stroke', color).attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');
  drawTick(start);
  drawTick(end);

  const midX = (start.x + end.x) / 2 + nx * (8 / pxPerMm);
  const midY = (start.y + end.y) / 2 + ny * (8 / pxPerMm);
  gUI.append('text')
    .attr('x', midX).attr('y', -midY)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', color)
    .attr('font-size', 12 / pxPerMm)
    .style('user-select', 'none')
    .text(`${length.toFixed(1)} mm`);
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
    case 'dimension':
      halo(gRoot.append('line')
        .attr('x1', shape.start.x).attr('y1', shape.start.y)
        .attr('x2', shape.end.x).attr('y2', shape.end.y));
      break;
    case 'circle':
      halo(gRoot.append('circle')
        .attr('cx', shape.center.x).attr('cy', shape.center.y).attr('r', shape.radius));
      break;
    case 'arc':
      halo(gRoot.append('path')
        .attr('d', arcPathData(shape.center, shape.radius, shape.startAngle, shape.endAngle)));
      break;
    case 'rect':
      halo(gRoot.append('rect')
        .attr('x', Math.min(shape.p1.x, shape.p2.x)).attr('y', Math.min(shape.p1.y, shape.p2.y))
        .attr('width', Math.abs(shape.p2.x - shape.p1.x)).attr('height', Math.abs(shape.p2.y - shape.p1.y)));
      break;
  }
}
