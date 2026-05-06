import { ChangeDetectorRef, Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Circle, Rectangle } from '../models/types';
import { greyOut, renderCircle, renderRect } from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';
import { EnricoCerutiTemplate, CERUTI_TEMPLATES, EnricoCerutiParams } from './ceruti-types';
import { dimensionInfo, insetInfo, referenceInfo } from './ceruti-helpers';
import { solveYOnCircleInset } from '../helpers/draftMath';

@Component({
  selector: 'app-enrico-ceruti-violin',
  imports: [FormsModule],
  templateUrl: './enrico-ceruti-violin.html',
  styleUrls: ['../sidebar.css', './enrico-ceruti-violin.css'],
})
export class EnricoCerutiViolin extends RecipeComponentBase {

  // ===== Static config =====

  protected readonly panelOrder = [
    { id: 'base', label: 'Base Measurements' },
    { id: 'mainBouts', label: 'Main Bouts' },
    { id: 'export', label: 'Export' },
  ] as const;

  offFactor = .5;
  off2Factor = .6;
  colors = {
    upperBout: '#4D8660',
    upperBoutOff: greyOut('#4D8660', this.offFactor), // '#6DA077',
    upperBoutOff2: greyOut('#4D8660', this.off2Factor), // '#97a49aff',
    centerBoutUp: '#C24B2E',
    centerBoutUpOff: greyOut('#C24B2E', this.offFactor), //'#E08A6B',
    centerBoutUpOff2: greyOut('#C24B2E', this.off2Factor), //'#dea793ff',
    centerBout: '#A97645',
    centerBoutOff: greyOut('#A97645', this.offFactor), //'#BC9368',
    centerBoutOff2: greyOut('#A97645', this.off2Factor), //'#bdab99ff',
    centerBoutLow: '#B8873A',
    centerBoutLowOff: greyOut('#B8873A', this.offFactor), //'#D6AA5F',
    centerBoutLowOff2: greyOut('#B8873A', this.off2Factor), //'#d2bb93ff',
    lowerBout: '#4D74A8',
    lowerBoutOff: greyOut('#4D74A8', this.offFactor), //'#7ba4dbff',
    lowerBoutOff2: greyOut('#4D74A8', this.off2Factor), //'#a6bcd9ff',
    innerTrace: '#a47272ff',
    outerTrace: '#b37f7fff',
    mouldTrace: '#81887eff',
  }

  // ===== Constructor =====

  constructor(private readonly cdr: ChangeDetectorRef) {
    super();
    this.initializePanelFlow(this.panelOrder);
    this.initializeDebounce(() => this.refreshBoundInputs());
  }

  // ===== Component state =====

  readonly templates: EnricoCerutiTemplate[] = CERUTI_TEMPLATES;
  override openPanel = 'base';
  override d: EnricoCerutiTemplate = {
    ...CERUTI_TEMPLATES[0],
  };

  showGuideLines = true;
  showAllCircles = true;

  get selectedTemplateKey(): string {
    const current = JSON.stringify(this.d.params);
    return this.templates.find(t => JSON.stringify(t.params) === current)?.key ?? '';
  }

  loadTemplate(key: string): void {
    if (!key) return;
    const template = this.templates.find(t => t.key === key);
    if (!template) return;
    this.loadFile = template;
    this.referenceImageChange.emit(template.referenceImage ?? null);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  // ===== Inputs & lifecycle =====

  @Input() set newFile(v: boolean) {
    if (v) {
      this.d = {
        ...CERUTI_TEMPLATES[0],
      };
      this.openPanel = 'base';
      this.draftChange.emit([this.firstRender]);
    }
  }

  override firstRender = (g: any, ui: any): void => {
    this.setBounds.emit({
      pt1: { x: -this.d.params.width / 2, y: 0 },
      pt2: { x: this.d.params.width / 2, y: this.d.params.height },
    });
    this.renderBounds(g, ui);

    let recipeData = sessionStorage.getItem('recipeData');
    if (!recipeData) {
      let selectedTemplate = this.templates.find(t => t.key === this.selectedTemplateKey) ?? this.templates[0];
      this.referenceImageChange.emit(selectedTemplate.referenceImage ?? null);
    }
  };

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  // ===== UI event handlers =====

  @HostListener('keydown', ['$event'])
  onHostKeyDown(e: KeyboardEvent) {
    this.debounceController?.markImmediateFromKey(e);
  }

  @HostListener('mousedown', ['$event'])
  onHostMouseDown(e: MouseEvent) {
    this.debounceController?.markImmediateFromMouse(e);
  }

  // ===== Panel system =====

  override getActivationHandlers(): Record<string, () => void> {
    return {
      base: () => this.changeBaseMeasurements(),
      mainBouts: () => this.changeMainBouts(),
    };
  }

  override canOpenPanel(panel: string): boolean {
    switch (panel) {
      case 'base': return true;
      case 'mainBouts': return this.hasBaseMeasurements();
      default: return false;
    }
  }

  // ===== Guards =====

  private hasBaseMeasurements(): boolean {
    const p = this.d.params;
    return p.width > 0 && p.height > 0 // && p.inset >= 0;
  }

  // ===== Shared helpers =====

  protected override refreshBoundInputs(): void {
    queueMicrotask(() => {
      this.cdr.markForCheck();
    });
  }

  protected clamp(
    key: keyof EnricoCerutiParams,
    min: number,
    max = Infinity,
    tooSmallMsg?: string,
    tooBigMsg?: string,
  ): void {
    clampParam(this.d.params, key, min, max, tooSmallMsg, tooBigMsg);
  }

  // ===== Basic UI funcs =====

  onInfoClick(name: string): void {
    if (name === 'referenceImage') referenceInfo()
    else if (name === 'inset') insetInfo()
    else if (name === 'dimensions') dimensionInfo();
  }

  // ===== Change pipeline =====

  changeBaseMeasurements(): void {
    this.debounce(() => safeRun(() => {
      this.clamp('height', 10, 3000, 'Height must be > 10mm', 'Height must be < 3000mm');
      this.clamp('width', 10, 3000, 'Width must be > 10mm', 'Width must be < 3000mm');
      this.clamp('rib', 0.1, 5, 'Rib thickness must be > 0.5mm', 'Rib thickness must be < 10mm');
      this.clamp('overhang', 1, 10, 'Overhang must be >= 1mm', 'Overhang must be < 10mm');

      this.d.params.ratios.HtoW = this.d.params.height / this.d.params.width;

      this.setBounds.emit({
        pt1: { x: -this.d.params.width / 2, y: 0 },
        pt2: { x: this.d.params.width / 2, y: this.d.params.height },
      });
      this.draftChange.emit([this.renderBounds]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderBounds = (g: any, ui: any): void => {
    const h = this.d.params.height;
    const hw = this.d.params.width / 2;
    const inset = this.d.params.overhang + this.d.params.rib;
    let outerRect = new Rectangle({ x: -hw, y: 0 }, { x: hw, y: h });
    let insetRect = new Rectangle({ x: -hw + inset, y: inset }, { x: hw - inset, y: h - inset });
    renderRect(outerRect, "grey")(g, ui);
    renderRect(insetRect, "grey")(g, ui);
  };


  changeMainBouts(): void {
    this.debounce(() => safeRun(() => {
      let p = this.d.params;
      // in this situation we need to initialize the bouts
      if (!p.bouts.U0) {
        let inset = p.overhang + p.rib;

        p.bouts.LBW = p.width - 2 * inset;
        p.bouts.UBW = Math.round(p.bouts.LBW * p.ratios.UBtoLB); 

        let U0R = Math.round((p.height - 2 * inset) * p.ratios.U0toH);
          p.bouts.U0 = new Circle(0, U0R, U0R);
        let U1R = Math.round(p.bouts.UBW * p.ratios.U1toUBW);
          p.bouts.U1 = new Circle(0, p.bouts.UBW - U1R, U1R);

        let L0R = Math.round((p.height - 2 * inset) * p.ratios.L0toH);
          p.bouts.L0 = new Circle(0, inset + L0R, L0R);
        let L1R = Math.round(p.bouts.LBW * p.ratios.L1toLBW);
          p.bouts.L1 = new Circle(0, L1R, L1R);
      }

      this.calculateMainBouts();

      this.draftChange.emit([this.renderBounds, this.renderMainBouts]);

    }));
  }

  calculateMainBouts(): void {
    let p = this.d.params;
    let inset = p.overhang + p.rib;
    
    p.bouts.U0.y = p.height - inset - p.bouts.U0.r;
    p.bouts.L0.y = inset + p.bouts.L0.r;
    
    p.bouts.U1.x = p.bouts.UBW/2- p.bouts.U1.r;
    p.bouts.U1.y = solveYOnCircleInset(p.bouts.U0, p.bouts.U1.x, p.bouts.U1.r, true);

    p.bouts.L1.x = p.bouts.LBW/2 - p.bouts.L1.r;
    p.bouts.L1.y = solveYOnCircleInset(p.bouts.L0, p.bouts.L1.x, p.bouts.L1.r, false);
  }

  renderMainBouts = (g:any, ui:any): void => {
    let p = this.d.params;

    renderCircle(p.bouts.U0!, this.colors.upperBout)(g, ui);
    renderCircle(p.bouts.L0!, this.colors.lowerBout)(g, ui);
    renderCircle(p.bouts.U1!, this.colors.centerBoutUp)(g, ui);
    renderCircle(p.bouts.L1!, this.colors.centerBoutLow)(g, ui);
  }


  // === UI helpers ===
  nearestFraction(value: number, maxNumerator: number = 21, maxDenominator: number = 16): string {
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

    if (isExact) return fraction;
    if (isVeryClose) return `≈ ${fraction}`;
    return `~ ${fraction}`; // rough approximation
  }

}
