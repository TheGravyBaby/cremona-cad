import { ChangeDetectorRef, Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Arc, arcFromCircle,  Rectangle } from '../models/types';
import { greyOut, renderArcFromArc, renderArcFromArcFancy, renderCircle,  renderCrosshair, renderDashedLine,   renderLine, renderPath, renderRect } from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';
import { EnricoCerutiTemplate, CERUTI_TEMPLATES, EnricoCerutiParams } from './ceruti-types';
import { dimensionInfo, insetInfo, referenceInfo } from './ceruti-helpers';
import { combinePathStrings, flipAngleAboutYAxis, flipArcAboutY, flipCircleAboutY, flipPointAboutY, flipRectAboutY, pointOnCircle, } from '../helpers/draftMath';
import { calculateCenterBout, calculateCornerBlocks, calculateCorners, calculateMainBouts, calculateMould, calculateOuterCorners,  defineInnerPath, defineOuterPath } from './ceruti-calcs';
import { buildMirroredSvg, downloadSvgFile, downloadSvgAsPdf, downloadFullPlanPdf, PdfPage } from '../helpers/svg-export';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-enrico-ceruti-violin',
  imports: [FormsModule],
  // DomSanitizer injected via constructor
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
    { id: 'outerTrace', label: 'Outer Path' },
    { id: 'mould', label: 'Mould' },
    { id: 'export', label: 'Export' },
  ] as const;

  offFactor = .5;
  off2Factor = .8;
  private readonly colorPalette = {
    upperBout: '#4D8660',
    centerBoutUp: '#C24B2E',
    centerBout: '#A97645',
    centerBoutLow: '#b6a25fff',
    lowerBout: '#4D74A8',
    innerTrace: '#a47272ff',
    outerTrace: '#60b2f2ff',
    mouldTrace: '#81887eff',
  } as const;

  colors = {
    upperBout: this.colorPalette.upperBout,
    upperBoutOff: greyOut(this.colorPalette.upperBout, this.offFactor),
    upperBoutOff2: greyOut(this.colorPalette.upperBout, this.off2Factor),
    centerBoutUp: this.colorPalette.centerBoutUp,
    centerBoutUpOff: greyOut(this.colorPalette.centerBoutUp, this.offFactor),
    centerBoutUpOff2: greyOut(this.colorPalette.centerBoutUp, this.off2Factor),
    centerBout: this.colorPalette.centerBout,
    centerBoutOff: greyOut(this.colorPalette.centerBout, this.offFactor),
    centerBoutOff2: greyOut(this.colorPalette.centerBout, this.off2Factor),
    centerBoutLow: this.colorPalette.centerBoutLow,
    centerBoutLowOff: '#91845bff', //greyOut(this.colorPalette.centerBoutLow, this.offFactor),
    centerBoutLowOff2: '#9b937bff', //greyOut(this.colorPalette.centerBoutLow, 4),
    lowerBout: this.colorPalette.lowerBout,
    lowerBoutOff: greyOut(this.colorPalette.lowerBout, this.offFactor),
    lowerBoutOff2: greyOut(this.colorPalette.lowerBout, this.off2Factor),
    innerTrace: this.colorPalette.innerTrace,
    outerTrace: this.colorPalette.outerTrace,
    mouldTrace: this.colorPalette.mouldTrace,
  }

  // ===== Constructor =====

  constructor(private readonly cdr: ChangeDetectorRef, private readonly sanitizer: DomSanitizer) {
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
  showBoundingBoxes: boolean = false;
  showOuterCircles: boolean = true;
  showInnerPath: boolean = false;
  showBlocks: boolean = true;
  simpleClampBox: boolean = false;
  exportSimpleClampBox: boolean = false;
  exportPreview: SafeHtml | null = null;
  exportPreviewLabel: string = '';

  private lastNewFileTick = 0;

  get selectedTemplateKey(): string {
    const current = JSON.stringify(this.d.params);
    return this.templates.find(t => JSON.stringify(t.params) === current)?.key ?? '';
  }

  loadTemplate(key: string): void {
    if (!key) return;
    const template = this.templates.find(t => t.key === key);
    if (!template) return;
    this.loadFile = template;
    this.referenceImageChange.emit(this.d.referenceImage ?? null);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  // ===== Inputs & lifecycle =====

  @Input() set newFile(v: number) {
    if (v <= 0 || v === this.lastNewFileTick) return;
    this.lastNewFileTick = v;

    this.d = JSON.parse(JSON.stringify(CERUTI_TEMPLATES[0])) as EnricoCerutiTemplate;

    this.openPanel = 'base';

    this.setBounds.emit({
      pt1: { x: -this.d.params.width / 2, y: 0 },
      pt2: { x: this.d.params.width / 2, y: this.d.params.height },
    });
    this.referenceImageChange.emit(this.d.referenceImage ?? null);
    this.draftChange.emit([this.firstRender]);

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
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

    const handlers = this.getActivationHandlers();
    handlers[this.openPanel]?.();
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
      outerTrace: () => this.changeOuterTrace(),
      mould: () => this.changeMould(),
      export: () => { this.previewExport('outerTrace'); },
    };
  }

  override canOpenPanel(panel: string): boolean {
    switch (panel) {
      case 'base': return true;
      case 'mainBouts': return this.hasBaseMeasurements();
      case 'corners': return this.hasMainBouts();
      case 'centerBout': return this.hasCorners();
      case 'outerTrace': return this.hasCenterBout();
      case 'mould': return this.hasCenterBout();
      case 'export': return this.hasCenterBout();
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
    return !!(b.UCr && b.LCr);
  }

  private hasCenterBout(): boolean {
    const b = this.d.params.bouts;
    return !!(b.C0);
  }

  private hasOuterTrace(): boolean {
    const o = this.d.params.outerCorners;
    return !!(o.U31 || o.CU1 || o.CL1 || o.L31);
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

    let p = this.d.params;
    let lowerBoutSquare = new Rectangle({ x: -p.bouts.LBW / 2, y: 0 }, { x: p.bouts.LBW / 2, y: p.bouts.LBW });
    let upperBoutSquare = new Rectangle({ x: -p.bouts.UBW / 2, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2, y: p.height });

    if (this.showBoundingBoxes && p.bouts.LBW) {
      renderRect(lowerBoutSquare, this.colors.lowerBoutOff)(g, ui);
      renderLine({ x: -p.bouts.LBW / 2 + inset, y: 0 }, { x: - p.bouts.LBW / 2 + inset, y: p.bouts.LBW }, this.colors.lowerBoutOff)(g, ui);
      renderLine({ x: p.bouts.LBW / 2 - inset, y: 0 }, { x: p.bouts.LBW / 2 - inset, y: p.bouts.LBW }, this.colors.lowerBoutOff)(g, ui);
      renderRect(upperBoutSquare, this.colors.upperBoutOff)(g, ui);
      renderLine({ x: -p.bouts.UBW / 2 + inset, y: p.height - p.bouts.UBW }, { x: - p.bouts.UBW / 2 + inset, y: p.height }, this.colors.upperBoutOff)(g, ui);
      renderLine({ x: p.bouts.UBW / 2 - inset, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2 - inset, y: p.height }, this.colors.upperBoutOff)(g, ui);
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
      if (this.d.params.options.useViolNeck) {
        let mirrorV0 = flipArcAboutY(p.viol.V0);
        renderArcFromArcFancy(p.viol.V0, this.colors.upperBout)(g, ui);
        renderArcFromArcFancy(mirrorV0, this.colors.upperBout)(g, ui);
        let mirrorU0 = flipArcAboutY(p.bouts.U0);
        renderArcFromArcFancy(p.bouts.U0, this.colors.upperBout)(g, ui);
        renderArcFromArcFancy(mirrorU0, this.colors.upperBout)(g, ui);

        // renderDistanceMeasurementLine(new Pt(0, p.height - inset), new Pt(0, p.viol.V0.y), p.viol.height.toFixed(1) + "mm", this.colors.upperBout)(g, ui);
      }
      else
        renderArcFromArcFancy(wideTopArc, this.colors.upperBout)(g, ui);

      renderArcFromArcFancy(p.bouts.U1, this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(mirroredU1Arc, this.colors.upperBoutOff)(g, ui);
      renderArcFromArcFancy(wideBottomArc, this.colors.lowerBout)(g, ui);
      renderArcFromArcFancy(p.bouts.L1, this.colors.lowerBoutOff)(g, ui);
      renderArcFromArcFancy(mirroredL1Arc, this.colors.lowerBoutOff)(g, ui);
    }
    else {
      if (this.d.params.options.useViolNeck) {
        let mirrorV0 = flipArcAboutY(p.viol.V0);
        renderArcFromArc(p.viol.V0, this.colors.innerTrace)(g, ui);
        renderArcFromArc(mirrorV0, this.colors.innerTrace)(g, ui);

        let mirrorU0 = flipArcAboutY(p.bouts.U0);
        renderArcFromArc(p.bouts.U0, this.colors.innerTrace)(g, ui);
        renderArcFromArc(mirrorU0, this.colors.innerTrace)(g, ui);

         let EndPt = pointOnCircle(p.viol?.V0!, p.viol?.V0.end ?? 0);
         renderLine(EndPt, flipPointAboutY(EndPt), this.colors.innerTrace)(g, ui);
      }
      else
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

  setU2toU1(): void {
    this.d.params.bouts.U2 = new Arc(this.d.params.bouts.U1!.x, this.d.params.bouts.U1!.y, this.d.params.bouts.U1!.r);
    this.changeCorners();
  }

  setL2toL1(): void {
    this.d.params.bouts.L2 = new Arc(this.d.params.bouts.L1!.x, this.d.params.bouts.L1!.y, this.d.params.bouts.L1!.r);
    this.changeCorners();
  }

  renderCorners = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;

    if (currentModule && this.showModuleArcs) {
      renderCrosshair(p.bouts.UCr!, this.colors.centerBoutUpOff)(g, ui);
      renderCrosshair(p.bouts.LCr!, this.colors.centerBoutLowOff)(g, ui);
      renderCrosshair({ x: -p.bouts.UCr!.x, y: p.bouts.UCr!.y }, this.colors.centerBoutUpOff)(g, ui);
      renderCrosshair({ x: -p.bouts.LCr!.x, y: p.bouts.LCr!.y }, this.colors.centerBoutLowOff)(g, ui);
    }

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      !p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L2!, this.colors.lowerBoutOff)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L3!, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L2!), this.colors.lowerBoutOff)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L3!), this.colors.centerBoutLow)(g, ui);
      p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L4, this.colors.lowerBoutOff)(g, ui);
      p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L4), this.colors.lowerBoutOff)(g, ui);


      !p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U2!, this.colors.upperBoutOff)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U3!, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U2!), this.colors.upperBoutOff)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U3!), this.colors.centerBoutUp)(g, ui);
      p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U4, this.colors.upperBoutOff)(g, ui);
      p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U4), this.colors.upperBoutOff)(g, ui);
    }
    else {
      !p.options.useViolCornerLC && renderArcFromArc(p.bouts.L2!, this.colors.innerTrace)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(p.bouts.L3!, this.colors.innerTrace)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L2!), this.colors.innerTrace)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L3!), this.colors.innerTrace)(g, ui);
      p.options.useViolCornerLC && renderArcFromArc(p.bouts.L4, this.colors.innerTrace)(g, ui);
      p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L4), this.colors.innerTrace)(g, ui);


      !p.options.useViolCornerUC && renderArcFromArc(p.bouts.U2!, this.colors.innerTrace)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(p.bouts.U3!, this.colors.innerTrace)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U2!), this.colors.innerTrace)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U3!), this.colors.innerTrace)(g, ui);
      p.options.useViolCornerUC && renderArcFromArc(p.bouts.U4, this.colors.innerTrace)(g, ui);
      p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U4), this.colors.innerTrace)(g, ui);
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

  changeCenterBout(solveC0?: boolean): void {
    this.debounce(() => safeRun(() => {
      calculateCenterBout(this.d.params, solveC0);
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

    if (currentModule && this.showModuleArcs) {
      renderDashedLine({ x: -1000, y: p.bouts.C0.y }, { x: 1000, y: p.bouts.C0.y }, this.colors.centerBoutOff2)(g, ui);
    }

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      renderArcFromArcFancy(p.bouts.CU, this.colors.centerBoutUp)(g, ui);
      renderArcFromArcFancy(p.bouts.CL, this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.CU), this.colors.centerBoutUp)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.CL), this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);
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

  changeOuterTrace(): void {
    this.debounce(() => safeRun(() => {
      calculateOuterCorners(this.d.params);
      this.draftChange.emit([
        this.renderMainBouts(false),
        this.renderCorners(false),
        this.renderCenterBout(false),
        this.renderOuterTrace(true),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderOuterTrace = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;
    let offset = p.overhang + p.rib;
    let outerPath = defineOuterPath(p, offset, true);
    renderPath(outerPath, this.colors.innerTrace, 1)(g, ui);

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      // primary arcs + their mirrors
      !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.U31, this.colors.centerBoutUpOff)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U31), this.colors.centerBoutUpOff)(g, ui);

      !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.CU1, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.CU1), this.colors.centerBoutUp)(g, ui);

      !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.CL1, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.CL1), this.colors.centerBoutLow)(g, ui);

      !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.L31, this.colors.centerBoutLowOff)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L31), this.colors.centerBoutLowOff)(g, ui);

      // optional double arcs + their mirrors
      if (p.options.U31DoubleArc) {
        !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.U32, this.colors.centerBoutUpOff2)(g, ui);
        !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U32), this.colors.centerBoutUpOff2)(g, ui);
      }
      if (p.options.CU1DoubleArc) {
        !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.CU2, this.colors.centerBoutUpOff2)(g, ui);
        !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.CU2), this.colors.centerBoutUpOff2)(g, ui);
      }
      if (p.options.CL1DoubleArc) {
        !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.CL2, this.colors.centerBoutLowOff2)(g, ui);
        !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.CL2), this.colors.centerBoutLowOff2)(g, ui);
      }
      if (p.options.L31DoubleArc) {
        !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.L32, this.colors.centerBoutLowOff2)(g, ui);
        !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L32), this.colors.centerBoutLowOff2)(g, ui);
      }
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      !p.options.useViolCornerUC && renderCircle(p.outerCorners.U31, this.colors.centerBoutUpOff)(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U31), this.colors.centerBoutUpOff)(g, ui);

      !p.options.useViolCornerUC && renderCircle(p.outerCorners.CU1, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.CU1), this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerLC && renderCircle(p.outerCorners.CL1, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.CL1), this.colors.centerBoutLow)(g, ui);

      !p.options.useViolCornerLC && renderCircle(p.outerCorners.L31, this.colors.centerBoutLowOff)(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L31), this.colors.centerBoutLowOff)(g, ui);

      if (p.options.U31DoubleArc) {
        !p.options.useViolCornerUC && renderCircle(p.outerCorners.U32, this.colors.centerBoutUpOff2)(g, ui);
        !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U32), this.colors.centerBoutUpOff2)(g, ui);
      }
      if (p.options.CU1DoubleArc) {
        !p.options.useViolCornerUC && renderCircle(p.outerCorners.CU2, this.colors.centerBoutUpOff2)(g, ui);
        !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.CU2), this.colors.centerBoutUpOff2)(g, ui);
      }
      if (p.options.CL1DoubleArc) {
        !p.options.useViolCornerLC && renderCircle(p.outerCorners.CL2, this.colors.centerBoutLowOff2)(g, ui);
        !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.CL2), this.colors.centerBoutLowOff2)(g, ui);
      }
      if (p.options.L31DoubleArc) {
        !p.options.useViolCornerLC && renderCircle(p.outerCorners.L32, this.colors.centerBoutLowOff2)(g, ui);
        !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L32), this.colors.centerBoutLowOff2)(g, ui);
      }
    }
  }

  changeMould(): void {
    this.debounce(() => safeRun(() => {

      let mouldPath = calculateMould(this.d.params, false, this.simpleClampBox);
      let innerPath = defineInnerPath(this.d.params);
      // let cornerBlocks = calculateCornerBlocks(this.d.params, innerPath);
      this.draftChange.emit([
        this.renderMould(true, mouldPath, innerPath),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }


  renderMould = (_currentModule: boolean, mouldPath: string, innerPath: string) => (g: any, ui: any): void => {
    this.showInnerPath && renderPath(innerPath, this.colors.innerTrace, 1.2)(g, ui);
    renderPath(mouldPath, this.colors.mouldTrace, 1.5)(g, ui);

    if (this.showBlocks) {
      renderRect(this.d.params.blocks.U, this.colors.upperBout)(g, ui);
      renderRect(this.d.params.blocks.CU, this.colors.centerBoutUp)(g, ui);
      renderRect(flipRectAboutY(this.d.params.blocks.CU), this.colors.centerBoutUp)(g, ui);
      renderRect(this.d.params.blocks.CL, this.colors.centerBoutLow)(g, ui);
      renderRect(flipRectAboutY(this.d.params.blocks.CL), this.colors.centerBoutLow)(g, ui);
      renderRect(this.d.params.blocks.L, this.colors.lowerBout)(g, ui);
    }

  };


  // ===== Export =====

  previewExport(type: 'innerTrace' | 'outerTrace'  | 'back' | 'mould' | 'blocks'): void {
    const p = this.d.params;

    switch (type) {
      case 'innerTrace': {
        const d = defineInnerPath(p);
        this.draftChange.emit([renderPath(d, this.colors.innerTrace, 1)]);
        break;
      }
      case 'outerTrace': {
        const path = combinePathStrings([defineOuterPath(p), defineInnerPath(p)]);
        this.draftChange.emit([
          renderPath(path, this.colors.outerTrace, 1),
        ]);
        break;
      }
      case 'back': {
        const path = combinePathStrings([defineOuterPath(p, p.overhang + p.rib, true), defineInnerPath(p)]);
        this.draftChange.emit([
          renderPath(path, this.colors.outerTrace, 1),
        ]);
        break;
      }
      case 'mould': {
        const d = calculateMould(p, true, this.exportSimpleClampBox);
        this.draftChange.emit([renderPath(d, this.colors.mouldTrace, 1.5)]);
        break;
      }
      case 'blocks': {
        const d = calculateCornerBlocks(p, defineInnerPath(p));
        let renders = d.map((block: string) => renderPath(block, this.colors.mouldTrace));
        this.draftChange.emit(renders);
        break;
      }

    }
  }

  downloadExport(type: 'innerTrace' | 'outerTrace' | 'mould' | 'blocks' | 'back'): void {
    const p = this.d.params;
    const offset = p.overhang + p.rib;
    const baseName = this.d.fileName?.trim() || 'ceruti-violin';
    const strokeMap: Record<string, string> = {
      innerTrace: this.colorPalette.innerTrace,
      outerTrace: this.colorPalette.outerTrace,
      mould: this.colorPalette.mouldTrace,
    };

    let pathD: string;
    switch (type) {
      case 'innerTrace':
        pathD = defineInnerPath(p);
        break;
      case 'outerTrace':
        pathD = combinePathStrings([defineOuterPath(p), defineInnerPath(p)]);
        break;
      case 'back':
        pathD = combinePathStrings([defineOuterPath(p, offset, true), defineInnerPath(p)]);
        break;
      case 'mould':
        pathD = calculateMould(p, false, this.exportSimpleClampBox);
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p)));
        break;
    }

    const svg = buildMirroredSvg(p.width, p.height, [{ d: pathD!, stroke: "black", fill: 'none' }]);
    downloadSvgFile(`${baseName}-${type}.svg`, svg);
  }

  downloadPdf(type: 'innerTrace' | 'outerTrace' | 'back' | 'mould' | 'blocks'): void {
    const p = this.d.params;
    const baseName = this.d.fileName?.trim() || 'ceruti-violin';
    const sheetLabels: Record<string, string> = {
      innerTrace: 'Inner Trace',
      outerTrace: 'Outer Trace',
      mould: 'Mould Path',
    };

    let height = p.height + 2 * p.button.height + p.button.width/2;
    let inset = p.overhang + p.rib;
    if (p.options.useViolNeck) 
      height = pointOnCircle(p.viol.V0, 0).y +  2 * p.button.height + p.button.width/2 + inset;

    let pathD: string;
    switch (type) {
      case 'innerTrace':
        pathD = defineInnerPath(p);
        break;
      case 'outerTrace':
        pathD = combinePathStrings([defineOuterPath(p), defineInnerPath(p)]);
        break;
      case 'back':
        pathD = combinePathStrings([defineOuterPath(p, p.overhang + p.rib, true), defineInnerPath(p)]);
        break;
      case 'mould':
        pathD = calculateMould(p, false, this.exportSimpleClampBox);
        break;
      case 'blocks':
        pathD = combinePathStrings(calculateCornerBlocks(p, defineInnerPath(p)));
        break;
      
    }

    downloadSvgAsPdf(
      `${baseName}-${type}.pdf`,
      p.width,
      height,
      [{ d: pathD!, stroke: 'black', fill: 'none' }],
      {
        fileName: baseName,
        description: this.d.description ?? '',
        sheetLabel: sheetLabels[type],
      }
    );
  }

  downloadFullPlan(): void {
    const p = this.d.params;
    const baseName = this.d.fileName?.trim() || 'ceruti-violin';
    const description = this.d.description ?? '';
    let height = p.height + 2 * p.button.height + p.button.width/2;
    let inset = p.overhang + p.rib;
    if (p.options.useViolNeck) 
      height = pointOnCircle(p.viol.V0, 0).y +  2 * p.button.height + p.button.width/2 + inset;

    const pages: PdfPage[] = [
      {
        label: 'Inner Trace',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Top',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: defineOuterPath(p), stroke: 'black', fill: 'none' }, { d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Back',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: defineOuterPath(p, p.overhang + p.rib, true), stroke: 'black', fill: 'none' }, { d: defineInnerPath(p), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Mould Path',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: [{ d: calculateMould(p, false, this.exportSimpleClampBox), stroke: 'black', fill: 'none' }],
      },
      {
        label: 'Blocks',
        fileName: baseName,
        description,
        width: p.width,
        height: height,
        paths: calculateCornerBlocks(p, defineInnerPath(p)).map((block: string) => ({ d: block, stroke: 'black', fill: 'none' })),
      }
    ];

    downloadFullPlanPdf(`${baseName}-full-plan.pdf`, pages);
  }

}
