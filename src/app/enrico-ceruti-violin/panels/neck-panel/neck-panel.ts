import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FlutingParams, NeckParams, PathEntry, RenderToggleKey, StringSetup } from '../../ceruti-types';
import { defaultArchingParams } from '../../ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../ceruti-arch-geometry';
import { calculateOuterArcs, ensureNeckPath } from '../../ceruti-calcs';
import { bridgeWedge, buttonTip, calculateNeck, defaultNeckParams, defaultStringSetup, fingerboardEnd, mortiseFingerboardIntersect, heelBottom, heelFace, heelStands, mortiseFloorY, plateEdgeAtNeck, standardNutLength, stringLength } from '../../ceruti-neck';
import { renderBodySection } from '../../renders/body-section.render';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { pathFromArc } from '../../../helpers/math/pathMath';
import { dist, moveInVectorSpace, pointOnCircle, vectorFromSlope } from '../../../helpers/math/simpleGeometry';
import { renderSegment, renderPolygon, renderPath } from '../../../helpers/renderFuncs';
import { Pt, Vect2D } from '../../../models/types';
import { renderGuideMeasure, renderGuideBaseline } from '../../renders/module-guide.render';
import { STROKE_WEIGHT } from '../../renders/render-constants';

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

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
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
    calculateNeck(p, solved.top, gouge.top);
    ensureNeckPath(p, this.paths);

    return [
      renderBodySection(p, this.colors, { solved, gouge, color: this.colors.outerTrace }),
      renderNeck(p, this.colors, this.flags.showModuleGuides, this.flags.showFingerboard, this.flags.showFretMarks),
    ];
  }

}

export function renderNeck(p: EnricoCerutiParams, colors: CerutiColors, showGuides: boolean, showFingerboard: boolean, showFretMarks: boolean) {
  const nk = p.neck!;
  const ss = p.stringSetup!;
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const normal = vectorFromSlope(nk.angle);
  const tip = buttonTip(p);
  const mortFboard = mortiseFingerboardIntersect(p);
  const nutTop = ss.nutTop!;
  const fbEnd = fingerboardEnd(p);
  
  return (g: any, ui: any): void => {
    const seg = (a: Pt, b: Pt, color = colors.neck) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);

    // the button: the back plate carried on past its edge, the heel's foot on top of it
    const backThickness = p.arching!.bottom.thickness;
    renderPolygon([new Pt(0, p.height), new Pt(0, tip.y), new Pt(-backThickness, tip.y), new Pt(-backThickness, p.height)], colors.archBack, STROKE_WEIGHT.section)(g, ui);

    // the foot in the mortise
    seg(new Pt(0, mortiseFloorY(p)), mortFboard, colors.neckRoot);
    seg(mortFboard, nk.root!, colors.neck);

    renderPolygon(bridgeWedge(p), colors.bridge, STROKE_WEIGHT.section)(g, ui);

    // the neck's own boundary where the fingerboard glues on
    seg(nk.root!, nk.neckTop!);

    if (showFingerboard) {
      const fbEndTop = moveInVectorSpace(fbEnd, [{ ...normal, mag: ss.nutThickness }]);
      renderPolygon([fbEnd, fbEndTop, nutTop, nk.neckTop!], colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    }

    // the nut, on the fingerboard plane just past the board
    const nutFar = moveInVectorSpace(nk.neckTop!, [{ ...direction, mag: standardNutLength(p.height) }]);
    const nutFarTop = moveInVectorSpace(nutFar, [{ ...normal, mag: ss.nutThickness }]);
    renderPolygon([nk.neckTop!, nutFar, nutFarTop, nutTop], colors.fingerboard, STROKE_WEIGHT.section)(g, ui);

    // the neck itself: nut-end wall, the back, and the heel down to the button
    seg(nk.neckTop!, nk.backNut!);
    const heel = nk.heel;
    if (heelStands(p)) {
      seg(nk.backNut!, pointOnCircle(heel, heel.start));
      renderPath(pathFromArc(heel), colors.neckRoot, STROKE_WEIGHT.section)(g, ui);
      const face = heelFace(p);
      if (face) seg(face[0], face[1], colors.neckRoot);
    } else {
      seg(nk.backNut!, nk.backRoot!);
    }

    seg(nutTop, ss.bridgeTop!, colors.innerTrace);
    if (showFretMarks) renderFretTicks(nutTop, ss.bridgeTop!, dist(nk.neckTop!, fbEnd))(g, ui);

    if (!showGuides) return;
    const guide = colors.neckOff;
    const rootPlaneY = p.height - p.overhang;
    // offsets scale with the neck's own wood thickness rather than a fixed mm, so the parked
    // dimension lines clear the drawing the same way on a cello neck as on a violin's
    renderGuideMeasure(plateEdgeAtNeck(p), nk.root!, guide, -nk.thickness)(g, ui);
    renderGuideBaseline(new Pt(0, rootPlaneY), new Pt(mortFboard.x, rootPlaneY), guide)(g, ui);
    renderGuideMeasure(new Pt(mortFboard.x, rootPlaneY), mortFboard, guide, 2 * nk.thickness)(g, ui);
    // the neck's own length runs along the back, heelBottom to backNut — not root to nut, which
    // sits off that line by the neck's thickness (see `length`'s header)
    renderGuideMeasure(heelBottom(p), nk.backNut!, guide, -2 * (nk.thickness + ss.nutThickness))(g, ui);
  };
}

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