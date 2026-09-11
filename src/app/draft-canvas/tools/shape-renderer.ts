import * as d3 from 'd3';
import { Pt } from '../../models/types';
import {
  DraftShape, DimensionShape, DEFAULT_SHAPE_COLOR, DEFAULT_IMAGE_OPACITY, DEFAULT_FREEHAND_WIDTH,
  DEFAULT_TEXT_SIZE_MM, ImageShape, TextShape,
  dimensionGeometry, imageCenter, imageCorners, imageSourceBox, isCropped,
} from './toolbox-shape';
import { arcPathData, pointOnCircle } from '../../helpers/math/draftMath';
import { GrabberKind } from './shape-grabbers';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

const DASH_PATTERN = '4 3';

// Catmull-Rom passes through every sampled point (unlike curveBasis, which only approaches
// them) — keeps the rendered curve close to what distanceToShape/shapeBounds hit-test against.
const freehandLine = d3.line<Pt>().x(p => p.x).y(p => p.y).curve(d3.curveCatmullRom.alpha(0.5));

/** Shared by drawShape and drawSelectionHalo (and freehand-tool.ts's in-progress preview) so a
 * scribble's committed, selected and in-progress renderings never disagree. */
export function freehandPathData(points: Pt[]): string {
  return freehandLine(points) ?? '';
}

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
      drawDimension(gRoot, gUI, shape, color, pxPerMm);
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
        // Sized in mm rather than the screen-constant px Dimension/Section labels use, so a
        // label holds its proportion against the drawing through a zoom — see TextShape.fontSize.
        const fontSizeMm = shape.fontSize ?? DEFAULT_TEXT_SIZE_MM;
        const textEl = gUI.append('text')
          .attr('text-anchor', 'start')
          .attr('fill', color)
          .attr('font-family', TEXT_FONT_FAMILY)
          .attr('font-size', fontSizeMm)
          .style('user-select', 'none')
          // Transparent to the mouse so double-click-to-edit works at all. draw() rebuilds every
          // node in gUI, so selecting a label on the first click destroys the very element that
          // click landed on — and a browser only reports a double-click when both clicks share a
          // target. Leaving the events to reach the stable <svg> underneath sidesteps that
          // entirely, and costs nothing: picking is done by math in shape-hit-test.ts, never by
          // asking the DOM what was clicked.
          .style('pointer-events', 'none');
        const rotate = textRotateTransform(shape);
        if (rotate) textEl.attr('transform', rotate);
        appendTextLines(textEl, shape.position, shape.text, fontSizeMm);
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
    case 'freehand':
      // Not a snap candidate — a scribble isn't construction geometry (see SnapEngine's
      // `[data-no-snap]` filter).
      gRoot.append('path')
        .attr('data-no-snap', '')
        .attr('d', freehandPathData(shape.points))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', shape.strokeWidth ?? DEFAULT_FREEHAND_WIDTH)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('opacity', shape.opacity ?? 1)
        .attr('vector-effect', 'non-scaling-stroke');
      break;
    case 'image':
      // Drawn by drawImageShape in its own pass beneath everything else, and needing an href
      // resolved from ImageAssetStore that this DOM-only module has no business reaching for.
      // See draft-canvas.ts's draw().
      break;
  }
}

/**
 * (Re)populates one placed image's already-joined `<g class="reference-image-group">` — see
 * draft-canvas.ts's renderImages(), which only calls this for a shape that's new or changed.
 *
 * The `<image>` is drawn at the source rectangle and a clip rect at the box cuts it back — the
 * one place that has to know what `crop` means. Nested layers, innermost first: the flip
 * correction (undoes gRoot's Y flip), the mirror group, the crop clip, then `group` itself
 * (rotation).
 *
 * `preserveAspectRatio` is `none`: crop fractions only mean something if the picture fills its
 * rectangle.
 */
export function drawImageShape(group: RootGroup, shape: ImageShape, href: string): void {
  const center = imageCenter(shape);
  const src = imageSourceBox(shape);

  group.selectAll('*').remove();
  group.attr('transform', `rotate(${shape.rotationDeg ?? 0} ${center.x} ${center.y})`);

  let content: RootGroup = group;
  if (isCropped(shape.crop)) {
    // keyed off the shape, not the href, so two images sharing a picture don't collide.
    const clipId = `image-crop-${shape.id}`;
    group.append('clipPath')
      .attr('id', clipId)
      .attr('clipPathUnits', 'userSpaceOnUse')
      .append('rect')
      .attr('x', shape.x)
      .attr('y', shape.y)
      .attr('width', shape.width)
      .attr('height', shape.height);
    content = group.append('g').attr('clip-path', `url(#${clipId})`);
  }

  const imageParent = shape.mirrored
    ? content.append('g').attr('transform', `translate(${2 * center.x} 0) scale(-1 1)`)
    : content;

  imageParent.append('image')
    .attr('class', 'reference-image')
    .attr('href', href)
    .attr('xlink:href', href)
    .attr('transform', `translate(0 ${src.height}) scale(1 -1)`)
    .attr('x', src.x)
    .attr('y', -src.y)
    .attr('width', src.width)
    .attr('height', src.height)
    .attr('opacity', shape.opacity ?? DEFAULT_IMAGE_OPACITY)
    .attr('preserveAspectRatio', 'none')
    .style('pointer-events', 'none');
}

const POINT_MARKER_SIZE_PX = 5;

// Multiplies font size for per-line spacing — exported so shape-hit-test.ts's DOM-free
// footprint estimate can stay in sync with the actual rendered line spacing here.
export const TEXT_LINE_HEIGHT_RATIO = 1.2;
// Named so the inline editor overlay (draft-canvas.ts) can type in the same face the canvas
// renders in — an SVG <text> with no family set falls back to the UA default, which is not
// necessarily the CSS one the textarea would pick.
export const TEXT_FONT_FAMILY = 'sans-serif';

/**
 * The SVG transform that turns a label about its anchor. gUI is the *unflipped* overlay (world y
 * negated), so a counterclockwise turn in the Y-up world is a negative rotation here — the same
 * sign flip fileExporter's text markup makes inside its own Y-flipped group. Returns null when
 * there is nothing to turn, so the common case sets no attribute at all.
 */
function textRotateTransform(shape: TextShape): string | null {
  const deg = shape.rotationDeg ?? 0;
  if (!deg) return null;
  return `rotate(${-deg} ${shape.position.x} ${-shape.position.y})`;
}

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

/** Half-length of the ticks on the measured points and of the slashes on the dimension line, and
 * how far an extension line runs past the dimension line — screen px, so the marks stay the same
 * size at any zoom, like every other stroke here. */
const DIM_TICK_HALF_PX = 4;
const DIM_EXT_OVERSHOOT_PX = 5;
/** How far the number floats off the dimension line, on the side away from the measurement. */
const DIM_TEXT_GAP_PX = 8;

/**
 * A measured distance: ticks on the two points being measured, a dimension line carrying the
 * number, and — once that line has been pushed off the measurement — extension lines joining the
 * two. Offsetting is what lets several dimensions of the same feature stack clear of the drawing
 * instead of lying across it.
 *
 * The terminators on the dimension line change with the offset, and have to. Flat on the
 * measurement they are the perpendicular ticks this tool has always drawn; offset, those ticks
 * would run along the extension lines and disappear into them, so the ends become the drafting
 * slash at 45°, which no other line here is parallel to.
 *
 * Exported so dimension-tool.ts can draw its own in-progress preview through this exact function
 * rather than a lookalike — with three clicks to get through, a preview that disagrees with the
 * result is a preview that lies twice.
 */
export function drawDimension(
  gRoot: RootGroup, gUI: RootGroup, shape: Pick<DimensionShape, 'start' | 'end' | 'offset'>,
  color: string, pxPerMm: number, preview = false,
): void {
  const { start, end } = shape;
  const offset = shape.offset ?? 0;

  const stroke = <E extends d3.BaseType>(sel: d3.Selection<E, unknown, null, undefined>) => {
    sel.attr('stroke', color).attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke');
    if (preview) sel.attr('stroke-dasharray', DASH_PATTERN).style('pointer-events', 'none');
    return sel;
  };
  const segment = (a: Pt, b: Pt) => stroke(gRoot.append('line')
    .attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y));

  const geo = dimensionGeometry(start, end, offset);
  if (!geo) {
    // Nothing measured yet, and no direction to offset along — draw the degenerate segment so the
    // shape still has a body to select and the first click still shows something.
    segment(start, end);
    return;
  }
  const { dir, normal, p1, p2, mid, length } = geo;

  segment(p1, p2);

  const tick = DIM_TICK_HALF_PX / pxPerMm;
  const mark = (p: Pt, d: Pt) => segment(
    { x: p.x - d.x * tick, y: p.y - d.y * tick },
    { x: p.x + d.x * tick, y: p.y + d.y * tick },
  );
  mark(start, normal);
  mark(end, normal);

  // Which way is "away from the measurement" — for the extension lines' overshoot and for the
  // number, so both clear the drawing on whichever side the dimension line was placed.
  const side = offset < 0 ? -1 : 1;

  if (offset !== 0) {
    const over = (DIM_EXT_OVERSHOOT_PX / pxPerMm) * side;
    // data-no-snap: an extension line is bookkeeping about where the number sits, not geometry
    // anyone should be able to click onto. The ticks above stay snappable — they sit on the
    // points actually being measured.
    const extension = (from: Pt, to: Pt) => segment(from, { x: to.x + normal.x * over, y: to.y + normal.y * over })
      .attr('data-no-snap', '');
    extension(start, p1);
    extension(end, p2);

    const slash = { x: (dir.x + normal.x) / Math.SQRT2, y: (dir.y + normal.y) / Math.SQRT2 };
    mark(p1, slash);
    mark(p2, slash);
  }

  const textOff = (DIM_TEXT_GAP_PX / pxPerMm) * side;
  const text = gUI.append('text')
    .attr('x', mid.x + normal.x * textOff).attr('y', -(mid.y + normal.y * textOff))
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('fill', color)
    .attr('font-size', 12 / pxPerMm)
    .style('user-select', 'none')
    .text(`${length.toFixed(1)} mm`);
  if (preview) text.style('pointer-events', 'none');
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
      halo(gRoot.append('line')
        .attr('x1', shape.start.x).attr('y1', shape.start.y)
        .attr('x2', shape.end.x).attr('y2', shape.end.y));
      break;
    case 'dimension': {
      // Behind the dimension line where it was actually placed, not behind the measurement — the
      // offset line is the part you clicked and the part you drag.
      const geo = dimensionGeometry(shape.start, shape.end, shape.offset);
      const a = geo?.p1 ?? shape.start;
      const b = geo?.p2 ?? shape.end;
      halo(gRoot.append('line')
        .attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y));
      break;
    }
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
      const fontSizeMm = shape.fontSize ?? DEFAULT_TEXT_SIZE_MM;
      const probe = gUI.append('text')
        .attr('text-anchor', 'start')
        .attr('font-family', TEXT_FONT_FAMILY)
        .attr('font-size', fontSizeMm)
        .style('visibility', 'hidden');
      appendTextLines(probe, shape.position, shape.text || ' ', fontSizeMm);
      // Measured unrotated on purpose: getBBox reports a node's own user space and ignores its
      // transform, so the halo rect takes the same rotate the text does rather than trying to
      // bound a turned label with an upright box.
      const box = (probe.node() as SVGTextElement).getBBox();
      probe.remove();

      const pad = 3 / pxPerMm;
      const haloRect = gUI.append('rect')
        .attr('x', box.x - pad).attr('y', box.y - pad)
        .attr('width', box.width + pad * 2).attr('height', box.height + pad * 2)
        .attr('fill', SELECTION_HALO_COLOR)
        .attr('fill-opacity', 0.25)
        .attr('stroke', SELECTION_HALO_COLOR)
        .attr('stroke-width', 2)
        .attr('opacity', 0.6)
        .attr('vector-effect', 'non-scaling-stroke')
        .style('pointer-events', 'none');
      const haloRotate = textRotateTransform(shape);
      if (haloRotate) haloRect.attr('transform', haloRotate);
      break;
    }
    case 'point':
      halo(gRoot.append('circle')
        .attr('cx', shape.position.x).attr('cy', shape.position.y).attr('r', 3));
      break;
    case 'freehand':
      halo(gRoot.append('path').attr('d', freehandPathData(shape.points)));
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
