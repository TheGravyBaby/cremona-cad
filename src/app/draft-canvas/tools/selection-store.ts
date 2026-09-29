import { Injectable, inject } from '@angular/core';
import { DraftShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';

export type SelectionSource = 'toolbox' | 'scene';

/** One selected thing: a shape in ToolboxStore, or a piece of the recipe's rendered geometry
 * (`scene` — reserved for the scene index; nothing produces one yet). */
export type SelectionRef = { source: SelectionSource; id: string };

export function toolboxRef(id: string): SelectionRef {
  return { source: 'toolbox', id };
}

const keyOf = (ref: SelectionRef): string => `${ref.source}:${ref.id}`;

/**
 * What is selected on the canvas. A root singleton, like ToolboxStore, because the selection is
 * read by more than the canvas: the settings bar describes it and the operations tab will act on
 * it, and neither should be handed it through the component that happens to own the pointer.
 * draft-canvas writes hit results in; everything else reads.
 *
 * Holds refs, not shapes. A toolbox ref resolves through getEditableShapes on every read, so the
 * selection can never hand out a stale copy of a shape the store has since patched — and it drops
 * a ref itself when its shape stops being editable (deleted, undone, its layer hidden or locked).
 */
@Injectable({ providedIn: 'root' })
export class SelectionStore {
  private toolbox = inject(ToolboxStore);
  private refs = new Map<string, SelectionRef>();
  private listeners = new Set<() => void>();

  constructor() {
    this.toolbox.onChange(() => this.retainEditable());
  }

  get size(): number { return this.refs.size; }

  has(ref: SelectionRef): boolean { return this.refs.has(keyOf(ref)); }

  get all(): SelectionRef[] { return [...this.refs.values()]; }

  /** The selected toolbox shapes, resolved fresh from the store's editable list. */
  get shapes(): DraftShape[] {
    if (this.refs.size === 0) return [];
    return this.toolbox.getEditableShapes().filter(s => this.refs.has(keyOf(toolboxRef(s.id))));
  }

  /** The single selected toolbox shape, or undefined for zero or several — per-type settings
   * fields only make sense for exactly one. */
  get shape(): DraftShape | undefined {
    return this.refs.size === 1 ? this.shapes[0] : undefined;
  }

  /** Replaces the selection. */
  set(refs: SelectionRef[]): void {
    const next = new Map(refs.map(r => [keyOf(r), r]));
    const changed = next.size !== this.refs.size || [...next.keys()].some(k => !this.refs.has(k));
    this.refs = next;
    // asked even when nothing changed: a panel switch drops the reveal (ToolboxStore.setActivePanel),
    // and re-selecting the same image from the layer list is how it asks for it back
    this.reveal();
    if (changed) this.notify();
  }

  /** Plain click: just this, or nothing. */
  select(ref: SelectionRef | null): void {
    this.set(ref ? [ref] : []);
  }

  /** Shift-click: in if out, out if in, the rest untouched. */
  toggle(ref: SelectionRef): void {
    const key = keyOf(ref);
    if (this.refs.has(key)) this.refs.delete(key);
    else this.refs.set(key, ref);
    this.reveal();
    this.notify();
  }

  add(refs: SelectionRef[]): void {
    this.set([...this.refs.values(), ...refs]);
  }

  clear(): void {
    this.set([]);
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** A selected image shows even where panel scoping would hide it, so editing its scoping
   * doesn't make it and its controls disappear as you type — see ToolboxStore.setRevealedImage.
   * Looked up across every image, not the editable ones: an off-panel image isn't editable until
   * this very call reveals it. */
  private reveal(): void {
    const imageIds = new Set(this.toolbox.getImageShapes().map(s => s.id));
    const image = this.all.find(r => r.source === 'toolbox' && imageIds.has(r.id));
    this.toolbox.setRevealedImage(image?.id ?? null);
  }

  private retainEditable(): void {
    const editable = new Set(this.toolbox.getEditableShapes().map(s => s.id));
    let changed = false;
    for (const [key, ref] of this.refs) {
      if (ref.source === 'toolbox' && !editable.has(ref.id)) {
        this.refs.delete(key);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }
}
