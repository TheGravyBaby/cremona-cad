import { Component, ElementRef, EventEmitter, HostListener, inject, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ToolRegistryService } from '../tools/tool-registry';
import { ToolboxStore } from '../tools/toolbox-store';
import { DraftShape, ImageShape } from '../tools/toolbox-shape';
import { DEFAULT_LAYER_ID, Layer } from '../tools/layer';
import { PanelChoice } from '../tools/toolbox-store';
import {
  isScopeNowhere, isScopeOnly, PanelScope, scopeDescription, scopeLabel, scopeOnly, scopeShows, scopeWith,
  SCOPE_EVERYWHERE, SCOPE_NOWHERE,
} from '../tools/panel-scope';
import { SelectionStore } from '../tools/selection-store';
import { SelectionActions } from '../tools/selection-actions';
import { shapesToSvg } from '../tools/shape-svg';
import { downloadSvgFile } from '../../helpers/fileExporter';
import { TooltipDirective } from '../../docs/tooltips';
import { svgImportEmpty } from '../../docs/conditions';

/** A row in either list: a layer or an image, told apart only where the store needs to know. */
export type ScopeKind = 'layer' | 'image';
type Scoped = { id: string; scope?: PanelScope };

/**
 * Layers and reference images, in the canvas bottom bar beside the axis and zoom controls.
 *
 * These sat in the tool palette until they were moved here, and they never fitted: a tool is
 * something you pick up and draw with, while these two are a list of what is already on the
 * canvas and whether you can see it — the same kind of thing as the grid and the zoom level,
 * which is what the bottom bar is for. The palette paid for them twice over, since each carried
 * a master eye in a sliver beside its button and .tool-row fixes one width for every row.
 * Horizontally there is no such cost, so the eye simply sits next to the button.
 *
 * There is no image tool: both ways to add one, a file or a pasted link, live at the bottom of
 * the image list instead.
 *
 * Where a row shows is one thing, its scope (panel-scope.ts), and the row answers it from the
 * open panel's point of view: the eye is "shown on this panel", and the chip after the name says
 * where else, opening the presets. The user is always standing on one panel when they decide,
 * so the question is never "pick from sixteen" unless they ask for the list.
 */
@Component({
  selector: 'app-layer-controls',
  standalone: true,
  imports: [TooltipDirective, NgTemplateOutlet],
  templateUrl: './layer-controls.html',
  styleUrls: ['./layer-controls.css'],
})
export class LayerControlsComponent {
  private toolbox = inject(ToolboxStore);
  private toolRegistry = inject(ToolRegistryService);
  private selection = inject(SelectionStore);
  private actions = inject(SelectionActions);
  private elRef = inject(ElementRef<HTMLElement>);

  /** Which shape is selected is draft-canvas state, not store state, so picking an image out of
   * the list has to ask the canvas to select it — see editImage. */
  @Output() selectImageRequested = new EventEmitter<string>();
  /** The file picker and design bounds are the canvas's, so these ask rather than do — see
   * draft-canvas's placeImageFromFile/placeImageFromLink. */
  @Output() uploadImageRequested = new EventEmitter<void>();
  @Output() linkImageRequested = new EventEmitter<string>();

  /** One popup at a time: they open from adjacent buttons and would otherwise overlap. */
  public layersOpen = false;
  public imagesOpen = false;
  public editingLayerId: string | null = null;
  public editingImageId: string | null = null;
  /** Whether the paste-a-link field is showing; closed by default. */
  public linkOpen = false;
  /** Which row's scope menu is open; one at a time, like renaming. The checklist inside it
   * starts folded every time, so the presets are what you see first. */
  public scopeMenuFor: string | null = null;
  public panelListOpen = false;

  // a press anywhere outside — the canvas above all — takes an open list down, and with it the
  // link field and any scope menu, so the next open starts clean
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.layersOpen && !this.imagesOpen) return;
    if (this.elRef.nativeElement.contains(event.target as Node)) return;
    this.layersOpen = false;
    this.imagesOpen = false;
    this.linkOpen = false;
    this.scopeMenuFor = null;
  }

  // ===== Master show/hide switches =====
  // The quick "get this out of my way" pair, one per button. Both are ToolboxStore view state
  // rather than component state, since draft-canvas has to read them when it draws.

  public get showImages(): boolean { return this.toolbox.showImages; }
  toggleShowImages(): void { this.toolbox.setShowImages(!this.toolbox.showImages); }

  public get showShapes(): boolean { return this.toolbox.showShapes; }
  toggleShowShapes(): void { this.toolbox.setShowShapes(!this.toolbox.showShapes); }

  /** The recipe's geometry as one more selectable layer — see ToolboxStore.recipeLocked. */
  public get recipeLocked(): boolean { return this.toolbox.recipeLocked; }
  toggleRecipeLocked(): void { this.toolbox.setRecipeLocked(!this.toolbox.recipeLocked); }

  // ===== Where a row shows =====

  public get availablePanels(): readonly PanelChoice[] { return this.toolbox.availablePanels; }
  public get activePanel(): string | null { return this.toolbox.activePanel; }

  public shownHere(scope: PanelScope | undefined): boolean { return this.toolbox.shownHere(scope); }
  public shownOn(scope: PanelScope | undefined, panelId: string): boolean { return scopeShows(scope, panelId); }
  public isEverywhere(scope: PanelScope | undefined): boolean { return !scope; }
  public isHereOnly(scope: PanelScope | undefined): boolean { return isScopeOnly(scope, this.activePanel); }
  public isNowhere(scope: PanelScope | undefined): boolean { return isScopeNowhere(scope); }
  public scopeLabel(scope: PanelScope | undefined): string { return scopeLabel(scope, this.activePanel); }
  public scopeTitle(scope: PanelScope | undefined): string {
    return scopeDescription(scope, id => this.availablePanels.find(p => p.id === id)?.label ?? id);
  }

  setScope(kind: ScopeKind, id: string, scope: PanelScope | undefined): void {
    if (kind === 'layer') this.toolbox.setLayerScope(id, scope);
    else this.toolbox.setImageScope(id, scope);
  }

  toggleHere(kind: ScopeKind, item: Scoped): void {
    this.setScope(kind, item.id, scopeWith(item.scope, this.activePanel, !this.shownHere(item.scope)));
  }

  togglePanel(kind: ScopeKind, item: Scoped, panelId: string): void {
    this.setScope(kind, item.id, scopeWith(item.scope, panelId, !this.shownOn(item.scope, panelId)));
  }

  applyPreset(kind: ScopeKind, id: string, preset: 'everywhere' | 'here' | 'nowhere'): void {
    this.setScope(kind, id,
      preset === 'everywhere' ? SCOPE_EVERYWHERE : preset === 'here' ? scopeOnly(this.activePanel) : SCOPE_NOWHERE);
  }

  toggleScopeMenu(id: string): void {
    this.scopeMenuFor = this.scopeMenuFor === id ? null : id;
    this.panelListOpen = false;
  }

  // ===== Layers =====

  toggleLayers(): void {
    this.layersOpen = !this.layersOpen;
    this.imagesOpen = false;
    this.scopeMenuFor = null;
  }

  public get toolboxLayers(): Layer[] { return this.toolbox.layers; }
  public get activeLayerId(): string { return this.toolbox.activeLayerId; }

  selectLayer(id: string): void {
    this.toolbox.setActiveLayer(id);
  }

  private get activeLayerShapes(): DraftShape[] {
    const id = this.toolbox.activeLayerId;
    return this.toolbox.getShapes().filter(s => s.type !== 'image' && (s.layerId ?? DEFAULT_LAYER_ID) === id);
  }

  get canExport(): boolean { return this.activeLayerShapes.length > 0; }

  /** The active layer as a real-size SVG file named after it. Drawn shapes only: the recipe has its
   * own export panels, and the selection exports from the canvas's right-click menu. */
  exportSvg(): void {
    const shapes = this.activeLayerShapes;
    if (!shapes.length) return;
    const name = this.toolbox.layers.find(l => l.id === this.toolbox.activeLayerId)?.name ?? '';
    downloadSvgFile(`${name.replace(/[\\/:*?"<>|]/g, '').trim() || 'layer'}.svg`, shapesToSvg(shapes));
  }

  /** Reads a picked SVG file onto the active layer, in place, as a paste would. Silent on a
   * dismissed dialog. */
  async importSvg(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.actions.import(await file.text())) svgImportEmpty(file.name);
  }

  // images belong to no layer, so they never move
  private get movableSelection(): DraftShape[] {
    return this.selection.toolboxShapes.filter(s => s.type !== 'image');
  }

  /** Offered on an unlocked layer when some of the selected drawn shapes live elsewhere. */
  canMoveSelectionTo(layer: Layer): boolean {
    return !layer.locked && this.movableSelection.some(s => (s.layerId ?? DEFAULT_LAYER_ID) !== layer.id);
  }

  moveSelectionTo(id: string): void {
    this.toolbox.moveShapesToLayer(this.movableSelection.map(s => s.id), id);
  }

  addLayer(): void {
    const id = this.toolbox.addLayer();
    this.startRenameLayer(id);
  }

  /** Focuses an <input> the frame after the state change that creates it. Each editable field has
   * its own marker class so an open editor elsewhere can't steal its focus. */
  private focusRenameInput(markerClass: string): void {
    setTimeout(() => {
      const el = (this.elRef.nativeElement as HTMLElement)
        .querySelector(`.${markerClass}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  startRenameLayer(id: string): void {
    this.editingLayerId = id;
    this.focusRenameInput('layer-rename-edit');
  }

  commitRenameLayer(id: string, name: string): void {
    this.toolbox.renameLayer(id, name);
    this.editingLayerId = null;
  }

  deleteLayer(id: string): void {
    this.toolbox.removeLayer(id);
    if (this.editingLayerId === id) this.editingLayerId = null;
    if (this.scopeMenuFor === id) this.scopeMenuFor = null;
  }

  /** Locking the layer you're actively drawing on would make the active tool a silent no-op — bail back to Select instead. */
  toggleLayerLocked(id: string): void {
    this.toolbox.toggleLayerLocked(id);
    if (this.toolRegistry.activeTool && this.toolbox.activeLayerId === id
      && this.toolboxLayers.find(l => l.id === id)?.locked) {
      this.toolRegistry.selectTool(null);
    }
  }

  /** Clear is scoped to the active layer only — see toolbox-store.ts's clearActiveLayer. */
  clearActiveLayer(): void {
    this.toolbox.clearActiveLayer();
  }

  // ===== Reference images =====
  // Deliberately shaped like Layers above: a list of rows, each with an eye, a scope chip, a lock
  // and a delete. Each image is its own scope/lock unit (see ImageShape), so this list *is* the
  // image layering — there's no second layer type behind it.

  public get images(): ImageShape[] { return this.toolbox.getImageShapes(); }

  /** Absent `locked` means locked — see ImageShape.locked. */
  public isImageLocked(image: ImageShape): boolean { return image.locked ?? true; }

  toggleImages(): void {
    this.imagesOpen = !this.imagesOpen;
    this.layersOpen = false;
    this.linkOpen = false;
    this.scopeMenuFor = null;
  }

  addImage(): void {
    this.imagesOpen = false;
    this.linkOpen = false;
    this.uploadImageRequested.emit();
  }

  toggleLinkField(): void {
    this.linkOpen = !this.linkOpen;
    if (this.linkOpen) this.focusRenameInput('image-link-input');
  }

  // a blank box just closes; whether the address resolves is the canvas's to report.
  addImageFromLink(url: string): void {
    if (url.trim()) {
      this.imagesOpen = false;
      this.linkImageRequested.emit(url);
    }
    this.linkOpen = false;
  }

  toggleImageLocked(image: ImageShape): void {
    this.toolbox.setImageLocked(image.id, !this.isImageLocked(image));
  }

  /** Shows the image on this panel, unlocks and selects it — clearing every way it could be out
   * of reach, since picking it from the list is a request to work on it. Showing it here is a
   * real scope edit, visible in the eye, not a peek. */
  editImage(image: ImageShape): void {
    if (!this.shownHere(image.scope)) this.setScope('image', image.id, scopeWith(image.scope, this.activePanel, true));
    if (!this.toolbox.showImages) this.toolbox.setShowImages(true);
    this.toolbox.setImageLocked(image.id, false);
    this.selectImageRequested.emit(image.id);
  }

  startRenameImage(id: string): void {
    this.editingImageId = id;
    this.focusRenameInput('image-rename-edit');
  }

  commitRenameImage(id: string, label: string): void {
    this.toolbox.renameImage(id, label);
    this.editingImageId = null;
  }

  deleteImage(id: string): void {
    this.toolbox.removeImage(id);
    if (this.editingImageId === id) this.editingImageId = null;
    if (this.scopeMenuFor === id) this.scopeMenuFor = null;
  }
}
