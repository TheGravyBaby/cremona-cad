import { Injectable, inject } from '@angular/core';
import { DraftShape } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { SceneStore } from './scene-index';

export type SelectionSource = 'toolbox' | 'scene';

/** One selected thing: a shape in ToolboxStore, or a piece of the recipe's rendered geometry
 * out of SceneStore — read-only, since the recipe redraws it from the params. */
export type SelectionRef = { source: SelectionSource; id: string };

export function toolboxRef(id: string): SelectionRef {
  return { source: 'toolbox', id };
}

export function sceneRef(id: string): SelectionRef {
  return { source: 'scene', id };
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
 * A scene ref resolves through SceneStore the same way, and drops when the recipe stops drawing
 * that piece — a param edit that moves an arc moves it out of the selection.
 */
@Injectable({ providedIn: 'root' })
export class SelectionStore {
  private toolbox = inject(ToolboxStore);
  private scene = inject(SceneStore);
  private refs = new Map<string, SelectionRef>();
  private listeners = new Set<() => void>();
  /** The group a double-click opened: its members select one at a time and show their handles
   * while it stays open. Left the moment nothing in it is selected. */
  private _enteredGroup: string | null = null;

  constructor() {
    this.toolbox.onChange(() => this.retainEditable());
    this.scene.onChange(() => this.retainScene());
  }

  get size(): number { return this.refs.size; }

  has(ref: SelectionRef): boolean { return this.refs.has(keyOf(ref)); }

  get all(): SelectionRef[] { return [...this.refs.values()]; }

  /** Everything selected: drawn shapes first, then recipe geometry. What a tool that only reads
   * the selection (Offset) wants; anything that edits wants toolboxShapes. */
  get shapes(): DraftShape[] {
    return [...this.toolboxShapes, ...this.sceneShapes];
  }

  /** The selected toolbox shapes, resolved fresh from the store's editable list. */
  get toolboxShapes(): DraftShape[] {
    if (this.refs.size === 0) return [];
    return this.toolbox.getEditableShapes().filter(s => this.refs.has(keyOf(toolboxRef(s.id))));
  }

  /** The selected pieces of recipe geometry — read-only. */
  get sceneShapes(): DraftShape[] {
    if (!this.hasSceneRefs()) return [];
    return this.scene.shapes.filter(s => this.refs.has(keyOf(sceneRef(s.id))));
  }

  /** The single selected shape of either kind, or undefined for zero or several. */
  get shape(): DraftShape | undefined {
    return this.refs.size === 1 ? this.shapes[0] : undefined;
  }

  /** The single selected toolbox shape, or undefined for zero or several — per-type settings
   * fields only make sense for exactly one, and only an editable one. */
  get toolboxShape(): DraftShape | undefined {
    return this.refs.size === 1 ? this.toolboxShapes[0] : undefined;
  }

  /** Replaces the selection. A grouped shape brings its whole group: the group is the unit every
   * selection path — click, marquee, paste — hands out, so nothing downstream has to know. */
  set(refs: SelectionRef[]): void {
    const next = new Map(this.withGroups(refs).map(r => [keyOf(r), r]));
    const changed = next.size !== this.refs.size || [...next.keys()].some(k => !this.refs.has(k));
    this.refs = next;
    this.leaveGroupIfEmpty();
    // asked even when nothing changed: a panel switch drops the reveal (ToolboxStore.setActivePanel),
    // and re-selecting the same image from the layer list is how it asks for it back
    this.reveal();
    if (changed) this.notify();
  }

  /** Plain click: just this, or nothing. */
  select(ref: SelectionRef | null): void {
    this.set(ref ? [ref] : []);
  }

  /** Shift-click: in if out, out if in, the rest untouched — the whole group, for a grouped shape. */
  toggle(ref: SelectionRef): void {
    const refs = this.withGroups([ref]);
    const out = this.refs.has(keyOf(ref));
    for (const r of refs) {
      if (out) this.refs.delete(keyOf(r));
      else this.refs.set(keyOf(r), r);
    }
    this.leaveGroupIfEmpty();
    this.reveal();
    this.notify();
  }

  get enteredGroup(): string | null { return this._enteredGroup; }

  /** Opens the group `ref` belongs to and selects `ref` alone within it. */
  enter(ref: SelectionRef): void {
    const shape = this.toolbox.getEditableShapes().find(s => s.id === ref.id);
    if (ref.source !== 'toolbox' || !shape?.groupId) return;
    this._enteredGroup = shape.groupId;
    this.set([ref]);
  }

  private withGroups(refs: SelectionRef[]): SelectionRef[] {
    const editable = this.toolbox.getEditableShapes();
    const groups = new Set(refs.filter(r => r.source === 'toolbox')
      .map(r => editable.find(s => s.id === r.id)?.groupId)
      .filter(g => g !== undefined && g !== this._enteredGroup));
    if (groups.size === 0) return refs;
    return [...refs, ...editable.filter(s => s.groupId && groups.has(s.groupId)).map(s => toolboxRef(s.id))];
  }

  private leaveGroupIfEmpty(): void {
    if (this._enteredGroup && !this.toolboxShapes.some(s => s.groupId === this._enteredGroup)) this._enteredGroup = null;
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

  // asked before touching SceneStore.shapes, since reading those rebuilds the index
  private hasSceneRefs(): boolean {
    for (const ref of this.refs.values()) if (ref.source === 'scene') return true;
    return false;
  }

  private retainScene(): void {
    if (!this.hasSceneRefs()) return;
    const drawn = new Set(this.scene.shapes.map(s => s.id));
    let changed = false;
    for (const [key, ref] of this.refs) {
      if (ref.source === 'scene' && !drawn.has(ref.id)) {
        this.refs.delete(key);
        changed = true;
      }
    }
    if (changed) this.notify();
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
    this.leaveGroupIfEmpty();
    if (changed) this.notify();
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }
}
