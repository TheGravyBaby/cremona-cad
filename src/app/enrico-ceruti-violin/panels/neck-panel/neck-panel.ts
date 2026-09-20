import { Component, Input, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FlutingParams, NeckParams, RenderToggleKey } from '../../ceruti-types';
import { defaultArchingParams } from '../../ceruti-arching';
import { defaultFlutingParams, LongArchSolve, solveLongArch } from '../../ceruti-arch-geometry';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { defaultNeckParams, NeckSolve, calculateNeck } from '../../ceruti-neck';
import { renderBodySection } from '../../renders/body-section.render';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { pathFromArc } from '../../../helpers/math/pathMath';
import { renderSegment, renderPolygon, renderPath, renderText } from '../../../helpers/renderFuncs';
import { Pt } from '../../../models/types';
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
  static readonly renderToggles: readonly RenderToggleKey[] = ['showModuleGuides', 'showFingerboard'];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  /** Last solve, kept so the template can report it without re-solving. */
  protected solved: NeckSolve | null = null;

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
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
    this.solved = calculateNeck(p, solved.top, gouge.top);

    return [
      renderBodySection(p, this.colors, { solved, gouge, color: this.colors.outerTrace }),
      renderNeck(this.solved, this.colors, this.flags.showModuleGuides, this.flags.showFingerboard),
    ];
  }
  
}

export function renderNeck(s: NeckSolve, colors: CerutiColors, showGuides: boolean, showFingerboard: boolean) {
  return (g: any, ui: any): void => {
    const seg = (a: Pt, b: Pt, color = colors.neck) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);

    // the button: the back plate carried on past its edge, the heel's foot on top of it
    renderPolygon(s.buttonProfile, colors.archBack, STROKE_WEIGHT.section)(g, ui);

    // the foot in the mortise
    seg(new Pt(0, s.mortiseFloorY), s.gluingAtMortise, colors.neckRoot);
    seg(s.gluingAtMortise, s.root, colors.neck);

    // the bridge blank, standing on the arch
    renderPolygon(s.bridgeWedge, colors.bridge, STROKE_WEIGHT.section)(g, ui);

    // the neck's own boundary where the fingerboard glues on — independent of whatever the
    // fingerboard itself ends up being, since that's still an open question
    seg(s.root, s.nut.at);

    const fb = s.fingerboard;
    if (showFingerboard) {
      renderPolygon([fb.end, fb.endTop, fb.nutTop, s.nut.at], colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    }

    // the nut, on the fingerboard plane just past the board
    renderPolygon(s.nutBlock, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);

    // the neck itself: nut-end wall, the back, and the heel down to the button
    seg(s.nut.at, s.back.nut);
    const heel = s.heel;
    if (heel) {
      seg(s.back.nut, heel.start);
      renderPath(pathFromArc(heel.arc), colors.neckRoot, STROKE_WEIGHT.section)(g, ui);
      if (heel.face) seg(heel.end, heel.face, colors.neckRoot);
    } else {
      seg(s.back.nut, s.back.root);
    }

    seg(s.nut.top, s.bridge.top, colors.innerTrace);

    // pegbox and scroll, boxed until their panel exists
    renderPolygon(s.scroll, colors.neckOff, STROKE_WEIGHT.guide, 0.7)(g, ui);
    const mid = new Pt((s.scroll[0].x + s.scroll[2].x) / 2, (s.scroll[0].y + s.scroll[2].y) / 2);
    renderText(mid, 'scroll', colors.neckOff, 5, s.scrollLabelAngleDeg)(g, ui);

    if (!showGuides) return;
    const guide = colors.neckOff;
    renderGuideMeasure(s.edge, s.root, guide)(g, ui);
    renderGuideBaseline(new Pt(0, s.rootPlaneY), new Pt(s.gluingAtMortise.x, s.rootPlaneY), guide)(g, ui);
    renderGuideMeasure(new Pt(s.gluingAtMortise.x, s.rootPlaneY), s.gluingAtMortise, guide)(g, ui);
    // renderGuideMeasure(s.root, s.nut.at, guide)(g, ui);
  };
}
