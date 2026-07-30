import { AfterViewInit, Component, HostListener, output, afterNextRender, inject, Injector } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { Pt, RecipeInterface } from '../models/types';
import { PanelFlow, PanelDefinition } from '../helpers/panelFlow';
import { DebounceController } from '../helpers/debounce-controller';
import { NamedConstant, DEFAULT_NAMED_CONSTANTS, nearestFraction } from '../helpers/nearestFraction';
import { ToolboxStore } from '../draft-canvas/tools/toolbox-store';
import { ImageAssetStore } from '../draft-canvas/tools/image-asset-store';
import {
  ReferenceImageSource, imageShapesFromRecipe, imageShapesToRecipe,
} from '../draft-canvas/tools/reference-image-schema';

export type { NamedConstant };

@Component({
  selector: 'app-recipe-base',
  imports: [],
  templateUrl: './recipe-base.html',
  styleUrl: './recipe-base.css',
})

export abstract class RecipeComponentBase implements AfterViewInit {
  static readonly DEFAULT_NAMED_CONSTANTS: readonly NamedConstant[] = DEFAULT_NAMED_CONSTANTS;

  private readonly injector = inject(Injector);
  protected readonly toolbox = inject(ToolboxStore);
  protected readonly imageAssets = inject(ImageAssetStore);
  private toolboxSyncUnsub?: () => void;

  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();
  @Output() setBounds = new EventEmitter<{pt1: Pt, pt2: Pt}>();

  @Input() cameraBounds: { pt1: Pt, pt2: Pt } | null = null;

  loadFile(file: RecipeInterface): void {
    // Snapshot the file's reference images before touching the stores. resetAll() below both
    // clears the asset table and (through the sync subscription) rewrites `d.referenceImages`
    // from the now-empty canvas — and `file` becomes `this.d`, so reading it afterwards would
    // read back the wipe rather than the file.
    const incoming: ReferenceImageSource = {
      referenceImages: file.referenceImages,
      referenceImage: file.referenceImage,
    };

    this.d = file;
    // Toolbox shapes are drawn separately from the recipe's own render pipeline (ToolboxStore is
    // a root singleton, not part of `this.d`) — always start from a clean slate, then restore
    // whatever this file itself saved (if anything), so drawings from a previously open file or
    // template don't linger into the newly loaded one.
    this.toolbox.resetAll();
    this.toolbox.loadState(file.toolboxState);
    this.loadReferenceImages(incoming);
    this.draftChange.emit([this.firstRender]);
  }

  /**
   * Hands a recipe's reference images to the canvas. This — plus syncReferenceImages() on the way
   * back out — is the entire coupling between a recipe and the reference-image feature: the
   * canvas owns placed images as ordinary shapes from here on, and `this.d.referenceImages` is
   * just their serialized form (see reference-image-schema.ts). Templates and saved files carry
   * that field unchanged, including the long-deprecated singular `referenceImage`.
   *
   * Call this after any assignment to `this.d` that brings new reference images with it.
   */
  protected loadReferenceImages(source: ReferenceImageSource): void {
    this.toolbox.loadImages(imageShapesFromRecipe(source, this.imageAssets));
  }

  /**
   * Mirrors the canvas's placed images back into `this.d` so whichever code path persists the
   * recipe next — a sessionStorage write, saveToDisk, a subclass's own snapshot — picks them up
   * without having to know images exist. Subscribed to ToolboxStore so it can't be forgotten at
   * a call site.
   */
  private syncReferenceImages(): void {
    this.d.referenceImages = imageShapesToRecipe(this.toolbox.getImageShapes(), this.imageAssets);
    // Drop the legacy singular field so it can't shadow the array on save.
    delete this.d.referenceImage;
  }

  d: RecipeInterface = {
    recipeName: "",
    fileName: "tst",
    version: "",
    params: undefined,
    paths: undefined
  }

  openPanel: string = "base";

  // ===== Undo / Redo history =====
  private _history: string[] = [];
  private _historyIndex = -1;
  private readonly _maxHistory = 50;
  private _isRestoringHistory = false;

  get canUndo(): boolean { return this._historyIndex > 0; }
  get canRedo(): boolean { return this._historyIndex < this._history.length - 1; }

  // ===== Lifecycle & resource management =====
  protected _destroyed = false;
  protected debounceController?: DebounceController;

  protected initializeDebounce(callback: () => void): void {
    this.debounceController = new DebounceController(callback);
  }

  @HostListener('keydown', ['$event'])
  onHostKeyDown(e: KeyboardEvent) {
    this.debounceController?.markImmediateFromKey(e);
  }

  @HostListener('mousedown', ['$event'])
  onHostMouseDown(e: MouseEvent) {
    this.debounceController?.markImmediateFromMouse(e);
  }

  protected debounce(fn: () => void, delay = 1800): void {
    this.debounceController?.run(() => {
      this.pushHistory();
      fn();
    }, delay);
  }

  /** Snapshot the current state onto the history stack.
   *
   * Reference images are left out: they're owned by ToolboxStore, which keeps its own history
   * (see onUndoRedoKeyDown), so snapshotting them here would be both redundant and expensive —
   * an uploaded image is a base64 payload, and this stack holds up to 50 entries. */
  pushHistory(): void {
    if (this._isRestoringHistory) return;
    // Discard any forward history when a new change is made
    this._history = this._history.slice(0, this._historyIndex + 1);
    const { referenceImages, referenceImage, ...withoutImages } = this.d;
    this._history.push(JSON.stringify(withoutImages));
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    } else {
      this._historyIndex = this._history.length - 1;
    }
  }

  undo(): void {
    if (!this.canUndo) return;
    this._historyIndex--;
    this.d = JSON.parse(this._history[this._historyIndex]);
    this._afterHistoryRestore();
  }

  redo(): void {
    if (!this.canRedo) return;
    this._historyIndex++;
    this.d = JSON.parse(this._history[this._historyIndex]);
    this._afterHistoryRestore();
  }

  private _afterHistoryRestore(): void {
    this._isRestoringHistory = true;
    try {
      // The restored snapshot has no reference images in it (see pushHistory) — put the canvas's
      // current ones back before persisting, or this write would drop them from the session.
      this.syncReferenceImages();
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
      this.panelFlow?.refreshEnabledPanels();
      const current = this.panelFlow?.getCurrent(this.openPanel);
      if (current) this.openPanel = current;
      this.debounceController?.markImmediate();
      this.onStateRestored();
      this.refreshBoundInputs();
    } finally {
      this._isRestoringHistory = false;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onUndoRedoKeyDown(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    // The draft-canvas toolbox (line/shape tools) keeps its own history, separate
    // from this recipe's `d` snapshots. It takes precedence whenever it has
    // something to undo/redo, so a shape you just drew doesn't get skipped over.
    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        if (this.toolbox.canRedo) { e.preventDefault(); this.toolbox.redo(); return; }
        if (this.canRedo) { e.preventDefault(); this.redo(); }
      } else {
        if (this.toolbox.canUndo) { e.preventDefault(); this.toolbox.undo(); return; }
        if (this.canUndo) { e.preventDefault(); this.undo(); }
      }
    } else if (e.key === 'y' || e.key === 'Y') {
      if (this.toolbox.canRedo) { e.preventDefault(); this.toolbox.redo(); return; }
      if (this.canRedo) { e.preventDefault(); this.redo(); }
    }
  }

  protected refreshBoundInputs(): void {
    // Override in subclasses if needed (e.g., for change detection)
  }

  // ===== Panel navigation system =====
  protected panelFlow: PanelFlow<string> | null = null;

  protected initializePanelFlow(panelOrder: readonly PanelDefinition<string>[]): void {
    this.panelFlow = new PanelFlow<string>(panelOrder, (panel) => this.canOpenPanel(panel));
    this.panelFlow.refreshEnabledPanels();
  }

  protected abstract canOpenPanel(panel: string): boolean;

  protected onPanelActivated(_panel: string): void {}

  protected onStateRestored(): void {
    this.onPanelActivated(this.openPanel);
  }

  /** Forces the currently open panel subtree to unmount/remount so panel-owned ngOnInit redraws run again.
   * Must be a macrotask (setTimeout), not queueMicrotask: microtasks all drain before Angular's zone
   * runs change detection, so a microtask-scheduled restore flips openPanel back before Angular ever
   * renders the transient '' — the @if never toggles and ngOnInit never re-fires. */
  protected remountActivePanel(): void {
    const panel = this.openPanel;
    if (!panel) return;
    this.openPanel = '';
    setTimeout(() => {
      if (this._destroyed) return;
      this.openPanel = panel;
      sessionStorage.setItem('openPanel', panel);
      this.refreshBoundInputs();
    });
  }

  protected isPanelEnabled(panel: string): boolean {
    return this.panelFlow?.isEnabled(panel) ?? false;
  }

  protected onPanelSelect(panel: string): void {
    if (!panel || !this.panelFlow) return;
    this.panelFlow.refreshEnabledPanels();
    const selected = this.panelFlow.select(panel);
    if (!selected) return;
    this.activatePanel(selected);
  }

  protected canStepPanel(direction: 1 | -1 | number): boolean {
    return this.panelFlow?.canStep(this.openPanel, direction) ?? false;
  }

  protected stepPanel(direction: 1 | -1 | number): void {
    if (!this.panelFlow) return;
    this.panelFlow.refreshEnabledPanels();
    const nextPanel = this.panelFlow.step(this.openPanel, direction);
    if (!nextPanel) return;
    this.activatePanel(nextPanel);
  }

  protected get panelProgressMax(): number {
    return this.panelFlow?.getProgress(this.openPanel).total ?? 1;
  }

  protected get panelProgressNow(): number {
    return this.panelFlow?.getProgress(this.openPanel).current ?? 1;
  }

  protected get panelProgressPercent(): number {
    return this.panelFlow?.getProgress(this.openPanel).percent ?? 100;
  }

  protected activatePanel(panel: string): void {
    if (!this.isPanelEnabled(panel)) return;
    this.openPanel = panel;
    sessionStorage.setItem('openPanel', panel);
    this.onPanelActivated(panel);
  }


 ngOnInit() {
    // Keeps `d.referenceImages` current with whatever the canvas holds, so every existing
    // persist path (sessionStorage writes, saveToDisk, subclass snapshots) serializes images
    // without needing to know they exist. See syncReferenceImages.
    this.toolboxSyncUnsub = this.toolbox.onChange(() => this.syncReferenceImages());

    const recipeData = this.loadMatchingSessionRecipe();
    if (recipeData) {
      this.d = recipeData;
      this.loadReferenceImages(recipeData);
      this.panelFlow?.refreshEnabledPanels();
    }
  }

  /**
   * Reads `recipeData` from sessionStorage, but only returns it if its
   * `recipeName` matches this component's current recipe. Since every recipe
   * shares the same sessionStorage key, this guards against e.g. switching
   * between recipes and loading incompatible data
   */
  protected loadMatchingSessionRecipe<T extends RecipeInterface = RecipeInterface>(): T | null {
    const saved = sessionStorage.getItem('recipeData');
    if (!saved) return null;
    try {
      const recipeData = JSON.parse(saved);
      if (recipeData.recipeName === this.d.recipeName) {
        return recipeData as T;
      }
      console.warn('Saved recipe does not match current recipe. Ignoring saved data.');
      return null;
    } catch (e) {
      console.error('Failed to load from sessionStorage', e);
      return null;
    }
  }

  ngAfterViewInit() {
    afterNextRender(() => {
      this.draftChange.emit([this.firstRender]);
    }, { injector: this.injector });
  }

  ngOnDestroy() {
    this._destroyed = true;
    this.debounceController?.destroy();
    this.syncReferenceImages();
    this.toolboxSyncUnsub?.();
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    sessionStorage.setItem('openPanel', this.openPanel);
  }

  firstRender(canvas: any, ui: any) {
  }

  saveToDisk() {
    const safeName = (this.d.fileName?.trim() || 'untitled') + (this.d.fileName?.endsWith('.json') ? '' : '.json');
    this.d.toolboxState = this.toolbox.exportState();
    // Writes `referenceImages` in exactly the format every previous version of the app wrote, so
    // a file saved here still opens in an older build.
    this.syncReferenceImages();
    const limitedJson = {
      ...this.d,
      paths: []

    }
    const json = JSON.stringify(this.d, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  onToggle(panel: string, event: Event) {
    const details = event.target as HTMLDetailsElement;
    if (details.open) {
      this.openPanel = panel;
    }
  }

  addCalcs(calcs: { name: string, d: any }[]) {
    this.d.paths = this.d.paths || [];
    for (const entry of calcs) {
      const idx = this.d.paths.findIndex((c: any) => c.name === entry.name);
      if (idx === -1) this.d.paths.push(entry);
      else this.d.paths[idx] = entry;
    }
  }

  nearestFraction(
    value: number,
    maxNumerator: number = 21,
    maxDenominator: number = 16,
    namedConstants: ReadonlyArray<NamedConstant> = RecipeComponentBase.DEFAULT_NAMED_CONSTANTS,
  ): string {
    return nearestFraction(value, maxNumerator, maxDenominator, namedConstants);
  }

}