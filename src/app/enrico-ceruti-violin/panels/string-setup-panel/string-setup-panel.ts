import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiViewFlags, EnricoCerutiParams, FlutingParams, PathEntry, RenderToggleKey, StringSetup } from '../../ceruti-types';
import { bridgeWedge, calculateNeck, defaultNeckParams, defaultStringSetup, fingerboardCrown, mortiseFingerboardIntersect, stringLength } from '../../calculation/neck/ceruti-neck';
import { defaultArchingParams } from '../../calculation/arching/ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../calculation/arching/ceruti-arch-geometry';
import { calculateOuterArcs, ensureFholePath, ensureNeckPath, ensureOuterTracePaths, topPlatePaths } from '../../calculation/outline/ceruti-calcs';
import { defineFrontProfilePath, fingerboardEnd } from '../../calculation/outline/ceruti-paths';
import { scrollFrontInPlan } from '../../calculation/neck/ceruti-scroll-views';
import { solveScrollForProfile } from '../../calculation/neck/ceruti-scroll';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { renderPath, renderPolygon, renderSegment, renderSegmentHalo, renderSolveFailures, renderStroke } from '../../../helpers/renderFuncs';
import { dist, moveInVectorSpace, pointAtDistanceToward, vectorFromSlope } from '../../../helpers/math/simpleGeometry';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { Pt, Vect2D } from '../../../models/types';
import { renderBodySideProfile, sideViewOffsetX } from '../../renders/body-side-profile.render';
import { renderNeck } from '../neck-panel/neck-panel';
import { TooltipDirective } from '../../../docs/tooltips';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';

export type StringSetupHighlightKey = 'length' | 'bodyStop' | 'bridgeHeight' | 'nutThickness' | 'fbLength' | 'fbThickness' | 'fbRadius';

@Component({
  selector: 'app-ceruti-string-setup-panel',
  imports: [TooltipDirective, FormsModule, DecimalPipe, NumberStepperDirective],
  templateUrl: './string-setup-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class StringSetupPanel extends CerutiPanelBase implements OnInit {
  protected readonly pal = ThemeService.getPalette('varnish');
  static readonly renderToggles: readonly RenderToggleKey[] = ['showFingerboard', 'showFretMarks'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) flags!: CerutiViewFlags;

  private highlightedKey: StringSetupHighlightKey | null = null;
  private highlightedColor = '';

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  onFieldFocus(key: StringSetupHighlightKey, color: string): void {
    this.highlightedKey = key;
    this.highlightedColor = color;
    this.emitImmediate(false);
  }

  onFieldBlur(): void {
    this.highlightedKey = null;
    this.highlightedColor = '';
    this.emitImmediate(false);
  }

  get stringSetup(): StringSetup { return this.params.stringSetup!; }

  get stringLength(): number | null {
    return this.stringSetup.nutTop && this.stringSetup.bridgeTop ? stringLength(this.params) : null;
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.stringSetup ??= defaultStringSetup(p);
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
        renderBodySideProfile(p, this.pal, { solved, gouge, ground: true })(side.g, side.ui);
        renderNeck(p, this.pal, { scroll, ground: true })(side.g, side.ui);
        renderStringSetup(p, this.pal, { fingerboard: this.flags.showFingerboard, fretMarks: this.flags.showFretMarks })(side.g, side.ui);
        renderStringSetupHighlight(p, this.highlightedKey, this.highlightedColor)(side.g, side.ui);
        renderSolveFailures(failures, this.pal.alert)(side.g, side.ui);
      },
      renderStringSetupFrontView(p, this.paths, this.pal, this.flags.showFingerboard, scroll),
    ];
  }
}

export interface StringSetupRenderOptions {
  fingerboard?: boolean;
  fretMarks?: boolean;
  strings?: boolean;
  bridge?: boolean;
  // the whole setup in neutral, for a panel where it's the ground rather than the subject
  ground?: boolean;
}

// the bridge, board, nut and strings, over the neck renderNeck draws
export function renderStringSetup(p: EnricoCerutiParams, pal: PanelPalette, opts: StringSetupRenderOptions = {}) {
  const { fingerboard = true, fretMarks = false, strings = true, bridge = true, ground = false } = opts;
  const ink = (c: string) => ground ? pal.neutral : c;
  const nk = p.neck!;
  const ss = p.stringSetup!;
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const normal = vectorFromSlope(nk.angle);
  const fbEnd = fingerboardEnd(p);

  return (g: any, ui: any): void => {
    const seg = (a: Pt, b: Pt, color: string) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);

    if (bridge) renderPolygon(bridgeWedge(p), ink(pal.ink(1)), STROKE_WEIGHT.section)(g, ui);

    if (fingerboard) {
      // the board's edges solid, the crown above them faded so the two read apart
      const edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
      renderPolygon([nk.neckTop!, edgeAt(nk.neckTop!), edgeAt(fbEnd), fbEnd], ink(pal.ink(0)), STROKE_WEIGHT.section)(g, ui);
      const crown = fingerboardCrownLine(p);
      renderPath('M ' + crown.map(c => `${c.x} ${c.y}`).join(' L '), ink(pal.ink(0)), STROKE_WEIGHT.section, FINGERBOARD_CROWN_OPACITY)(g, ui);
    }

    // the nut, on the fingerboard plane just past the board
    const nutFar = moveInVectorSpace(nk.neckTop!, [{ ...direction, mag: nk.nutHeight }]);
    const nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
    renderPolygon([nk.neckTop!, nutFar, nutFarTop, ss.nutTop!], ink(pal.ink(0).faint(-3)), STROKE_WEIGHT.section)(g, ui);

    // the neck's length is entered here too, so the front it sets keeps its colour over the board's edge
    if (!ground) {
      const mortFboard = mortiseFingerboardIntersect(p);
      seg(mortFboard, nk.root!, pal.ink(2));
      seg(nk.root!, nk.neckTop!, pal.ink(2));
    }

    if (strings) {
      seg(ss.nutTop!, ss.bridgeTop!, pal.neutral);
      if (fretMarks) renderFretTicks(ss.nutTop!, ss.bridgeTop!, dist(nk.neckTop!, fbEnd), pal)(g, ui);
    }
  };
}

function renderStringSetupHighlight(p: EnricoCerutiParams, key: StringSetupHighlightKey | null, color: string) {
  return (g: any, ui: any): void => {
    if (!key) return;
    const nk = p.neck!;
    const ss = p.stringSetup!;
    const normal = vectorFromSlope(nk.angle);
    const fbEnd = fingerboardEnd(p);
    const edgeAt = (at: Pt) => moveInVectorSpace(at, [{ ...normal, mag: ss.fingerboardThickness }]);
    const line = (a: Pt, b: Pt) => renderSegmentHalo(a, b, color)(g, ui);

    switch (key) {
      case 'length': line(mortiseFingerboardIntersect(p), nk.neckTop!); break;
      case 'bodyStop': line(new Pt(ss.bridgeFoot!.x, p.height), ss.bridgeFoot!); break;
      case 'bridgeHeight': line(ss.bridgeFoot!, ss.bridgeTop!); break;
      case 'nutThickness': line(nk.neckTop!, ss.nutTop!); break;
      case 'fbLength': line(nk.neckTop!, fbEnd); break;
      case 'fbThickness': line(nk.neckTop!, edgeAt(nk.neckTop!)); line(fbEnd, edgeAt(fbEnd)); break;
      case 'fbRadius': {
        const crown = fingerboardCrownLine(p);
        for (let i = 1; i < crown.length; i++) line(crown[i - 1], crown[i]);
        break;
      }
    }
  };
}

// the body's plan outline as the f-hole contours panel draws it, the neck over it in grey and the
// bridge, board and nut in colour
function renderStringSetupFrontView(p: EnricoCerutiParams, paths: PathEntry[], pal: PanelPalette, showFingerboard: boolean, scroll: boolean) {
  const profile = defineFrontProfilePath(p, topPlatePaths(p, paths), showFingerboard);

  return (g: any, ui: any): void => {
    renderPath(profile.body.outline, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (const d of [...profile.body.purfling, ...profile.body.fHoles]) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);

    const [footA, footB] = bridgeWedge(p);
    const bridgeHalfDepth = dist(footA, footB) / 2;
    const bridgeY = (footA.y + footB.y) / 2;
    // the bridge spans the upper eyes' inner edges; a square stands in until the f-holes are placed
    const eye = p.fHoles?.UEye;
    const bridgeHalfWidth = eye ? Math.abs(eye.x) - eye.r : bridgeHalfDepth;
    renderPolygon([
      new Pt(-bridgeHalfWidth, bridgeY - bridgeHalfDepth), new Pt(bridgeHalfWidth, bridgeY - bridgeHalfDepth),
      new Pt(bridgeHalfWidth, bridgeY + bridgeHalfDepth), new Pt(-bridgeHalfWidth, bridgeY + bridgeHalfDepth),
    ], pal.ink(1), STROKE_WEIGHT.section)(g, ui);

    renderPath(profile.neck, showFingerboard ? pal.ink(0) : pal.neutral, STROKE_WEIGHT.section)(g, ui);
    renderPath(profile.nut, pal.ink(0).faint(-3), STROKE_WEIGHT.section)(g, ui);
    if (scroll) for (const stroke of scrollFrontInPlan(p)) renderStroke(stroke, pal.neutral)(g, ui);
  };
}

// the board's top, from its edge at the nut over the crown to its edge at the end. The crown's rise
// follows the board's width, which grows linearly, so its line curves slightly
function fingerboardCrownLine(p: EnricoCerutiParams): Pt[] {
  const nk = p.neck!;
  const ss = p.stringSetup!;
  const normal = vectorFromSlope(nk.angle);
  const fbEnd = fingerboardEnd(p);
  const above = (at: Pt, mag: number) => moveInVectorSpace(at, [{ ...normal, mag }]);
  const line = [above(nk.neckTop!, ss.fingerboardThickness)];
  for (let i = 0; i <= FINGERBOARD_CROWN_SAMPLES; i++) {
    const at = pointAtDistanceToward(nk.neckTop!, fbEnd, i * dist(nk.neckTop!, fbEnd) / FINGERBOARD_CROWN_SAMPLES);
    line.push(above(at, ss.fingerboardThickness + fingerboardCrown(p, at.y)));
  }
  line.push(above(fbEnd, ss.fingerboardThickness));
  return line;
}

const FINGERBOARD_CROWN_SAMPLES = 24;
const FINGERBOARD_CROWN_OPACITY = 0.45;

// fret marks, scratch: how many semitones up the string to mark, and how far each tick reaches either
// side of the string line. Plain semitones stay small so they read as a scale rather than competing
// with the landmark intervals
const FRET_MARK_SEMITONES = 12;
const FRET_TICK_HALF_LENGTH_MM = 1;
const LANDMARK_TICK_HALF_LENGTH_MM = 3;

// twelve-tone equal temperament: each semitone shortens the vibrating length by the 12th root of 2,
// so fret n sits `stringLength * (1 - 2^(-n/12))` from the nut
function equalTemperamentPositions(stringLength: number, semitones: number): number[] {
  const positions: number[] = [];
  for (let n = 1; n <= semitones; n++) {
    positions.push(stringLength * (1 - 2 ** (-n / 12)));
  }
  return positions;
}

// bounded to the board's own length, `maxDistance`
function renderFretTicks(nut: Pt, bridge: Pt, maxDistance: number, pal: PanelPalette) {
  const stringLength = dist(nut, bridge);
  const along: Vect2D = { a: (bridge.x - nut.x) / stringLength, b: (bridge.y - nut.y) / stringLength, mag: 1 };
  const across: Vect2D = { a: -along.b, b: along.a, mag: 1 };
  const positions = equalTemperamentPositions(stringLength, FRET_MARK_SEMITONES);

  return (g: any, ui: any): void => {
    const tick = (semitone: number, halfLength: number, color: string) => {
      const d = positions[semitone - 1];
      if (d > maxDistance) return;
      const center = moveInVectorSpace(nut, [{ ...along, mag: d }]);
      const a = moveInVectorSpace(center, [{ ...across, mag: halfLength }]);
      const b = moveInVectorSpace(center, [{ ...across, mag: -halfLength }]);
      renderSegment(a, b, color, STROKE_WEIGHT.guide)(g, ui);
    };
    for (const semitone of [1, 2, 3, 4, 6, 8, 9, 10, 11]) tick(semitone, FRET_TICK_HALF_LENGTH_MM, pal.ink(0).faint(-3));
    // the intervals worth calling out above the open string: perfect fourth, perfect fifth, octave
    tick(5, LANDMARK_TICK_HALF_LENGTH_MM, pal.ink(0).faint(-2));
    tick(7, LANDMARK_TICK_HALF_LENGTH_MM, pal.ink(0).faint(-5));
    tick(12, LANDMARK_TICK_HALF_LENGTH_MM, pal.ink(0).faint(3));
  };
}
