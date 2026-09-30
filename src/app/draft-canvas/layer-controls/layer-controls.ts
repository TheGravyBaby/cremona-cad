import { Component, ElementRef, EventEmitter, HostListener, inject, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ToolRegistryService } from '../tools/tool-registry';
import { ToolboxStore } from '../tools/toolbox-store';
import { DraftShape, ImageShape } from '../tools/toolbox-shape';
import { DEFAULT_LAYER_ID, Layer } from '../tools/layer';
import { PanelChoice } from '../tools/toolbox-store';
import { SelectionStore } from '../tools/selection-store';
import { SelectionActions } from '../tools/selection-actions';
import { downloadSvgFile } from '../../helpers/fileExporter';
import { warn } from '../../shared/message-emitter';

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
 */
@Component({
  selector: 'app-layer-controls',
  standalone: true,
  imports: [NgTemplateOutlet],
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
  /** Which layer's panel checklist is open; one at a time, like renaming. */
  public panelsLayerId: string | null = null;
  public editingImageId: string | null = null;
  /** Whether the paste-a-link field is showing; closed by default. */
  public linkOpen = false;

  // a press anywhere outside — the canvas above all — takes an open list down, and with it the
  // link field and any panel checklist, so the next open starts clean
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.layersOpen && !this.imagesOpen) return;
    if (this.elRef.nativeElement.contains(event.target as Node)) return;
    this.layersOpen = false;
    this.imagesOpen = false;
    this.linkOpen = false;
    this.panelsLayerId = null;
    this.panelsImageId = null;
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

  // ===== Layers =====

  toggleLayers(): void {
    this.layersOpen = !this.layersOpen;
    this.imagesOpen = false;
  }

  public get toolboxLayers(): Layer[] { return this.toolbox.layers; }
  public get activeLayerId(): string { return this.toolbox.activeLayerId; }

  selectLayer(id: string): void {
    this.toolbox.setActiveLayer(id);
  }

  // ===== Which panels a layer shows on =====
  // The same idea as an image's scoping, in the row rather than the settings bar: a layer is never
  // "selected", so the list it lives in is the one place to reach it.

  public get availablePanels(): readonly PanelChoice[] { return this.toolbox.availablePanels; }

  togglePanels(id: string): void {
    this.panelsLayerId = this.panelsLayerId === id ? null : id;
  }

  /** True when the layer isn't drawn on the open panel despite its eye being on. */
  public isLayerOffPanel(layer: Layer): boolean {
    return !this.toolbox.layerMatchesActivePanel(layer);
  }

  public isLayerOnPanel(layer: Layer, panelId: string): boolean {
    return !layer.panels?.length || layer.panels.includes(panelId);
  }

  toggleLayerPanel(layer: Layer, panelId: string): void {
    const wanted = new Set(this.availablePanels.map(p => p.id).filter(id => this.isLayerOnPanel(layer, id)));
    if (wanted.has(panelId)) wanted.delete(panelId);
    else wanted.add(panelId);
    // every panel ticked is stored as no list at all, so a panel the recipe grows later is included
    const all = this.availablePanels.map(p => p.id);
    this.toolbox.setLayerPanels(layer.id, all.every(id => wanted.has(id)) ? undefined : all.filter(id => wanted.has(id)));
  }

  showLayerOnAllPanels(id: string): void {
    this.toolbox.setLayerPanels(id, undefined);
  }

  /** What the row's scoping button says: where the layer shows, and that it isn't shown here. */
  public layerScopeTitle(layer: Layer): string {
    if (!layer.panels?.length) return 'Shown on every panel';
    const names = layer.panels.map(id => this.availablePanels.find(p => p.id === id)?.label ?? id).join(', ');
    return this.isLayerOffPanel(layer) ? `Shown on ${names} — not on this panel` : `Shown on ${names}`;
  }

  get canExport(): boolean { return this.selection.size > 0 || this.toolbox.getVisibleShapes().length > 0; }

  /** The selection, or the whole drawing when nothing is selected, as a real-size SVG file. The
   * drawn shapes only: the recipe has its own export panels. */
  exportSvg(): void {
    const svg = this.actions.exportSvg();
    if (svg) downloadSvgFile(this.selection.size ? 'selection.svg' : 'drawing.svg', svg);
  }

  /** Reads a picked SVG file onto the active layer, in place, as a paste would. Silent on a
   * dismissed dialog. */
  async importSvg(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.actions.paste(await file.text())) warn(`Nothing in ${file.name} could be read as a shape.`, 'Import SVG');
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
  }

  toggleLayerVisible(id: string): void {
    this.toolbox.toggleLayerVisible(id);
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
  // Deliberately shaped like Layers above: a list of rows, each with an eye, a lock, a name and a
  // delete. Each image is its own visibility/lock unit (see ImageShape), so this list *is* the
  // image layering — there's no second layer type behind it. Unlike the tab strip this replaced,
  // every image stays on screen at once; the eye is what parks one.

  public get images(): ImageShape[] { return this.toolbox.getImageShapes(); }

  /** Absent `locked` means locked — see ImageShape.locked. */
  public isImageLocked(image: ImageShape): boolean { return image.locked ?? true; }

  /** True when the image isn't drawn on the open panel despite its eye being on; the row stays
   * listed and says so rather than the image just silently not appearing. */
  public isImageOffPanel(image: ImageShape): boolean {
    return !this.toolbox.imageMatchesActivePanel(image);
  }

  // ===== Which panels an image shows on =====
  // The layer control above, for images: same button, same checklist, plus the Default row and the
  // short-list storage a template image needs (see ImageShape.panels/excludePanels/isDefault).

  public panelsImageId: string | null = null;

  toggleImagePanels(id: string): void {
    this.panelsImageId = this.panelsImageId === id ? null : id;
  }

  /** Whether the image is wanted on `panelId` — what its checkbox shows. */
  public isImageOnPanel(image: ImageShape, panelId: string): boolean {
    if (image.panels?.length) return image.panels.includes(panelId);
    return !image.excludePanels?.includes(panelId);
  }

  toggleImagePanel(image: ImageShape, panelId: string): void {
    const wanted = new Set(this.availablePanels.map(p => p.id).filter(id => this.isImageOnPanel(image, id)));
    if (wanted.has(panelId)) wanted.delete(panelId);
    else wanted.add(panelId);
    this.writeImagePanels(image, wanted);
  }

  // stores whichever of panels/excludePanels is shorter — the short list both reads as the
  // exception and stays correct when the recipe later grows a panel. Naming panels clears
  // Default (the two are alternatives); excluding doesn't, since that's how a default expresses
  // a gap.
  private writeImagePanels(image: ImageShape, wanted: Set<string>): void {
    const all = this.availablePanels.map(p => p.id);
    const named = all.filter(id => wanted.has(id));
    const excluded = all.filter(id => !wanted.has(id));
    this.toolbox.setImageScope(image.id, !excluded.length
      ? { panels: undefined, excludePanels: undefined, isDefault: image.isDefault }
      : excluded.length < named.length
        ? { panels: undefined, excludePanels: excluded, isDefault: image.isDefault }
        : { panels: named, excludePanels: undefined, isDefault: false });
  }

  setImageIsDefault(image: ImageShape, value: boolean): void {
    this.toolbox.setImageScope(image.id, {
      isDefault: value,
      // Default and a panel list are alternatives; an exclusion list is not, so it survives.
      panels: value ? undefined : image.panels,
      excludePanels: image.excludePanels,
    });
  }

  /** Clears all scoping — shown on every panel, same as a hand-placed image. */
  showImageOnAllPanels(image: ImageShape): void {
    this.toolbox.setImageScope(image.id, { panels: undefined, excludePanels: undefined, isDefault: false });
  }

  public isImageScoped(image: ImageShape): boolean {
    return !!(image.panels?.length || image.excludePanels?.length || image.isDefault);
  }

  /** What the row's scoping button says: where the image shows, and that it isn't shown here. */
  public imageScopeTitle(image: ImageShape): string {
    const label = (id: string) => this.availablePanels.find(p => p.id === id)?.label ?? id;
    let where: string;
    if (image.panels?.length) where = `Shown on ${image.panels.map(label).join(', ')}`;
    else {
      where = image.isDefault ? 'Default — shown wherever no other image is named' : 'Shown on every panel';
      if (image.excludePanels?.length) where += `, except ${image.excludePanels.map(label).join(', ')}`;
    }
    return this.isImageOffPanel(image) ? `${where} — not on this panel` : where;
  }

  /** Row tooltip naming the panels a scoped image belongs to. Panel ids are de-camel-cased here
   * rather than looked up, since the store never learns their display labels. */
  public imageRowTitle(image: ImageShape): string {
    const edit = 'Click to show it here and unlock it for editing; double-click to rename';
    if (!this.isImageOffPanel(image)) return edit;
    const active = this.toolbox.activePanel;
    if (active && image.excludePanels?.includes(active)) {
      return `Deliberately kept off this panel. ${edit}`;
    }
    if (!image.panels?.length) return `A more specific image is shown on this panel. ${edit}`;
    const panels = image.panels
      .map(id => id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim())
      .join(', ');
    return `Shown on ${panels} — not on this panel. ${edit}`;
  }

  toggleImages(): void {
    this.imagesOpen = !this.imagesOpen;
    this.layersOpen = false;
    this.linkOpen = false;
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

  toggleImageHidden(image: ImageShape): void {
    this.toolbox.setImageHidden(image.id, !image.hidden);
  }

  toggleImageLocked(image: ImageShape): void {
    this.toolbox.setImageLocked(image.id, !this.isImageLocked(image));
  }

  /** Shows, unlocks and selects the clicked image — clearing all three ways it could be
   * invisible (its own eye, the master switch, panel scoping) rather than just its own eye, and
   * without editing the scoping itself; see ToolboxStore.setRevealedImage. */
  editImage(image: ImageShape): void {
    if (image.hidden) this.toolbox.setImageHidden(image.id, false);
    if (!this.toolbox.showImages) this.toolbox.setShowImages(true);
    this.toolbox.setImageLocked(image.id, false);
    this.toolbox.setRevealedImage(image.id);
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
  }
}
