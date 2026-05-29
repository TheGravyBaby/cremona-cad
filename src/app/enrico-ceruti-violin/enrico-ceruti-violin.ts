import { ChangeDetectorRef, Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Arc, arcFromCircle, Rectangle, setArcStartByDegreeDiff, setArcEndByDegreeDiff } from '../models/types';
import { greyOut, renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderDashedLine, renderDashedLineLong, renderLine, renderPath, renderRect } from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';
import { EnricoCerutiTemplate, EnricoCerutiParams } from './ceruti-types';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { bitDiameterInfo, boutWidthInfo, buttonInfo, centerBoutWidthInfo, channelDepthInfo, compoundArcInfo, cornerCutoffInfo, cornerPositionInfo, dimensionInfo, fitC0Info, insetInfo, referenceInfo, violCornerInfo, violNeckInfo } from './ceruti-helpers';
import { combinePathStrings, flipAngleAboutYAxis, flipArcAboutY, flipCircleAboutY, flipPointAboutY, flipRectAboutY, interceptCirclesAndPointCompound, offsetArcRadius, pointOnCircle, } from '../helpers/draftMath';
import { calculateCenterBout, calculateCornerBlocks, calculateCorners, calculateMainBouts, calculateMould, calculateOuterArcs, defineInnerPath, defineOuterPath } from './ceruti-calcs';
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
    centerBoutLow: '#e1bf50ff',
    lowerBout: '#4D74A8',
    violNeck: '#248f48ff',
    innerTrace: '#a47272ff',
    outerTrace: '#727fa4ff',
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
    centerBoutLowOff: greyOut(this.colorPalette.centerBoutLow, this.offFactor),
    centerBoutLowOff2: greyOut(this.colorPalette.centerBoutLow, this.off2Factor),
    lowerBout: this.colorPalette.lowerBout,
    lowerBoutOff: greyOut(this.colorPalette.lowerBout, this.offFactor),
    lowerBoutOff2: greyOut(this.colorPalette.lowerBout, this.off2Factor),
    violNeck: this.colorPalette.violNeck,
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
    ...CERUTI_TEMPLATES[1],
  };

  showModuleArcs: boolean = true;
  showModuleCircles: boolean = false;
  showAllArcs: boolean = false;
  showAllCircles: boolean = false;
  showModuleGuides: boolean = false;
  showOuterCircles: boolean = true;
  showInnerPath: boolean = false;
  showBlocks: boolean = true;
  simpleClampBox: boolean = false;
  exportSimpleClampBox: boolean = false;
  exportPreview: SafeHtml | null = null;
  exportPreviewLabel: string = '';
  renderOuterPath = true;


  pathStrokeWidth = 2

  highlightedArc: Arc | null = null;
  highlightedArcColor: string = '';

  onArcFocus(arc: Arc, color: string): void {
    this.highlightedArc = arc;
    this.highlightedArcColor = color;
    this.debounceController?.markImmediate();
    this.getActivationHandlers()[this.openPanel]?.();
  }

  onArcBlur(): void {
    this.highlightedArc = null;
    this.highlightedArcColor = '';
    this.debounceController?.markImmediate();
    this.getActivationHandlers()[this.openPanel]?.();
  }

  private lastNewFileTick = 0;
  private _firstRenderInitDone = false;

  get selectedTemplateKey(): string {
    const current = JSON.stringify(this.d.params);
    return this.templates.find(t => JSON.stringify(t.params) === current)?.key ?? '';
  }

  loadTemplate(key: string): void {
    if (!key) return;
    const template = this.templates.find(t => t.key === key);
    if (!template) return;
    this.loadFile = JSON.parse(JSON.stringify(template));
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
      if(this.hasOuterTrace()) {
      const path = combinePathStrings([defineOuterPath(this.d.params), defineInnerPath(this.d.params)]);
      this.draftChange.emit([
        renderPath(path, this.colors.outerTrace, 1),
      ]);
    }
    this.setBounds.emit({
        pt1: { x: -this.d.params.width / 2, y: 0 },
        pt2: { x: this.d.params.width / 2, y: this.d.params.height },
      });
    this.referenceImageChange.emit(this.d.referenceImage ?? null);
  
  }

  // ===== Inputs & lifecycle =====

  @Input() set newFile(v: number) {
    if (v <= 0 || v === this.lastNewFileTick) return;
    this.lastNewFileTick = v;

    this.d = JSON.parse(JSON.stringify(CERUTI_TEMPLATES[0])) as EnricoCerutiTemplate;
    this._firstRenderInitDone = false;
    this.openPanel = 'base';

    // Write to sessionStorage before emitting so firstRender reads the
    // fresh template data (not the previous session's recipe/panel).
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    sessionStorage.setItem('openPanel', 'base');

    this.setBounds.emit({
      pt1: { x: -this.d.params.width / 2, y: 0 },
      pt2: { x: this.d.params.width / 2, y: this.d.params.height },
    });
    this.referenceImageChange.emit(this.d.referenceImage ?? null);
    this.draftChange.emit([this.firstRender]);
  }

  override firstRender = (g: any, ui: any): void => {
    if (!this._firstRenderInitDone) {
      this._firstRenderInitDone = true;

      let recipeData = sessionStorage.getItem('recipeData');
      if (!recipeData) {
        const selectedTemplate = this.templates.find(t => t.key === this.selectedTemplateKey) ?? this.templates[0];
        this.d.referenceImage = selectedTemplate.referenceImage;
      }
      else {
        // check to see if the recipe loaded from session storage matches a template
        this.d = JSON.parse(recipeData) as EnricoCerutiTemplate;
        // Restore the last open panel from its own sessionStorage key
        this.panelFlow?.refreshEnabledPanels();
        const savedPanel = sessionStorage.getItem('openPanel');
        if (savedPanel && this.isPanelEnabled(savedPanel)) {
          this.openPanel = savedPanel;
        }
      }

      this.setBounds.emit({
        pt1: { x: -this.d.params.width / 2, y: 0 },
        pt2: { x: this.d.params.width / 2, y: this.d.params.height },
      });


      // Run the activation handler immediately (not debounced) so the
      // first full render fires on this call rather than after a delay.
      this.debounceController?.markImmediate();
      const handlers = this.getActivationHandlers();
      handlers[this.openPanel]?.();
      this.referenceImageChange.emit(this.d.referenceImage ?? null);
      if(this.hasOuterTrace() && this.openPanel == 'base') {
        const path = combinePathStrings([defineOuterPath(this.d.params), defineInnerPath(this.d.params)]);
        this.draftChange.emit([
          renderPath(path, this.colors.outerTrace, 1),
        ]);
      }
    }

    this.renderBounds(true)(g, ui);
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
    return !!(o.U3 || o.C2 || o.C1 || o.L3);
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

  // ===== Arc degree-diff helpers =====

  /**
   * Moves the arc's `start` so that (end − start) equals the given degrees,
   * then triggers the provided change handler.
   */
  adjustArcStart(arc: Arc, degrees: number, changeFn: () => void): void {
    setArcStartByDegreeDiff(arc, degrees);
    changeFn();
  }

  /**
   * Moves the arc's `end` so that (end − start) equals the given degrees,
   * then triggers the provided change handler.
   */
  adjustArcEnd(arc: Arc, degrees: number, changeFn: () => void): void {
    setArcEndByDegreeDiff(arc, degrees);
    changeFn();
  }

  // ===== Basic UI funcs =====

  onInfoClick(name: string): void {
    if (name === 'referenceImage') referenceInfo()
    else if (name === 'inset') insetInfo()
    else if (name === 'dimensions') dimensionInfo()
    else if (name === 'violNeck') violNeckInfo()
    else if (name === 'violCorner') violCornerInfo()
    else if (name === 'button') buttonInfo()
    else if (name === 'cornerCutoff') cornerCutoffInfo()
    else if (name === 'boutWidth') boutWidthInfo()
    else if (name === 'centerBoutWidth') centerBoutWidthInfo()
    else if (name === 'fitC0') fitC0Info()
    else if (name === 'cornerPosition') cornerPositionInfo()
    else if (name === 'bitDiameter') bitDiameterInfo()
    else if (name === 'channelDepth') channelDepthInfo()
    else if (name === 'compoundArc') compoundArcInfo();
  }

  // ===== Change pipeline =====

  changeBaseMeasurements(): void {
    this.debounce(() => safeRun(() => {
      this.clamp('height', 10, 3000, 'Height must be > 10mm', 'Height must be < 3000mm');
      this.clamp('width', 10, 3000, 'Width must be > 10mm', 'Width must be < 3000mm');
      this.clamp('rib', 0.1, 5, 'Rib thickness must be > 0.5mm', 'Rib thickness must be < 10mm');
      this.clamp('overhang', 1, 10, 'Overhang must be >= 1mm', 'Overhang must be < 10mm');

      this.d.params.ratios.HtoW = this.d.params.height / this.d.params.width;
      this.draftChange.emit([this.renderBounds(true)]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  oldViolNeckValue = this.d.params.options.useViolNeck;
  changeMainBouts(): void {
    this.debounce(() => safeRun(() => {
      let p = this.d.params
      let inset = p.overhang + p.rib;
      calculateMainBouts(p);

      if (p.options.useViolNeck && p.options.useViolNeck !== this.oldViolNeckValue) {
        let height = pointOnCircle(p.viol.V0, 0).y + inset;
        this.setBounds.emit({
          pt1: { x: -p.width / 2, y: 0 },
          pt2: { x: p.width / 2, y: height },
        });
        this.oldViolNeckValue = true;
      }
      this.oldViolNeckValue = p.options.useViolNeck;

      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds(this.showModuleGuides), this.renderBoutBouts(this.showModuleGuides),
        this.renderMainBouts(true)
      ]);
    }));
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  renderMainBouts = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;
    let inset = p.overhang + p.rib;

    if (this.highlightedArc) {
      renderArcHalo(this.highlightedArc, this.highlightedArcColor)(g, ui);
      renderArcHalo(flipArcAboutY(this.highlightedArc), this.highlightedArcColor)(g, ui);
    }

    let wideTopArc = arcFromCircle(p.bouts.U0, flipAngleAboutYAxis(p.bouts.U0.end), p.bouts.U0.end);
    let wideBottomArc = arcFromCircle(p.bouts.L0, flipAngleAboutYAxis(p.bouts.L0.end), p.bouts.L0.end);
    let mirroredU1Arc = flipArcAboutY(p.bouts.U1);
    let mirroredL1Arc = flipArcAboutY(p.bouts.L1);

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

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      if (this.d.params.options.useViolNeck) {
        let mirrorV0 = flipArcAboutY(p.viol.V0);
        renderArcFromArcFancy(p.viol.V0, this.colors.violNeck)(g, ui);
        renderArcFromArcFancy(mirrorV0, this.colors.violNeck)(g, ui);
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
        renderArcFromArc(p.viol.V0, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
        renderArcFromArc(mirrorV0, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);

        let mirrorU0 = flipArcAboutY(p.bouts.U0);
        renderArcFromArc(p.bouts.U0, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
        renderArcFromArc(mirrorU0, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);

        let EndPt = pointOnCircle(p.viol?.V0!, p.viol?.V0.end ?? 0);
        renderLine(EndPt, flipPointAboutY(EndPt), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      }
      else
        renderArcFromArc(wideTopArc, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);

      renderArcFromArc(p.bouts.U1, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(mirroredU1Arc, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(wideBottomArc, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(p.bouts.L1, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(mirroredL1Arc, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
    }
    
    if (this.renderOuterPath) {
      const m = this.showModuleArcs && currentModule;
      const outerTopColor     = m ? this.colors.upperBout    : this.colors.outerTrace;
      const outerTopOffColor  = m ? this.colors.upperBoutOff : this.colors.outerTrace;
      const outerBotColor     = m ? this.colors.lowerBout    : this.colors.outerTrace;
      const outerBotOffColor  = m ? this.colors.lowerBoutOff : this.colors.outerTrace;
      const violNeckColor     = m ? this.colors.violNeck     : this.colors.outerTrace;
      if (this.d.params.options.useViolNeck) {
        let mirrorV0 = flipArcAboutY(p.viol.V0);
        renderArcFromArc(offsetArcRadius(p.viol.V0, -inset), violNeckColor, this.pathStrokeWidth)(g, ui);
        renderArcFromArc(offsetArcRadius(mirrorV0, -inset), violNeckColor, this.pathStrokeWidth)(g, ui);
        let mirrorU0 = flipArcAboutY(p.bouts.U0);
        renderArcFromArc(offsetArcRadius(p.bouts.U0, inset), outerTopColor, this.pathStrokeWidth)(g, ui);
        renderArcFromArc(offsetArcRadius(mirrorU0, inset), outerTopColor, this.pathStrokeWidth)(g, ui);

        let EndPt = pointOnCircle(p.viol?.V0!, p.viol?.V0.end ?? 0);
        renderLine(EndPt, flipPointAboutY(EndPt), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      }
      else
        renderArcFromArc(offsetArcRadius(wideTopArc, inset), outerTopColor, this.pathStrokeWidth)(g, ui);

      renderArcFromArc(offsetArcRadius(p.bouts.U1, inset), outerTopOffColor, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(mirroredU1Arc, inset), outerTopOffColor, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(wideBottomArc, inset), outerBotColor, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(p.bouts.L1, inset), outerBotOffColor, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(mirroredL1Arc, inset), outerBotOffColor, this.pathStrokeWidth)(g, ui);
    }


  }

  changeCorners(): void {
    this.debounce(() => safeRun(() => {
      calculateCorners(this.d.params);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds(this.showModuleGuides), this.renderBoutBouts(this.showModuleGuides), this.renderCornerGuides(this.showModuleGuides),
        this.renderBounds(false),
        this.renderMainBouts(false),
        this.renderCorners(true),
      ]);
    }));
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
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

    if (this.highlightedArc) {
      renderArcHalo(this.highlightedArc, this.highlightedArcColor)(g, ui);
      renderArcHalo(flipArcAboutY(this.highlightedArc), this.highlightedArcColor)(g, ui);
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(p.bouts.L2!, this.colors.lowerBoutOff)(g, ui);
      renderCircle(p.bouts.L3!, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderCircle(p.bouts.L31!, this.colors.lowerBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.L2!), this.colors.lowerBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.L3!), this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.L31!), this.colors.lowerBoutOff)(g, ui);
      renderCircle(p.bouts.U2!, this.colors.upperBoutOff)(g, ui);
      renderCircle(p.bouts.U3!, this.colors.centerBoutUpOff)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderCircle(p.bouts.U31!, this.colors.upperBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.U2!), this.colors.upperBoutOff)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.U3!), this.colors.centerBoutUpOff)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.U31!), this.colors.upperBoutOff)(g, ui);
    }
    if (currentModule && this.showModuleArcs) {
      renderCrosshair(p.bouts.UCr!, this.colors.centerBoutUpOff2)(g, ui);
      renderCrosshair(p.bouts.LCr!, this.colors.centerBoutLowOff2)(g, ui);
      renderCrosshair({ x: -p.bouts.UCr!.x, y: p.bouts.UCr!.y }, this.colors.centerBoutUpOff2)(g, ui);
      renderCrosshair({ x: -p.bouts.LCr!.x, y: p.bouts.LCr!.y }, this.colors.centerBoutLowOff2)(g, ui);
    }

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      !p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L2!, this.colors.lowerBoutOff)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L3!, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArcFancy(p.bouts.L31!, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L2!), this.colors.lowerBoutOff)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.L31!), this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L3!), this.colors.centerBoutLow)(g, ui);
      p.options.useViolCornerLC && renderArcFromArcFancy(p.bouts.L4, this.colors.lowerBoutOff)(g, ui);
      p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.bouts.L4), this.colors.lowerBoutOff)(g, ui);


      !p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U2!, this.colors.upperBoutOff)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U3!, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArcFancy(p.bouts.U31!, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U2!), this.colors.upperBoutOff)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.U31!), this.colors.centerBoutUp)(g, ui);

      !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U3!), this.colors.centerBoutUp)(g, ui);
      p.options.useViolCornerUC && renderArcFromArcFancy(p.bouts.U4, this.colors.upperBoutOff)(g, ui);
      p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.bouts.U4), this.colors.upperBoutOff)(g, ui);
    }
    else {
      !p.options.useViolCornerLC && renderArcFromArc(p.bouts.L2!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(p.bouts.L3!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(p.bouts.L31!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L2!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L3!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.L31!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerLC && renderArcFromArc(p.bouts.L4, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerLC && renderArcFromArc(flipArcAboutY(p.bouts.L4), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);


      !p.options.useViolCornerUC && renderArcFromArc(p.bouts.U2!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(p.bouts.U3!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(p.bouts.U31!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U2!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U3!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.U31!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerUC && renderArcFromArc(p.bouts.U4, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerUC && renderArcFromArc(flipArcAboutY(p.bouts.U4), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
    }

    if (this.renderOuterPath) {
      const m = this.showModuleArcs && currentModule;
      const lBoutOff   = m ? this.colors.lowerBoutOff   : this.colors.outerTrace;
      const cBoutLow   = m ? this.colors.centerBoutLow  : this.colors.outerTrace;
      const uBoutOff   = m ? this.colors.upperBoutOff   : this.colors.outerTrace;
      const cBoutUp    = m ? this.colors.centerBoutUp   : this.colors.outerTrace;
      const inset = p.overhang + p.rib;

      // Lower corners — L2 expands outward (+inset), L3 is already outer so shrinks (-inset)
      !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L2!, inset), lBoutOff, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L3!, -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.L31!, -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L2!), inset), lBoutOff, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L3!), -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerLC && p.options.L31DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L31!), -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(p.bouts.L4, inset), lBoutOff, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerLC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.L4), inset), lBoutOff, this.pathStrokeWidth)(g, ui);

      // Upper corners — U2 expands outward (+inset), U3 is already outer so shrinks (-inset)
      !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(p.bouts.U2!, inset), uBoutOff, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(p.bouts.U3!, -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.U31!, -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U2!), inset), uBoutOff, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U3!), -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      !p.options.useViolCornerUC && p.options.U31DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U31!), -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(p.bouts.U4, inset), uBoutOff, this.pathStrokeWidth)(g, ui);
      p.options.useViolCornerUC && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.U4), inset), uBoutOff, this.pathStrokeWidth)(g, ui);
    }

  }

  changeCenterBout(solveC0?: boolean): void {
    this.debounce(() => safeRun(() => {
      calculateCorners(this.d.params);
      calculateCenterBout(this.d.params, solveC0);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        this.renderBounds(this.showModuleGuides), this.renderBoutBouts(this.showModuleGuides), this.renderCornerGuides(this.showModuleGuides),
        this.renderMainBouts(false),
        this.renderCorners(false),
        this.renderCenterBout(true),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderCenterBout = (currentModule: boolean) => (g: any, ui: any): void => {
    let p = this.d.params;

    if (this.highlightedArc) {
      renderArcHalo(this.highlightedArc, this.highlightedArcColor)(g, ui);
      renderArcHalo(flipArcAboutY(this.highlightedArc), this.highlightedArcColor)(g, ui);
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      renderCircle(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderCircle(p.bouts.C2, this.colors.centerBoutUp)(g, ui);
      renderCircle(p.bouts.C1, this.colors.centerBoutLow)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.C2), this.colors.centerBoutUp)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.C1), this.colors.centerBoutLow)(g, ui);
      renderCircle(flipCircleAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);

      p.options.C21DoubleArc && renderCircle(p.bouts.C21!, this.colors.centerBoutUpOff2)(g, ui);
      p.options.C21DoubleArc && renderCircle(flipCircleAboutY(p.bouts.C21!), this.colors.centerBoutUpOff2)(g, ui);
      p.options.C11DoubleArc && renderCircle(p.bouts.C11!, this.colors.centerBoutLowOff2)(g, ui);
      p.options.C11DoubleArc && renderCircle(flipCircleAboutY(p.bouts.C11!), this.colors.centerBoutLowOff2)(g, ui);
      p.options.L31DoubleArc && renderCircle(p.bouts.L31!, this.colors.centerBoutLowOff2)(g, ui);
      p.options.L31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.L31!), this.colors.centerBoutLowOff2)(g, ui);
      p.options.U31DoubleArc && renderCircle(p.bouts.U31!, this.colors.centerBoutUpOff2)(g, ui);
      p.options.U31DoubleArc && renderCircle(flipCircleAboutY(p.bouts.U31!), this.colors.centerBoutUpOff2)(g, ui);
    }

    if (currentModule && this.showModuleGuides) {
      renderDashedLine({ x: -1000, y: p.bouts.C0.y }, { x: 1000, y: p.bouts.C0.y }, this.colors.centerBoutOff2)(g, ui);
    }

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {

      renderArcFromArcFancy(p.bouts.C2, this.colors.centerBoutUp)(g, ui);
      p.options.C21DoubleArc && renderArcFromArcFancy(p.bouts.C21!, this.colors.centerBoutUp)(g, ui);

      renderArcFromArcFancy(p.bouts.C1, this.colors.centerBoutLow)(g, ui);
      p.options.C11DoubleArc && renderArcFromArcFancy(p.bouts.C11!, this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(p.bouts.C0, this.colors.centerBout)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.C2), this.colors.centerBoutUp)(g, ui);
      p.options.C21DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.C21!), this.colors.centerBoutUp)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.C1), this.colors.centerBoutLow)(g, ui);
      p.options.C11DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.bouts.C11!), this.colors.centerBoutLow)(g, ui);
      renderArcFromArcFancy(flipArcAboutY(p.bouts.C0), this.colors.centerBout)(g, ui);
    }
    else {
      renderArcFromArc(p.bouts.C2, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(p.bouts.C1, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(p.bouts.C0, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.C2), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.C1), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(flipArcAboutY(p.bouts.C0), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);

      p.options.C21DoubleArc && renderArcFromArc(p.bouts.C21!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.C11DoubleArc && renderArcFromArc(p.bouts.C11!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.L31DoubleArc && renderArcFromArc(p.bouts.L31!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.U31DoubleArc && renderArcFromArc(p.bouts.U31!, this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.C21DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.C21!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.C11DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.C11!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.L31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.L31!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
      p.options.U31DoubleArc && renderArcFromArc(flipArcAboutY(p.bouts.U31!), this.colors.innerTrace, this.pathStrokeWidth)(g, ui);
    }

    if (this.renderOuterPath) {
      const m = this.showModuleArcs && currentModule;
      const cBoutUp  = m ? this.colors.centerBoutUp  : this.colors.outerTrace;
      const cBout    = m ? this.colors.centerBout     : this.colors.outerTrace;
      const cBoutLow = m ? this.colors.centerBoutLow  : this.colors.outerTrace;
      const inset = p.overhang + p.rib;

      // All center bout arcs are outer arcs — shrink with -inset
      renderArcFromArc(offsetArcRadius(p.bouts.C2, -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      p.options.C21DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.C21!, -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(p.bouts.C1, -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      p.options.C11DoubleArc && renderArcFromArc(offsetArcRadius(p.bouts.C11!, -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(p.bouts.C0, -inset), cBout, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C2), -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      p.options.C21DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C21!), -inset), cBoutUp, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C1), -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      p.options.C11DoubleArc && renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C11!), -inset), cBoutLow, this.pathStrokeWidth)(g, ui);
      renderArcFromArc(offsetArcRadius(flipArcAboutY(p.bouts.C0), -inset), cBout, this.pathStrokeWidth)(g, ui);
    }


  }

  changeOuterTrace(): void {
    this.debounce(() => safeRun(() => {
      calculateOuterArcs(this.d.params);
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
    renderPath(outerPath, this.colors.outerTrace, this.pathStrokeWidth)(g, ui);

    if ((currentModule && this.showModuleArcs) || this.showAllArcs) {
      // primary arcs + their mirrors
      !p.options.useViolCornerUC && !p.options.U31DoubleArc && renderArcFromArcFancy(p.outerCorners.U3, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && !p.options.U31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U3), this.colors.centerBoutUp)(g, ui);

      !p.options.useViolCornerUC && !p.options.C21DoubleArc && renderArcFromArcFancy(p.outerCorners.C2, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && !p.options.C21DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C2), this.colors.centerBoutUp)(g, ui);

      !p.options.useViolCornerLC && !p.options.C11DoubleArc && renderArcFromArcFancy(p.outerCorners.C1, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && !p.options.C11DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C1), this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && !p.options.L31DoubleArc && renderArcFromArcFancy(p.outerCorners.L3, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && !p.options.L31DoubleArc && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L3), this.colors.centerBoutLow)(g, ui);

      // optional double arcs + their mirrors
      if (p.options.U31DoubleArc) {
        !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.U31, this.colors.centerBoutUp)(g, ui);
        !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.U31), this.colors.centerBoutUp)(g, ui);
      }
      if (p.options.C21DoubleArc) {
        !p.options.useViolCornerUC && renderArcFromArcFancy(p.outerCorners.C21, this.colors.centerBoutUp)(g, ui);
        !p.options.useViolCornerUC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C21), this.colors.centerBoutUp)(g, ui);
      }
      if (p.options.C11DoubleArc) {
        !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.C11, this.colors.centerBoutLow)(g, ui);
        !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.C11), this.colors.centerBoutLow)(g, ui);
      }
      if (p.options.L31DoubleArc) {
        !p.options.useViolCornerLC && renderArcFromArcFancy(p.outerCorners.L31, this.colors.centerBoutLow)(g, ui);
        !p.options.useViolCornerLC && renderArcFromArcFancy(flipArcAboutY(p.outerCorners.L31), this.colors.centerBoutLow)(g, ui);
      }
    }

    if ((currentModule && this.showModuleCircles) || this.showAllCircles) {
      !p.options.useViolCornerUC && renderCircle(p.outerCorners.U3, this.colors.centerBoutUpOff)(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U3), this.colors.centerBoutUpOff)(g, ui);

      !p.options.useViolCornerUC && renderCircle(p.outerCorners.C2, this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.C2), this.colors.centerBoutUp)(g, ui);
      !p.options.useViolCornerLC && renderCircle(p.outerCorners.C1, this.colors.centerBoutLow)(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.C1), this.colors.centerBoutLow)(g, ui);

      !p.options.useViolCornerLC && renderCircle(p.outerCorners.L3, this.colors.centerBoutLowOff)(g, ui);
      !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L3), this.colors.centerBoutLowOff)(g, ui);

      if (p.options.U31DoubleArc) {
        !p.options.useViolCornerUC && renderCircle(p.outerCorners.U31, this.colors.centerBoutUpOff2)(g, ui);
        !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.U31), this.colors.centerBoutUpOff2)(g, ui);
      }
      if (p.options.C21DoubleArc) {
        !p.options.useViolCornerUC && renderCircle(p.outerCorners.C21, this.colors.centerBoutUpOff2)(g, ui);
        !p.options.useViolCornerUC && renderCircle(flipCircleAboutY(p.outerCorners.C21), this.colors.centerBoutUpOff2)(g, ui);
      }
      if (p.options.C11DoubleArc) {
        !p.options.useViolCornerLC && renderCircle(p.outerCorners.C11, this.colors.centerBoutLowOff2)(g, ui);
        !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.C11), this.colors.centerBoutLowOff2)(g, ui);
      }
      if (p.options.L31DoubleArc) {
        !p.options.useViolCornerLC && renderCircle(p.outerCorners.L31, this.colors.centerBoutLowOff2)(g, ui);
        !p.options.useViolCornerLC && renderCircle(flipCircleAboutY(p.outerCorners.L31), this.colors.centerBoutLowOff2)(g, ui);
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

  // == Simple Renders For Modules 

  renderBounds = (render: boolean) => (g: any, ui: any): void => {
    const h = this.d.params.height;
    const hw = this.d.params.width / 2;
    const inset = this.d.params.overhang + this.d.params.rib;
    let outerRect = new Rectangle({ x: -hw, y: 0 }, { x: hw, y: h });
    let insetRect = new Rectangle({ x: -hw + inset, y: inset }, { x: hw - inset, y: h - inset });

    if (render) {
      renderRect(outerRect, "grey")(g, ui);
      renderRect(insetRect, "grey")(g, ui);
    }

  };

  renderBoutBouts = (render: boolean) => (g: any, ui: any): void => {
    if (render) {
      let p = this.d.params;
      let lowerBoutSquare = new Rectangle({ x: -p.bouts.LBW / 2, y: 0 }, { x: p.bouts.LBW / 2, y: p.bouts.LBW });
      let upperBoutSquare = new Rectangle({ x: -p.bouts.UBW / 2, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2, y: p.height });
      const inset = this.d.params.overhang + this.d.params.rib;

      renderRect(lowerBoutSquare, this.colors.lowerBoutOff)(g, ui);
      renderLine({ x: -p.bouts.LBW / 2 + inset, y: 0 }, { x: - p.bouts.LBW / 2 + inset, y: p.bouts.LBW }, this.colors.lowerBoutOff)(g, ui);
      renderLine({ x: p.bouts.LBW / 2 - inset, y: 0 }, { x: p.bouts.LBW / 2 - inset, y: p.bouts.LBW }, this.colors.lowerBoutOff)(g, ui);
      renderRect(upperBoutSquare, this.colors.upperBoutOff)(g, ui);
      renderLine({ x: -p.bouts.UBW / 2 + inset, y: p.height - p.bouts.UBW }, { x: - p.bouts.UBW / 2 + inset, y: p.height }, this.colors.upperBoutOff)(g, ui);
      renderLine({ x: p.bouts.UBW / 2 - inset, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2 - inset, y: p.height }, this.colors.upperBoutOff)(g, ui);
    }
  };

  renderCornerGuides = (render: boolean) => (g: any, ui: any): void => {
    let lowerCornerLine = { p1: this.d.params.bouts.L2, p2: { x: this.d.params.bouts.LCr!.x, y: this.d.params.bouts.LCr!.y } };
    let upperCornerLine = { p1: this.d.params.bouts.U2, p2: { x: this.d.params.bouts.UCr!.x, y: this.d.params.bouts.UCr!.y } };
    
    if (render) {
      renderDashedLineLong(lowerCornerLine.p1, lowerCornerLine.p2, "grey")(g, ui);
      renderDashedLineLong(upperCornerLine.p1, upperCornerLine.p2, "grey")(g, ui);
      renderDashedLineLong({ x: -lowerCornerLine.p1.x, y: lowerCornerLine.p1.y }, { x: -lowerCornerLine.p2.x, y: lowerCornerLine.p2.y }, "grey")(g, ui);
      renderDashedLineLong({ x: -upperCornerLine.p1.x, y: upperCornerLine.p1.y }, { x: -upperCornerLine.p2.x, y: upperCornerLine.p2.y }, "grey")(g, ui);
    }

  }


  // ===== Export =====

  previewExport(type: 'innerTrace' | 'outerTrace' | 'back' | 'mould' | 'blocks'): void {
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

    let height = p.height + 2 * p.button.height + p.button.width / 2;
    let inset = p.overhang + p.rib;
    if (p.options.useViolNeck)
      height = pointOnCircle(p.viol.V0, 0).y + 2 * p.button.height + p.button.width / 2 + inset;

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
        pathD = calculateMould(p, true, this.exportSimpleClampBox);
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
    let height = p.height + 2 * p.button.height + p.button.width / 2;
    let inset = p.overhang + p.rib;
    if (p.options.useViolNeck)
      height = pointOnCircle(p.viol.V0, 0).y + 2 * p.button.height + p.button.width / 2 + inset;

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
        paths: [{ d: calculateMould(p, true, this.exportSimpleClampBox), stroke: 'black', fill: 'none' }],
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
