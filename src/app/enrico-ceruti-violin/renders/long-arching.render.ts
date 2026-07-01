import { Circle, Rectangle } from '../../models/types';
import { renderCircle, renderCrosshair, renderLine, renderPath, renderRect } from '../../helpers/renderFuncs';
import { ArchCurve, ArchingParams, CerutiColors, EnricoCerutiParams } from '../ceruti-types';

// ===== Guide overlays =====

function renderSplineGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline') return;
    for (const pt of arch.points) {
      const cx  = xBase + sign * pt.z;
      const yHi = yStart + pt.t * span / 2;
      const yLo = yStart + span - pt.t * span / 2;
      renderCrosshair({ x: cx, y: yHi }, color, 2, 1.5, 1)(g, ui);
      renderCrosshair({ x: cx, y: yLo }, color, 2, 1.5, 1)(g, ui);
    }
  };
}

function renderCycloidGuide(
  arch: ArchCurve,
  span: number,
  yStart: number,
  xBase: number,
  sign: 1 | -1,
  color: string,
) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'cycloid' || arch.d <= 0.01 || arch.archHeight <= 0) return;
    const h  = arch.archHeight;
    // Rolling circle at arch midpoint (t=π):
    //   centre sits at h/2 above the plate-edge baseline (independent of d)
    //   radius r = h / (2d)  →  for d=1 the top of the circle touches the arch peak
    const r  = h / (2 * arch.d);
    const cx = xBase + sign * (h / 2);
    const cy = yStart + span / 2;
    renderCircle(new Circle(cx, cy, r), color)(g, ui);
    renderCircle(new Circle(xBase + sign * h, cy, 1), color)(g, ui);
  };
}

/**
 * Coordinate mapping for all long-arching renders:
 *   canvas X  =  Z (depth): back plate → negative, rib 0→ribHeight, top plate → positive
 *   canvas Y  =  violin Y (length): 0 at button end, params.height at neck
 */

// ===== Render =====

export const renderLongArchBoxes = (
  p: EnricoCerutiParams,
  a: ArchingParams,
  colors: CerutiColors,
  showGuides = false,
  topPath: string,
  backPath: string,
  span: number,
  yStart: number,
) => (g: any, ui: any): void => {
  const ribBox = new Rectangle(
    { x: 0, y: p.overhang },
    { x: a.ribHeight, y: p.height - p.overhang },
  );
  const topPlateBox = new Rectangle(
    { x: a.ribHeight, y: 0 },
    { x: a.ribHeight + a.top.thickness, y: p.height },
  );
  const backPlateBox = new Rectangle(
    { x: -a.bottom.thickness, y: 0 },
    { x: 0, y: p.height },
  );

  if (topPath)  renderPath(topPath,  colors.archTop,  1.5)(g, ui);
  if (backPath) renderPath(backPath, colors.archBack, 1.5)(g, ui);

  renderRect(ribBox, colors.mouldTrace)(g, ui);
  renderRect(topPlateBox, colors.outerTrace)(g, ui);
  renderRect(backPlateBox, colors.mouldTrace)(g, ui);
  renderLine({x:0, y: p.bouts.UCr.y}, {x:a.ribHeight, y: p.bouts.UCr.y}, colors.mouldTrace)(g, ui);
  renderLine({x:0, y: p.bouts.LCr.y}, {x:a.ribHeight, y: p.bouts.LCr.y}, colors.mouldTrace)(g, ui);



  if (showGuides) {
    renderCycloidGuide(a.top.arch,    span, yStart, a.ribHeight + a.top.thickness, 1,  colors.archTop)(g, ui);
    renderCycloidGuide(a.bottom.arch, span, yStart, -a.bottom.thickness,           -1, colors.archBack)(g, ui);
    renderSplineGuide(a.top.arch,    span, yStart, a.ribHeight + a.top.thickness, 1,  colors.archTop)(g, ui);
    renderSplineGuide(a.bottom.arch, span, yStart, -a.bottom.thickness,           -1, colors.archBack)(g, ui);
  } 


};
