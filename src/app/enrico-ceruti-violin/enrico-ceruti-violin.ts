import { ChangeDetectorRef, Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, Rectangle } from '../models/types';
import { greyOut, renderArcFromArc, renderArcFromArcFancy, renderCircle, renderCrosshair, renderDashedLine, renderDashLine, renderDistanceMeasurementLine, renderLine, renderRect } from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';
import { EnricoCerutiTemplate, CERUTI_TEMPLATES, EnricoCerutiParams } from './ceruti-types';
import { dimensionInfo, insetInfo, referenceInfo } from './ceruti-helpers';
import { angleFromCenter, circleCircleIntersections, flipAngleAboutYAxis, flipArcAboutY, flipCircleAboutY, interceptCirclesAndPoint, solveInscribedCircleAlongAxis } from '../helpers/draftMath';
import { calculateCenterBout, calculateCorners, calculateMainBouts } from './ceruti-calcs';

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
    { id: 'corners', label: 'Corners' },
    { id: 'centerBout', label: 'Center Bout' },
    { id: 'export', label: 'Export' },
  ] as const;

  offFactor = .5;
  off2Factor = .8;
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
    centerBoutLow: '#ad9267ff',
    centerBoutLowOff: greyOut('#ad9267ff', this.offFactor), //'#D6AA5F',
    centerBoutLowOff2: greyOut('#ad9267ff', this.off2Factor), //'#d2bb93ff',
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

  showModuleArcs: boolean = true;
  showModuleCircles: boolean = false;
  showAllArcs: boolean = false;
  showAllCircles: boolean = false;
  showBoundingBoxes: boolean = true;

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
    this.renderBounds(true)(g, ui);

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
      centerBout: () => this.changeCenterBout(),
      corners: () => this.changeCorners(),
    };
  }

  override canOpenPanel(panel: string): boolean {
    switch (panel) {
      case 'base': return true;
      case 'mainBouts': return this.hasBaseMeasurements();
      case 'corners': return this.hasMainBouts();
      case 'centerBout': return this.hasCorners();
      default: return false;
    }
  }

  // ===== Guards =====

  private hasBaseMeasurements(): boolean {
    const p = this.d.params;
    return p.width > 0 && p.height > 0 // && p.inset >= 0;
  }

  private hasMainBouts(): boolean {
    const b = this.d.params.bouts;
    return !!(b.U0 && b.U1 && b.L0 && b.L1);
  }

  private hasCorners(): boolean {
    const b = this.d.params.bouts;
    return !!(b.UC && b.LC);
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
      this.draftChange.emit([this.renderBounds(true)]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderBounds = (current: boolean) => (g: any, ui: any): void => {
    const h = this.d.params.height;
    const hw = this.d.params.width / 2;
    const inset = this.d.params.overhang + this.d.params.rib;
    let outerRect = new Rectangle({ x: -hw, y: 0 }, { x: hw, y: h });
    let insetRect = new Rectangle({ x: -hw + inset, y: inset }, { x: hw - inset, y: h - inset });

    if (current || this.showBoundingBoxes) {
      renderRect(outerRect, "grey")(g, ui);
      renderRect(insetRect, "grey")(g, ui);
    }
  };

  changeMainBouts(): void {
    this.debounce(() => safeRun(() => {
      calculateMainBouts(this.d.params);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([this.renderBounds(false), this.renderMainBouts(true)]);
    }));
  }


  renderMainBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;
    let inset = p.overhang + p.rib;

    let wideTopArc = arcFromCircle(p.bouts.U0, flipAngleAboutYAxis(p.bouts.U0.end), p.bouts.U0.end);
    let wideBottomArc = arcFromCircle(p.bouts.L0, flipAngleAboutYAxis(p.bouts.L0.end), p.bouts.L0.end);
    let mirroredU1Arc = flipArcAboutY(p.bouts.U1);
    let mirroredL1Arc = flipArcAboutY(p.bouts.L1);

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      renderArcFromArcFancy(wideTopArc, this.colors.upperBout)(g, ui);
      renderArcFromArcFancy(p.bouts.U1, this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(mirroredU1Arc, this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(wideBottomArc, this.colors.lowerBout)(g, ui);
      renderArcFromArcFancy(p.bouts.L1, this.colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(mirroredL1Arc, this.colors.lowerBoutOff)(g, ui);
    }
    else {
      renderArcFromArc(wideTopArc, this.colors.innerTrace)(g, ui);
      renderArcFromArc(p.bouts.U1, this.colors.innerTrace)(g, ui);
      renderArcFromArc(mirroredU1Arc, this.colors.innerTrace)(g, ui);
      renderArcFromArc(wideBottomArc, this.colors.innerTrace)(g, ui);
      renderArcFromArc(p.bouts.L1, this.colors.innerTrace)(g, ui);
      renderArcFromArc(mirroredL1Arc, this.colors.innerTrace)(g, ui);
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      let mirrorU1 = flipCircleAboutY(p.bouts.U1);
      let mirrorL1 = flipCircleAboutY(p.bouts.L1);
      renderCircle(p.bouts.U0!, this.colors.upperBout)(g, ui);
      renderCircle(p.bouts.U1!, this.colors.upperBout)(g, ui);
      renderCircle(mirrorU1, this.colors.upperBout)(g, ui);
      renderCircle(p.bouts.L1!, this.colors.lowerBout)(g, ui);
      renderCircle(mirrorL1, this.colors.lowerBout)(g, ui);
      renderCircle(p.bouts.L0!, this.colors.lowerBout)(g, ui);
    }

    let lowerBoutSquare = new Rectangle({ x: -p.bouts.LBW / 2, y: 0}, { x: p.bouts.LBW / 2, y:  p.bouts.LBW});
    let upperBoutSquare = new Rectangle({ x: -p.bouts.UBW / 2, y: p.height - p.bouts.UBW}, { x: p.bouts.UBW / 2, y:  p.height});

    if (this.showBoundingBoxes) {
      renderRect(lowerBoutSquare, this.colors.lowerBoutOff)(g, ui);
      renderLine({ x: -p.bouts.LBW / 2 + inset, y: 0 }, { x: - p.bouts.LBW / 2 + inset, y: p.bouts.LBW }, this.colors.lowerBoutOff)(g, ui);
      renderLine({ x: p.bouts.LBW / 2 - inset, y: 0 }, { x: p.bouts.LBW / 2 - inset, y: p.bouts.LBW }, this.colors.lowerBoutOff)(g, ui);
      renderRect(upperBoutSquare, this.colors.upperBoutOff)(g, ui);
      renderLine({ x: -p.bouts.UBW / 2 + inset, y: p.height - p.bouts.UBW }, { x: - p.bouts.UBW / 2 + inset, y: p.height }, this.colors.upperBoutOff)(g, ui);
      renderLine({ x: p.bouts.UBW / 2 - inset, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2 - inset, y: p.height }, this.colors.upperBoutOff)(g, ui);
    }
  }

  changeCorners(): void {
    this.debounce(() => safeRun(() => {
      calculateCorners(this.d.params);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds(false),
        this.renderMainBouts(false),
        this.renderCorners(true),
      ]);
    }));
  }

  renderCorners = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      renderCrosshair(p.bouts.UC!, this.colors.centerBoutUpOff)(g, ui);
      renderCrosshair(p.bouts.LC!, this.colors.centerBoutLowOff)(g, ui);
      renderCrosshair({ x: -p.bouts.UC!.x, y: p.bouts.UC!.y }, this.colors.centerBoutUpOff)(g, ui);
      renderCrosshair({ x: -p.bouts.LC!.x, y: p.bouts.LC!.y }, this.colors.centerBoutUpOff)(g, ui);

      renderArcFromArcFancy(p.bouts.L2!, this.colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(p.bouts.L3!, this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.L2!), this.colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.L3!), this.colors.centerBoutLow)(g, ui);

      renderArcFromArcFancy(p.bouts.U2!, this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(p.bouts.U3!, this.colors.centerBoutUp)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.U2!), this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.U3!), this.colors.centerBoutUp)(g, ui);
    }
    else {
      renderArcFromArc(p.bouts.L2!, this.colors.innerTrace)(g, ui);
      renderArcFromArc(p.bouts.L3!, this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.L2!), this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.L3!), this.colors.innerTrace)(g, ui);

      renderArcFromArc(p.bouts.U2!, this.colors.innerTrace)(g, ui);
      renderArcFromArc(p.bouts.U3!, this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.U2!), this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.U3!), this.colors.innerTrace)(g, ui);
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(p.bouts.L2!, this.colors.lowerBoutOff)(g, ui);
      renderCircle(p.bouts.L3!, this.colors.lowerBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.L2!), this.colors.lowerBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.L3!), this.colors.lowerBoutOff)(g, ui);
      renderCircle(p.bouts.U2!, this.colors.upperBoutOff)(g, ui);
      renderCircle(p.bouts.U3!, this.colors.upperBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.U2!), this.colors.upperBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.U3!), this.colors.upperBoutOff)(g, ui);
    }

  }


  changeCenterBout(): void {
    this.debounce(() => safeRun(() => {
      calculateCenterBout(this.d.params);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds(false),
        this.renderMainBouts(false),
        this.renderCorners(false),
        this.renderCenterBout(true),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderCenterBout = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;

    // if (!p.bouts.C0 || !p.bouts.CU || !p.bouts.CL) return;

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      renderArcFromArcFancy(p.bouts.CU, this.colors.centerBoutUp)(g, ui);
      renderArcFromArcFancy(p.bouts.CL, this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.CU), this.colors.centerBoutUp)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.CL), this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);
      renderDashedLine({x:-1000, y: p.bouts.C0.y}, {x:1000, y: p.bouts.C0.y}, this.colors.centerBoutOff2)(g, ui);
    } 
    else {
      renderArcFromArc(p.bouts.CU, this.colors.innerTrace)(g, ui);
      renderArcFromArc(p.bouts.CL, this.colors.innerTrace)(g, ui);
      renderArcFromArc(p.bouts.C0, this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.CU), this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.CL), this.colors.innerTrace)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.C0), this.colors.innerTrace)(g, ui);
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderCircle(p.bouts.CU, this.colors.centerBoutUp)(g, ui);
      renderCircle(p.bouts.CL, this.colors.centerBoutLow)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.CU), this.colors.centerBoutUp)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.CL), this.colors.centerBoutLow)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);

      // renderDistanceMeasurementLine(
      //   { x: -p.bouts.CBW / 2, y: p.bouts.C0.y },
      //   { x: p.bouts.CBW / 2, y: p.bouts.C0.y },
      //   `${p.bouts.CBW}mm`, this.colors.centerBoutOff2
      // )(g, ui);
    }
  }

}
