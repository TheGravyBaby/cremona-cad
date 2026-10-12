import { ChangeDetectorRef, Component, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { RecipeToolbarComponent } from '../recipe-toolbar/recipe-toolbar';
import { ThemeService } from '../theme/theme.service';
import { PANEL_KEY, RECIPE_KEY, readWorkingState, writeWorkingState } from '../helpers/workingStorage';
import { error } from '../shared/message-emitter';
import { RecipeInterface } from '../models/types';
import {
  blankViolinFamilyRecipe, DEFAULT_VIOLIN_FAMILY_VIEW_FLAGS, VIOLIN_FAMILY_PANEL_IDS, VIOLIN_FAMILY_RECIPE_NAME,
  VIOLIN_FAMILY_VIEW_FLAGS_KEY, ViolinFamilyPanel, ViolinFamilyPanelId, ViolinFamilyParams, ViolinFamilyRecipe,
  ViolinFamilyToggleKey, ViolinFamilyViewFlags,
} from './violin-family-types';
import { BaseMeasurementsPanel, solveBodyRatios } from './panels/base-measurements-panel/base-measurements-panel';
import { MainBoutsPanel, solveMainBouts, solveMainBoutsRatios } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel, solveCornersRatios } from './panels/corners-panel/corners-panel';

// The Violin Family recipe: the Ceruti model rebuilt on a split between what the user sets
// (`d.params`, the file) and what each panel's solver derives from it (never written out). The
// shell owns panel order, the file, undo and the view toggles; every panel solves and draws itself.
//
// An edit takes two paths from here. A field writes its param through ngModel and calls its
// panel's edited(), which redraws at once and lands in onPanelEdit: commit() follows once the
// typing stops.

@Component({
  selector: 'app-violin-family',
  imports: [FormsModule, RecipeToolbarComponent, BaseMeasurementsPanel, MainBoutsPanel, CornersPanel],
  templateUrl: './violin-family.html',
  styleUrls: ['../sidebar.css', './violin-family.css'],
})
export class ViolinFamily extends RecipeComponentBase {

  protected readonly panelOrder: readonly PanelEntry[] = [
    { id: 'base', label: 'Base Measurements', toggles: BaseMeasurementsPanel.renderToggles },
    { id: 'mainBouts', label: 'Main Bouts', toggles: MainBoutsPanel.renderToggles, seed: MainBoutsPanel.seed },
    { id: 'corners', label: 'Corners', toggles: CornersPanel.renderToggles, seed: CornersPanel.seed },
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

  // the session's panel is put back before the first draw, so the right panel is the one that mounts
  override ngOnInit(): void {
    super.ngOnInit();
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
    };
  }

  protected override serializeRecipe(): string {
    this.stampRatios();
    return super.serializeRecipe();
  }

  // the toolbar hands over whatever JSON was picked; another recipe's file is turned away whole
  // rather than opened onto params it doesn't have
  override loadFile(file: RecipeInterface): void {
    if (file.recipeName !== VIOLIN_FAMILY_RECIPE_NAME) {
      error(`This file is a ${file.recipeName || 'different'} recipe, not a Violin Family one.`, 'Load Recipe');
      return;
    }
    super.loadFile(file as ViolinFamilyRecipe);
    this._lastLoadedParamsSnapshot = JSON.stringify(this.d.params);
    this.panelFlow?.refreshEnabledPanels();
    this.setOpenPanel('base');
    writeWorkingState(PANEL_KEY, 'base');
  }

  onNewClick(): void {
    let dirty = !!this._lastLoadedParamsSnapshot && JSON.stringify(this.d.params) !== this._lastLoadedParamsSnapshot;
    if (dirty && !confirm('Start a new instrument? Any work you have not downloaded will be lost.')) return;
    this.loadFile(blankViolinFamilyRecipe());
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
