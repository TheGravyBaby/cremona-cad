import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, FholeParams, PathEntry, RenderToggleKey } from '../../ceruti-types';
import { CerutiPanelBase, RenderLayer } from '../panel-base';
import { renderOuterTraceGuides } from '../outer-trace-panel/outer-trace-panel';
import { renderCircle, renderPath } from '../../../helpers/renderFuncs';
import { getPath, getPathOrNull } from '../../ceruti-calcs';
import { Circle } from '../../../models/types';

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

  ngOnInit(): void {
    this.emitImmediate();
  }

  onChange(): void {
    this.emitDebounced();
  }

  public buildRun(): RenderLayer[] {
    const p = this.params;
    p.fhole ??= this.defaultFholePlacement(p);

    const renders: RenderLayer[] = [
      renderPath(getPath(this.paths, 'back'), this.colors.outerTrace),
    ];

    const purflingPath = getPathOrNull(this.paths, 'purfling');
    const outerPurflingPath = getPathOrNull(this.paths, 'outerPurfling');

    if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
    if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));

    renders.push(renderFholePlacementGuides(p));

    return renders;
  }

  defaultFholePlacement(p: EnricoCerutiParams): FholeParams {

    // dumby values for now, will resolve to calculations later
    let defaults = {
      upperEye: new Circle(p.bouts.CBW * .25,  p.bouts.C0.y, 5),
      lowerEye: new Circle(p.bouts.CBW * .5,  p.bouts.LCr.y, 5)
    };
    return defaults;
  }
}

export const renderFholePlacementGuides = (p: EnricoCerutiParams) => (g: any, ui: any) =>{
  renderCircle(p.fhole!.upperEye, 'red')(g, ui);
  renderCircle(p.fhole!.lowerEye, 'red')(g, ui);
}


