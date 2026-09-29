import { TestBed } from '@angular/core/testing';
import { SelectionStore, toolboxRef } from './selection-store';
import { ToolboxStore } from './toolbox-store';
import { DraftShape, ImageShape, LineShape } from './toolbox-shape';

describe('SelectionStore', () => {
  let toolbox: ToolboxStore;
  let selection: SelectionStore;

  const line = (id: string, layerId?: string): LineShape => ({
    id, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layerId,
  });
  const image = (id: string, panels?: string[]): ImageShape => ({
    id, type: 'image', x: 0, y: 0, width: 10, height: 10, imageRef: `ref-${id}`, label: id,
    locked: false, panels,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    selection = TestBed.inject(SelectionStore);
    toolbox.resetAll();
    toolbox.setActivePanel(null);
    selection.clear();
  });

  const ids = (shapes: DraftShape[]) => shapes.map(s => s.id);

  it('resolves refs to the store\'s current shapes', () => {
    toolbox.addShapes([line('a'), line('b')]);
    selection.set([toolboxRef('a'), toolboxRef('b')]);
    expect(ids(selection.shapes)).toEqual(['a', 'b']);
    expect(selection.shape).toBeUndefined();

    toolbox.updateShape('a', { color: '#123456' });
    selection.select(toolboxRef('a'));
    expect(selection.shape?.color).toBe('#123456');
  });

  it('toggles one ref in and out, leaving the rest', () => {
    toolbox.addShapes([line('a'), line('b')]);
    selection.select(toolboxRef('a'));
    selection.toggle(toolboxRef('b'));
    expect(ids(selection.shapes)).toEqual(['a', 'b']);
    selection.toggle(toolboxRef('a'));
    expect(ids(selection.shapes)).toEqual(['b']);
  });

  it('notifies only when the set actually changes', () => {
    toolbox.addShape(line('a'));
    let calls = 0;
    selection.onChange(() => calls++);
    selection.select(toolboxRef('a'));
    selection.select(toolboxRef('a'));
    expect(calls).toBe(1);
    selection.clear();
    selection.clear();
    expect(calls).toBe(2);
  });

  it('drops a shape when it is removed or undone away', () => {
    toolbox.addShapes([line('a'), line('b')]);
    selection.set([toolboxRef('a'), toolboxRef('b')]);
    toolbox.removeShape('a');
    expect(ids(selection.shapes)).toEqual(['b']);
    expect(selection.size).toBe(1);

    toolbox.undo();
    expect(ids(selection.shapes)).toEqual(['b']);
    toolbox.undo();
    expect(selection.size).toBe(0);
  });

  it('drops a shape whose layer is hidden or locked', () => {
    const layerId = toolbox.addLayer();
    toolbox.addShape(line('a', layerId));
    selection.select(toolboxRef('a'));
    toolbox.toggleLayerLocked(layerId);
    expect(selection.size).toBe(0);

    toolbox.toggleLayerLocked(layerId);
    selection.select(toolboxRef('a'));
    toolbox.toggleLayerVisible(layerId);
    expect(selection.size).toBe(0);
  });

  it('reveals a selected image so scoping cannot hide it mid-edit', () => {
    toolbox.loadImages([image('section', ['crossArching'])]);
    toolbox.setActivePanel('base');
    expect(toolbox.getVisibleImages()).toEqual([]);

    selection.select(toolboxRef('section'));
    expect(toolbox.revealedImageId).toBe('section');
    expect(ids(selection.shapes)).toEqual(['section']);

    selection.clear();
    expect(toolbox.revealedImageId).toBeNull();
  });

  it('re-reveals on a repeat select after a panel switch dropped the reveal', () => {
    toolbox.loadImages([image('section', ['crossArching'])]);
    toolbox.setActivePanel('crossArching');
    selection.select(toolboxRef('section'));
    toolbox.setActivePanel('base');
    expect(toolbox.revealedImageId).toBeNull();
    expect(selection.size).toBe(0);

    selection.select(toolboxRef('section'));
    expect(toolbox.revealedImageId).toBe('section');
    expect(ids(selection.shapes)).toEqual(['section']);
  });
});
