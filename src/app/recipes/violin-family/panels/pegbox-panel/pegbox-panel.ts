import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  angleFromCenter, angleWithinSweep, dist, moveInVectorSpace, normalizeRadians, placeCircleOnPointAtAngle, pointOnCircle, TURN,
  vectorFromSlope,
} from '../../../../helpers/math/simpleGeometry';
import { circleCircleIntersections } from '../../../../helpers/math/draftMath';
import { arcPathData, combinePathStrings, pathFromLine } from '../../../../helpers/math/pathMath';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderPath, renderSegment, renderSegmentHalo, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { Arc, Pt } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import {
  RenderLayer,
  ViolinFamilyPanel,
  ViolinFamilyParams,
  ViolinFamilyToggleKey,
  ViolinFamilyViewFlags,
} from '../../violin-family-types';
import {
  ScrollFailure,
  ScrollKey,
  ScrollSolve,
} from '../../violin-family-solves';
import { buildBadArcMiss, isLongArc, renderScrollNeck, renderVolute, calcScrollExtent, solveVolute } from '../volute-panel/volute-panel';
import { calcNeckTaper } from '../neck-panel/neck-panel';

export type PegboxHighlightKey = 'S3' | 'nape' | 'napeAngle' | 'F0' | 'F1' | 'backStraight' | 'flat' | 'frontStraight' | 'upperThickness';
export type ScrollLine = 'napeLine' | 'backStraight' | 'flat' | 'frontStraight';

@Component({
  selector: 'app-vf-pegbox-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './pegbox-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class PegboxPanel implements ViolinFamilyPanel, OnInit {
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
  highlighted: { key: PegboxHighlightKey; color: string } | null = null;

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures(this.s.failures, 'Pegbox');
  }

  focus(key: PegboxHighlightKey, color: string): void {
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
      this.extent = s.S3 ? calcScrollExtent(s) : null;
      let key = this.highlighted?.key;
      let color = this.highlighted?.color ?? '';
      let line = (key === 'backStraight' || key === 'flat' || key === 'frontStraight') && !isUnsolved(s, key) ? calcScrollLines(p, s)[key]
        : key === 'napeAngle' && s.nape ? calcScrollLines(p, s).napeLine
        : key === 'upperThickness' ? [new Pt(0, 0), new Pt(-p.neck!.upperThickness, 0)] as [Pt, Pt]
        : null;
      let arc = key === 'S3' || key === 'nape' || key === 'F0' || key === 'F1' ? s[key] : null;
      // the volute as plain profile, so only what this panel edits is in colour. The profile needs
      // the whole scroll solved, so a miss falls back to the volute's own render
      this.drawn.emit([
        renderScrollNeck(p, s, this.pal, this.flags.showModuleGuides),
        s.failures.length
          ? renderVolute(p, s, this.pal, this.flags, false, null)
          : renderPath(defineSideScrollPath(p, s), this.pal.neutral, STROKE_WEIGHT.trace),
        renderPegbox(p, s, this.pal, this.flags, true, arc ? { arc, color } : null, line ? { line, color } : null),
        renderSolveFailures(s.failures, this.pal.alert),
      ]);
    });
  }
}

const isUnsolved = (s: ScrollSolve, key: ScrollKey) => s.failures.some(f => f.unsolved.includes(key));

// a straight of no length, or a duck tail already at the nape, has nothing to draw
const renderScrollLine = ([a, b]: [Pt, Pt], color: string) => (g: any, ui: any): void => {
  if (dist(a, b) > 1e-9) renderSegment(a, b, color, STROKE_WEIGHT.trace)(g, ui);
};

// the back from S2's end down to the nape, and the front up from the nut. The back's straight takes
// S2's colour, the others their arc's, the nape's line the nape's
export const renderPegbox = (
  p: ViolinFamilyParams,
  s: ScrollSolve,
  pal: PanelPalette,
  flags: Pick<ViolinFamilyViewFlags, 'showModuleArcs'>,
  currentModule: boolean,
  highlighted: { arc: Arc; color: string } | null,
  highlightedLine: { line: [Pt, Pt]; color: string } | null,
) => (g: any, ui: any): void => {
  let fancy = currentModule && flags.showModuleArcs;
  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, isLongArc(highlighted.arc))(g, ui);
  if (highlightedLine) renderSegmentHalo(...highlightedLine.line, highlightedLine.color)(g, ui);

  if (fancy) {
    if (s.S3) renderArcFromArcFancy(s.S3, pal.ink(1).faint(-1), isLongArc(s.S3))(g, ui);
    if (s.nape) renderArcFromArcFancy(s.nape, pal.ink(1).faint(5), isLongArc(s.nape))(g, ui);
    if (s.F0) renderArcFromArcFancy(s.F0, pal.ink(3), isLongArc(s.F0))(g, ui);
    if (s.F1) renderArcFromArcFancy(s.F1, pal.ink(3).faint(-3), isLongArc(s.F1))(g, ui);
  } else {
    if (s.S3) renderArcFromArc(s.S3, pal.ink(1).faint(-1), STROKE_WEIGHT.trace, isLongArc(s.S3))(g, ui);
    if (s.nape) renderArcFromArc(s.nape, pal.ink(1).faint(5), STROKE_WEIGHT.trace, isLongArc(s.nape))(g, ui);
    if (s.F0) renderArcFromArc(s.F0, pal.ink(3), STROKE_WEIGHT.trace, isLongArc(s.F0))(g, ui);
    if (s.F1) renderArcFromArc(s.F1, pal.ink(3).faint(-3), STROKE_WEIGHT.trace, isLongArc(s.F1))(g, ui);
  }

  let lines = calcScrollLines(p, s);
  if (s.S2 && !isUnsolved(s, 'backStraight')) renderScrollLine(lines.backStraight, pal.ink(1).faint(-3))(g, ui);
  if (s.nape) renderScrollLine(lines.napeLine, pal.ink(1).faint(5))(g, ui);
  if (!isUnsolved(s, 'flat')) renderScrollLine(lines.flat, pal.ink(3).faint(-3))(g, ui);
  if (s.F0 && !isUnsolved(s, 'frontStraight')) renderScrollLine(lines.frontStraight, pal.ink(3))(g, ui);
};

// the lines aren't solved as parts: each runs between solved arcs, so it is read off here. A line
// whose arc hasn't solved is a point where that arc would start
export function calcScrollLines(p: ViolinFamilyParams, s: ScrollSolve): Record<ScrollLine, [Pt, Pt]> {
  let v = p.scroll!;
  let nutTop = new Pt(0, p.neck!.nutHeight);
  let backTop = s.S2 ? pointOnCircle(s.S2, s.S2.end) : nutTop;
  let frontTop = s.F0 ? pointOnCircle(s.F0, s.F0.end) : nutTop;
  let S2End = s.S2?.end ?? 0;
  let F0End = s.F0?.end ?? 0;
  return {
    napeLine: s.S3 && s.nape ? [pointOnCircle(s.S3, s.S3.start), pointOnCircle(s.nape, s.nape.end)] : [nutTop, nutTop],
    backStraight: [backTop, moveInVectorSpace(backTop, [{ ...vectorFromSlope(S2End + TURN.quarter), mag: v.backStraight }])],
    flat: [nutTop, new Pt(nutTop.x, nutTop.y + v.flat)],
    frontStraight: [frontTop, moveInVectorSpace(frontTop, [{ ...vectorFromSlope(F0End + TURN.quarter), mag: v.frontStraight }])],
  };
}

// the scroll's side profile off a scroll solved whole: the back from the eye's back under the eye and
// out round the spiral and down to where the nape meets the neck's back, then the front up from the
// nut. S3, the nape and F1 are solved counterclockwise but turn clockwise along the edge, so they're
// drawn end to start to keep every piece running on from the last
export function defineSideScrollPath(p: ViolinFamilyParams, s: ScrollSolve): string {
  let v = p.scroll!;
  let [S0, S1, S2, S3, nape, F0, F1] = [s.S0!, s.S1!, s.S2!, s.S3!, s.nape!, s.F0!, s.F1!];
  let flatTop = pointOnCircle(F0, F0.start);
  let back = [
    arcPathData(s.eye!, s.eye!.r, -TURN.half, 0),
    ...[...s.spiral!].reverse().map(a => arcPathData(a, a.r, a.start, a.end)),
    arcPathData(S0, S0.r, S0.start, S0.end), arcPathData(S1, S1.r, S1.start, S1.end), arcPathData(S2, S2.r, S2.start, S2.end),
    pathFromLine(pointOnCircle(S2, S2.end), pointOnCircle(S3, S3.end)),
    arcPathData(S3, S3.r, S3.end, S3.start, true),
    pathFromLine(pointOnCircle(S3, S3.start), pointOnCircle(nape, nape.end)),
    arcPathData(nape, nape.r, nape.end, nape.start, true),
  ];
  let front = [
    pathFromLine(new Pt(flatTop.x, flatTop.y - v.flat), flatTop),
    arcPathData(F0, F0.r, F0.start, F0.end),
    pathFromLine(pointOnCircle(F0, F0.end), pointOnCircle(F1, F1.end)),
    arcPathData(F1, F1.r, F1.end, F1.start, true),
  ];
  return combinePathStrings([...back, ...front]);
}

// a cleared field is null, which passes `>= 0`, so it is asked for first
function buildBadLengthMiss(section: string, key: ScrollKey, unsolved: ScrollKey[]): ScrollFailure {
  return { message: `${section}: ${key} needs a length, or 0.`, unsolved, circles: [], segments: [] };
}

function calcSweepBackTo(a: number, end: number): number {
  return normalizeRadians(end - a) || TURN.full;
}

// the scroll's side solved whole, the volute's solve run on: the back from S2's end down to the nape, the
// front up from the nut. A run stops at the first bad part, everything after it unsolved. A later
// panel reads the scroll by calling this; it returns and never writes to the params
export function solveScroll(p: ViolinFamilyParams): ScrollSolve | null {
  let s = solveVolute(p);
  if (!s || !s.spiral) return s;
  let v = p.scroll!;
  // the neck's back leans off the fingerboard plane with the taper, thinning on up past the nut
  let taper = calcNeckTaper(p);
  let lean = Math.atan(taper);
  let nutTop = new Pt(0, p.neck!.nutHeight);

  if (s.S2) solveSection(s.failures, 'Back', ['S3', 'nape', 'backStraight'], () => {
    let S2 = s.S2!;
    if (!Number.isFinite(v.backStraight) || v.backStraight < 0) return buildBadLengthMiss('Back', 'backStraight', ['S3', 'nape', 'backStraight']);
    let foot = moveInVectorSpace(pointOnCircle(S2, S2.end), [{ ...vectorFromSlope(S2.end + TURN.quarter), mag: v.backStraight }]);

    // S3 turns back clockwise, so as a counterclockwise sweep it runs from the duck tail to the foot
    let S3end = S2.end - TURN.half;
    if (!(v.S3R > 0)) return buildBadArcMiss('Back', 'S3', v.S3R, ['S3', 'nape']);
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
    s.S3 = new Arc(S3.x, S3.y, S3.r, S3end - Math.min(calcSweepBackTo(below, S3end), calcSweepBackTo(TURN.half - below, S3end)), S3end);

    let duckTail = pointOnCircle(s.S3, s.S3.start);
    if (!(v.napeR > 0)) return buildBadArcMiss('Back', 'nape', v.napeR, ['nape']);

    if (!Number.isFinite(v.napeAngle))
      return { message: 'Back: the nape needs an angle, or 0.', unsolved: ['nape'], circles: [], segments: [] };

    // a line leaves the duck tail at the nape angle off square, rising toward the neck's back,
    // and the nape fillets the corner it makes there. Its centre is a radius below the line and a
    // radius off the back, which puts it on x = taper * y + offset
    let tilt = v.napeAngle * TURN.degree;
    let dir = new Pt(Math.cos(tilt), Math.sin(tilt));
    let inset = new Pt(duckTail.x + Math.sin(tilt) * v.napeR, duckTail.y - Math.cos(tilt) * v.napeR);
    let offset = -p.neck!.upperThickness - v.napeR * Math.hypot(1, taper);
    let closing = dir.x - taper * dir.y;
    if (!(closing > 1e-9))
      return { message: `Back: a nape angle of ${v.napeAngle}° never reaches the neck's back. Bring it nearer square.`, unsolved: ['nape'], circles: [], segments: [] };
    let run = (taper * inset.y + offset - inset.x) / closing;
    let center = new Pt(inset.x + dir.x * run, inset.y + dir.y * run);
    if (run < 0)
      return {
        message: `Back: the duck tail sits too far forward for a nape of ${v.napeR}mm to fit before the neck's back. Shrink the nape, move the duck tail back with S3 or the straight, or ease the nape angle.`,
        unsolved: ['nape'],
        circles: [{ x: center.x, y: center.y, r: v.napeR }],
        segments: [[duckTail, new Pt(duckTail.x + dir.x * run, duckTail.y + dir.y * run)]],
      };
    s.nape = new Arc(center.x, center.y, v.napeR, -lean, TURN.quarter + tilt);
    return null;
  });

  solveSection(s.failures, 'Front', ['F0', 'F1', 'flat', 'frontStraight'], () => {
    if (!Number.isFinite(v.flat) || v.flat < 0) return buildBadLengthMiss('Front', 'flat', ['F0', 'F1', 'flat', 'frontStraight']);
    let top = new Pt(nutTop.x, nutTop.y + v.flat);

    let F0End = v.F0Sweep * TURN.degree;
    if (!(v.F0R > 0) || !(F0End > 0) || F0End > TURN.full) return buildBadArcMiss('Front', 'F0', v.F0R, ['F0', 'F1', 'frontStraight']);
    let F0 = placeCircleOnPointAtAngle(v.F0R, top, 0);
    s.F0 = new Arc(F0.x, F0.y, F0.r, 0, F0End);

    if (!Number.isFinite(v.frontStraight) || v.frontStraight < 0) return buildBadLengthMiss('Front', 'frontStraight', ['F1', 'frontStraight']);
    let foot = moveInVectorSpace(pointOnCircle(s.F0, s.F0.end), [{ ...vectorFromSlope(s.F0.end + TURN.quarter), mag: v.frontStraight }]);

    // F1 curves back clockwise until it first crosses a drawn arc of the spiral
    if (!(v.F1R > 0)) return buildBadArcMiss('Front', 'F1', v.F1R, ['F1']);
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
