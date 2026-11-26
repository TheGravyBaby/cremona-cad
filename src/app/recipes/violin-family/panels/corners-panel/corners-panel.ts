import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections, interceptCirclesAndPoint, interceptCirclesAndPointCompoundBySweep } from '../../../../helpers/math/draftMath';
import { angleFromCenter, dist, flipArcAboutY, flipPointAboutY, lineCircleIntersection, lineFromPointAndSlope, offsetArcRadius, pointOnCircle, signedArcSweep, TURN } from '../../../../helpers/math/simpleGeometry';
import { renderArcHalo, renderCircle, renderCrosshair, renderDashedLine, renderMirroredArc, renderMirroredArcFancy, renderPointHalo, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { buildBlankMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { CornerFailure, CornerKey, CornersSolve, MainBoutsSolve } from '../../violin-family-solves';
import { SEED_RATIOS, ViolinFamilyRatios } from '../../violin-family-seed';
import { updateSolved } from '../../violin-family-solved';
import { renderBoutBounds, renderMainBoutCircles, renderMainBouts, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';

// The corners and the C bout. Each bout's join arc (U2, L2, the main bouts' own) is ended by a
// corner arc (U3, L3) that runs onto the typed corner tip, or through a compound pair (U3 then U31)
// where one arc can't make the turn, or in one sweep (U4, L4) for a viol. C0, the C's own arc, is
// placed by its width and height or fitted to touch both join arcs (Kelly's four circles), and the
// corner arcs C2 and C1 turn it onto the same tips, each plain or compound. C0's numbers live with
// the bouts. Panel and renders, then solve and ratios.
type CornerHighlightKey = CornerKey | 'UCr' | 'LCr';

@Component({
  selector: 'app-vf-corners-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './corners-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class CornersPanel extends PanelComponentBase<CornerHighlightKey, ViolinFamilyRatios> {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showAllArcs', 'showModuleCircles', 'showAllCircles', 'showModuleGuides', 'renderOuterPath'];
  protected readonly pal = ThemeService.getPalette('classicCremona');

  // the first draft of the corners: the tips on their guide circles and every radius off the seed
  // ratios, the compound ones included, so a toggle only reveals fields that already have values.
  // The shell runs this as the panel opens and on every edit, so undo back past a seed seeds again
  static seed(p: ViolinFamilyParams): void {
    if (p.corners) return;
    let tips = calcDefaultCornerTips(p);
    if (!tips) return;
    let inset = p.body.overhang + p.body.rib;
    let LBWI = p.body.width - 2 * inset;

    p.corners = {
      UCr: tips.UCr,
      LCr: tips.LCr,
      U3R: Math.round(LBWI * SEED_RATIOS.U3toLBW),
      U31R: Math.round(LBWI * SEED_RATIOS.U31toLBW),
      U31Sweep: 30,
      U31DoubleArc: false,
      useViolCornerUC: false,
      L3R: Math.round(LBWI * SEED_RATIOS.L3toLBW),
      L31R: Math.round(LBWI * SEED_RATIOS.L31toLBW),
      L31Sweep: 45,
      L31DoubleArc: false,
      useViolCornerLC: false,
      C2R: Math.round(LBWI * SEED_RATIOS.C2toLBW),
      C21R: Math.round(LBWI * SEED_RATIOS.C21toLBW),
      C21Sweep: 65,
      C21DoubleArc: false,
      C1R: Math.round(LBWI * SEED_RATIOS.C1toLBW),
      C11R: Math.round(LBWI * SEED_RATIOS.C11toLBW),
      C11Sweep: 60,
      C11DoubleArc: false,
    };
  }

  // what the last draw solved; the template and reportSolveFailures() read these rather than solving again
  m!: MainBoutsSolve;
  c!: CornersSolve;

  // turning the fit off keeps the width and height it found, so the hand fields carry on from
  // the fitted shape rather than jumping back to what was typed before it
  fitChanged(): void {
    let b = this.params.bouts!;
    if (!b.useKellyC0 && this.c.C0 && this.c.CBW != null) {
      b.CBW = Math.round(this.c.CBW * 10) / 10;
      b.C0Y = Math.round(this.c.C0.y * 10) / 10;
    }
    this.recordEditAndRedraw();
  }

  // the tip goes back onto its guide circle; the arcs keep their radii
  defaultCorner(corner: 'upper' | 'lower'): void {
    let tips = calcDefaultCornerTips(this.params);
    if (!tips) return;
    if (corner === 'upper') this.params.corners!.UCr = tips.UCr;
    else this.params.corners!.LCr = tips.LCr;
    this.recordEditAndRedraw();
  }

  reportSolveFailures(): void {
    reportFailures(this.c.failures, 'Corners');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let m = this.m = solveMainBouts(p)!;
    let c = this.c = solveCorners(p)!;
    this.ratios = calcCornersRatios(p);
    let layers: RenderLayer[] = [];

    if (this.flags.showModuleGuides) {
      let hw = p.body.width / 2;
      layers.push(renderBoutBounds(p, this.pal));
      // the height C0 is placed at, or was fitted to
      if (c.C0) layers.push(renderDashedLine(new Pt(-hw, c.C0.y), new Pt(hw, c.C0.y), this.pal.ink(3)));
    }
    if (this.flags.showModuleCircles || this.flags.showAllCircles) layers.push(renderCornerCircles(p, c, this.pal));
    if (this.flags.showAllCircles) layers.push(renderMainBoutCircles(m, this.pal));
    // the bouts in grey under this panel's corners and C bout
    layers.push(
      renderMainBouts(p, { ...m, U2: c.U2 ?? m.U2, L2: c.L2 ?? m.L2 }, this.pal, this.flags, false, null),
      renderSolveFailures(m.failures, this.pal.alert, true),
      renderCorners(p, c, this.pal, this.flags, true, this.highlightedPart),
      renderSolveFailures(c.failures, this.pal.alert, true),
    );
    return layers;
  }
}

// each corner and C bout arc carried round to its full circle, in the arc's own ink
export const renderCornerCircles = (p: ViolinFamilyParams, c: CornersSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let k = p.corners!;
  let upperSide = pal.ink(1).faint(-2);
  let upperTip = pal.ink(4);
  let bout = pal.ink(3);
  let lowerSide = pal.ink(0).faint(-2);
  let lowerTip = pal.ink(2);

  if (k.useViolCornerUC) {
    if (c.U4) renderCircle(c.U4, upperSide, true)(g, ui);
  } else {
    if (c.U3) renderCircle(c.U3, upperTip, true)(g, ui);
    if (k.U31DoubleArc && c.U31) renderCircle(c.U31, upperTip, true)(g, ui);
  }
  if (k.useViolCornerLC) {
    if (c.L4) renderCircle(c.L4, lowerSide, true)(g, ui);
  } else {
    if (c.L3) renderCircle(c.L3, lowerTip, true)(g, ui);
    if (k.L31DoubleArc && c.L31) renderCircle(c.L31, lowerTip, true)(g, ui);
  }
  if (c.C2) renderCircle(c.C2, upperTip, true)(g, ui);
  if (k.C21DoubleArc && c.C21) renderCircle(c.C21, upperTip, true)(g, ui);
  if (c.C1) renderCircle(c.C1, lowerTip, true)(g, ui);
  if (k.C11DoubleArc && c.C11) renderCircle(c.C11, lowerTip, true)(g, ui);
  if (c.C0) renderCircle(c.C0, bout, true)(g, ui);
};

// the corners and C bout in their own colours on this panel, where their fields are; grey under
// another panel's work unless all arcs are shown. The plate edge offsets out from the bout-side
// arcs and in from the corner arcs that turn back onto the tip; in from C0, and from a C corner
// arc whichever way that arc turns (calcCornerTurn). A section that failed isn't drawn; its failure is
export const renderCorners = (
  p: ViolinFamilyParams,
  c: CornersSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs' | 'showAllArcs' | 'renderOuterPath'>,
  currentModule: boolean,
  highlighted: { key: CornerHighlightKey; color: string } | null,
) => (g: any, ui: any): void => {
  let k = p.corners!;
  let inset = p.body.overhang + p.body.rib;
  let moduleArcs = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  let upperSide = pal.ink(1).faint(-2);
  let upperTip = pal.ink(4);
  let bout = pal.ink(3);
  let lowerSide = pal.ink(0).faint(-2);
  let lowerTip = pal.ink(2);

  if (highlighted) {
    if (highlighted.key === 'UCr' || highlighted.key === 'LCr') {
      // the tip's own crosshair goes down with the halo, so the mark reads with the module
      // crosshairs below switched off
      let tip = k[highlighted.key];
      for (let P of [tip, flipPointAboutY(tip)]) {
        renderPointHalo(P, highlighted.color)(g, ui);
        renderCrosshair(P, highlighted.color)(g, ui);
      }
    } else {
      let arc = c[highlighted.key];
      if (arc) {
        renderArcHalo(arc, highlighted.color)(g, ui);
        renderArcHalo(flipArcAboutY(arc), highlighted.color)(g, ui);
      }
    }
  }

  if (currentModule && flags.showModuleArcs) {
    for (let P of [k.UCr, flipPointAboutY(k.UCr)]) renderCrosshair(P, pal.ink(4).faint(5))(g, ui);
    for (let P of [k.LCr, flipPointAboutY(k.LCr)]) renderCrosshair(P, pal.ink(2).faint(5))(g, ui);
  }
  if (moduleArcs) {
    if (k.useViolCornerUC) {
      if (c.U4) renderMirroredArcFancy(c.U4, upperSide)(g, ui);
    } else {
      if (c.U3) renderMirroredArcFancy(c.U3, upperTip)(g, ui);
      if (k.U31DoubleArc && c.U31) renderMirroredArcFancy(c.U31, upperTip)(g, ui);
    }
    if (k.useViolCornerLC) {
      if (c.L4) renderMirroredArcFancy(c.L4, lowerSide)(g, ui);
    } else {
      if (c.L3) renderMirroredArcFancy(c.L3, lowerTip)(g, ui);
      if (k.L31DoubleArc && c.L31) renderMirroredArcFancy(c.L31, lowerTip)(g, ui);
    }
    if (c.C2) renderMirroredArcFancy(c.C2, upperTip)(g, ui);
    if (k.C21DoubleArc && c.C21) renderMirroredArcFancy(c.C21, upperTip)(g, ui);
    if (c.C1) renderMirroredArcFancy(c.C1, lowerTip)(g, ui);
    if (k.C11DoubleArc && c.C11) renderMirroredArcFancy(c.C11, lowerTip)(g, ui);
    if (c.C0) renderMirroredArcFancy(c.C0, bout)(g, ui);
  }

  // the outline at offset d from the rib line: 0 is the rib, unless the module arcs stand in
  // for it, and the inset is the plate's edge
  let offsets = [...(moduleArcs ? [] : [0]), ...(flags.renderOuterPath ? [inset] : [])];
  let upperOut = calcCornerTurn(c.C2, c.C0);
  let lowerOut = calcCornerTurn(c.C1, c.C0);
  let upperSideTrace = currentModule ? upperSide : pal.neutral;
  let upperTipTrace = currentModule ? upperTip : pal.neutral;
  let boutTrace = currentModule ? bout : pal.neutral;
  let lowerSideTrace = currentModule ? lowerSide : pal.neutral;
  let lowerTipTrace = currentModule ? lowerTip : pal.neutral;
  for (let d of offsets) {
    if (k.useViolCornerUC) {
      if (c.U4) renderMirroredArc(offsetArcRadius(c.U4, d), upperSideTrace, STROKE_WEIGHT.trace)(g, ui);
    } else {
      if (c.U3) renderMirroredArc(offsetArcRadius(c.U3, -d), upperTipTrace, STROKE_WEIGHT.trace)(g, ui);
      if (k.U31DoubleArc && c.U31) renderMirroredArc(offsetArcRadius(c.U31, -d), upperTipTrace, STROKE_WEIGHT.trace)(g, ui);
    }
    if (k.useViolCornerLC) {
      if (c.L4) renderMirroredArc(offsetArcRadius(c.L4, d), lowerSideTrace, STROKE_WEIGHT.trace)(g, ui);
    } else {
      if (c.L3) renderMirroredArc(offsetArcRadius(c.L3, -d), lowerTipTrace, STROKE_WEIGHT.trace)(g, ui);
      if (k.L31DoubleArc && c.L31) renderMirroredArc(offsetArcRadius(c.L31, -d), lowerTipTrace, STROKE_WEIGHT.trace)(g, ui);
    }
    if (c.C2) renderMirroredArc(offsetArcRadius(c.C2, upperOut * d), upperTipTrace, STROKE_WEIGHT.trace)(g, ui);
    if (k.C21DoubleArc && c.C21) renderMirroredArc(offsetArcRadius(c.C21, upperOut * d), upperTipTrace, STROKE_WEIGHT.trace)(g, ui);
    if (c.C1) renderMirroredArc(offsetArcRadius(c.C1, lowerOut * d), lowerTipTrace, STROKE_WEIGHT.trace)(g, ui);
    if (k.C11DoubleArc && c.C11) renderMirroredArc(offsetArcRadius(c.C11, lowerOut * d), lowerTipTrace, STROKE_WEIGHT.trace)(g, ui);
    if (c.C0) renderMirroredArc(offsetArcRadius(c.C0, -d), boutTrace, STROKE_WEIGHT.trace)(g, ui);
  }
};

// which way a C corner arc's plate edge offsets. C0 is tangent to each corner arc, so one centred
// further than C0's radius from C0's centre sits outside it and its plate edge is the larger
// circle (1); one that has inverted into the C offsets the other way (-1). A compound corner's
// second arc follows its first
export const calcCornerTurn = (arc: Arc | null, C0: Arc | null): 1 | -1 => arc && C0 && dist(arc, C0) > C0.r ? 1 : -1;

// where a corner tip goes before the maker has placed it, courtesy of David Beard: a line at the
// ratio height of the body, and a guide circle drawn from the bout to that line; where they cross
// is the default. Null until the main bouts solve, since the circles stand on U1 and L1
export function calcDefaultCornerTips(p: ViolinFamilyParams): { UCr: Pt; LCr: Pt } | null {
  if (!p.bouts) return null;
  let m = solveMainBouts(p)!;
  if (!m.U1 || !m.L1) return null;
  let inset = p.body.overhang + p.body.rib;
  let LBW = p.body.width;
  let UBW = p.bouts.UBW;

  let lgPt = new Pt(-LBW / 2, m.L1.y);
  let lgC = new Circle(lgPt.x, lgPt.y, LBW)
  let lgH = p.body.height * SEED_RATIOS.LCYtoH
  let LCr = lineCircleIntersection(lineFromPointAndSlope({ x: 0, y: lgH }, 0), lgC).sort((a, b) => a.x - b.x)[1]

  let ugPt = new Pt(-UBW / 2 + inset, m.U1.y);
  let ugC = new Circle(ugPt.x, ugPt.y, UBW) // scaler to make it a bit wider
  let ugH = p.body.height * SEED_RATIOS.UCYtoH
  let UCr = lineCircleIntersection(lineFromPointAndSlope({ x: 0, y: ugH }, 0), ugC).sort((a, b) => a.x - b.x)[1]

  return {
    UCr: new Pt(Math.round(UCr.x * 10) / 10, Math.round(UCr.y * 10) / 10),
    LCr: new Pt(Math.round(LCr.x * 10) / 10, Math.round(LCr.y * 10) / 10),
  };
}

// the rib outline's arcs, gathered from the main bouts and the corners, the bout arcs as the
// corners trimmed them. Null unless every arc the options call for has solved.
// A later panel stands its own lines off this outline
export type RibArcs = {
  U0: Arc; U1: Arc; L0: Arc; L1: Arc; C0: Arc; C2: Arc; C1: Arc;
  U2: Arc | null; U3: Arc | null; U31: Arc | null; U4: Arc | null;
  L2: Arc | null; L3: Arc | null; L31: Arc | null; L4: Arc | null;
  C21: Arc | null; C11: Arc | null;
  V0: Arc | null;
};

export function solvedRibArcs(p: ViolinFamilyParams): RibArcs | null {
  updateSolved(p);
  let held = p.solved!.ribArcs;
  if (held.solve === undefined) held.solve = solveRibArcs(p);
  return held.solve;
}

export function solveRibArcs(p: ViolinFamilyParams): RibArcs | null {
  let m = solveMainBouts(p), c = solveCorners(p);
  if (!m || !c) return null;
  let k = p.corners!;
  let rib = {
    U0: m.U0, U1: c.U1, L0: m.L0, L1: c.L1, C0: c.C0, C2: c.C2, C1: c.C1,
    U2: c.U2, U3: c.U3, U31: c.U31, U4: c.U4,
    L2: c.L2, L3: c.L3, L31: c.L31, L4: c.L4,
    C21: c.C21, C11: c.C11,
    V0: m.V0,
  };
  let needed = [
    rib.U0, rib.U1, rib.L0, rib.L1, rib.C0, rib.C2, rib.C1,
    ...(k.useViolCornerUC ? [rib.U4] : [rib.U2, rib.U3, ...(k.U31DoubleArc ? [rib.U31] : [])]),
    ...(k.useViolCornerLC ? [rib.L4] : [rib.L2, rib.L3, ...(k.L31DoubleArc ? [rib.L31] : [])]),
    ...(k.C21DoubleArc ? [rib.C21] : []),
    ...(k.C11DoubleArc ? [rib.C11] : []),
    ...(p.bouts!.useViolNeck ? [rib.V0] : []),
  ];
  return needed.every(arc => !!arc) ? rib as RibArcs : null;
}

// a later panel reads the corners and the C bout by calling this; it returns and never writes to
// the params. The main bouts are solved again here rather than passed in, so every stage is a
// function of params
export function solveCorners(p: ViolinFamilyParams): CornersSolve | null {
  if (!p.corners || !p.bouts) return null;
  let m = solveMainBouts(p)!;
  let b = p.bouts;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;

  let s: CornersSolve = {
    U1: m.U1, U2: null, U3: null, U31: null, U4: null,
    L1: m.L1, L2: null, L3: null, L31: null, L4: null,
    C0: null, C2: null, C21: null, C1: null, C11: null, CBW: null,
    failures: [],
  };

  solveSection(s.failures, 'Upper corner', ['U2', 'U3', 'U31', 'U4'], () => {
    let missing = buildBlankCornerMiss('Upper corner', ['U2', 'U3', 'U31', 'U4'], 'upper bout', m.U2, [k.UCr.x, k.UCr.y, k.U3R, ...(k.U31DoubleArc ? [k.U31R, k.U31Sweep] : [])]);
    if (missing) return missing;
    let U1 = m.U1!;
    let U2 = m.U2!;
    let UCr = k.UCr;

    if (k.U31DoubleArc) {
      // both corner arcs turn back against the bout; U31 turns through the typed sweep onto the tip
      let sweep = -Math.sign(signedArcSweep(U1)) * k.U31Sweep * TURN.degree;
      let compoundCircles = interceptCirclesAndPointCompoundBySweep(U2, UCr, k.U3R, k.U31R, sweep).sort((a, b) => a.C1.y - b.C1.y)[1];
      if (!compoundCircles)
        return buildCornerMiss('Upper corner', 'U2', U2, 'U3', UCr, true, ['U2', 'U3', 'U31', 'U4'])
      let U3start = circleCircleIntersections(compoundCircles.C1, U2)[0]
      let U31start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

      s.U2 = arcFromCircle(U2, U2.start, angleFromCenter(U2, U3start));
      s.U3 = arcFromCircleAndPoints(compoundCircles.C1, U3start, U31start);
      s.U31 = arcFromCircleAndPoints(compoundCircles.C2, U31start, UCr);
    }
    else {
      let U3R = k.U3R;
      let U3Circle = interceptCirclesAndPoint(U2, UCr, U3R).sort((a, b) => a.y - b.y)[1];
      if (!U3Circle)
        return buildCornerMiss('Upper corner', 'U2', U2, 'U3', UCr, false, ['U2', 'U3', 'U31', 'U4'])
      let U3 = arcFromCircle(U3Circle);

      let U2Intersect = circleCircleIntersections(U2, U3).sort((a, b) => a.y - b.y);
      let U2Angle = angleFromCenter(U2, U2Intersect[1]);
      s.U2 = arcFromCircle(U2, U2.start, U2Angle);
      s.U3 = arcFromCircleAndPoints(U3, U2Intersect[1], UCr);
    }
    if (k.useViolCornerUC) {
      // one arc leaving U1's end the way U1 was heading, through the tip: its centre is on U1's
      // own radius there, beyond the bout where the tip lies outside that heading
      let U1EndPt = pointOnCircle(U1, U1.end);
      let a = UCr.y - U1EndPt.y
      let b = U1EndPt.x - UCr.x
      let U4r = (a * a + b * b) / (2 * (b * Math.cos(U1.end) - a * Math.sin(U1.end)))

      let u4 = new Circle(U1EndPt.x - U4r * Math.cos(U1.end), U1EndPt.y - U4r * Math.sin(U1.end), Math.abs(U4r));
      s.U4 = arcFromCircleAndPoints(u4, U1EndPt, UCr);
    }
    return null
  });

  solveSection(s.failures, 'Lower corner', ['L2', 'L3', 'L31', 'L4'], () => {
    let missing = buildBlankCornerMiss('Lower corner', ['L2', 'L3', 'L31', 'L4'], 'lower bout', m.L2, [k.LCr.x, k.LCr.y, k.L3R, ...(k.L31DoubleArc ? [k.L31R, k.L31Sweep] : [])]);
    if (missing) return missing;
    let L1 = m.L1!;
    let L2 = m.L2!;
    let LCr = k.LCr;

    // L4 lands on the result only once the corner has solved, so a failed corner draws nothing
    let L4: Arc | null = null;
    if (k.useViolCornerLC) {
      let L1EndPt = pointOnCircle(L1, L1.end);
      let a = LCr.y - L1EndPt.y
      let b = L1EndPt.x - LCr.x
      let L4r = (a * a + b * b) / (2 * (b * Math.cos(L1.end) - a * Math.sin(L1.end)))

      let l4 = new Circle(L1EndPt.x - L4r * Math.cos(L1.end), L1EndPt.y - L4r * Math.sin(L1.end), Math.abs(L4r));
      L4 = arcFromCircleAndPoints(l4, L1EndPt, LCr);
    }
    if (k.L31DoubleArc) {
      let sweep = -Math.sign(signedArcSweep(L1)) * k.L31Sweep * TURN.degree;
      let compoundCircles = interceptCirclesAndPointCompoundBySweep(L2, LCr, k.L3R, k.L31R, sweep).sort((a, b) => a.C1.y - b.C1.y)[0];
      if (!compoundCircles)
        return buildCornerMiss('Lower corner', 'L2', L2, 'L3', LCr, true, ['L2', 'L3', 'L31', 'L4'])
      let L3start = circleCircleIntersections(compoundCircles.C1, L2)[0]
      let L31start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

      s.L2 = arcFromCircle(L2, L2.start, angleFromCenter(L2, L3start));
      s.L3 = arcFromCircleAndPoints(compoundCircles.C1, L3start, L31start);
      s.L31 = arcFromCircleAndPoints(compoundCircles.C2, L31start, LCr);
    }
    else {
      let L3R = k.L3R;
      let L3Circle = interceptCirclesAndPoint(L2, LCr, L3R).sort((a, b) => a.y - b.y)[0];
      if (!L3Circle)
        return buildCornerMiss('Lower corner', 'L2', L2, 'L3', LCr, false, ['L2', 'L3', 'L31', 'L4'])
      let L3 = arcFromCircle(L3Circle);

      let L2Intersect = circleCircleIntersections(L2, L3).sort((a, b) => a.y - b.y)[0];
      let L2Angle = angleFromCenter(L2, L2Intersect);

      s.L2 = arcFromCircle(L2, L2.start, L2Angle);
      s.L3 = arcFromCircleAndPoints(L3, L2Intersect, LCr);
    }
    s.L4 = L4;
    return null
  });

  // C0's circle once it is placed, by hand or by the fit; the C corner arcs stand on it
  let placed: Arc | null = null;
  solveSection(s.failures, 'Center bout', ['C0', 'C2', 'C21', 'C1', 'C11'], () => {
    let missing = buildBlankMiss('Center bout', ['C0', 'C2', 'C21', 'C1', 'C11'], b.useKellyC0 ? [b.C0R] : [b.C0R, b.C0Y, b.CBW]);
    if (missing) return missing;

    if (b.useKellyC0) {
      let U2 = s.U2;
      let L2 = s.L2;
      let kellyMiss: CornerFailure = {
        message: `Fit C0 to Bouts: no C0 of this radius touches both U2 and L2. Enlarge C0, or place it by hand.`,
        unsolved: ['C0', 'C2', 'C21', 'C1', 'C11'],
        circles: [U2, L2].filter((arc): arc is Arc => !!arc),
        segments: [],
      };
      if (!U2 || !L2)
        return { ...kellyMiss, message: 'Fit C0 to Bouts: both corners have to solve first.' };
      let C0 = new Arc(0, b.C0Y, b.C0R);

      let UtoL = dist(U2, L2);  // these joining circles are the ones that must intercept with C0, modified kelly theory
      let UtoC = U2.r + C0.r;
      let LtoC = L2.r + C0.r;

      let theta = Math.acos((UtoL * UtoL + UtoC * UtoC - LtoC * LtoC) / (2 * UtoL * UtoC));  // angle off U2 to C0, but with the Y axis as the line from U2 to L2
      // outside acos's domain no triangle closes, and the NaN would sail past the distance check below
      if (!Number.isFinite(theta))
        return kellyMiss

      // now we need to begin converting this to the proper coordinate space
      // first, the above theta needs to be referenced added to 3/2 pi, as it is pointing down
      theta = theta + 3 * TURN.quarter; // angle from U2 to C0, with the line from U2 to L2 as reference

      // now we need to convert the angle to the standard xy plane
      let angleFromU2toL2 = Math.atan2(L2.y - U2.y, L2.x - U2.x);
      let diffFromYAxis = TURN.quarter + angleFromU2toL2; // angle from the line U2 to L2, to the Y axis
      theta = theta + diffFromYAxis; // angle from U2 to C0, with the standard xy plane as reference

      // cos(finalAngle) = o / r = (C0.x - U2.x) / (C0.r + U2.r)
      // sin(finalAngle) = a / r = (U2.y - C0.y) / (C0.r + U2.r)
      C0.x = Math.abs(U2.x + Math.cos(theta) * UtoC);
      C0.y = Math.abs(U2.y + Math.sin(theta) * UtoC);

      let C0toL2 = dist(C0, L2);
      let C0toU2 = dist(C0, U2);
      let C0rU2r = C0.r + L2.r
      let C0rL2r = C0.r + U2.r
      let tolerance = .1
      if (C0toL2 > C0rU2r + tolerance || C0toU2 > C0rL2r + tolerance)
        return kellyMiss

      // makes sense to recalculate center bout width here
      s.CBW = (C0.x - C0.r + inset) * 2;
      placed = C0;
    }
    else {
      placed = new Arc(b.CBW / 2 - inset + b.C0R, b.C0Y, b.C0R);
      s.CBW = b.CBW;
    }
    return null
  });

  let CUIntercept: Pt | undefined;
  let CLIntercept: Pt | undefined;

  // the C corner arcs have nothing to stand on until C0 is placed; its failure says so
  solveSection(s.failures, 'Upper corner', ['C0', 'C2', 'C21'], () => {
    let C0 = placed;
    if (!C0) return null;
    let missing = buildBlankMiss('Upper corner', ['C0', 'C2', 'C21'], [k.UCr.x, k.UCr.y, k.C2R, ...(k.C21DoubleArc ? [k.C21R, k.C21Sweep] : [])]);
    if (missing) return missing;
    if (k.C21DoubleArc) {
      // drawn from C0 out to its tip, the upper corner turns clockwise and the lower
      // counterclockwise; the second arc turns through the typed sweep onto the tip
      let sweep = -k.C21Sweep * TURN.degree;
      let compoundCircles = interceptCirclesAndPointCompoundBySweep(C0, k.UCr, k.C2R, k.C21R, sweep).sort((a, b) => a.C1.y - b.C1.y)[0];
      if (!compoundCircles)
        return buildCornerMiss('Upper corner', 'C0', C0, 'C2', k.UCr, true, ['C0', 'C2', 'C21'])
      CUIntercept = circleCircleIntersections(compoundCircles.C1, C0)[1]
      let C21start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

      s.C2 = arcFromCircleAndPoints(compoundCircles.C1, CUIntercept, C21start);
      s.C21 = arcFromCircleAndPoints(compoundCircles.C2, C21start, k.UCr);
    }
    else {
      let CU = interceptCirclesAndPoint(C0, k.UCr, k.C2R).sort((a, b) => b.y - a.y)[1];
      if (!CU)
        return buildCornerMiss('Upper corner', 'C0', C0, 'C2', k.UCr, false, ['C0', 'C2', 'C21'])
      CUIntercept = circleCircleIntersections(C0, CU).sort((a, b) => b.y - a.y)[0];
      s.C2 = arcFromCircleAndPoints(CU, CUIntercept, k.UCr);
    }
    return null
  });

  solveSection(s.failures, 'Lower corner', ['C0', 'C1', 'C11'], () => {
    let C0 = placed;
    if (!C0) return null;
    let missing = buildBlankMiss('Lower corner', ['C0', 'C1', 'C11'], [k.LCr.x, k.LCr.y, k.C1R, ...(k.C11DoubleArc ? [k.C11R, k.C11Sweep] : [])]);
    if (missing) return missing;
    if (k.C11DoubleArc) {
      let sweep = k.C11Sweep * TURN.degree;
      let compoundCircles = interceptCirclesAndPointCompoundBySweep(C0, k.LCr, k.C1R, k.C11R, sweep).sort((a, b) => a.C1.y - b.C1.y)[1];
      if (!compoundCircles)
        return buildCornerMiss('Lower corner', 'C0', C0, 'C1', k.LCr, true, ['C0', 'C1', 'C11'])
      CLIntercept = circleCircleIntersections(compoundCircles.C1, C0)[1]
      let C11start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

      s.C1 = arcFromCircleAndPoints(compoundCircles.C1, CLIntercept, C11start);
      s.C11 = arcFromCircleAndPoints(compoundCircles.C2, C11start, k.LCr);
    }
    else {
      let CL = interceptCirclesAndPoint(C0, k.LCr, k.C1R).sort((a, b) => a.y - b.y)[1];
      if (!CL)
        return buildCornerMiss('Lower corner', 'C0', C0, 'C1', k.LCr, false, ['C0', 'C1', 'C11'])
      CLIntercept = circleCircleIntersections(C0, CL).sort((a, b) => a.y - b.y)[1];
      s.C1 = arcFromCircleAndPoints(CL, CLIntercept, k.LCr);
    }
    return null
  });

  if (placed && CUIntercept && CLIntercept)
    s.C0 = arcFromCircleAndPoints(placed, CUIntercept, CLIntercept);

  return s;
}

// a bout that hasn't solved fails its own corner, as a blank field does, rather than drawing NaN
function buildBlankCornerMiss(section: string, unsolved: CornerKey[], boutName: string, bout: Arc | null, values: number[]): CornerFailure | null {
  if (!bout) return { message: `${section}: the ${boutName} has to solve first.`, unsolved, circles: [], segments: [] };
  return buildBlankMiss(section, unsolved, values);
}

// an arc of radius r tangent to `from` and through the corner needs r to span half the gap
// between them; the compound pair has no closed form, so it only gets the generic advice
function buildCornerMiss(section: string, fromKey: CornerKey, from: Circle, arcKey: CornerKey, corner: Pt, compound: boolean, unsolved: CornerKey[]): CornerFailure {
  let needed = Math.abs(dist(from, corner) - from.r) / 2
  return {
    message: compound
      ? `${section}: no ${arcKey} of that radius reaches the corner from ${fromKey}. Bring the corner in toward the body, or give it a larger radius.`
      : `${section}: ${arcKey} can't reach the corner from ${fromKey}. Enlarge ${arcKey} (at least ${needed.toFixed(1)}mm), or bring the corner in toward the body.`,
    unsolved,
    circles: [from],
    segments: [],
    points: [corner],
  }
}

// read off the params every solve, so they can't drift from the instrument. The radius ratios are
// taken against the inner width, the width less the inset both sides. While the fit is on, the
// width is the fitted one, since that is what the drawing shows
export function calcCornersRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  if (!p.corners || !p.bouts) return {};
  let b = p.bouts;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;
  let LBW = p.body.width;
  let LBWI = LBW - 2 * inset;
  let CBW = (b.useKellyC0 ? solveCorners(p)!.CBW : null) ?? b.CBW;

  return {
    U3toLBW: k.U3R / LBWI,
    U31toLBW: k.U31R / LBWI,
    L3toLBW: k.L3R / LBWI,
    L31toLBW: k.L31R / LBWI,
    UCYtoH: k.UCr.y / p.body.height,
    LCYtoH: k.LCr.y / p.body.height,
    CBWtoLBW: CBW / LBW,
    C0toLBW: b.C0R / LBWI,
    C2toLBW: k.C2R / LBWI,
    C21toLBW: k.C21R / LBWI,
    C1toLBW: k.C1R / LBWI,
    C11toLBW: k.C11R / LBWI,
  };
}
