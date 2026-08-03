import { Pt } from '../../models/types';
import { renderPointHalo } from '../../helpers/renderFuncs';
import { archSplineKnots } from '../../helpers/svgPathMath';
import { ArchCurve } from '../ceruti-types';
import { renderGuideBaseline, renderGuideKnot, renderGuideMeasure } from './module-guide.render';
import { HighlightedSplinePoint } from './render-constants';

// ===== Long-arch overlays =====
// The crosshairs, halos and height labels a long arch is read with, in the side
// elevation both arching panels draw it in.
//
// Both take the curve and its frame rather than a panel or a plate, which is
// what lets one pair serve any panel that draws a long arch: they know how an
// `ArchCurve` maps onto the screen and nothing about who asked.

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

/**
 * The module guide: what the arch was built from, marked and measured on the
 * curve it produced. Heights read from the takeoff the arch was lowered to, so
 * a measure agrees with the number in the box it came from.
 */
export function renderArchGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    // Takeoff to takeoff: the span's two ends are exactly where the arch leaves
    // the channel, so the datum terminates on the points it exists to reach.
    renderGuideBaseline(new Pt(xBase, yStart), new Pt(xBase, yStart + span), color)(g, ui);
    for (const knot of archGuideKnots(arch)) {
      const y = yStart + knot.t * span;
      const at = new Pt(xBase + sign * knot.z, y);
      renderGuideMeasure(new Pt(xBase, y), at, color)(g, ui);
      renderGuideKnot(at, color)(g, ui);
    }
  };
}

/**
 * The points a curve was authored at, as span fraction and height — the same
 * distinction {@link crossArchGuide} draws over there, since the two curve
 * families are authored in genuinely different terms.
 *
 * A spline *is* its control points, so every knot is marked, peak and mirrored
 * twins included — that is what makes a collapsed or mirrored point visible as
 * such, and a spline's height varies knot to knot, so one label at mid-span
 * would only ever describe the peak. A catenary has no control points to mark:
 * its whole shape follows from the one height, at an apex that both closed
 * forms put at mid-span. So there is exactly one thing to say about it, and the
 * guide says it rather than leaving the curve unannotated.
 */
function archGuideKnots(arch: ArchCurve): { t: number; z: number }[] {
  switch (arch.type) {
    case 'spline': return archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5);
    case 'catenary':
    case 'cycloid': return [{ t: 0.5, z: arch.archHeight }];
  }
}
