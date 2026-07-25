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
    case 'boxline':
      drawBoxLine(gRoot, gUI, {
        start: shape.start, end: shape.end, weights: shape.weights,
        color1: color, color2: shape.color2, label: shape.label,
      }, pxPerMm);
      break;
    case 'text':
      // Zero-radius circle: gets picked up by snap-engine.ts's `circle` branch as a plain
      // 'center' point candidate, without also contributing along-path samples (getTotalLength
      // is 0, so the generic sampling below it is skipped) — the simplest way to make a single
      // point snappable using the existing element-based snap indexing.
      gRoot.append('circle')
        .attr('cx', shape.position.x).attr('cy', shape.position.y).attr('r', 0)
        .attr('fill', 'none').attr('stroke', 'none')
        .style('pointer-events', 'none');
      gUI.append('text')
        .attr('x', shape.position.x).attr('y', -shape.position.y)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'central')
        .attr('fill', color)
        .attr('font-size', TEXT_FONT_SIZE_PX / pxPerMm)
        .style('user-select', 'none')
        .text(shape.text);
      break;
  }
}

// Constant on-screen size (annotation-style, like Dimension/Box Line labels), not to-scale mm.
export const TEXT_FONT_SIZE_PX = 14;

export type BoxLineParams = {
  start: Pt;
  end: Pt;
  weights: number[];
  color1: string;
  color2: string;
  label: boolean;
};

// Fixed for now — see the Box Line "full integration" plan for making these configurable.
const BOXLINE_THICKNESS_MM = 8;
const BOXLINE_LABEL_OFFSET_MUL = 0.9;

/**
 * Draws a line divided into weighted ratio segments, alternating color1/color2,
 * with boundary ticks and per-segment weight labels — ported from the recipe-side
 * helpers/renderFuncs.ts renderBoxLine. An invisible centerline is left snappable
 * (endpoints + along-path); the banding/outline/ticks are marked `data-no-snap`
 * so they don't flood the snap engine with quad-corner/tick candidates.
 */
export function drawBoxLine(gRoot: RootGroup, gUI: RootGroup, p: BoxLineParams, pxPerMm: number): void {
  const { start, end, weights, color1, color2, label } = p;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || weights.length === 0) return;

  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const halfT = BOXLINE_THICKNESS_MM / 2;
  const total = weights.reduce((a, b) => a + b, 0);
  const unit = len / total;

  gRoot.append('line')
    .attr('x1', start.x).attr('y1', start.y).attr('x2', end.x).attr('y2', end.y)
    .attr('stroke', 'none')
    .style('pointer-events', 'none');

  const outlineLine = (ox: number, oy: number) => gRoot.append('line')
    .attr('data-no-snap', '')
    .attr('x1', start.x + ox).attr('y1', start.y + oy)
    .attr('x2', end.x + ox).attr('y2', end.y + oy)
    .attr('stroke', 'rgba(0,0,0,0.25)')
    .attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');
  outlineLine(nx * halfT, ny * halfT);
  outlineLine(-nx * halfT, -ny * halfT);

  const tickAt = (tx: number, ty: number) => gRoot.append('line')
    .attr('data-no-snap', '')
    .attr('x1', tx + nx * halfT).attr('y1', ty + ny * halfT)
    .attr('x2', tx - nx * halfT).attr('y2', ty - ny * halfT)
    .attr('stroke', 'rgba(0,0,0,0.35)')
    .attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');

  let cursor = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    const a = cursor;
    const b = cursor + w * unit;
    const ax = start.x + ux * a, ay = start.y + uy * a;
    const bx = start.x + ux * b, by = start.y + uy * b;

    const p1 = { x: ax + nx * halfT, y: ay + ny * halfT };
    const p2 = { x: bx + nx * halfT, y: by + ny * halfT };
    const p3 = { x: bx - nx * halfT, y: by - ny * halfT };
    const p4 = { x: ax - nx * halfT, y: ay - ny * halfT };

    gRoot.append('path')
      .attr('data-no-snap', '')
      .attr('d', `M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} Z`)
      .attr('fill', i % 2 === 0 ? color1 : color2)
      .attr('stroke', 'rgba(0,0,0,0.15)')
      .attr('stroke-width', 1)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0.25);

    tickAt(ax, ay);

    if (label) {
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      const lx = cx + nx * (BOXLINE_THICKNESS_MM * BOXLINE_LABEL_OFFSET_MUL);
      const ly = cy + ny * (BOXLINE_THICKNESS_MM * BOXLINE_LABEL_OFFSET_MUL);
      gUI.append('text')
        .attr('x', lx).attr('y', -ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 12 / pxPerMm)
        .attr('fill', 'rgba(0,0,0,0.75)')
        .style('user-select', 'none')
        .text(String(w));
    }

    cursor = b;
  }
  tickAt(end.x, end.y);
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
export function drawSelectionHalo(gRoot: RootGroup, gUI: RootGroup, shape: DraftShape, pxPerMm: number): void {
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
    case 'boxline': {
      const dx = shape.end.x - shape.start.x;
      const dy = shape.end.y - shape.start.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) break;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      const halfT = BOXLINE_THICKNESS_MM / 2;
      const p1 = { x: shape.start.x + nx * halfT, y: shape.start.y + ny * halfT };
      const p2 = { x: shape.end.x + nx * halfT, y: shape.end.y + ny * halfT };
      const p3 = { x: shape.end.x - nx * halfT, y: shape.end.y - ny * halfT };
      const p4 = { x: shape.start.x - nx * halfT, y: shape.start.y - ny * halfT };
      gRoot.append('path')
        .attr('d', `M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} Z`)
        .attr('fill', SELECTION_HALO_COLOR)
        .attr('fill-opacity', 0.25)
        .attr('stroke', SELECTION_HALO_COLOR)
        .attr('stroke-width', 4)
        .attr('stroke-linejoin', 'round')
        .attr('opacity', 0.6)
        .attr('vector-effect', 'non-scaling-stroke');
      break;
    }
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
    case 'text': {
      // Measure the actual rendered text (a hidden throwaway node) rather than estimating
      // width from character count — gUI shares gRoot's mm-space coordinates (just unflipped),
      // so getBBox() here is already in the right units for a gUI-space halo rect.
      const probe = gUI.append('text')
        .attr('x', shape.position.x).attr('y', -shape.position.y)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'central')
        .attr('font-size', TEXT_FONT_SIZE_PX / pxPerMm)
        .style('visibility', 'hidden')
        .text(shape.text || ' ');
      const box = (probe.node() as SVGTextElement).getBBox();
      probe.remove();

      const pad = 3 / pxPerMm;
      gUI.append('rect')
        .attr('x', box.x - pad).attr('y', box.y - pad)
        .attr('width', box.width + pad * 2).attr('height', box.height + pad * 2)
        .attr('fill', SELECTION_HALO_COLOR)
        .attr('fill-opacity', 0.25)
        .attr('stroke', SELECTION_HALO_COLOR)
        .attr('stroke-width', 2)
        .attr('opacity', 0.6)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
      break;
    }
  }
}
