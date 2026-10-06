import { Pt } from '../../models/types';
import { renderCrosshair, renderDashedLine } from '../../helpers/renderFuncs';
import { STROKE_WEIGHT } from './render-constants';

// the marks a spline's authored knots are read with, in both arching panels and on the neck. Sized
// in mm so they zoom with the drawing; small, against an arch 10-17mm over a plate several hundred long
const CROSS_MM = 0.8;
const TICK_MM = 0.8;
const LABEL_MM = 2.6;
const LABEL_GAP_MM = CROSS_MM + LABEL_MM * 0.75;

// the level a run of measures counts from. Dotted: a datum, not an edge
export const renderGuideBaseline = (from: Pt, to: Pt, color: string) =>
  renderDashedLine(from, to, color, '1 3', STROKE_WEIGHT.guide, 0.55);

export const renderGuideKnot = (at: Pt, color: string) =>
  renderCrosshair(at, color, CROSS_MM, STROKE_WEIGHT.guide, 0.9);

// a capped dimension from `base` to `at`, labelled with the distance between them unless `value` is
// given. `offset` parks the dimension line that far off the measurement along its perpendicular,
// with extension lines back to the points, for measures that sit on top of an edge
export const renderGuideMeasure = (base: Pt, at: Pt, color: string, offset = 0, value?: number) => (g: any, ui: any): void => {
  const dx = at.x - base.x;
  const dy = at.y - base.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  const line = (a: Pt, b: Pt, opacity: number) => g.append('line')
    .attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y)
    .attr('stroke', color)
    .attr('stroke-width', STROKE_WEIGHT.guide)
    .attr('opacity', opacity)
    .attr('vector-effect', 'non-scaling-stroke');

  const from = { x: base.x + nx * offset, y: base.y + ny * offset };
  const to = { x: at.x + nx * offset, y: at.y + ny * offset };

  if (offset) {
    line(base, from, 0.3);
    line(at, to, 0.3);
  }
  line(from, to, 0.5);

  for (const P of [from, to]) {
    g.append('line')
      .attr('x1', P.x + nx * TICK_MM).attr('y1', P.y + ny * TICK_MM)
      .attr('x2', P.x - nx * TICK_MM).attr('y2', P.y - ny * TICK_MM)
      .attr('stroke', color)
      .attr('stroke-width', STROKE_WEIGHT.guide)
      .attr('opacity', 0.5)
      .attr('vector-effect', 'non-scaling-stroke');
  }

  // the label sits past the far end on the measure's own axis, clear of the curve and the next
  // knot's label. The ui layer is not Y-flipped, so the text stays upright
  const alongX = Math.abs(ux) > Math.abs(uy);
  ui.append('text')
    .text(`${(value ?? len).toFixed(1)}mm`)
    .attr('x', to.x + ux * LABEL_GAP_MM)
    .attr('y', -(to.y + uy * LABEL_GAP_MM))
    .attr('fill', color)
    .attr('font-size', LABEL_MM)
    .attr('text-anchor', alongX ? (ux > 0 ? 'start' : 'end') : 'middle')
    .attr('dominant-baseline', 'central')
    .attr('opacity', 0.9);
};
