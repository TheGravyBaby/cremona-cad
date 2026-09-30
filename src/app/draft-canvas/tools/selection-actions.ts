import { Injectable, inject } from '@angular/core';
import { warn } from '../../shared/message-emitter';
import { DraftShape, makeShapeId } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';
import { SelectionStore, toolboxRef } from './selection-store';
import { shapesToSvg, svgToShapes } from './shape-svg';
import { reflectAcross, rotateAbout, transformShape, translateShape } from './shape-transform';
import { ShapeBounds, shapeBounds } from './shape-hit-test';
import { Matrix2D } from '../../helpers/math/pathMath';
import { Pt } from '../../models/types';

/**
 * The actions that act on the selection as a whole — the edit verbs, and the Modify tab's transforms,
 * alignment and stacking order.
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
  get canMirror(): boolean { return this.canCopy; }
  get canTransform(): boolean { return this.selection.size > 0; }
  /** Needs something to line up against: two shapes, at least one of them free to move. */
  get canAlign(): boolean { return this.selection.shapes.length > 1 && this.selection.toolboxShapes.length > 0; }
  get canReorder(): boolean { return this.selection.toolboxShapes.some(s => s.type !== 'image'); }

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

  /** Flips the selection left-right or top-bottom across its own centre, or left-right across
   * the instrument's centreline at x = 0. */
  mirror(about: 'horizontal' | 'vertical' | 'centreline'): boolean {
    if (about === 'centreline') return this.transform(reflectAcross({ x: 0, y: 0 }, Math.PI / 2), 'Mirror');
    const centre = this.centre();
    if (!centre) return false;
    return this.transform(reflectAcross(centre, about === 'horizontal' ? Math.PI / 2 : 0), 'Mirror');
  }

  rotate90(direction: 'ccw' | 'cw'): boolean {
    const centre = this.centre();
    if (!centre) return false;
    return this.transform(rotateAbout(centre, direction === 'ccw' ? Math.PI / 2 : -Math.PI / 2), 'Rotate');
  }

  /** The middle of the selection's bounding box, what the flip and quarter-turn buttons turn it
   * about; null with nothing selected. */
  centre(): Pt | null {
    const box = unionBounds(this.selection.shapes.map(shapeBounds));
    return box && { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  }

  /**
   * Carries the selection through `m` (see transformShape) as one undo step. A recipe piece can't
   * change, so it gets a transformed copy on the active layer, which takes its place in the
   * selection. `action` names the refusal when the active layer is locked.
   */
  transform(m: Matrix2D, action: string): boolean {
    const pieces = this.selection.sceneShapes;
    if (pieces.length && !this.activeLayerAccepts(action)) return false;
    const replaced = this.selection.toolboxShapes.map(s => transformShape(s, m)).filter(s => s !== null);
    const copies = pieces.map(s => transformShape(s, m)).filter(s => s !== null).map(s => this.stamp(s));
    if (replaced.length === 0 && copies.length === 0) return false;
    if (copies.length) this.toolbox.setShowShapes(true);
    this.toolbox.replaceShapes(replaced, copies);
    if (copies.length) {
      this.selection.set([
        ...this.selection.all.filter(r => r.source === 'toolbox'),
        ...copies.map(s => toolboxRef(s.id)),
      ]);
    }
    return true;
  }

  /**
   * Lines the selection's drawn shapes up by an edge or centre of their joint bounding box — or,
   * when recipe pieces are selected too, of theirs, since those can't move: it's how a drawn shape
   * is brought square to the instrument. `top` is the high-y edge, the world being y-up.
   */
  align(edge: 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'): boolean {
    if (!this.canAlign) return false;
    const movers = this.selection.toolboxShapes;
    const anchors = this.selection.sceneShapes;
    const target = unionBounds((anchors.length ? anchors : movers).map(shapeBounds))!;
    const along = (b: ShapeBounds): number => {
      switch (edge) {
        case 'left': return b.x0;
        case 'centre': return (b.x0 + b.x1) / 2;
        case 'right': return b.x1;
        case 'bottom': return b.y0;
        case 'middle': return (b.y0 + b.y1) / 2;
        case 'top': return b.y1;
      }
    };
    const horizontal = edge === 'left' || edge === 'centre' || edge === 'right';
    const moved = movers.map(s => {
      const shift = along(target) - along(shapeBounds(s));
      return horizontal ? translateShape(s, shift, 0) : translateShape(s, 0, shift);
    });
    this.toolbox.replaceShapes(moved);
    return true;
  }

  /** To the top or bottom of the drawing order. Images always sit beneath everything, so they
   * stay out of it. */
  reorder(to: 'front' | 'back'): void {
    this.toolbox.reorderShapes(this.selection.toolboxShapes.filter(s => s.type !== 'image').map(s => s.id), to);
  }

  private place(shapes: DraftShape[]): boolean {
    if (shapes.length === 0 || !this.activeLayerAccepts('Paste')) return false;
    const placed = shapes.map(s => this.stamp(s));
    this.toolbox.setShowShapes(true);
    this.toolbox.addShapes(placed);
    this.selection.set(placed.map(s => toolboxRef(s.id)));
    return true;
  }

  /** A shape made new: its own id, on the active layer, in the pen colour if it had none. */
  private stamp(shape: DraftShape): DraftShape {
    return {
      ...shape, id: makeShapeId(), layerId: this.toolbox.activeLayerId, color: shape.color ?? this.toolbox.currentColor,
    } as DraftShape;
  }

  private activeLayerAccepts(action: string): boolean {
    const layerId = this.toolbox.activeLayerId;
    if (!this.toolbox.layers.find(l => l.id === layerId)?.locked) return true;
    warn('The active layer is locked — unlock it or switch layers first.', action);
    return false;
  }
}

function unionBounds(boxes: ShapeBounds[]): ShapeBounds | null {
  if (boxes.length === 0) return null;
  return {
    x0: Math.min(...boxes.map(b => b.x0)), x1: Math.max(...boxes.map(b => b.x1)),
    y0: Math.min(...boxes.map(b => b.y0)), y1: Math.max(...boxes.map(b => b.y1)),
  };
}

/**
 * Puts copied SVG on the system clipboard as an SVG image as well as text, where the browser can
 * (Chrome), for programs that take SVG only as an image. Returns whether it wrote, so a caller
 * with no text copy of its own knows to write one.
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
