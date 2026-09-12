import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { RecipeToolbarComponent } from '../recipe-toolbar/recipe-toolbar';
import { NumberStepperDirective } from '../shared/number-stepper';
import { Arc, arcFromCircle, Circle, RecipeInterface } from '../models/types';
import { circleCircleIntersections } from '../helpers/math/draftMath';
import {
  angleFromCenter, flipArcAboutY, flipCircleAboutY, flipPointAboutY, offsetCircleRadius, pointOnCircle,
} from '../helpers/math/simpleGeometry';
import {
  greyOut, renderArcFromArc, renderArcFromArcFancy, renderCircle, renderCrosshair, renderSmallCrosshair,
} from '../helpers/renderFuncs';
import { RECIPE_KEY, writeWorkingState } from '../helpers/workingStorage';
import { error } from '../shared/message-emitter';
import { FOUR_CIRCLES_DEFAULTS, FourCircles, FourCirclesParams, FourCirclesViewFlags } from './hello-world-types';

const COLORS = {
  upper: '#4D8660',
  center: '#A97645',
  lower: '#4D74A8',
  outline: '#868484',
} as const;

const blankRecipe = (): RecipeInterface => ({
  recipeName: 'hello-world',
  fileName: 'hello-world',
  version: '1',
  params: { ...FOUR_CIRCLES_DEFAULTS },
  paths: undefined,
});

@Component({
  selector: 'app-hello-world-recipe',
  standalone: true,
  imports: [FormsModule, RecipeToolbarComponent, NumberStepperDirective],
  templateUrl: './hello-world-recipe.html',
  styleUrls: ['../sidebar.css', './hello-world-recipe.css'],
})
export class HelloWorldRecipe extends RecipeComponentBase {
  // a field initializer, not a lifecycle hook: the base class restores a session in ngOnInit by
  // matching the stored recipeName against this one, so it has to be set before then
  override d: RecipeInterface = blankRecipe();
  override openPanel = 'fourCircles';

  protected readonly panelOrder = [{ id: 'fourCircles', label: 'Four Circles' }] as const;

  flags: FourCirclesViewFlags = { showCircles: false, showArcs: true };

  constructor() {
    super();
    // the panel list also reaches the canvas, which is what lets a reference image be scoped to a panel
    this.initializePanelFlow(this.panelOrder);
    // through setOpenPanel, never by assignment, so panel-scoped reference images filter from the first draw
    this.setOpenPanel(this.openPanel);
    this.initializeDebounce(() => this.render());
  }

  protected override canOpenPanel(_panel: string): boolean {
    return true;
  }

  // how undo and redo reach the canvas
  protected override onPanelActivated(_panel: string): void {
    this.render();
  }

  // the canvas calls this on mount and after every load
  override firstRender = (): void => this.render();

  // a loaded file is a new drawing, so it gets framed. an edit never is: the user set that view
  override loadFile(file: RecipeInterface): void {
    super.loadFile(file);
    this.requestFit.emit();
  }

  onNewClick(): void {
    this.loadFile(blankRecipe());
  }

  // debounced, so a dragged spinner doesn't re-solve on every tick or push an undo entry per keystroke
  onChange(): void {
    this.debounce(() => {this.render()});
  }

  // a view choice, not an edit: no debounce, no undo entry
  toggle(key: keyof FourCirclesViewFlags): void {
    this.flags[key] = !this.flags[key];
    this.render();
  }

  private render(): void {
    try {
      const solved = solveFourCircles(this.d.params as FourCirclesParams);
      this.draftChange.emit([renderFourCircles(solved, this.flags)]);
    } catch (e) {
      error(e instanceof Error ? e.message : String(e), 'Four Circles');
      this.draftChange.emit([]);
    }
    writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
  }
}

export function solveFourCircles(p: FourCirclesParams): FourCircles {
  if (p.upperR <= 0 || p.centerR <= 0 || p.lowerR <= 0) throw new Error('Every radius must be greater than zero.');
  const upper = new Circle(0, p.bodyLength - p.upperR, p.upperR);
  const lower = new Circle(0, p.lowerR, p.lowerR);
  if (upper.y <= lower.y) throw new Error('The upper and lower radii add up to more than the body length, leaving no room for a waist.');

  // the centre circle touches both bouts from outside, so its centre sits exactly centerR further out
  // than each bout's edge. grow both bouts by centerR and their crossing is that centre: the same
  // compass construction on paper, and the same intersection helper the violin model uses.
  const hits = circleCircleIntersections(offsetCircleRadius(upper, p.centerR), offsetCircleRadius(lower, p.centerR));
  const right = hits.find(h => h.x > 0);
  if (!right) throw new Error('The centre circle cannot reach both bouts. Grow one of the three radii or shorten the body.');
  const center = new Circle(right.x, right.y, p.centerR);

  // every renderer of Arc draws the minor sweep between its two angles. the upper and lower arcs
  // would each run past 180° drawn whole, so each side is solved to the centre line and mirrored.
  return {
    upper: arcFromCircle(upper, angleFromCenter(upper, center), Math.PI / 2),
    center: arcFromCircle(center, angleFromCenter(center, upper), angleFromCenter(center, lower)),
    lower: arcFromCircle(lower, 3 * Math.PI / 2, angleFromCenter(lower, center)),
  };
}

export const renderFourCircles = (s: FourCircles, flags: FourCirclesViewFlags) => (g: any, ui: any): void => {
  const arcs: Array<[Arc, string]> = [[s.upper, COLORS.upper], [s.center, COLORS.center], [s.lower, COLORS.lower]];

  if (flags.showCircles) {
    renderCircle(s.upper, greyOut(COLORS.upper, 0.5))(g, ui);
    renderCircle(s.center, greyOut(COLORS.center, 0.5), true)(g, ui);
    renderCircle(s.lower, greyOut(COLORS.lower, 0.5))(g, ui);
    for (const [arc, color] of arcs) renderCrosshair(arc, color)(g, ui);
    renderCrosshair(flipCircleAboutY(s.center), COLORS.center)(g, ui);
    // where the circles touch: the upper arc starts there and the lower arc ends there
    for (const t of [pointOnCircle(s.upper, s.upper.start), pointOnCircle(s.lower, s.lower.end)]) {
      renderSmallCrosshair(t, COLORS.outline)(g, ui);
      renderSmallCrosshair(flipPointAboutY(t), COLORS.outline)(g, ui);
    }
  }

   for (const [arc, color] of arcs) {
      renderArcFromArc(arc, color, 2)(g, ui);
      renderArcFromArc(flipArcAboutY(arc), color, 2)(g, ui);
    }

  if (flags.showArcs) {
    for (const [arc, color] of arcs) {
      renderArcFromArcFancy(arc, color)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(arc), color)(g, ui);
    }
  }
};
