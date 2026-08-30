import { Component, ElementRef, EventEmitter, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ToolRegistryService } from '../tools/tool-registry';
import { ToolboxStore } from '../tools/toolbox-store';
import { ImageShape } from '../tools/toolbox-shape';
import { Layer } from '../tools/layer';

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
 * Adding an image followed them here later, for the same reason and one more: the palette's Image
 * button was a file dialog wearing a tool's clothes, and it sat nowhere near the list of what you
 * had already placed. Both ways in — a file, or a pasted link — are at the bottom of that list
 * now, and there is no image tool.
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
  private elRef = inject(ElementRef<HTMLElement>);

  /** Which shape is selected is draft-canvas state, not store state, so picking an image out of
   * the list has to ask the canvas to select it — see editImage. */
  @Output() selectImageRequested = new EventEmitter<string>();
  /** Adding an image needs the file picker and the design bounds, both of which are the canvas's
   * — so these two ask rather than do. See draft-canvas's placeImageFromFile/placeImageFromLink. */
  @Output() uploadImageRequested = new EventEmitter<void>();
  @Output() linkImageRequested = new EventEmitter<string>();

  /** One popup at a time: they open from adjacent buttons and would otherwise overlap. */
  public layersOpen = false;
  public imagesOpen = false;
  public editingLayerId: string | null = null;
  public editingImageId: string | null = null;
  /** Whether the paste-a-link field is showing under the image list. Closed by default: a file is
   * still the ordinary way in, and an always-visible URL box would be the widest thing in a popup
   * built out of short rows. */
  public linkOpen = false;

  // ===== Master show/hide switches =====
  // The quick "get this out of my way" pair, one per button. Both are ToolboxStore view state
  // rather than component state, since draft-canvas has to read them when it draws.

  public get showImages(): boolean { return this.toolbox.showImages; }
  toggleShowImages(): void { this.toolbox.setShowImages(!this.toolbox.showImages); }

  public get showShapes(): boolean { return this.toolbox.showShapes; }
  toggleShowShapes(): void { this.toolbox.setShowShapes(!this.toolbox.showShapes); }

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

  addLayer(): void {
    const id = this.toolbox.addLayer();
    this.startRenameLayer(id);
  }

  /** Focuses an <input> the frame after the state change that creates it — the two rename boxes
   * and the paste-a-link field. Each carries its own marker class (they share only styling), so an
   * open editor in one list can't steal the focus meant for another. */
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

  /**
   * True when this image belongs to other panels than the one open, so it isn't being drawn even
   * though its eye is on. The row stays in the list and says so rather than the image simply not
   * appearing — an image you can't find is the failure this list exists to prevent.
   */
  public isImageOffPanel(image: ImageShape): boolean {
    return !this.toolbox.imageMatchesActivePanel(image);
  }

  /** Row tooltip, naming the panels a scoped image does belong to. Panel *ids* are all the store
   * holds — it never learns their display labels — so they're de-camel-cased here rather than
   * looked up: 'crossArching' reads as 'Cross Arching' without the canvas importing anything
   * instrument-specific. */
  public imageRowTitle(image: ImageShape): string {
    const edit = 'Click to show it here and unlock it for editing; double-click to rename';
    if (!this.isImageOffPanel(image)) return edit;
    // Three reasons an image can be off, and they need three different sentences. Deliberately
    // kept off this one comes first, since it beats the other two.
    const active = this.toolbox.activePanel;
    if (active && image.excludePanels?.includes(active)) {
      return `Deliberately kept off this panel. ${edit}`;
    }
    // A stepped-aside default has no panel list to name — it's off because something else claimed
    // this panel, which is the opposite reason and needs the opposite sentence.
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

  /** Both add paths close the list on the way out, since it sits over the canvas and the next
   * thing you'll do is position the image that lands underneath it. */
  addImage(): void {
    this.imagesOpen = false;
    this.linkOpen = false;
    this.uploadImageRequested.emit();
  }

  toggleLinkField(): void {
    this.linkOpen = !this.linkOpen;
    if (this.linkOpen) this.focusRenameInput('image-link-input');
  }

  /** A blank box is how you back out, so it closes rather than complaining. Whether the address
   * actually resolves to an image is the canvas's to report — it's the one that tries to load it. */
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

  /**
   * "I want to work on this one": shows the image, unlocks it, and selects it so its handles and
   * settings-bar row are live immediately. Saves the unlock–then–hunt–for–it dance that having
   * images locked by default would otherwise cost.
   *
   * Showing it means clearing all three ways it could be invisible, not just its own eye: the
   * master switch, and the panel scoping that would otherwise leave you looking at a row you just
   * clicked and a canvas with nothing new on it. The scoping isn't edited, only overridden while
   * this image is the selection — see ToolboxStore.setRevealedImage.
   */
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
