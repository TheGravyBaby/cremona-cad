import { Pt } from '../../models/types';
import { renderPath, renderPointHalo, renderSegment, renderGuideBaseline, renderGuideKnot, renderGuideMeasure } from '../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../theme/palettes';
import { archSplineKnots } from '../../helpers/math/vibeMath';
import { occludePath } from '../../helpers/math/pathVibes';
import { ArchCurve, EnricoCerutiParams, FlutingParams } from '../ceruti-types';
import { ribHeightAt, ribLine, solveRibTaper, topPlatePlacement, buildArchPathFor, archGuideKnots } from '../calculation/arching/ceruti-arching';
import { channelCapPath, LongArchSolve } from '../calculation/arching/ceruti-arch-geometry';
import { defaultStringSetup } from '../calculation/neck/ceruti-neck';
import { outerCornerFlats } from '../calculation/outline/ceruti-paths';
import { HighlightedSplinePoint } from './render-constants';
import { PanelPalette } from '../../theme/theme.service';

// the body's side profile: the rib between the two plates, the top growing up off it and the back down.
// Drawn by the long-arching panel cut down the centreline, and by the neck panels seen from the side
// as the ground the neck stands on

// left of the front profile, the bridge's top over the taller rib clearing the plan's widest point
// by a quarter of the body's width. Read off the body and bridge height alone, so it sits in the
// same place whether or not the neck has been set
export function sideViewOffsetX(p: EnricoCerutiParams): number {
  const a = p.arching!;
  const bridgeHeight = (p.stringSetup ?? defaultStringSetup(p)).bridgeHeight;
  const reach = Math.max(a.ribHeightLower, a.ribHeightUpper) + a.top.thickness + a.top.arch.archHeight + bridgeHeight;
  return -(0.75 * p.width + reach);
}

export type Plate = 'top' | 'bottom';

export interface BodySideProfileOptions {
  solved: Record<Plate, LongArchSolve | null>;
  gouge: Record<Plate, FlutingParams>;
  highlight?: (plate: Plate) => HighlightedSplinePoint | null;
  showGuides?: boolean;
  // cut down the centreline so the channel shows, for the long arching panel; otherwise the plate's
  // edge stands its full length and hides the channel and the arch below it
  showChannel?: boolean;
  // the whole section in neutral, for a panel where the body is the ground rather than the subject
  ground?: boolean;
}

export function renderBodySideProfile(p: EnricoCerutiParams, pal: PanelPalette, opts: BodySideProfileOptions) {
  const taper = solveRibTaper(p);
  const rib = ribLine(p, taper);
  const placement = topPlatePlacement(p, taper);
  const { upper, lower } = opts.showChannel ? { upper: null, lower: null } : outerCornerFlats(p);
  const flatEnds = [...(upper ?? []), ...(lower ?? [])].map(pt => pt.y);
  return (g: any, ui: any): void => {
    renderPath(
      `M 0 ${rib.yLow} L ${rib.zLow} ${rib.yLow} L ${rib.zHigh} ${rib.yHigh} L 0 ${rib.yHigh} Z`,
      pal.neutral, STROKE_WEIGHT.guide,
    )(g, ui);
    for (const corner of [p.bouts.UCr, p.bouts.LCr]) {
      if (corner) {
        renderSegment(
          new Pt(0, corner.y), new Pt(ribHeightAt(p, corner.y, taper), corner.y), pal.neutral, STROKE_WEIGHT.guide,
        )(g, ui);
      }
    }
    // the top plate is drawn flat and tilted onto the rib line by one transform, rather than teaching
    // the arch, channel and guides each about an angle. The ui layer is Y-flipped, so its sign mirrors
    const { dx, dy, angleDeg, pivotX, pivotY } = placement;
    const tilted = {
      g: g.append('g').attr('transform', `translate(${dx},${dy}) rotate(${angleDeg},${pivotX},${pivotY})`),
      ui: ui.append('g').attr('transform', `translate(${dx},${-dy}) rotate(${-angleDeg},${pivotX},${-pivotY})`),
    };
    platePart(tilted.g, tilted.ui, 'top');
    platePart(g, ui, 'bottom');
  };

  // cut down the centreline there's no slab outline: over everything but the last few millimetres the
  // plate's outer surface is the arch, and a rectangle at plate level would contradict the curve
  function platePart(g: any, ui: any, plate: Plate): void {
    const a = p.arching!;
    const isTop = plate === 'top';
    const sign: 1 | -1 = isTop ? 1 : -1;
    const thickness = isTop ? a.top.thickness : a.bottom.thickness;
    const innerZ = isTop ? taper.zLower : 0;
    const outerZ = innerZ + sign * thickness;
    const color = opts.ground ? pal.neutral : isTop ? pal.ink(1) : pal.ink(2);
    const channel = opts.ground ? pal.neutral : pal.ink(3);
    const gouge = opts.gouge[plate];
    const solved = opts.solved[plate];
    const landEdge = p.outerFlutingDepth ?? 0;

    renderSegment(new Pt(innerZ, 0), new Pt(innerZ, p.height), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    const slab = `M ${innerZ} 0 L ${outerZ} 0 L ${outerZ} ${p.height} L ${innerZ} ${p.height} Z`;
    if (opts.showChannel) {
      for (const [yEnd, yLand] of [[0, landEdge], [p.height, p.height - landEdge]] as const) {
        renderSegment(new Pt(innerZ, yEnd), new Pt(outerZ, yEnd), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
        renderSegment(new Pt(outerZ, yEnd), new Pt(outerZ, yLand), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
      }
      // the channel is the tool, not a curve fitted to the arch, so it's the same at both caps
      renderPath(channelCapPath(p, gouge, outerZ, sign, true, solved?.takeoff.contactS), channel, STROKE_WEIGHT.section)(g, ui);
      renderPath(channelCapPath(p, gouge, outerZ, sign, false, solved?.farTakeoff.contactS), channel, STROKE_WEIGHT.section)(g, ui);
    } else {
      renderSegment(new Pt(innerZ, 0), new Pt(outerZ, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
      renderSegment(new Pt(innerZ, p.height), new Pt(outerZ, p.height), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
      renderSegment(new Pt(outerZ, 0), new Pt(outerZ, p.height), color, STROKE_WEIGHT.section)(g, ui);
      // where the corners' flats end on the outer path, across the edge
      for (const y of flatEnds) renderSegment(new Pt(innerZ, y), new Pt(outerZ, y), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    }

    if (!solved) return;
    const { span, yStart, lowered, takeoff, farZ } = solved;
    const xBase = outerZ - sign * takeoff.takeoffDepth;

    renderSplineHighlight(lowered, span, yStart, xBase, sign, opts.highlight?.(plate) ?? null)(g, ui);
    const arch = buildArchPathFor(lowered, span, yStart, xBase, sign, farZ);
    renderPath(opts.showChannel ? arch : occludePath(arch, slab).visible, color, STROKE_WEIGHT.section)(g, ui);

    if (opts.showGuides) {
      const authored = isTop ? a.top.arch : a.bottom.arch;
      renderArchGuide(authored, span, yStart, outerZ, sign, color, p.height)(g, ui);
    }
  }
}

// halo behind the spline point whose field has focus, drawn with the guides off too. A mirrored
// point halos both of its knots
function renderSplineHighlight(arch: ArchCurve, span: number, yStart: number, xBase: number, sign: 1 | -1, highlighted: HighlightedSplinePoint | null) {
  return (g: any, ui: any): void => {
    if (arch.type !== 'spline' || !highlighted) return;
    for (const knot of archSplineKnots(arch.archHeight, arch.points, arch.peak ?? 0.5)) {
      if (knot.source !== highlighted.source) continue;
      renderPointHalo(new Pt(xBase + sign * knot.z, yStart + knot.t * span), highlighted.color)(g, ui);
    }
  };
}

// the module guide takes the arch as authored and the plate's outer surface, not the lowered arch
// against its takeoff: the takeoff moves with the channel, and a guide counting from it would label
// a height nobody typed
function renderArchGuide(arch: ArchCurve, span: number, yStart: number, xPlate: number, sign: 1 | -1, color: string, plateLength: number) {
  return (g: any, ui: any): void => {
    renderGuideBaseline(new Pt(xPlate, 0), new Pt(xPlate, plateLength), color)(g, ui);
    for (const knot of archGuideKnots(arch)) {
      const y = yStart + knot.t * span;
      const at = new Pt(xPlate + sign * knot.z, y);
      renderGuideMeasure(new Pt(xPlate, y), at, color, 0, knot.z)(g, ui);
      renderGuideKnot(at, color)(g, ui);
    }
  };
}
