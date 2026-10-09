import { ChangeDetectorRef, Component, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { renderSolveFailures } from '../helpers/renderFuncs';
import { ThemeService } from '../theme/theme.service';
import { clampParam, safeRun } from '../helpers/validators';
import { CerutiPanelId, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, EnricoCerutiTemplate, EnricoCerutiParams, PanelRenderRequest, RenderToggleKey } from './ceruti-types';
import { CERUTI_TEMPLATES } from './templates/ceruti-templates';
import { isLocSourced, thumbnailHref } from './templates/corpus';
import { LOCAL_TEMPLATES } from './templates/local/generated-index';
import { calculateMainBouts, ensureFrontProfilePaths, hasCenterBout, hasCorners, hasMainBouts } from './calculation/outline/ceruti-calcs';
import { renderFrontProfile } from './renders/front-profile.render';
import { PANEL_KEY, RECIPE_KEY, VIEW_FLAGS_KEY, readWorkingState, writeWorkingState } from '../helpers/workingStorage';
import { showFieldHelp } from '../docs/field-help';
import { MainBoutsPanel, renderBounds } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel } from './panels/corners-panel/corners-panel';
import { CenterBoutPanel } from './panels/center-bout-panel/center-bout-panel';
import { OuterTracePanel } from './panels/outer-trace-panel/outer-trace-panel';
import { MouldPanel } from './panels/mould-panel/mould-panel';
import { FlutingPanel } from './panels/fluting-panel/fluting-panel';
import { LongArchingPanel } from './panels/long-arching-panel/long-arching-panel';
import { CrossArchingPanel } from './panels/cross-arching-panel/cross-arching-panel';
import { FHolePlacementPanel } from './panels/f-hole-placement-panel/f-hole-placement-panel';
import { FHoleContoursPanel } from './panels/f-hole-contours-panel/f-hole-contours-panel';
import { NeckPanel } from './panels/neck-panel/neck-panel';
import { StringSetupPanel } from './panels/string-setup-panel/string-setup-panel';
import { ScrollPanel } from './panels/scroll-panel/scroll-panel';
import { ScrollWidthsPanel } from './panels/scroll-widths-panel/scroll-widths-panel';
import { VolutePanel } from './panels/volute-panel/volute-panel';
import { ExportPanel } from './panels/export-panel/export-panel';
import { RecipeToolbarComponent } from '../recipe-toolbar/recipe-toolbar';
import { RenderToggles } from './panels/render-toggles/render-toggles';
import { NumberStepperDirective } from '../shared/number-stepper';

@Component({
  selector: 'app-ceruti-violin',
  imports: [FormsModule, MainBoutsPanel, CornersPanel, CenterBoutPanel, OuterTracePanel, MouldPanel, FlutingPanel, LongArchingPanel, CrossArchingPanel, FHolePlacementPanel, FHoleContoursPanel, NeckPanel, StringSetupPanel, VolutePanel, ScrollPanel, ScrollWidthsPanel, ExportPanel, RecipeToolbarComponent, RenderToggles, NumberStepperDirective],
  templateUrl: './ceruti-violin.html',
  styleUrls: ['../sidebar.css', './ceruti-violin.css'],
})

export class CerutiViolin extends RecipeComponentBase {

  // toggles come from each panel's own `renderToggles`; Base and Export offer none.
  protected readonly panelOrder: readonly { id: CerutiPanelId; label: string; toggles: readonly RenderToggleKey[] }[] = [
    { id: 'base', label: 'Base Measurements', toggles: [] },
    { id: 'mainBouts', label: 'Main Bouts', toggles: MainBoutsPanel.renderToggles },
    { id: 'corners', label: 'Corners', toggles: CornersPanel.renderToggles },
    { id: 'centerBout', label: 'Center Bout', toggles: CenterBoutPanel.renderToggles },
    { id: 'outerTrace', label: 'Outer Path', toggles: OuterTracePanel.renderToggles },
    { id: 'fluting', label: 'Fluting Channel', toggles: FlutingPanel.renderToggles },
    { id: 'longArching', label: 'Long Arching', toggles: LongArchingPanel.renderToggles },
    { id: 'crossArching', label: 'Cross Arching', toggles: CrossArchingPanel.renderToggles },
    { id: 'fHolePlacement', label: 'F-Hole Placement', toggles: FHolePlacementPanel.renderToggles },
    { id: 'fHoleContours', label: 'F-Hole Contours', toggles: FHoleContoursPanel.renderToggles },
    { id: 'neck', label: 'Neck', toggles: NeckPanel.renderToggles },
    { id: 'volute', label: 'Volute', toggles: VolutePanel.renderToggles },
    { id: 'scroll', label: 'Scroll', toggles: ScrollPanel.renderToggles },
    { id: 'scrollWidths', label: 'Scroll Widths', toggles: ScrollWidthsPanel.renderToggles },
    { id: 'stringSetup', label: 'String Setup', toggles: StringSetupPanel.renderToggles },
    { id: 'mould', label: 'Mould', toggles: MouldPanel.renderToggles },
    { id: 'export', label: 'Export', toggles: [] },
  ];

  private readonly themeService = inject(ThemeService);

  // the base panel's own drawing, the front profile in the trace grey
  private readonly pal = ThemeService.getPalette('classicCremona');

  constructor(private readonly cdr: ChangeDetectorRef) {
    super();
    effect(() => {
      this.themeService.mode();
      this.panelRef?.requestViewRerender();
      this.exportRef?.redrawPreview();
    });
    this.initializePanelFlow(this.panelOrder);
    this.initializeDebounce(() => this.refreshBoundInputs());
  }

  // LOCAL_TEMPLATES is appended here rather than folded into CERUTI_TEMPLATES itself, so the
  // provenance sweeps in ceruti-templates.spec.ts/ceruti-fixtures.ts never see a developer's
  // work-in-progress trace — the picker and loadTemplate are the only things that need it.
  readonly templates: EnricoCerutiTemplate[] = [...CERUTI_TEMPLATES, ...LOCAL_TEMPLATES];
  override openPanel = 'base';
  override d: EnricoCerutiTemplate = {
    ...CERUTI_TEMPLATES[1],
  };

  viewFlags: CerutiViewFlags = { ...DEFAULT_CERUTI_VIEW_FLAGS, ...readStoredViewFlags() };

  get renderToggleButtons(): readonly RenderToggleKey[] {
    return this.panelOrder.find(panel => panel.id === this.openPanel)?.toggles ?? [];
  }

  // only one panel component is ever mounted, behind mutually exclusive @if blocks in the template.
  @ViewChild('panelRef') private panelRef?: { requestViewRerender(): void };

  // Export has no #panelRef — it isn't a drafting step and composes its own preview rather than
  // emitting a PanelRenderRequest, so it needs its own handle. Undo is the only caller.
  @ViewChild('exportRef') private exportRef?: { redrawPreview(): void };

  // Redraws via requestViewRerender() rather than onChange(), which debounces and would leave the
  // toggle looking unresponsive until some other edit flushed it.
  onRenderTogglesChanged(): void {
    this.panelRef?.requestViewRerender();
  }

  private _firstRenderInitDone = false;
  private _lastLoadedParamsSnapshot = '';

  private isStateDirty(): boolean {
    if (!this._lastLoadedParamsSnapshot) return false;
    return JSON.stringify(this.d.params) !== this._lastLoadedParamsSnapshot;
  }

  // The blank is the file menu's own "New blank instrument" row, so it isn't also offered as
  // something to start from. Off localhost, templates carrying a non-LoC reference image are
  // hidden too — their host may send no CORS header, or may not stay reachable at all — so a
  // visitor doesn't reach for one that can't fully work; a dev running locally sees everything,
  // with the ones a deployed build won't offer listed as slim rows after the blank.
  get templateCards(): Array<{ key: string; instrument: string; meta: string; thumb?: string; local: boolean }> {
    const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    return this.templates
      .filter(t => t.key !== CERUTI_TEMPLATES[0].key)
      .filter(t => isLocalDev || isLocSourced(t))
      .map(t => ({
        key: t.key,
        instrument: t.fileName,
        meta: t.description ?? '',
        thumb: thumbnailHref(t),
        local: LOCAL_TEMPLATES.includes(t),
      }));
  }

  get corpusCards() {
    return this.templateCards.filter(t => !t.local);
  }

  get localCards() {
    return this.templateCards.filter(t => t.local);
  }

  // The gallery is the base panel's first section while it's open: on a first visit and when
  // asked for from the file menu. A blank leaves it closed, since choosing blank is choosing no
  // template. Picking a card or hiding it puts it away.
  galleryOpen = false;

  openTemplateGallery(): void {
    this.galleryOpen = true;
    this.setOpenPanel('base');
  }

  // the gallery's own blank card: asks only when there is work to lose, as a template pick does
  startBlankFromGallery(): void {
    if (this.isStateDirty() && !confirm('Start a new instrument? Any work you have not downloaded will be lost.')) return;
    this.onNewClick();
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

  // shown when landing on a panel with nothing more specific to draw yet. Solved afresh from the
  // params each time, so an edit on the base panel carries through the whole instrument.
  private renderInstrumentProfile(): Array<(g: any, ui: any) => void> {
    const p = this.d.params;
    const failures = calculateMainBouts(p);
    if (failures.length) return [renderSolveFailures(failures, this.pal.alert)];
    const downstream = ensureFrontProfilePaths(p, this.d.paths);
    return [...renderFrontProfile(p, this.d.paths, this.pal, downstream), renderSolveFailures(downstream.failures, this.pal.alert)];
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
    this.galleryOpen = false;
    // the silhouette's solve writes onto params, so it runs before the snapshot or a fresh template reads as edited
    if (hasMainBouts(this.d.params)) {
      this.draftChange.emit(this.renderInstrumentProfile());
    }
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
    writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
    this.requestFit.emit();
    this.setOpenPanel('base');
  }

  onNewClick(): void {
    const blank = JSON.parse(JSON.stringify(CERUTI_TEMPLATES[0])) as EnricoCerutiTemplate;
    this.d = blank;
    // resetAll() clears the image asset table too, so the new template's own images have to be
    // loaded after it, not assumed.
    this.toolbox.resetAll();
    this.loadReferenceImages(blank);
    this.galleryOpen = false;
    this._firstRenderInitDone = false;
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
    this.setOpenPanel('base');

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
        // nothing saved yet — adopt the selected template's own reference images.
        const selectedTemplate = this.templates.find(t => t.key === this.selectedTemplateKey) ?? this.templates[0];
        this.loadReferenceImages(selectedTemplate);
        this.galleryOpen = true;
      }
      else {
        this.d = recipeData;
            this.loadReferenceImages(recipeData);
        this.panelFlow?.refreshEnabledPanels();
        const savedPanel = readWorkingState(PANEL_KEY);
        if (savedPanel && this.isPanelEnabled(savedPanel)) {
          this.openPanel = savedPanel;
        }
      }

      // so a template's panel-scoped reference images filter from the first draw, not after the first click.
      this.setOpenPanel(this.openPanel);

      // Runs inside a draw, so the re-frame lands on the next one — by which point the restored
      // session's shapes and reference images are on the canvas to be measured.
      this.requestFit.emit();

      // Base panel still uses parent-side render policy; every other panel
      // self-emits from ngOnInit after activation.
      this.debounceController?.markImmediate();
      this.onPanelActivated(this.openPanel);
      this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
    }

    renderBounds(this.d.params, true)(g, ui);
  };

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
    // Ask the mounted panel to redraw rather than remounting it — a remount would lose whatever
    // it holds outside the recipe (highlighted arc, scroll, focus, export preview, arch rotation).
    // Deferred a macrotask because undo just replaced `this.d` wholesale and the panel's [params]
    // binding still points at the pre-undo object until Angular's next change detection runs.
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
      case 'corners': return hasMainBouts(this.d.params);
      case 'centerBout': return hasCorners(this.d.params);
      case 'outerTrace': return hasCenterBout(this.d.params);
      case 'mould': return hasCenterBout(this.d.params);
      case 'fluting': return hasCenterBout(this.d.params);
      case 'longArching': return hasCenterBout(this.d.params);
      case 'crossArching': return hasCenterBout(this.d.params);
      case 'fHolePlacement': return hasCenterBout(this.d.params);
      case 'fHoleContours': return hasCenterBout(this.d.params);
      case 'neck': return hasCenterBout(this.d.params);
      case 'volute': return hasCenterBout(this.d.params);
      case 'scroll': return hasCenterBout(this.d.params);
      case 'scrollWidths': return hasCenterBout(this.d.params);
      case 'stringSetup': return hasCenterBout(this.d.params);
      case 'export': return hasCenterBout(this.d.params);
      default: return false;
    }
  }

  private hasBaseMeasurements(): boolean {
    const p = this.d.params;
    return p.width > 0 && p.height > 0;
  }

  // used by the base-measurements section inlined in ceruti-violin.html — see changeBaseMeasurements().
  protected readonly help = showFieldHelp;

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

  onPanelRenderRequest(request: PanelRenderRequest): void {
    const apply = () => safeRun(() => {
      const renders = request.run();
      if (request.refreshEnabledPanels) {
        this.panelFlow?.refreshEnabledPanels();
      }
      this.draftChange.emit(renders);
      // every flag change — the toggle strip, cross arching's plate view, cursor and drag — redraws through here
      writeWorkingState(VIEW_FLAGS_KEY, JSON.stringify(this.viewFlags));
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

  // Base Measurements' markup lives inline in ceruti-violin.html rather than its own panel
  // component, since it's the landing panel.
  changeBaseMeasurements(): void {
    this.debounce(() => safeRun(() => {
      this.clamp('height', 10, 3000, 'Height must be > 10mm', 'Height must be < 3000mm');
      this.clamp('width', 10, 3000, 'Width must be > 10mm', 'Width must be < 3000mm');
      this.clamp('rib', 0.1, 5, 'Rib thickness must be > 0.5mm', 'Rib thickness must be < 10mm');
      this.clamp('overhang', 1, 10, 'Overhang must be >= 1mm', 'Overhang must be < 10mm');

      // once the bouts exist the width is the wider one's (calculateMainBouts holds it there), so
      // an edit here moves that bout, almost always the lower
      const b = this.d.params.bouts;
      if (b.LBW != null && b.UBW != null) {
        const widest = b.LBW >= b.UBW ? 'LBW' : 'UBW';
        const other = widest === 'LBW' ? b.UBW : b.LBW;
        this.clamp('width', other, 3000, `Width can't be narrower than the ${widest === 'LBW' ? 'upper' : 'lower'} bout, ${other}mm`);
        b[widest] = this.d.params.width;
      }

      this.d.params.ratios.HtoW = this.d.params.height / this.d.params.width;
      this.draftChange.emit([...(hasMainBouts(this.d.params) ? this.renderInstrumentProfile() : []), renderBounds(this.d.params, true)]);
      writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
      // No re-frame here on purpose: resizing the plate is an edit, not a new drawing, and moving
      // the camera mid-keystroke would throw away the view the user set. `F` re-frames.
    }));
  }

}

// spread over the defaults, so a flag added since the tab last wrote picks up its default
function readStoredViewFlags(): Partial<CerutiViewFlags> {
  try {
    return JSON.parse(readWorkingState(VIEW_FLAGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
