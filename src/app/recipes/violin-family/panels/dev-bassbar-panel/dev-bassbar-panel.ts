import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  renderGuideKnot, renderGuideMeasure, renderPath, renderPointHalo, renderSegment, renderSegmentHalo, renderSolveFailures, renderTranslatedLayers,
} from '../../../../helpers/renderFuncs';
import { buildBlankMiss, buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { TooltipDirective } from '../../../../docs/tooltips';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { applyRowMove, RowMove, RowReorderDirective } from '../../../../shared/row-reorder';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { BassBarParams, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { BassBarFace, BassBarSolve, PlateSurface } from '../../violin-family-solves';
import { renderPlateContour, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';
import { calcSideViewOffsetX } from '../long-arching-panel/long-arching-panel';
import { stepAlong, TURN, vecAtAngle } from '../../../../helpers/math/simpleGeometry';
import { makeMonotoneSpline } from '../../../../helpers/math/vibeMath';
import { applyMatrix, Matrix2D, pathFromPolyline, transformPath } from '../../../../helpers/math/pathMath';
import { innerSurfaceZAt, thicknessField, ThicknessField } from '../dev-graduation-panel/dev-graduation-panel';
import { solveCrossArching } from '../cross-arching-panel/cross-arching-panel';
import { Pt } from '../../../../models/types';

// The bass bar, tried out on localhost only, once the top is graduated: where it sits in plan, and
// its underside, carved through points given as depths of wood below the inside of the top. Panel
// and render, then the solve.

// the faces run the bar's length, the ends its width, the underside is carved through the points
const FACE_INK = 0;
const END_INK = 1;
const BOTTOM_INK = 3;
// the right face is the left's sibling
const RIGHT_FAINT = 3;
// between the two undersides in the side view, at their lowest
const SIDE_GAP = 10;
// two knots closer than this (% along the bar) collapse to the first
const KNOT_EPS = 1e-3;
// a fine export solve reads about a thousand points; past this the kept reads start over
const TOP_READS_KEPT = 4000;

// a violin's bar runs about three quarters of the body, 5.5 mm wide and 12 mm high at the middle,
// falling off to a few mm at the ends; the bigger instruments scale from it. Placeholder figures
const SEED_LENGTH_SHARE = 0.75;
const SEED_WIDTH_SHARE = 5.5 / 356;
const SEED_MIDDLE_SHARE = 12 / 356;
const SEED_QUARTER_SHARE = 9.5 / 356;
const SEED_END_SHARE = 3 / 356;

// a field's focus: the faces (length), the ends (width), or a point by its row
export type BassBarHighlight = 'faces' | 'ends' | number;

@Component({
  selector: 'app-vf-dev-bassbar-panel',
  imports: [FormsModule, NumberStepperDirective, RowReorderDirective, TooltipDirective],
  templateUrl: './dev-bassbar-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevBassBarPanel extends PanelComponentBase<BassBarHighlight> {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('orchid');
  protected readonly faceInk = FACE_INK;
  protected readonly endInk = END_INK;
  protected readonly bottomInk = BOTTOM_INK;

  static seed(p: ViolinFamilyParams): void {
    if (p.bassBar || !p.graduation) return;
    let h = p.body.height;
    p.bassBar = {
      length: Math.round(h * SEED_LENGTH_SHARE),
      width: Math.round(2 * h * SEED_WIDTH_SHARE) / 2,
      xOffset: -p.fHoles.UEye.x / 2,
      angle: 90,
      points: [
        { t: 50, h: Math.round(2 * h * SEED_MIDDLE_SHARE) / 2, mirror: false },
        { t: 25, h: Math.round(2 * h * SEED_QUARTER_SHARE) / 2, mirror: true },
        { t: 0, h: Math.round(2 * h * SEED_END_SHARE) / 2, mirror: true },
      ],
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
    let o = solvePlateContour(p)!;
    let b = this.b = solveBassBar(p)!;
    let sideX = calcSideViewOffsetX(p);
    let highlight = this.highlightedPart?.key ?? null;

    return [
      renderPlateContour(p, o, this.pal, this.flags, false, false),
      renderFholes(p, this.pal),
      renderTranslatedLayers([renderBassBarSideProfile(p, b, this.pal, this.flags.showModuleGuides, highlight)], -sideX),
      renderSolveFailures(b.failures, this.pal.alert),
      renderBassBar(b, this.pal, highlight),
    ];
  }

  // a new point fills the widest gap along the bar, mirrored twins included, at the depth between
  addPoint(): void {
    let knots = [...this.b.knots].sort((a, c) => a.bottom.y - c.bottom.y);
    let length = this.bb.length;
    let gap = 0, at = -1;
    for (let i = 0; i + 1 < knots.length; i++) {
      if (knots[i + 1].bottom.y - knots[i].bottom.y > gap) { gap = knots[i + 1].bottom.y - knots[i].bottom.y; at = i; }
    }
    if (at < 0) {
      this.bb.points.push({ t: 50, h: 0, mirror: false });
    } else {
      let lo = knots[at], hi = knots[at + 1];
      this.bb.points.push({
        t: +(50 * (lo.bottom.y + hi.bottom.y) / length).toFixed(1),
        h: +(((lo.topZ - lo.bottom.x) + (hi.topZ - hi.bottom.x)) / 2).toFixed(1),
        mirror: false,
      });
    }
    this.recordEditAndRedraw();
  }

  removePoint(index: number): void {
    this.bb.points.splice(index, 1);
    this.recordEditAndRedraw();
  }

  // the upper end first, as the side view stands
  sortPoints(): void {
    this.bb.points.sort((a, c) => c.t - a.t);
    this.recordEditAndRedraw();
  }

  // the table has no marker row, so the marker sits past the end
  moveRow(move: RowMove): void {
    applyRowMove(this.bb.points, this.bb.points.length, move);
    this.recordEditAndRedraw();
  }
}

export const renderBassBar = (b: BassBarSolve, pal: PanelPalette, highlight: BassBarHighlight | null) => (g: any, ui: any): void => {
  let { upperLeft, upperRight, lowerLeft, lowerRight } = b;
  if (!upperLeft || !upperRight || !lowerLeft || !lowerRight) return;
  let face = pal.ink(FACE_INK);
  let rightFace = face.faint(RIGHT_FAINT);
  let end = pal.ink(END_INK);
  let bottom = pal.ink(BOTTOM_INK);

  if (highlight === 'faces') {
    renderSegmentHalo(lowerLeft, upperLeft, face, STROKE_WEIGHT.focusHalo)(g, ui);
    renderSegmentHalo(lowerRight, upperRight, rightFace, STROKE_WEIGHT.focusHalo)(g, ui);
  } else if (highlight === 'ends') {
    renderSegmentHalo(upperLeft, upperRight, end, STROKE_WEIGHT.focusHalo)(g, ui);
    renderSegmentHalo(lowerLeft, lowerRight, end, STROKE_WEIGHT.focusHalo)(g, ui);
  } else if (typeof highlight === 'number') {
    for (let knot of b.knots) {
      if (knot.source === highlight) renderPointHalo(knot.plan, bottom)(g, ui);
    }
  }
  renderSegment(upperLeft, upperRight, end)(g, ui);
  renderSegment(lowerLeft, lowerRight, end)(g, ui);
  renderSegment(lowerLeft, upperLeft, face)(g, ui);
  renderSegment(lowerRight, upperRight, rightFace)(g, ui);
}

// the two faces side by side, undersides together at their lowest, the left face turned over so its
// top faces away; lined up with the plan, the bar's middle at the body's
export const renderBassBarSideProfile = (p: ViolinFamilyParams, b: BassBarSolve, pal: PanelPalette, showGuides: boolean, highlight: BassBarHighlight | null) =>
  (g: any, ui: any): void => {
    if (b.lowZ === null) return;
    let lowerY = (p.body.height - p.bassBar!.length) / 2;
    let face = pal.ink(FACE_INK);
    let bottom = pal.ink(BOTTOM_INK);
    if (b.left) {
      let m: Matrix2D = [-1, 0, 0, 1, b.lowZ - SIDE_GAP / 2, lowerY];
      renderBassBarFace(b, b.left, m, face, bottom, showGuides, highlight)(g, ui);
    }
    if (b.right) {
      let m: Matrix2D = [1, 0, 0, 1, SIDE_GAP / 2 - b.lowZ, lowerY];
      renderBassBarFace(b, b.right, m, face.faint(RIGHT_FAINT), bottom, showGuides, highlight)(g, ui);
    }
  }

// one face in the side view: its edge on the top, the underside, and each knot measured down from
// the inside of the top on the centreline, which is where a point's depth is read
export const renderBassBarFace = (b: BassBarSolve, f: BassBarFace, m: Matrix2D, face: string, bottom: string, showGuides: boolean, highlight: BassBarHighlight | null) =>
  (g: any, ui: any): void => {
    for (let knot of b.knots) {
      if (knot.source === highlight) renderPointHalo(applyMatrix(m, knot.bottom), bottom)(g, ui);
    }
    renderPath(transformPath(f.edge, m), face, STROKE_WEIGHT.section)(g, ui);
    renderPath(transformPath(f.bottom, m), bottom, STROKE_WEIGHT.section)(g, ui);
    if (showGuides) {
      for (let knot of b.knots) {
        let at = applyMatrix(m, knot.bottom);
        renderGuideMeasure(applyMatrix(m, new Pt(knot.topZ, knot.bottom.y)), at, bottom, 0, knot.topZ - knot.bottom.x)(g, ui);
        renderGuideKnot(at, bottom)(g, ui);
      }
    }
  }

// a later panel reads the bass bar by calling this; it returns and never writes to the params.
// `step` is the spacing along the bar between surface reads: coarse on screen, fine for export
export function solveBassBar(p: ViolinFamilyParams, step = 5): BassBarSolve | null {
  if (!p.bassBar) return null;
  let bb = p.bassBar;
  let b: BassBarSolve = {
    upperLeft: null, upperRight: null, lowerLeft: null, lowerRight: null, left: null, right: null, bottom: [], knots: [], lowZ: null, failures: [],
  };
  let along = vecAtAngle(bb.angle * TURN.degree);
  let across = vecAtAngle(bb.angle * TURN.degree + TURN.quarter);
  let midpoint = { x: bb.xOffset, y: p.body.height / 2 };

  solveSection(b.failures, 'Bass bar', ['bar'], () => {
    let blank = buildBlankMiss('Bass bar', ['bar'], [bb.length, bb.width, bb.xOffset, bb.angle]);
    if (blank) return blank;
    if (!(bb.length > 0 && bb.width > 0)) return buildMiss('Bass bar: the length and width need values above 0.', ['bar']);

    let leftMid = stepAlong(midpoint, across, bb.width / 2);
    let rightMid = stepAlong(midpoint, across, -bb.width / 2);
    b.upperLeft = stepAlong(leftMid, along, bb.length / 2);
    b.upperRight = stepAlong(rightMid, along, bb.length / 2);
    b.lowerLeft = stepAlong(leftMid, along, -bb.length / 2);
    b.lowerRight = stepAlong(rightMid, along, -bb.length / 2);
    return null;
  });
  if (!b.lowerLeft || !b.lowerRight || !b.upperLeft || !b.upperRight) return b;
  let { lowerLeft, lowerRight, upperLeft, upperRight } = b;

  // each point's depth is read on the centreline and the underside runs straight across the bar,
  // so the face the top stands higher on is the taller. The spline runs through the knots in z,
  // not in depth, so the underside stays a carved curve whatever the graduation does between them
  solveSection(b.failures, 'Bass bar shape', ['shape'], () => {
    let blank = buildBlankMiss('Bass bar shape', ['shape'], bb.points.flatMap(pt => [pt.t, pt.h]));
    if (blank) return blank;
    if (bb.points.some(pt => pt.t < 0 || pt.t > 100)) return buildMiss('Bass bar: a point\'s position runs from 0 to 100 %.', ['shape']);

    let raw = bb.points
      .flatMap((pt, source) => pt.mirror ? [{ t: pt.t, h: pt.h, source }, { t: 100 - pt.t, h: pt.h, source }] : [{ t: pt.t, h: pt.h, source }])
      .sort((a, c) => a.t - c.t);
    let knots = raw.filter((k, i) => i === 0 || k.t - raw[i - 1].t > KNOT_EPS);
    if (!knots.length || knots[0].t > KNOT_EPS || knots[knots.length - 1].t < 100 - KNOT_EPS) {
      return buildMiss('Bass bar: the underside needs a point at each end, at 0 and 100 %.', ['shape']);
    }
    // a top with no readings has no inside to carve against yet
    if (!thicknessField(p, 'top')) return null;

    let lowerMid = stepAlong(midpoint, along, -bb.length / 2);
    let offTop: Pt[] = [];
    for (let k of knots) {
      let s = bb.length * k.t / 100;
      let plan = stepAlong(lowerMid, along, s);
      let topZ = topInsideZAt(p, plan.x, plan.y);
      if (topZ === null) offTop.push(plan);
      else b.knots.push({ bottom: new Pt(topZ - k.h, s), topZ, plan, source: k.source });
    }
    if (offTop.length) return buildMiss('Bass bar: a point falls off the inside of the top.', ['shape'], offTop);

    let bottomZAt = makeMonotoneSpline(b.knots.map(k => k.bottom.y), b.knots.map(k => k.bottom.x));
    let n = Math.max(1, Math.ceil(bb.length / step));
    for (let i = 0; i <= n; i++) b.bottom.push(new Pt(bottomZAt(bb.length * i / n), bb.length * i / n));
    b.lowZ = Math.min(...b.bottom.map(q => q.x));

    let left = calcBassBarContact(p, lowerLeft, upperLeft, step);
    let right = calcBassBarContact(p, lowerRight, upperRight, step);
    b.left = buildBassBarFace(left, bottomZAt);
    b.right = buildBassBarFace(right, bottomZAt);

    let through = [
      ...left.filter(q => q.x <= bottomZAt(q.y)).map(q => stepAlong(lowerLeft, along, q.y)),
      ...right.filter(q => q.x <= bottomZAt(q.y)).map(q => stepAlong(lowerRight, along, q.y)),
    ];
    if (through.length) return buildMiss('Bass bar: the underside comes up through the top at the marks; deepen the points near them.', ['shape'], through);
    return null;
  });

  return b;
}

// the inside of the top along one face of the bar, from one end to the other, as (z, s), s the
// distance from `from`
export function calcBassBarContact(p: ViolinFamilyParams, from: Pt, to: Pt, step: number): Pt[] {
  let length = Math.hypot(to.x - from.x, to.y - from.y);
  let n = Math.max(1, Math.ceil(length / step));
  let contact: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    let z = topInsideZAt(p, from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n);
    if (z !== null) contact.push(new Pt(z, length * i / n));
  }
  return contact;
}

// the inside of the top is a slow read, a few row solves each, and no point edit moves the faces:
// the reads are kept against the surface and thickness field the solves hand back, which hold
// between edits
let topReads: { surface: PlateSurface; field: ThicknessField; z: Map<string, number | null> } | null = null;

export function topInsideZAt(p: ViolinFamilyParams, x: number, y: number): number | null {
  let surface = solveCrossArching(p)?.top;
  let field = thicknessField(p, 'top');
  if (!surface || !field) return null;
  if (topReads?.surface !== surface || topReads.field !== field || topReads.z.size > TOP_READS_KEPT) topReads = { surface, field, z: new Map() };
  let key = `${x} ${y}`;
  let z = topReads.z.get(key);
  if (z === undefined) topReads.z.set(key, z = innerSurfaceZAt(p, 'top', x, y));
  return z;
}

// the face's edge on the top, and the underside below it with the ends that join the two
export function buildBassBarFace(contact: Pt[], bottomZAt: (s: number) => number): BassBarFace | null {
  if (contact.length < 2) return null;
  let under = contact.map(q => new Pt(bottomZAt(q.y), q.y));
  return {
    edge: pathFromPolyline(contact),
    bottom: pathFromPolyline([contact[0], ...under, contact[contact.length - 1]]),
  };
}
