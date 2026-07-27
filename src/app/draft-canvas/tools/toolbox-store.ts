import { Injectable } from '@angular/core';
import { DraftShape, DEFAULT_SHAPE_COLOR } from './toolbox-shape';
import { Layer, DEFAULT_LAYER_ID, makeLayerId } from './layer';

const STORAGE_KEY = 'draft-canvas-toolbox-shapes';
const MAX_HISTORY = 50;

/**
 * Holds shapes drawn with the draft-canvas toolbox. Backed by sessionStorage
 * so shapes survive a reload but are gone once the tab/session closes —
 * this is a scratch annotation layer, not part of the saved recipe.
 *
 * A root-provided singleton (rather than a plain class draft-canvas `new`s up)
 * so recipe-base's undo/redo keyboard handler can see the same shape history
 * and defer to it — see recipe-base.ts `onUndoRedoKeyDown`.
 */
@Injectable({ providedIn: 'root' })
export class ToolboxStore {
  private shapes: DraftShape[] = [];
  private history: DraftShape[][] = [];
  private historyIndex = -1;
  private listeners = new Set<() => void>();
  private _currentColor: string = DEFAULT_SHAPE_COLOR;
  private _currentDashed = false;
  private _currentBoxLineColor2: string = '#93c5fd';
  private _currentBoxLineWeights: number[] = [1, 1, 1];
  private _layers: Layer[] = [{ id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false }];
  private _activeLayerId: string = DEFAULT_LAYER_ID;

  constructor() {
    this.load();
    this.history = [this.shapes];
    this.historyIndex = 0;
  }

  get canUndo(): boolean { return this.historyIndex > 0; }
  get canRedo(): boolean { return this.historyIndex < this.history.length - 1; }

  /** The "pen" color new shapes are stamped with — not part of undo history, same as other tool preferences. */
  get currentColor(): string { return this._currentColor; }
  set currentColor(color: string) {
    if (this._currentColor === color) return;
    this._currentColor = color;
    this.persist();
    this.notify();
  }

  /** Whether new Line/Circle shapes are stamped dashed — shared by both, same as currentColor is
   * shared across every shape type, rather than tracked separately per shape type. */
  get currentDashed(): boolean { return this._currentDashed; }
  set currentDashed(value: boolean) {
    if (this._currentDashed === value) return;
    this._currentDashed = value;
    this.persist();
    this.notify();
  }

  /** The second alternating color new Box Line shapes will use. */
  get currentBoxLineColor2(): string { return this._currentBoxLineColor2; }
  set currentBoxLineColor2(color: string) {
    if (this._currentBoxLineColor2 === color) return;
    this._currentBoxLineColor2 = color;
    this.persist();
    this.notify();
  }

  /** The segment weights new Box Line shapes will use. */
  get currentBoxLineWeights(): number[] { return this._currentBoxLineWeights; }
  set currentBoxLineWeights(weights: number[]) {
    this._currentBoxLineWeights = weights;
    this.persist();
    this.notify();
  }

  get layers(): Layer[] { return this._layers; }

  private get activeLayer(): Layer {
    return this._layers.find(l => l.id === this._activeLayerId) ?? this._layers[0];
  }

  private layerFor(shape: DraftShape): Layer | undefined {
    const id = shape.layerId ?? DEFAULT_LAYER_ID;
    return this._layers.find(l => l.id === id);
  }

  /** Not undo-tracked — which layer is active is a view preference, same as currentColor. */
  get activeLayerId(): string { return this._activeLayerId; }
  setActiveLayer(id: string): void {
    if (this._activeLayerId === id) return;
    this._activeLayerId = id;
    // Switching onto a layer always shows it — otherwise you'd switch and see nothing.
    this._layers = this._layers.map(l => l.id === id ? { ...l, visible: true } : l);
    this.persist();
    this.notify();
  }

  addLayer(): string {
    const layer: Layer = { id: makeLayerId(), name: `Layer ${this._layers.length + 1}`, visible: true, locked: false };
    this._layers = [...this._layers, layer];
    this._activeLayerId = layer.id;
    this.persist();
    this.notify();
    return layer.id;
  }

  renameLayer(id: string, name: string): void {
    const trimmed = name.trim();
    this._layers = this._layers.map(l => l.id === id ? { ...l, name: trimmed || l.name } : l);
    this.persist();
    this.notify();
  }

  toggleLayerVisible(id: string): void {
    this._layers = this._layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    this.persist();
    this.notify();
  }

  toggleLayerLocked(id: string): void {
    this._layers = this._layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l);
    this.persist();
    this.notify();
  }

  /** Deletes a layer and every shape on it (undo-tracked, since shape removal is). Refuses to delete the last or a locked layer. */
  removeLayer(id: string): void {
    const layer = this._layers.find(l => l.id === id);
    if (this._layers.length <= 1 || layer?.locked) return;
    this._layers = this._layers.filter(l => l.id !== id);
    if (this._activeLayerId === id) this._activeLayerId = this._layers[0].id;
    this.applyMutation(this.shapes.filter(s => (s.layerId ?? DEFAULT_LAYER_ID) !== id));
  }

  getShapes(): DraftShape[] {
    return this.shapes;
  }

  /** Shapes on every visible layer — what should render (and be snappable), regardless of which layer is active. */
  getVisibleShapes(): DraftShape[] {
    const visibleIds = new Set(this._layers.filter(l => l.visible).map(l => l.id));
    return this.shapes.filter(s => visibleIds.has(s.layerId ?? DEFAULT_LAYER_ID));
  }

  /** Shapes that can be selected/edited right now: on the active layer, and only while it's unlocked. */
  getEditableShapes(): DraftShape[] {
    const active = this.activeLayer;
    if (active.locked) return [];
    return this.shapes.filter(s => (s.layerId ?? DEFAULT_LAYER_ID) === active.id);
  }

  addShape(shape: DraftShape): void {
    if (this.layerFor(shape)?.locked) return;
    this.applyMutation([...this.shapes, shape]);
  }

  removeShape(id: string): void {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape || this.layerFor(shape)?.locked) return;
    this.applyMutation(this.shapes.filter(s => s.id !== id));
  }

  /** Patches a shape's properties (e.g. color) in place. Also the primitive a future Move would use for geometry. */
  updateShape(id: string, patch: Partial<DraftShape>): void {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape || this.layerFor(shape)?.locked) return;
    this.applyMutation(this.shapes.map(s => s.id === id ? { ...s, ...patch } as DraftShape : s));
  }

  /** Batched form of updateShape for multi-shape operations (e.g. dragging a selection) — applies
   * every patch in a single history step instead of one step per shape. */
  updateShapes(patches: Map<string, Partial<DraftShape>>): void {
    if (patches.size === 0) return;
    let changed = false;
    const next = this.shapes.map(s => {
      const patch = patches.get(s.id);
      if (!patch || this.layerFor(s)?.locked) return s;
      changed = true;
      return { ...s, ...patch } as DraftShape;
    });
    if (!changed) return;
    this.applyMutation(next);
  }

  /** Clears only the active layer's shapes — Clear is now scoped per layer. */
  clearActiveLayer(): void {
    if (this.activeLayer.locked) return;
    const active = this._activeLayerId;
    this.applyMutation(this.shapes.filter(s => (s.layerId ?? DEFAULT_LAYER_ID) !== active));
  }

  undo(): void {
    if (!this.canUndo) return;
    this.historyIndex--;
    this.shapes = this.history[this.historyIndex];
    this.persist();
    this.notify();
  }

  redo(): void {
    if (!this.canRedo) return;
    this.historyIndex++;
    this.shapes = this.history[this.historyIndex];
    this.persist();
    this.notify();
  }

  /** Registers a callback fired after any mutation/undo/redo; returns an unsubscribe fn. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private applyMutation(next: DraftShape[]): void {
    this.shapes = next;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.shapes);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.persist();
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  private load(): void {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.shapes = parsed; // legacy format, from before currentColor existed
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.shapes)) this.shapes = parsed.shapes;
        if (typeof parsed.currentColor === 'string') this._currentColor = parsed.currentColor;
        if (typeof parsed.currentDashed === 'boolean') this._currentDashed = parsed.currentDashed;
        if (typeof parsed.currentBoxLineColor2 === 'string') this._currentBoxLineColor2 = parsed.currentBoxLineColor2;
        if (Array.isArray(parsed.currentBoxLineWeights)) this._currentBoxLineWeights = parsed.currentBoxLineWeights;
        if (Array.isArray(parsed.layers) && parsed.layers.length > 0) {
          // Normalize layers saved before visible/locked existed.
          this._layers = parsed.layers.map((l: Partial<Layer> & { id: string; name: string }) => ({
            id: l.id, name: l.name, visible: l.visible ?? true, locked: l.locked ?? false,
          }));
        }
        if (typeof parsed.activeLayerId === 'string') this._activeLayerId = parsed.activeLayerId;
      }
    } catch {
      // ignore malformed/blocked sessionStorage
    }
  }

  private persist(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        shapes: this.shapes,
        currentColor: this._currentColor,
        currentDashed: this._currentDashed,
        currentBoxLineColor2: this._currentBoxLineColor2,
        currentBoxLineWeights: this._currentBoxLineWeights,
        layers: this._layers,
        activeLayerId: this._activeLayerId,
      }));
    } catch {
      // ignore storage errors
    }
  }
}
