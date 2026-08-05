import { AfterViewInit, Component, HostListener, output, afterNextRender, inject, Injector } from '@angular/core';
import { Output, EventEmitter } from "@angular/core";
import { RecipeInterface } from '../models/types';
import { PanelFlow, PanelDefinition } from '../helpers/panelFlow';
import { DebounceController } from '../helpers/debounce-controller';
import { NamedConstant, DEFAULT_NAMED_CONSTANTS, nearestFraction } from '../helpers/nearestFraction';
import { computeStepSize, stepAmountForKey } from '../helpers/stepSize';
import { ToolboxStore } from '../draft-canvas/tools/toolbox-store';
import { ImageAssetStore } from '../draft-canvas/tools/image-asset-store';
import { UndoCoordinator, Undoable } from '../helpers/undoCoordinator';
import { PANEL_KEY, RECIPE_KEY, readWorkingState, writeWorkingState } from '../helpers/workingStorage';
import { copyToClipboard, setDebugContext } from '../helpers/debugDump';
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

export abstract class RecipeComponentBase implements AfterViewInit, Undoable {
  static readonly DEFAULT_NAMED_CONSTANTS: readonly NamedConstant[] = DEFAULT_NAMED_CONSTANTS;

  readonly id = 'recipe';

  private readonly injector = inject(Injector);
  protected readonly toolbox = inject(ToolboxStore);
  protected readonly imageAssets = inject(ImageAssetStore);
  private readonly undoCoordinator = inject(UndoCoordinator);
  private toolboxSyncUnsub?: () => void;
  private undoCoordinatorUnsub?: () => void;

  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();

  /**
   * Asks the canvas to re-frame its camera. Carries no coordinates — the canvas fits to what it
   * has actually rendered (recipe output, drawn shapes, reference images, the 3D previews), which
   * a recipe can't describe and shouldn't have to.
   *
   * Emit only when the drawing is replaced wholesale — a new file, a loaded template. An ordinary
   * parameter edit must not emit: yanking the camera while someone is typing a dimension throws
   * away the zoom and pan they set. `F` re-frames on demand.
   */
  @Output() requestFit = new EventEmitter<void>();

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
    this.onRecipeAdopted();
    // A freshly loaded file starts with nothing to undo past — otherwise Ctrl+Z could step back
    // into a previous file's params. Same reason ToolboxStore resets its own history on load.
    this._history = [];
    this._historyIndex = -1;
    this.undoCoordinator.reset(this.id);
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
   * Runs immediately after `this.d` is replaced wholesale — a file, a template, a new blank, a
   * session restore — and before anything reads it. The place for a recipe to migrate its own
   * older saved formats forward.
   *
   * A subclass that assigns `this.d` itself is responsible for calling this; every assignment in
   * this base class already does. Deliberately not tied to a panel's lifecycle: params are read by
   * exports and surface builders that a user can reach without opening the panel that owns them.
   */
  protected onRecipeAdopted(): void { }

  /**
   * Hands a recipe's reference images to the canvas. This, plus syncReferenceImages() on the way
   * back out, is the entire coupling between a recipe and the reference-image feature: the canvas
   * owns placed images as ordinary shapes from here on, and `this.d.referenceImages` is just
   * their serialized form (see reference-image-schema.ts).
   *
   * Call after any assignment to `this.d` that brings new reference images with it.
   */
  protected loadReferenceImages(source: ReferenceImageSource): void {
    this.toolbox.loadImages(imageShapesFromRecipe(source, this.imageAssets));
  }

  /**
   * Mirrors the canvas's placed images back into `this.d` so whichever code path persists the
   * recipe next — a working-state write, saveToDisk, a subclass's own snapshot — picks them up
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
    this.applyModifiedStep(e);
  }

  /**
   * Shift/Ctrl/Cmd+Arrow on a number input takes a bigger/smaller step than a plain arrow press.
   * Shift scales the live `[step]` binding up; Ctrl (Windows/Linux) or Cmd (Mac) switches to a
   * fixed unit instead — `data-fine-step` on the input if a field opts into a finer one (see
   * stepSize.ts), else 1. Only modified presses are intercepted — a plain arrow or a spinner
   * click keeps using the browser's native stepping against `[step]`. A native spinner click
   * can't expose modifier-key state to JS, so this is keyboard-only by design.
   */
  private applyModifiedStep(e: KeyboardEvent): void {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;

    e.preventDefault();
    const current = target.valueAsNumber;
    if (Number.isNaN(current)) return;

    const baseStep = Number(target.step) || 1;
    const fineStep = Number(target.dataset['fineStep']) || 1;
    const delta = stepAmountForKey(e, baseStep, fineStep);
    let next = current + (e.key === 'ArrowUp' ? delta : -delta);
    if (target.min !== '') next = Math.max(next, Number(target.min));
    if (target.max !== '') next = Math.min(next, Number(target.max));
    next = Math.round(next * 1e6) / 1e6;

    target.value = String(next);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * A step size scaled to `value`, biased toward whole numbers, floored at `floor` — the
   * field's own hand-tuned `step` literal. Bind to `[step]` so both native arrow-key stepping
   * and spinner clicks pick it up; see helpers/stepSize.ts.
   */
  protected stepFor(value: number, floor: number, percent?: number): number {
    return computeStepSize(value, floor, percent);
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
   * Everything ToolboxStore owns is left out — reference images and drawn shapes alike. That store
   * keeps its own history (see onUndoRedoKeyDown), so snapshotting it here would be redundant and
   * expensive across a 50-entry stack. `toolboxState` in particular is written onto `this.d` by
   * saveToDisk and stays there, so it would otherwise ride along in every later snapshot as a
   * stale copy. */
  pushHistory(): void {
    if (this._isRestoringHistory) return;
    // Discard any forward history when a new change is made
    this._history = this._history.slice(0, this._historyIndex + 1);
    const { referenceImages, referenceImage, toolboxState, ...withoutCanvasState } = this.d;
    this._history.push(JSON.stringify(withoutCanvasState));
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    this._historyIndex = this._history.length - 1;
    this.undoCoordinator.notify(this.id);
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
      writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
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

  // The draft-canvas toolbox (line/shape tools) keeps its own history, separate from this
  // recipe's `d` snapshots. UndoCoordinator merges both into one chronological timeline, so
  // Ctrl+Z reaches whichever acted most recently rather than one having fixed priority.
  @HostListener('window:keydown', ['$event'])
  onUndoRedoKeyDown(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        if (this.undoCoordinator.canRedo()) { e.preventDefault(); this.undoCoordinator.redo(); }
      } else {
        if (this.undoCoordinator.canUndo()) { e.preventDefault(); this.undoCoordinator.undo(); }
      }
    } else if (e.key === 'y' || e.key === 'Y') {
      if (this.undoCoordinator.canRedo()) { e.preventDefault(); this.undoCoordinator.redo(); }
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
    writeWorkingState(PANEL_KEY, panel);
    this.onPanelActivated(panel);
  }


 ngOnInit() {
    // Keeps `d.referenceImages` current with whatever the canvas holds, so every existing
    // persist path (working-state writes, saveToDisk, subclass snapshots) serializes images
    // without needing to know they exist. See syncReferenceImages.
    this.toolboxSyncUnsub = this.toolbox.onChange(() => this.syncReferenceImages());
    this.undoCoordinatorUnsub = this.undoCoordinator.register(this);
    setDebugContext(() => this.debugViewContext());

    const recipeData = this.loadMatchingStoredRecipe();
    if (recipeData) {
      this.d = recipeData;
      this.onRecipeAdopted();
      this.loadReferenceImages(recipeData);
      this.panelFlow?.refreshEnabledPanels();
    }
  }

  /**
   * Reads the stored working recipe, but only returns it if its `recipeName` matches this
   * component's current recipe. Every recipe shares the one key, so this guards against e.g.
   * switching between recipes and loading incompatible data.
   */
  protected loadMatchingStoredRecipe<T extends RecipeInterface = RecipeInterface>(): T | null {
    const saved = readWorkingState(RECIPE_KEY);
    if (!saved) return null;
    try {
      const recipeData = JSON.parse(saved);
      if (recipeData.recipeName === this.d.recipeName) {
        return recipeData as T;
      }
      console.warn('Saved recipe does not match current recipe. Ignoring saved data.');
      return null;
    } catch (e) {
      console.error('Failed to load stored recipe', e);
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
    this.undoCoordinatorUnsub?.();
    setDebugContext(null);
    writeWorkingState(RECIPE_KEY, JSON.stringify(this.d));
    writeWorkingState(PANEL_KEY, this.openPanel);
  }

  firstRender(canvas: any, ui: any) {
  }

  /**
   * The recipe as a file, mirroring the canvas back into `this.d` first —
   * `toolboxState` is only written here, so a plain stringify would carry
   * whatever drawing state was current the last time something saved.
   *
   * Mutating, therefore save-only. The debug copy deliberately does not come
   * through here; see copyRecipeToClipboard.
   */
  protected serializeRecipe(): string {
    this.d.toolboxState = this.toolbox.exportState();
    // Writes `referenceImages` in exactly the format every previous version of the app wrote, so
    // a file saved here still opens in an older build.
    this.syncReferenceImages();
    return this.stringifyRecipe(false);
  }

  /**
   * `stripImageData` drops the reference images' pixel payload only. An uploaded
   * scan is a `data:` URL that can run to megabytes and says nothing about the
   * drawing, while where it sits and what it is called is often the whole point
   * of the question — so the placement fields stay and the bytes become a stub.
   * The download never strips: a file has to reopen with its references intact.
   */
  private stringifyRecipe(stripImageData: boolean): string {
    if (!stripImageData) return JSON.stringify(this.d, null, 2);
    return JSON.stringify(this.d, (key, value) => {
      if (key !== 'href' && key !== 'xlink:href') return value;
      if (typeof value !== 'string') return value;
      // A template's image is a short path like '/StradGoetz.jpg' — worth keeping as-is.
      return value.startsWith('data:') ? `[image data stripped, ${value.length} chars]` : value;
    }, 2);
  }

  /**
   * Debug: the recipe on the clipboard, read without writing.
   *
   * Reads `this.d` as it stands rather than going through `serializeRecipe`,
   * because that one mirrors the canvas back into the recipe first — and a
   * button for inspecting state must not change the state being inspected.
   * `referenceImages` is live regardless (the ToolboxStore subscription in
   * ngOnInit keeps it so); the one field that can be stale here is
   * `toolboxState`, and the canvas's own `/` reports drawn shapes live.
   */
  copyRecipeToClipboard(): void {
    copyToClipboard('recipe', this.stringifyRecipe(true));
  }

  /**
   * What the canvas dump reports under `view` — the state that decides what was
   * drawn, as opposed to what was drawn. Deliberately not folded into
   * copyRecipeToClipboard: that one's output has to stay a recipe file, so it
   * can be pasted straight back in or turned into a test fixture.
   *
   * Override to add a recipe's own view toggles; call super and spread.
   */
  protected debugViewContext(): Record<string, unknown> {
    return { openPanel: this.openPanel };
  }

  saveToDisk() {
    const safeName = (this.d.fileName?.trim() || 'untitled') + (this.d.fileName?.endsWith('.json') ? '' : '.json');
    const json = this.serializeRecipe();

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