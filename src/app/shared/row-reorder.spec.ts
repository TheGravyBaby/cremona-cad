import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { applyRowMove, RowMove, RowReorderDirective } from './row-reorder';

@Component({
  standalone: true,
  imports: [RowReorderDirective],
  template: `
    <div class="list" appRowReorder (rowReorder)="move($event)">
      <div class="head">not a row</div>
      @for (item of items; track $index) {
      <div class="row" data-reorder-row>
        <button class="grip" data-reorder-handle>⠿</button>
        <span class="value">{{ item }}</span>
      </div>
      }
    </div>
  `,
})
class HostComponent {
  items = ['a', 'b', 'c', 'd'];
  moves: RowMove[] = [];

  move(m: RowMove): void {
    this.moves.push(m);
    const [item] = this.items.splice(m.from, 1);
    this.items.splice(m.to, 0, item);
  }
}

/** Row pitch the stubbed layout reports — jsdom measures everything as zero. */
const PITCH = 30;

describe('RowReorderDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const rows = () => Array.from(fixture.nativeElement.querySelectorAll('.row') as NodeListOf<HTMLElement>);
  const grip = (i: number) => rows()[i].querySelector('.grip') as HTMLElement;

  /** A pointer event jsdom will construct — it has no PointerEvent of its own. */
  function pointer(type: string, target: EventTarget, clientY: number, over: Partial<PointerEvent> = {}): void {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
    Object.assign(e, { pointerId: 1, ...over });
    target.dispatchEvent(e);
  }

  const dragTo = (from: number, clientY: number) => {
    pointer('pointerdown', grip(from), 0);
    pointer('pointermove', document, clientY);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    // stack the rows on a uniform pitch, which is what the directive measures its step from.
    rows().forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: i * PITCH, height: PITCH }) as DOMRect;
    });
  });

  it('moves a row one place per row-height dragged', () => {
    dragTo(0, PITCH * 2 + 5);
    expect(host.items).toEqual(['b', 'c', 'a', 'd']);
    // one move covering both rows, since the jump crosses them in a single pointer event
    expect(host.moves).toEqual([{ from: 0, to: 2 }]);
  });

  it('retraces its steps when dragged back, rather than ratcheting', () => {
    pointer('pointerdown', grip(3), 0);
    pointer('pointermove', document, -PITCH * 2);
    pointer('pointermove', document, -PITCH);
    expect(host.items).toEqual(['a', 'b', 'd', 'c']);
  });

  it('holds a row inside the list at both ends', () => {
    dragTo(1, -PITCH * 10);
    expect(host.items).toEqual(['b', 'a', 'c', 'd']);
    pointer('pointerup', document, -PITCH * 10);

    dragTo(0, PITCH * 10);
    expect(host.items).toEqual(['a', 'c', 'd', 'b']);
  });

  it('marks the row being carried, and stops when the pointer lifts', () => {
    dragTo(0, PITCH);
    expect(rows()[1].classList.contains('reorder-dragging')).toBe(true);
    expect(rows()[0].classList.contains('reorder-dragging')).toBe(false);

    pointer('pointerup', document, PITCH);
    expect(rows().some(r => r.classList.contains('reorder-dragging'))).toBe(false);

    // The lifted pointer is no longer dragging anything.
    pointer('pointermove', document, PITCH * 3);
    expect(host.moves.length).toBe(1);
  });

  it('ignores a press that did not start on a grip', () => {
    pointer('pointerdown', rows()[0].querySelector('.value')!, 0);
    pointer('pointermove', document, PITCH * 2);
    expect(host.moves).toEqual([]);
  });

  it('steps a row with the arrow keys, keeping the grip under the keyboard', () => {
    grip(1).focus();
    grip(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(host.items).toEqual(['a', 'c', 'b', 'd']);
    expect(document.activeElement).toBe(grip(2));

    // Nothing past the ends: the first row has nowhere up to go.
    grip(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(host.moves.length).toBe(1);
  });
});

// written as row pictures rather than index pairs: `*` marks the extra row (e.g. a spline's peak).
describe('applyRowMove', () => {
  /** Applies a move to `rows` and gives back the picture it leaves. */
  function moved(rows: string, move: RowMove): string {
    const items = rows.split('').filter(c => c !== '*');
    const marker = applyRowMove(items, rows.indexOf('*'), move);
    const out = [...items];
    out.splice(marker, 0, '*');
    return out.join('');
  }

  it('moves the extra row itself, leaving the list alone', () => {
    expect(moved('*abc', { from: 0, to: 3 })).toBe('abc*');
    expect(moved('abc*', { from: 3, to: 1 })).toBe('a*bc');
  });

  it('moves an item down past the extra row', () => {
    expect(moved('*abc', { from: 1, to: 3 })).toBe('*bca');
    expect(moved('a*bc', { from: 0, to: 2 })).toBe('*bac');
  });

  it('moves an item up past the extra row', () => {
    expect(moved('a*bc', { from: 3, to: 0 })).toBe('ca*b');
    expect(moved('ab*c', { from: 3, to: 2 })).toBe('abc*');
  });

  it('leaves everything where it was when a row is dropped where it started', () => {
    expect(moved('ab*c', { from: 2, to: 2 })).toBe('ab*c');
    expect(moved('ab*c', { from: 0, to: 0 })).toBe('ab*c');
  });

  it('holds a move inside the table', () => {
    expect(moved('*abc', { from: 1, to: 99 })).toBe('*bca');
    expect(moved('abc*', { from: 3, to: -5 })).toBe('*abc');
  });
});
