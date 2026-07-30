import { Component, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DraftTool } from '../tools/draft-tool';
import { ToolSlot } from '../tools/tool-slot';
import { ToolRegistryService } from '../tools/tool-registry';
import { ToolboxStore } from '../tools/toolbox-store';
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

  public openFlyout: ToolSlot | null = null;
  public layersOpen = false;
  public editingLayerId: string | null = null;

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

}
