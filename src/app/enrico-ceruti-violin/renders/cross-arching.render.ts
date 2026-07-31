import { Circle, Pt, Rectangle } from '../../models/types';
import { renderCircle, renderCrosshair, renderLine, renderPath, renderPointHalo, renderRect } from '../../helpers/renderFuncs';
import { ArchingParams, CerutiColors, EnricoCerutiParams } from '../ceruti-types';
import { CrossArchCycloidGuide, CrossArchSplineGuideKnot } from '../ceruti-arching';
import { HighlightedSplinePoint } from './render-constants';

/**
 * Coordinate mapping for all cross-arching renders:
 *   canvas X  =  violin X (width), centered on 0 — matches plan view
 *   canvas Y  =  Z (depth): back plate → negative, rib 0→ribHeight, top plate → positive
 */

/**
 * One plate slab of the section, drawn long-arch style: inner face across the
 * full plate width, end caps, and the outer face drawn only at the edges —
 * trace-colored out to the fluting platform's outer boundary, fluting-colored
 * from there to its inner boundary. Both boundaries are exact station chords,
 * so the fluting segment always meets the cross arch's takeoff point. The
 * middle stays open for the arch curve. `zInner` is the plate's inner face;
 * sign +1 grows the thickness upward (top plate), -1 downward (back plate).
 */
function renderPlateEdges(
  colors: CerutiColors,
  halfWidth: number,
  flutingOuterHalf: number | null,
  flutingInnerHalf: number | null,
  zInner: number,
  thickness: number,
  sign: 1 | -1,
  flutingSlicePath: string | null = null,
) {
  return (g: any, ui: any): void => {
    const zOuter = zInner + sign * thickness;
    const fo = Math.min(flutingOuterHalf ?? halfWidth, halfWidth);
    const fi = Math.min(flutingInnerHalf ?? fo, fo);

    renderLine(new Pt(-halfWidth, zInner), new Pt(halfWidth, zInner), colors.innerTrace)(g, ui);
    for (const side of [1, -1] as const) {
      renderLine(new Pt(side * halfWidth, zInner), new Pt(side * halfWidth, zOuter), colors.innerTrace)(g, ui);
      renderLine(new Pt(side * halfWidth, zOuter), new Pt(side * fo, zOuter), colors.innerTrace)(g, ui);
      // The carved channel profile replaces the flat platform segment when supplied.
      if (!flutingSlicePath) renderLine(new Pt(side * fo, zOuter), new Pt(side * fi, zOuter), colors.fluting)(g, ui);
    }
    if (flutingSlicePath) renderPath(flutingSlicePath, colors.fluting, 1.5)(g, ui);
  };
}

/**
 * Generating-circle guide for a cycloid cross-arch: the two circles (one per
 * side — concentric, equal radius when symmetric) whose rolling traces the
 * takeoff-to-peak rise, plus a small dot marking the peak itself. Same
 * construction as the long-arch panel's own cycloid guide, just built per
 * side (see {@link CrossArchCycloidGuide}).
 */
function renderCrossArchCycloidGuide(guide: CrossArchCycloidGuide | null, color: string) {
  return (g: any, ui: any): void => {
    if (!guide) return;
    if (guide.leftR !== null) renderCircle(new Circle(guide.center.x, guide.center.y, guide.leftR), color)(g, ui);
    if (guide.rightR !== null) renderCircle(new Circle(guide.center.x, guide.center.y, guide.rightR), color)(g, ui);
    renderCircle(new Circle(guide.peak.x, guide.peak.y, 1), color)(g, ui);
  };
}

/** Control-point crosshairs for a spline cross-arch, at the knots {@link calculateCrossArchSplineGuide} resolved. */
function renderCrossArchSplineGuide(knots: CrossArchSplineGuideKnot[] | null, color: string) {
  return (g: any, ui: any): void => {
    if (!knots) return;
    for (const k of knots) renderCrosshair(k.point, color, 2, 1.5, 1)(g, ui);
  };
}

/**
 * Halo behind the spline control point whose textbox has focus. Drawn whether
 * or not the module guides are showing — it answers "which point am I
 * editing?", which is most useful precisely when the crosshairs are off.
 * A mirrored point halos both of its knots, since they share a source.
 */
function renderCrossArchSplineHighlight(
  knots: CrossArchSplineGuideKnot[] | null, highlighted: HighlightedSplinePoint | null,
) {
  return (g: any, ui: any): void => {
    if (!knots || !highlighted) return;
    for (const k of knots) {
      if (k.source === highlighted.source) renderPointHalo(k.point, highlighted.color)(g, ui);
    }
  };
}

// ===== Render =====

/**
 * The section at the current station: the rib box (mould chord widened by rib
 * thickness each side) plus both plate slabs at the outer-path chord. The arch
 * curves land here as the cross-arching controls are built out.
 */
export const renderCrossSection = (
  p: EnricoCerutiParams,
  a: ArchingParams,
  colors: CerutiColors,
  showGuides = false,
  halfWidthInner: number | null,
  halfWidthOuter: number | null,
  flutingOuterHalf: number | null = null,
  flutingInnerHalf: number | null = null,
  topArchPath: string | null = null,
  flutingSliceTop: string | null = null,
  backArchPath: string | null = null,
  flutingSliceBottom: string | null = null,
  topCycloidGuide: CrossArchCycloidGuide | null = null,
  topSplineGuide: CrossArchSplineGuideKnot[] | null = null,
  backCycloidGuide: CrossArchCycloidGuide | null = null,
  backSplineGuide: CrossArchSplineGuideKnot[] | null = null,
  topSplineHighlight: HighlightedSplinePoint | null = null,
  backSplineHighlight: HighlightedSplinePoint | null = null,
) => (g: any, ui: any): void => {
  // Before the curves so a halo reads as sitting behind the arch it marks.
  renderCrossArchSplineHighlight(topSplineGuide, topSplineHighlight)(g, ui);
  renderCrossArchSplineHighlight(backSplineGuide, backSplineHighlight)(g, ui);

  if (topArchPath) renderPath(topArchPath, colors.archTop, 1.5)(g, ui);
  if (backArchPath) renderPath(backArchPath, colors.archBack, 1.5)(g, ui);

  if (halfWidthInner !== null) {
    const halfWidthRib = halfWidthInner + p.rib;
    const ribBox = new Rectangle(
      { x: -halfWidthRib, y: 0 },
      { x: halfWidthRib, y: a.ribHeight },
    );
    renderRect(ribBox, colors.mouldTrace)(g, ui);

    // Inner rib faces — the mould outline the ribs are bent around.
    renderLine(new Pt(-halfWidthInner, 0), new Pt(-halfWidthInner, a.ribHeight), colors.innerTrace)(g, ui);
    renderLine(new Pt(halfWidthInner, 0), new Pt(halfWidthInner, a.ribHeight), colors.innerTrace)(g, ui);
  }

  if (halfWidthOuter !== null) {
    renderPlateEdges(colors, halfWidthOuter, flutingOuterHalf, flutingInnerHalf, a.ribHeight, a.top.thickness, 1, flutingSliceTop)(g, ui);
    renderPlateEdges(colors, halfWidthOuter, flutingOuterHalf, flutingInnerHalf, 0, a.bottom.thickness, -1, flutingSliceBottom)(g, ui);
  }

  if (showGuides) {
    renderCrossArchCycloidGuide(topCycloidGuide, colors.archTop)(g, ui);
    renderCrossArchSplineGuide(topSplineGuide, colors.archTop)(g, ui);
    renderCrossArchCycloidGuide(backCycloidGuide, colors.archBack)(g, ui);
    renderCrossArchSplineGuide(backSplineGuide, colors.archBack)(g, ui);
  }
};
