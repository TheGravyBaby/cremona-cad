import { ChangeDetectorRef, Component, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../../recipe-base/recipe-base';
import { RecipeToolbarComponent } from '../../recipe-toolbar/recipe-toolbar';
import { ThemeService } from '../../theme/theme.service';
import { PANEL_KEY, RECIPE_KEY, readWorkingState, writeWorkingState } from '../../helpers/workingStorage';
import { isLocalHost } from '../../helpers/debugDump';
import { normalizeViolinFamilyRecipe } from './normalizer/violin-family-normalizer';
import {
  blankViolinFamilyRecipe, DEFAULT_VIOLIN_FAMILY_VIEW_FLAGS, VIOLIN_FAMILY_PANEL_IDS,
  VIOLIN_FAMILY_VIEW_FLAGS_KEY, ViolinFamilyPanel, ViolinFamilyPanelId, ViolinFamilyParams, ViolinFamilyRecipe,
  ViolinFamilyTemplate, ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from './violin-family-types';
import { BaseMeasurementsPanel, solveBodyRatios } from './panels/base-measurements-panel/base-measurements-panel';
import { MainBoutsPanel, solveMainBouts, solveMainBoutsRatios } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel, solveCornersRatios } from './panels/corners-panel/corners-panel';
import { CenterBoutPanel, solveCenterBout, solveCenterBoutRatios } from './panels/center-bout-panel/center-bout-panel';
import { OuterContourPanel, solveOuterContour, solveOuterContourRatios } from './panels/outer-contour-panel/outer-contour-panel';
import { FlutingPanel, solveFluting } from './panels/fluting-panel/fluting-panel';
import { FHolePlacementPanel, solveFholePlacementRatios } from './panels/fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel, solveFholeContoursRatios } from './panels/fhole-contours-panel/fhole-contours-panel';
import { LongArchingPanel, solveLongArching } from './panels/long-arching-panel/long-arching-panel';
import { CrossArchingPanel } from './panels/cross-arching-panel/cross-arching-panel';
import { NeckPanel } from './panels/neck-panel/neck-panel';
import { VolutePanel } from './panels/volute-panel/volute-panel';
import { ScrollPanel, solveScroll } from './panels/scroll-panel/scroll-panel';
import { ScrollWidthsPanel } from './panels/scroll-widths-panel/scroll-widths-panel';
import { StringSetupPanel } from './panels/string-setup-panel/string-setup-panel';
import { MouldPanel } from './panels/mould-panel/mould-panel';
import { ExportPanel } from './panels/export-panel/export-panel';
import { DevExportPanel } from './panels/dev-export-panel/dev-export-panel';
import { CORPUS_TEMPLATES, isLocSourced, thumbnailHref } from './templates/corpus';

// The Violin Family recipe: the Ceruti model rebuilt on a split between what the user sets
// (`d.params`, the file) and what each panel's solver derives from it (never written out). The
// shell owns panel order, the file, undo and the view toggles; every panel solves and draws itself.
//
// An edit takes two paths from here. A field writes its param through ngModel and calls its
// panel's edited(), which redraws at once and lands in onPanelEdit: commit() follows once the
// typing stops.

@Component({
  selector: 'app-violin-family',
  imports: [FormsModule, RecipeToolbarComponent, BaseMeasurementsPanel, MainBoutsPanel, CornersPanel, CenterBoutPanel, OuterContourPanel, FlutingPanel, FHolePlacementPanel, FHoleContoursPanel, LongArchingPanel, CrossArchingPanel, NeckPanel, VolutePanel, ScrollPanel, ScrollWidthsPanel, StringSetupPanel, MouldPanel, ExportPanel, DevExportPanel],
  templateUrl: './violin-family.html',
  styleUrls: ['../../sidebar.css', './violin-family.css'],
})
export class ViolinFamily extends RecipeComponentBase<ViolinFamilyRecipe> {

  protected readonly panelOrder: readonly PanelEntry[] = [
    { id: 'base', label: 'Base Measurements', toggles: BaseMeasurementsPanel.renderToggles },
    { id: 'mainBouts', label: 'Main Bouts', toggles: MainBoutsPanel.renderToggles, seed: MainBoutsPanel.seed },
    { id: 'corners', label: 'Corners', toggles: CornersPanel.renderToggles, seed: CornersPanel.seed },
    // no seed: its numbers are seeded with the bouts and the corners
    { id: 'centerBout', label: 'Center Bout', toggles: CenterBoutPanel.renderToggles },
    { id: 'outerContour', label: 'Outer Contour', toggles: OuterContourPanel.renderToggles, seed: OuterContourPanel.seed },
    { id: 'fluting', label: 'Fluting Channel', toggles: FlutingPanel.renderToggles, seed: FlutingPanel.seed },
    { id: 'fHolePlacement', label: 'F-Hole Placement', toggles: FHolePlacementPanel.renderToggles, seed: FHolePlacementPanel.seed },
    { id: 'fHoleContours', label: 'F-Hole Contours', toggles: FHoleContoursPanel.renderToggles, seed: FHoleContoursPanel.seed },
    { id: 'longArching', label: 'Long Arching', toggles: LongArchingPanel.renderToggles, seed: LongArchingPanel.seed },
    // no seed: its shape is seeded with the long arch
    { id: 'crossArching', label: 'Cross Arching', toggles: CrossArchingPanel.renderToggles },
    { id: 'neck', label: 'Neck', toggles: NeckPanel.renderToggles, seed: NeckPanel.seed },
    { id: 'volute', label: 'Volute', toggles: VolutePanel.renderToggles, seed: VolutePanel.seed },
    // no seed: the scroll is seeded whole with the volute
    { id: 'scroll', label: 'Scroll', toggles: ScrollPanel.renderToggles },
    { id: 'scrollWidths', label: 'Scroll Widths', toggles: ScrollWidthsPanel.renderToggles },
    { id: 'stringSetup', label: 'String Setup', toggles: StringSetupPanel.renderToggles, seed: StringSetupPanel.seed },
    { id: 'mould', label: 'Mould', toggles: MouldPanel.renderToggles, seed: MouldPanel.seed },
    { id: 'export', label: 'Export', toggles: ExportPanel.renderToggles },
    // drives the maker's own CNC, so it is never offered off localhost; its component is only named
    // inside @defer, so its planner is a separate chunk that is fetched only when the tab opens
    ...(isLocalHost() ? [{ id: 'devExport', label: 'Dev Export', toggles: ['showBlocks', 'showRibOutline'] } as const] : []),
  ];

  private readonly themeService = inject(ThemeService);

  // a field initializer, not a lifecycle hook: the base class restores a session in ngOnInit by
  // matching the stored recipeName against this one, so it has to be set before then
  override d: ViolinFamilyRecipe = blankViolinFamilyRecipe();
  override openPanel: ViolinFamilyPanelId = 'base';

  viewFlags: ViolinFamilyViewFlags = { ...DEFAULT_VIOLIN_FAMILY_VIEW_FLAGS, ...readStoredViewFlags() };

  // only one panel is ever mounted, behind mutually exclusive @if blocks in the template
  @ViewChild('panelRef') private panelRef?: ViolinFamilyPanel;

  constructor(private readonly cdr: ChangeDetectorRef) {
    super();
    effect(() => {
      this.themeService.mode();
      this.panelRef?.draw();
    });
    this.initializePanelFlow(this.panelOrder);
    this.initializeDebounce(() => this.refreshBoundInputs());
  }

  get renderToggleButtons(): readonly ViolinFamilyToggleKey[] {
    return this.panelOrder.find(panel => panel.id === this.openPanel)?.toggles ?? [];
  }

  private _lastLoadedParamsSnapshot = '';

  // the gallery is the base panel's first section while it's open: on a first visit, with no session
  // to restore, and when asked for from the file menu. Picking a card, the blank or hiding it puts it away
  galleryOpen = false;

  // off localhost, a template with an image from a host other than the Library of Congress is left
  // out; see isLocSourced
  get templateCards(): { key: string; instrument: string; meta: string; thumb?: string }[] {
    return CORPUS_TEMPLATES
      .filter(t => isLocalHost() || isLocSourced(t))
      .map(t => ({ key: t.key, instrument: t.fileName, meta: t.description ?? '', thumb: thumbnailHref(t) }));
  }

  openTemplateGallery(): void {
    this.galleryOpen = true;
    this.setOpenPanel('base');
  }

  // asks only when there is work to lose, as starting a new instrument does
  loadTemplate(key: string): void {
    let template = CORPUS_TEMPLATES.find(t => t.key === key);
    if (!template || !this.confirmDiscard('Load template? Any unsaved changes will be lost.')) return;
    this.loadFile(JSON.parse(JSON.stringify(template)) as ViolinFamilyTemplate);
    this.galleryOpen = false;
  }

  private confirmDiscard(message: string): boolean {
    let dirty = !!this._lastLoadedParamsSnapshot && JSON.stringify(this.d.params) !== this._lastLoadedParamsSnapshot;
    return !dirty || confirm(message);
  }

  // the session's panel is put back before the first draw, so the right panel is the one that mounts
  override ngOnInit(): void {
    let freshVisit = !this.readStoredRecipe();
    super.ngOnInit();
    this.galleryOpen = freshVisit;
    this.panelFlow?.refreshEnabledPanels();
    let saved = readWorkingState(PANEL_KEY) ?? '';
    let known = (VIOLIN_FAMILY_PANEL_IDS as readonly string[]).includes(saved);
    this.setOpenPanel(known && this.isPanelEnabled(saved) ? saved : this.openPanel);
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
  }

  // the canvas calls this after mount and after every load: a new drawing, so it's framed. The
  // open panel does the drawing, once the template has caught up with a replaced `d`
  override firstRender = (): void => {
    this.requestFit.emit();
    setTimeout(() => this.panelRef?.draw());
  };

  // every way a panel opens comes through here: a pick, the session, a load, an undo. Its stage is
  // seeded before it mounts, so a panel never sees its own params missing; edits seed again below
  protected override setOpenPanel(panel: string): void {
    // dev export draws in the machine's coordinates, the mould shifted onto the sheet, so crossing
    // in or out moves the whole drawing; framed again once the new panel has drawn
    if ((panel === 'devExport') !== (this.openPanel === 'devExport')) setTimeout(() => this.requestFit.emit());
    super.setOpenPanel(panel);
    this.panelOrder.find(entry => entry.id === panel)?.seed?.(this.d.params);
    // the stage just seeded is what unlocks the next panel
    this.panelFlow?.refreshEnabledPanels();
  }

  override canOpenPanel(panel: string): boolean {
    let p = this.d.params;
    switch (panel) {
      case 'base': return true;
      case 'mainBouts': return p.body.width > 0 && p.body.height > 0;
      case 'corners': {
        let m = solveMainBouts(p);
        return !!(m?.U0 && m.U1 && m.L0 && m.L1);
      }
      case 'centerBout': return !!p.corners;
      case 'outerContour':
      case 'mould':
      case 'export': {
        let cb = solveCenterBout(p);
        return !!(cb?.C0 && cb.C2 && cb.C1);
      }
      case 'fluting': return !!solveOuterContour(p)?.top;
      case 'fHolePlacement': return !!solveOuterContour(p)?.top;
      case 'fHoleContours': return !!p.fHoles;
      case 'longArching': {
        let f = solveFluting(p);
        return !!(f?.top && f.back);
      }
      case 'crossArching': return !!p.arching;
      case 'neck': return !!p.arching && !!solveLongArching(p)?.ribs;
      case 'volute': return !!p.neck;
      case 'scroll': return !!p.scroll;
      case 'scrollWidths': {
        let s = solveScroll(p);
        return !!s && !s.failures.length;
      }
      case 'stringSetup': return !!p.neck;
      case 'devExport': return isLocalHost() && !!p.mould;
      default: return false;
    }
  }

  // undo just replaced `d` wholesale, and the panel's binding still points at the old object
  // until change detection runs, so the redraw waits a macrotask
  protected override onStateRestored(): void {
    setTimeout(() => {
      if (this._destroyed) return;
      this.panelRef?.draw();
    });
  }

  protected override refreshBoundInputs(): void {
    queueMicrotask(() => this.cdr.markForCheck());
  }

  onRenderToggle(key: ViolinFamilyToggleKey): void {
    this.viewFlags[key] = !this.viewFlags[key];
    writeWorkingState(VIOLIN_FAMILY_VIEW_FLAGS_KEY, JSON.stringify(this.viewFlags));
    this.panelRef?.draw();
  }

  // a panel's field was edited: its stage is seeded again (a toggle may have opened new fields),
  // and the commit waits for the typing to stop. The panel redraws itself straight after
  onPanelEdit(): void {
    this.panelOrder.find(entry => entry.id === this.openPanel)?.seed?.(this.d.params);
    this.debounce(() => this.commit());
  }

  // what an edit settles into: debounce() has pushed the undo entry by the time this runs
  private commit(): void {
    this.panelFlow?.refreshEnabledPanels();
    this.panelRef?.report();
    this.stampRatios();
    writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
  }

  // the ratios ride on the file as a record for study; nothing reads them back, so they are
  // rewritten from the params before every write rather than trusted. One line per panel
  private stampRatios(): void {
    let p = this.d.params;
    this.d.ratios = {
      ...solveBodyRatios(p),
      ...solveMainBoutsRatios(p),
      ...solveCornersRatios(p),
      ...solveCenterBoutRatios(p),
      ...solveOuterContourRatios(p),
      ...solveFholePlacementRatios(p),
      ...solveFholeContoursRatios(p),
    };
  }

  protected override serializeRecipe(): string {
    this.stampRatios();
    return super.serializeRecipe();
  }

  protected override normalize(file: unknown): ViolinFamilyRecipe | null {
    return normalizeViolinFamilyRecipe(file);
  }

  override loadFile(raw: unknown): void {
    super.loadFile(raw);
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
    this.panelFlow?.refreshEnabledPanels();
    this.setOpenPanel('base');
    writeWorkingState(PANEL_KEY, 'base');
  }

  onNewClick(): void {
    if (!this.confirmDiscard('Start a new instrument? Any work you have not saved will be lost.')) return;
    this.loadFile(blankViolinFamilyRecipe());
    this.galleryOpen = false;
  }

  // the toolbar's name field sits outside the panel, so it commits by hand
  onFileNameChange(name: string): void {
    this.d.fileName = name;
    this.debounce(() => this.commit());
  }
}

interface PanelEntry {
  id: ViolinFamilyPanelId;
  label: string;
  toggles: readonly ViolinFamilyToggleKey[];
  seed?: (p: ViolinFamilyParams) => void;
}

// spread over the defaults, so a flag added since the tab last wrote picks up its default
function readStoredViewFlags(): Partial<ViolinFamilyViewFlags> {
  try {
    return JSON.parse(readWorkingState(VIOLIN_FAMILY_VIEW_FLAGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
