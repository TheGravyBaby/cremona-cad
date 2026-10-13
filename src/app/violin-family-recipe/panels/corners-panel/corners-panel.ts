import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections, interceptCirclesAndPoint, interceptCirclesAndPointCompound } from '../../../helpers/math/draftMath';
import { angleFromCenter, dist, flipArcAboutY, lineCircleIntersection, lineFromPointAndSlope, offsetArcRadius, pointOnCircle, TURN } from '../../../helpers/math/simpleGeometry';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCrosshair, renderPointHalo, renderSolveFailures } from '../../../helpers/renderFuncs';
import { reportFailures, safeRun, SolveFailure, solveSection } from '../../../helpers/validators';
import { showFieldHelp } from '../../../docs/field-help';
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, Pt } from '../../../models/types';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';
import {
  CornerFailure, CornerKey, CornersSolve, MainBoutsSolve, RenderLayer, SEED_RATIOS, ViolinFamilyPanel, ViolinFamilyParams,
  ViolinFamilyRatios, ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { renderBoutBounds, renderMainBouts, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { renderCenterBout, solveCenterBout } from '../center-bout-panel/center-bout-panel';

// The corners: each bout turns through a join arc (U2, L2) into a corner arc (U3, L3) that ends on
// the typed corner tip, or through a compound pair (U3 then U31) where one arc can't make the
// turn, or in one sweep (U4, L4) for a viol. Panel and renders, then solve and ratios.
type CornerHighlightKey = CornerKey | 'UCr' | 'LCr';

@Component({
  selector: 'app-vf-corners-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './corners-panel.html',
  styleUrls: ['../../../sidebar.css', '../../violin-family.css'],
})
export class CornersPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showModuleGuides', 'renderOuterPath'];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  // the first draft of the corners: the tips on their guide circles and every radius off the seed
  // ratios, the compound ones included, so a toggle only reveals fields that already have values.
  // The shell runs this as the panel opens and on every edit, so undo back past a seed seeds again
  static seed(p: ViolinFamilyParams): void {
    if (p.corners) return;
    let tips = defaultCornerTips(p);
    if (!tips) return;
    let inset = p.body.overhang + p.body.rib;
    let UBWI = p.bouts!.UBW - 2 * inset;
    let LBWI = p.body.width - 2 * inset;

    p.corners = {
      UCr: tips.UCr,
      LCr: tips.LCr,
      U2R: Math.round(UBWI * SEED_RATIOS.U2toUBW),
      U3R: Math.round(LBWI * SEED_RATIOS.U3toLBW),
      U31R: Math.round(LBWI * SEED_RATIOS.U31toLBW),
      U31Start: 17 / 16 * 180,
      U31DoubleArc: false,
      useViolCornerUC: false,
      L2R: Math.round(LBWI * SEED_RATIOS.L2toLBW),
      L3R: Math.round(LBWI * SEED_RATIOS.L3toLBW),
      L31R: Math.round(LBWI * SEED_RATIOS.L31toLBW),
      L31Start: 15 / 16 * 180,
      L31DoubleArc: false,
      useViolCornerLC: false,
      C2R: Math.round(LBWI * SEED_RATIOS.C2toLBW),
      C21R: Math.round(LBWI * SEED_RATIOS.C21toLBW),
      C21Start: 15 / 16 * 180,
      C21DoubleArc: false,
      C1R: Math.round(LBWI * SEED_RATIOS.C1toLBW),
      C11R: Math.round(LBWI * SEED_RATIOS.C11toLBW),
      C11Start: 17 / 16 * 180,
      C11DoubleArc: false,
    };
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template and report() read these rather than solving again
  m!: MainBoutsSolve;
  c!: CornersSolve;
  ratios: Partial<ViolinFamilyRatios> = {};

  // held as a key rather than the arc or point: every solve builds new arcs, and the Default
  // button replaces the tip
  private highlightedKey: CornerHighlightKey | null = null;
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
  highlight(key: CornerHighlightKey | null, color = ''): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.draw();
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
    reportFailures(this.c.failures, 'Corners');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let m = this.m = solveMainBouts(p)!;
      let c = this.c = solveCorners(p)!;
      let cb = solveCenterBout(p);
      this.ratios = solveCornersRatios(p);
      let highlighted = this.highlightedKey ? { key: this.highlightedKey, color: this.highlightedColor } : null;
      let layers: RenderLayer[] = [];

      if (this.flags.showModuleGuides) layers.push(renderBoutBounds(p, this.pal));
      // the bouts and the center bout in grey under this panel's corners
      layers.push(
        renderMainBouts(p, { ...m, U1: c.U1, L1: c.L1 }, this.pal, this.flags, false, null),
        renderSolveFailures(m.failures, this.pal.alert, true),
      );
      if (cb) layers.push(renderCenterBout(p, cb, this.pal, this.flags, false, null));
      layers.push(
        renderCorners(p, c, this.pal, this.flags, true, highlighted),
        renderSolveFailures(c.failures, this.pal.alert, true),
      );
      this.drawn.emit(layers);
    });
  }
}

// the corners in their own colours on this panel, where their fields are; grey under a later
// panel's work. Each corner is listed as its arcs with the way the plate edge offsets from them:
// out from the bout-side arcs, in from the corner arcs that turn back onto the tip. A corner whose
// section failed isn't drawn; its failure is
export const renderCorners = (
  p: ViolinFamilyParams,
  c: CornersSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs' | 'renderOuterPath'>,
  currentModule: boolean,
  highlighted: { key: CornerHighlightKey; color: string } | null,
) => (g: any, ui: any): void => {
  let k = p.corners!;
  let inset = p.body.overhang + p.body.rib;
  let moduleArcs = currentModule && flags.showModuleArcs;
  let mirror = (P: Pt): Pt => new Pt(-P.x, P.y);

  let upperSide = currentModule ? pal.ink(1).faint(-2) : pal.neutral;
  let upperTip = currentModule ? pal.ink(4) : pal.neutral;
  let lowerSide = currentModule ? pal.ink(0).faint(-2) : pal.neutral;
  let lowerTip = currentModule ? pal.ink(2) : pal.neutral;

  type Part = [Arc | null, string, 1 | -1];
  let upper: Part[] = k.useViolCornerUC
    ? [[c.U4, upperSide, 1]]
    : [[c.U2, upperSide, 1], [c.U3, upperTip, -1], ...(k.U31DoubleArc ? [[c.U31, upperTip, -1] as Part] : [])];
  let lower: Part[] = k.useViolCornerLC
    ? [[c.L4, lowerSide, 1]]
    : [[c.L2, lowerSide, 1], [c.L3, lowerTip, -1], ...(k.L31DoubleArc ? [[c.L31, lowerTip, -1] as Part] : [])];
  let parts = [...upper, ...lower].filter((part): part is [Arc, string, 1 | -1] => !!part[0]);

  if (highlighted) {
    if (highlighted.key === 'UCr' || highlighted.key === 'LCr') {
      // the tip's own crosshair goes down with the halo, so the mark reads with the module
      // crosshairs below switched off
      let tip = k[highlighted.key];
      for (let P of [tip, mirror(tip)]) {
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

  if (moduleArcs) {
    for (let P of [k.UCr, mirror(k.UCr)]) renderCrosshair(P, pal.ink(4).faint(5))(g, ui);
    for (let P of [k.LCr, mirror(k.LCr)]) renderCrosshair(P, pal.ink(2).faint(5))(g, ui);
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
      renderArcFromArc(edge, color, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(flipArcAboutY(edge), color, STROKE_WEIGHT.trace)(g, ui);
    }
  }
};

// where a corner tip goes before the maker has placed it, courtesy of David Beard: a line at the
// ratio height of the body, and a guide circle drawn from the bout to that line; where they cross
// is the default. Null until the main bouts solve, since the circles stand on U1 and L1
export function defaultCornerTips(p: ViolinFamilyParams): { UCr: Pt; LCr: Pt } | null {
  if (!p.bouts) return null;
  let m = solveMainBouts(p)!;
  if (!m.U1 || !m.L1) return null;
  let inset = p.body.overhang + p.body.rib;
  let LBW = p.body.width;
  let UBW = p.bouts.UBW;

  // we set a line at the ratio height of the body, then draw a guide circle from the bout to that line
  // the intersection defines the "default" corner position
  let lgPt = new Pt(-(LBW - inset) / 2, m.L1.y);
  let lgC = new Circle(lgPt.x, lgPt.y, LBW - inset)
  let lgH = p.body.height * SEED_RATIOS.LCYtoH
  let LCr = lineCircleIntersection(lineFromPointAndSlope({ x: 0, y: lgH }, 0), lgC).sort((a, b) => a.x - b.x)[1]

  let ugPt = new Pt(-UBW / 2, m.U1.y);
  let ugC = new Circle(ugPt.x, ugPt.y, UBW)
  let ugH = p.body.height * SEED_RATIOS.UCYtoH
  let UCr = lineCircleIntersection(lineFromPointAndSlope({ x: 0, y: ugH }, 0), ugC).sort((a, b) => a.x - b.x)[1]

  return {
    UCr: new Pt(Math.round(UCr.x * 10) / 10, Math.round(UCr.y * 10) / 10),
    LCr: new Pt(Math.round(LCr.x * 10) / 10, Math.round(LCr.y * 10) / 10),
  };
}

// a later panel reads the corners by calling this; it returns and never writes to the params. The
// main bouts are solved again here rather than passed in, so every stage is a function of params
export function solveCorners(p: ViolinFamilyParams): CornersSolve | null {
  if (!p.corners || !p.bouts) return null;
  let m = solveMainBouts(p)!;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;
  let UBW = p.bouts.UBW;
  let LBW = p.body.width;
  let allowHeightFlex = false; // this is a fiddly feature that might be cool one day, needs more work for now

  let s: CornersSolve = {
    U1: m.U1, U2: null, U3: null, U31: null, U4: null,
    L1: m.L1, L2: null, L3: null, L31: null, L4: null,
    failures: [],
  };

  // a field cleared mid-edit, or a bout that hasn't solved, fails its own corner rather than
  // drawing NaN
  let blank = (section: string, unsolved: CornerKey[], boutName: string, bout: Arc | null, values: number[]): CornerFailure | null =>
    !bout ? { message: `${section}: the ${boutName} has to solve first.`, unsolved, circles: [], segments: [] } :
    !values.every(Number.isFinite) ? { message: `${section}: every ${section.toLowerCase()} field needs a value.`, unsolved, circles: [], segments: [] } :
    null;

  solveSection(s.failures, 'Upper corner', ['U2', 'U3', 'U31', 'U4'], () => {
    let missing = blank('Upper corner', ['U2', 'U3', 'U31', 'U4'], 'upper bout', m.U1, [k.U2R, k.UCr.x, k.UCr.y, k.U3R, ...(k.U31DoubleArc ? [k.U31R, k.U31Start] : [])]);
    if (missing) return missing;
    // a copy, so the trim below is this stage's and the main bouts' own arc stays whole
    let U1 = arcFromCircle(m.U1!, m.U1!.start, m.U1!.end);
    let UCr = k.UCr;

    let U1U2Match = false
    if (k.U2R == U1.r) {
      // this is a special case where the user has set U2 to be the same as U1,
      // which causes the math below to break since we won't have two distinct circles to intersect
      U1U2Match = true;
      U1.end = 0
    }
    let U2 = new Arc(UBW / 2 - k.U2R - inset, U1.y, k.U2R);
    if (allowHeightFlex && k.U2Y != null && k.U2Y != U1.y) {
      let flexed = flexedJoin(U1, k.U2R, k.U2Y);
      if (!flexed) return flexMiss('Upper corner', 'U2', 'U1', U1, k.U2R, k.U2Y, ['U2', 'U3', 'U31', 'U4']);
      U2 = flexed;
    }

    if (k.U31DoubleArc) {
      let U3r = k.U3R
      let U31 = k.U31R
      let theta = k.U31Start * TURN.degree
      let compoundCircles = interceptCirclesAndPointCompound(U2, UCr, U3r, U31, theta).sort((a, b) => a.C1.y - b.C1.y)[1];
      if (!compoundCircles)
        return cornerMiss('Upper corner', 'U2', U2, 'U3', UCr, true, ['U2', 'U3', 'U31', 'U4'])
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
        return cornerMiss('Upper corner', 'U2', U2, 'U3', UCr, false, ['U2', 'U3', 'U31', 'U4'])
      let U3 = arcFromCircle(U3Circle);

      let U2Intersect = circleCircleIntersections(U2, U3).sort((a, b) => a.y - b.y);
      let U2Angle = angleFromCenter(U2, U2Intersect[1]);
      let U2StartAngle = angleFromCenter(U2, U1);
      if (U2.r < U1.r)
        U2StartAngle -= TURN.half

      if (!U1U2Match) {
        let newU1Intersect = circleCircleIntersections(U1, U2).sort((a, b) => a.y - b.y);
        let U1EndAngle = angleFromCenter(U1, newU1Intersect[0]); // we might have to recalculate the angle if we altered the Y height of
        U1.end = U1EndAngle
      }
      s.U2 = arcFromCircle(U2, U2StartAngle, U2Angle);
      s.U3 = arcFromCircleAndPoints(U3, U2Intersect[1], UCr);
    }
    if (k.useViolCornerUC) {
      let U1EndPt = pointOnCircle(U1, U1.end);
      let a = UCr.y - U1EndPt.y
      let b = U1EndPt.x - UCr.x
      let U4r = (a * a + b * b) / (2 * b)

      let u4 = new Circle(U1EndPt.x - U4r, U1EndPt.y, U4r);
      s.U4 = arcFromCircleAndPoints(u4, U1EndPt, UCr);
    }
    s.U1 = U1;
    return null
  });

  solveSection(s.failures, 'Lower corner', ['L2', 'L3', 'L31', 'L4'], () => {
    let missing = blank('Lower corner', ['L2', 'L3', 'L31', 'L4'], 'lower bout', m.L1, [k.L2R, k.LCr.x, k.LCr.y, k.L3R, ...(k.L31DoubleArc ? [k.L31R, k.L31Start] : [])]);
    if (missing) return missing;
    let L1 = arcFromCircle(m.L1!, m.L1!.start, m.L1!.end);
    let LCr = k.LCr;

    let L2U1Match = false
    if (k.L2R == L1.r) {
      // this is a special case where the user has set L2 to be the same as L1,
      // which causes the math below to break since we won't have two distinct circles to intersect
      L2U1Match = true;
      L1.end = 0
    }
    let L2 = new Arc(LBW / 2 - k.L2R - inset, L1.y, k.L2R);
    if (allowHeightFlex && k.L2Y != null && k.L2Y != L1.y) {
      let flexed = flexedJoin(L1, k.L2R, k.L2Y);
      if (!flexed) return flexMiss('Lower corner', 'L2', 'L1', L1, k.L2R, k.L2Y, ['L2', 'L3', 'L31', 'L4']);
      L2 = flexed;
    }

    // L4 reads L1's end from before the solve below moves it, as it always has; it lands on the
    // result only once the corner has solved, so a failed corner draws nothing
    let L4: Arc | null = null;
    if (k.useViolCornerLC) {
      let L1EndPt = pointOnCircle(L1, L1.end);
      let a = LCr.y - L1EndPt.y
      let b = L1EndPt.x - LCr.x
      let L4r = (a * a + b * b) / (2 * b)

      let l4 = new Circle(L1EndPt.x - L4r, L1EndPt.y, L4r);
      L4 = arcFromCircleAndPoints(l4, L1EndPt, LCr);
    }
    if (k.L31DoubleArc) {
      let L3r = k.L3R
      let L31r = k.L31R
      let theta = k.L31Start * TURN.degree
      let compoundCircles = interceptCirclesAndPointCompound(L2, LCr, L3r, L31r, theta).sort((a, b) => a.C1.y - b.C1.y)[0];
      if (!compoundCircles)
        return cornerMiss('Lower corner', 'L2', L2, 'L3', LCr, true, ['L2', 'L3', 'L31', 'L4'])
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
        return cornerMiss('Lower corner', 'L2', L2, 'L3', LCr, false, ['L2', 'L3', 'L31', 'L4'])
      let L3 = arcFromCircle(L3Circle);

      let L2Intersect = circleCircleIntersections(L2, L3).sort((a, b) => a.y - b.y)[0];
      let L2Angle = angleFromCenter(L2, L2Intersect);
      let L2StartAngle = angleFromCenter(L2, L1);
      if (L2.r < L1.r)
        L2StartAngle -= TURN.half

      if (!L2U1Match) {
        let newL1Intersect = circleCircleIntersections(L1, L2).sort((a, b) => a.y - b.y)[0];
        let L1EndAngle = angleFromCenter(L1, newL1Intersect);
        L1.end = L1EndAngle // we might have to recalculate the angle if we altered the Y height of
      }

      s.L2 = arcFromCircle(L2, L2StartAngle, L2Angle);
      s.L3 = arcFromCircleAndPoints(L3, L2Intersect, LCr);
    }
    s.L1 = L1;
    s.L4 = L4;
    return null
  });

  return s;
}

// a join let off its bout arc's height leaves the width line but stays inscribed in the bout arc:
// its centre is |r - bout.r| from the bout's, on the side the width line would have put it, so the
// join slides continuously out of the level case. Null where the height is further off than that
function flexedJoin(bout: Arc, r: number, y: number): Arc | null {
  let c = r - bout.r;
  let b = y - bout.y;
  if (b * b > c * c) return null;
  return new Arc(bout.x - Math.sign(c) * Math.sqrt(c * c - b * b), y, r);
}

function flexMiss(section: string, joinKey: CornerKey, boutKey: string, bout: Arc, r: number, y: number, unsolved: CornerKey[]): CornerFailure {
  let reach = Math.abs(r - bout.r);
  return {
    message: `${section}: ${joinKey} can't sit ${Math.abs(y - bout.y).toFixed(1)}mm off ${boutKey}'s height and still touch it. Keep it within ${reach.toFixed(1)}mm, or move its radius further from ${boutKey}'s.`,
    unsolved,
    circles: [bout],
    segments: [],
  };
}

// an arc of radius r tangent to `from` and through the corner needs r to span half the gap
// between them; the compound pair has no closed form, so it only gets the generic advice. The
// center bout's corner arcs miss the same way
export function cornerMiss<K extends string>(
  section: string,
  fromKey: K,
  from: Circle,
  arcKey: K,
  corner: Pt,
  compound: boolean,
  unsolved: K[],
): SolveFailure<K> {
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
// taken against the inner width, the width less the inset both sides
export function solveCornersRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  if (!p.corners || !p.bouts) return {};
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;
  let UBWI = p.bouts.UBW - 2 * inset;
  let LBWI = p.body.width - 2 * inset;

  return {
    U2toUBW: k.U2R / UBWI,
    U3toLBW: k.U3R / LBWI,
    U31toLBW: k.U31R / LBWI,
    L2toLBW: k.L2R / LBWI,
    L3toLBW: k.L3R / LBWI,
    L31toLBW: k.L31R / LBWI,
    UCYtoH: k.UCr.y / p.body.height,
    LCYtoH: k.LCr.y / p.body.height,
  };
}
