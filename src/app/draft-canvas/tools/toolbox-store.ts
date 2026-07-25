import { Injectable } from '@angular/core';
import { DraftShape, DEFAULT_SHAPE_COLOR } from './toolbox-shape';

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

  getShapes(): DraftShape[] {
    return this.shapes;
  }

  addShape(shape: DraftShape): void {
    this.applyMutation([...this.shapes, shape]);
  }

  removeShape(id: string): void {
    this.applyMutation(this.shapes.filter(s => s.id !== id));
  }

  /** Patches a shape's properties (e.g. color) in place. Also the primitive a future Move would use for geometry. */
  updateShape(id: string, patch: Partial<DraftShape>): void {
    this.applyMutation(this.shapes.map(s => s.id === id ? { ...s, ...patch } as DraftShape : s));
  }

  clear(): void {
    this.applyMutation([]);
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
      }
    } catch {
      // ignore malformed/blocked sessionStorage
    }
  }

  private persist(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ shapes: this.shapes, currentColor: this._currentColor }));
    } catch {
      // ignore storage errors
    }
  }
}
