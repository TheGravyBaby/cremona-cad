import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiViewFlags, EnricoCerutiParams, FlutingParams, NeckParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { defaultArchingParams } from '../../calculation/arching/ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../calculation/arching/ceruti-arch-geometry';
import { calculateOuterArcs, ensureFholePath, ensureNeckPath, ensureOuterTracePaths, topPlatePaths } from '../../calculation/outline/ceruti-calcs';
import { bridgeWedge, buttonTip, calculateNeck, defaultNeckParams, fingerboardCrown, mortiseFingerboardIntersect, heelFace, heelStands, plateEdgeAtNeck } from '../../calculation/neck/ceruti-neck';
import { defineFrontProfilePath, definePlacedSideScrollPath, fingerboardEnd, mortiseFloorY, scrollOnNeck } from '../../calculation/outline/ceruti-paths';
import { solveScrollForProfile } from '../../calculation/neck/ceruti-scroll';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { applyMatrix, pathFromArc } from '../../../helpers/math/pathMath';
import { dist, moveInVectorSpace, pointAtDistanceToward, pointOnCircle, vectorFromSlope } from '../../../helpers/math/simpleGeometry';
import { renderSegment, renderSegmentHalo, renderArcHalo, renderPolygon, renderPath, renderSolveFailures, renderGuideMeasure, renderGuideBaseline, renderStroke } from '../../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { Pt, Vect2D } from '../../../models/types';
import { scrollFrontInPlan } from '../../calculation/neck/ceruti-scroll-views';
import { renderBodySideProfile, sideViewOffsetX } from '../../renders/body-side-profile.render';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';

export type NeckHighlightKey =
  | 'length' | 'thickness' | 'topWidth' | 'rootWidth' | 'heel' | 'buttonHeight' | 'mortise' | 'overstand' | 'angle'
  | StringSetupHighlightKey;
export type StringSetupHighlightKey = 'length' | 'bodyStop' | 'bridgeHeight' | 'nutThickness' | 'fbLength' | 'fbThickness' | 'fbRadius';

// the neck set is drawn by both its panels, each in colour only where it edits
export type NeckSetPanel = 'neck' | 'stringSetup';

/** The neck set, drawn over the body section: bridge, root, neck and fingerboard, bottom up. */
@Component({
  selector: 'app-ceruti-neck-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './neck-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class NeckPanel extends CerutiPanelBase implements OnInit {
  protected readonly pal = ThemeService.getPalette('workshop');
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides', 'showFingerboard'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
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

    const sideX = sideViewOffsetX(p);
    return [
      (g, ui) => {
        const side = {
          g: g.append('g').attr('transform', `translate(${sideX},0)`),
          ui: ui.append('g').attr('transform', `translate(${sideX},0)`),
        };
        renderBodySideProfile(p, this.pal, { solved, gouge, color: this.pal.neutral })(side.g, side.ui);
        // the bridge and strings are the string setup's alone; this panel shows the board and nut it sits under
        renderNeck(p, this.pal, { guides: this.flags.showModuleGuides, fingerboard: this.flags.showFingerboard, strings: false, bridge: false, scroll, panel: 'neck' })(side.g, side.ui);
        renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'side')(side.g, side.ui);
        renderSolveFailures(failures, this.pal.alert)(side.g, side.ui);
      },
      renderFrontView(p, this.paths, this.pal, 'neck', this.flags.showFingerboard, scroll),
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
  // the neck set panel that's open, whose parts alone keep their colour
  panel?: NeckSetPanel;
}

// each panel draws the other's parts as plain profile
function neckSetPalette(pal: PanelPalette, panel?: NeckSetPanel, ground?: string) {
  const paint = (owner: NeckSetPanel, on: string) => ground ?? (panel && panel !== owner ? pal.neutral : on);
  return {
    neck: paint('neck', pal.ink(4)),
    // the neck's length is entered on both panels
    length: ground ?? pal.ink(4),
    neckRoot: paint('neck', pal.ink(5)),
    button: paint('neck', pal.ink(2)),
    fingerboard: paint('stringSetup', pal.ink(1)),
    nut: paint('stringSetup', pal.ink(0)),
    bridge: paint('stringSetup', pal.ink(3)),
  };
}

export function renderNeck(p: EnricoCerutiParams, pal: PanelPalette, opts: NeckRenderOptions = {}) {
  const { guides = false, fingerboard = true, fretMarks = false, strings = true, bridge = true, scroll = false, ground, panel } = opts;
  const paint = (c: string) => ground ?? c;
  const part = neckSetPalette(pal, panel, ground);
  const nk = p.neck!;
  // the bridge, board, nut and strings only once the string setup panel has set them
  const ss = p.stringSetup;
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const normal = vectorFromSlope(nk.angle);
  const tip = buttonTip(p);
  const mortFboard = mortiseFingerboardIntersect(p);
  // with the scroll on, the pegbox carries on past the nut, and the back runs up to where the nape
  // meets it, as the scroll panels draw it
  const backTop = scroll ? applyMatrix(scrollOnNeck(p), new Pt(-nk.thickness, p.scroll!.nape.y)) : nk.backNut!;

  return (g: any, ui: any): void => {
    const seg = (a: Pt, b: Pt, color = part.neck) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);

    // the button: the back plate carried on past its edge, the heel's foot on top of it
    const backThickness = p.arching!.bottom.thickness;
    renderPolygon([new Pt(0, p.height), new Pt(0, tip.y), new Pt(-backThickness, tip.y), new Pt(-backThickness, p.height)], part.button, STROKE_WEIGHT.section)(g, ui);

    // the foot from where it comes out of the plate at the mortise floor, then the neck's face on up to
    // the root; the rest of the foot is hidden in the block
    if (nk.plateAtMortise) seg(nk.plateAtMortise, mortFboard, part.neckRoot);
    seg(mortFboard, nk.root!, part.length);

    if (ss && bridge) renderPolygon(bridgeWedge(p), part.bridge, STROKE_WEIGHT.section)(g, ui);

    // the neck's own boundary where the fingerboard glues on
    seg(nk.root!, nk.neckTop!, part.length);

    const fbEnd = ss ? fingerboardEnd(p) : null;
    if (ss && fbEnd && fingerboard) {
      // the crown's rise follows the board's width, which grows linearly, so its line curves slightly
      const crown: Pt[] = [];
      for (let i = 0; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
        const at = pointAtDistanceToward(nk.neckTop!, fbEnd, i * dist(nk.neckTop!, fbEnd) / FINGERBOARD_CROWN_SAMPLES);
        crown.push(moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness + fingerboardCrown(p, at.y) }]));
      }
      // the board's edges solid, the crown above them faded so the two read apart
      const edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
      renderPolygon([nk.neckTop!, edgeAt(nk.neckTop!), edgeAt(fbEnd), fbEnd], part.fingerboard, STROKE_WEIGHT.section)(g, ui);
      const crownLine = [edgeAt(nk.neckTop!), ...crown, edgeAt(fbEnd)];
      renderPath('M ' + crownLine.map(c => `${c.x} ${c.y}`).join(' L '), part.fingerboard, STROKE_WEIGHT.section, FINGERBOARD_CROWN_OPACITY)(g, ui);
    }

    // the nut, on the fingerboard plane just past the board; without it the neck runs on over its
    // seat to the pegbox
    const nutFar = moveInVectorSpace(nk.neckTop!, [{ ...direction, mag: nk.nutHeight }]);
    if (ss) {
      const nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
      renderPolygon([nk.neckTop!, nutFar, nutFarTop, ss.nutTop!], part.nut, STROKE_WEIGHT.section)(g, ui);
    } else if (scroll) {
      seg(nk.neckTop!, nutFar);
    }

    // the neck itself: the scroll or the nut-end wall, the back, and the heel down to the button
    if (scroll) renderPath(definePlacedSideScrollPath(p), paint(pal.neutral), STROKE_WEIGHT.section)(g, ui);
    else seg(nk.neckTop!, nk.backNut!);
    const heel = nk.heel;
    if (heelStands(p)) {
      seg(backTop, pointOnCircle(heel, heel.start));
      renderPath(pathFromArc(heel), part.neckRoot, STROKE_WEIGHT.section)(g, ui);
      const face = heelFace(p);
      if (face) seg(face[0], face[1], part.neckRoot);
    } else {
      seg(backTop, nk.backRoot!);
    }

    if (ss && fbEnd && strings) {
      seg(ss.nutTop!, ss.bridgeTop!, paint(pal.neutral));
      if (fretMarks) renderFretTicks(ss.nutTop!, ss.bridgeTop!, dist(nk.neckTop!, fbEnd), pal)(g, ui);
    }

    if (!guides) return;
    const guide = pal.neutral;
    const rootPlaneY = p.height - p.overhang;
    // offsets scale with the neck's own wood thickness rather than a fixed mm, so the parked
    // dimension lines clear the drawing the same way on a cello neck as on a violin's
    renderGuideMeasure(plateEdgeAtNeck(p), nk.root!, guide, -nk.thickness)(g, ui);
    renderGuideBaseline(new Pt(0, rootPlaneY), new Pt(mortFboard.x, rootPlaneY), guide)(g, ui);
    renderGuideMeasure(new Pt(mortFboard.x, rootPlaneY), mortFboard, guide, 2 * nk.thickness)(g, ui);
    renderGuideMeasure(mortFboard, nk.neckTop!, guide, -2 * (nk.thickness + (ss?.nutThickness ?? 0)))(g, ui);
  };
}

export function renderNeckHighlight(p: EnricoCerutiParams, key: NeckHighlightKey | null, color: string, view: 'side' | 'front') {
  return (g: any, ui: any): void => {
    if (!key || (key === 'topWidth' || key === 'rootWidth') !== (view === 'front')) return;
    const nk = p.neck!;
    const ss = p.stringSetup!;
    const normal = vectorFromSlope(nk.angle);
    const mortFboard = mortiseFingerboardIntersect(p);
    // the string setup's keys come only from its own panel, which has set it
    const fbEnd = () => fingerboardEnd(p);
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
      case 'fbLength': line(nk.neckTop!, fbEnd()); break;
      case 'fbThickness': line(nk.neckTop!, edgeAt(nk.neckTop!)); line(fbEnd(), edgeAt(fbEnd())); break;
      case 'fbRadius': {
        const end = fbEnd();
        let prev = edgeAt(nk.neckTop!);
        for (let i = 1; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
          const at = pointAtDistanceToward(nk.neckTop!, end, i * dist(nk.neckTop!, end) / FINGERBOARD_CROWN_SAMPLES);
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
export function renderFrontView(p: EnricoCerutiParams, paths: PathEntry[], pal: PanelPalette, panel: NeckSetPanel, showFingerboard: boolean, scroll: boolean) {
  const profile = defineFrontProfilePath(p, topPlatePaths(p, paths), showFingerboard);
  const part = neckSetPalette(pal, panel);

  return (g: any, ui: any): void => {
    renderPath(profile.body.outline, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (const d of [...profile.body.purfling, ...profile.body.fHoles]) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);

    if (p.stringSetup && panel === 'stringSetup') {
      const [footA, footB] = bridgeWedge(p);
      const bridgeHalfDepth = dist(footA, footB) / 2;
      const bridgeY = (footA.y + footB.y) / 2;
      // the bridge spans the upper eyes' inner edges; a square stands in until the f-holes are placed
      const eye = p.fHoles?.UEye;
      const bridgeHalfWidth = eye ? Math.abs(eye.x) - eye.r : bridgeHalfDepth;
      renderPolygon([
        new Pt(-bridgeHalfWidth, bridgeY - bridgeHalfDepth), new Pt(bridgeHalfWidth, bridgeY - bridgeHalfDepth),
        new Pt(bridgeHalfWidth, bridgeY + bridgeHalfDepth), new Pt(-bridgeHalfWidth, bridgeY + bridgeHalfDepth),
      ], part.bridge, STROKE_WEIGHT.section)(g, ui);
    }

    renderPath(profile.neck, showFingerboard && p.stringSetup ? part.fingerboard : part.neckRoot, STROKE_WEIGHT.section)(g, ui);
    if (p.stringSetup) renderPath(profile.nut, part.nut, STROKE_WEIGHT.section)(g, ui);
    else if (scroll) renderPath(profile.nut, part.neck, STROKE_WEIGHT.section)(g, ui);
    if (scroll) for (const stroke of scrollFrontInPlan(p)) renderStroke(stroke, pal.neutral)(g, ui);
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
// the intervals worth calling out against the plain fret colour, above the open string: perfect
// fourth, perfect fifth, octave
const landmarkColors = (pal: PanelPalette): Record<number, string> => ({ 5: pal.ink(1).faint(-2), 7: pal.ink(1).faint(-5), 12: pal.ink(1).faint(3) });

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

function renderFretTicks(nut: Pt, bridge: Pt, maxDistance: number, pal: PanelPalette) {
  const landmarks = landmarkColors(pal);
  const stringLength = dist(nut, bridge);
  const along: Vect2D = { a: (bridge.x - nut.x) / stringLength, b: (bridge.y - nut.y) / stringLength, mag: 1 };
  const across: Vect2D = { a: -along.b, b: along.a, mag: 1 };
  const positions = equalTemperamentPositions(stringLength, FRET_MARK_SEMITONES);

  return (g: any, ui: any): void => {
    positions.forEach((d, i) => {
      if (d > maxDistance) return;
      const semitone = i + 1;
      const landmarkColor = landmarks[semitone];
      const halfLength = landmarkColor ? LANDMARK_TICK_HALF_LENGTH_MM : FRET_TICK_HALF_LENGTH_MM;
      const center = moveInVectorSpace(nut, [{ ...along, mag: d }]);
      const a = moveInVectorSpace(center, [{ ...across, mag: halfLength }]);
      const b = moveInVectorSpace(center, [{ ...across, mag: -halfLength }]);
      renderSegment(a, b, landmarkColor ?? pal.ink(1).faint(-3), STROKE_WEIGHT.guide)(g, ui);
    });
  };
}