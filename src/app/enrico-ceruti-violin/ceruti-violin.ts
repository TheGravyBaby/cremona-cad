import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { Arc, Pt } from '../models/types';
import { applyTransforms, ColorTransform, renderArcFromArc, renderFilledPath, renderPath } from '../helpers/renderFuncs';
import { combinePathStrings, samplePathToPolyline } from '../helpers/svgPathMath';
import { clampParam, safeRun } from '../helpers/validators';
import { clamp, normalizeDegrees } from '../helpers/draftMath';
import { normalizeReferenceImages } from '../helpers/referenceImages';
import { ArchingParams, CerutiColors, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, EnricoCerutiTemplate, EnricoCerutiParams } from './ceruti-types';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { calculateCenterBout, calculateCorners, calculateCrossArchTop, calculateLongArch, calculateMainBouts, calculateMould, calculateOuterArcs, contourSampleSteps, defaultArchingParams, defaultCrossArchParams, defaultFlutingChannelParams, defineFlutingAreaPath, defineFlutingPath, defineInnerPath, defineInsetPath, defineOuterCornerArcs, defineOuterPath, defineOuterPurflingPath, definePurflingPath, defineTroughPath, flutingHalfWidthAtY, flutingOuterHalfWidthAtY, innerHalfWidthAtY, outerHalfWidthAtY, wireframeSampleSteps } from './ceruti-calcs';
import { ArchContourLevel, buildPlateSurfaceModel, calculateFlutingSectionTop, computeArchContourRings, stationChordsAt, PlateSurfaceModel } from './ceruti-surface';
import { computeArchContourBounds, projectArchContourRings, projectFlatPolyline, renderArchContours3d } from './renders/arch-contours.render';
import { computeSingleWireframeStrip, computeWireframeBounds, computeWireframeGeometry, projectWireframe, renderArch3dWireframe, WireframeGeometry } from './renders/arch-3d-wireframe.render';
import { renderWireframeDragFrame } from './renders/wireframe-drag-frame.render';
import { HighlightedArc } from './renders/render-constants';
import { renderBounds, renderBoutBouts, renderCornerGuides } from './renders/guides.render';
import { renderMainBouts } from './renders/main-bouts.render';
import { renderCorners } from './renders/corners.render';
import { renderCenterBout } from './renders/center-bout.render';
import { renderOuterTraceGuides } from './renders/outer-trace.render';
import { renderMould } from './renders/mould.render';
import { renderLongArchBoxes as renderLongArch } from './renders/long-arching.render';
import { renderCrossSection } from './renders/cross-arching.render';
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

@Component({
  selector: 'app-ceruti-violin',
  imports: [FormsModule, BasePanel, MainBoutsPanel, CornersPanel, CenterBoutPanel, OuterTracePanel, MouldPanel, LongArchingPanel, CrossArchingPanel, ExportPanel, RecipeToolbarComponent],
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
    this.referenceImagesChange.emit(normalizeReferenceImages(this.d));
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
    this.referenceImagesChange.emit(normalizeReferenceImages(this.d));
    this.draftChange.emit([this.firstRender]);
  }

  override firstRender = (g: any, ui: any): void => {
    if (!this._firstRenderInitDone) {
      this._firstRenderInitDone = true;

      const recipeData = this.loadMatchingSessionRecipe<EnricoCerutiTemplate>();
      if (!recipeData) {
        const selectedTemplate = this.templates.find(t => t.key === this.selectedTemplateKey) ?? this.templates[0];
        this.d.referenceImages = normalizeReferenceImages(selectedTemplate);
        delete this.d.referenceImage;
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
      this.referenceImagesChange.emit(normalizeReferenceImages(this.d));
      this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
      if(this.hasOuterTrace() && this.openPanel == 'base') {
        this.draftChange.emit(this.renderOuterSilhouette());
      }
    }

    renderBounds(this.d.params, true)(g, ui);
  };

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    // In case the component is torn down mid-drag (recipe switch, navigation).
    window.removeEventListener('pointermove', this.onPlateDragMove);
    window.removeEventListener('pointerup', this.onPlateDragEnd);
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
      crossArching: () => this.changeCrossArching(),
      // A loaded template may already satisfy every panel guard (canOpenPanel), letting the
      // user jump straight to Export without the intermediate panels ever having run their
      // change handlers this session — so the path cache those handlers populate could still
      // be empty. Force them to run now so every key Export reads is guaranteed to exist.
      export: () => {
        this.debounceController?.markImmediate();
        this.changeCenterBout();
        this.debounceController?.markImmediate();
        this.changeOuterTrace();
        this.debounceController?.markImmediate();
        this.changeMould();
      },
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
      case 'crossArching': return this.hasCenterBout();
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

  // ===== Path cache =====
  // Populated incrementally by each panel's change handler as soon as it has what
  // it needs; consumed by export (and eventually render) instead of recalculating.
  // Exception: 'mould' is never populated here — it's expensive and export-only,
  // so ExportPanel computes it directly instead of reading it from this cache.

  private upsertPath(key: string, path: string): void {
    const entry = this.d.paths.find(p => p.key === key);
    if (entry) entry.path = path;
    else this.d.paths.push({ key, path });
  }

  private getPath(key: string): string {
    return this.d.paths.find(p => p.key === key)!.path;
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
      this.upsertPath('inner', defineInnerPath(p));
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
      const topPath = defineOuterPath(p, offset, true, false);
      const backPath = defineOuterPath(p, offset, true, true);
      const purflingPath = definePurflingPath(p, offset);
      const outerPurflingPath = defineOuterPurflingPath(p, offset);
      const flutingAreaPath = defineFlutingAreaPath(p, p.innerFlutingDepth, p.outerFlutingDepth, p.innerFlutingDepth_cBout);
      const flutingLinePath = defineFlutingPath(p, offset, p.innerFlutingDepth_cBout);
      // Null until the arching module has initialized the channel params.
      const troughPath = defineTroughPath(p);

      this.upsertPath('top', topPath);
      this.upsertPath('back', backPath);
      if (purflingPath) this.upsertPath('purfling', purflingPath);
      if (outerPurflingPath) this.upsertPath('outerPurfling', outerPurflingPath);
      if (flutingAreaPath) this.upsertPath('flutingArea', flutingAreaPath);
      if (flutingLinePath) this.upsertPath('flutingLine', flutingLinePath);
      if (troughPath) this.upsertPath('flutingTrough', troughPath);

      // The panel previews the back plate — it carries the button and is the most informative trace.
      // Fluting is a filled area, so it must be drawn before the purfling lines or it paints over them.
      const renders: Array<(g: any, ui: any) => void> = [renderPath(backPath, this.colors.outerTrace)];
      if (flutingAreaPath) renders.push(renderFilledPath(flutingAreaPath, this.colors.fluting));
      // if (troughPath) renders.push(renderPath(troughPath, this.colors.fluting, 1));
      if (purflingPath) renders.push(renderPath(purflingPath, this.colors.innerTrace, 1));
      if (outerPurflingPath) renders.push(renderPath(outerPurflingPath, this.colors.innerTrace, 1));
      renders.push(renderOuterTraceGuides(p, this.colors, this.viewFlags, true));

      this.draftChange.emit(renders);
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
      const { span, yStart, topPath, backPath } = calculateLongArch(p);
      this.draftChange.emit([renderLongArch(p, a, this.colors, this.viewFlags.showModuleGuides, topPath, backPath, span, yStart)]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  /**
   * The contour grid is by far the costliest part of the cross-arching redraw,
   * and it depends only on the params, so rotation and station drags reuse
   * the cached rings/polylines and only a real value change recomputes them.
   * Rings and outline/trough polylines are kept in local plate coordinates
   * (no offset, no rotation baked in) so they can be projected at any angle.
   */
  private archContourCache: {
    key: string;
    top: { levels: ArchContourLevel[]; outlinePts: Pt[] | null; troughPts: Pt[] | null } | null;
    bottom: { levels: ArchContourLevel[]; outlinePts: Pt[] | null; troughPts: Pt[] | null } | null;
  } = { key: '', top: null, bottom: null };

  /**
   * Wireframe surface sampling is rotation-independent: the cache holds raw
   * strip/rib geometry (one set per plate) and each redraw only re-projects it,
   * so rotation drags skip the expensive topSurfaceZAt sweep.
   */
  private wireframeCache: {
    key: string;
    top: WireframeGeometry | null;
    bottom: WireframeGeometry | null;
  } = { key: '', top: null, bottom: null };

  /**
   * The sampled surface model is pure params → geometry; rebuilding it costs
   * tens of ms (three path samplings) per plate, so station drags reuse it.
   */
  private surfaceModelCache: {
    key: string;
    top: PlateSurfaceModel | null;
    bottom: PlateSurfaceModel | null;
  } | null = null;

  changeCrossArching(): void {
    if (!this.d.params.arching) {
      this.d.params.arching = defaultArchingParams(this.d.params.height);
    }
    const a = this.d.params.arching;
    for (const plate of [a.top, a.bottom]) {
      plate.cross ??= defaultCrossArchParams();
      // Older recipes carry a cross block without the cycloid window; backfill it.
      plate.cross.pct ??= defaultCrossArchParams().pct;
      plate.fluting ??= defaultFlutingChannelParams();
    }
    const p = this.d.params;
    const f = this.viewFlags;
    // The station is ephemeral view state; default to the c-bout waist (C0's centre height)
    // the first time the panel opens this session.
    f.crossSectionY ??= Math.round(p.bouts.C0?.y ?? p.height / 2);

    this.debounce(() => safeRun(() => {
      this.runCrossArchingRedraw();
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  /**
   * Plate rotation (wireframe or 3D contours) is driven by a mouse drag
   * (60fps ticks) rather than a discrete edit, so it bypasses the
   * debounce/history pipeline entirely: no 1800ms settle delay, and no
   * per-tick `pushHistory()` flooding the undo stack with near-duplicate
   * snapshots of unchanged params. Rotation is ephemeral view state, same as
   * the station slider, so nothing is lost by skipping the history push.
   */
  redrawPlateRotation(): void {
    safeRun(() => this.runCrossArchingRedraw());
  }

  // ===== Plate drag-to-rotate (shared by the wireframe and 3D contour views) =====
  //
  // The hit frame drawn around the active plate view (renderWireframeDragFrame)
  // only reports drag *start* — every rotation tick tears down and rebuilds
  // the whole canvas, so an SVG element's own pointer capture wouldn't
  // survive a single tick. Move/up are tracked on `window` instead, which is
  // stable across redraws, so a fast drag keeps tracking even if the cursor
  // strays outside the frame mid-drag.
  private static readonly PLATE_DEG_PER_PX = 0.4;
  private plateDragActive = false;
  private plateDragLastX = 0;
  private plateDragLastY = 0;

  private onPlateDragStart = (event: PointerEvent): void => {
    // Stop this from bubbling into draft-canvas's own pointerdown handler —
    // draft-canvas has no idea this frame exists and should stay that way.
    event.stopPropagation();
    event.preventDefault();
    this.plateDragActive = true;
    this.plateDragLastX = event.clientX;
    this.plateDragLastY = event.clientY;
    window.addEventListener('pointermove', this.onPlateDragMove);
    window.addEventListener('pointerup', this.onPlateDragEnd);
  };

  private onPlateDragMove = (event: PointerEvent): void => {
    const dx = event.clientX - this.plateDragLastX;
    const dy = event.clientY - this.plateDragLastY;
    this.plateDragLastX = event.clientX;
    this.plateDragLastY = event.clientY;

    // Horizontal drag yaws the body on its length axis; vertical drag pitches
    // it to reveal more or less of the arch profile — see the rotation-axis
    // notes in renders/oblique-projection.ts.
    const f = this.viewFlags;
    f.plateRotYDeg = normalizeDegrees((f.plateRotYDeg ?? 0) + dx * CerutiViolin.PLATE_DEG_PER_PX);
    f.plateRotXDeg = clamp((f.plateRotXDeg ?? 0) - dy * CerutiViolin.PLATE_DEG_PER_PX, -90, 90);
    this.redrawPlateRotation();
  };

  private onPlateDragEnd = (): void => {
    this.plateDragActive = false;
    window.removeEventListener('pointermove', this.onPlateDragMove);
    window.removeEventListener('pointerup', this.onPlateDragEnd);
    // The cursor/dragging state changed but nothing else did; redraw once
    // more so the frame's grab/grabbing cursor updates back.
    this.redrawPlateRotation();
  };

  private runCrossArchingRedraw(): void {
    const a = this.d.params.arching!;
    const p = this.d.params;
    const f = this.viewFlags;
    f.crossSectionY = clamp(f.crossSectionY ?? 0, 1, p.height - 1);
    // The plate slabs span the outer path, whose corner arcs must be current.
    calculateOuterArcs(p);
    // Snapshot taken after calculateOuterArcs so the key is deterministic.
    // One key serves the model, contour, and wireframe caches: all three
    // depend only on params (yOffset derives from params too).
    const paramsKey = JSON.stringify(p);
    if (this.surfaceModelCache?.key !== paramsKey) {
      this.surfaceModelCache = {
        key: paramsKey,
        top: buildPlateSurfaceModel(p, 'top'),
        bottom: buildPlateSurfaceModel(p, 'bottom'),
      };
    }
    const model = this.surfaceModelCache.top;
    const backModel = this.surfaceModelCache.bottom;
    const halfWidthInner = innerHalfWidthAtY(p, f.crossSectionY);
    // Chords come from the surface model's sampled outer path: the arc-only
    // queries miss the cubic corner tips, voiding the corner-band stations.
    const chords = model ? stationChordsAt(p, model, f.crossSectionY) : null;
    const halfWidthOuter = chords?.outerHalf ?? outerHalfWidthAtY(p, f.crossSectionY);
    const flutingOuterHalf = chords?.platformOuterHalf ?? flutingOuterHalfWidthAtY(p, f.crossSectionY);
    const flutingInnerHalf = chords?.flutingInnerHalf ?? flutingHalfWidthAtY(p, f.crossSectionY);
    const crossTop = calculateCrossArchTop(p, f.crossSectionY, 'top');
    const crossBack = calculateCrossArchTop(p, f.crossSectionY, 'bottom');

    const flutingSlice = model ? calculateFlutingSectionTop(p, model, f.crossSectionY) : null;
    const flutingSliceBack = backModel ? calculateFlutingSectionTop(p, backModel, f.crossSectionY) : null;

    const renders = [
      renderCrossSection(p, a, this.colors, f.showModuleGuides, halfWidthInner, halfWidthOuter, flutingOuterHalf, flutingInnerHalf, crossTop?.path ?? null, flutingSlice, crossBack?.path ?? null, flutingSliceBack),
    ];
    // yOffset lifts the overlay above the section. Only one plate's overlay is ever
    // shown at a time, so it sits centered (xOffset 0) on the shared Y axis rather
    // than split to either side.
    const yOffset = a.ribHeight + a.top.thickness + a.top.arch.archHeight + 15;
    const rotX = f.plateRotXDeg ?? 0;
    const rotY = f.plateRotYDeg ?? 0;
    const rotZ = f.plateRotZDeg ?? 0;

    const showTopContours = f.topPlateView === 'contours';
    const showBackContours = f.backPlateView === 'contours';
    if ((showTopContours || showBackContours) && (model || backModel)) {
      // Only the requested side is computed — the other stays null in the cache.
      if (this.archContourCache.key !== paramsKey) {
        this.archContourCache = { key: paramsKey, top: null, bottom: null };
      }
      const c = this.archContourCache;
      // Level step and grid spacing scale with this plate's arch height and
      // the instrument's overall size, so a cello or bass renders roughly the
      // same number of contour levels (and the same grid point count) a
      // violin does, instead of 2-3x as many.
      if (showTopContours && model) {
        const { stepMm, gridMm } = contourSampleSteps(p, a.top.arch.archHeight);
        c.top ??= {
          levels: computeArchContourRings(p, model, stepMm, gridMm),
          outlinePts: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, false), 1),
          troughPts: (() => { const t = defineTroughPath(p, 'top'); return t ? samplePathToPolyline(t, 1) : null; })(),
        };
        const levels = projectArchContourRings(c.top.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        const outline = c.top.outlinePts ? projectFlatPolyline(c.top.outlinePts, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1) : null;
        const trough = c.top.troughPts ? projectFlatPolyline(c.top.troughPts, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1) : null;
        renders.push(renderArchContours3d(this.colors, levels, outline, trough, this.colors.archTop));
        const bounds = computeArchContourBounds(c.top.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        renders.push(renderWireframeDragFrame(bounds, this.colors, this.plateDragActive, this.onPlateDragStart));
      }
      if (showBackContours && backModel) {
        const { stepMm, gridMm } = contourSampleSteps(p, a.bottom.arch.archHeight);
        c.bottom ??= {
          levels: computeArchContourRings(p, backModel, stepMm, gridMm),
          outlinePts: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, true), 1),
          troughPts: (() => { const t = defineTroughPath(p, 'bottom'); return t ? samplePathToPolyline(t, 1) : null; })(),
        };
        const levels = projectArchContourRings(c.bottom.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        const outline = c.bottom.outlinePts ? projectFlatPolyline(c.bottom.outlinePts, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1) : null;
        const trough = c.bottom.troughPts ? projectFlatPolyline(c.bottom.troughPts, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1) : null;
        renders.push(renderArchContours3d(this.colors, levels, outline, trough, this.colors.archBack));
        const bounds = computeArchContourBounds(c.bottom.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        renders.push(renderWireframeDragFrame(bounds, this.colors, this.plateDragActive, this.onPlateDragStart));
      }
    }
    const showTopWireframe = f.topPlateView === 'wireframe';
    const showBackWireframe = f.backPlateView === 'wireframe';
    if ((showTopWireframe || showBackWireframe) && (model || backModel)) {
      // Surface sampling is rotation-independent; rotation and station drags
      // only re-project the cached geometry, which is a few thousand mul-adds.
      if (this.wireframeCache.key !== paramsKey) {
        this.wireframeCache = { key: paramsKey, top: null, bottom: null };
      }
      const wf = this.wireframeCache;
      // Station/sample spacing scale with body size so a cello or bass
      // renders roughly the same number of cross-section strips (and the
      // same points per strip) a violin does, instead of 2-3x as many.
      const { stationStepMm, sampleStepMm } = wireframeSampleSteps(p);
      if (showTopWireframe && model) {
        wf.top ??= computeWireframeGeometry(p, model, stationStepMm, sampleStepMm);
        const top = projectWireframe(wf.top, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        const highlightTop = f.crossSectionY != null
          ? computeSingleWireframeStrip(p, model, f.crossSectionY, yOffset, rotX, rotY, rotZ, 1, sampleStepMm, 0, 1)
          : null;
        renders.push(renderArch3dWireframe(this.colors, top.strips, top.ribs, highlightTop, this.colors.archTop));
        const bounds = computeWireframeBounds(wf.top, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        renders.push(renderWireframeDragFrame(bounds, this.colors, this.plateDragActive, this.onPlateDragStart));
      }
      if (showBackWireframe && backModel) {
        wf.bottom ??= computeWireframeGeometry(p, backModel, stationStepMm, sampleStepMm);
        const back = projectWireframe(wf.bottom, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        const highlightBack = f.crossSectionY != null
          ? computeSingleWireframeStrip(p, backModel, f.crossSectionY, yOffset, rotX, rotY, rotZ, 1, sampleStepMm, 0, -1)
          : null;
        renders.push(renderArch3dWireframe(this.colors, back.strips, back.ribs, highlightBack, this.colors.archBack));
        const bounds = computeWireframeBounds(wf.bottom, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        renders.push(renderWireframeDragFrame(bounds, this.colors, this.plateDragActive, this.onPlateDragStart));
      }
    }
    this.draftChange.emit(renders);
  }
  changeMould(): void {
    this.debounce(() => safeRun(() => {
      const p = this.d.params;
      // The accurate, export-quality mould (10x denser boolean diff) is only ever
      // consumed by the export panel, so it computes it on demand instead of it
      // being recalculated here on every edit.
      const innerPath = this.getPath('inner');
      const previewMouldPath = calculateMould(p, false, this.viewFlags.simpleClampBox);
      this.draftChange.emit([
        renderMould(p, this.colors, this.viewFlags.showBlocks, this.viewFlags.showInnerPath, previewMouldPath, innerPath),
      ]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

}
