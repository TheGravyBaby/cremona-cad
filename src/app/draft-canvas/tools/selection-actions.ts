import { Injectable, inject } from '@angular/core';
import { warn } from '../../shared/message-emitter';
import { DraftShape, makeShapeId } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { SelectionStore, toolboxRef } from './selection-store';
import { shapesToSvg, svgToShapes } from './shape-svg';

/**
 * The edit actions that act on the selection as a whole — cut, copy, paste, duplicate, delete.
 * A root singleton so the top bar's buttons and the canvas's keyboard and clipboard events run
 * the same code; neither owns the selection, SelectionStore does.
 *
 * Keeps its own copy of what was last copied, as shapes. The system clipboard is written and
 * read by the callers, since only a DOM clipboard event or a button's user gesture may touch
 * it — so a paste inside Cremona never depends on the browser letting the page read it back.
 */
@Injectable({ providedIn: 'root' })
export class SelectionActions {
  private toolbox = inject(ToolboxStore);
  private selection = inject(SelectionStore);
  private clipboard: DraftShape[] = [];

  /** Anything but a reference image can be copied, a recipe piece included. */
  get canCopy(): boolean { return this.selection.shapes.some(s => s.type !== 'image'); }
  /** Cutting removes, so only drawn shapes qualify — a recipe piece is copied but stays. */
  get canCut(): boolean { return this.selection.toolboxShapes.some(s => s.type !== 'image'); }
  get canDelete(): boolean { return this.selection.toolboxShapes.length > 0; }
  get canDuplicate(): boolean { return this.canCopy; }
  get canPaste(): boolean { return this.clipboard.length > 0; }

  /** Copies the selection and returns it as SVG text for the system clipboard, or null when
   * there was nothing to copy. */
  copy(): string | null {
    const shapes = this.selection.shapes.filter(s => s.type !== 'image');
    if (shapes.length === 0) return null;
    this.clipboard = shapes.map(s => ({ ...s, color: s.color ?? this.toolbox.currentColor }));
    return shapesToSvg(this.clipboard);
  }

  cut(): string | null {
    const svg = this.copy();
    if (svg) this.toolbox.removeShapes(this.selection.toolboxShapes.filter(s => s.type !== 'image').map(s => s.id));
    return svg;
  }

  delete(): void {
    this.toolbox.removeShapes(this.selection.toolboxShapes.map(s => s.id));
  }

  /**
   * Places what's on the clipboard, in place, on the active layer, and selects it. Given text
   * (from a clipboard event or a read of the system clipboard) it pastes that when it parses as
   * SVG and refuses when it's some other text — pasting a paragraph must not drop stale shapes.
   * Given nothing, it pastes the internal copy. Returns whether anything landed.
   */
  paste(text: string | null = null): boolean {
    let shapes: DraftShape[] | null;
    if (text?.trim()) {
      shapes = svgToShapes(text);
      if (shapes === null) return false;
    } else {
      shapes = this.clipboard;
    }
    return this.place(shapes);
  }

  /** A copy of the selection over itself, Inkscape-style. A recipe piece becomes a drawn shape in
   * the pen colour — the one way to get an editable version of the instrument's own geometry. */
  duplicate(): boolean {
    return this.place(this.selection.shapes.filter(s => s.type !== 'image'));
  }

  private place(shapes: DraftShape[]): boolean {
    if (shapes.length === 0) return false;
    const layerId = this.toolbox.activeLayerId;
    if (this.toolbox.layers.find(l => l.id === layerId)?.locked) {
      warn('The active layer is locked — unlock it or switch layers first.', 'Paste');
      return false;
    }
    const placed = shapes.map(s => ({
      ...s, id: makeShapeId(), layerId, color: s.color ?? this.toolbox.currentColor,
    }) as DraftShape);
    this.toolbox.setShowShapes(true);
    this.toolbox.addShapes(placed);
    this.selection.set(placed.map(s => toolboxRef(s.id)));
    return true;
  }
}

/**
 * Puts copied SVG on the system clipboard as an SVG image as well as text, where the browser can
 * (Chrome). Inkscape on macOS only takes SVG from the image type: it asks for plain text by a name
 * the Mac clipboard never lists, so text alone reaches it as nothing. Returns whether it wrote,
 * so a caller with no text copy of its own knows to write one.
 */
export function writeSvgToSystemClipboard(svg: string): boolean {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (!clipboard?.write || typeof ClipboardItem === 'undefined' || !ClipboardItem.supports?.('image/svg+xml')) return false;
  clipboard.write([new ClipboardItem({
    'text/plain': new Blob([svg], { type: 'text/plain' }),
    'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }),
  })]).catch(() => clipboard.writeText(svg).catch(() => { }));
  return true;
}
