import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  angleFromCenter, angleWithinSweep, arcReach, dist, moveInVectorSpace, normalizeRadians, placeCircleOnPointAtAngle, pointOnCircle, TURN,
  vectorFromSlope,
} from '../../../../helpers/math/simpleGeometry';
import { circleCircleIntersections } from '../../../../helpers/math/draftMath';
import { arcPathData, combinePathStrings, pathFromLine } from '../../../../helpers/math/pathMath';
import { renderArcHalo, renderDashLine, renderPath, renderSegment, renderSegmentHalo, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { Arc, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  RenderLayer, ScrollFailure, ScrollKey, ScrollSolve, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from '../../violin-family-types';
import { badArc, longArc, renderScrollNeck, renderVolute, scrollArc, solveVolute } from '../volute-panel/volute-panel';
import { neckTaper } from '../neck-panel/neck-panel';

// The scroll's side: the back on from the crown, S2 then a straight, S3 turning back down to hang
// below the nut, and the nape into the neck's back; the front up from the nut, a flat, F0, a
// straight, and F1 curving back until it first meets the spiral. Panel and render, then the solve.

// the arcs take an arc halo; the straights, the flat and the neck's thickness a segment halo on the
// line their length makes
export type ScrollHighlightKey = 'S2' | 'S3' | 'nape' | 'F0' | 'F1' | 'backStraight' | 'flat' | 'frontStraight' | 'upperThickness';
export type ScrollLine = 'square' | 'backStraight' | 'flat' | 'frontStraight';

@Component({
  selector: 'app-vf-scroll-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './scroll-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class ScrollPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showModuleArcs', 'showModuleGuides'];
  protected readonly pal = ThemeService.getPalette('stones');
  protected readonly nearestFraction = nearestFraction;

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; the readouts and report() read it
  s!: ScrollSolve;
  extent: { height: number; width: number } | null = null;
  highlighted: { key: ScrollHighlightKey; color: string } | null = null;

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures(this.s.failures, 'Scroll');
  }

  focus(key: ScrollHighlightKey, color: string): void {
    this.highlighted = { key, color };
    this.draw();
  }

  blur(): void {
    this.highlighted = null;
    this.draw();
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let s = this.s = solveScroll(p)!;
      this.extent = s.S3 ? scrollExtent(s) : null;
      let key = this.highlighted?.key;
      let color = this.highlighted?.color ?? '';
      let line = (key === 'backStraight' || key === 'flat' || key === 'frontStraight') && !unsolved(s, key) ? scrollLines(p, s)[key]
        : key === 'upperThickness' ? [new Pt(0, 0), new Pt(-p.neck!.upperThickness, 0)] as [Pt, Pt]
        : null;
      let arc = key === 'S2' || key === 'S3' || key === 'nape' || key === 'F0' || key === 'F1' ? s[key] : null;
      // the volute as plain profile, so only what this panel edits is in colour. The profile needs
      // the whole scroll solved, so a miss falls back to the volute's own render
      this.drawn.emit([
        renderScrollNeck(p, s, this.pal, false),
        s.failures.length
          ? renderVolute(p, s, this.pal, this.flags, false, null)
          : renderPath(defineSideScrollPath(p, s), this.pal.neutral, STROKE_WEIGHT.trace),
        renderScroll(p, s, this.pal, this.flags, true, arc ? { arc, color } : null, line ? { line, color } : null),
        renderSolveFailures(s.failures, this.pal.alert),
      ]);
    });
  }
}

const unsolved = (s: ScrollSolve, key: ScrollKey) => s.failures.some(f => f.unsolved.includes(key));

// the back from S2 down to the nape, and the front up from the nut. A straight takes its arc's
// colour, the square line the nape's; module guides box the head
export const renderScroll = (
  p: ViolinFamilyParams,
  s: ScrollSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs' | 'showModuleGuides'>,
  currentModule: boolean,
  highlighted: { arc: Arc; color: string } | null,
  highlightedLine: { line: [Pt, Pt]; color: string } | null,
) => (g: any, ui: any): void => {
  let fancy = currentModule && flags.showModuleArcs;
  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, longArc(highlighted.arc))(g, ui);
  if (highlightedLine) renderSegmentHalo(...highlightedLine.line, highlightedLine.color)(g, ui);

  if (currentModule && flags.showModuleGuides && s.S3) {
    let { height, width } = scrollExtent(s);
    let corners = [new Pt(0, 0), new Pt(0, height), new Pt(-width, height), new Pt(-width, 0)];
    for (let i = 0; i < 4; i++) renderDashLine(corners[i], corners[(i + 1) % 4], pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  }

  if (s.S2) scrollArc(s.S2, pal.ink(1).faint(-3), fancy)(g, ui);
  if (s.S3) scrollArc(s.S3, pal.ink(1).faint(-1), fancy)(g, ui);
  if (s.nape) scrollArc(s.nape, pal.ink(1).faint(5), fancy)(g, ui);
  if (s.F0) scrollArc(s.F0, pal.ink(3), fancy)(g, ui);
  if (s.F1) scrollArc(s.F1, pal.ink(3).faint(-3), fancy)(g, ui);

  // a straight of no length, or a duck tail already at the nape, has nothing to draw
  let line = ([a, b]: [Pt, Pt], color: string) => dist(a, b) > 1e-9 && renderSegment(a, b, color, STROKE_WEIGHT.trace)(g, ui);
  let lines = scrollLines(p, s);
  if (s.S2 && !unsolved(s, 'backStraight')) line(lines.backStraight, pal.ink(1).faint(-3));
  if (s.nape) line(lines.square, pal.ink(1).faint(5));
  if (!unsolved(s, 'flat')) line(lines.flat, pal.ink(3).faint(-3));
  if (s.F0 && !unsolved(s, 'frontStraight')) line(lines.frontStraight, pal.ink(3));
};

// the lines aren't solved as parts: each runs between solved arcs, so it is read off here. A line
// whose arc hasn't solved is a point where that arc would start
export function scrollLines(p: ViolinFamilyParams, s: ScrollSolve): Record<ScrollLine, [Pt, Pt]> {
  let v = p.scroll!;
  let nutTop = new Pt(0, p.neck!.nutHeight);
  let backTop = s.S2 ? pointOnCircle(s.S2, s.S2.end) : nutTop;
  let frontTop = s.F0 ? pointOnCircle(s.F0, s.F0.end) : nutTop;
  let S2End = s.S2?.end ?? 0;
  let F0End = s.F0?.end ?? 0;
  return {
    square: s.S3 && s.nape ? [pointOnCircle(s.S3, s.S3.start), pointOnCircle(s.nape, s.nape.end)] : [nutTop, nutTop],
    backStraight: [backTop, moveInVectorSpace(backTop, [{ ...vectorFromSlope(S2End + TURN.quarter), mag: v.backStraight }])],
    flat: [nutTop, new Pt(nutTop.x, nutTop.y + v.flat)],
    frontStraight: [frontTop, moveInVectorSpace(frontTop, [{ ...vectorFromSlope(F0End + TURN.quarter), mag: v.frontStraight }])],
  };
}

// the readouts, off a back solved through S3: the nut up to the crown's top, and the neck's front
// back to the scroll's furthest reach
export function scrollExtent(s: ScrollSolve): { height: number; width: number } {
  let back = [s.S0!, s.S1!, s.S2!, s.S3!];
  return {
    height: Math.max(...back.flatMap(a => arcReach(a, TURN.quarter)).map(pt => pt.y)),
    width: -Math.min(...back.flatMap(a => arcReach(a, TURN.half)).map(pt => pt.x)),
  };
}

// the scroll's side profile off a scroll solved whole: the back from the eye's back under the eye and
// out round the spiral and down to where the nape meets the neck's back, then the front up from the
// nut. S3, the nape and F1 are solved counterclockwise but turn clockwise along the edge, so they're
// drawn end to start to keep every piece running on from the last
export function defineSideScrollPath(p: ViolinFamilyParams, s: ScrollSolve): string {
  let v = p.scroll!;
  let arc = (a: Arc) => arcPathData(a, a.r, a.start, a.end);
  let backward = (a: Arc) => {
    let from = pointOnCircle(a, a.end);
    let to = pointOnCircle(a, a.start);
    let large = normalizeRadians(a.end - a.start) > TURN.half ? 1 : 0;
    return `M ${from.x},${from.y} A ${a.r},${a.r} 0 ${large},0 ${to.x},${to.y}`;
  };
  let at = pointOnCircle;
  let [S0, S1, S2, S3, nape, F0, F1] = [s.S0!, s.S1!, s.S2!, s.S3!, s.nape!, s.F0!, s.F1!];
  let flatTop = at(F0, F0.start);
  let back = [
    arcPathData(s.eye!, s.eye!.r, -TURN.half, 0),
    ...[...s.spiral!].reverse().map(arc),
    arc(S0), arc(S1), arc(S2),
    pathFromLine(at(S2, S2.end), at(S3, S3.end)),
    backward(S3),
    pathFromLine(at(S3, S3.start), at(nape, nape.end)),
    backward(nape),
  ];
  let front = [
    pathFromLine(new Pt(flatTop.x, flatTop.y - v.flat), flatTop),
    arc(F0),
    pathFromLine(at(F0, F0.end), at(F1, F1.end)),
    backward(F1),
  ];
  return combinePathStrings([...back, ...front]);
}

// the scroll's side solved whole, the volute's solve run on: the back from S2 down to the nape, the
// front up from the nut. A run stops at the first bad part, everything after it unsolved. A later
// panel reads the scroll by calling this; it returns and never writes to the params
export function solveScroll(p: ViolinFamilyParams): ScrollSolve | null {
  let s = solveVolute(p);
  if (!s || !s.spiral) return s;
  let v = p.scroll!;
  // the neck's back leans off the fingerboard plane with the taper, thinning on up past the nut
  let taper = neckTaper(p);
  let backAt = (y: number) => -p.neck!.upperThickness + taper * y;
  let lean = Math.atan(taper);
  let nutTop = new Pt(0, p.neck!.nutHeight);
  // a cleared field is null, which passes `>= 0`, so it is asked for first
  let badLength = (section: string, key: ScrollKey, unsolved: ScrollKey[]): ScrollFailure =>
    ({ message: `${section}: ${key} needs a length, or 0.`, unsolved, circles: [], segments: [] });

  if (s.S1) solveSection(s.failures, 'Back', ['S2', 'S3', 'nape', 'backStraight'], () => {
    let S1 = s.S1!;
    let joint = pointOnCircle(S1, S1.end);
    let S2Sweep = v.S2Sweep * TURN.degree;
    if (!(v.S2R > 0) || !(S2Sweep > 0) || S2Sweep > TURN.full) return badArc('Back', 'S2', v.S2R, ['S2', 'S3', 'nape', 'backStraight']);
    let S2 = placeCircleOnPointAtAngle(v.S2R, joint, S1.end);
    s.S2 = new Arc(S2.x, S2.y, S2.r, S1.end, S1.end + S2Sweep);

    if (!Number.isFinite(v.backStraight) || v.backStraight < 0) return badLength('Back', 'backStraight', ['S3', 'nape', 'backStraight']);
    let foot = moveInVectorSpace(pointOnCircle(s.S2, s.S2.end), [{ ...vectorFromSlope(s.S2.end + TURN.quarter), mag: v.backStraight }]);

    // S3 turns back clockwise, so as a counterclockwise sweep it runs from the duck tail to the foot
    let S3end = s.S2.end - TURN.half;
    if (!(v.S3R > 0)) return badArc('Back', 'S3', v.S3R, ['S3', 'nape']);
    // negative lifts the duck tail above the nut; only a missing number is refused
    if (!Number.isFinite(v.hang))
      return { message: 'Back: the hang below the nut needs a length.', unsolved: ['S3', 'nape'], circles: [], segments: [] };
    let S3 = placeCircleOnPointAtAngle(v.S3R, foot, S3end);
    // the duck tail comes down to its hang below the nut's lower edge: of the two angles on the
    // circle at that height, the one the shortest sweep to S3's foot reaches first
    let level = (-v.hang - S3.y) / S3.r;
    if (Math.abs(level) > 1)
      return { message: 'Back: S3 never comes down to the hang below the nut. Enlarge S3, lower it with the straight, or shorten the hang.', unsolved: ['S3', 'nape'], circles: [S3], segments: [] };
    let below = Math.asin(level);
    let sweepTo = (a: number) => normalizeRadians(S3end - a) || TURN.full;
    s.S3 = new Arc(S3.x, S3.y, S3.r, S3end - Math.min(sweepTo(below), sweepTo(TURN.half - below)), S3end);

    let duckTail = pointOnCircle(s.S3, s.S3.start);
    if (!(v.napeR > 0)) return badArc('Back', 'nape', v.napeR, ['nape']);

    // one circle through the duck tail, tangent to the neck's back: its centre a radius forward of
    // the back, as far below the duck tail as puts the tail on it. Tighter than the gap it rises off
    // the duck tail before coming round; wider, it meets the tail at an angle. A centre a radius off
    // the back lies on x = taper * y + offset
    let offset = -p.neck!.upperThickness - v.napeR * Math.hypot(1, taper);
    if (v.napeCircle) {
      let gap = backAt(duckTail.y) - duckTail.x;
      let e = offset - duckTail.x;
      let [a, b, c] = [1 + taper ** 2, 2 * (taper * e - duckTail.y), e ** 2 + duckTail.y ** 2 - v.napeR ** 2];
      let disc = b ** 2 - 4 * a * c;
      if (!(gap > 0) || disc < 0)
        return {
          message: `Back: a nape of ${v.napeR}mm can't reach the neck's back from the duck tail. Enlarge it past half the ${Math.round(gap * 10) / 10}mm between them, or bring the duck tail forward with S3 or the straight.`,
          unsolved: ['nape'],
          circles: [{ x: taper * duckTail.y + offset, y: duckTail.y, r: v.napeR }],
          segments: [],
        };
      let y = (-b - Math.sqrt(disc)) / (2 * a);
      let center = new Pt(taper * y + offset, y);
      s.nape = new Arc(center.x, center.y, v.napeR, -lean, angleFromCenter(center, duckTail));
      return null;
    }

    // a line runs square from the duck tail to the neck's back, the nape filleting the corner
    let center = new Pt(taper * (duckTail.y - v.napeR) + offset, duckTail.y - v.napeR);
    if (duckTail.x > center.x)
      return {
        message: `Back: the duck tail sits too far forward for a nape of ${v.napeR}mm to fit before the neck's back. Shrink the nape, or move the duck tail back with S3 or the straight.`,
        unsolved: ['nape'],
        circles: [{ x: center.x, y: center.y, r: v.napeR }],
        segments: [[duckTail, new Pt(backAt(duckTail.y), duckTail.y)]],
      };
    s.nape = new Arc(center.x, center.y, v.napeR, -lean, TURN.quarter);
    return null;
  });

  solveSection(s.failures, 'Front', ['F0', 'F1', 'flat', 'frontStraight'], () => {
    if (!Number.isFinite(v.flat) || v.flat < 0) return badLength('Front', 'flat', ['F0', 'F1', 'flat', 'frontStraight']);
    let top = new Pt(nutTop.x, nutTop.y + v.flat);

    let F0End = v.F0Sweep * TURN.degree;
    if (!(v.F0R > 0) || !(F0End > 0) || F0End > TURN.full) return badArc('Front', 'F0', v.F0R, ['F0', 'F1', 'frontStraight']);
    let F0 = placeCircleOnPointAtAngle(v.F0R, top, 0);
    s.F0 = new Arc(F0.x, F0.y, F0.r, 0, F0End);

    if (!Number.isFinite(v.frontStraight) || v.frontStraight < 0) return badLength('Front', 'frontStraight', ['F1', 'frontStraight']);
    let foot = moveInVectorSpace(pointOnCircle(s.F0, s.F0.end), [{ ...vectorFromSlope(s.F0.end + TURN.quarter), mag: v.frontStraight }]);

    // F1 curves back clockwise until it first crosses a drawn arc of the spiral
    if (!(v.F1R > 0)) return badArc('Front', 'F1', v.F1R, ['F1']);
    let F1end = s.F0.end + TURN.half;
    let F1 = placeCircleOnPointAtAngle(v.F1R, foot, F1end);
    let sweep = Infinity;
    for (let arc of s.spiral!) {
      for (let crossing of circleCircleIntersections(F1, arc)) {
        if (!angleWithinSweep(angleFromCenter(arc, crossing), arc.start, arc.end)) continue;
        let a = normalizeRadians(F1end - angleFromCenter(F1, crossing));
        if (a > 1e-9 && a < sweep) sweep = a;
      }
    }
    if (sweep === Infinity)
      return {
        message: "Front: F1 never meets the spiral. Enlarge F1, or aim the straight in under the volute with F0's end.",
        unsolved: ['F1'], circles: [F1], segments: [],
      };
    s.F1 = new Arc(F1.x, F1.y, F1.r, F1end - sweep, F1end);
    return null;
  });
  return s;
}
