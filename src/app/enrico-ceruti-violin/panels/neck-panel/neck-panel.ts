import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiViewFlags, EnricoCerutiParams, FlutingParams, NeckParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { defaultArchingParams } from '../../calculation/arching/ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../calculation/arching/ceruti-arch-geometry';
import { calculateOuterArcs, ensureFholePath, ensureNeckPath, ensureOuterTracePaths, topPlatePaths } from '../../calculation/outline/ceruti-calcs';
import { buttonTip, calculateNeck, defaultNeckParams, mortiseFingerboardIntersect, heelFace, heelStands, plateEdgeAtNeck } from '../../calculation/neck/ceruti-neck';
import { defineFrontProfilePath, definePlacedSideScrollPath, mortiseFloorY, scrollOnNeck } from '../../calculation/outline/ceruti-paths';
import { solveScrollForProfile } from '../../calculation/neck/ceruti-scroll';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { applyMatrix, pathFromArc } from '../../../helpers/math/pathMath';
import { moveInVectorSpace, pointOnCircle, vectorFromSlope } from '../../../helpers/math/simpleGeometry';
import { renderSegment, renderSegmentHalo, renderArcHalo, renderPolygon, renderPath, renderGuideMeasure, renderGuideBaseline, renderStroke } from '../../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { Pt } from '../../../models/types';
import { scrollFrontInPlan } from '../../calculation/neck/ceruti-scroll-views';
import { renderBodySideProfile, sideViewOffsetX } from '../../renders/body-side-profile.render';
import { PanelPalette, ThemeService } from '../../../theme/theme.service';

export type NeckHighlightKey = 'length' | 'thickness' | 'topWidth' | 'rootWidth' | 'heel' | 'buttonHeight' | 'mortise' | 'overstand' | 'angle';

@Component({
  selector: 'app-ceruti-neck-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './neck-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class NeckPanel extends CerutiPanelBase implements OnInit {
  protected readonly pal = ThemeService.getPalette('varnish');
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides'];

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
    calculateNeck(p, solved.top, gouge.top);
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
        renderBodySideProfile(p, this.pal, { solved, gouge, ground: true })(side.g, side.ui);
        renderNeck(p, this.pal, { guides: this.flags.showModuleGuides, scroll })(side.g, side.ui);
        renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'side')(side.g, side.ui);
      },
      renderNeckFrontView(p, this.paths, this.pal, scroll),
      renderNeckHighlight(p, this.highlightedKey, this.highlightedColor, 'front'),
    ];
  }

}

export interface NeckRenderOptions {
  guides?: boolean;
  // the scroll's side profile set on the neck's end; only for a scroll calculateScroll solved whole
  scroll?: boolean;
  // the whole neck in neutral, for a panel where it's the ground rather than the subject
  ground?: boolean;
}

export function renderNeck(p: EnricoCerutiParams, pal: PanelPalette, opts: NeckRenderOptions = {}) {
  const { guides = false, scroll = false, ground = false } = opts;
  const ink = (c: string) => ground ? pal.neutral : c;
  const nk = p.neck!;
  const direction = vectorFromSlope(nk.angle + Math.PI / 2);
  const tip = buttonTip(p);
  const mortFboard = mortiseFingerboardIntersect(p);
  // with the scroll on, the pegbox carries on past the nut, and the back runs up to where the nape
  // meets it, as the scroll panels draw it
  const backTop = scroll ? applyMatrix(scrollOnNeck(p), new Pt(-nk.thickness, p.scroll!.nape.y)) : nk.backNut!;

  return (g: any, ui: any): void => {
    // only the front, which the length sets, is in the neck's colour; the rest of its outline is plain
    const seg = (a: Pt, b: Pt, color: string = pal.neutral) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);

    // the button: the back plate carried on past its edge, the heel's foot on top of it
    const backThickness = p.arching!.bottom.thickness;
    renderPolygon([new Pt(0, p.height), new Pt(0, tip.y), new Pt(-backThickness, tip.y), new Pt(-backThickness, p.height)], ink(pal.ink(1)), STROKE_WEIGHT.section)(g, ui);

    // the foot from where it comes out of the plate at the mortise floor, then the neck's face on up to
    // the root; the rest of the foot is hidden in the block
    if (nk.plateAtMortise) seg(nk.plateAtMortise, mortFboard, ink(pal.ink(3).faint(-3)));

    // the neck itself: the scroll, running on over the nut's seat, or the nut-end wall; the back, and
    // the heel down to the button
    if (scroll) {
      seg(nk.neckTop!, moveInVectorSpace(nk.neckTop!, [{ ...direction, mag: nk.nutHeight }]));
      renderPath(definePlacedSideScrollPath(p), pal.neutral, STROKE_WEIGHT.section)(g, ui);
    } else {
      seg(nk.neckTop!, nk.backNut!);
    }
    const heel = nk.heel;
    if (heelStands(p)) {
      seg(backTop, pointOnCircle(heel, heel.start));
      renderPath(pathFromArc(heel), ink(pal.ink(3)), STROKE_WEIGHT.section)(g, ui);
      const face = heelFace(p);
      if (face) seg(face[0], face[1], ink(pal.ink(3)));
    } else {
      seg(backTop, nk.backRoot!);
    }

    seg(mortFboard, nk.root!, ink(pal.ink(2)));
    seg(nk.root!, nk.neckTop!, ink(pal.ink(2)));

    if (!guides) return;
    const rootPlaneY = p.height - p.overhang;
    // offsets scale with the neck's own wood thickness rather than a fixed mm, so the parked
    // dimension lines clear the drawing the same way on a cello neck as on a violin's
    renderGuideMeasure(plateEdgeAtNeck(p), nk.root!, pal.neutral, -nk.thickness)(g, ui);
    renderGuideBaseline(new Pt(0, rootPlaneY), new Pt(mortFboard.x, rootPlaneY), pal.neutral)(g, ui);
    renderGuideMeasure(new Pt(mortFboard.x, rootPlaneY), mortFboard, pal.neutral, 2 * nk.thickness)(g, ui);
    renderGuideMeasure(mortFboard, nk.neckTop!, pal.neutral, -2 * nk.thickness)(g, ui);
  };
}

function renderNeckHighlight(p: EnricoCerutiParams, key: NeckHighlightKey | null, color: string, view: 'side' | 'front') {
  return (g: any, ui: any): void => {
    if (!key || (key === 'topWidth' || key === 'rootWidth') !== (view === 'front')) return;
    const nk = p.neck!;
    const line = (a: Pt, b: Pt) => renderSegmentHalo(a, b, color)(g, ui);

    const topY = nk.neckTop!.y;
    const rootY = mortiseFloorY(p);
    switch (key) {
      case 'length': line(mortiseFingerboardIntersect(p), nk.neckTop!); break;
      case 'thickness': line(nk.neckTop!, nk.backNut!); break;
      case 'topWidth': line(new Pt(-nk.topWidth / 2, topY), new Pt(nk.topWidth / 2, topY)); break;
      case 'rootWidth': line(new Pt(-nk.rootWidth / 2, rootY), new Pt(nk.rootWidth / 2, rootY)); break;
      case 'heel': if (heelStands(p)) renderArcHalo(nk.heel, color)(g, ui); break;
      case 'buttonHeight': line(new Pt(0, p.height), buttonTip(p)); break;
      case 'mortise': line(new Pt(0, p.height - p.overhang), new Pt(0, rootY)); break;
      case 'overstand': line(plateEdgeAtNeck(p), nk.root!); break;
      case 'angle': line(nk.root!, nk.neckTop!); break;
    }
  };
}

// the body's plan outline as the f-hole contours panel draws it, the bare neck over it
function renderNeckFrontView(p: EnricoCerutiParams, paths: PathEntry[], pal: PanelPalette, scroll: boolean) {
  const profile = defineFrontProfilePath(p, topPlatePaths(p, paths), false);
  const nk = p.neck!;

  return (g: any, ui: any): void => {
    renderPath(profile.body.outline, pal.neutral, STROKE_WEIGHT.trace)(g, ui);
    for (const d of [...profile.body.purfling, ...profile.body.fHoles]) renderPath(d, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
    renderPath(profile.neck, pal.neutral, STROKE_WEIGHT.section)(g, ui);
    if (scroll) {
      renderPath(profile.nut, pal.neutral, STROKE_WEIGHT.section)(g, ui);
      for (const stroke of scrollFrontInPlan(p)) renderStroke(stroke, pal.neutral)(g, ui);
    }

    // only the two ends a width sets are in colour, the top the neck's and the root the root's, drawn
    // last since the nut and the scroll lie along the top
    renderSegment(new Pt(-nk.topWidth / 2, nk.neckTop!.y), new Pt(nk.topWidth / 2, nk.neckTop!.y), pal.ink(2).faint(-3), STROKE_WEIGHT.section)(g, ui);
    renderSegment(new Pt(-nk.rootWidth / 2, mortiseFloorY(p)), new Pt(nk.rootWidth / 2, mortiseFloorY(p)), pal.ink(3).faint(3), STROKE_WEIGHT.section)(g, ui);
  };
}
