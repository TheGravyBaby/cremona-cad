import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { circleCircleIntersections } from '../../../../helpers/math/draftMath';
import { angleFromCenter, flipAngleAboutYAxis, flipArcAboutY, lineCircleIntersection, offsetArcRadius, pointOnCircle, TURN } from '../../../../helpers/math/simpleGeometry';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderRect, renderSegment, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { violNeckJoinExceeded } from '../../../../docs/conditions';
import { showFieldHelp } from '../../../../docs/field-help';
import { Arc, arcFromCircle, Pt, Rectangle } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { HighlightedArc, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { MainBoutFailure, MainBoutsSolve, ViolNeckCap, ViolNeckJoin } from '../../violin-family-solves';
import { SEED_RATIOS, ViolinFamilyRatios } from '../../violin-family-seed';
import { renderCorners, solveCorners } from '../corners-panel/corners-panel';
import { renderCenterBout, solveCenterBout } from '../center-bout-panel/center-bout-panel';

// The main bouts: the upper and lower bouts' two arcs each, set by their widths and radii, and the
// viol neck that can take the place of the upper bout's top. Panel and renders, then solve and ratios.
type MainBoutArcKey = 'U0' | 'U1' | 'L0' | 'L1' | 'V0';

@Component({
  selector: 'app-vf-main-bouts-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './main-bouts-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class MainBoutsPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showAllArcs', 'showModuleGuides', 'renderOuterPath'];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  // the first draft of whatever the fields need: the bouts off the body and the seed ratios, and the
  // viol neck the first time it's turned on. The shell runs this as the panel opens and on every
  // edit, so undo back past a seed seeds again
  static seed(p: ViolinFamilyParams): void {
    if (!p.bouts) {
      let inset = p.body.overhang + p.body.rib;
      let LBW = p.body.width;
      let UBW = Math.round(LBW * SEED_RATIOS.UBtoLB);

      let UBWI = UBW - 2 * inset;
      let LBWI = LBW - 2 * inset;

      let U0R = Math.round(UBWI * SEED_RATIOS.U0toUBW * 10) / 10;
      let U1R = Math.round(UBWI * SEED_RATIOS.U1toUBW * 10) / 10;
      let L0R = Math.round(LBWI * SEED_RATIOS.L0toLBW * 10) / 10;
      let L1R = Math.round(LBWI * SEED_RATIOS.L1toLBW * 10) / 10;

      let CBW = Math.round(LBW * SEED_RATIOS.CBWtoLBW);
      let C0R = Math.round(LBWI * SEED_RATIOS.C0toLBW);
      
      // we want the midpoint between the upper and lower bout box
      let upperBoutLow = p.body.height - UBW
      let lowerBoutHigh = p.body.width
      let C0Y = lowerBoutHigh + (upperBoutLow - lowerBoutHigh) / 2 
      
      p.bouts = { UBW, U0R, U1R, L0R, L1R, useViolNeck: false, viol: null, CBW, C0R, C0Y, useKellyC0: false };
    }

    if (p.bouts.useViolNeck && !p.bouts.viol) {
      p.bouts.viol = {
        width: p.bouts.UBW * .1,
        neckRadius: 0,
        V0R: p.bouts.UBW / 5,
        joinTurn: 81,
        V0Sweep: 60,
      };
    }
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the template and report() read these rather than solving again
  m!: MainBoutsSolve;
  ratios: Partial<ViolinFamilyRatios> = {};

  // held as a key rather than the arc: every solve builds new arcs
  private highlightedKey: MainBoutArcKey | null = null;
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

  // the arc a field sets, haloed while the field has focus; null on blur
  highlight(key: MainBoutArcKey | null, color = ''): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.draw();
  }

  ratio(key: keyof ViolinFamilyRatios): string {
    let value = this.ratios[key];
    return Number.isFinite(value) ? nearestFraction(value!) : '–';
  }

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  report(): void {
    let m = this.m;
    reportFailures(m.failures, 'Main Bouts');
    // the neck's reach is reported rather than refused: five fields feed it and any of them is a
    // legitimate thing to have just changed, so which to pull back is the maker's call
    if (m.violJoin && m.violJoin.headroom < 0) violNeckJoinExceeded(-m.violJoin.headroom);
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let b = p.bouts!;
      let m = this.m = solveMainBouts(p)!;
      this.ratios = solveMainBoutsRatios(p);
      let arc = this.highlightedKey ? m[this.highlightedKey] : null;
      let c = solveCorners(p);
      let cb = solveCenterBout(p);
      let layers: RenderLayer[] = [];

      if (this.flags.showModuleGuides) layers.push(renderBoutBounds(p, this.pal));
      // the corners and the center bout as far as they've been drafted, in grey under this
      // panel's bouts
      if (c) layers.push(renderCorners(p, c, this.pal, this.flags, false, null));
      if (cb) layers.push(renderCenterBout(p, cb, this.pal, this.flags, false, null));
      layers.push(
        renderMainBouts(p, m, this.pal, this.flags, true, arc ? { arc, color: this.highlightedColor } : null),
        renderSolveFailures(m.failures, this.pal.alert, true),
      );
      this.drawn.emit(layers);
    });
  }
}

// the module guides the bouts are drawn in: the body's box and the rib line's inside it, and a
// square on each bout width with the inset marked inside it. Later panels show the same guides
export const renderBoutBounds = (p: ViolinFamilyParams, pal: PanelPalette) => (g: any, ui: any): void => {
  let h = p.body.height;
  let LBW = p.body.width;
  let UBW = p.bouts!.UBW;
  let inset = p.body.overhang + p.body.rib;
  let lower = pal.ink(0).faint(-2);
  let upper = pal.ink(1).faint(-2);
  for (let layer of [
    renderRect(new Rectangle(new Pt(-LBW / 2, 0), new Pt(LBW / 2, h)), pal.neutral),
    renderRect(new Rectangle(new Pt(-LBW / 2 + inset, inset), new Pt(LBW / 2 - inset, h - inset)), pal.neutral),
    renderRect(new Rectangle(new Pt(-LBW / 2, 0), new Pt(LBW / 2, LBW)), lower),
    renderSegment(new Pt(-LBW / 2 + inset, 0), new Pt(-LBW / 2 + inset, LBW), lower),
    renderSegment(new Pt(LBW / 2 - inset, 0), new Pt(LBW / 2 - inset, LBW), lower),
    renderRect(new Rectangle(new Pt(-UBW / 2, h - UBW), new Pt(UBW / 2, h)), upper),
    renderSegment(new Pt(-UBW / 2 + inset, h - UBW), new Pt(-UBW / 2 + inset, h), upper),
    renderSegment(new Pt(UBW / 2 - inset, h - UBW), new Pt(UBW / 2 - inset, h), upper),
  ]) layer(g, ui);
};

// the main bouts in their own colours on this panel, where their fields are; grey under another
// panel's work unless all arcs are shown. A bout whose section failed isn't drawn; its failure is
export const renderMainBouts = (
  p: ViolinFamilyParams,
  m: MainBoutsSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs' | 'showAllArcs' | 'renderOuterPath'>,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
) => (g: any, ui: any): void => {
  let inset = p.body.overhang + p.body.rib;
  let viol = p.bouts!.useViolNeck && !!m.V0;
  let moduleArcs = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) {
    renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
    renderArcHalo(flipArcAboutY(highlighted.arc), highlighted.color)(g, ui);
  }

  // the upper bout's top arc runs across the centreline, unless the neck has taken that ground
  let topArcs = (U0: Arc): Arc[] => viol ? [U0, flipArcAboutY(U0)] : [arcFromCircle(U0, flipAngleAboutYAxis(U0.end), U0.end)];
  let bottomArc = (L0: Arc): Arc => arcFromCircle(L0, flipAngleAboutYAxis(L0.end), L0.end);
  let sideArcs = (arc: Arc): Arc[] => [arc, flipArcAboutY(arc)];
  // the join and the neck's top face, mirrored. Derived rather than authored, so plain even in the
  // module view. At a join radius of 0 there's no join arc: the rib corner is sharp
  let join = (cap: ViolNeckCap, color: string) => {
    if (cap.fillet) {
      renderArcFromArc(cap.fillet, color, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(flipArcAboutY(cap.fillet), color, STROKE_WEIGHT.trace)(g, ui);
    }
    renderSegment(new Pt(cap.topX, cap.topY), new Pt(-cap.topX, cap.topY), color, STROKE_WEIGHT.trace)(g, ui);
  };

  if (moduleArcs) {
    if (viol) {
      renderArcFromArcFancy(m.V0!, pal.ink(1))(g, ui);
      renderArcFromArcFancy(flipArcAboutY(m.V0!), pal.ink(1))(g, ui);
      // V0 draws in full: it is seated against the join, so its start is the tangency and there
      // is nothing for the join to trim off
      if (m.violCap) join(m.violCap, pal.ink(1));
    }
    if (m.U0 && m.U1) {
      for (let arc of topArcs(m.U0)) renderArcFromArcFancy(arc, pal.ink(1))(g, ui);
      for (let arc of sideArcs(m.U1)) renderArcFromArcFancy(arc, pal.ink(1).faint(-2))(g, ui);
    }
    if (m.L0 && m.L1) {
      renderArcFromArcFancy(bottomArc(m.L0), pal.ink(0))(g, ui);
      for (let arc of sideArcs(m.L1)) renderArcFromArcFancy(arc, pal.ink(0).faint(-2))(g, ui);
    }
  }

  // the outline at offset d out from the rib line: 0 is the rib, unless the module arcs stand in
  // for it, and the inset is the plate's edge
  let top = currentModule ? pal.ink(1) : pal.neutral;
  let topSide = currentModule ? pal.ink(1).faint(-2) : pal.neutral;
  let bottom = currentModule ? pal.ink(0) : pal.neutral;
  let bottomSide = currentModule ? pal.ink(0).faint(-2) : pal.neutral;
  let offsets = [...(moduleArcs ? [] : [0]), ...(flags.renderOuterPath ? [inset] : [])];

  for (let d of offsets) {
    let trace = (arc: Arc, color: string) => renderArcFromArc(offsetArcRadius(arc, d), color, STROKE_WEIGHT.trace)(g, ui);

    // V0 trimmed back to the join, then the join: the same neck the outer trace will draw
    let cap = d === 0 ? m.violCap : m.violOuterCap;
    if (viol && cap) {
      let V0 = offsetArcRadius(m.V0!, -d);
      V0.start = cap.v0Start;
      renderArcFromArc(V0, top, STROKE_WEIGHT.trace)(g, ui);
      renderArcFromArc(flipArcAboutY(V0), top, STROKE_WEIGHT.trace)(g, ui);
      join(cap, top);
    }
    if (m.U0 && m.U1) {
      for (let arc of topArcs(m.U0)) trace(arc, top);
      for (let arc of sideArcs(m.U1)) trace(arc, topSide);
    }
    if (m.L0 && m.L1) {
      trace(bottomArc(m.L0), bottom);
      for (let arc of sideArcs(m.L1)) trace(arc, bottomSide);
    }
  }
};

// a later panel reads the bouts by calling this; it returns and never writes to the params
export function solveMainBouts(p: ViolinFamilyParams): MainBoutsSolve | null {
  if (!p.bouts) return null;
  let b = p.bouts;
  let inset = p.body.overhang + p.body.rib;
  let LBW = p.body.width;
  let UBWI = b.UBW - 2 * inset;
  let LBWI = LBW - 2 * inset;

  let s: MainBoutsSolve = {
    U0: null, U1: null, L0: null, L1: null,
    V0: null, violCap: null, violOuterCap: null, violJoin: null,
    failures: [],
  };

  // the one way a main bout breaks: the big arc can't reach far enough out for the small one
  // to both touch it from inside and sit on the bout's width line
  let boutMiss = (
    bigKey: 'U0' | 'L0',
    smallKey: 'U1' | 'L1',
    boutName: string,
    big: Arc,
    small: Arc,
    edgeX: number,
    bottom: number,
    top: number,
  ): MainBoutFailure => {
    let atLeast = big.x === 0 ? ` (at least ${edgeX.toFixed(1)}mm)` : '';
    return {
      message: small.r >= big.r
        ? `${bigKey}/${smallKey}: ${smallKey} has to be smaller than ${bigKey} to turn out to the ${boutName} width.`
        : `${bigKey}/${smallKey}: ${bigKey} can't reach the ${boutName} width. Enlarge ${bigKey}${atLeast}, or narrow the ${boutName}.`,
      unsolved: [bigKey, smallKey],
      circles: [big],
      segments: [[new Pt(edgeX, bottom), new Pt(edgeX, top)]],
    };
  };

  // a field cleared mid-edit fails its own bout rather than drawing NaN
  let blank = (key: 'L0' | 'U0', smallKey: 'L1' | 'U1', boutName: string, values: number[]): MainBoutFailure | null =>
    values.every(Number.isFinite) ? null : {
      message: `${key}/${smallKey}: every ${boutName} field needs a value.`,
      unsolved: [key, smallKey],
      circles: [],
      segments: [],
    };

  solveSection(s.failures, 'Lower bout', ['L0', 'L1'], () => {
    let missing = blank('L0', 'L1', 'lower bout', [inset, LBW, b.L0R, b.L1R]);
    if (missing) return missing;
    let L0 = new Arc(0, inset + b.L0R, b.L0R);
    // we know the second circle intersects the outer edge where theta = 0
    // thus its x position MUST be R away from the edge
    let L1 = new Arc(LBW / 2 - b.L1R - inset, b.L1R, b.L1R);
    // therefore we have a vertical line where the circle could be
    // in order to cleanly intersect L0 we know the center of L1 must be along a circle
    // which is defined by being L1.r inset from L0
    // therefore the intersection of these two constrains, a vertical line, and a circle within L0 gives us our point
    let L1Ys = lineCircleIntersection(
      { m: Infinity, y: NaN, x: L1.x },
      { x: L0.x, y: L0.y, r: Math.abs(L0.r - L1.r) },
    );
    if (!L1Ys.length)
      return boutMiss('L0', 'L1', 'lower bout', L0, L1, LBWI / 2, 0, LBW);
    L1.y = L1Ys[1].y;

    let lowerIntersect = circleCircleIntersections(L0, L1);
    let L0Angle = angleFromCenter(L0, lowerIntersect[0]);
    let L1Angle = angleFromCenter(L1, lowerIntersect[0]);

    s.L0 = arcFromCircle(L0, 3 * TURN.quarter, L0Angle);
    s.L1 = arcFromCircle(L1, L1Angle, 0);
    return null;
  });

  solveSection(s.failures, 'Upper bout', ['U0', 'U1'], () => {
    let viol = b.useViolNeck && b.viol ? [b.viol.width, b.viol.neckRadius, b.viol.V0R, b.viol.joinTurn, b.viol.V0Sweep] : [];
    let missing = blank('U0', 'U1', 'upper bout', [inset, p.body.height, b.UBW, b.U0R, b.U1R, ...viol]);
    if (missing) return missing;
    if (b.useViolNeck && b.viol) {
      let v = b.viol;
      // the flat top face runs out to width/2, then a join of neckRadius turns the corner into
      // the flank. V0 begins where that join ends, so its centre goes back (Vr + R) along the
      // start ray from the join's centre, which puts V0.start *on* the tangency instead of
      // somewhere the join later trims off. At R = 0 the join centre is the corner itself. The join
      // turns the outline down from the level top face, and V0 runs on from that heading
      let start = 3 * TURN.quarter - v.joinTurn * TURN.degree;
      let end = start + v.V0Sweep * TURN.degree;
      let joinCenter = new Pt(v.width / 2, p.body.height - inset - v.neckRadius);
      let VyDiff = Math.sin(start) * (v.V0R + v.neckRadius);
      let VxDiff = Math.cos(start) * (v.V0R + v.neckRadius);
      let V0 = new Arc(joinCenter.x - VxDiff, joinCenter.y - VyDiff, v.V0R, start, end);
      s.V0 = V0;
      s.violCap = violNeckCap(V0, v.neckRadius, 0);
      s.violOuterCap = violNeckCap(V0, v.neckRadius, inset);
      s.violJoin = violNeckJoinLimit(p);

      let V0End = pointOnCircle(V0, V0.end);

      // we know that U0 start is -Pi from V0 end
      let U0start = V0.end - TURN.half;
      let U0YDiff = Math.sin(U0start) * b.U0R;
      let U0XDiff = Math.cos(U0start) * b.U0R;
      let U0 = new Arc(V0End.x - U0XDiff, V0End.y - U0YDiff, b.U0R, U0start);

      let U1x = b.UBW / 2 - b.U1R - inset;
      let U1Ys = lineCircleIntersection(
        { m: Infinity, y: NaN, x: U1x },
        { x: U0.x, y: U0.y, r: Math.abs(U0.r - b.U1R) },
      );
      if (!U1Ys.length)
        return boutMiss('U0', 'U1', 'upper bout', U0, new Arc(U1x, 0, b.U1R), UBWI / 2, p.body.height - b.UBW, p.body.height);

      let U1 = new Arc(U1x, U1Ys[0].y, b.U1R);
      let U1U0Int = circleCircleIntersections(U1, U0)[0];
      let U1start = angleFromCenter(U1, U1U0Int);
      let U0End = angleFromCenter(U0, U1U0Int);
      U0.end = U0End;
      U1.start = U1start;
      U1.end = 0;

      s.U0 = U0;
      s.U1 = U1;
    }
    else {
      let U0 = new Arc(0, p.body.height - inset - b.U0R, b.U0R);
      let U1 = new Arc(b.UBW / 2 - b.U1R - inset, 0, b.U1R);
      let U1Ys = lineCircleIntersection(
        { m: Infinity, y: NaN, x: U1.x },
        { x: U0.x, y: U0.y, r: Math.abs(U0.r - U1.r) },
      );
      if (!U1Ys.length)
        return boutMiss('U0', 'U1', 'upper bout', U0, U1, UBWI / 2, p.body.height - b.UBW, p.body.height);
      U1.y = U1Ys[0].y;

      let upperIntersect = circleCircleIntersections(U0, U1);
      let U0Angle = angleFromCenter(U0, upperIntersect[0]);
      let U1Angle = angleFromCenter(U1, upperIntersect[0]);

      s.U0 = arcFromCircle(U0, TURN.quarter, U0Angle);
      s.U1 = arcFromCircle(U1, U1Angle, 0);
    }
    return null;
  });

  return s;
}

/**
 * How far the viol neck may reach across before U0 can no longer carry the outline out to U1.
 *
 * U0 is seated tangent to V0's end, then U1 is inscribed in it at a fixed x. The point where U1
 * touches U0 moves *inward* as the neck grows. Once that touch falls behind V0's end, U0 sweeps
 * backwards to reach it and the outline hooks. Nothing throws: every circle still intersects,
 * just in the wrong order. `reach` is V0's end in x; `limit` is where U1 touches U0 along V0's
 * end direction, the furthest out that touch can be.
 */
export function violNeckJoinLimit(p: ViolinFamilyParams): ViolNeckJoin | null {
  let b = p.bouts;
  if (!b?.useViolNeck || !b.viol) return null;
  let v = b.viol;
  let inset = p.body.overhang + p.body.rib;

  let start = 3 * TURN.quarter - v.joinTurn * TURN.degree;
  let end = start + v.V0Sweep * TURN.degree;

  let reach = v.width / 2 - (v.V0R + v.neckRadius) * Math.cos(start) + v.V0R * Math.cos(end);
  let limit = b.UBW / 2 - inset - b.U1R * (1 + Math.cos(end));

  return { reach, limit, headroom: limit - reach };
}

// where the neck meets its top face at offset d: V0's new start, the join arc, and the face's end
export function violNeckCap(V0: Arc, neckRadius: number, d: number): ViolNeckCap | null {
  let R = neckRadius;

  if (R + d > 1e-9) {
    // back down the start ray to the join's centre, the point V0 was seated against
    let C = new Pt(V0.x + (V0.r + R) * Math.cos(V0.start), V0.y + (V0.r + R) * Math.sin(V0.start));
    if (C.x <= 0) return null;
    return { v0Start: V0.start, fillet: new Arc(C.x, C.y, R + d, V0.start + TURN.half, TURN.quarter), topX: C.x, topY: C.y + R + d };
  }

  let topY = V0.y + (V0.r + R) * Math.sin(V0.start) + R + d;
  let P = neckSeat(V0, V0.r - d, topY, pointOnCircle(V0, V0.start));
  if (!P || P.x <= 0) return null;
  return { v0Start: angleFromCenter(V0, P), fillet: null, topX: P.x, topY };
}

// where a circle about V0's centre crosses a height, on whichever branch the neck sits on
function neckSeat(V0: Arc, r: number, y: number, corner: Pt): Pt | null {
  let dy = y - V0.y;
  let span = r * r - dy * dy;
  if (span <= 0) return null;
  let root = Math.sqrt(span);
  let x = Math.abs(V0.x - root - corner.x) <= Math.abs(V0.x + root - corner.x) ? V0.x - root : V0.x + root;
  return new Pt(x, y);
}

// read off the params every solve, so they can't drift from the instrument. The radius ratios are
// taken against the inner width, the width less the inset both sides
export function solveMainBoutsRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  if (!p.bouts) return {};
  let b = p.bouts;
  let inset = p.body.overhang + p.body.rib;
  let LBW = p.body.width;
  let UBWI = b.UBW - 2 * inset;
  let LBWI = LBW - 2 * inset;

  return {
    UBtoLB: b.UBW / LBW,
    U0toUBW: b.U0R / UBWI,
    U1toUBW: b.U1R / UBWI,
    LBtoH: LBW / p.body.height,
    L0toLBW: b.L0R / LBWI,
    L1toLBW: b.L1R / LBWI,
  };
}