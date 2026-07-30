import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DraftTool } from '../tools/draft-tool';
import { ToolRegistryService, ToolSlot } from '../tools/tool-registry';
import { ToolboxStore } from '../tools/toolbox-store';
import { ImageShape } from '../tools/toolbox-shape';
import { Layer } from '../tools/layer';
import { HOTKEY_LETTER_BY_TOOL } from '../tools/tool-hotkeys';

/**
 * The floating drafting toolbox: tool selection and the Layers flyout. Per-shape-type settings
 * live in the bottom bar instead — see settings-bar.ts. Everything here is either pure display
 * state (which popup is open, which flyout variant faces out) or a thin wrapper around
 * ToolboxStore (layer CRUD) — draft-canvas.ts keeps ownership of the actual tool
 * instances/pointer routing and only needs to know which tool is active.
 */
@Component({
  selector: 'app-tool-palette',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './tool-palette.html',
  styleUrls: ['./tool-palette.css'],
})
export class ToolPaletteComponent implements OnInit, OnDestroy {
  private static readonly PINNED_KEY = 'draft-canvas-tool-palette-pinned';

  private toolbox = inject(ToolboxStore);
  private elRef = inject(ElementRef<HTMLElement>);
  private toolRegistry = inject(ToolRegistryService);
  private toolRegistryUnsub?: () => void;

  public get toolRows(): ToolSlot[][] { return this.toolRegistry.toolRows; }
  public get activeTool(): DraftTool | null { return this.toolRegistry.activeTool; }

  /** Which shape is selected is draft-canvas state, not store state, so picking an image out of
   * the list has to ask the canvas to select it — see editImage. */
  @Output() selectImageRequested = new EventEmitter<string>();

  public openFlyout: ToolSlot | null = null;
  public layersOpen = false;
  public imagesOpen = false;
  public editingLayerId: string | null = null;
  public editingImageId: string | null = null;

  /** Pinned = always expanded, like a docked panel. Unpinned = a slim rail that
   * expands only while the pointer is over it (see onDockMouseEnter/Leave) — no
   * pin/unpin animation, it just shows or hides. */
  public pinned = true;
  public hovering = false;

  constructor() {
    try {
      const stored = sessionStorage.getItem(ToolPaletteComponent.PINNED_KEY);
      this.pinned = stored === null ? true : stored === 'true';
    } catch {
      // ignore blocked sessionStorage
    }
  }

  public get expanded(): boolean {
    return this.pinned || this.hovering;
  }

  togglePinned(): void {
    this.pinned = !this.pinned;
    try {
      sessionStorage.setItem(ToolPaletteComponent.PINNED_KEY, String(this.pinned));
    } catch {
      // ignore storage errors
    }
  }

  onDockMouseEnter(): void {
    this.hovering = true;
  }

  onDockMouseLeave(): void {
    this.hovering = false;
  }

  /** Reacts to the active tool changing for reasons outside this component (e.g. a hotkey) —
   * mirrors what activateSlot()/chooseFlyoutVariant() already do locally, so both paths close
   * an open flyout identically. */
  ngOnInit(): void {
    this.toolRegistryUnsub = this.toolRegistry.onChange(() => { this.openFlyout = null; });
  }

  ngOnDestroy(): void {
    this.toolRegistryUnsub?.();
  }

  /** Pass null for the Select button — back to no active drafting tool. */
  selectTool(tool: DraftTool | null): void {
    this.toolRegistry.selectTool(tool);
  }

  // The three slot shape questions the template asks, delegated to the registry so the palette
  // never has to know whether a slot is a lone tool or an array of variants.

  /** The tool a slot's button shows and activates. */
  faceOf(slot: ToolSlot): DraftTool { return this.toolRegistry.faceOf(slot); }

  /** Everything listed in a slot's flyout popup. */
  variantsOf(slot: ToolSlot): DraftTool[] { return this.toolRegistry.variantsOf(slot); }

  /** Whether to render a caret beside the slot's main button. */
  hasVariants(slot: ToolSlot): boolean { return this.toolRegistry.hasVariants(slot); }

  /** Activates whichever tool the slot's button is currently showing. */
  activateSlot(slot: ToolSlot): void {
    this.openFlyout = null;
    this.toolRegistry.selectTool(this.faceOf(slot));
  }

  toggleFlyout(slot: ToolSlot): void {
    this.openFlyout = this.openFlyout === slot ? null : slot;
    this.layersOpen = false;
    this.imagesOpen = false;
  }

  /** Picking a variant from the flyout both activates it and becomes the slot's new default face. */
  chooseFlyoutVariant(slot: ToolSlot, tool: DraftTool): void {
    this.openFlyout = null;
    this.toolRegistry.selectVariant(slot, tool);
  }

  /** The hotkey letter for a tool id, formatted for a tooltip (e.g. " (L)"), or '' if it has none. */
  public hotkeyHint(toolId: string): string {
    const letter = HOTKEY_LETTER_BY_TOOL[toolId];
    return letter ? ` (${letter})` : '';
  }

  toggleLayers(): void {
    this.layersOpen = !this.layersOpen;
    this.openFlyout = null;
    this.imagesOpen = false;
  }

  // ===== Master show/hide switches =====
  // The quick "get this out of my way" pair, one per popup button. Both are ToolboxStore view
  // state rather than component state, since draft-canvas has to read them when it draws.

  public get showImages(): boolean { return this.toolbox.showImages; }
  toggleShowImages(): void { this.toolbox.setShowImages(!this.toolbox.showImages); }

  public get showShapes(): boolean { return this.toolbox.showShapes; }
  toggleShowShapes(): void { this.toolbox.setShowShapes(!this.toolbox.showShapes); }

  // ===== Layers =====

  public get toolboxLayers(): Layer[] { return this.toolbox.layers; }
  public get activeLayerId(): string { return this.toolbox.activeLayerId; }

  selectLayer(id: string): void {
    this.toolbox.setActiveLayer(id);
  }

  addLayer(): void {
    const id = this.toolbox.addLayer();
    this.startRenameLayer(id);
  }

  /** Focuses a rename <input> the frame after the state change that creates it. The layer and
   * image lists have their own marker class (they share only styling), so an open editor in one
   * can't steal the focus meant for the other. */
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
    if (this.activeTool && this.toolbox.activeLayerId === id && this.toolboxLayers.find(l => l.id === id)?.locked) {
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

  toggleImages(): void {
    this.imagesOpen = !this.imagesOpen;
    this.openFlyout = null;
    this.layersOpen = false;
  }

  /** Placing an image is the Image tool's job — this just activates it, exactly as its hotkey
   * does. Closes the panel on the way, since the panel sits over the canvas and the next thing
   * you'll do is position the image that lands there. */
  addImage(): void {
    this.imagesOpen = false;
    this.toolRegistry.activateById('image');
  }

  toggleImageHidden(image: ImageShape): void {
    this.toolbox.setImageHidden(image.id, !image.hidden);
  }

  toggleImageLocked(image: ImageShape): void {
    this.toolbox.setImageLocked(image.id, !this.isImageLocked(image));
  }

  /**
   * "I want to work on this one": unlocks the image, makes sure it's visible, and selects it so
   * its handles and settings-bar row are live immediately. Saves the unlock–then–hunt–for–it dance
   * that having images locked by default would otherwise cost.
   */
  editImage(image: ImageShape): void {
    if (image.hidden) this.toolbox.setImageHidden(image.id, false);
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
  }
}
