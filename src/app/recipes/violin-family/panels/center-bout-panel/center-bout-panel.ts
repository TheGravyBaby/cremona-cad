import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections, interceptCirclesAndPoint, interceptCirclesAndPointCompoundBySweep } from '../../../../helpers/math/draftMath';
import { dist, flipArcAboutY, offsetArcRadius, TURN } from '../../../../helpers/math/simpleGeometry';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCrosshair, renderDashedLine, renderPointHalo, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { showFieldHelp } from '../../../../docs/field-help';
import { Arc, arcFromCircleAndPoints, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { CenterBoutFailure, CenterBoutKey, CenterBoutSolve, CornersSolve, MainBoutsSolve, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { ViolinFamilyRatios } from '../../violin-family-seed';
import { renderBoutBounds, renderMainBouts, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { cornerMiss, defaultCornerTips, renderCorners, solveCorners } from '../corners-panel/corners-panel';

// The center bout: C0, the C's own arc, placed by its width and height or fitted to touch both
// join arcs (Kelly's four circles), and the corner arcs C2 and C1 that turn it onto the corner
// tips, each plain or compound. Its numbers live with the bouts (C0) and the corners (C2, C1),
// so there is no seed here. Panel and renders, then solve and ratios.
type CenterBoutHighlightKey = CenterBoutKey | 'UCr' | 'LCr';

@Component({
  selector: 'app-vf-center-bout-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './center-bout-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class CenterBoutPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showAllArcs', 'showModuleGuides', 'renderOuterPath'];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template and report() read these rather than solving again
  m!: MainBoutsSolve;
  c!: CornersSolve;
  cb!: CenterBoutSolve;
  ratios: Partial<ViolinFamilyRatios> = {};

  private highlightedKey: CenterBoutHighlightKey | null = null;
  private highlightedColor = '';

  ngOnInit(): void {
    this.draw();
  }

  // every field calls this: the shell seeds the stage and schedules the commit (the undo entry, the
  // session write, report()) for when the typing stops, and the picture catches up now
  edited(): void {
    this.edit.emit();
    this.draw();
  }

  // the arc or tip a field sets, haloed while the field has focus; null on blur
  highlight(key: CenterBoutHighlightKey | null, color = ''): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.draw();
  }

  // turning the fit off keeps the width and height it found, so the hand fields carry on from
  // the fitted shape rather than jumping back to what was typed before it
  fitChanged(): void {
    let b = this.params.bouts!;
    if (!b.useKellyC0 && this.cb.C0 && this.cb.CBW != null) {
      b.CBW = Math.round(this.cb.CBW * 10) / 10;
      b.C0Y = Math.round(this.cb.C0.y * 10) / 10;
    }
    this.edited();
  }

  // the tip goes back onto its guide circle; the arcs keep their radii
  defaultCorner(corner: 'upper' | 'lower'): void {
    let tips = defaultCornerTips(this.params);
    if (!tips) return;
    if (corner === 'upper') this.params.corners!.UCr = tips.UCr;
    else this.params.corners!.LCr = tips.LCr;
    this.edited();
  }

  ratio(key: keyof ViolinFamilyRatios): string {
    let value = this.ratios[key];
    return Number.isFinite(value) ? nearestFraction(value!) : '–';
  }

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  report(): void {
    reportFailures(this.cb.failures, 'Center Bout');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let m = this.m = solveMainBouts(p)!;
      let c = this.c = solveCorners(p)!;
      let cb = this.cb = solveCenterBout(p)!;
      this.ratios = solveCenterBoutRatios(p);
      let highlighted = this.highlightedKey ? { key: this.highlightedKey, color: this.highlightedColor } : null;
      let layers: RenderLayer[] = [];

      if (this.flags.showModuleGuides) {
        let hw = p.body.width / 2;
        layers.push(renderBoutBounds(p, this.pal));
        // the height C0 is placed at, or was fitted to
        if (cb.C0) layers.push(renderDashedLine(new Pt(-hw, cb.C0.y), new Pt(hw, cb.C0.y), this.pal.ink(3)));
      }

      // the bouts and the corners in grey under this panel's C bout
      layers.push(
        renderMainBouts(p, { ...m, U1: c.U1, L1: c.L1 }, this.pal, this.flags, false, null),
        renderCorners(p, c, this.pal, this.flags, false, null),
        renderCenterBout(p, cb, this.pal, this.flags, true, highlighted),
        renderSolveFailures(cb.failures, this.pal.alert, true),
      );
      this.drawn.emit(layers);
    });
  }
}

// the C bout in its own colours on this panel, where its fields are; grey under another panel's
// work unless all arcs are shown. The plate edge offsets in from C0, and from a corner arc whichever way that arc turns:
// out when it sits outside C0, in when it has inverted into it. A corner whose section failed
// isn't drawn; its failure is
export const renderCenterBout = (
  p: ViolinFamilyParams,
  cb: CenterBoutSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs' | 'showAllArcs' | 'renderOuterPath'>,
  currentModule: boolean,
  highlighted: { key: CenterBoutHighlightKey; color: string } | null,
) => (g: any, ui: any): void => {
  let k = p.corners!;
  let inset = p.body.overhang + p.body.rib;
  let moduleArcs = (currentModule && flags.showModuleArcs) || flags.showAllArcs;
  let mirror = (P: Pt): Pt => new Pt(-P.x, P.y);

  let upperTip = pal.ink(4);
  let bout = pal.ink(3);
  let lowerTip = pal.ink(2);

  type Part = [Arc | null, string, 1 | -1];
  let parts = ([
    [cb.C2, upperTip, cornerTurn(cb.C2, cb.C0)],
    ...(k.C21DoubleArc ? [[cb.C21, upperTip, cornerTurn(cb.C2, cb.C0)] as Part] : []),
    [cb.C1, lowerTip, cornerTurn(cb.C1, cb.C0)],
    ...(k.C11DoubleArc ? [[cb.C11, lowerTip, cornerTurn(cb.C1, cb.C0)] as Part] : []),
    [cb.C0, bout, -1],
  ] as Part[]).filter((part): part is [Arc, string, 1 | -1] => !!part[0]);

  if (highlighted) {
    if (highlighted.key === 'UCr' || highlighted.key === 'LCr') {
      let tip = k[highlighted.key];
      for (let P of [tip, mirror(tip)]) {
        renderPointHalo(P, highlighted.color)(g, ui);
        renderCrosshair(P, highlighted.color)(g, ui);
      }
    } else {
      let arc = cb[highlighted.key];
      if (arc) {
        renderArcHalo(arc, highlighted.color)(g, ui);
        renderArcHalo(flipArcAboutY(arc), highlighted.color)(g, ui);
      }
    }
  }

  if (currentModule && flags.showModuleArcs) {
    for (let P of [k.UCr, mirror(k.UCr)]) renderCrosshair(P, pal.ink(4).faint(5))(g, ui);
    for (let P of [k.LCr, mirror(k.LCr)]) renderCrosshair(P, pal.ink(2).faint(5))(g, ui);
  }
  if (moduleArcs) {
    for (let [arc, color] of parts) {
      renderArcFromArcFancy(arc, color)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(arc), color)(g, ui);
    }
  }

  // the outline at offset d from the rib line: 0 is the rib, unless the module arcs stand in
  // for it, and the inset is the plate's edge
  let offsets = [...(moduleArcs ? [] : [0]), ...(flags.renderOuterPath ? [inset] : [])];
  for (let d of offsets) {
    for (let [arc, color, out] of parts) {
      let edge = offsetArcRadius(arc, out * d);
      let trace = currentModule ? color : pal.neutral;
      renderArcFromArc(edge, trace, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(flipArcAboutY(edge), trace, STROKE_WEIGHT.trace)(g, ui);
    }
  }
};

// which way a C corner arc's plate edge offsets. C0 is tangent to each corner arc, so one centred
// further than C0's radius from C0's centre sits outside it and its plate edge is the larger
// circle (1); one that has inverted into the C offsets the other way (-1). A compound corner's
// second arc follows its first
export const cornerTurn = (arc: Arc | null, C0: Arc | null): 1 | -1 => arc && C0 && dist(arc, C0) > C0.r ? 1 : -1;

// a later panel reads the C bout by calling this; it returns and never writes to the params. The
// corners are solved again here for the join arcs the fit touches and the tips the corner arcs
// end on
export function solveCenterBout(p: ViolinFamilyParams): CenterBoutSolve | null {
  if (!p.corners || !p.bouts) return null;
  let c = solveCorners(p)!;
  let b = p.bouts;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;

  let s: CenterBoutSolve = { C0: null, C2: null, C21: null, C1: null, C11: null, CBW: null, failures: [] };

  // a field cleared mid-edit fails its own section rather than drawing NaN
  let blank = (section: string, unsolved: CenterBoutKey[], values: number[]): CenterBoutFailure | null =>
    values.every(Number.isFinite) ? null : { message: `${section}: every ${section.toLowerCase()} field needs a value.`, unsolved, circles: [], segments: [] };

  // C0's circle once it is placed, by hand or by the fit; the corner arcs stand on it
  let placed: Arc | null = null;
  solveSection(s.failures, 'Center bout', ['C0', 'C2', 'C21', 'C1', 'C11'], () => {
    let missing = blank('Center bout', ['C0', 'C2', 'C21', 'C1', 'C11'], b.useKellyC0 ? [b.C0R] : [b.C0R, b.C0Y, b.CBW]);
    if (missing) return missing;

    if (b.useKellyC0) {
      let U2 = c.U2;
      let L2 = c.L2;
      let kellyMiss: CenterBoutFailure = {
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

  let cuRadius = k.C2R;
  let clRadius = k.C1R;
  let CUIntercept: Pt | undefined;
  let CLIntercept: Pt | undefined;

  // the corner arcs have nothing to stand on until C0 is placed; its failure says so
  solveSection(s.failures, 'Upper corner', ['C0', 'C2', 'C21'], () => {
    let C0 = placed;
    if (!C0) return null;
    let missing = blank('Upper corner', ['C0', 'C2', 'C21'], [k.UCr.x, k.UCr.y, k.C2R, ...(k.C21DoubleArc ? [k.C21R, k.C21Sweep] : [])]);
    if (missing) return missing;
    if (k.C21DoubleArc) {
      // drawn from C0 out to its tip, the upper corner turns clockwise and the lower
      // counterclockwise; the second arc turns through the typed sweep onto the tip
      let sweep = -k.C21Sweep * TURN.degree;
      let compoundCircles = interceptCirclesAndPointCompoundBySweep(C0, k.UCr, k.C2R, k.C21R, sweep).sort((a, b) => a.C1.y - b.C1.y)[0];
      if (!compoundCircles)
        return cornerMiss('Upper corner', 'C0', C0, 'C2', k.UCr, true, ['C0', 'C2', 'C21'])
      CUIntercept = circleCircleIntersections(compoundCircles.C1, C0)[1]
      let C21start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

      s.C2 = arcFromCircleAndPoints(compoundCircles.C1, CUIntercept, C21start);
      s.C21 = arcFromCircleAndPoints(compoundCircles.C2, C21start, k.UCr);
    }
    else {
      let CU = interceptCirclesAndPoint(C0, k.UCr, cuRadius).sort((a, b) => b.y - a.y)[1];
      if (!CU)
        return cornerMiss('Upper corner', 'C0', C0, 'C2', k.UCr, false, ['C0', 'C2', 'C21'])
      CUIntercept = circleCircleIntersections(C0, CU).sort((a, b) => b.y - a.y)[0];
      s.C2 = arcFromCircleAndPoints(CU, CUIntercept, k.UCr);
    }
    return null
  });

  solveSection(s.failures, 'Lower corner', ['C0', 'C1', 'C11'], () => {
    let C0 = placed;
    if (!C0) return null;
    let missing = blank('Lower corner', ['C0', 'C1', 'C11'], [k.LCr.x, k.LCr.y, k.C1R, ...(k.C11DoubleArc ? [k.C11R, k.C11Sweep] : [])]);
    if (missing) return missing;
    if (k.C11DoubleArc) {
      let sweep = k.C11Sweep * TURN.degree;
      let compoundCircles = interceptCirclesAndPointCompoundBySweep(C0, k.LCr, k.C1R, k.C11R, sweep).sort((a, b) => a.C1.y - b.C1.y)[1];
      if (!compoundCircles)
        return cornerMiss('Lower corner', 'C0', C0, 'C1', k.LCr, true, ['C0', 'C1', 'C11'])
      CLIntercept = circleCircleIntersections(compoundCircles.C1, C0)[1]
      let C11start = circleCircleIntersections(compoundCircles.C1, compoundCircles.C2)[0]

      s.C1 = arcFromCircleAndPoints(compoundCircles.C1, CLIntercept, C11start);
      s.C11 = arcFromCircleAndPoints(compoundCircles.C2, C11start, k.LCr);
    }
    else {
      let CL = interceptCirclesAndPoint(C0, k.LCr, clRadius).sort((a, b) => a.y - b.y)[1];
      if (!CL)
        return cornerMiss('Lower corner', 'C0', C0, 'C1', k.LCr, false, ['C0', 'C1', 'C11'])
      CLIntercept = circleCircleIntersections(C0, CL).sort((a, b) => a.y - b.y)[1];
      s.C1 = arcFromCircleAndPoints(CL, CLIntercept, k.LCr);
    }
    return null
  });

  if (placed && CUIntercept && CLIntercept)
    s.C0 = arcFromCircleAndPoints(placed, CUIntercept, CLIntercept);

  return s;
}

// read off the params every solve, so they can't drift from the instrument. The radius ratios are
// taken against the inner width, the width less the inset both sides. While the fit is on, the
// width and the height are the fitted ones, since those are what the drawing shows
export function solveCenterBoutRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  if (!p.corners || !p.bouts) return {};
  let b = p.bouts;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;
  let LBW = p.body.width;
  let LBWI = LBW - 2 * inset;
  let fitted = b.useKellyC0 ? solveCenterBout(p)! : null;
  let CBW = fitted?.CBW ?? b.CBW;
  let C0Y = fitted?.C0?.y ?? b.C0Y;

  return {
    CBWtoLBW: CBW / LBW,
    C0toLBW: b.C0R / LBWI,
    C0YtoH: C0Y / p.body.height,
    C2toLBW: k.C2R / LBWI,
    C21toLBW: k.C21R / LBWI,
    C1toLBW: k.C1R / LBWI,
    C11toLBW: k.C11R / LBWI,
  };
}
