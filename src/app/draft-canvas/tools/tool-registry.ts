import { Injectable, inject } from '@angular/core';
import { DraftTool, DraftToolHost } from './draft-tool';
import { ToolboxStore } from './toolbox-store';
import { createLineTool } from './line-tool';
import { createPerpendicularLineTool, createPolylineTool, createTangentLineTool } from './line-variant-tools';
import { createArcTool, createArcStartFirstTool } from './arc-tool';
import { createEndsCenterArcTool, createThroughArcTool } from './two-end-arc-tool';
import { createTangentArcTool } from './tangent-arc-tool';
import { createChainedTangentArcTool } from './chained-tangent-arc-tool';
import { createJoinArcTool } from './join-arc-tool';
import { createCircleTool, createRegularPolygonTools } from './polygon-tool';
import { createDimensionTool } from './dimension-tool';
import { createAngleTool } from './angle-tool';
import { createCurveLengthTool, createCurveTicksTool } from './curve-tools';
import { createRectTool, createRightTriangleTool } from './box-tool';
import { createBattenTool, createCatenaryTool, createCycloidTool } from './math-curve-tools';
import { createSectionTool } from './section-tool';
import { createTicksTool } from './ticks-tool';
import { createTextTool } from './text-tool';
import { createPointTool } from './point-tool';
import { createFreehandTool } from './freehand-tool';
import { createEraserTool } from './eraser-tool';
import { createOffsetTool } from './offset-tool';
import { createMirrorLineTool, createMoveTool, createRotateTool, createScaleTool } from './transform-tools';
import { SelectionActions } from './selection-actions';

/**
 * One button's worth of space in a palette row: a lone tool written as itself, or a named group
 * of several variants of the same kind of shape (e.g. Arc's construction methods) behind one
 * button plus a caret, so the palette doesn't grow a permanent icon per method. The label heads
 * the group's flyout. Which variant currently faces out is registry state, not part of the slot —
 * see faceOf.
 */
export type ToolGroup = { label: string; tools: DraftTool[] };
export type ToolSlot = DraftTool | ToolGroup;

function isGroup(slot: ToolSlot): slot is ToolGroup {
  return 'tools' in slot;
}

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
  private actions = inject(SelectionActions);
  private listeners = new Set<() => void>();
  private _activeTool: DraftTool | null = null;
  /** Set once by draft-canvas so selectTool can run a tool's onActivate hook. Null until then;
   * nothing can activate a tool before the canvas exists anyway. */
  private host: DraftToolHost | null = null;

  // Add new tools here. Each entry is one palette row; put several tools in a row to make the
  // dock wider rather than taller. A group is one slot holding several variants of the same kind
  // of shape (styles and construction methods alike), collapsed behind one button + caret — see
  // ToolSlot. The toolbar and pointer routing pick all of it up automatically.
  readonly toolRows: ToolSlot[][] = [
    // Freehand is the loose end of the family: a line drawn by hand rather than placed.
    [{
      label: 'Lines', tools: [createLineTool(this.toolbox), createPolylineTool(this.toolbox),
        createTangentLineTool(this.toolbox), createPerpendicularLineTool(this.toolbox), createFreehandTool(this.toolbox)],
    }],
    // Measure and divide: what reads a number off the drawing, then what marks a line into parts.
    [{
      label: 'Measure & Divide', tools: [createDimensionTool(), createSectionTool(this.toolbox), createTicksTool(this.toolbox),
        createAngleTool(), createCurveLengthTool(),createCurveTicksTool(this.toolbox)],
    }],
    // Ordered by where the center click falls — first, second, third, never — then the three that
    // solve themselves off geometry already on the canvas. Keep tool-hotkeys.ts's KeyA cycle in
    // this same order.
    [{
      label: 'Arcs', tools: [createArcTool(), createArcStartFirstTool(), createEndsCenterArcTool(), createThroughArcTool(),
        createTangentArcTool(), createChainedTangentArcTool(), createJoinArcTool()],
    }],
    // Keep tool-hotkeys.ts's KeyC and KeyR cycles in the same order as these two.
    [{ label: 'Circle & Polygons', tools: [createCircleTool(this.toolbox), ...createRegularPolygonTools(this.toolbox)] }],
    [{ label: 'Boxed Shapes', tools: [createRectTool(this.toolbox), createRightTriangleTool(this.toolbox)] }],
    [{ label: 'Mathematical Curves', tools: [createBattenTool(this.toolbox), createCatenaryTool(this.toolbox), createCycloidTool(this.toolbox)] }],
    [createTextTool(this.toolbox)],
    [createPointTool()],
    // Its own button, not folded into Draw's flyout: it deletes any toolbox shape it's dragged
    // over (see eraser-tool.ts), not just Freehand strokes, so it reads as a general tool rather
    // than a Draw accessory.
    [createEraserTool()],
    // Reference images are deliberately not here — they're added from the bottom bar's image
    // list instead, alongside their other controls. See image-placement.ts.
  ];

  readonly modifyRows: ToolSlot[][] = [
    [createMoveTool(this.actions)],
    [createOffsetTool()],
    [createScaleTool(this.actions)],
    [createRotateTool(this.actions)],
    [createMirrorLineTool(this.actions)],
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
    return isGroup(slot) ? slot.tools : [slot];
  }

  /** The tool a slot's button shows and activates: its only tool, or whichever variant was last
   * picked out of its flyout. */
  faceOf(slot: ToolSlot): DraftTool {
    if (!isGroup(slot)) return slot;
    return this.flyoutFaces.get(slot) ?? slot.tools[0];
  }

  /** What a group's flyout is headed with; null for a lone tool, which has no flyout. */
  groupLabel(slot: ToolSlot): string | null {
    return isGroup(slot) ? slot.label : null;
  }

  /** Whether a slot has alternatives worth showing a caret for. */
  hasVariants(slot: ToolSlot): boolean {
    return isGroup(slot) && slot.tools.length > 1;
  }

  /** Activates one of a slot's tools and makes it that slot's new face, so the button keeps
   * showing what you last used regardless of whether a hotkey or a flyout click chose it. */
  selectVariant(slot: ToolSlot, tool: DraftTool): void {
    if (isGroup(slot)) this.flyoutFaces.set(slot, tool);
    this.selectTool(tool);
  }

  /** Activates a tool by id from either tab — used by the hotkey mnemonics. */
  activateById(id: string): void {
    for (const row of [...this.toolRows, ...this.modifyRows]) {
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
