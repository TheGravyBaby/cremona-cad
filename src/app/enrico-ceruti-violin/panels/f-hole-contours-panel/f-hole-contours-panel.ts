import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FholeCut, FholeEnd, FholeParams, FholeStem, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderLine, renderPath, renderPointHalo, renderSmallCrosshair } from '../../../helpers/renderFuncs';
import { ensureOuterTracePaths, calculateOuterArcs, getPath, getPathOrNull } from '../../ceruti-calcs';
import { adjustArcEnd, getArcEndDeg, getArcStartDeg, setArcEndDeg, setArcStartDeg } from '../../../helpers/arcDegrees';
import { fholeArmCompoundInfo, fholeCutInfo } from '../../ceruti-helpers';
import { renderFholeAnchors, renderFholePlacementGuides, seedFHolePlacement } from '../f-hole-placement-panel/f-hole-placement-panel';
import { angleFromCenter, arcBetweenTravels, arcContinuingFrom, arcTangentToLine, normalizeRadians, pointOnCircle, signedArcSweep, solveCircumscribedCircleAlongAxis } from '../../../helpers/draftMath';
import { travelAtArcEnd, travelAtArcStart } from '../../../helpers/draftMath';
import { Circle, Pt, Arc } from '../../../models/types';
import { HighlightedArc, HighlightedPoint } from '../../renders/render-constants';

/** Which field currently has focus, for the halo — `<end>.<part>`, the same path the template
 * binds through, so a field and its highlight can never name different things. `tip` takes a
 * point halo; the rest take an arc halo. */
export type FholeArcPart = 'shoulder' | 'arm' | 'arm2' | 'wing';
export type FholeHighlightKey = `${'upper' | 'lower'}.${FholeArcPart | 'cut'}`;

/** The arc chain itself — one edge of the hole, from the upper eye down past the stem to the tip.
 * Where the eyes and stem sit is the placement panel's job; this page only bends what runs between. */
@Component({
  selector: 'app-ceruti-f-hole-contours-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-contours-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHoleContoursPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides', 'showModuleArcs'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly adjustArcEnd = adjustArcEnd;
  protected readonly getArcStartDeg = getArcStartDeg;
  protected readonly setArcStartDeg = setArcStartDeg;
  protected readonly getArcEndDeg = getArcEndDeg;
  protected readonly setArcEndDeg = setArcEndDeg;
  protected readonly fholeArmCompoundInfo = fholeArmCompoundInfo;
  protected readonly fholeCutInfo = fholeCutInfo;

  // Held as a key rather than the Arc itself: calculateFholeContours rebuilds every arc on each
  // pass, so an object captured on focus is stale by the time it would be drawn.
  private highlightedKey: FholeHighlightKey | null = null;

  onArcFocus(key: FholeHighlightKey): void {
    this.highlightedKey = key;
    this.emitImmediate(false);
  }

  onArcBlur(): void {
    this.highlightedKey = null;
    this.emitImmediate(false);
  }

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  /** Split the arm in two, or fold it back into one. The pair shares out the turn the single arc
   * had — in the proportion the defaults use — so the contour barely moves across the switch, and
   * the solved fourth arc still finds the stem it was heading for. */
  onCompoundChange(end: 'upper' | 'lower'): void {
    const E = this.params.fHoles![end];

    if (E.shoulder && E.arm) {
      const turn = (E.arm.end - E.arm.start) + (E.arm2 ? E.arm2.end - E.arm2.start : 0);
      const on = end === 'upper' ? this.params.options.upperArmDoubleArc : this.params.options.lowerArmDoubleArc;
      const share = on ? SPLIT.share : 1;

      // only radius and sweep are read back — where the new arc sits is solved from the one before
      E.arm.end = E.arm.start + turn * share;
      E.arm2 = on ? new Arc(E.arm.x, E.arm.y, E.arm.r * SPLIT.step, 0, turn * (1 - share)) : null;
    }

    this.emitImmediate();
  }

  /** The cut's two angles are stored in radians like the rest of the geometry, and typed in
   * degrees like the rest of the fields. */
  getCutDeg(cut: FholeCut, key: 'at' | 'slope'): number {
    return Math.round(cut[key]! * 180 / Math.PI);
  }

  setCutDeg(cut: FholeCut, key: 'at' | 'slope', degrees: number): void {
    if (typeof degrees !== 'number') return;
    cut[key] = degrees * Math.PI / 180;
    this.onChange();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);
    p.fHoles = seedFHolePlacement(p);

    const renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'top'), this.colors.outerTrace),
    ];

    const purflingPath = getPathOrNull(this.paths, 'purfling');
    const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');

    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));

    calculateFholeContours(p);

    // a tip is a point rather than an arc, both take their colour from the end they're drawn at
    const key = this.highlightedKey;
    const [end, part] = key ? key.split('.') as ['upper' | 'lower', FholeArcPart | 'cut'] : [null, null];
    const color = key ? fholeZoneColor(key, this.colors) : '';
    // the cut has no arc of its own, so it shows the tip its three numbers place
    const tip = part === 'cut' ? { point: p.fHoles![end!].tip!, color } : null;
    const arc = end && part !== 'cut' ? p.fHoles![end][part!] : null;

    if (this.flags.showModuleGuides) renders.push(renderFholePlacementGuides(p, this.colors));
    // the stem's centre is a placement handle; nothing on this page moves it
    renders.push(renderFholeAnchors(p, this.colors, false));
    renders.push(renderFholeContours(p, this.colors, this.flags.showModuleArcs, arc ? { arc, color } : null, tip));

    return renders;
  }
}


/**
 * One edge of the hole, in the order it is drawn — but split across the two ends it passes
 * through, since that is how the parameters are stored. `near` is the end it springs from, `far`
 * the one it reaches; the stem arcs in between belong to whichever side of the stem it runs down.
 */
type FholeEdge = {
  shoulder: Arc; arm: Arc; arm2: Arc | null;
  landing: Arc | null; flare: Arc | null; wing: Arc;
};

/** Everything a default hole is drawn from, read off a traced Amati and rounded. Radii run against
 * whatever came before them — the shoulder against its own eye, the arm against that shoulder —
 * and the wing takes the arm's radius, since on a traced hole the two read as one bend. The lower
 * end runs wider than the upper, which is the only place the two ends differ.
 *
 * Rounded on purpose: for the eyes the placement panel seeds, every field a hole opens with lands
 * on a whole millimetre or a whole degree. A first look at the panel should read as a drawing
 * somebody laid out, not as the output of a solver. */
const SHOULDER_R = 2.5;
const ARM_R = { upper: 1.125, lower: 1.2 };

/** The turn each segment takes: the arm's sweep, and the span of both wings. */
const TURN = 60;

/** The compound arm, when the user asks for it: the share of the turn the first arc keeps — 40°
 * and 20°, both still whole — and how much wider the second one runs. */
const SPLIT = { share: 2 / 3, step: 1.5 };

/** Where each wing's boundary angles sit, in plate degrees. The two reach past different eyes, so
 * neither is the other's mirror. */
const WING = { upper: [20, 80], lower: [-155, -95] };

/** The cut a hole starts out with: a third of a turn round the eye from the axis, running one eye
 * radius out to the tip. `slope` is the upper end's; the lower end's cut is the same line walked
 * the other way, so it takes the half turn. */
const CUT = { at: 120, slope: 60, length: 1 };

/**
 * Where the cut meets the eye, and the direction it runs out to the tip. `at` turns round the eye
 * from the ray toward the other eye, which is what keeps the foot in place as the eyes move;
 * `slope` is read straight off the plate, so sliding the foot around does not swing the cut.
 */
const cutRay = (eye: Circle, toward: Pt, cut: FholeCut): { foot: Pt; travel: number } => {
  const at = Math.atan2(toward.y - eye.y, toward.x - eye.x) + cut.at!;
  return { foot: pointOnCircle(eye, at), travel: cut.slope! };
}

/** The cut's far end — where the wing has to come to a point. */
const cutTip = (eye: Circle, toward: Pt, cut: FholeCut): Pt => {
  const { foot, travel } = cutRay(eye, toward, cut);
  return new Pt(foot.x + cut.length! * Math.cos(travel), foot.y + cut.length! * Math.sin(travel));
}

// the ratios above are the plain arc's, so splitting it has to shrink the first of the pair: the
// two average back out to the single arc's radius over the same total turn, and a hole drawn
// either way starts from the same shape.
const ARM_SPLIT_R = 1 / (SPLIT.share + SPLIT.step * (1 - SPLIT.share));

/**
 * One edge of the hole: an arm springing off `near`'s eye, over the bound its rise sets, down onto
 * a stem edge, then a wing flaring past the stem to `far`'s tip. `side` is +1 for the edge whose
 * bound sits above its eye — the one from the upper eye — and -1 for the one turned half a turn
 * against it, which is the only difference between them.
 */
const solveFholeEdge = (
  stem: FholeStem, near: FholeEnd, far: FholeEnd, side: 1 | -1, compound: boolean,
): FholeEdge => {
  const eye = near.eye!, H = near.rise!;
  const bound = eye.y + side * (eye.r + H);

  // which end of the hole this edge springs from, and which it reaches — the defaults differ
  const nearEnd = side > 0 ? 'upper' : 'lower';
  const farEnd = side > 0 ? 'lower' : 'upper';

  // the shoulder is tangent to the eye and tangent to the bound, so its radius alone places it.
  // Below r = eye.r + H/2 the apex can't reach the bound and the solve has no root.
  const r = Math.max(near.shoulder?.r ?? eye.r * SHOULDER_R, eye.r + H / 2);
  const y = bound - side * r;
  const x = solveCircumscribedCircleAlongAxis(eye, r, 'y', y, side > 0);

  const shoulder = new Arc(x, y, r, 0, side * Math.PI / 2); // end at the apex, on the bound
  shoulder.start = angleFromCenter(shoulder, eye); // tangent point, on the line of centers

  // the arm arcs each pick up the tangent the arc before them ended on, so radius and sweep are
  // the only knobs — where they sit falls out. Sweeps carry the sign of the shoulder's own turn.
  const turn = Math.sign(signedArcSweep(shoulder));
  const sweepOf = (a: Arc | null | undefined, fallbackDeg: number) =>
    a ? a.end - a.start : turn * fallbackDeg * Math.PI / 180;

  // the shoulder leaves its apex square to the bound and the stem lies all but square to that, so
  // a 60° arm always has turn to spare for the landing that follows it.
  const armR = r * ARM_R[nearEnd];

  const arm = arcContinuingFrom(
    pointOnCircle(shoulder, shoulder.end), travelAtArcEnd(shoulder),
    near.arm?.r ?? armR * (compound ? ARM_SPLIT_R : 1),
    sweepOf(near.arm, compound ? TURN * SPLIT.share : TURN));

  // most arms take the same bend the whole way down, so the second half only exists when the user
  // asks for the split; without it the first runs on to the stem itself.
  const arm2 = compound ? arcContinuingFrom(
    pointOnCircle(arm, arm.end), travelAtArcEnd(arm),
    near.arm2?.r ?? armR * ARM_SPLIT_R * SPLIT.step,
    sweepOf(near.arm2, TURN * (1 - SPLIT.share))) : null;

  const armEnd = arm2 ?? arm;

  // the landing has no radius of its own: settling tangent on the stem edge uses up the last
  // freedom. Each edge crosses the near stem line and settles on the far one, so the slot ends up
  // between the two contours rather than off to one side of both.
  const approach = Math.sign(Math.cos(travelAtArcEnd(shoulder)));
  const stemEdge = new Pt(stem.center!.x + approach * stem.width! / 2, stem.center!.y);

  const landing = arcTangentToLine(
    pointOnCircle(armEnd, armEnd.end), travelAtArcEnd(armEnd),
    // each edge runs the stem toward the other eye, so it travels the stem line backwards
    stemEdge, new Pt(-side * Math.cos(stem.angle!), -side * Math.sin(stem.angle!)));

  // the wing is placed outright rather than solved: its radius and its own two boundary angles are
  // its shape, and hanging it off the tip fixes where it sits. Only one arc to picture. It takes
  // the radius the arm at *its* end runs at, which is the end it is drawn beside rather than the
  // one this edge sprang from.
  const span = WING[farEnd];
  const wing = new Arc(0, 0, far.wing?.r ?? far.eye!.r * SHOULDER_R * ARM_R[farEnd],
    far.wing?.start ?? span[0] * Math.PI / 180,
    far.wing?.end ?? span[1] * Math.PI / 180);
  wing.x = far.tip!.x - wing.r * Math.cos(wing.end);
  wing.y = far.tip!.y - wing.r * Math.sin(wing.end);

  // past the stem the contour runs straight for a while, then flares back out onto the wing — the
  // curvature reverses across the stem, and the flare's radius is simply whatever gets there.
  // The wing stands whether or not that flare is reachable: it is the user's three numbers, not a
  // result, and dropping it would take the wing's own fields down with the run that missed it.
  const solvedFlare = landing && arcBetweenTravels(
    pointOnCircle(landing, landing.end), travelAtArcEnd(landing),
    pointOnCircle(wing, wing.start), travelAtArcStart(wing));

  return { shoulder, arm, arm2, landing, flare: solvedFlare ? solvedFlare.arc : null, wing };
}


export const calculateFholeContours = (p: EnricoCerutiParams) => {
  const f = p.fHoles!;

  // the tip is no longer a place on the plate but the far end of the cut, so it is solved afresh
  // each pass from the three numbers describing that cut against its own eye
  for (const [end, other, half] of [[f.upper, f.lower, 0], [f.lower, f.upper, 1]] as const) {
    end.cut ??= {
      at: CUT.at * Math.PI / 180,
      slope: normalizeRadians((CUT.slope + half * 180) * Math.PI / 180 + Math.PI) - Math.PI,
      length: end.eye!.r * CUT.length,
    };
    end.tip = cutTip(end.eye!, other.eye!, end.cut);
  }

  // Each edge lands on one side of the stem and stays there, which is what makes inner/outer a
  // name for the whole passage: the edge from the upper eye runs the outer side down to the lower
  // tip, the edge from the lower eye runs the inner side up to the upper tip.
  const outer = solveFholeEdge(f.stem, f.upper, f.lower, 1, !!p.options.upperArmDoubleArc);
  const inner = solveFholeEdge(f.stem, f.lower, f.upper, -1, !!p.options.lowerArmDoubleArc);

  // both read the stored arcs as seeds, so nothing is written back until both have been solved
  Object.assign(f.upper, { shoulder: outer.shoulder, arm: outer.arm, arm2: outer.arm2, wing: inner.wing });
  Object.assign(f.lower, { shoulder: inner.shoulder, arm: inner.arm, arm2: inner.arm2, wing: outer.wing });
  Object.assign(f.stem, {
    outerUpper: outer.landing, outerLower: outer.flare,
    innerLower: inner.landing, innerUpper: inner.flare,
  });
}

/** The two edges as they are drawn, reassembled from where their pieces are stored, each with the
 * colour of the end its arm springs from and the "off" colour of the end its wing reaches. */
const drawnEdges = (f: FholeParams, colors: CerutiColors): [FholeEdge, string, string][] => [
  [{ shoulder: f.upper.shoulder!, arm: f.upper.arm!, arm2: f.upper.arm2,
     landing: f.stem.outerUpper, flare: f.stem.outerLower, wing: f.lower.wing! },
   colors.fHoleUpper, colors.fHoleLowerOff],
  [{ shoulder: f.lower.shoulder!, arm: f.lower.arm!, arm2: f.lower.arm2,
     landing: f.stem.innerLower, flare: f.stem.innerUpper, wing: f.upper.wing! },
   colors.fHoleLower, colors.fHoleUpperOff],
];

/** Which colour a field belongs to: its own end's, the greyed variant for a wing, which is the far
 * edge's but is drawn at this end, and the cut's own colour for the cut. */
export const fholeZoneColor = (key: FholeHighlightKey, colors: CerutiColors): string => {
  const [end, part] = key.split('.');
  if (part === 'cut') return end === 'upper' ? colors.fHoleCutUpper : colors.fHoleCutLower;
  return end === 'upper'
    ? (part === 'wing' ? colors.fHoleUpperOff : colors.fHoleUpper)
    : (part === 'wing' ? colors.fHoleLowerOff : colors.fHoleLower);
}

export const renderFholeContours = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  showArcs: boolean,
  highlighted: HighlightedArc | null,
  highlightedPoint: HighlightedPoint | null,
) => (g: any, ui: any) => {
  const f = p.fHoles!;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color)(g, ui);
  if (highlightedPoint) renderPointHalo(highlightedPoint.point, highlightedPoint.color)(g, ui);

  const drawArc = (a: Arc, color: string) => showArcs
    ? renderArcFromArcFancy(a, color)
    : renderArcFromArc(a, color, 2);

  for (const [e, armColor, wingColor] of drawnEdges(f, colors)) {
    // the two stem arcs are solved off the stem line, so they read as stem rather than as either
    // end — what the user can actually shape is the arm on the way in and the wing on the way out
    // the two arcs onto and off the stem are drawn greyed against the straight run between them,
    // so where the contour actually joins the stem reads without a marker on it
    const inOrder: [Arc | null, string][] = [
      [e.shoulder, armColor], [e.arm, armColor], [e.arm2, armColor],
      [e.landing, colors.fHoleStemOff], [e.flare, colors.fHoleStemOff], [e.wing, wingColor],
    ];

    for (const [a, color] of inOrder) if (a) drawArc(a, color)(g, ui);

    // the run along a stem edge is the only straight part of either contour, so it gets its own
    if (e.landing && e.flare) {
      renderLine(pointOnCircle(e.landing, e.landing.end), pointOnCircle(e.flare, e.flare.start), colors.fHoleStem, 2)(g, ui);
    }
  }

  // the cut closes each end of the outline: out of the eye to the tip, where the wing meets it.
  // Drawn with the wing, since it is the wing's own back edge rather than anything of the eye's.
  for (const [end, other, color] of [
    [f.upper, f.lower, colors.fHoleCutUpper],
    [f.lower, f.upper, colors.fHoleCutLower],
  ] as const) {
    renderLine(cutRay(end.eye!, other.eye!, end.cut!).foot, end.tip!, color, 2)(g, ui);
    renderSmallCrosshair(end.tip!, color)(g, ui);
  }
}
