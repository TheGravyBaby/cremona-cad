import { Pt } from '../../models/types';
import { renderPath, renderSegment } from '../../helpers/renderFuncs';
import { buildCatenaryPath, buildCycloidPath, buildSplinePath } from '../../helpers/math/pathMath';
import { ArchCurve, CerutiColors, EnricoCerutiParams, FlutingParams } from '../ceruti-types';
import { ribHeightAt, ribLine, solveRibTaper, topPlatePlacement } from '../ceruti-arching';
import { channelCapPath, LongArchSolve } from '../ceruti-arch-geometry';
import { HighlightedSplinePoint, STROKE_WEIGHT } from './render-constants';
import { renderArchGuide, renderSplineHighlight } from './long-arch.render';

// ===== Body section =====
// The instrument's side profile: the rib between the two plates, the top growing up off it and
// the back down. Both plates share one view — they are two faces of one instrument here, not
// two objects to compare side by side the way the plan views in the channel panel are. Drawn by
// the long-arching panel on its own and by the neck panel as the ground the neck stands on.

export type Plate = 'top' | 'bottom';

export interface BodySectionOptions {
  solved: Record<Plate, LongArchSolve | null>;
  gouge: Record<Plate, FlutingParams>;
  highlight?: (plate: Plate) => HighlightedSplinePoint | null;
  showGuides?: boolean;
  /** Draw the whole section in this one colour — for a panel where the body is the ground, not the subject. */
  color?: string;
}

export function renderBodySection(p: EnricoCerutiParams, colors: CerutiColors, opts: BodySectionOptions) {
  const taper = solveRibTaper(p);
  const rib = ribLine(p, taper);
  const placement = topPlatePlacement(p, taper);
  const paint = (c: string) => opts.color ?? c;
  return (g: any, ui: any): void => {
    renderPath(
      `M 0 ${rib.yLow} L ${rib.zLow} ${rib.yLow} L ${rib.zHigh} ${rib.yHigh} L 0 ${rib.yHigh} Z`,
      paint(colors.mouldTrace), STROKE_WEIGHT.guide,
    )(g, ui);
    // the corner positions, to locate the C-bout against the profile
    for (const corner of [p.bouts.UCr, p.bouts.LCr]) {
      if (corner) {
        renderSegment(
          new Pt(0, corner.y), new Pt(ribHeightAt(p, corner.y, taper), corner.y), paint(colors.mouldTrace), STROKE_WEIGHT.guide,
        )(g, ui);
      }
    }
    // top plate drawn in its own carved frame, placed onto the tilted rib line by one transform,
    // rather than teaching the arch/channel/guides each about an angle they have no other use for.
    // UI layer is Y-flipped against geometry, so its transform mirrors the sign.
    const { dx, dy, angleDeg, pivotX, pivotY } = placement;
    const tilted = {
      g: g.append('g').attr('transform', `translate(${dx},${dy}) rotate(${angleDeg},${pivotX},${pivotY})`),
      ui: ui.append('g').attr('transform', `translate(${dx},${-dy}) rotate(${-angleDeg},${pivotX},${-pivotY})`),
    };
    platePart(tilted.g, tilted.ui, 'top');
    platePart(g, ui, 'bottom');
  };

  // one plate: its inner face, the flat land at each cap, the channel, and the arch. no slab
  // outline — over everything but the last few millimetres the plate's outer surface *is* the
  // arch, so a rectangle drawn at plate level would contradict the curve the panel exists to show.
  function platePart(g: any, ui: any, plate: Plate): void {
    const a = p.arching!;
    const isTop = plate === 'top';
    const sign: 1 | -1 = isTop ? 1 : -1;
    const thickness = isTop ? a.top.thickness : a.bottom.thickness;
    // flat for both — the top plate's tilt is carried by the group it's drawn into, not here.
    const innerZ = isTop ? taper.zLower : 0;
    const outerZ = innerZ + sign * thickness;
    const color = paint(isTop ? colors.archTop : colors.archBack);
    const edge = paint(colors.innerTrace);
    const channel = paint(colors.fluting);
    const gouge = opts.gouge[plate];
    const solved = opts.solved[plate];
    const landEdge = p.outerFlutingDepth ?? 0;

    renderSegment(new Pt(innerZ, 0), new Pt(innerZ, p.height), edge, STROKE_WEIGHT.guide)(g, ui);
    for (const [yEnd, yLand] of [[0, landEdge], [p.height, p.height - landEdge]] as const) {
      renderSegment(new Pt(innerZ, yEnd), new Pt(outerZ, yEnd), edge, STROKE_WEIGHT.guide)(g, ui);
      renderSegment(new Pt(outerZ, yEnd), new Pt(outerZ, yLand), edge, STROKE_WEIGHT.guide)(g, ui);
    }

    // the channel at both caps — identical at each end and at every station, because it is the
    // tool rather than a curve fitted to the arch. drawn only as far as the arch's contact.
    const sEnd = solved?.takeoff.contactS;
    renderPath(channelCapPath(p, gouge, outerZ, sign, true, sEnd), channel, STROKE_WEIGHT.section)(g, ui);
    renderPath(channelCapPath(p, gouge, outerZ, sign, false, sEnd), channel, STROKE_WEIGHT.section)(g, ui);

    if (!solved) return;
    const { span, yStart, lowered, takeoff } = solved;
    const xBase = outerZ - sign * takeoff.takeoffDepth;

    renderSplineHighlight(lowered, span, yStart, xBase, sign, opts.highlight?.(plate) ?? null)(g, ui);
    renderPath(buildArchPathFor(lowered, span, yStart, xBase, sign), color, STROKE_WEIGHT.section)(g, ui);

    if (opts.showGuides) {
      const authored = isTop ? a.top.arch : a.bottom.arch;
      renderArchGuide(authored, span, yStart, outerZ, sign, color)(g, ui);
    }
  }
}

/** The arch path for whichever curve type the plate carries — mirrors ceruti-arching's private builder. */
function buildArchPathFor(arch: ArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1): string {
  switch (arch.type) {
    case 'catenary': return buildCatenaryPath(arch.archHeight, span, yStart, xBase, sign);
    case 'cycloid':  return buildCycloidPath(arch.archHeight, span, yStart, xBase, sign, arch.d);
    case 'spline':   return buildSplinePath(arch.archHeight, span, yStart, xBase, sign, arch.points, arch.peak);
  }
}
