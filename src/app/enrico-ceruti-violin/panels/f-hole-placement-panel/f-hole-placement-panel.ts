import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, DefaultParams, EnricoCerutiParams, FholeParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderOuterTraceGuides } from '../outer-trace-panel/outer-trace-panel';
import { renderCircle, renderPath } from '../../../helpers/renderFuncs';
import { calculateOuterArcs, ensureOuterTracePaths, getPath, getPathOrNull } from '../../ceruti-calcs';
import { Circle, Pt } from '../../../models/types';
import { nearestFraction, nearestSmallFraction } from '../../../helpers/nearestFraction';
import { renderBounds, renderBoutBouts } from '../../renders/guides.render';
import { lineCircleIntersection } from '../../../helpers/draftMath';

/** Where the two f-holes sit on the plate — the eyes first, everything else hung off them. */
@Component({
  selector: 'app-ceruti-f-hole-placement-panel',
  imports: [FormsModule],
  templateUrl: './f-hole-placement-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class FHolePlacementPanel extends CerutiPanelBase implements OnInit {
  static readonly renderToggles: readonly RenderToggleKey[] = [];

  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) paths!: PathEntry[];
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  protected readonly nearestFraction = nearestFraction;
  protected readonly nearestSmallFraction = nearestSmallFraction;
  

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    calculateOuterArcs(p);
    ensureOuterTracePaths(p, this.paths);
    p.fHoles ??= this.defaultFholePlacement(p);
    

    const renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'top'), this.colors.outerTrace),
    ];

    const purflingPath = getPathOrNull(this.paths, 'purfling');
    const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');

    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));

    // renders.push(renderBoutBouts(p, this.colors, true))
    
    
    p.ratios.FLtoW = p.fHoles!.FL0.r / p.width;
    p.ratios.FUtoL = p.fHoles!.FU0.r / p.fHoles!.FL0.r;
    
    renders.push(renderFholePlacementGuides(p, this.colors));

    return renders;
  }

  defaultFholePlacement(p: EnricoCerutiParams): FholeParams {
    let FUtoL = p.ratios.FUtoL ?? DefaultParams.ratios.FUtoL;
    let FLtoW = p.ratios.FLtoW ?? DefaultParams.ratios.FLtoW;
    let lowerEyeR = p.width * FLtoW

    let lowerCorner = p.bouts.LCr;
    let upperCorner = p.bouts.UCr;

    let lowerEyeHeight = lowerCorner.y - lowerEyeR;
    // I have a theory that the default strad position defined by this guide arc, 1/3 the lower corner distance from the middle
    // or 1/6 the total corner width
    let lowerEyeGuideCircle = new Circle(p.bouts.LCr.x, p.bouts.LCr.y, p.bouts.LCr.x / 3);

    // the position of the eye is the intersection between the line defined by the corners and the guide circle
    let lowerEyePosition = lineCircleIntersection(new Pt(0, lowerEyeHeight), new Pt(1000, lowerEyeHeight), lowerEyeGuideCircle)[1]
    let lowerEye = new Circle(lowerEyePosition.x,  lowerEyePosition.y, lowerEyeR);

    let cornerMidpoint = (upperCorner.y - lowerCorner.y) / 2 + lowerCorner.y;

    // currently I hardcode this value based on the bout width, this is wrong
    // for violins, strad and del gesu have distances about 62mm
    // I need a value that is based on a proportion
    let upperEye = new Circle(p.bouts.CBW * .25,  cornerMidpoint, lowerEyeR * FUtoL);

    let defaults = {
      FU0: upperEye,
      FL0: lowerEye,
      Uy: upperEye.r * 5/6,
      Ly: lowerEye.r * 5/6
    };
    return defaults;
  }
}

export const renderFholePlacementGuides = (p: EnricoCerutiParams, colors: CerutiColors) => (g: any, ui: any) => {

  renderCircle(p.fHoles!.FU0, colors.upperEye)(g, ui);
  renderCircle(p.fHoles!.FL0, colors.lowerEye)(g, ui);
}


