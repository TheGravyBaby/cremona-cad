import { Directive, ElementRef, EventEmitter, HostListener, OnDestroy, Output, inject } from '@angular/core';
import { clamp } from '../helpers/math/simpleGeometry';

/** A row taken from index `from` and put back at index `to`, both into the list as it stands. */
export interface RowMove {
  from: number;
  to: number;
}

// applies a move to a list shown with an extra marker row spliced in (e.g. a spline's peak among
// its control points) and reports where that row ends up. Drag indices only agree with list
// indices above the marker, which is what this centralizes.
export function applyRowMove<T>(items: T[], marker: number, move: RowMove): number {
  const rows = items.length;
  const pinned = clamp(marker, 0, rows);
  const from = clamp(move.from, 0, rows);
  const to = clamp(move.to, 0, rows);
  // the marker's own row: list untouched, it lands where dropped.
  if (from === pinned) return to;

  const [item] = items.splice(from < pinned ? from : from - 1, 1);
  if (item === undefined) return pinned;
  // lifting the row out moves everything below it up a place, marker included.
  const lifted = from < pinned ? pinned - 1 : pinned;
  const above = to <= lifted;
  items.splice(above ? to : to - 1, 0, item);
  return above ? lifted + 1 : lifted;
}

/** Marks a row the directive may move, and the grip inside it a drag starts from. */
const ROW = '[data-reorder-row]';
const HANDLE = '[data-reorder-handle]';
/** On the row being dragged, for as long as it is being dragged. */
const DRAGGING = 'reorder-dragging';

/** A drag in progress: what was grabbed, where it started, and where it sits now. */
interface Drag {
  pointerId: number;
  handle: HTMLElement;
  /** Row pitch in px, measured once at grab — the list's rows are a uniform height. */
  step: number;
  startY: number;
  /** The index grabbed, and the index the row currently occupies. */
  from: number;
  at: number;
}

/**
 * Drag-to-reorder for a list of sidebar rows. Movable rows are marked `data-reorder-row`, the
 * grip inside each `data-reorder-handle`; unmarked rows (a header, a peak row) aren't counted or
 * moved. Every move is emitted as a {@link RowMove} for the panel to apply — the directive never
 * touches DOM order itself. Reorders live, during the drag, so a row is emitted each time it
 * passes a neighbour; rows are re-read from the DOM each move since each emit re-renders the
 * list. The grip also takes ArrowUp/ArrowDown while focused.
 */
@Directive({
  selector: '[appRowReorder]',
  standalone: true,
})
export class RowReorderDirective implements OnDestroy {
  @Output() rowReorder = new EventEmitter<RowMove>();

  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private drag: Drag | null = null;

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(e: PointerEvent): void {
    if (this.drag || e.button !== 0) return;
    const handle = this.handleFrom(e.target);
    if (!handle) return;
    const rows = this.rows();
    const from = rows.findIndex(r => r.contains(handle));
    if (from < 0 || rows.length < 2) return;

    // pitch taken across the whole list, so inter-row gaps are included without measuring one.
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    const step = (last.top - first.top) / (rows.length - 1) || first.height;
    if (!(step > 0)) return;

    // prevents text selection / scroll, which a press-and-drag over number fields would start.
    e.preventDefault();
    handle.setPointerCapture?.(e.pointerId);
    this.drag = { pointerId: e.pointerId, handle, step, startY: e.clientY, from, at: from };
    this.lift(rows[from], 0);

    const doc = this.host.ownerDocument;
    doc.addEventListener('pointermove', this.onPointerMove);
    doc.addEventListener('pointerup', this.onPointerUp);
    doc.addEventListener('pointercancel', this.onPointerUp);
  }

  // whole pitches travelled from the grab point, not the last swap, so retracing the same ground
  // undoes in order rather than ratcheting.
  private onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const rows = this.rows();
    if (rows.length < 2) return;

    const dy = e.clientY - d.startY;
    const to = clamp(d.from + Math.round(dy / d.step), 0, rows.length - 1);
    if (to !== d.at) {
      this.settle(rows[d.at]);
      this.rowReorder.emit({ from: d.at, to });
      d.at = to;
    }
    // offset from the slot it now holds, so it tracks the pointer while passed rows stay put.
    this.lift(rows[d.at], dy - (d.at - d.from) * d.step);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag();
  };

  @HostListener('keydown', ['$event'])
  protected onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const handle = this.handleFrom(e.target);
    if (!handle) return;
    const rows = this.rows();
    const from = rows.findIndex(r => r.contains(handle));
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= rows.length) return;

    e.preventDefault();
    this.rowReorder.emit({ from, to });
    // rows stay put and contents move, so focus follows to where the moved row landed.
    rows[to].querySelector<HTMLElement>(HANDLE)?.focus();
  }

  ngOnDestroy(): void {
    if (this.drag) this.endDrag();
  }

  private rows(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(ROW));
  }

  /** The grip an event came from, if it came from one of this list's. */
  private handleFrom(target: EventTarget | null): HTMLElement | null {
    const handle = (target as Element | null)?.closest?.(HANDLE) as HTMLElement | null;
    return handle && this.host.contains(handle) ? handle : null;
  }

  private lift(row: HTMLElement | undefined, dy: number): void {
    if (!row) return;
    row.classList.add(DRAGGING);
    row.style.transform = `translateY(${dy}px)`;
  }

  private settle(row: HTMLElement | undefined): void {
    if (!row) return;
    row.classList.remove(DRAGGING);
    row.style.transform = '';
  }

  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.settle(this.rows()[d.at]);
    d.handle.releasePointerCapture?.(d.pointerId);
    const doc = this.host.ownerDocument;
    doc.removeEventListener('pointermove', this.onPointerMove);
    doc.removeEventListener('pointerup', this.onPointerUp);
    doc.removeEventListener('pointercancel', this.onPointerUp);
  }
}
