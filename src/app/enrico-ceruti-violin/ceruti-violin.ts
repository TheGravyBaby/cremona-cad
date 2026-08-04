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
import { PANEL_KEY, RECIPE_KEY, readWorkingState, writeWorkingState } from '../helpers/workingStorage';
import { dimensionInfo, insetInfo } from './ceruti-helpers';
import { MainBoutsPanel } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel } from './panels/corners-panel/corners-panel';
import { CenterBoutPanel } from './panels/center-bout-panel/center-bout-panel';
import { OuterTracePanel } from './panels/outer-trace-panel/outer-trace-panel';
import { MouldPanel } from './panels/mould-panel/mould-panel';
import { FlutingPanel } from './panels/fluting-panel/fluting-panel';
import { LongArchingPanel } from './panels/long-arching-panel/long-arching-panel';
import { CrossArchingPanel } from './panels/cross-arching-panel/cross-arching-panel';
import { ExportPanel } from './panels/export-panel/export-panel';
import { RecipeToolbarComponent } from '../recipe-toolbar/recipe-toolbar';
import { RenderToggles } from './render-toggles/render-toggles';

/** Which buttons the shared view-toggle bar shows for a panel. */
interface RenderToggleRows {
  arcs: boolean; circles: boolean; guide: boolean; outerPath: boolean;
  allArcs: boolean; allCircles: boolean; blocks: boolean; innerPath: boolean;
}

/** A row set, everything unnamed off — so each panel's entry lists only what it actually offers. */
function toggleRows(on: Partial<RenderToggleRows>): RenderToggleRows {
  return {
    arcs: false, circles: false, guide: false, outerPath: false,
    allArcs: false, allCircles: false, blocks: false, innerPath: false,
    ...on,
  };
}

@Component({
  selector: 'app-ceruti-violin',
  imports: [FormsModule, MainBoutsPanel, CornersPanel, CenterBoutPanel, OuterTracePanel, MouldPanel, FlutingPanel, LongArchingPanel, CrossArchingPanel, ExportPanel, RecipeToolbarComponent, RenderToggles],
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
    // The arching panels run in the order of operations at the bench: the
    // channel is gouged at constant section first, then the long arch is carved
    // to a template, then the crown across.
    { id: 'fluting', label: 'Fluting Channel' },
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
   * (see ceruti-violin.html) serves every panel. `null` hides the bar entirely (base and
   * export expose none of these view flags). */
  private static readonly RENDER_TOGGLE_ROWS: Record<string, RenderToggleRows | null> = {
    base: null,
    mainBouts: toggleRows({ arcs: true, circles: true, guide: true, outerPath: true, allArcs: true, allCircles: true }),
    corners: toggleRows({ arcs: true, circles: true, guide: true, outerPath: true, allArcs: true, allCircles: true }),
    centerBout: toggleRows({ arcs: true, circles: true, guide: true, outerPath: true, allArcs: true, allCircles: true }),
    outerTrace: toggleRows({ arcs: true, circles: true }),
    fluting: toggleRows({ guide: true, allArcs: true, allCircles: true }),
    longArching: toggleRows({ guide: true, allArcs: true, allCircles: true }),
    crossArching: toggleRows({ guide: true, allArcs: true, allCircles: true }),
    // The mould's two are what it draws *around* the mould — the blocks it is
    // built to hold and the inner path it is cut to. Same kind of thing as every
    // other row here: what appears on the canvas, not what the recipe is, so
    // they belong on the bar rather than as checkboxes at the foot of the panel.
    mould: toggleRows({ blocks: true, innerPath: true }),
    export: null,
  };

  get renderToggleRows() {
    return CerutiViolin.RENDER_TOGGLE_ROWS[this.openPanel] ?? null;
  }

  /** Whichever of the 5 panel components is currently mounted (see #panelRef in ceruti-violin.html)
   * — only one is ever in the DOM at a time, since they're behind mutually exclusive @if blocks. */
  @ViewChild('panelRef') private panelRef?: { requestViewRerender(): void };

  /** Export is the one mounted panel with no #panelRef — it isn't a drafting step and composes its
   * own preview instead of emitting a PanelRenderRequest, so it gets its own handle rather than
   * being forced into the shape of the other eight. Undo is the only caller. */
  @ViewChild('exportRef') private exportRef?: { redrawPreview(): void };

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

  // The blank is the toolbar's own "Blank instrument" entry, so it isn't also offered as
  // something to start from.
  get templateOptions(): Array<{ key: string; label: string }> {
    return this.templates
      .filter(t => t.key !== CERUTI_TEMPLATES[0].key)
      .map(t => ({ key: t.key, label: t.label }));
  }

  // Debounced like any other edit, so a recipe carrying reference images isn't re-serialized on
  // every keystroke of its name, and so undo puts the old name back.
  onFileNameChange(name: string): void {
    this.d.fileName = name;
    this.debounce(() => writeWorkingState(RECIPE_KEY, JSON.stringify(this.d)));
  }

  get selectedTemplateKey(): string {
    return this.templates.some(t => t.key === this.d.key) ? this.d.key : '';
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
    writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
    if (this.hasOuterTrace()) {
      this.draftChange.emit(this.renderOuterSilhouette());
    }
    this.requestFit.emit();
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

  /**
   * Adds the view toggles to the canvas dump's `view` block. A flag that is off
   * and a layer that drew nothing are the same picture, and only this tells them
   * apart — the difference between a bug and a checkbox.
   */
  protected override debugViewContext(): Record<string, unknown> {
    return { ...super.debugViewContext(), viewFlags: { ...this.viewFlags } };
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

    // Write the working state before emitting so firstRender reads the
    // fresh template data (not the previous session's recipe/panel).
    writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
    writeWorkingState(PANEL_KEY, 'base');

    this.requestFit.emit();
    this.draftChange.emit([this.firstRender]);
  }

  override firstRender = (g: any, ui: any): void => {
    if (!this._firstRenderInitDone) {
      this._firstRenderInitDone = true;

      const recipeData = this.loadMatchingStoredRecipe<EnricoCerutiTemplate>();
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
        // Restore the last open panel from its own key
        this.panelFlow?.refreshEnabledPanels();
        const savedPanel = readWorkingState(PANEL_KEY);
        if (savedPanel && this.isPanelEnabled(savedPanel)) {
          this.openPanel = savedPanel;
        }
      }

      // Runs inside a draw, so the re-frame lands on the next one — by which point the restored
      // session's shapes and reference images are on the canvas to be measured.
      this.requestFit.emit();

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
    // Non-base panels are panel-owned, so the redraw has to come from the panel — but ask the
    // mounted one to redraw rather than tearing it down and letting its ngOnInit do it. A remount
    // throws away everything the panel holds that isn't in the recipe: which arc is highlighted,
    // scroll position, focus, the export panel's chosen preview, the cross-arch rotation.
    //
    // Deferred by a macrotask because undo replaced `this.d` wholesale a moment ago and the
    // panel's [params] binding still points at the pre-undo object until Angular's next change
    // detection — which runs when this event handler returns, well before a setTimeout fires.
    // Redrawing synchronously would draw the geometry the undo just discarded.
    setTimeout(() => {
      if (this._destroyed) return;
      this.panelRef?.requestViewRerender();
      this.exportRef?.redrawPreview();
    });
  }

  override canOpenPanel(panel: string): boolean {
    switch (panel) {
      case 'base': return true;
      case 'mainBouts': return this.hasBaseMeasurements();
      case 'corners': return this.hasMainBouts();
      case 'centerBout': return this.hasCorners();
      case 'outerTrace': return this.hasCenterBout();
      case 'mould': return this.hasCenterBout();
      case 'fluting': return this.hasCenterBout();
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

  // Used by the base-measurements section of ceruti-violin.html, which lives here rather than in
  // its own panel component — see changeBaseMeasurements() below. (nearestFraction, also used
  // there, comes from RecipeComponentBase.)
  protected readonly dimensionInfo = dimensionInfo;
  protected readonly insetInfo = insetInfo;

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
        writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
      }
    });

    if (request.immediate) {
      this.debounceController?.markImmediate();
      apply();
      return;
    }
    if (request.coalesce) this.debounceController?.clearImmediate();
    this.debounce(apply);
  }

  /**
   * Base Measurements' own change handler — the panel's markup lives inline in
   * ceruti-violin.html rather than in a separate panel component, since it's the
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
      writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
      // No re-frame here on purpose: resizing the plate is an edit, not a new drawing, and moving
      // the camera mid-keystroke would throw away the view the user set. `F` re-frames.
    }));
  }

}
