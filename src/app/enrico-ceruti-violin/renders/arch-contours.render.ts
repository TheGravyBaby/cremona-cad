import { Pt } from '../../models/types';
import { renderLine, renderPath } from '../../helpers/renderFuncs';
import { translatePath } from '../../helpers/svgPathMath';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';

/**
 * Plan-view contour (topo) map of one plate's surface, stacked above the
 * cross-section view on the same canvas (shared X axis, offset up by
 * `yOffset`). The two plates sit side by side via `xOffset`. Contour paths are
 * already offset by the generator; the outline and trough context paths are
 * translated here. Channel levels (z ≤ 0) draw fainter than the arch levels,
 * and the current section station is marked. `domeColor` tints the arch levels
 * per plate (archTop / archBack).
 */
export const renderArchContourMap = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  contours: { level: number; path: string }[],
  outlinePath: string | null,
  troughPath: string | null,
  yOffset: number,
  stationY: number | null,
  xOffset = 0,
  domeColor: string = colors.archTop,
) => (g: any, ui: any): void => {
  if (outlinePath) renderPath(translatePath(outlinePath, xOffset, yOffset), colors.outerTrace, 1, 0.6)(g, ui);
  if (troughPath) renderPath(translatePath(troughPath, xOffset, yOffset), colors.fluting, 1, 0.8)(g, ui);

  for (const c of contours) {
    const isChannel = c.level <= 0;
    renderPath(c.path, isChannel ? colors.fluting : domeColor, 1, isChannel ? 0.9 : 0.7)(g, ui);
  }

  if (stationY !== null) {
    const xEnd = p.width / 2 + p.overhang + p.rib + 6;
    renderLine(new Pt(xOffset - xEnd, stationY + yOffset), new Pt(xOffset + xEnd, stationY + yOffset), colors.mouldTrace, 1)(g, ui);
  }
};
