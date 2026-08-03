import { Pt } from '../../models/types';
import { renderCrosshair, renderDashedLine } from '../../helpers/renderFuncs';

// ===== Module-guide marks =====
// The crosshair and the height measure a spline's authored knots are read with,
// in both arching panels. The two draw different curves in different planes but
// mark them the same way, so the convention lives here once rather than as a
// pair of magic number lists at the call sites.
//
// Everything is sized in millimetres because the canvas is: these marks zoom
// with the drawing rather than holding a fixed pixel size. The numbers are
// chosen against an arch, which stands 10-17mm over a plate several hundred
// long — a mark has to be legible at that scale while staying visibly an
// annotation rather than part of the curve it sits on.

/** Half-arm of a knot crosshair, mm. */
const CROSS_MM = 0.8;
/** Half-length of the ticks capping a measure, mm. */
const TICK_MM = 0.8;
/** Type size of a measure's label, mm. */
const LABEL_MM = 2.6;
/** Knot to label centre: the crosshair's arm, then the label's own half-height. */
const LABEL_GAP_MM = CROSS_MM + LABEL_MM * 0.75;

/**
 * The level a run of measures counts from, carried from the takeoff the arch
 * leaves the channel at through to the far end of the run.
 *
 * Each measure already puts a tick on this level, but a row of ticks is not a
 * line — the eye cannot carry one out to the takeoff and see that they agree,
 * which is the whole question a module guide is asked. Dotted, because it is a
 * datum and not an edge: nothing is cut along it.
 */
export const renderGuideBaseline = (from: Pt, to: Pt, color: string) =>
  renderDashedLine(from, to, color, '1 3', 1, 0.55);

/**
 * Marks one authored knot. Deliberately small: the crosshair answers "the point
 * is here", and anything bigger starts hiding the millimetre or two of curve on
 * either side of it — which is the shape the panel exists to judge.
 */
export const renderGuideKnot = (at: Pt, color: string) =>
  renderCrosshair(at, color, CROSS_MM, 1, 0.9);

/**
 * A knot's height, drawn as a capped dimension from the level it counts from up
 * to the knot, labelled with the distance between them.
 *
 * The label sits past the far end on the measure's own axis — above a vertical
 * measure, off the end of a horizontal one — rather than beside its middle.
 * Beside the middle is where the knots' own curve is, and where the next knot's
 * label is: a plate carries several of these at once, and they collided both
 * with the arch and with each other.
 *
 * The number is the distance between the two points rather than something the
 * caller passes alongside them, so a measure cannot end up reporting a height
 * it isn't drawn at.
 */
export const renderGuideMeasure = (base: Pt, at: Pt, color: string) => (g: any, ui: any): void => {
  const dx = at.x - base.x;
  const dy = at.y - base.y;
  const len = Math.hypot(dx, dy);
  // A knot sitting on its own takeoff has no height to report, and the
  // direction the label would be placed along is undefined.
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  g.append('line')
    .attr('x1', base.x).attr('y1', base.y)
    .attr('x2', at.x).attr('y2', at.y)
    .attr('stroke', color)
    .attr('stroke-width', 1)
    .attr('opacity', 0.5)
    .attr('vector-effect', 'non-scaling-stroke');

  for (const P of [base, at]) {
    g.append('line')
      .attr('x1', P.x + nx * TICK_MM).attr('y1', P.y + ny * TICK_MM)
      .attr('x2', P.x - nx * TICK_MM).attr('y2', P.y - ny * TICK_MM)
      .attr('stroke', color)
      .attr('stroke-width', 1)
      .attr('opacity', 0.5)
      .attr('vector-effect', 'non-scaling-stroke');
  }

  // Anchored so the text grows away from the point it labels, which is what
  // keeps the gap clearing the crosshair whichever way the measure runs.
  const alongX = Math.abs(ux) > Math.abs(uy);
  ui.append('text')
    .text(`${len.toFixed(1)}mm`)
    // The ui layer is not Y-flipped, so the text stays upright.
    .attr('x', at.x + ux * LABEL_GAP_MM)
    .attr('y', -(at.y + uy * LABEL_GAP_MM))
    .attr('fill', color)
    .attr('font-size', LABEL_MM)
    .attr('text-anchor', alongX ? (ux > 0 ? 'start' : 'end') : 'middle')
    .attr('dominant-baseline', 'central')
    .attr('opacity', 0.9);
};
