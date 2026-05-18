import { AfterViewInit, Component, output } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { Pt, RecipeInterface, ReferenceImage } from '../models/types';
import { PanelFlow, PanelDefinition } from '../helpers/panel-flow';
import { DebounceController } from '../helpers/debounce-controller';

export interface NamedConstant {
  label: string;
  value: number;
  tolerance?: number;
}

@Component({
  selector: 'app-recipe-base',
  imports: [],
  templateUrl: './recipe-base.html',
  styleUrl: './recipe-base.css',
})

export abstract class RecipeComponentBase implements AfterViewInit {
  static readonly DEFAULT_NAMED_CONSTANTS: readonly NamedConstant[] = [
    // { label: 'π', value: Math.PI },
    { label: 'φ', value: (1 + Math.sqrt(5)) / 2 },
    { label: '√2', value: Math.SQRT2 },
  ];

  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();
  @Output() setBounds = new EventEmitter<{pt1: Pt, pt2: Pt}>();
  @Output() referenceImageChange = new EventEmitter<ReferenceImage | null>();

  @Input() set loadFile(file: RecipeInterface | undefined) {
    if (file) {
      this.d = file;
      this.draftChange.emit([this.firstRender]);
    }
  }
  @Input() set referenceImageParams(img: ReferenceImage | null | undefined) {
    this.d.params = this.d.params || {};
    if (img) this.d.referenceImage = img;
    else delete this.d.referenceImage;
  }

  private _saveTick = 0;

  @Input() set saveTick(v: number) {
    if (v && v !== this._saveTick) {
      this._saveTick = v;
      this.saveToDisk();
    }
  }
  
  d: RecipeInterface = {
    recipeName: "",
    fileName: "tst",
    version: "",
    params: undefined,
    paths: undefined
  }

  openPanel: string = "base";

  // ===== Lifecycle & resource management =====
  protected _destroyed = false;
  protected debounceController?: DebounceController;

  protected initializeDebounce(callback: () => void): void {
    this.debounceController = new DebounceController(callback);
  }

  protected debounce(fn: () => void, delay = 1800): void {
    this.debounceController?.run(fn, delay);
  }

  protected refreshBoundInputs(): void {
    // Override in subclasses if needed (e.g., for change detection)
  }

  // ===== Panel navigation system =====
  protected panelFlow: PanelFlow<string> | null = null;

  protected initializePanelFlow(panelOrder: readonly PanelDefinition<string>[]): void {
    this.panelFlow = new PanelFlow<string>(panelOrder, (panel) => this.canOpenPanel(panel));
    this.panelFlow.refreshEnabledPanels();
  }

  protected abstract canOpenPanel(panel: string): boolean;

  protected abstract getActivationHandlers(): Record<string, () => void>;

  protected isPanelEnabled(panel: string): boolean {
    return this.panelFlow?.isEnabled(panel) ?? false;
  }

  protected onPanelSelect(panel: string): void {
    if (!panel || !this.panelFlow) return;
    this.panelFlow.refreshEnabledPanels();
    const selected = this.panelFlow.select(panel);
    if (!selected) return;
    this.activatePanel(selected);
  }

  protected canStepPanel(direction: 1 | -1 | number): boolean {
    return this.panelFlow?.canStep(this.openPanel, direction) ?? false;
  }

  protected stepPanel(direction: 1 | -1 | number): void {
    if (!this.panelFlow) return;
    this.panelFlow.refreshEnabledPanels();
    const nextPanel = this.panelFlow.step(this.openPanel, direction);
    if (!nextPanel) return;
    this.activatePanel(nextPanel);
  }

  protected get panelProgressMax(): number {
    return this.panelFlow?.getProgress(this.openPanel).total ?? 1;
  }

  protected get panelProgressNow(): number {
    return this.panelFlow?.getProgress(this.openPanel).current ?? 1;
  }

  protected get panelProgressPercent(): number {
    return this.panelFlow?.getProgress(this.openPanel).percent ?? 100;
  }

  protected activatePanel(panel: string): void {
    if (!this.isPanelEnabled(panel)) return;
    this.openPanel = panel;
    const handlers = this.getActivationHandlers();
    handlers[panel]?.();
  }


 ngOnInit() {
    const saved = sessionStorage.getItem('recipeData');
    if (saved) {
      try {
        let recipeData = JSON.parse(saved);
        if (this.d.recipeName == recipeData.recipeName) {
          this.d = recipeData;
          this.panelFlow?.refreshEnabledPanels();
          // Restore the last open panel if it's still enabled
          if (recipeData.openPanel && this.isPanelEnabled(recipeData.openPanel)) {
            this.openPanel = recipeData.openPanel;
          }
        } else {
          console.warn('Saved recipe does not match current recipe. Ignoring saved data.');
        }
      } catch (e) {
        console.error('Failed to load from sessionStorage', e);
      }
    }
  }

  ngAfterViewInit() {
    queueMicrotask(() => {
      this.draftChange.emit([this.firstRender]);
    });
  }

  ngOnDestroy() {
    this._destroyed = true;
    this.debounceController?.destroy();
    sessionStorage.setItem('recipeData', JSON.stringify({ ...this.d, openPanel: this.openPanel }));
  }

  firstRender(canvas: any, ui: any) {
  }

  private saveToDisk() {
    const safeName = (this.d.fileName?.trim() || 'untitled') + (this.d.fileName?.endsWith('.json') ? '' : '.json');
    const limitedJson = {
      ...this.d,
      paths: []
      
    }
    const json = JSON.stringify(this.d, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  onToggle(panel: string, event: Event) {
    const details = event.target as HTMLDetailsElement;
    if (details.open) {
      this.openPanel = panel;
    }
  }

  addCalcs(calcs: { name: string, d: any }[]) {
    this.d.paths = this.d.paths || [];
    for (const entry of calcs) {
      const idx = this.d.paths.findIndex((c: any) => c.name === entry.name);
      if (idx === -1) this.d.paths.push(entry);
      else this.d.paths[idx] = entry;
    }
  }

  onReferenceImageChange(img: ReferenceImage | null) {
    this.d.params = this.d.params || {};
    if (img) this.d.referenceImage = img;
    else delete this.d.referenceImage;

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

    // reference image controls
  async onReferenceFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const dataUrl = await this.readFileAsDataUrl(file);

    // Load it once to get natural dimensions
    const { w, h } = await this.getImageSize(dataUrl);

    // Simple, predictable default:
    // - size in "mm units" = natural px (same as your current approach)
    // - place centered on X, start near Y=0
    const width = w;
    const height = h;

    this.d.referenceImage = {
      href: dataUrl,
      "xlink:href": dataUrl,
      x: -width / 2,
      y: 0,
      width,
      height,
    };

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    this.referenceImageChange.emit(this.d.referenceImage);

    // // Optional: auto-enable showing it when user uploads
    // this.showReferenceImage = true;

    // this.draw();

    // optional: allow re-uploading same file by clearing the input
    input.value = '';

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

    private readFileAsDataUrl(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
  }

  private getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  nearestFraction(
    value: number,
    maxNumerator: number = 21,
    maxDenominator: number = 16,
    namedConstants: ReadonlyArray<NamedConstant> = RecipeComponentBase.DEFAULT_NAMED_CONSTANTS,
  ): string {
    const denominatorLimit = Math.max(1, Math.floor(maxDenominator));
    const numeratorLimit = Math.max(1, Math.floor(maxNumerator));

    let bestNumerator = Math.round(value);
    bestNumerator = Math.max(-numeratorLimit, Math.min(numeratorLimit, bestNumerator));

    let bestDenominator = 1;
    let smallestError = Math.abs(value - bestNumerator / bestDenominator);

    for (let denominator = 1; denominator <= denominatorLimit; denominator++) {
      const idealNumerator = Math.round(value * denominator);
      const numerator = Math.max(-numeratorLimit, Math.min(numeratorLimit, idealNumerator));
      const error = Math.abs(value - numerator / denominator);

      if (error < smallestError) {
        bestNumerator = numerator;
        bestDenominator = denominator;
        smallestError = error;
      }
    }

    const fraction = `${bestNumerator}/${bestDenominator}`;
    const isExact = smallestError < 0.001;
    const isVeryClose = smallestError < 0.01;

    const defaultConstantTolerance = 0.005;
    type NamedMatch = { expression: string; error: number; tolerance: number };
    const namedCandidates: NamedMatch[] = [];

    const usableConstants = namedConstants.filter(
      (constant) => Number.isFinite(constant.value) && !!constant.label?.trim() && constant.value !== 0,
    );

    for (const constant of usableConstants) {
      const label = constant.label.trim();
      const constantTolerance = constant.tolerance ?? defaultConstantTolerance;

      // value ≈ constant
      namedCandidates.push({
        expression: label,
        error: Math.abs(value - constant.value),
        tolerance: constantTolerance,
      });

      // value ≈ integer / constant
      for (let numerator = -numeratorLimit; numerator <= numeratorLimit; numerator++) {
        const approx = numerator / constant.value;
        namedCandidates.push({
          expression: `${numerator}/${label}`,
          error: Math.abs(value - approx),
          tolerance: constantTolerance,
        });
      }

      // value ≈ constant / integer
      for (let denominator = 1; denominator <= denominatorLimit; denominator++) {
        const approx = constant.value / denominator;
        namedCandidates.push({
          expression: `${label}/${denominator}`,
          error: Math.abs(value - approx),
          tolerance: constantTolerance,
        });
      }
    }

    const nearestNamedMatch = namedCandidates.sort((a, b) => a.error - b.error)[0];
    const maybeNamedTag = nearestNamedMatch && nearestNamedMatch.error <= nearestNamedMatch.tolerance
      ? nearestNamedMatch.expression
      : '';
    const absoluteImprovement = nearestNamedMatch ? (smallestError - nearestNamedMatch.error) : 0;
    const relativeImprovement = nearestNamedMatch && smallestError > 0
      ? absoluteImprovement / smallestError
      : 0;

    // Require a meaningful improvement over the fraction to prefer the named constant, to avoid cluttering with named tags that are only slightly better than a simple fraction
    const isNamedBetterThanFraction = !!nearestNamedMatch
      && absoluteImprovement > 0.002
      && relativeImprovement > 0.25;

    if (maybeNamedTag && isNamedBetterThanFraction) {
      if (nearestNamedMatch.error < 0.001) return maybeNamedTag;
      if (nearestNamedMatch.error < 0.01) return `≈ ${maybeNamedTag}`;
      return `~ ${maybeNamedTag}`;
    }

    if (isExact) return fraction;
    if (isVeryClose) return `≈ ${fraction}`;
    return `~ ${fraction}`; // rough approximation
  }

}