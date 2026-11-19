import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderPath, renderSegment, renderSolveFailures, renderTranslatedLayers } from '../../../../helpers/renderFuncs';
import { buildBlankMiss, buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { BassBarParams, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { BassBarFace, BassBarSolve, PlateContourSolve } from '../../violin-family-solves';
import { renderPlateContour, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { defineFholePath, renderFholes, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { solveNeck } from '../neck-panel/neck-panel';
import { calcSideViewOffsetX, renderBodySideProfile, solveLongArching } from '../long-arching-panel/long-arching-panel';
import { stepAlong, TURN, vecAtAngle } from '../../../../helpers/math/simpleGeometry';
import { Matrix2D, pathFromLine, pathFromPolyline, transformPath } from '../../../../helpers/math/pathMath';
import { innerSurfaceZAt } from '../dev-graduation-panel/dev-graduation-panel';
import { Pt } from '../../../../models/types';

// The bass bar, tried out on localhost only, once the top is graduated. A placeholder so far: the
// panel, its seed and a solve that only checks the fields, drawn over the top. Panel and render,
// then the solve.

const LEFT_INK = 8;
const RIGHT_INK = 6;
// between the two feet in the side view
const SIDE_GAP = 10;

// a violin's bar runs about three quarters of the body, 5.5 mm wide and 12 mm high at the middle;
// the bigger instruments scale from it. Placeholder figures
const SEED_LENGTH_SHARE = 0.75;
const SEED_WIDTH_SHARE = 5.5 / 356;
const SEED_HEIGHT_SHARE = 12 / 356;

@Component({
  selector: 'app-vf-dev-bassbar-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './dev-bassbar-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevBassBarPanel extends PanelComponentBase {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('lamplight');

  static seed(p: ViolinFamilyParams): void {
    if (p.bassBar || !p.graduation) return;
    let h = p.body.height;
    let upperEyeX = p.fHoles.UEye.x;
    

    p.bassBar = {
      length: Math.round(h * SEED_LENGTH_SHARE),
      width: Math.round(2 * h * SEED_WIDTH_SHARE) / 2,
      height: Math.round(2 * h * SEED_HEIGHT_SHARE) / 2,
      xOffset: -upperEyeX/2,
      angle: 90
    };
  }

  // what the last draw solved; reportSolveFailures() reads it rather than solving again
  b!: BassBarSolve;

  get bb(): BassBarParams {
    return this.params.bassBar!;
  }

  reportSolveFailures(): void {
    reportFailures(this.b.failures, 'Dev Bass Bar');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let a = solveLongArching(p)!;
    let o = solvePlateContour(p)!;
    let b = this.b = solveBassBar(p)!;
    let sideX = calcSideViewOffsetX(p);

    return [
      renderPlateContour(p, o, this.pal, this.flags, false, false),
      renderFholes(p, this.pal),
      renderTranslatedLayers([renderBassBarSideProfile(b, this.pal)], -sideX),
      renderSolveFailures(b.failures, this.pal.alert),
      renderBassBar(b, this.pal),
    ];
  }
}

export const renderBassBar = (b: BassBarSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let { upperLeft, upperRight, lowerLeft, lowerRight } = b;
  if (!upperLeft || !upperRight || !lowerLeft || !lowerRight) return;
  renderSegment(upperLeft, upperRight, pal.ink(0))(g, ui);
  renderSegment(upperRight, lowerRight, pal.ink(RIGHT_INK))(g, ui);
  renderSegment(lowerRight, lowerLeft, pal.ink(0))(g, ui);
  renderSegment(lowerLeft, upperLeft, pal.ink(LEFT_INK))(g, ui);
}

// the two faces side by side, feet together, the left face turned over so its top faces away
export const renderBassBarSideProfile = (b: BassBarSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  if (b.footZ === null) return;
  if (b.left) {
    let m: Matrix2D = [-1, 0, 0, 1, b.footZ - SIDE_GAP / 2, 0];
    renderPath(transformPath(b.left.edge, m), pal.ink(LEFT_INK), STROKE_WEIGHT.section)(g, ui);
    renderPath(transformPath(b.left.foot, m), pal.ink(LEFT_INK), STROKE_WEIGHT.section)(g, ui);
    if (b.left.height) renderPath(transformPath(b.left.height, m), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
  }
  if (b.right) {
    let m: Matrix2D = [1, 0, 0, 1, SIDE_GAP / 2 - b.footZ, 0];
    renderPath(transformPath(b.right.edge, m), pal.ink(RIGHT_INK), STROKE_WEIGHT.section)(g, ui);
    renderPath(transformPath(b.right.foot, m), pal.ink(RIGHT_INK), STROKE_WEIGHT.section)(g, ui);
    if (b.right.height) renderPath(transformPath(b.right.height, m), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
  }
}

// a later panel reads the bass bar by calling this; it returns and never writes to the params.
// `step` is the spacing along the bar between surface reads: coarse on screen, fine for export
export function solveBassBar(p: ViolinFamilyParams, step = 5): BassBarSolve | null {
  if (!p.bassBar) return null;
  let bb = p.bassBar;
  let b: BassBarSolve = { upperLeft: null, upperRight: null, lowerLeft: null, lowerRight: null, left: null, right: null, footZ: null, failures: [] };

  solveSection(b.failures, 'Bass bar', ['bar'], () => {
    let blank = buildBlankMiss('Bass bar', ['bar'], [bb.length, bb.width, bb.height, bb.xOffset, bb.angle]);
    if (blank) return blank;
    if (!(bb.length > 0 && bb.width > 0 && bb.height > 0)) return buildMiss('Bass bar: the length, width and height need values above 0.', ['bar']);
    
    let angle = bb.angle * TURN.degree
    let along = vecAtAngle(angle);
    let across = vecAtAngle(angle + TURN.quarter);

    let midpoint = { x: bb.xOffset, y: p.body.height / 2 };
    let leftMid = stepAlong(midpoint, across, bb.width / 2);
    let rightMid = stepAlong(midpoint, across, -bb.width / 2);

    b.upperLeft = stepAlong(leftMid, along, bb.length / 2);
    b.upperRight = stepAlong(rightMid, along, bb.length / 2);
    b.lowerLeft = stepAlong(leftMid, along, -bb.length / 2);
    b.lowerRight = stepAlong(rightMid, along, -bb.length / 2);

    let left = calcBassBarContact(p, b.lowerLeft, b.upperLeft, step);
    let right = calcBassBarContact(p, b.lowerRight, b.upperRight, step);
    let both = [...left, ...right];
    if (!both.length) return null;

    // the foot is one flat across the bar, hung into the body from the highest point on either face
    let peak = both.reduce((hi, q) => q.x > hi.x ? q : hi);
    b.footZ = peak.x - bb.height;
    b.left = buildBassBarFace(left, b.footZ, left.includes(peak) ? peak : null);
    b.right = buildBassBarFace(right, b.footZ, right.includes(peak) ? peak : null);
    return null;
  });

  return b;
}

// the inside of the top along one face of the bar, from one end to the other, as (z, y)
export function calcBassBarContact(p: ViolinFamilyParams, from: Pt, to: Pt, step: number): Pt[] {
  let n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
  let contact: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    let y = from.y + (to.y - from.y) * i / n;
    let z = innerSurfaceZAt(p, 'top', from.x + (to.x - from.x) * i / n, y);
    if (z !== null) contact.push(new Pt(z, y));
  }
  return contact;
}

export function buildBassBarFace(contact: Pt[], footZ: number, peak: Pt | null): BassBarFace | null {
  if (contact.length < 2) return null;
  let first = contact[0], last = contact[contact.length - 1];
  return {
    edge: pathFromPolyline(contact),
    foot: pathFromPolyline([first, new Pt(footZ, first.y), new Pt(footZ, last.y), last]),
    height: peak ? pathFromLine(peak, new Pt(footZ, peak.y)) : null,
  };
}
