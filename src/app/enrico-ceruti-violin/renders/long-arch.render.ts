import { Pt } from '../../models/types';
import { renderCrosshair, renderMeasure, renderPointHalo } from '../../helpers/renderFuncs';
import { archSplineKnots } from '../../helpers/svgPathMath';
import { ArchCurve } from '../ceruti-types';
import { HighlightedSplinePoint } from './render-constants';

// ===== Long-arch spline overlays =====
// The crosshairs, halos and height labels a spline long arch is read with, in
// the side elevation both arching panels draw it in.
//
// All three take the curve and its frame rather than a panel or a plate, which
// is what lets one set serve any panel that draws a long arch: they know how an
// `ArchCurve` maps onto the screen and nothing about which model asked. They
// lived in the classic long-arching panel until that panel was retired.

/**
 * Halo behind the spline control point whose textbox has focus. Drawn whether
 * or not the module guides are showing — it answers "which point am I
 * editing?", which is most useful precisely when the crosshairs are off.
 * A mirrored point halos both of its knots, since they share a source.
 */
export function renderSplineHighlight(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  highlighted: HighlightedSplinePoint | null,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline' || !highlighted) return;
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      if (knot.source !== highlighted.source) continue;
      renderPointHalo(new Pt(xBase + sign * knot.z, yStart + knot.t * span), highlighted.color)(g, ui);
    }
  };
}

export function renderSplineGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline') return;
    // Mark the knots the curve was actually built from — peak and mirrored
    // twins included — so a collapsed or mirrored point is visible as such.
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      const pt = { x: xBase + sign * knot.z, y: yStart + knot.t * span };
      renderCrosshair(pt, color, 2, 1.5, 1)(g, ui);
    }
  };
}

/**
 * One height measure per spline knot (peak and every control point, mirrored
 * twins included) instead of the single centre measure the other curve types
 * get — a spline's height varies knot to knot, so one label at mid-span would
 * only ever describe the peak.
 */
export function renderSplineMeasures(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline') return;
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      const y = yStart + knot.t * span;
      renderMeasure(
        new Pt(xBase, y),
        new Pt(xBase + sign * knot.z, y),
        knot.z.toFixed(1),
        color, 3, 7,
      )(g, ui);
    }
  };
}
