import { ChangeDetectorRef, Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Arc, arcFromCircle, arcFromCircleAndPoints, Circle, Rectangle } from '../models/types';
import { greyOut, renderArcFromArc, renderArcFromArcFancy, renderCircle, renderCrosshair, renderDashLine, renderDistanceMeasurementLine, renderRect } from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';
import { EnricoCerutiTemplate, CERUTI_TEMPLATES, EnricoCerutiParams } from './ceruti-types';
import { dimensionInfo, insetInfo, referenceInfo } from './ceruti-helpers';
import { angleFromCenter, circleCircleIntersections, flipAngleAboutYAxis, flipArcAboutY, flipCircleAboutY, interceptCirclesAndPoint, solveInscribedCircleAlongAxis } from '../helpers/draftMath';

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

  offFactor = .7;
  off2Factor = .9;
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

  showModuleArcs: boolean = true;
  showModuleCircles: boolean = false;
  showAllArcs: boolean = false;
  showAllCircles: boolean = false;

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
      this.calculateMainBouts();
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([this.renderBounds, this.renderMainBouts(true)]);
    }));
  }

  calculateMainBouts(): void {
    let p = this.d.params;
    let inset = p.overhang + p.rib;

    // initialize bouts if not already done
    if (!p.bouts.U0) {
      let inset = p.overhang + p.rib;

      p.bouts.LBW = p.width - 2 * inset;
      p.bouts.UBW = Math.round(p.bouts.LBW * p.ratios.UBtoLB);

      let U0R = Math.round((p.height - 2 * inset) * p.ratios.U0toH);
      p.bouts.U0 = new Arc(0, U0R, U0R);
      let U1R = Math.round(p.bouts.UBW * p.ratios.U1toUBW / 2);
      p.bouts.U1 = new Arc(0, p.bouts.UBW - U1R, U1R);

      let L0R = Math.round((p.height - 2 * inset) * p.ratios.L0toH);
      p.bouts.L0 = new Arc(0, inset + L0R, L0R);
      let L1R = Math.round(p.bouts.LBW * p.ratios.L1toLBW / 2);
      p.bouts.L1 = new Arc(0, L1R, L1R);
    }

    // recalcuate display ratios
    p.ratios.UBtoLB = p.bouts.UBW / p.bouts.LBW;
    p.ratios.U0toH = p.bouts.U0.r / (p.height - 2 * inset);
    p.ratios.U1toUBW = 2 * p.bouts.U1.r / p.bouts.UBW;
    p.ratios.L0toH = p.bouts.L0.r / (p.height - 2 * inset);
    p.ratios.L1toLBW = 2 * p.bouts.L1.r / p.bouts.LBW;

    p.bouts.U0.y = p.height - inset - p.bouts.U0.r;
    p.bouts.L0.y = inset + p.bouts.L0.r;
    p.bouts.U1.x = p.bouts.UBW / 2 - p.bouts.U1.r;
    p.bouts.U1.y = solveInscribedCircleAlongAxis(p.bouts.U0, p.bouts.U1.r, "x", p.bouts.U1.x, true);
    p.bouts.L1.x = p.bouts.LBW / 2 - p.bouts.L1.r;
    p.bouts.L1.y = solveInscribedCircleAlongAxis(p.bouts.L0, p.bouts.L1.r, "x", p.bouts.L1.x, false);

    let upperIntersect = circleCircleIntersections(p.bouts.U0, p.bouts.U1);
    let U0Angle = angleFromCenter(p.bouts.U0, upperIntersect[0]);
    let U1Angle = angleFromCenter(p.bouts.U1, upperIntersect[0]);

    p.bouts.U0 = arcFromCircle(p.bouts.U0, 1 / 2 * Math.PI, U0Angle);
    p.bouts.U1 = arcFromCircle(p.bouts.U1, U1Angle, 0);

    let lowerIntersect = circleCircleIntersections(p.bouts.L0, p.bouts.L1);
    let L0Angle = angleFromCenter(p.bouts.L0, lowerIntersect[0]);
    let L1Angle = angleFromCenter(p.bouts.L1, lowerIntersect[0]);

    p.bouts.L0 = arcFromCircle(p.bouts.L0, 3 / 2 * Math.PI, L0Angle);
    p.bouts.L1 = arcFromCircle(p.bouts.L1, L1Angle, 0);
  }

  renderMainBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;

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
      renderArcFromArc(wideTopArc, this.colors.upperBout)(g, ui);
      renderArcFromArc(p.bouts.U1, this.colors.upperBout)(g, ui);
      renderArcFromArc(mirroredU1Arc, this.colors.upperBout)(g, ui);
      renderArcFromArc(wideBottomArc, this.colors.lowerBout)(g, ui);
      renderArcFromArc(p.bouts.L1, this.colors.lowerBout)(g, ui);
      renderArcFromArc(mirroredL1Arc, this.colors.lowerBout)(g, ui);
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

  }

  changeCorners(): void {
    this.debounce(() => safeRun(() => {
      this.calculateCorners();
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds,
        this.renderMainBouts(false),
        this.renderCorners(true),
      ]);
    }));
  }

  calculateCorners(): void {
    let p = this.d.params;

    // Placeholder initialization only.
    // Intentionally no corner geometry calculations here.
    if (!p.bouts.UC) {
      p.bouts.UC = { x: Math.round(p.bouts.UBW / 2 * p.ratios.UCXtoUBW), y: Math.round(p.height * p.ratios.UCYtoH) };
      p.bouts.LC = { x: Math.round(p.bouts.LBW / 2 * p.ratios.LCXtoLBW), y: Math.round(p.height * p.ratios.LCYtoH) };
    }

    let U2R = p.bouts.U2?.r ?? Math.round(p.bouts.UBW * p.ratios.U2toUBW);
    p.bouts.U2 = new Arc(p.bouts.UBW / 2 - U2R, p.bouts.U1.y, U2R);
    let L2R = p.bouts.L2?.r ?? Math.round(p.bouts.LBW * p.ratios.L2toLBW);
    p.bouts.L2 = new Arc(p.bouts.LBW / 2 - L2R, p.bouts.L1.y, L2R);

    let U3R = p.bouts.U3?.r ?? Math.round(p.bouts.UBW * p.ratios.U3toUBW);
    p.bouts.U3 = arcFromCircle(interceptCirclesAndPoint(p.bouts.U2, p.bouts.UC, U3R).sort((a, b) => a.y - b.y)[1]);

    let L3R = p.bouts.L3?.r ?? Math.round(p.bouts.LBW * p.ratios.L3toLBW);
    p.bouts.L3 = arcFromCircle(interceptCirclesAndPoint(p.bouts.L2, p.bouts.LC, L3R).sort((a, b) => a.y - b.y)[0]);

    let UIntersect = circleCircleIntersections(p.bouts.U2, p.bouts.U3).sort((a, b) => a.y - b.y)[1];
    let U2Angle = angleFromCenter(p.bouts.U2, UIntersect);
    p.bouts.U2 = arcFromCircle(p.bouts.U2, 0, U2Angle);
    p.bouts.U3 = arcFromCircleAndPoints(p.bouts.U3, UIntersect, p.bouts.UC);

    let LIntersect = circleCircleIntersections(p.bouts.L2, p.bouts.L3).sort((a, b) => a.y - b.y)[0];
    let L2Angle = angleFromCenter(p.bouts.L2, LIntersect);
    p.bouts.L2 = arcFromCircle(p.bouts.L2, 0, L2Angle);
    p.bouts.L3 = arcFromCircleAndPoints(p.bouts.L3, LIntersect, p.bouts.LC);

    // recalculate display ratios
    p.ratios.U2toUBW = p.bouts.U2.r / p.bouts.UBW;
    p.ratios.U3toUBW = p.bouts.U3.r / p.bouts.UBW;
    p.ratios.L2toLBW = p.bouts.L2.r / p.bouts.LBW;
    p.ratios.L3toLBW = p.bouts.L3.r / p.bouts.LBW;
  }

  renderCorners = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      renderCrosshair(p.bouts.UC!, this.colors.centerBoutUp)(g, ui);
      renderCrosshair(p.bouts.LC!, this.colors.centerBoutLow)(g, ui);
      renderCrosshair({ x: -p.bouts.UC!.x, y: p.bouts.UC!.y }, this.colors.centerBoutUp)(g, ui);
      renderCrosshair({ x: -p.bouts.LC!.x, y: p.bouts.LC!.y }, this.colors.centerBoutLow)(g, ui);

      renderArcFromArcFancy(p.bouts.L2!, this.colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(p.bouts.L3!, this.colors.centerBoutLowOff)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.L2!), this.colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.L3!), this.colors.centerBoutLowOff)(g, ui);

      renderArcFromArcFancy(p.bouts.U2!, this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(p.bouts.U3!, this.colors.centerBoutUpOff)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.U2!), this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.U3!), this.colors.centerBoutUpOff)(g, ui);
    }
    else {
      renderArcFromArc(p.bouts.L2!, this.colors.lowerBout)(g, ui);
      renderArcFromArc(p.bouts.L3!, this.colors.lowerBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.L2!), this.colors.lowerBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.L3!), this.colors.lowerBout)(g, ui);

      renderArcFromArc(p.bouts.U2!, this.colors.upperBout)(g, ui);
      renderArcFromArc(p.bouts.U3!, this.colors.upperBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.U2!), this.colors.upperBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.U3!), this.colors.upperBout)(g, ui);
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
      this.calculateCenterBout1();
      this.calculateCenterBout2();
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds,
        this.renderMainBouts(false),
        this.renderCorners(false),
        this.renderCenterBout(true),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  calculateCenterBout1(): void {
    let p = this.d.params;
    p.bouts.CBW = p.bouts.CBW ?? Math.round(p.bouts.LBW * p.ratios.CBWtoLBW);

    let c0Radius = p.bouts.C0?.r ?? Math.round(p.bouts.LBW * p.ratios.C0toLBW);
    let c0Y = p.bouts.C0?.y ?? Math.round(p.height * p.ratios.C0YtoH);
    p.bouts.C0 = new Arc(p.bouts.CBW / 2 + c0Radius, c0Y, c0Radius);

    // let cuRadius = p.bouts.CU?.r ?? Math.round((p.bouts.UBW * p.ratios.CUtoUBW));
    // let clRadius = p.bouts.CL?.r ?? Math.round((p.bouts.LBW * p.ratios.CLtoLBW));

    // p.bouts.CU = new Arc(0,0,cuRadius)
    // p.bouts.CL = new Arc(0,0,clRadius)
  }
  
  calculateCenterBout2(): void {
    let p = this.d.params;

    let cuRadius = p.bouts.CU?.r ?? Math.round((p.bouts.UBW * p.ratios.CUtoUBW));
    let clRadius = p.bouts.CL?.r ?? Math.round((p.bouts.LBW * p.ratios.CLtoLBW));

    let CU = interceptCirclesAndPoint(p.bouts.C0, p.bouts.UC!, cuRadius).sort((a, b) => b.y - a.y)[1];
    let CL = interceptCirclesAndPoint(p.bouts.C0, p.bouts.LC!, clRadius).sort((a, b) => a.y - b.y)[1];
    let CUIntercept = circleCircleIntersections(p.bouts.C0, CU).sort((a, b) => b.y - a.y)[0];
    let CLIntercept = circleCircleIntersections(p.bouts.C0, CL).sort((a, b) => a.y - b.y)[1];

    p.bouts.CU = arcFromCircleAndPoints(CU, CUIntercept, p.bouts.UC);
    p.bouts.CL = arcFromCircleAndPoints(CL, CLIntercept, p.bouts.LC);
    p.bouts.C0 = arcFromCircleAndPoints(p.bouts.C0, CUIntercept, CLIntercept);

    // recalculate display ratios
    p.ratios.CBWtoLBW = p.bouts.CBW / p.bouts.LBW;
    p.ratios.C0toLBW = p.bouts.C0.r / p.bouts.LBW;
    p.ratios.C0YtoH = p.bouts.C0.y / p.height;
    p.ratios.CUtoUBW = CU.r / p.bouts.UBW;
    p.ratios.CLtoLBW = CL.r / p.bouts.LBW;

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
    } 
    else {
      renderArcFromArc(p.bouts.CU, this.colors.centerBout)(g, ui);
      renderArcFromArc(p.bouts.CL, this.colors.centerBout)(g, ui);
      renderArcFromArc(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.CU), this.colors.centerBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.CL), this.colors.centerBout)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderCircle(p.bouts.CU, this.colors.centerBoutUp)(g, ui);
      renderCircle(p.bouts.CL, this.colors.centerBoutLow)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.CU), this.colors.centerBoutUp)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.CL), this.colors.centerBoutLow)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);
    }
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
