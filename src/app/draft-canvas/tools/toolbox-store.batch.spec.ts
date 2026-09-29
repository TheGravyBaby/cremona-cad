import { TestBed } from '@angular/core/testing';
import { ToolboxStore } from './toolbox-store';
import { LineShape } from './toolbox-shape';

describe('ToolboxStore batched add and remove', () => {
  let toolbox: ToolboxStore;

  const line = (id: string, layerId?: string): LineShape => ({
    id, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layerId,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    toolbox.resetAll();
  });

  const ids = () => toolbox.getShapes().map(s => s.id);

  it('adds several shapes as one undo step', () => {
    toolbox.addShapes([line('a'), line('b'), line('c')]);
    expect(ids()).toEqual(['a', 'b', 'c']);
    toolbox.undo();
    expect(ids()).toEqual([]);
    expect(toolbox.canUndo).toBe(false);
  });

  it('removes several shapes as one undo step', () => {
    toolbox.addShapes([line('a'), line('b'), line('c')]);
    toolbox.removeShapes(['a', 'c']);
    expect(ids()).toEqual(['b']);
    toolbox.undo();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('keeps shapes on a locked layer and drops additions bound for one', () => {
    const locked = toolbox.addLayer();
    toolbox.addShape(line('kept', locked));
    toolbox.toggleLayerLocked(locked);
    toolbox.addShapes([line('open'), line('refused', locked)]);
    expect(ids()).toEqual(['kept', 'open']);

    toolbox.removeShapes(['kept', 'open']);
    expect(ids()).toEqual(['kept']);
  });

  it('pushes no history for a batch that changes nothing', () => {
    toolbox.addShape(line('a'));
    const before = toolbox.canUndo;
    toolbox.addShapes([]);
    toolbox.removeShapes(['missing']);
    toolbox.undo();
    expect(before).toBe(true);
    expect(ids()).toEqual([]);
  });
});
