import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Pt, Rectangle } from '../../../models/types';
import { renderRect, renderSolveFailures } from '../../../helpers/renderFuncs';
import { reportFailures } from '../../../helpers/validators';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { NumberStepperDirective } from '../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../theme/palettes';
import { ThemeService } from '../../../theme/theme.service';
import { BodyFailure, BodyKey, BodySolve, ViolinFamilyParams, ViolinFamilyRatios, ViolinFamilyRecipe, ViolinFamilyToggleKey } from '../../violin-family-types';
import { finiteRatios, RenderLayer, stage, ViolinFamilyPanel } from '../../violin-family-panel';
import { renderMainBouts, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';

// the body's envelope: the box the outline is drawn inside, and the rib line's box inset from it.
// A measurement that's missing or out of range is reported and the boxes aren't drawn; the field
// keeps what was typed
export const solveBody = stage(p => [p.body], (p): BodySolve => {
  let b = p.body;
  let failures: BodyFailure[] = [];
  measure(failures, 'height', 'Height', b.height, 10, 3000);
  measure(failures, 'width', 'Width', b.width, 10, 3000);
  measure(failures, 'rib', 'Rib thickness', b.rib, 0.1, 5);
  measure(failures, 'overhang', 'Overhang', b.overhang, 1, 10);

  let inset = b.overhang + b.rib;
  if (failures.length) return { inset, outer: null, ribBox: null, failures };

  let hw = b.width / 2;
  let outer = new Rectangle(new Pt(-hw, 0), new Pt(hw, b.height));
  let ribBox = new Rectangle(new Pt(-hw + inset, inset), new Pt(hw - inset, b.height - inset));
  return { inset, outer, ribBox, failures };
});

function measure(failures: BodyFailure[], key: BodyKey, label: string, value: number, min: number, max: number): void {
  let message =
    !Number.isFinite(value) ? `${label} needs a value.` :
    value < min ? `${label} must be at least ${min}mm.` :
    value > max ? `${label} must be under ${max}mm.` :
    null;
  if (message) failures.push({ message, unsolved: [key], circles: [], segments: [] });
}

export function solveBodyRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  return finiteRatios({ HtoW: p.body.height / p.body.width });
}

@Component({
  selector: 'app-vf-base-measurements-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './base-measurements-panel.html',
  styleUrls: ['../../../sidebar.css', '../../violin-family.css'],
})
export class BaseMeasurementsPanel extends ViolinFamilyPanel implements OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];

  protected readonly pal = ThemeService.getPalette('classicCremona');

  // the whole recipe rather than its params: the file's name, description and source are set here
  @Input({ required: true }) recipe!: ViolinFamilyRecipe;

  // the template's own handles on the solve; Angular templates only see the component's members
  protected readonly solveBody = solveBody;
  protected readonly solveBodyRatios = solveBodyRatios;
  protected readonly nearestFraction = nearestFraction;

  ngOnInit(): void {
    this.redraw();
  }

  override report(): void {
    reportFailures(solveBody(this.recipe.params).failures, 'Base Measurements');
  }

  public draw(): RenderLayer[] {
    let p = this.recipe.params;
    let body = solveBody(p);
    let m = solveMainBouts(p);
    let layers: RenderLayer[] = [];

    // the instrument as far as it's been drafted, in grey under the envelope
    if (m) {
      layers.push(renderMainBouts(p, m, this.pal, { showModuleArcs: false, renderOuterPath: false }, false, null));
      layers.push(renderSolveFailures(m.failures, this.pal.alert, true));
    }
    if (body.outer && body.ribBox) {
      layers.push(renderRect(body.outer, this.pal.neutral, 'none', STROKE_WEIGHT.guide));
      layers.push(renderRect(body.ribBox, this.pal.neutral, 'none', STROKE_WEIGHT.guide));
    }
    return layers;
  }
}
