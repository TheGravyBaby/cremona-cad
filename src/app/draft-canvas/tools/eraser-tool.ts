import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Drag over shapes to delete them — a tablet-friendly alternative to selecting-then-Delete,
 * since a tablet has no right-click or keyboard handy. Reuses host.hitTestShape (the same
 * nearest-shape-within-tolerance lookup a Select-mode click uses), so it respects layer locks
 * and picks whatever's actually under the cursor rather than tracking its own geometry.
 *
 * Each touched shape is its own host.removeShape call/undo step, same granularity as drawing —
 * no batching, unlike a whole-selection drag-move — since an erase gesture is closer to a
 * sequence of deletions than one edit.
 */
export class EraserTool implements DraftTool {
  readonly id = 'eraser';
  readonly label = 'Eraser';
  readonly disableSnapping = true;

  private erasing = false;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    this.erasing = true;
    this.eraseAt(pt, host);
  }

  onPointerMove(pt: Pt, host: DraftToolHost): void {
    if (this.erasing) this.eraseAt(pt, host);
  }

  onPointerUp(): void {
    this.erasing = false;
  }

  private eraseAt(pt: Pt, host: DraftToolHost): void {
    const id = host.hitTestShape(pt);
    if (id) host.removeShape(id);
  }

  renderPreview(_gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void { }

  reset(): void {
    this.erasing = false;
  }
}

export function createEraserTool(): EraserTool {
  return new EraserTool();
}
