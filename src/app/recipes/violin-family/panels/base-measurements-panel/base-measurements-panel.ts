import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { showFieldHelp } from '../../../../docs/field-help';
import { Pt, Rectangle } from '../../../../models/types';
import { renderRect, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun } from '../../../../helpers/validators';
import { nearestFraction } from '../../../../helpers/nearestFraction';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { ThemeService } from '../../../../theme/theme.service';
import {
  BodyFailure, BodyKey, BodySolve, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyRatios,
  ViolinFamilyRecipe, ViolinFamilyToggleKey,
} from '../../violin-family-types';
import { renderMainBouts, solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { renderCorners, solveCorners } from '../corners-panel/corners-panel';
import { renderCenterBout, solveCenterBout } from '../center-bout-panel/center-bout-panel';

// The body's envelope: the box the outline is drawn inside, and the rib line's box inset from it.
// Panel, then solve and ratios.

@Component({
  selector: 'app-vf-base-measurements-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './base-measurements-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class BaseMeasurementsPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];

  // the whole recipe rather than its params: the file's name, description and source are set here
  @Input({ required: true }) recipe!: ViolinFamilyRecipe;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  // what the last draw solved; the template reads these rather than solving again
  body!: BodySolve;
  ratios: Partial<ViolinFamilyRatios> = {};

  ngOnInit(): void {
    this.draw();
  }

  // every field calls this: the shell seeds the stage and schedules the commit (the undo entry, the
  // session write, report()) for when the typing stops, and the picture catches up now
  edited(): void {
    this.edit.emit();
    this.draw();
  }

  ratio(key: keyof ViolinFamilyRatios): string {
    let value = this.ratios[key];
    return Number.isFinite(value) ? nearestFraction(value!) : '–';
  }

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  report(): void {
    reportFailures(this.body.failures, 'Base Measurements');
  }

  draw(): void {
    safeRun(() => {
      let p = this.recipe.params;
      this.body = solveBody(p);
      this.ratios = solveBodyRatios(p);
      let m = solveMainBouts(p);
      let c = solveCorners(p);
      let cb = solveCenterBout(p);
      let layers: RenderLayer[] = [];

      // the instrument as far as it's been drafted, in grey under the envelope. Once there are
      // corners, the bouts end where the corners take over
      if (m) {
        layers.push(renderMainBouts(p, c ? { ...m, U1: c.U1, L1: c.L1 } : m, this.pal, { showModuleArcs: false, showAllArcs: false, renderOuterPath: false }, false, null));
        layers.push(renderSolveFailures(m.failures, this.pal.alert, true));
      }
      if (c) {
        layers.push(renderCorners(p, c, this.pal, { showModuleArcs: false, showAllArcs: false, renderOuterPath: false }, false, null));
        layers.push(renderSolveFailures(c.failures, this.pal.alert, true));
      }
      if (cb) {
        layers.push(renderCenterBout(p, cb, this.pal, { showModuleArcs: false, showAllArcs: false, renderOuterPath: false }, false, null));
        layers.push(renderSolveFailures(cb.failures, this.pal.alert, true));
      }
      if (this.body.outer && this.body.ribBox) {
        layers.push(renderRect(this.body.outer, this.pal.neutral, 'none', STROKE_WEIGHT.guide));
        layers.push(renderRect(this.body.ribBox, this.pal.neutral, 'none', STROKE_WEIGHT.guide));
      }
      this.drawn.emit(layers);
    });
  }
}

// a measurement that's missing or out of range is reported and the boxes aren't drawn; the field
// keeps what was typed
export function solveBody(p: ViolinFamilyParams): BodySolve {
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
}

function measure(failures: BodyFailure[], key: BodyKey, label: string, value: number, min: number, max: number): void {
  let message =
    !Number.isFinite(value) ? `${label} needs a value.` :
    value < min ? `${label} must be at least ${min}mm.` :
    value > max ? `${label} must be under ${max}mm.` :
    null;
  if (message) failures.push({ message, unsolved: [key], circles: [], segments: [] });
}

export function solveBodyRatios(p: ViolinFamilyParams): Partial<ViolinFamilyRatios> {
  return { HtoW: p.body.height / p.body.width };
}
