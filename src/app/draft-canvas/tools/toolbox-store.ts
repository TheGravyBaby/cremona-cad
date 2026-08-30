import { Injectable, inject } from '@angular/core';
import { DraftShape, ImageShape, DEFAULT_SHAPE_COLOR, DEFAULT_FREEHAND_WIDTH, DEFAULT_TEXT_SIZE_MM } from './toolbox-shape';
import { Layer, DEFAULT_LAYER_ID, makeLayerId } from './layer';
import { ImageAssetStore } from './image-asset-store';
import { readWorkingState, writeWorkingState } from '../../helpers/workingStorage';
import { UndoCoordinator, Undoable } from '../../helpers/undoCoordinator';

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
/**
 * One panel an image can be scoped to, as the settings bar offers it. Structural and declared
 * here rather than imported from the recipe framework, so the dependency stays one-way: the
 * recipe hands its panels down (RecipeComponentBase.initializePanelFlow) and the canvas still
 * knows nothing about panels beyond two strings.
 */
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
  private _currentStrokeWidth: number = DEFAULT_FREEHAND_WIDTH;
  private _currentOpacity = 1;
  private _currentSectionColor2: string = '#93c5fd';
  private _currentSectionWeights: number[] = [1, 1, 1];
  private _layers: Layer[] = [{ id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false }];
  private _activeLayerId: string = DEFAULT_LAYER_ID;
  private _showImages = true;
  private _showShapes = true;
  /** The recipe panel currently open — see setActivePanel. Session-lifetime only. */
  private _activePanel: string | null = null;
  /** Every panel the open recipe has, for the settings bar's scoping picker — see
   * setAvailablePanels. Empty until a recipe pushes its own. */
  private _availablePanels: PanelChoice[] = [];
  /** One image shown regardless of scoping, because it is the one selected — see
   * setRevealedImage. */
  private _revealedImageId: string | null = null;

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

  /** The pen width (screen px) new Freehand strokes will use. */
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

  /** Master switch for every placed reference image — the one-click "get the photos out of my
   * way" while tracing, paired with the per-image `hidden` flag the way the Layers master switch
   * below is paired with per-layer visibility. Not undo-tracked: what you can see is a view
   * preference, not an edit, same as layer visibility. */
  get showImages(): boolean { return this._showImages; }
  setShowImages(value: boolean): void {
    if (this._showImages === value) return;
    this._showImages = value;
    this.persist();
    this.notify();
  }

  /**
   * Which recipe panel is open, pushed in by RecipeComponentBase — the canvas never learns what a
   * panel is, it only holds the string to compare against each image's own `panels` list.
   *
   * View state like the two masters above: not persisted, not undo-tracked, and deliberately not
   * cleared by resetAll, since the open panel outlives the file being shown in it.
   *
   * `null` means no panel has been pushed yet, and filters nothing. That is the safe direction to
   * fail: a recipe that forgets to push shows an image too widely, which is visible and
   * correctable, rather than hiding one with no indication of why.
   */
  get activePanel(): string | null { return this._activePanel; }
  setActivePanel(panel: string | null): void {
    if (this._activePanel === panel) return;
    this._activePanel = panel;
    // Changing panel ends any reveal: it was a "show me this one here" about the panel you were
    // on, and carrying it forward would look like scoping quietly failing on the next one.
    this._revealedImageId = null;
    this.notify();
  }

  /**
   * The panels an image may be scoped to, pushed in by RecipeComponentBase alongside the open one
   * — the labels the settings bar's picker shows. Still only strings to the store, which is what
   * keeps panels out of the canvas's instrument-agnostic boundary.
   *
   * Empty means the picker has nothing to offer and hides itself, which is the honest answer for
   * a host that ships no panels rather than a reason to invent some.
   */
  get availablePanels(): readonly PanelChoice[] { return this._availablePanels; }
  setAvailablePanels(panels: readonly PanelChoice[]): void {
    this._availablePanels = panels.map(p => ({ id: p.id, label: p.label }));
    this.notify();
  }

  /**
   * One image to show even where its scoping wouldn't: the one the user has deliberately picked,
   * from the image list or by clicking it. Without this, picking an image scoped to another panel
   * out of the list unlocks and selects something that never appears, and editing the scoping of
   * the image you have selected makes it — and the controls you were using — vanish mid-edit.
   *
   * View state like the masters above: not persisted, not undo-tracked, and short-lived. Cleared
   * when the selection moves on (draft-canvas's setSelectedShape) and when the panel changes.
   */
  get revealedImageId(): string | null { return this._revealedImageId; }
  setRevealedImage(id: string | null): void {
    if (this._revealedImageId === id) return;
    this._revealedImageId = id;
    this.notify();
  }

  /**
   * Whether `image` belongs on the panel currently open.
   *
   * Four cases, in the order they're tested. An `excludePanels` entry is absolute: the recipe is
   * saying this panel should show nothing, so nothing else gets to overrule it. Otherwise an image
   * naming panels belongs on those; an image naming none belongs on all of them — every image a
   * user placed by hand; and an image naming none but marked `isDefault` ("Default" in the UI)
   * belongs on the panels no *other* image has claimed by name, which is how a set swaps a general
   * plan photograph out for a specific view on the panels that have one, without the general one
   * having to list every panel it's still wanted on.
   *
   * `panels` and `excludePanels` are the same statement written from either end, and which one a
   * set reaches for is whichever is shorter. Excluding is what makes a *blank* panel expressible
   * at all: a panel nothing claims otherwise shows the default, and "nothing here" was previously
   * something the format had no way to say.
   *
   * The default case reads the rest of the set, so this is a question about the image *and* its
   * neighbours, not about the image alone. That's what makes adding a scoped image enough on its
   * own: nothing has to be edited on the image it displaces.
   *
   * The revealed image is exempt from all of it — see setRevealedImage.
   */
  imageMatchesActivePanel(image: ImageShape): boolean {
    if (image.id === this._revealedImageId) return true;
    if (this._activePanel === null) return true;
    if (image.excludePanels?.includes(this._activePanel)) return false;
    if (image.panels?.length) return image.panels.includes(this._activePanel);
    if (!image.isDefault) return true;
    return !this.panelHasScopedImage(this._activePanel);
  }

  /** Whether some image names `panel` outright. Hidden images don't count — parking the specific
   * view is a reasonable way to ask for the general one back, and the alternative is a panel
   * showing nothing with no way to tell why. */
  private panelHasScopedImage(panel: string): boolean {
    return this.getImageShapes().some(s => !s.hidden && s.panels?.includes(panel));
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
    // Switching onto a layer always shows it: the next thing you'll do is draw here, and a shape
    // that lands somewhere invisible reads as a tool that didn't fire.
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
    const visibleIds = new Set(this._layers.filter(l => l.visible).map(l => l.id));
    return this.shapes.filter(s => s.type !== 'image' && visibleIds.has(s.layerId ?? DEFAULT_LAYER_ID));
  }

  /** Placed images that should render, in insertion order — the underlay pass. Governed by the
   * master switch, each image's own `hidden` flag and the panel it is scoped to, rather than by
   * layers, since images don't belong to one (see ImageShape). */
  getVisibleImages(): ImageShape[] {
    if (!this._showImages) return [];
    return this.getImageShapes().filter(s => !s.hidden && this.imageMatchesActivePanel(s));
  }

  /** Every placed image, hidden ones included — what the save adapter writes out, and what the
   * image list in the tool palette shows. */
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
    const reachable = new Set(this._layers.filter(l => l.visible && !l.locked).map(l => l.id));
    return [
      ...images,
      ...this.shapes.filter(s => s.type !== 'image' && reachable.has(s.layerId ?? DEFAULT_LAYER_ID)),
    ];
  }

  addShape(shape: DraftShape): void {
    // A brand-new shape has no lock of its own to consult; what matters is whether the layer it
    // would land on accepts it. Images don't land on one, so they're always accepted.
    if (shape.type !== 'image' && this.layerFor(shape)?.locked) return;
    this.applyMutation([...this.shapes, shape]);
  }

  removeShape(id: string): void {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape || this.isShapeLocked(shape)) return;
    this.applyMutation(this.shapes.filter(s => s.id !== id));
  }

  // ===== Per-image view state =====
  // An image is its own visibility/lock unit — the equivalent of a one-image layer, without a
  // second layering system to keep in sync. Like the layer equivalents above, these are not
  // undo-tracked: hiding or locking something is a view preference, so Ctrl+Z keeps meaning
  // "undo my last edit" rather than "un-hide that photo".

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

  setImageHidden(id: string, hidden: boolean): void {
    this.patchImage(id, { hidden });
  }

  /** Unlocking has to bypass the lock guard the edit paths use, which is why this doesn't go
   * through updateShape. */
  setImageLocked(id: string, locked: boolean): void {
    this.patchImage(id, { locked });
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
      if (Array.isArray(parsed)) {
        this.shapes = parsed; // legacy format, from before currentColor existed
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.shapes)) this.shapes = parsed.shapes;
        if (typeof parsed.currentColor === 'string') this._currentColor = parsed.currentColor;
        if (typeof parsed.currentDashed === 'boolean') this._currentDashed = parsed.currentDashed;
        if (typeof parsed.currentTextSize === 'number') this._currentTextSize = parsed.currentTextSize;
        if (typeof parsed.currentStrokeWidth === 'number') this._currentStrokeWidth = parsed.currentStrokeWidth;
        if (typeof parsed.currentOpacity === 'number') this._currentOpacity = parsed.currentOpacity;
        if (typeof parsed.currentSectionColor2 === 'string') this._currentSectionColor2 = parsed.currentSectionColor2;
        if (Array.isArray(parsed.currentSectionWeights)) this._currentSectionWeights = parsed.currentSectionWeights;
        if (Array.isArray(parsed.layers) && parsed.layers.length > 0) {
          // Normalize layers saved before visible/locked existed.
          this._layers = parsed.layers.map((l: Partial<Layer> & { id: string; name: string }) => ({
            id: l.id, name: l.name, visible: l.visible ?? true, locked: l.locked ?? false,
          }));
        }
        if (typeof parsed.activeLayerId === 'string') this._activeLayerId = parsed.activeLayerId;
        if (typeof parsed.showImages === 'boolean') this._showImages = parsed.showImages;
        if (typeof parsed.showShapes === 'boolean') this._showShapes = parsed.showShapes;
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
      layers: this._layers,
      activeLayerId: this._activeLayerId,
      showImages: this._showImages,
      showShapes: this._showShapes,
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
    // The active panel deliberately survives a reset (it outlives the file), but an id pointing
    // at a shape that no longer exists does not.
    this._revealedImageId = null;
    this.imageAssets.resetAll();
    this.shapes = [];
    this._layers = [{ id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false }];
    this._activeLayerId = DEFAULT_LAYER_ID;
    // Both masters back on, so a newly loaded file can't open looking empty because of a toggle
    // flipped while the previous one was open.
    this._showImages = true;
    this._showShapes = true;
    this.history = [this.shapes];
    this.historyIndex = 0;
    this.undoCoordinator.reset(this.id);
    this.persist();
    this.notify();
  }

  /** Restores drawn shapes/layers from a recipe file (see recipe-base.ts's loadFile) — same
   * field-by-field tolerance as load() for older saves missing newer fields, and resets undo
   * history so a freshly loaded file starts with nothing to undo past. */
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
    if (Array.isArray(parsed['layers']) && (parsed['layers'] as unknown[]).length > 0) {
      this._layers = (parsed['layers'] as Array<Partial<Layer> & { id: string; name: string }>).map(l => ({
        id: l.id, name: l.name, visible: l.visible ?? true, locked: l.locked ?? false,
      }));
    }
    if (typeof parsed['activeLayerId'] === 'string') this._activeLayerId = parsed['activeLayerId'] as string;
    if (typeof parsed['showImages'] === 'boolean') this._showImages = parsed['showImages'] as boolean;
    if (typeof parsed['showShapes'] === 'boolean') this._showShapes = parsed['showShapes'] as boolean;

    this.history = [this.shapes];
    this.historyIndex = 0;
    this.undoCoordinator.reset(this.id);
    this.persist();
    this.notify();
  }
}
