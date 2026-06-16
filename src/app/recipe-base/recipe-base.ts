import { AfterViewInit, Component, HostListener, output } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { Pt, RecipeInterface, ReferenceImage } from '../models/types';
import { PanelFlow, PanelDefinition } from '../helpers/panelFlow';
import { DebounceController } from '../helpers/debounce-controller';
import { NamedConstant, DEFAULT_NAMED_CONSTANTS, nearestFraction } from '../helpers/nearestFraction';

export type { NamedConstant };

@Component({
  selector: 'app-recipe-base',
  imports: [],
  templateUrl: './recipe-base.html',
  styleUrl: './recipe-base.css',
})

export abstract class RecipeComponentBase implements AfterViewInit {
  static readonly DEFAULT_NAMED_CONSTANTS: readonly NamedConstant[] = DEFAULT_NAMED_CONSTANTS;

  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();
  @Output() setBounds = new EventEmitter<{pt1: Pt, pt2: Pt}>();
  @Output() referenceImageChange = new EventEmitter<ReferenceImage | null>();

  @Input() cameraBounds: { pt1: Pt, pt2: Pt } | null = null;

  loadFile(file: RecipeInterface): void {
    this.d = file;
    this.draftChange.emit([this.firstRender]);
  }

  @Input() set referenceImageParams(img: ReferenceImage | null | undefined) {
    this.d.params = this.d.params || {};
    if (img) this.d.referenceImage = img;
    else delete this.d.referenceImage;
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

  protected debounce(fn: () => void, delay = 1800): void {
    this.debounceController?.run(() => {
      this.pushHistory();
      fn();
    }, delay);
  }

  /** Snapshot the current state onto the history stack. */
  pushHistory(): void {
    if (this._isRestoringHistory) return;
    // Discard any forward history when a new change is made
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(JSON.stringify(this.d));
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
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
      this.panelFlow?.refreshEnabledPanels();
      this.debounceController?.markImmediate();
      const handlers = this.getActivationHandlers();
      handlers[this.openPanel]?.();
      this.refreshBoundInputs();
    } finally {
      this._isRestoringHistory = false;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onUndoRedoKeyDown(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    if (e.key === 'z' || e.key === 'Z') {
      if (e.shiftKey) {
        if (this.canRedo) { e.preventDefault(); this.redo(); }
      } else {
        if (this.canUndo) { e.preventDefault(); this.undo(); }
      }
    } else if (e.key === 'y' || e.key === 'Y') {
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

  protected abstract getActivationHandlers(): Record<string, () => void>;

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
    const handlers = this.getActivationHandlers();
    handlers[panel]?.();
  }


 ngOnInit() {
    const recipeData = this.loadMatchingSessionRecipe();
    if (recipeData) {
      this.d = recipeData;
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
    queueMicrotask(() => {
      this.draftChange.emit([this.firstRender]);
    });
  }

  ngOnDestroy() {
    this._destroyed = true;
    this.debounceController?.destroy();
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    sessionStorage.setItem('openPanel', this.openPanel);
  }

  firstRender(canvas: any, ui: any) {
  }

  saveToDisk() {
    const safeName = (this.d.fileName?.trim() || 'untitled') + (this.d.fileName?.endsWith('.json') ? '' : '.json');
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

  onReferenceImageChange(img: ReferenceImage | null) {
    this.d.params = this.d.params || {};
    if (img) this.d.referenceImage = img;
    else delete this.d.referenceImage;

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

    // reference image controls
  async onReferenceFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const dataUrl = await this.readFileAsDataUrl(file);
    const { w, h } = await this.getImageSize(dataUrl);

    // Scale image to fit within the current camera bounds (mirrors draft-canvas logic)
    const aspect = w / h || 1;
    let imgW: number;
    let imgH: number;
    let imgX: number;
    let imgY: number;

    if (this.cameraBounds) {
      const bW = Math.abs(this.cameraBounds.pt2.x - this.cameraBounds.pt1.x);
      const bH = Math.abs(this.cameraBounds.pt2.y - this.cameraBounds.pt1.y);
      const bCx = (this.cameraBounds.pt1.x + this.cameraBounds.pt2.x) / 2;
      const bCy = (this.cameraBounds.pt1.y + this.cameraBounds.pt2.y) / 2;

      if (bW / bH > aspect) {
        imgH = bH;
        imgW = imgH * aspect;
      } else {
        imgW = bW;
        imgH = imgW / aspect;
      }

      imgX = bCx - imgW / 2;
      imgY = bCy - imgH / 2;
    } else {
      // No bounds set — fall back to a 200 mm wide default
      imgW = 200;
      imgH = imgW / aspect;
      imgX = -imgW / 2;
      imgY = 0;
    }

    this.d.referenceImage = {
      href: dataUrl,
      'xlink:href': dataUrl,
      x: imgX,
      y: imgY,
      width: imgW,
      height: imgH,
      rotationDeg: 0,
    };

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    this.referenceImageChange.emit(this.d.referenceImage);

    input.value = '';
  }

    private readFileAsDataUrl(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
  }

  private getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
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