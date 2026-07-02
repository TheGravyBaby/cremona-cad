import { Pt, Rectangle } from '../../models/types';
import { renderLine, renderPath, renderRect } from '../../helpers/renderFuncs';
import { ArchingParams, CerutiColors, EnricoCerutiParams } from '../ceruti-types';

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
) {
  return (g: any, ui: any): void => {
    const zOuter = zInner + sign * thickness;
    const fo = Math.min(flutingOuterHalf ?? halfWidth, halfWidth);
    const fi = Math.min(flutingInnerHalf ?? fo, fo);

    renderLine(new Pt(-halfWidth, zInner), new Pt(halfWidth, zInner), colors.innerTrace)(g, ui);
    for (const side of [1, -1] as const) {
      renderLine(new Pt(side * halfWidth, zInner), new Pt(side * halfWidth, zOuter), colors.innerTrace)(g, ui);
      renderLine(new Pt(side * halfWidth, zOuter), new Pt(side * fo, zOuter), colors.innerTrace)(g, ui);
      renderLine(new Pt(side * fo, zOuter), new Pt(side * fi, zOuter), colors.fluting)(g, ui);
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
) => (g: any, ui: any): void => {
  if (topArchPath) renderPath(topArchPath, colors.archTop, 1.5)(g, ui);

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
    renderPlateEdges(colors, halfWidthOuter, flutingOuterHalf, flutingInnerHalf, a.ribHeight, a.top.thickness, 1)(g, ui);
    renderPlateEdges(colors, halfWidthOuter, flutingOuterHalf, flutingInnerHalf, 0, a.bottom.thickness, -1)(g, ui);
  }
};
