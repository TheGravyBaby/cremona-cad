import { Directive, ElementRef, EventEmitter, HostListener, OnDestroy, Output, inject } from '@angular/core';
import { clamp } from '../helpers/draftMath';

/** A row taken from index `from` and put back at index `to`, both into the list as it stands. */
export interface RowMove {
  from: number;
  to: number;
}

/**
 * Applies one of those moves to a list that is shown with a further row spliced
 * into it — a spline's peak among its control points — and reports where that
 * row ends up. The list is reordered in place; `marker` is its row's index,
 * counted the same way the rows are.
 *
 * The row indices a drag speaks in are not indices into the list, and the two
 * only agree above the marker. Working it out at each call site is three
 * off-by-ones deep and gets it wrong in a different way each time, which is why
 * it lives here beside the directive that produces the move.
 */
export function applyRowMove<T>(items: T[], marker: number, move: RowMove): number {
  const rows = items.length;
  const pinned = clamp(marker, 0, rows);
  const from = clamp(move.from, 0, rows);
  const to = clamp(move.to, 0, rows);
  // The marker's own row: the list is untouched and the row simply lands where
  // it was dropped.
  if (from === pinned) return to;

  const [item] = items.splice(from < pinned ? from : from - 1, 1);
  if (item === undefined) return pinned;
  // With the row lifted out, everything below where it came from has moved up a
  // place — the marker included.
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
 * Drag-to-reorder for a list of sidebar rows.
 *
 * Applied to the list container, with each movable row marked `data-reorder-row`
 * and the grip inside it `data-reorder-handle`; rows are addressed by their
 * order under the container, so unmarked rows — a header, a peak row — sit in
 * the list without being counted or moved. Every move is reported as a
 * {@link RowMove} for the panel to apply to its own array: the directive never
 * touches the DOM order, which stays Angular's to own.
 *
 * The list reorders *during* the drag rather than on release. That is what
 * makes it an arranging tool rather than a guess — the maker sees the order
 * they are about to get while the pointer is still down. So a row is emitted
 * every time it passes a neighbour, and the rows are re-read from the DOM each
 * move rather than cached, since each emit re-renders the list.
 *
 * The grip also takes ArrowUp/ArrowDown while focused, which is both the
 * keyboard route and the way to nudge one row by one place without aiming.
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

    // One row's pitch, taken across the whole list so the gaps between rows are
    // included without measuring one. A drag then lands on a row per pitch
    // travelled, which is the only geometry the swap needs.
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    const step = (last.top - first.top) / (rows.length - 1) || first.height;
    if (!(step > 0)) return;

    // Not a text selection and not a scroll, both of which a press-and-drag
    // inside a panel of number fields would otherwise start.
    e.preventDefault();
    handle.setPointerCapture?.(e.pointerId);
    this.drag = { pointerId: e.pointerId, handle, step, startY: e.clientY, from, at: from };
    this.lift(rows[from], 0);

    const doc = this.host.ownerDocument;
    doc.addEventListener('pointermove', this.onPointerMove);
    doc.addEventListener('pointerup', this.onPointerUp);
    doc.addEventListener('pointercancel', this.onPointerUp);
  }

  /**
   * Where the row belongs now: whole pitches travelled from where it was
   * grabbed. Counted from the grab rather than from the last swap, so a slow
   * drag back over the same ground retraces the order it came through instead
   * of ratcheting.
   */
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
    // Offset from the slot it now holds, so the row tracks the pointer while
    // the ones it has passed sit where they will stay.
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
    // The rows stay put and their contents move, so the grip to keep the
    // keyboard on is the one in the row the moved row landed in — otherwise a
    // second press would move whichever row has arrived under the focus.
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
