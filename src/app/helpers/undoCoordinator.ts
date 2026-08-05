import { Injectable, signal } from '@angular/core';

/**
 * Something that keeps its own undo/redo history (RecipeComponentBase, ToolboxStore, or any
 * future undoable surface) and can be told to step through it. UndoCoordinator never holds or
 * restores state itself — each source already knows how to correctly restore its own data (params
 * need panel-flow/working-storage side effects, shapes need persist/notify), so duplicating that
 * centrally would just be a second copy that can drift from the first.
 */
export interface Undoable {
  readonly id: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
}

/**
 * Merges every registered source's local undo history into one chronological timeline, so Ctrl+Z
 * acts on whichever source pushed history most recently rather than a fixed priority order between
 * sources. Holds no snapshots — just the order sources pushed in, as a stack of source ids. A
 * source calls notify() right after it pushes its own local history entry; global undo()/redo()
 * pop an id and delegate to that source's own undo()/redo(), which moves its own local pointer.
 */
@Injectable({ providedIn: 'root' })
export class UndoCoordinator {
  private sources = new Map<string, Undoable>();
  private undoLog: string[] = [];
  private redoLog: string[] = [];

  private readonly _canUndo = signal(false);
  private readonly _canRedo = signal(false);
  readonly canUndo = this._canUndo.asReadonly();
  readonly canRedo = this._canRedo.asReadonly();

  /** Registers a source; returns an unregister fn that also drops its tokens from both logs, for
   * a source (like a per-recipe component) that comes and goes across the app's lifetime. */
  register(source: Undoable): () => void {
    this.sources.set(source.id, source);
    return () => {
      this.sources.delete(source.id);
      this.reset(source.id);
    };
  }

  /** Call right after a source pushes a new entry onto its own local history. Clears the global
   * redo log, same as a fresh edit clears forward history locally. */
  notify(sourceId: string): void {
    this.undoLog.push(sourceId);
    this.redoLog = [];
    this.refresh();
  }

  /** Drops every token belonging to a source whose local history was reset or discarded (a file
   * load, a template load, unregistering) — those tokens no longer point at anything undoable. */
  reset(sourceId: string): void {
    this.undoLog = this.undoLog.filter(id => id !== sourceId);
    this.redoLog = this.redoLog.filter(id => id !== sourceId);
    this.refresh();
  }

  undo(): void {
    const id = this.undoLog.pop();
    if (id === undefined) return;
    const source = this.sources.get(id);
    if (source?.canUndo) {
      source.undo();
      this.redoLog.push(id);
    }
    this.refresh();
  }

  redo(): void {
    const id = this.redoLog.pop();
    if (id === undefined) return;
    const source = this.sources.get(id);
    if (source?.canRedo) {
      source.redo();
      this.undoLog.push(id);
    }
    this.refresh();
  }

  private refresh(): void {
    this._canUndo.set(this.undoLog.length > 0);
    this._canRedo.set(this.redoLog.length > 0);
  }
}
