import { Injectable, inject } from '@angular/core';
import { DraftTool } from './draft-tool';
import { ToolSlot, single, flyout } from './tool-slot';
import { ToolboxStore } from './toolbox-store';
import { createLineTool } from './line-tool';
import { createArcTool, createArcStartFirstTool } from './arc-tool';
import { createTangentArcTool } from './tangent-arc-tool';
import { createChainedTangentArcTool } from './chained-tangent-arc-tool';
import { createJoinArcTool } from './join-arc-tool';
import { createCircleTool } from './circle-tool';
import { createDimensionTool } from './dimension-tool';
import { createRectTool } from './rect-tool';
import { createBoxLineTool } from './box-line-tool';
import { createTextTool } from './text-tool';
import { createPointTool } from './point-tool';
import { createOffsetTool } from './offset-tool';

/**
 * Owns the set of drafting tools and which one is active — a root-provided singleton, same
 * pattern as ToolboxStore/ReferenceImageStore, so both draft-canvas.ts (pointer routing +
 * rendering the active tool's preview) and tool-palette.ts (the toolbar UI) can depend on it
 * directly instead of draft-canvas prop-drilling toolRows/activeTool down through
 * @Input()/@Output(). Assumes a single draft-canvas instance on screen, same as those stores.
 */
@Injectable({ providedIn: 'root' })
export class ToolRegistryService {
  private toolbox = inject(ToolboxStore);
  private listeners = new Set<() => void>();
  private _activeTool: DraftTool | null = null;

  // Add new tools here, grouped into rows of up to 2 slots. Use flyout([...])
  // to group every variant of the same kind of shape (styles and construction
  // methods alike) behind one button + caret; use single(...) for a tool with
  // no variants. The toolbar and pointer routing pick both up automatically.
  readonly toolRows: ToolSlot[][] = [
    [
      single(createLineTool(this.toolbox)),
    ],
    [ single(createDimensionTool()) ],
    [
      flyout([createArcTool(), createArcStartFirstTool(), createTangentArcTool(), createChainedTangentArcTool(), createJoinArcTool()]),
    ],
    [
      single(createCircleTool(this.toolbox)),
    ],
    [
      single(createRectTool(this.toolbox)),
    ],
    [
      single(createBoxLineTool(this.toolbox)),
    ],
    [
      single(createTextTool()),
    ],
    [
      single(createPointTool()),
    ],
    // Modify tools — act on the current selection rather than drawing new shapes; Join will
    // join this row once it exists.
    [
      single(createOffsetTool()),
    ],
  ];

  get activeTool(): DraftTool | null { return this._activeTool; }

  /** Pass null to switch to the default select tool (no active drafting tool). Always resets
   * the outgoing tool and notifies, even if re-selecting the tool that's already active — e.g.
   * clicking an active tool's button again clears its in-progress construction. */
  selectTool(tool: DraftTool | null): void {
    this._activeTool?.reset();
    this._activeTool = tool;
    this.notify();
  }

  /** Activates a tool by id from anywhere in toolRows — used by the hotkey mnemonics. Mutates
   * the slot's selectedIndex directly so a flyout's face stays in sync regardless of whether
   * the hotkey or a click on the flyout triggered the switch. */
  activateById(id: string): void {
    for (const row of this.toolRows) {
      for (const slot of row) {
        if (slot.kind === 'single') {
          if (slot.tool.id === id) { this.selectTool(slot.tool); return; }
        } else {
          const idx = slot.variants.findIndex(v => v.id === id);
          if (idx >= 0) { slot.selectedIndex = idx; this.selectTool(slot.variants[idx]); return; }
        }
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
