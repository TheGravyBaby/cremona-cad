import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DraftTool } from '../tools/draft-tool';
import { ToolSlot } from '../tools/tool-slot';
import { ToolRegistryService } from '../tools/tool-registry';
import { ToolboxStore } from '../tools/toolbox-store';
import { Layer } from '../tools/layer';
import { HOTKEY_LETTER_BY_TOOL } from '../tools/tool-hotkeys';
import { ReferenceImageStore } from '../reference-image-store';
import { ReferenceImage } from '../../models/types';
import { info } from '../../shared/message-emitter';

/**
 * The floating drafting toolbox: tool selection, the Layers flyout, and the Reference-image
 * flyout. Per-shape-type settings now live in the bottom bar instead — see settings-bar.ts.
 * Everything here is either pure display state (which popup is open, which flyout variant faces
 * out) or a thin wrapper around ToolboxStore/ReferenceImageStore (layer CRUD, reference tab
 * CRUD) — draft-canvas.ts keeps ownership of the actual tool instances/pointer routing and only
 * needs to know which tool is active.
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
  public refImages = inject(ReferenceImageStore);
  private toolRegistry = inject(ToolRegistryService);
  private toolRegistryUnsub?: () => void;

  public get toolRows(): ToolSlot[][] { return this.toolRegistry.toolRows; }
  public get activeTool(): DraftTool | null { return this.toolRegistry.activeTool; }
  /** The one bridge back to draft-canvas.ts for reference images: only it can trigger the
   * hidden file input (it needs camera bounds to place the uploaded image). */
  @Output() addReferenceRequested = new EventEmitter<void>();
  @Output() replaceReferenceRequested = new EventEmitter<void>();

  public openFlyout: ToolSlot | null = null;
  public layersOpen = false;
  public editingLayerId: string | null = null;
  public editingRefId: string | null = null;

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

  /** Activates a slot's current tool — its only tool if single, its selected variant if a flyout. */
  activateSlot(slot: ToolSlot): void {
    this.openFlyout = null;
    this.toolRegistry.selectTool(slot.kind === 'single' ? slot.tool : slot.variants[slot.selectedIndex]);
  }

  toggleFlyout(slot: ToolSlot): void {
    this.openFlyout = this.openFlyout === slot ? null : slot;
    this.layersOpen = false;
    this.refImages.setReferenceModeEnabled(false);
  }

  /** Picking a variant from the flyout both activates it and becomes the slot's new default face. */
  chooseFlyoutVariant(slot: Extract<ToolSlot, { kind: 'flyout' }>, index: number): void {
    slot.selectedIndex = index;
    this.openFlyout = null;
    this.toolRegistry.selectTool(slot.variants[index]);
  }

  /** The hotkey letter for a tool id, formatted for a tooltip (e.g. " (L)"), or '' if it has none. */
  public hotkeyHint(toolId: string): string {
    const letter = HOTKEY_LETTER_BY_TOOL[toolId];
    return letter ? ` (${letter})` : '';
  }

  toggleLayers(): void {
    this.layersOpen = !this.layersOpen;
    this.openFlyout = null;
    this.refImages.setReferenceModeEnabled(false);
  }

  /** Doubles as "open the popup" and "enable on-canvas drag/resize handles" — see
   * ReferenceImageStore.referenceModeEnabled. */
  toggleReference(): void {
    this.refImages.toggleMode();
    this.openFlyout = null;
    this.layersOpen = false;
  }

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

  startRenameLayer(id: string): void {
    this.editingLayerId = id;
    // The rename <input> is created by this state change; focus it next tick.
    setTimeout(() => {
      const el = (this.elRef.nativeElement as HTMLElement).querySelector('.layer-tab-edit') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
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

  // ===== Reference image =====
  // Camera/pointer-dependent parts (drag/resize handles on canvas, the actual controller/file
  // reading) stay in draft-canvas.ts — everything here is either a thin ReferenceImageStore
  // delegation or pure UI state (editingRefId), same pattern as Layers above.

  selectRefTab(id: string): void {
    this.refImages.selectTab(id);
    this.editingRefId = null;
  }

  startRenameRef(id: string): void {
    this.editingRefId = id;
    // The rename <input> is created by this state change; focus it next tick.
    setTimeout(() => {
      const el = (this.elRef.nativeElement as HTMLElement).querySelector('.ref-tab-edit') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  commitRenameRef(id: string, label: string): void {
    this.refImages.renameTab(id, label);
    this.editingRefId = null;
  }

  deleteRefTab(id: string): void {
    this.refImages.deleteTab(id);
    if (this.editingRefId === id) this.editingRefId = null;
  }

  onRefParamChange(key: keyof ReferenceImage, val: number): void {
    this.refImages.setParam(key, val);
  }

  resetReferenceImage(): void {
    this.refImages.resetActive();
  }

  requestAddReference(): void {
    this.addReferenceRequested.emit();
  }

  requestReplaceReference(): void {
    this.replaceReferenceRequested.emit();
  }

  referenceControlsInfo(): void {
    info(
      "Each tab is a separate reference image, so you can trace different profiles (plan, long arch, cross arch) without losing the others. Only the active tab is shown and editable.\n\n" +
      " - + adds a reference image, double-click a tab to rename it, and × removes it.\n" +
      " - Replace swaps the active tab's image; Reset restores it to the values it had when you last selected this tab.\n\n" +
      "You can upload a reference image using the + or Replace button. It is recommended you scale the image using either the axis or the bounding box on the base measurement panel.\n\n" +
      "X and Y position the image on the canvas.\n" +
      "Width and height set the dimensions of the image in millimetres.\n" +
      "Rotation rotates the image in degrees.\n\n" +
      "Mouse controls:\n" +
      " - Drag the image to reposition it.\n" +
      " - Drag a corner handle to resize proportionally; drag an edge handle to resize just that dimension (it snaps back to proportional once you drag past the image's original size).\n" +
      " - Hold Space and drag (or use the middle mouse button) to pan the camera without moving the image.\n" +
      " - Scroll to zoom; two-finger trackpad scroll pans, pinch zooms.\n\n" +
      "Keyboard controls:\n" +
      " - Arrow keys: nudge the image by 1 mm.\n" +
      " - Ctrl + Up/Down: scale the image; Ctrl + Left/Right: rotate it 1°.\n" +
      " - F: fit the full design back into view.\n" +
      " - +/-: zoom in or out.\n" +
      " - Outside of reference mode, arrow keys pan the camera instead (Shift for larger steps).\n",
      "Reference Image", false
    );
  }
}
