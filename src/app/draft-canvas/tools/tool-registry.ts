import { Injectable, inject } from '@angular/core';
import { DraftTool, DraftToolHost } from './draft-tool';
import { ToolboxStore } from './toolbox-store';
import { ImageAssetStore } from './image-asset-store';
import { createImageTool } from './image-tool';
import { createLineTool } from './line-tool';
import { createArcTool, createArcStartFirstTool } from './arc-tool';
import { createTangentArcTool } from './tangent-arc-tool';
import { createChainedTangentArcTool } from './chained-tangent-arc-tool';
import { createJoinArcTool } from './join-arc-tool';
import { createCircleTool } from './circle-tool';
import { createDimensionTool } from './dimension-tool';
import { createRectTool } from './rect-tool';
import { createSectionTool } from './section-tool';
import { createTextTool } from './text-tool';
import { createPointTool } from './point-tool';
import { createOffsetTool } from './offset-tool';

/**
 * One button's worth of space in a palette row: a lone tool written as itself, or an array
 * grouping several variants of the same kind of shape (e.g. Arc's construction methods) behind
 * one button plus a caret, so the palette doesn't grow a permanent icon per method. Which
 * variant currently faces out is registry state, not part of the slot — see faceOf.
 */
export type ToolSlot = DraftTool | DraftTool[];

/**
 * Owns the set of drafting tools and which one is active — a root-provided singleton, same
 * pattern as ToolboxStore, so both draft-canvas.ts (pointer routing +
 * rendering the active tool's preview) and tool-palette.ts (the toolbar UI) can depend on it
 * directly instead of draft-canvas prop-drilling toolRows/activeTool down through
 * @Input()/@Output(). Assumes a single draft-canvas instance on screen, same as those stores.
 */
@Injectable({ providedIn: 'root' })
export class ToolRegistryService {
  private toolbox = inject(ToolboxStore);
  private imageAssets = inject(ImageAssetStore);
  private listeners = new Set<() => void>();
  private _activeTool: DraftTool | null = null;
  /** Set once by draft-canvas so selectTool can run a tool's onActivate hook. Null until then;
   * nothing can activate a tool before the canvas exists anyway. */
  private host: DraftToolHost | null = null;

  // Add new tools here. Each entry is one palette row; put several tools in a row to make the
  // dock wider rather than taller. A *nested* array is one slot holding several variants of the
  // same kind of shape (styles and construction methods alike), collapsed behind one button +
  // caret — see ToolSlot. The toolbar and pointer routing pick all of it up automatically.
  readonly toolRows: ToolSlot[][] = [
    [createLineTool(this.toolbox)],
    [createDimensionTool()],
    [createSectionTool(this.toolbox)],
    [[createArcTool(), createArcStartFirstTool(), createTangentArcTool(), createChainedTangentArcTool(), createJoinArcTool()]],
    [createCircleTool(this.toolbox)],
    [createRectTool(this.toolbox)],
    [createTextTool()],
    [createPointTool()],
    // Modify tools — act on the current selection rather than drawing new shapes.
    [createOffsetTool()],
    // Reference images — placed from a file rather than drawn, but a placed image is an ordinary
    // selectable/movable shape from then on. See image-tool.ts.
    [createImageTool(this.imageAssets, this.toolbox)],
  ];

  /** Which variant currently faces out of a multi-variant slot, keyed by the slot itself. Absent
   * means the first variant, so this stays empty until a flyout is actually used. Registry state
   * rather than a field on the slot, which is what lets a lone tool be written as itself. */
  private flyoutFaces = new Map<ToolSlot, DraftTool>();

  get activeTool(): DraftTool | null { return this._activeTool; }

  /** Wires the canvas in, so tools activated from anywhere (palette click, hotkey) can run their
   * onActivate hook against it. */
  setHost(host: DraftToolHost): void {
    this.host = host;
  }

  /** Pass null to switch to the default select tool (no active drafting tool). Always resets
   * the outgoing tool and notifies, even if re-selecting the tool that's already active — e.g.
   * clicking an active tool's button again clears its in-progress construction.
   *
   * onActivate runs after the notify, so a tool that immediately hands control back (Image, once
   * its file dialog resolves) does so from a settled state rather than mid-switch. */
  selectTool(tool: DraftTool | null): void {
    this._activeTool?.reset();
    this._activeTool = tool;
    this.notify();
    if (tool && this.host) tool.onActivate?.(this.host);
  }

  /** Every tool in a slot — a one-element list for a lone tool, so callers can treat both alike. */
  variantsOf(slot: ToolSlot): DraftTool[] {
    return Array.isArray(slot) ? slot : [slot];
  }

  /** The tool a slot's button shows and activates: its only tool, or whichever variant was last
   * picked out of its flyout. */
  faceOf(slot: ToolSlot): DraftTool {
    if (!Array.isArray(slot)) return slot;
    return this.flyoutFaces.get(slot) ?? slot[0];
  }

  /** Whether a slot has alternatives worth showing a caret for. */
  hasVariants(slot: ToolSlot): boolean {
    return Array.isArray(slot) && slot.length > 1;
  }

  /** Activates one of a slot's tools and makes it that slot's new face, so the button keeps
   * showing what you last used regardless of whether a hotkey or a flyout click chose it. */
  selectVariant(slot: ToolSlot, tool: DraftTool): void {
    if (Array.isArray(slot)) this.flyoutFaces.set(slot, tool);
    this.selectTool(tool);
  }

  /** Activates a tool by id from anywhere in toolRows — used by the hotkey mnemonics. */
  activateById(id: string): void {
    for (const row of this.toolRows) {
      for (const slot of row) {
        const tool = this.variantsOf(slot).find(t => t.id === id);
        if (tool) { this.selectVariant(slot, tool); return; }
      }
    }
  }

  /** Registers a callback fired whenever the active tool changes; returns an unsubscribe fn. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }
}
