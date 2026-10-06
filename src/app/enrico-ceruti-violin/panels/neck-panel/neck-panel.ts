import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FlutingParams, NeckParams, PathEntry, RenderToggleKey, StringSetup } from '../../ceruti-types';
import { defaultArchingParams } from '../../calculation/arching/ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../calculation/arching/ceruti-arch-geometry';
import { calculateOuterArcs, ensureFholePath, ensureNeckPath, ensureOuterTracePaths, topPlatePaths } from '../../calculation/outline/ceruti-calcs';
import { bridgeWedge, buttonTip, calculateNeck, defaultNeckParams, defaultStringSetup, fingerboardCrown, mortiseFingerboardIntersect, heelFace, heelStands, plateEdgeAtNeck, stringLength } from '../../calculation/neck/ceruti-neck';
import { defineFrontProfilePath, definePlacedSideScrollPath, fingerboardEnd, mortiseFloorY, scrollOnNeck } from '../../calculation/outline/ceruti-paths';
import { solveScrollForProfile } from '../../calculation/neck/ceruti-scroll';
import { renderScrollStroke, scrollFrontInPlan } from '../../renders/scroll.render';
import { renderBodySection, renderSideView } from '../../renders/body-section.render';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { applyMatrix, pathFromArc } from '../../../helpers/math/pathMath';
import { dist, moveInVectorSpace, pointAtDistanceToward, pointOnCircle, vectorFromSlope } from '../../../helpers/math/simpleGeometry';
import { renderSegment, renderSegmentHalo, renderArcHalo, renderPolygon, renderPath, renderSolveFailures } from '../../../helpers/renderFuncs';
import { Pt, Vect2D } from '../../../models/types';
import { renderGuideMeasure, renderGuideBaseline } from '../../renders/module-guide.render';
import { STROKE_WEIGHT } from '../../renders/render-constants';

export type NeckHighlightKey =
  | 'length' | 'thickness' | 'topWidth' | 'rootWidth' | 'heel' | 'buttonHeight' | 'mortise' | 'overstand' | 'angle'
  | 'bodyStop' | 'bridgeHeight' | 'nutThickness' | 'fbLength' | 'fbThickness' | 'fbRadius';

/** The neck set, drawn over the body section: bridge, root, neck and fingerboard, bottom up. */
@Component({
  selector: 'app-ceruti-neck-panel',
  imports: [FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './neck-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class NeckPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides', 'showFingerboard', 'showFretMarks'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  private highlightedKey: NeckHighlightKey | null = null;
  private highlightedColor = '';

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onFieldFocus(key: NeckHighlightKey, color: string): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.emitImmediate(false);
  }

  onFieldBlur(): void {
    this.highlightedKey = null;
    this.highlightedColor = '';
    this.emitImmediate(false);
  }

  get neck(): NeckParams { return this.params.neck!; }
  get stringSetup(): StringSetup { return this.params.stringSetup!; }

  get stringLength(): number | null {
    return this.stringSetup.nutTop && this.stringSetup.bridgeTop ? stringLength(this.params) : null;
  }

  get angleDeg(): number {
    return Math.round(this.neck.angle * 1800 / Math.PI) / 10;
  }

  setAngleDeg(deg: number): void {
    if (typeof deg !== 'number' || !Number.isFinite(deg)) return;
    this.neck.angle = deg * Math.PI / 180;
    this.onChange();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.arching ??= defaultArchingParams(p.height);
    calculateOuterArcs(p);
    p.neck ??= defaultNeckParams(p);
    p.stringSetup ??= defaultStringSetup(p);

    const gouge: Record<'top' | 'bottom', FlutingParams> = {
      top: (p.arching.top.fluting ??= defaultFlutingParams(p)),
      bottom: (p.arching.bottom.fluting ??= defaultFlutingParams(p)),
    };
    const solved: Record<'top' | 'bottom', LongArchSolve | null> = {
      top: solveLongArch(p, p.arching.top.arch, gouge.top),
      bottom: solveLongArch(p, p.arching.bottom.arch, gouge.bottom),
    };
    const failures = calculateNeck(p, solved.top, gouge.top);
    // the scroll once its panels have started it, set on the neck's end
    const scroll = solveScrollForProfile(p);
    ensureNeckPath(p, this.paths);
    ensureOuterTracePaths(p, this.paths);
    if (p.fHoles) ensureFholePath(p, this.paths);

    return [
      renderSideView(p, [
        renderBodySection(p, this.colors, { solved, gouge, color: this.colors.outerTrace }),
        renderNeck(p, this.colors, { guides: this.flags.showModuleGuides, fingerboard: this.flags.showFingerboard, fretMarks: this.flags.showFretMarks, scroll }),
        renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'side'),
        renderSolveFailures(failures, this.colors.pathError),
      ]),
      renderFrontView(p, this.paths, this.colors, this.flags.showFingerboard, scroll),
      renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'front'),
    ];
  }

}

export interface NeckRenderOptions {
  guides?: boolean;
  fingerboard?: boolean;
  fretMarks?: boolean;
  strings?: boolean;
  bridge?: boolean;
  // the scroll's side profile set on the neck's end; only for a scroll calculateScroll solved whole
  scroll?: boolean;
  // the whole neck in this one colour, for a panel where it's the ground rather than the subject
  ground?: string;
}

export function renderNeck(p: EnricoCerutiParams, colors: CerutiColors, opts: NeckRenderOptions = {}) {
  const { guides = false, fingerboard = true, fretMarks = false, strings = true, bridge = true, scroll = false, ground } = opts;
  const paint = (c: string) => ground ?? c;
  const nk = p.neck!;
  const ss = p.stringSetup!;
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const normal = vectorFromSlope(nk.angle);
  const tip = buttonTip(p);
  const mortFboard = mortiseFingerboardIntersect(p);
  const nutTop = ss.nutTop!;
  const fbEnd = fingerboardEnd(p);
  // with the scroll on, the pegbox carries on past the nut, and the back runs up to where the nape
  // meets it, as the scroll panels draw it
  const backTop = scroll ? applyMatrix(scrollOnNeck(p), new Pt(-nk.thickness, p.scroll!.nape.y)) : nk.backNut!;

  return (g: any, ui: any): void => {
    const seg = (a: Pt, b: Pt, color = paint(colors.neck)) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);

    // the button: the back plate carried on past its edge, the heel's foot on top of it
    const backThickness = p.arching!.bottom.thickness;
    renderPolygon([new Pt(0, p.height), new Pt(0, tip.y), new Pt(-backThickness, tip.y), new Pt(-backThickness, p.height)], paint(colors.archBack), STROKE_WEIGHT.section)(g, ui);

    // the foot from where it comes out of the plate at the mortise floor, then the neck's face on up to
    // the root; the rest of the foot is hidden in the block
    if (nk.plateAtMortise) seg(nk.plateAtMortise, mortFboard, paint(colors.neckRoot));
    seg(mortFboard, nk.root!, paint(colors.neck));

    if (bridge) renderPolygon(bridgeWedge(p), paint(colors.bridge), STROKE_WEIGHT.section)(g, ui);

    // the neck's own boundary where the fingerboard glues on
    seg(nk.root!, nk.neckTop!);

    if (fingerboard) {
      // the crown's rise follows the board's width, which grows linearly, so its line curves slightly
      const crown: Pt[] = [];
      for (let i = 0; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
        const at = pointAtDistanceToward(nk.neckTop!, fbEnd, i * dist(nk.neckTop!, fbEnd) / FINGERBOARD_CROWN_SAMPLES);
        crown.push(moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness + fingerboardCrown(p, at.y) }]));
      }
      // the board's edges solid, the crown above them faded so the two read apart
      const edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
      renderPolygon([nk.neckTop!, edgeAt(nk.neckTop!), edgeAt(fbEnd), fbEnd], paint(colors.fingerboard), STROKE_WEIGHT.section)(g, ui);
      const crownLine = [edgeAt(nk.neckTop!), ...crown, edgeAt(fbEnd)];
      renderPath('M ' + crownLine.map(c => `${c.x} ${c.y}`).join(' L '), paint(colors.fingerboard), STROKE_WEIGHT.section, FINGERBOARD_CROWN_OPACITY)(g, ui);
    }

    // the nut, on the fingerboard plane just past the board
    const nutFar = moveInVectorSpace(nk.neckTop!, [{ ...direction, mag: ss.nutHeight }]);
    const nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
    renderPolygon([nk.neckTop!, nutFar, nutFarTop, nutTop], paint(colors.nut), STROKE_WEIGHT.section)(g, ui);

    // the neck itself: the scroll or the nut-end wall, the back, and the heel down to the button
    if (scroll) renderPath(definePlacedSideScrollPath(p), paint(colors.outerTrace), STROKE_WEIGHT.section)(g, ui);
    else seg(nk.neckTop!, nk.backNut!);
    const heel = nk.heel;
    if (heelStands(p)) {
      seg(backTop, pointOnCircle(heel, heel.start));
      renderPath(pathFromArc(heel), paint(colors.neckRoot), STROKE_WEIGHT.section)(g, ui);
      const face = heelFace(p);
      if (face) seg(face[0], face[1], paint(colors.neckRoot));
    } else {
      seg(backTop, nk.backRoot!);
    }

    if (strings) {
      seg(nutTop, ss.bridgeTop!, paint(colors.innerTrace));
      if (fretMarks) renderFretTicks(nutTop, ss.bridgeTop!, dist(nk.neckTop!, fbEnd))(g, ui);
    }

    if (!guides) return;
    const guide = colors.neckOff;
    const rootPlaneY = p.height - p.overhang;
    // offsets scale with the neck's own wood thickness rather than a fixed mm, so the parked
    // dimension lines clear the drawing the same way on a cello neck as on a violin's
    renderGuideMeasure(plateEdgeAtNeck(p), nk.root!, guide, -nk.thickness)(g, ui);
    renderGuideBaseline(new Pt(0, rootPlaneY), new Pt(mortFboard.x, rootPlaneY), guide)(g, ui);
    renderGuideMeasure(new Pt(mortFboard.x, rootPlaneY), mortFboard, guide, 2 * nk.thickness)(g, ui);
    renderGuideMeasure(mortFboard, nk.neckTop!, guide, -2 * (nk.thickness + ss.nutThickness))(g, ui);
  };
}

function renderNeckHighlight(p: EnricoCerutiParams, key: NeckHighlightKey | null, color: string, view: 'side' | 'front') {
  return (g: any, ui: any): void => {
    if (!key || (key === 'topWidth' || key === 'rootWidth') !== (view === 'front')) return;
    const nk = p.neck!;
    const ss = p.stringSetup!;
    const normal = vectorFromSlope(nk.angle);
    const mortFboard = mortiseFingerboardIntersect(p);
    const fbEnd = fingerboardEnd(p);
    const edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
    const line = (a: Pt, b: Pt) => renderSegmentHalo(a, b, color)(g, ui);

    const topY = nk.neckTop!.y;
    const rootY = mortiseFloorY(p);
    switch (key) {
      case 'length': line(mortFboard, nk.neckTop!); break;
      case 'thickness': line(nk.neckTop!, nk.backNut!); break;
      case 'topWidth': line(new Pt(-nk.topWidth / 2, topY), new Pt(nk.topWidth / 2, topY)); break;
      case 'rootWidth': line(new Pt(-nk.rootWidth / 2, rootY), new Pt(nk.rootWidth / 2, rootY)); break;
      case 'heel': if (heelStands(p)) renderArcHalo(nk.heel, color)(g, ui); break;
      case 'buttonHeight': line(new Pt(0, p.height), buttonTip(p)); break;
      case 'mortise': line(new Pt(0, p.height - p.overhang), new Pt(0, rootY)); break;
      case 'overstand': line(plateEdgeAtNeck(p), nk.root!); break;
      case 'angle': line(nk.root!, nk.neckTop!); break;
      case 'bodyStop': line(new Pt(ss.bridgeFoot!.x, p.height), ss.bridgeFoot!); break;
      case 'bridgeHeight': line(ss.bridgeFoot!, ss.bridgeTop!); break;
      case 'nutThickness': line(nk.neckTop!, ss.nutTop!); break;
      case 'fbLength': line(nk.neckTop!, fbEnd); break;
      case 'fbThickness': line(nk.neckTop!, edgeAt(nk.neckTop!)); line(fbEnd, edgeAt(fbEnd)); break;
      case 'fbRadius': {
        let prev = edgeAt(nk.neckTop!);
        for (let i = 1; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
          const at = pointAtDistanceToward(nk.neckTop!, fbEnd, i * dist(nk.neckTop!, fbEnd) / FINGERBOARD_CROWN_SAMPLES);
          const next = moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness + fingerboardCrown(p, at.y) }]);
          line(prev, next);
          prev = next;
        }
        break;
      }
    }
  };
}

// the body's plan outline as the f-hole contours panel draws it, moved over beside the side elevation
function renderFrontView(p: EnricoCerutiParams, paths: PathEntry[], colors: CerutiColors, showFingerboard: boolean, scroll: boolean) {
  const profile = defineFrontProfilePath(p, topPlatePaths(p, paths), showFingerboard);

  return (g: any, ui: any): void => {
    renderPath(profile.body.outline, colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    for (const d of [...profile.body.purfling, ...profile.body.fHoles]) renderPath(d, colors.innerTrace, STROKE_WEIGHT.guide)(g, ui);

    const [footA, footB] = bridgeWedge(p);
    const bridgeHalfDepth = dist(footA, footB) / 2;
    const bridgeY = (footA.y + footB.y) / 2;
    // the bridge spans the upper eyes' inner edges; a square stands in until the f-holes are placed
    const eye = p.fHoles?.UEye;
    const bridgeHalfWidth = eye ? Math.abs(eye.x) - eye.r : bridgeHalfDepth;
    renderPolygon([
      new Pt(-bridgeHalfWidth, bridgeY - bridgeHalfDepth), new Pt(bridgeHalfWidth, bridgeY - bridgeHalfDepth),
      new Pt(bridgeHalfWidth, bridgeY + bridgeHalfDepth), new Pt(-bridgeHalfWidth, bridgeY + bridgeHalfDepth),
    ], colors.bridge, STROKE_WEIGHT.section)(g, ui);

    renderPath(profile.neck, showFingerboard ? colors.fingerboard : colors.neckRoot, STROKE_WEIGHT.section)(g, ui);
    renderPath(profile.nut, colors.nut, STROKE_WEIGHT.section)(g, ui);
    if (scroll) for (const stroke of scrollFrontInPlan(p)) renderScrollStroke(stroke, colors.outerTrace)(g, ui);
  };
}

const FINGERBOARD_CROWN_SAMPLES = 24;
const FINGERBOARD_CROWN_OPACITY = 0.45;

/** Fret marks, scratch: how many semitones up the string to mark, and how far each tick reaches
 * either side of the string line. Bounded to the fingerboard's own length below. Plain semitones
 * stay small so they read as a scale rather than competing with the landmark intervals. */
const FRET_MARK_SEMITONES = 12;
const FRET_TICK_HALF_LENGTH_MM = 1;
const LANDMARK_TICK_HALF_LENGTH_MM = 3;
const FRET_TICK_COLOR = '#2e9e44';

/** Semitone counts of the intervals worth calling out against the plain fret color, above the
 * open string: perfect fourth, perfect fifth, octave. */
const INTERVAL_TICK_COLORS: Record<number, string> = {
  5: '#b08d1f',
  7: '#c24b2e',
  12: '#3a6ea5',
};

/** Twelve-tone equal temperament: each semitone shortens the vibrating length by a factor of the
 * 12th root of 2, so fret n sits `stringLength * (1 - 2^(-n/12))` from the nut. Returns one
 * distance per semitone, 1..semitones. */
function equalTemperamentPositions(stringLength: number, semitones: number): number[] {
  const positions: number[] = [];
  for (let n = 1; n <= semitones; n++) {
    positions.push(stringLength * (1 - 2 ** (-n / 12)));
  }
  return positions;
}

function renderFretTicks(nut: Pt, bridge: Pt, maxDistance: number) {
  const stringLength = dist(nut, bridge);
  const along: Vect2D = { a: (bridge.x - nut.x) / stringLength, b: (bridge.y - nut.y) / stringLength, mag: 1 };
  const across: Vect2D = { a: -along.b, b: along.a, mag: 1 };
  const positions = equalTemperamentPositions(stringLength, FRET_MARK_SEMITONES);

  return (g: any, ui: any): void => {
    positions.forEach((d, i) => {
      if (d > maxDistance) return;
      const semitone = i + 1;
      const landmarkColor = INTERVAL_TICK_COLORS[semitone];
      const halfLength = landmarkColor ? LANDMARK_TICK_HALF_LENGTH_MM : FRET_TICK_HALF_LENGTH_MM;
      const center = moveInVectorSpace(nut, [{ ...along, mag: d }]);
      const a = moveInVectorSpace(center, [{ ...across, mag: halfLength }]);
      const b = moveInVectorSpace(center, [{ ...across, mag: -halfLength }]);
      renderSegment(a, b, landmarkColor ?? FRET_TICK_COLOR, STROKE_WEIGHT.guide)(g, ui);
    });
  };
}