import * as d3 from 'd3';
import { Pt } from '../../models/types';
import {
  DraftShape, DEFAULT_SHAPE_COLOR, DEFAULT_IMAGE_OPACITY, ImageShape, imageCenter, imageCorners,
} from './toolbox-shape';
import { arcPathData, pointOnCircle } from '../../helpers/draftMath';
import { GrabberKind } from './shape-grabbers';

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
    case 'rect': {
      const rect = gRoot.append('rect')
        .attr('x', Math.min(shape.p1.x, shape.p2.x)).attr('y', Math.min(shape.p1.y, shape.p2.y))
        .attr('width', Math.abs(shape.p2.x - shape.p1.x)).attr('height', Math.abs(shape.p2.y - shape.p1.y))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      if (shape.dashed) rect.attr('stroke-dasharray', DASH_PATTERN);
      break;
    }
    case 'section':
      drawSection(gRoot, gUI, {
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
      {
        const textEl = gUI.append('text')
          .attr('text-anchor', 'start')
          .attr('fill', color)
          .attr('font-size', TEXT_FONT_SIZE_PX / pxPerMm)
          .style('user-select', 'none');
        appendTextLines(textEl, shape.position, shape.text, TEXT_FONT_SIZE_PX / pxPerMm);
      }
      break;
    case 'point': {
      // Same zero-radius-circle trick as 'text' above, for a plain snappable center point.
      gRoot.append('circle')
        .attr('cx', shape.position.x).attr('cy', shape.position.y).attr('r', 0)
        .attr('fill', 'none').attr('stroke', 'none')
        .style('pointer-events', 'none');

      const half = POINT_MARKER_SIZE_PX / pxPerMm;
      const crossLine = (x1: number, y1: number, x2: number, y2: number) => gRoot.append('line')
        .attr('data-no-snap', '')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('vector-effect', 'non-scaling-stroke');
      crossLine(shape.position.x - half, shape.position.y, shape.position.x + half, shape.position.y);
      crossLine(shape.position.x, shape.position.y - half, shape.position.x, shape.position.y + half);
      break;
    }
    case 'image':
      // Drawn by drawImageShape in its own pass beneath everything else, and needing an href
      // resolved from ImageAssetStore that this DOM-only module has no business reaching for.
      // See draft-canvas.ts's draw().
      break;
  }
}

/**
 * Draws a placed image. Separate from drawShape because images render in their own pass
 * underneath the recipe's own geometry (you trace on top of a photo, not under it), and because
 * the href has to be resolved through ImageAssetStore first — see draft-canvas.ts's draw().
 *
 * Nested layers, innermost first:
 *  1. The `<image>`'s own `translate(0 h) scale(1 -1)` undoes gRoot's `scale(1,-1)` for this
 *     element only — SVG `<image>` can't render bottom-up, so without it every photo appears
 *     upside down. A coordinate correction, not user-visible mirroring.
 *  2. When `mirrored`, a wrapping group flips the content about a world-space vertical line
 *     through the image's center (`2·center.x − x`). Inside the rotate group but outside the
 *     correction, so the mirror is a property of the content — rotating a mirrored image keeps it
 *     mirrored, like turning a face-down photo.
 *  3. The rotate group turns the box in world space, same as every other rotate-capable shape.
 */
export function drawImageShape(gRoot: RootGroup, shape: ImageShape, href: string): void {
  const center = imageCenter(shape);

  const rotateGroup = gRoot.append('g')
    .attr('class', 'reference-image-group')
    .attr('transform', `rotate(${shape.rotationDeg ?? 0} ${center.x} ${center.y})`);

  const imageParent = shape.mirrored
    ? rotateGroup.append('g').attr('transform', `translate(${2 * center.x} 0) scale(-1 1)`)
    : rotateGroup;

  imageParent.append('image')
    .attr('class', 'reference-image')
    .attr('href', href)
    .attr('xlink:href', href)
    .attr('transform', `translate(0 ${shape.height}) scale(1 -1)`)
    .attr('x', shape.x)
    .attr('y', -shape.y)
    .attr('width', shape.width)
    .attr('height', shape.height)
    .attr('opacity', shape.opacity ?? DEFAULT_IMAGE_OPACITY)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('pointer-events', 'none');
}

const POINT_MARKER_SIZE_PX = 5;

// Constant on-screen size (annotation-style, like Dimension/Section labels), not to-scale mm.
export const TEXT_FONT_SIZE_PX = 14;
// Multiplies font size for per-line spacing — exported so shape-hit-test.ts's DOM-free
// footprint estimate can stay in sync with the actual rendered line spacing here.
export const TEXT_LINE_HEIGHT_RATIO = 1.2;

/** Appends one tspan per '\n'-separated line, vertically centering the whole block on
 * `position` (matching the single-line dominant-baseline:central convention used everywhere
 * else) rather than anchoring just the first line there. Shared by drawShape and
 * drawSelectionHalo's 'text' cases so committed and halo/probe rendering never disagree. */
function appendTextLines(
  textSel: d3.Selection<SVGTextElement, unknown, null, undefined>,
  position: Pt,
  text: string,
  fontSizeMm: number,
): void {
  const lines = text.split('\n');
  const lineHeightMm = fontSizeMm * TEXT_LINE_HEIGHT_RATIO;
  const totalHeight = (lines.length - 1) * lineHeightMm;
  lines.forEach((line, i) => {
    textSel.append('tspan')
      .attr('x', position.x)
      .attr('y', -(position.y + totalHeight / 2 - i * lineHeightMm))
      .attr('dominant-baseline', 'central')
      .text(line.length ? line : ' ');
  });
}

export type SectionParams = {
  start: Pt;
  end: Pt;
  weights: number[];
  color1: string;
  color2: string;
  label: boolean;
};

// Fixed for now — see the Section "full integration" plan for making these configurable.
const SECTION_THICKNESS_MM = 10;

/**
 * Draws a line divided into weighted ratio segments, alternating color1/color2, with boundary
 * ticks and per-segment weight labels — ported from the recipe-side helpers/renderFuncs.ts
 * renderBoxLine. Section is really a thin rectangle, not a line, so both its long outer edges and
 * its boundary ticks are left snappable alongside the invisible centerline — a user reaching for
 * "the edge of this segment" gets the actual edge, not just the middle. Only the fill quads stay
 * `data-no-snap`: their corners already coincide with the tick/outline candidates above, so
 * indexing them too would just duplicate every point at higher cost.
 *
 * Each interior division point on the centerline additionally gets a zero-radius circle marker —
 * the same trick shape-renderer.ts uses for Point/Text — so it's an exact 'center'-kind candidate
 * rather than whatever the centerline's every-2mm path sampling happens to land near. Combined
 * with the ticks' exact 'endpoint'-kind corners, every boundary now outranks plain along-edge
 * samples (see snap-engine.ts's KIND_PRIORITY) — an intersection wins over a nearby edge point.
 */
export function drawSection(gRoot: RootGroup, gUI: RootGroup, p: SectionParams, pxPerMm: number): void {
  const { start, end, weights, color1, color2, label } = p;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || weights.length === 0) return;

  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const halfT = SECTION_THICKNESS_MM / 2;
  const total = weights.reduce((a, b) => a + b, 0);
  const unit = len / total;

  gRoot.append('line')
    .attr('x1', start.x).attr('y1', start.y).attr('x2', end.x).attr('y2', end.y)
    .attr('stroke', 'none')
    .style('pointer-events', 'none');

  const outlineLine = (ox: number, oy: number) => gRoot.append('line')
    .attr('x1', start.x + ox).attr('y1', start.y + oy)
    .attr('x2', end.x + ox).attr('y2', end.y + oy)
    .attr('stroke', 'rgba(0,0,0,0.25)')
    .attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');
  outlineLine(nx * halfT, ny * halfT);
  outlineLine(-nx * halfT, -ny * halfT);

  const tickAt = (tx: number, ty: number) => gRoot.append('line')
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
      .attr('opacity', 0.5);

    tickAt(ax, ay);

    if (i > 0) {
      // The i===0 boundary is `start` itself, already an endpoint candidate via the centerline.
      gRoot.append('circle')
        .attr('cx', ax).attr('cy', ay).attr('r', 0)
        .attr('fill', 'none').attr('stroke', 'none')
        .style('pointer-events', 'none');
    }

    if (label) {
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      gUI.append('text')
        .attr('x', cx).attr('y', -cy)
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
  const startPt = pointOnCircle({ ...center, r: radius }, startAngle);
  const endPt = pointOnCircle({ ...center, r: radius }, endAngle);

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
    case 'section': {
      const dx = shape.end.x - shape.start.x;
      const dy = shape.end.y - shape.start.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) break;
      const ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux;
      const halfT = SECTION_THICKNESS_MM / 2;
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
      const fontSizeMm = TEXT_FONT_SIZE_PX / pxPerMm;
      const probe = gUI.append('text')
        .attr('text-anchor', 'start')
        .attr('font-size', fontSizeMm)
        .style('visibility', 'hidden');
      appendTextLines(probe, shape.position, shape.text || ' ', fontSizeMm);
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
    case 'point':
      halo(gRoot.append('circle')
        .attr('cx', shape.position.x).attr('cy', shape.position.y).attr('r', 3));
      break;
    case 'image': {
      // An outline rather than a fill: a translucent wash over the picture would fight the
      // tracing the image exists for. Follows the rotated corners, so it reads as the box the
      // handles belong to.
      const c = imageCorners(shape);
      gRoot.append('path')
        .attr('d', `M ${c.sw.x} ${c.sw.y} L ${c.se.x} ${c.se.y} L ${c.ne.x} ${c.ne.y} L ${c.nw.x} ${c.nw.y} Z`)
        .attr('fill', 'none')
        .attr('stroke', SELECTION_HALO_COLOR)
        .attr('stroke-width', 2)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
      break;
    }
  }
}

const MOVE_GRABBER_SIZE_PX = 9;
const MOVE_GRABBER_FILL = '#f59e0b';
const MOVE_GRABBER_STROKE = '#78350f';

/** Draws the square "move" handle at `pos` (world mm) — constant on-screen size, like the
 * point marker/dimension ticks. See shape-grabbers.ts for where `pos` comes from per shape type. */
export function drawMoveGrabber(gRoot: RootGroup, pos: Pt, pxPerMm: number): void {
  const half = MOVE_GRABBER_SIZE_PX / 2 / pxPerMm;
  gRoot.append('rect')
    .attr('x', pos.x - half).attr('y', pos.y - half)
    .attr('width', half * 2).attr('height', half * 2)
    .attr('fill', MOVE_GRABBER_FILL)
    .attr('stroke', MOVE_GRABBER_STROKE)
    .attr('stroke-width', 1)
    .attr('vector-effect', 'non-scaling-stroke');
}

const ENDPOINT_GRABBER_SIZE_PX = 10;

/**
 * Draws an endpoint handle at `pos` (world mm), constant on-screen size like drawMoveGrabber.
 * The glyph depends on what the handle does, so a box's eight resize handles don't read as eight
 * interchangeable endpoints:
 *   point  — triangle (default): edit this one point of the geometry
 *   corner — circle: resize proportionally from this corner
 *   edge   — diamond: resize one dimension from this edge
 *   rotate — hollow circle: spin the shape about its center
 * `rotationDeg` only orients the diamond so it sits square to its edge.
 */
export function drawEndpointGrabber(
  gRoot: RootGroup, pos: Pt, pxPerMm: number, kind: GrabberKind = 'point', rotationDeg = 0,
): void {
  const r = ENDPOINT_GRABBER_SIZE_PX / 2 / pxPerMm;
  const styled = (sel: d3.Selection<any, unknown, null, undefined>, hollow = false) => sel
    .attr('fill', hollow ? '#fff' : MOVE_GRABBER_FILL)
    .attr('stroke', MOVE_GRABBER_STROKE)
    .attr('stroke-width', hollow ? 2 : 1)
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');

  switch (kind) {
    case 'corner':
      styled(gRoot.append('circle').attr('cx', pos.x).attr('cy', pos.y).attr('r', r));
      return;
    case 'edge':
      styled(gRoot.append('rect')
        .attr('x', pos.x - r * 0.8).attr('y', pos.y - r * 0.8)
        .attr('width', r * 1.6).attr('height', r * 1.6)
        .attr('transform', `rotate(${rotationDeg + 45} ${pos.x} ${pos.y})`));
      return;
    case 'rotate':
      styled(gRoot.append('circle').attr('cx', pos.x).attr('cy', pos.y).attr('r', r * 0.9), true);
      return;
    case 'point': {
      const top = `${pos.x},${pos.y + r}`;
      const bottomLeft = `${pos.x - r},${pos.y - r * 0.6}`;
      const bottomRight = `${pos.x + r},${pos.y - r * 0.6}`;
      styled(gRoot.append('polygon').attr('points', `${top} ${bottomLeft} ${bottomRight}`));
      return;
    }
  }
}

const AREA_SELECT_COLOR = '#2563eb';

/** Draws the rubber-band marquee box (world mm) while an area-select drag is in progress —
 * see draft-canvas.ts's areaSelectAnchor/areaSelectCurrent. */
export function drawAreaSelectBox(gRoot: RootGroup, box: { x0: number; y0: number; x1: number; y1: number }): void {
  gRoot.append('rect')
    .attr('x', box.x0).attr('y', box.y0)
    .attr('width', box.x1 - box.x0).attr('height', box.y1 - box.y0)
    .attr('fill', AREA_SELECT_COLOR)
    .attr('fill-opacity', 0.08)
    .attr('stroke', AREA_SELECT_COLOR)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', DASH_PATTERN)
    .attr('vector-effect', 'non-scaling-stroke')
    .style('pointer-events', 'none');
}
