import { ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { applyTransforms, ColorTransform, renderPath } from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';
import { CerutiColors, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, EnricoCerutiTemplate, EnricoCerutiParams, PanelRenderRequest } from './ceruti-types';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { defineOuterPath, defineOuterPurflingPath, definePurflingPath } from './ceruti-paths';
import { normalizeArchingParams } from './ceruti-arching';
import { renderBounds } from './renders/guides.render';
import { BasePanel } from './panels/base-panel/base-panel';
import { MainBoutsPanel } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel } from './panels/corners-panel/corners-panel';
import { CenterBoutPanel } from './panels/center-bout-panel/center-bout-panel';
import { OuterTracePanel } from './panels/outer-trace-panel/outer-trace-panel';
import { MouldPanel } from './panels/mould-panel/mould-panel';
import { LongArchingPanel } from './panels/long-arching-panel/long-arching-panel';
import { CrossArchingPanel } from './panels/cross-arching-panel/cross-arching-panel';
import { ExportPanel } from './panels/export-panel/export-panel';
import { RecipeToolbarComponent } from '../recipe-toolbar/recipe-toolbar';
import { RenderToggles } from './render-toggles/render-toggles';

@Component({
  selector: 'app-ceruti-violin',
  imports: [FormsModule, BasePanel, MainBoutsPanel, CornersPanel, CenterBoutPanel, OuterTracePanel, MouldPanel, LongArchingPanel, CrossArchingPanel, ExportPanel, RecipeToolbarComponent, RenderToggles],
  templateUrl: './ceruti-violin.html',
  styleUrls: ['../sidebar.css', './ceruti-violin.css'],
})
export class CerutiViolin extends RecipeComponentBase {

  // ===== Static config and theming =====

  protected readonly panelOrder = [
    { id: 'base', label: 'Base Measurements' },
    { id: 'mainBouts', label: 'Main Bouts' },
    { id: 'corners', label: 'Corners' },
    { id: 'centerBout', label: 'Center Bout' },
    { id: 'outerTrace', label: 'Outer Path' },
    { id: 'longArching', label: 'Long Arching' },
    { id: 'crossArching', label: 'Cross Arching' },
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

  /** Which render-toggle rows apply to each panel — mirrors the showXRow inputs each panel
   * used to pass to its own <app-ceruti-render-toggles>, now that a single fixed instance
   * (see ceruti-violin.html) serves every panel. `null` hides the bar entirely (base, mould,
   * export don't expose any of these view flags). */
  private static readonly RENDER_TOGGLE_ROWS: Record<string, {
    arcs: boolean; circles: boolean; guide: boolean; outerPath: boolean; allArcs: boolean; allCircles: boolean;
  } | null> = {
    base: null,
    mainBouts: { arcs: true, circles: true, guide: true, outerPath: true, allArcs: true, allCircles: true },
    corners: { arcs: true, circles: true, guide: true, outerPath: true, allArcs: true, allCircles: true },
    centerBout: { arcs: true, circles: true, guide: true, outerPath: true, allArcs: true, allCircles: true },
    outerTrace: { arcs: true, circles: true, guide: false, outerPath: false, allArcs: false, allCircles: false },
    longArching: { arcs: false, circles: false, guide: true, outerPath: false, allArcs: true, allCircles: true },
    crossArching: { arcs: false, circles: false, guide: true, outerPath: false, allArcs: true, allCircles: true },
    mould: null,
    export: null,
  };

  get renderToggleRows() {
    return CerutiViolin.RENDER_TOGGLE_ROWS[this.openPanel] ?? null;
  }

  /** Whichever of the 5 panel components is currently mounted (see #panelRef in ceruti-violin.html)
   * — only one is ever in the DOM at a time, since they're behind mutually exclusive @if blocks. */
  @ViewChild('panelRef') private panelRef?: { requestViewRerender(): void };

  /** The view-toggle bar is a single fixed instance shared across panels (see ceruti-violin.html),
   * not owned by any one of them — it redraws the active panel via requestViewRerender()
   * (CerutiPanelBase's public wrapper around emitImmediate) rather than onChange(), which
   * debounces and would leave the toggle looking unresponsive until some other edit flushed it. */
  onRenderTogglesChanged(): void {
    this.panelRef?.requestViewRerender();
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
    this.openPanel = 'base';
  }

  // ===== Lifecycle and bootstrap =====

  /**
   * Migrates arching saved in an older format the moment a recipe is adopted, rather than when the
   * Long Arching panel happens to open — the surface builder, the 3D preview and the STL/template
   * exports all read spline arches straight out of params, and any of them is reachable first.
   */
  protected override onRecipeAdopted(): void {
    normalizeArchingParams(this.d.params);
  }

  onNewClick(): void {
    const blank = JSON.parse(JSON.stringify(CERUTI_TEMPLATES[0])) as EnricoCerutiTemplate;
    this.d = blank;
    this.onRecipeAdopted();
    // resetAll() clears the image asset table too, so the new template's own images (the blank
    // one has none, but that shouldn't be baked in as an assumption) have to be loaded after it.
    this.toolbox.resetAll();
    this.loadReferenceImages(blank);
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
    this.draftChange.emit([this.firstRender]);
  }

  override firstRender = (g: any, ui: any): void => {
    if (!this._firstRenderInitDone) {
      this._firstRenderInitDone = true;

      const recipeData = this.loadMatchingSessionRecipe<EnricoCerutiTemplate>();
      if (!recipeData) {
        // Nothing saved for this recipe yet — adopt the selected template's reference images
        // (e.g. StradGoetz's `/StradGoetz.jpg`) so a fresh session opens with them placed.
        const selectedTemplate = this.templates.find(t => t.key === this.selectedTemplateKey) ?? this.templates[0];
        this.loadReferenceImages(selectedTemplate);
      }
      else {
        this.d = recipeData;
        this.onRecipeAdopted();
        this.loadReferenceImages(recipeData);
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


      // Base panel still uses parent-side render policy; every other panel
      // self-emits from ngOnInit after activation.
      this.debounceController?.markImmediate();
      this.onPanelActivated(this.openPanel);
      this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
      if(this.hasOuterTrace() && this.openPanel == 'base') {
        this.draftChange.emit(this.renderOuterSilhouette());
      }
    }

    renderBounds(this.d.params, true)(g, ui);
  };

  // ===== Panel lifecycle hooks =====

  protected override onPanelActivated(panel: string): void {
    if (panel === 'base') {
      this.debounceController?.markImmediate();
      this.changeBaseMeasurements();
    }
  }

  protected override onStateRestored(): void {
    if (this.openPanel === 'base') {
      this.debounceController?.markImmediate();
      this.changeBaseMeasurements();
      return;
    }
    // Non-base panels are panel-owned; remount to replay their ngOnInit request.
    this.remountActivePanel();
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
      case 'crossArching': return this.hasCenterBout();
      case 'export': return this.hasCenterBout();
      default: return false;
    }
  }

  // ===== Panel gating =====

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

  // ===== UI helpers =====

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

  // ===== Request pipeline =====
  // Panel modules now own geometry/render composition and emit PanelRenderRequest.
  // The parent applies shared policy (debounce, panel refresh, session persistence).

  onPanelRenderRequest(request: PanelRenderRequest): void {
    const apply = () => safeRun(() => {
      const renders = request.run();
      if (request.refreshEnabledPanels) {
        this.panelFlow?.refreshEnabledPanels();
      }
      this.draftChange.emit(renders);
      if (request.persistSession !== false) {
        sessionStorage.setItem('recipeData', JSON.stringify(this.d));
      }
    });

    if (request.immediate) {
      this.debounceController?.markImmediate();
      apply();
      return;
    }
    this.debounce(apply);
  }

  /**
   * Intentional exception: Base remains parent-owned because it is the
   * landing panel and the simplest place to trace first-touch behavior.
   */
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

}
