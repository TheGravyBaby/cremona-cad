import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Arc } from '../models/types';
import { applyTransforms, ColorTransform, renderFilledPath, renderPath } from '../helpers/renderFuncs';
import { combinePathStrings } from '../helpers/svgPathMath';
import { clampParam, safeRun } from '../helpers/validators';
import { CerutiColors, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, EnricoCerutiTemplate, EnricoCerutiParams } from './ceruti-types';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { calculateCenterBout, calculateCorners, calculateLongArch, calculateMainBouts, calculateMould, calculateOuterArcs, defaultArchingParams, defineFlutingPlatformPath, defineInnerPath, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from './ceruti-calcs';
import { HighlightedArc } from './renders/render-constants';
import { renderBounds, renderBoutBouts, renderCornerGuides } from './renders/guides.render';
import { renderMainBouts } from './renders/main-bouts.render';
import { renderCorners } from './renders/corners.render';
import { renderCenterBout } from './renders/center-bout.render';
import { renderOuterTrace } from './renders/outer-trace.render';
import { renderMould } from './renders/mould.render';
import { renderLongArchBoxes } from './renders/long-arching.render';
import { BasePanel } from './panels/base-panel/base-panel';
import { MainBoutsPanel } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel } from './panels/corners-panel/corners-panel';
import { CenterBoutPanel } from './panels/center-bout-panel/center-bout-panel';
import { OuterTracePanel } from './panels/outer-trace-panel/outer-trace-panel';
import { MouldPanel } from './panels/mould-panel/mould-panel';
import { LongArchingPanel } from './panels/long-arching-panel/long-arching-panel';
import { ExportPanel } from './panels/export-panel/export-panel';
import { RecipeToolbarComponent } from '../recipe-toolbar/recipe-toolbar';

@Component({
  selector: 'app-ceruti-violin',
  imports: [FormsModule, BasePanel, MainBoutsPanel, CornersPanel, CenterBoutPanel, OuterTracePanel, MouldPanel, LongArchingPanel, ExportPanel, RecipeToolbarComponent],
  templateUrl: './ceruti-violin.html',
  styleUrls: ['../sidebar.css', './ceruti-violin.css'],
})
export class CerutiViolin extends RecipeComponentBase {

  // ===== Static config =====

  protected readonly panelOrder = [
    { id: 'base', label: 'Base Measurements' },
    { id: 'mainBouts', label: 'Main Bouts' },
    { id: 'corners', label: 'Corners' },
    { id: 'centerBout', label: 'Center Bout' },
    { id: 'outerTrace', label: 'Outer Path' },
    { id: 'longArching', label: 'Long Arching' },
    { id: 'mould', label: 'Mould' },
    { id: 'export', label: 'Export' },
  ] as const;

  @Input() nightMode = true;
  readonly lightDarkenDegree = 0.15;
  readonly lightSaturateDegree = 0.4;

  offFactor = .5;
  off2Factor = .8;
  private readonly colorPalette = {
    upperBout: '#4D8660',
    centerBoutUp: '#C24B2E',
    centerBout: '#A97645',
    centerBoutLow: '#e1bf50ff',
    lowerBout: '#4D74A8',
    violNeck: '#248f48ff',
    innerTrace: '#868484ff',
    outerTrace: '#868484ff',
    mouldTrace: '#81887eff',
    fluting: '#478968ff',
    archTop: '#C47B3A',
    archBack: '#4D74A8',
  } as const;

  private makeColor(base: string, ...extra: ColorTransform[]): string {
    const transforms: ColorTransform[] = [];
    if (!this.nightMode) {
      transforms.push({ type: 'darken', degree: this.lightDarkenDegree });
      transforms.push({ type: 'saturate', degree: this.lightSaturateDegree });
    }
    transforms.push(...extra);
    return applyTransforms(base, ...transforms);
  }

  get colors(): CerutiColors {
    const p = this.colorPalette;
    return {
      upperBout: this.makeColor(p.upperBout),
      upperBoutOff: this.makeColor(p.upperBout, { type: 'greyOut', degree: this.offFactor }),
      upperBoutOff2: this.makeColor(p.upperBout, { type: 'greyOut', degree: this.off2Factor }),
      centerBoutUp: this.makeColor(p.centerBoutUp),
      centerBoutUpOff: this.makeColor(p.centerBoutUp, { type: 'greyOut', degree: this.offFactor }),
      centerBoutUpOff2: this.makeColor(p.centerBoutUp, { type: 'greyOut', degree: this.off2Factor }),
      centerBout: this.makeColor(p.centerBout),
      centerBoutOff: this.makeColor(p.centerBout, { type: 'greyOut', degree: this.offFactor }),
      centerBoutOff2: this.makeColor(p.centerBout, { type: 'greyOut', degree: this.off2Factor }),
      centerBoutLow: this.makeColor(p.centerBoutLow),
      centerBoutLowOff: this.makeColor(p.centerBoutLow, { type: 'greyOut', degree: this.offFactor }),
      centerBoutLowOff2: this.makeColor(p.centerBoutLow, { type: 'greyOut', degree: this.off2Factor }),
      lowerBout: this.makeColor(p.lowerBout),
      lowerBoutOff: this.makeColor(p.lowerBout, { type: 'greyOut', degree: this.offFactor }),
      lowerBoutOff2: this.makeColor(p.lowerBout, { type: 'greyOut', degree: this.off2Factor }),
      violNeck: this.makeColor(p.violNeck),
      innerTrace: p.innerTrace,
      outerTrace: p.outerTrace,
      mouldTrace: p.mouldTrace,
      fluting: this.makeColor(p.fluting),
      archTop: this.makeColor(p.archTop),
      archBack: this.makeColor(p.archBack),
    };
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
    ...CERUTI_TEMPLATES[1],
  };

  // Ephemeral view toggles shared by the panel components and threaded into the render functions below. 
  viewFlags: CerutiViewFlags = { ...DEFAULT_CERUTI_VIEW_FLAGS };

  highlightedArc: Arc | null = null;
  highlightedArcColor: string = '';

  private get highlighted(): HighlightedArc | null {
    return this.highlightedArc ? { arc: this.highlightedArc, color: this.highlightedArcColor } : null;
  }

  private _firstRenderInitDone = false;
  private _lastLoadedParamsSnapshot = '';

  private isStateDirty(): boolean {
    if (!this._lastLoadedParamsSnapshot) return false;
    return JSON.stringify(this.d.params) !== this._lastLoadedParamsSnapshot;
  }

  get templateOptions(): Array<{ key: string; label: string }> {
    return this.templates.map(t => ({ key: t.key, label: t.label }));
  }

  get selectedTemplateKey(): string {
    const current = JSON.stringify(this.d.params);
    return this.templates.find(t => JSON.stringify(t.params) === current)?.key ?? '';
  }

  /** The plain outer+inner silhouette shown when landing on a panel with nothing more specific to draw yet. */
  private renderOuterSilhouette(): Array<(g: any, ui: any) => void> {
    const p = this.d.params;
    const offset = p.overhang + p.rib;
    const silhouette = renderPath(defineOuterPath(p), this.colors.outerTrace);
    try {
      const renders: Array<(g: any, ui: any) => void> = [silhouette];
      const purflingPath = definePurflingPath(p, offset);
      if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
      const outerPurflingPath = defineOuterPurflingPath(p, offset);
      if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
      return renders;
    } catch {
      return [silhouette];
    }
  }

  loadTemplate(key: string): void {
    if (!key) return;
    const template = this.templates.find(t => t.key === key);
    if (!template) return;

    if (this.isStateDirty()) {
      const confirmed = confirm('Load template? Any unsaved changes will be lost.');
      if (!confirmed) return;
    }

    this.loadFile(JSON.parse(JSON.stringify(template)));
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    if (this.hasOuterTrace()) {
      this.draftChange.emit(this.renderOuterSilhouette());
    }
    this.setBounds.emit({
        pt1: { x: -this.d.params.width / 2, y: 0 },
        pt2: { x: this.d.params.width / 2, y: this.d.params.height },
      });
    this.referenceImageChange.emit(this.d.referenceImage ?? null);
    this.openPanel = 'base';
  }

  // ===== Lifecycle =====

  onNewClick(): void {
    this.d = JSON.parse(JSON.stringify(CERUTI_TEMPLATES[0])) as EnricoCerutiTemplate;
    this._firstRenderInitDone = false;
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
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

      const recipeData = this.loadMatchingSessionRecipe<EnricoCerutiTemplate>();
      if (!recipeData) {
        const selectedTemplate = this.templates.find(t => t.key === this.selectedTemplateKey) ?? this.templates[0];
        this.d.referenceImage = selectedTemplate.referenceImage;
      }
      else {
        this.d = recipeData;
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
      this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
      if(this.hasOuterTrace() && this.openPanel == 'base') {
        this.draftChange.emit(this.renderOuterSilhouette());
      }
    }

    renderBounds(this.d.params, true)(g, ui);
  };

  override ngOnDestroy(): void {
    super.ngOnDestroy();
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
      longArching: () => this.changeLongArching(),
      export: () => {},
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
      case 'longArching': return this.hasCenterBout();
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

  // ===== Arc focus/halo (shared across every panel's render) =====

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

  // ===== Change pipeline =====
  // Each method below is the single place that knows what to calculate and which
  // render layers (this panel's + earlier panels' as context) compose together.

  changeBaseMeasurements(): void {
    this.debounce(() => safeRun(() => {
      this.clamp('height', 10, 3000, 'Height must be > 10mm', 'Height must be < 3000mm');
      this.clamp('width', 10, 3000, 'Width must be > 10mm', 'Width must be < 3000mm');
      this.clamp('rib', 0.1, 5, 'Rib thickness must be > 0.5mm', 'Rib thickness must be < 10mm');
      this.clamp('overhang', 1, 10, 'Overhang must be >= 1mm', 'Overhang must be < 10mm');

      this.d.params.ratios.HtoW = this.d.params.height / this.d.params.width;
      this.draftChange.emit([renderBounds(this.d.params, true)]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeMainBouts(): void {
    this.debounce(() => safeRun(() => {
      const p = this.d.params;
      calculateMainBouts(p);

      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        renderBounds(p, this.viewFlags.showModuleGuides),
        renderBoutBouts(p, this.colors, this.viewFlags.showModuleGuides),
        renderMainBouts(p, this.colors, this.viewFlags, true, this.highlighted),
      ]);
    }));
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeCorners(): void {
    this.debounce(() => safeRun(() => {
      const p = this.d.params;
      calculateCorners(p);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        renderBounds(p, this.viewFlags.showModuleGuides),
        renderBoutBouts(p, this.colors, this.viewFlags.showModuleGuides),
        renderCornerGuides(p, this.viewFlags.showModuleGuides),
        renderBounds(p, false),
        renderMainBouts(p, this.colors, this.viewFlags, false, this.highlighted),
        renderCorners(p, this.colors, this.viewFlags, true, this.highlighted),
      ]);
    }));
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  changeCenterBout(solveC0?: boolean): void {
    this.debounce(() => safeRun(() => {
      const p = this.d.params;
      calculateCorners(p);
      calculateCenterBout(p, solveC0);
      this.panelFlow?.refreshEnabledPanels();
      this.draftChange.emit([
        renderBounds(p, this.viewFlags.showModuleGuides),
        renderBoutBouts(p, this.colors, this.viewFlags.showModuleGuides),
        renderCornerGuides(p, this.viewFlags.showModuleGuides),
        renderMainBouts(p, this.colors, this.viewFlags, false, this.highlighted),
        renderCorners(p, this.colors, this.viewFlags, false, this.highlighted),
        renderCenterBout(p, this.colors, this.viewFlags, true, this.highlighted),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeOuterTrace(): void {
    this.debounce(() => safeRun(() => {
      const p = this.d.params;
      calculateOuterArcs(p);
      const offset = p.overhang + p.rib;
      const outerPath = defineOuterPath(p, offset, true);
      const purflingPath = definePurflingPath(p, offset);
      const outerPurflingPath = defineOuterPurflingPath(p, offset);
      const flutingPlatformPath = defineFlutingPlatformPath(p, offset);
      this.draftChange.emit([
        renderOuterTrace(p, this.colors, this.viewFlags, true, outerPath, purflingPath, outerPurflingPath, flutingPlatformPath),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeLongArching(): void {
    if (!this.d.params.arching) {
      this.d.params.arching = defaultArchingParams(this.d.params.height);
    }
    const a = this.d.params.arching;
    const p = this.d.params;
    
    this.debounce(() => safeRun(() => {
      calculateLongArch(p);
      this.draftChange.emit([renderLongArchBoxes(p, a, this.colors, this.viewFlags.showModuleGuides)]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  changeMould(): void {
    this.debounce(() => safeRun(() => {
      const p = this.d.params;
      let mouldPath = calculateMould(p, false, this.viewFlags.simpleClampBox);
      let innerPath = defineInnerPath(p);
      this.draftChange.emit([
        renderMould(p, this.colors, this.viewFlags.showBlocks, this.viewFlags.showInnerPath, mouldPath, innerPath),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

}
