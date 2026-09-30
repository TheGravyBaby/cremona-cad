import { TestBed } from '@angular/core/testing';
import { SettingsBarComponent } from './settings-bar';
import { ToolboxStore } from '../tools/toolbox-store';
import { SelectionStore, toolboxRef } from '../tools/selection-store';
import { SceneStore } from '../tools/scene-index';
import { LineShape } from '../tools/toolbox-shape';

describe('SettingsBarComponent', () => {
  let toolbox: ToolboxStore;
  let selection: SelectionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SettingsBarComponent] });
    toolbox = TestBed.inject(ToolboxStore);
    selection = TestBed.inject(SelectionStore);
    toolbox.resetAll();
    TestBed.inject(SceneStore).setLayers([]);
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, groupId: 'g1' });
    toolbox.addShape({ id: 'b', type: 'line', start: { x: 0, y: 10 }, end: { x: 10, y: 10 }, groupId: 'g1' });
    selection.set([toolboxRef('a')]);
  });

  it('reads a group as one thing: its title and centre', () => {
    const fixture = TestBed.createComponent(SettingsBarComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.settings-title')!.textContent).toBe('Group Settings');
    const inputs = el.querySelectorAll<HTMLInputElement>('.point-group input');
    expect([inputs[0].valueAsNumber, inputs[1].valueAsNumber]).toEqual([5, 5]);
  });

  it('leaves a lone shape to its own fields rather than describing it twice', () => {
    toolbox.updateShape('a', { groupId: undefined });
    toolbox.updateShape('b', { groupId: undefined });
    selection.set([toolboxRef('a')]);
    const fixture = TestBed.createComponent(SettingsBarComponent);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.f-lbl')].map(l => l.textContent);
    expect(labels.filter(l => l === 'X')).toEqual([]);
    expect(labels).toContain('X1');
  });

  it('typing a centre moves everything selected together, in one undo step', () => {
    const fixture = TestBed.createComponent(SettingsBarComponent);
    fixture.detectChanges();
    fixture.componentInstance.setBoundsCentre('x', 20);
    fixture.componentInstance.setBoundsCentre('y', -5);
    const [a, b] = toolbox.getShapes() as LineShape[];
    expect(a.start).toEqual({ x: 15, y: -10 });
    expect(b.end).toEqual({ x: 25, y: 0 });
    toolbox.undo();
    expect((toolbox.getShapes()[0] as LineShape).start).toEqual({ x: 15, y: 0 });
  });
});
