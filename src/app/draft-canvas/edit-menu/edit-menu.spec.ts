import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditMenuComponent } from './edit-menu';
import { ToolboxStore } from '../tools/toolbox-store';
import { SelectionStore, toolboxRef } from '../tools/selection-store';

describe('EditMenuComponent', () => {
  let fixture: ComponentFixture<EditMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EditMenuComponent] }).compileComponents();
    fixture = TestBed.createComponent(EditMenuComponent);
    const toolbox = TestBed.inject(ToolboxStore);
    toolbox.resetAll();
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    TestBed.inject(SelectionStore).select(toolboxRef('a'));
    fixture.detectChanges();
  });

  const rows = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.menu-row')];

  it('lists the verbs, greying those with nothing to act on, and says when a row acted', () => {
    expect(rows().map(r => r.querySelector('.menu-label')!.textContent))
      .toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Group', 'Ungroup', 'Delete']);
    expect(rows().find(r => r.textContent!.includes('Ungroup'))!.disabled).toBe(true);
    const toolbox = TestBed.inject(ToolboxStore);
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);

    const del = rows().find(r => r.textContent!.includes('Delete'))!;
    expect(del.disabled).toBe(false);
    del.click();
    expect(toolbox.getShapes()).toEqual([]);
    expect(done).toHaveBeenCalled();
  });
});
