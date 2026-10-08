import { Injectable, inject } from '@angular/core';
import { DraftShape, ImageShape, DEFAULT_SHAPE_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_TEXT_SIZE_MM } from './toolbox-shape';
import { Layer, DEFAULT_LAYER_ID, makeLayerId } from './layer';
import { PanelScope, scopeShows, scopeWith } from './panel-scope';
import { ImageAssetStore } from './image-asset-store';
import { readWorkingState, writeWorkingState } from '../../helpers/workingStorage';
import { UndoCoordinator, Undoable } from '../../helpers/undoCoordinator';
import { CANVAS_COLORS } from '../../theme/palettes';

const STORAGE_KEY = 'draft-canvas-toolbox-shapes';
const MAX_HISTORY = 50;

/**
 * Holds shapes drawn with the draft-canvas toolbox. Kept in the browser's working state
 * alongside the recipe (see helpers/workingStorage.ts), so a drawing survives a reload of the tab
 * it was drawn in — but still a scratch annotation layer, not part of the downloaded recipe
 * unless saved with it.
 *
 * A root-provided singleton (rather than a plain class draft-canvas `new`s up) so it stays alive
 * across recipe swaps. Implements `Undoable` and registers with `UndoCoordinator` (see
 * helpers/undoCoordinator.ts), which is what lets Ctrl+Z reach whichever of this store or the open
 * recipe's own history acted most recently, instead of one having fixed priority over the other.
 *
 * Placed reference images (`ImageShape`) live in the same list, so they get selection, move,
 * delete, layers and undo from the same machinery. They are the one exception to the
 * working-state backing: their durable home is the recipe's `referenceImages` field, so
 * exportState leaves them out and they are re-derived from the recipe on load.
 */
// declared here rather than imported from the recipe framework, so the dependency stays one-way.
export type PanelChoice = { id: string; label: string };

@Injectable({ providedIn: 'root' })
export class ToolboxStore implements Undoable {
  readonly id = 'toolbox';
  private imageAssets = inject(ImageAssetStore);
  private undoCoordinator = inject(UndoCoordinator);
  private shapes: DraftShape[] = [];
  private history: DraftShape[][] = [];
  private historyIndex = -1;
  private listeners = new Set<() => void>();
  private _currentColor: string = DEFAULT_SHAPE_COLOR;
  private _currentDashed = false;
  private _currentTextSize = DEFAULT_TEXT_SIZE_MM;
  private _currentStrokeWidth: number = DEFAULT_STROKE_WIDTH;
  private _currentOpacity = 1;
  private _currentSectionColor2: string = CANVAS_COLORS.sectionAlt;
  private _currentSectionWeights: number[] = [1, 1, 1];
  private _currentTickWeights: number[] = [1, 1, 1];
  private _currentCycloidFactor = 1;
  private _currentCycloidPct = 1;
  private _currentFilletRadius = 5;
  private _layers: Layer[] = [{ id: DEFAULT_LAYER_ID, name: 'Layer 1', locked: false }];
  private _activeLayerId: string = DEFAULT_LAYER_ID;
  private _showImages = true;
  private _showShapes = true;
  /** Whether the recipe's own geometry is out of reach of selection — see recipeLocked. */
  private _recipeLocked = true;
  /** The recipe panel currently open — see setActivePanel. */
  private _activePanel: string | null = null;
  /** Panels the open recipe has, for the bottom bar's scope menus. */
  private _availablePanels: PanelChoice[] = [];

  constructor() {
    this.load();
    this.history = [this.shapes];
    this.historyIndex = 0;
    this.undoCoordinator.register(this);
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

  /** The size (world mm) new Text shapes are stamped with. Sticky rather than reset per label:
   * once a drawing's annotations are at a size that reads well against it, the next one wants to
   * match, and re-typing the number every time is the annoying part. */
  get currentTextSize(): number { return this._currentTextSize; }
  set currentTextSize(mm: number) {
    if (!Number.isFinite(mm) || mm <= 0 || this._currentTextSize === mm) return;
    this._currentTextSize = mm;
    this.persist();
    this.notify();
  }

  /** The pen width (screen px) every new stroked shape is drawn at. */
  get currentStrokeWidth(): number { return this._currentStrokeWidth; }
  set currentStrokeWidth(value: number) {
    if (this._currentStrokeWidth === value) return;
    this._currentStrokeWidth = value;
    this.persist();
    this.notify();
  }

  /** The pen opacity (0–1) new Freehand strokes will use. */
  get currentOpacity(): number { return this._currentOpacity; }
  set currentOpacity(value: number) {
    if (this._currentOpacity === value) return;
    this._currentOpacity = value;
    this.persist();
    this.notify();
  }

  /** The second alternating color new Section shapes will use. */
  get currentSectionColor2(): string { return this._currentSectionColor2; }
  set currentSectionColor2(color: string) {
    if (this._currentSectionColor2 === color) return;
    this._currentSectionColor2 = color;
    this.persist();
    this.notify();
  }

  /** The segment weights new Section shapes will use. */
  get currentSectionWeights(): number[] { return this._currentSectionWeights; }
  set currentSectionWeights(weights: number[]) {
    this._currentSectionWeights = weights;
    this.persist();
    this.notify();
  }

  /** The segment weights new Ticks shapes will use. */
  get currentTickWeights(): number[] { return this._currentTickWeights; }
  set currentTickWeights(weights: number[]) {
    this._currentTickWeights = weights;
    this.persist();
    this.notify();
  }

  /** The rolling point's reach (0–1, a full cycloid at 1) and how much of the arch is used (0.05–1.5)
   * for new Cycloids — the two numbers the cross arch panel's cycloid is set by. */
  get currentCycloidFactor(): number { return this._currentCycloidFactor; }
  set currentCycloidFactor(value: number) {
    if (this._currentCycloidFactor === value) return;
    this._currentCycloidFactor = value;
    this.persist();
    this.notify();
  }

  get currentCycloidPct(): number { return this._currentCycloidPct; }
  set currentCycloidPct(value: number) {
    if (this._currentCycloidPct === value) return;
    this._currentCycloidPct = value;
    this.persist();
    this.notify();
  }

  get currentFilletRadius(): number { return this._currentFilletRadius; }
  set currentFilletRadius(value: number) {
    if (!(value > 0) || this._currentFilletRadius === value) return;
    this._currentFilletRadius = value;
    this.persist();
    this.notify();
  }

  /** Master switch for every placed reference image — the one-click "get the photos out of my
   * way" while tracing, over each image's own scope. Not undo-tracked: what you can see is a view
   * preference, not an edit. */
  get showImages(): boolean { return this._showImages; }
  setShowImages(value: boolean): void {
    if (this._showImages === value) return;
    this._showImages = value;
    this.persist();
    this.notify();
  }

  /** Which recipe panel is open, pushed in by RecipeComponentBase. `null` (nothing pushed yet)
   * filters nothing — fails open, so a missing push shows an image too widely rather than hiding
   * it with no indication why. */
  get activePanel(): string | null { return this._activePanel; }
  setActivePanel(panel: string | null): void {
    if (this._activePanel === panel) return;
    this._activePanel = panel;
    this.notify();
  }

  /** Panels a layer or image may be scoped to, for the bottom bar's menus; empty hides them. */
  get availablePanels(): readonly PanelChoice[] { return this._availablePanels; }
  setAvailablePanels(panels: readonly PanelChoice[]): void {
    this._availablePanels = panels.map(p => ({ id: p.id, label: p.label }));
    this.notify();
  }

  /** Whether a layer's or image's scope puts it on the open panel — see panel-scope.ts. */
  shownHere(scope: PanelScope | undefined): boolean {
    return scopeShows(scope, this._activePanel);
  }

  /** Master switch for everything drawn with the toolbox, so a reference image can be examined on
   * its own without hiding each layer in turn. */
  get showShapes(): boolean { return this._showShapes; }
  setShowShapes(value: boolean): void {
    if (this._showShapes === value) return;
    this._showShapes = value;
    this.persist();
    this.notify();
  }

  /** The recipe's rendered geometry behaves like one more layer for selection: locked, a click or
   * marquee passes straight through it to whatever is drawn; unlocked, it can be picked, read
   * off and duplicated (never edited — it's derived from the params). A view preference like the
   * masters above, so not undo-tracked. */
  get recipeLocked(): boolean { return this._recipeLocked; }
  setRecipeLocked(value: boolean): void {
    if (this._recipeLocked === value) return;
    this._recipeLocked = value;
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

  /** Whether a shape is protected from canvas-driven edits. Images answer for themselves (see
   * ImageShape.locked — absent means locked); every other shape inherits its layer's lock. */
  private isShapeLocked(shape: DraftShape): boolean {
    if (shape.type === 'image') return shape.locked ?? true;
    return this.layerFor(shape)?.locked ?? false;
  }

  /** Not undo-tracked — which layer is active is a view preference, same as currentColor. */
  get activeLayerId(): string { return this._activeLayerId; }
  setActiveLayer(id: string): void {
    if (this._activeLayerId === id) return;
    this._activeLayerId = id;
    // Switching onto a layer always shows it here: the next thing you'll do is draw, and a shape
    // that lands somewhere invisible reads as a tool that didn't fire.
    this._layers = this._layers.map(l => l.id === id ? { ...l, scope: scopeWith(l.scope, this._activePanel, true) } : l);
    this.persist();
    this.notify();
  }

  addLayer(): string {
    const layer: Layer = { id: makeLayerId(), name: `Layer ${this._layers.length + 1}`, locked: false };
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

  /** Not undo-tracked, like the lock: where a layer shows is a view preference. */
  setLayerScope(id: string, scope: PanelScope | undefined): void {
    this._layers = this._layers.map(l => l.id === id ? { ...l, scope } : l);
    this.persist();
    this.notify();
  }

  toggleLayerLocked(id: string): void {
    this._layers = this._layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l);
    this.persist();
    this.notify();
  }

  /** Deletes a layer and every shape drawn on it (undo-tracked, since shape removal is). Refuses
   * to delete the last or a locked layer. Placed images survive regardless: they carry no
   * `layerId`, so without the guard here deleting layer 1 would take every reference image with
   * it — they'd fall into its id by default. */
  removeLayer(id: string): void {
    const layer = this._layers.find(l => l.id === id);
    if (this._layers.length <= 1 || layer?.locked) return;
    this._layers = this._layers.filter(l => l.id !== id);
    if (this._activeLayerId === id) this._activeLayerId = this._layers[0].id;
    this.applyMutation(this.shapes.filter(
      s => s.type === 'image' || (s.layerId ?? DEFAULT_LAYER_ID) !== id));
  }

  getShapes(): DraftShape[] {
    return this.shapes;
  }

  /** Shapes on every visible layer — what should render (and be snappable), regardless of which
   * layer is active. Images are excluded: they render in their own earlier pass, beneath
   * everything else, and are deliberately kept out of the snap index (a photo's bounding box
   * isn't geometry worth snapping to). See getVisibleImages and draft-canvas.ts's draw(). */
  getVisibleShapes(): DraftShape[] {
    if (!this._showShapes) return [];
    const visibleIds = new Set(this._layers.filter(l => this.shownHere(l.scope)).map(l => l.id));
    return this.shapes.filter(s => s.type !== 'image' && visibleIds.has(s.layerId ?? DEFAULT_LAYER_ID));
  }

  /** Placed images that should render, in insertion order — the underlay pass. Governed by the
   * master switch and each image's own scope rather than by layers, since images don't belong to
   * one (see ImageShape). */
  getVisibleImages(): ImageShape[] {
    if (!this._showImages) return [];
    return this.getImageShapes().filter(s => this.shownHere(s.scope));
  }

  /** Every placed image, off-panel ones included — what the save adapter writes out, and what the
   * image list in the bottom bar shows. */
  getImageShapes(): ImageShape[] {
    return this.shapes.filter((s): s is ImageShape => s.type === 'image');
  }

  /**
   * Shapes that can be selected/edited right now. Drawn shapes: on any layer that is visible and
   * unlocked — which layer is *active* says where new shapes land, not what you're allowed to
   * touch, the way it works in other CAD. Hiding or locking a layer is how you put it out of
   * reach. Images: any unlocked, visible image, which they already were, since they aren't layer
   * members at all (see ImageShape).
   *
   * Editable is therefore always a subset of getVisibleShapes() — you can only edit what you can
   * see, so there is no way to move something you have no way to look at.
   */
  getEditableShapes(): DraftShape[] {
    const images = this.getVisibleImages().filter(s => !this.isShapeLocked(s));
    if (!this._showShapes) return images;
    const reachable = new Set(this._layers.filter(l => this.shownHere(l.scope) && !l.locked).map(l => l.id));
    return [
      ...images,
      ...this.shapes.filter(s => s.type !== 'image' && reachable.has(s.layerId ?? DEFAULT_LAYER_ID)),
    ];
  }

  addShape(shape: DraftShape): void {
    this.addShapes([shape]);
  }

  /** One history step for the lot — a paste, a duplicate, an ungroup. A brand-new shape has no
   * lock of its own to consult; what matters is whether the layer it would land on accepts it.
   * Images don't land on one, so they're always accepted. */
  addShapes(shapes: DraftShape[]): void {
    const accepted = shapes.filter(s => s.type === 'image' || !this.layerFor(s)?.locked);
    if (accepted.length === 0) return;
    this.applyMutation([...this.shapes, ...accepted]);
  }

  removeShape(id: string): void {
    this.removeShapes([id]);
  }

  /** One history step for the lot — Delete on a multi-selection. Locked shapes stay. A group
   * left with one member is dissolved: a group of one would only ever hide that shape's handles. */
  removeShapes(ids: string[]): void {
    const wanted = new Set(ids);
    const kept = this.shapes.filter(s => !wanted.has(s.id) || this.isShapeLocked(s));
    if (kept.length === this.shapes.length) return;
    const members = new Map<string, number>();
    for (const s of kept) if (s.groupId) members.set(s.groupId, (members.get(s.groupId) ?? 0) + 1);
    this.applyMutation(kept.map(s => s.groupId && members.get(s.groupId) === 1 ? { ...s, groupId: undefined } : s));
  }

  // An image is its own scope/lock unit — the equivalent of a one-image layer, without a second
  // layering system to keep in sync. Like the layer equivalents above, these are not undo-tracked:
  // scoping or locking something is a view preference, so Ctrl+Z keeps meaning "undo my last edit"
  // rather than "bring that photo back".

  private patchImage(id: string, patch: Partial<ImageShape>): void {
    const idx = this.shapes.findIndex(s => s.id === id && s.type === 'image');
    if (idx < 0) return;
    this.shapes = this.shapes.map((s, i) => i === idx ? { ...s, ...patch } as ImageShape : s);
    // Fold the change into the current history entry rather than pushing a new one. Without this
    // the entry would still hold the pre-patch array, and the next undo/redo would quietly revert
    // the hide or lock along with whatever edit the user actually meant to undo.
    this.history[this.historyIndex] = this.shapes;
    this.persist();
    this.notify();
  }

  /** Unlocking has to bypass the lock guard the edit paths use, which is why this doesn't go
   * through updateShape. */
  setImageLocked(id: string, locked: boolean): void {
    this.patchImage(id, { locked });
  }

  /** Where an image shows. Bypasses the lock like setImageLocked: a template image is locked by
   * default, and choosing where it shows shouldn't need it unlocked first. */
  setImageScope(id: string, scope: PanelScope | undefined): void {
    this.patchImage(id, { scope });
  }

  renameImage(id: string, label: string): void {
    const trimmed = label.trim();
    if (trimmed) this.patchImage(id, { label: trimmed });
  }

  /** Deletes an image regardless of its lock — an explicit × in the image list is unambiguous,
   * unlike a stray drag on the canvas, which is what the lock exists to stop. Undo-tracked, since
   * removal loses work. */
  removeImage(id: string): void {
    if (!this.shapes.some(s => s.id === id && s.type === 'image')) return;
    this.applyMutation(this.shapes.filter(s => s.id !== id));
  }

  /** Patches a shape's properties (colour, or geometry — this is what a committed move/resize
   * drag writes through) in place. */
  updateShape(id: string, patch: Partial<DraftShape>): void {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape || this.isShapeLocked(shape)) return;
    this.applyMutation(this.shapes.map(s => s.id === id ? { ...s, ...patch } as DraftShape : s));
  }

  /** Batched form of updateShape for multi-shape operations (e.g. dragging a selection) — applies
   * every patch in a single history step instead of one step per shape. */
  updateShapes(patches: Map<string, Partial<DraftShape>>): void {
    if (patches.size === 0) return;
    let changed = false;
    const next = this.shapes.map(s => {
      const patch = patches.get(s.id);
      if (!patch || this.isShapeLocked(s)) return s;
      changed = true;
      return { ...s, ...patch } as DraftShape;
    });
    if (!changed) return;
    this.applyMutation(next);
  }

  /** Swaps shapes for new versions of themselves by id, whole rather than merged since a transform
   * can change a shape's type (a turned rect becomes a path), and adds `added` on addShapes' terms
   * — one history step, for a transform that also copies recipe pieces. */
  replaceShapes(replacements: DraftShape[], added: DraftShape[] = []): void {
    const byId = new Map(replacements.map(s => [s.id, s]));
    let changed = false;
    const next = this.shapes.map(s => {
      const replacement = byId.get(s.id);
      if (!replacement || this.isShapeLocked(s)) return s;
      changed = true;
      return replacement;
    });
    const accepted = added.filter(s => s.type === 'image' || !this.layerFor(s)?.locked);
    if (!changed && accepted.length === 0) return;
    this.applyMutation([...next, ...accepted]);
  }

  /** Moves shapes to the end of the drawing order (drawn last, so on top) or the start, keeping
   * their order among themselves. */
  reorderShapes(ids: string[], to: 'front' | 'back'): void {
    const wanted = new Set(ids);
    const moving = this.shapes.filter(s => wanted.has(s.id) && !this.isShapeLocked(s));
    if (moving.length === 0) return;
    const rest = this.shapes.filter(s => !moving.includes(s));
    const next = to === 'front' ? [...rest, ...moving] : [...moving, ...rest];
    if (next.every((s, i) => s === this.shapes[i])) return;
    this.applyMutation(next);
  }

  /** Refuses a locked target, the same as drawing onto one. Images belong to no layer and stay. */
  moveShapesToLayer(ids: string[], layerId: string): void {
    if (this._layers.find(l => l.id === layerId)?.locked !== false) return;
    const patches = new Map<string, Partial<DraftShape>>();
    for (const s of this.shapes) {
      if (ids.includes(s.id) && s.type !== 'image' && (s.layerId ?? DEFAULT_LAYER_ID) !== layerId) patches.set(s.id, { layerId });
    }
    this.updateShapes(patches);
  }

  /** Clears only the active layer's drawn shapes — Clear is scoped per layer, and never touches
   * placed images, which aren't layer members and are removed from the image list instead. */
  clearActiveLayer(): void {
    if (this.activeLayer.locked) return;
    const active = this._activeLayerId;
    this.applyMutation(this.shapes.filter(
      s => s.type === 'image' || (s.layerId ?? DEFAULT_LAYER_ID) !== active));
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
    this.undoCoordinator.notify(this.id);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  private load(): void {
    try {
      const raw = readWorkingState(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.shapes)) this.shapes = parsed.shapes;
        if (typeof parsed.currentColor === 'string') this._currentColor = parsed.currentColor;
        if (typeof parsed.currentDashed === 'boolean') this._currentDashed = parsed.currentDashed;
        if (typeof parsed.currentTextSize === 'number') this._currentTextSize = parsed.currentTextSize;
        if (typeof parsed.currentStrokeWidth === 'number') this._currentStrokeWidth = parsed.currentStrokeWidth;
        if (typeof parsed.currentOpacity === 'number') this._currentOpacity = parsed.currentOpacity;
        if (typeof parsed.currentSectionColor2 === 'string') this._currentSectionColor2 = parsed.currentSectionColor2;
        if (Array.isArray(parsed.currentSectionWeights)) this._currentSectionWeights = parsed.currentSectionWeights;
        if (Array.isArray(parsed.currentTickWeights)) this._currentTickWeights = parsed.currentTickWeights;
        if (typeof parsed.currentCycloidFactor === 'number') this._currentCycloidFactor = parsed.currentCycloidFactor;
        if (typeof parsed.currentCycloidPct === 'number') this._currentCycloidPct = parsed.currentCycloidPct;
        if (typeof parsed.currentFilletRadius === 'number') this._currentFilletRadius = parsed.currentFilletRadius;
        if (Array.isArray(parsed.layers) && parsed.layers.length > 0) this._layers = parsed.layers;
        if (typeof parsed.activeLayerId === 'string') this._activeLayerId = parsed.activeLayerId;
        if (typeof parsed.showImages === 'boolean') this._showImages = parsed.showImages;
        if (typeof parsed.showShapes === 'boolean') this._showShapes = parsed.showShapes;
        if (typeof parsed.recipeLocked === 'boolean') this._recipeLocked = parsed.recipeLocked;
      }
    } catch {
      // ignore malformed stored state
    }
  }

  private persist(): void {
    try {
      writeWorkingState(STORAGE_KEY, JSON.stringify(this.exportState()));
    } catch {
      // ignore storage errors
    }
  }

  /** Same shape persist() writes to the working state — reused so the recipe file's saved/loaded
   * blob and the session's scratch copy can't drift apart.
   *
   * Images are filtered out of both destinations on purpose: the recipe's own `referenceImages`
   * field is their durable home, so writing them here too would mean two copies that can
   * disagree — plus a dangling `imageRef` on reload, since ImageAssetStore is session-scoped. */
  exportState(): object {
    return {
      shapes: this.shapes.filter(s => s.type !== 'image'),
      currentColor: this._currentColor,
      currentDashed: this._currentDashed,
      currentTextSize: this._currentTextSize,
      currentStrokeWidth: this._currentStrokeWidth,
      currentOpacity: this._currentOpacity,
      currentSectionColor2: this._currentSectionColor2,
      currentSectionWeights: this._currentSectionWeights,
      currentTickWeights: this._currentTickWeights,
      currentCycloidFactor: this._currentCycloidFactor,
      currentCycloidPct: this._currentCycloidPct,
      currentFilletRadius: this._currentFilletRadius,
      layers: this._layers,
      activeLayerId: this._activeLayerId,
      showImages: this._showImages,
      showShapes: this._showShapes,
      recipeLocked: this._recipeLocked,
    };
  }

  /**
   * Replaces every placed image, leaving drawn shapes alone — called once per file/template load
   * with whatever reference-image-schema.ts read out of the recipe. Resets undo history for the
   * same reason loadState does: a freshly loaded file starts with nothing to undo past.
   */
  loadImages(images: ImageShape[]): void {
    this.shapes = [...images, ...this.shapes.filter(s => s.type !== 'image')];
    this.history = [this.shapes];
    this.historyIndex = 0;
    this.undoCoordinator.reset(this.id);
    this.persist();
    this.notify();
  }

  /** Wipes shapes and layers back to a single empty default layer, resetting undo history too —
   * used when loading a new template or a new file, so drawings from whatever was previously
   * open don't linger into the freshly loaded one. Clears the image asset table with them, so a
   * previous file's photos can't stay resident once nothing references them. */
  resetAll(): void {
    // the active panel deliberately survives a reset: it outlives the file
    this.imageAssets.resetAll();
    this.shapes = [];
    this._layers = [{ id: DEFAULT_LAYER_ID, name: 'Layer 1', locked: false }];
    this._activeLayerId = DEFAULT_LAYER_ID;
    // currently leaving these toggles off, allowing the image and layer toggles to persist
    // this._showImages = true;
    // this._showShapes = true;
    this.history = [this.shapes];
    this.historyIndex = 0;
    this.undoCoordinator.reset(this.id);
    this.persist();
    this.notify();
  }

  /** Restores drawn shapes/layers from a recipe file (see recipe-base.ts's loadFile), and resets
   * undo history so a freshly loaded file starts with nothing to undo past. */
  loadState(state: unknown): void {
    if (!state || typeof state !== 'object') return;
    const parsed = state as Record<string, unknown>;
    if (Array.isArray(parsed['shapes'])) this.shapes = parsed['shapes'] as DraftShape[];
    if (typeof parsed['currentColor'] === 'string') this._currentColor = parsed['currentColor'] as string;
    if (typeof parsed['currentDashed'] === 'boolean') this._currentDashed = parsed['currentDashed'] as boolean;
    if (typeof parsed['currentTextSize'] === 'number') this._currentTextSize = parsed['currentTextSize'] as number;
    if (typeof parsed['currentStrokeWidth'] === 'number') this._currentStrokeWidth = parsed['currentStrokeWidth'] as number;
    if (typeof parsed['currentOpacity'] === 'number') this._currentOpacity = parsed['currentOpacity'] as number;
    if (typeof parsed['currentSectionColor2'] === 'string') this._currentSectionColor2 = parsed['currentSectionColor2'] as string;
    if (Array.isArray(parsed['currentSectionWeights'])) this._currentSectionWeights = parsed['currentSectionWeights'] as number[];
    if (Array.isArray(parsed['currentTickWeights'])) this._currentTickWeights = parsed['currentTickWeights'] as number[];
    if (typeof parsed['currentCycloidFactor'] === 'number') this._currentCycloidFactor = parsed['currentCycloidFactor'] as number;
    if (typeof parsed['currentCycloidPct'] === 'number') this._currentCycloidPct = parsed['currentCycloidPct'] as number;
    if (typeof parsed['currentFilletRadius'] === 'number') this._currentFilletRadius = parsed['currentFilletRadius'] as number;
    if (Array.isArray(parsed['layers']) && (parsed['layers'] as unknown[]).length > 0) this._layers = parsed['layers'] as Layer[];
    if (typeof parsed['activeLayerId'] === 'string') this._activeLayerId = parsed['activeLayerId'] as string;
    // showImages/showShapes are deliberately not restored from the file: they're the user's
    // current view preference (see resetAll's matching comment), and a template's own toolboxState
    // reflects whatever its author's toolbox looked like when it was traced, not a choice this
    // user made about it.

    this.history = [this.shapes];
    this.historyIndex = 0;
    this.undoCoordinator.reset(this.id);
    this.persist();
    this.notify();
  }
}
