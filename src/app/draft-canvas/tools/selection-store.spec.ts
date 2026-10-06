import { TestBed } from '@angular/core/testing';
import { SelectionStore, sceneRef, toolboxRef } from './selection-store';
import { ToolboxStore } from './toolbox-store';
import { SceneStore } from './scene-index';
import { DraftShape, ImageShape, LineShape } from './toolbox-shape';
import { renderSegment } from '../../helpers/renderFuncs';

describe('SelectionStore', () => {
  let toolbox: ToolboxStore;
  let selection: SelectionStore;
  let scene: SceneStore;

  const line = (id: string, layerId?: string): LineShape => ({
    id, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, layerId,
  });
  const image = (id: string, only?: string[]): ImageShape => ({
    id, type: 'image', x: 0, y: 0, width: 10, height: 10, imageRef: `ref-${id}`, label: id,
    locked: false, scope: only ? { only } : undefined,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    selection = TestBed.inject(SelectionStore);
    scene = TestBed.inject(SceneStore);
    scene.setLayers([]);
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
    toolbox.setLayerScope(layerId, { only: [] });
    expect(selection.size).toBe(0);
  });

  it('drops an image the panel switch scopes away', () => {
    toolbox.loadImages([image('section', ['crossArching'])]);
    toolbox.setActivePanel('crossArching');
    selection.select(toolboxRef('section'));
    expect(ids(selection.shapes)).toEqual(['section']);
    toolbox.setActivePanel('base');
    expect(selection.size).toBe(0);
  });

  it('resolves a scene ref through the scene index, apart from the editable shapes', () => {
    scene.setLayers([renderSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, '#000')]);
    const [piece] = scene.shapes;
    toolbox.addShape(line('a'));
    selection.set([toolboxRef('a'), sceneRef(piece.id)]);

    expect(ids(selection.shapes)).toEqual(['a', piece.id]);
    expect(ids(selection.toolboxShapes)).toEqual(['a']);
    expect(ids(selection.sceneShapes)).toEqual([piece.id]);
    expect(selection.shape).toBeUndefined();

    selection.select(sceneRef(piece.id));
    expect(selection.shape?.id).toBe(piece.id);
    expect(selection.toolboxShape).toBeUndefined();
  });

  it('drops a scene ref when the recipe stops drawing that piece, and keeps one it redraws', () => {
    scene.setLayers([renderSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, '#000')]);
    const [piece] = scene.shapes;
    selection.select(sceneRef(piece.id));

    scene.setLayers([renderSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, '#f00')]);
    expect(selection.size).toBe(1);

    scene.setLayers([renderSegment({ x: 0, y: 0 }, { x: 12, y: 0 }, '#000')]);
    expect(selection.size).toBe(0);
  });

  it('selects a whole group from any member, and toggles it as one', () => {
    toolbox.addShapes([{ ...line('a'), groupId: 'g' }, { ...line('b'), groupId: 'g' }, line('c')]);
    selection.select(toolboxRef('a'));
    expect(ids(selection.shapes)).toEqual(['a', 'b']);

    selection.toggle(toolboxRef('c'));
    selection.toggle(toolboxRef('b'));
    expect(ids(selection.shapes)).toEqual(['c']);

    selection.toggle(toolboxRef('b'));
    expect(ids(selection.shapes)).toEqual(['a', 'b', 'c']);
  });

  it('leaves a group member on a locked layer out of the group it would bring', () => {
    const locked = toolbox.addLayer();
    toolbox.addShapes([{ ...line('a'), groupId: 'g' }, { ...line('b', locked), groupId: 'g' }]);
    toolbox.toggleLayerLocked(locked);
    selection.select(toolboxRef('a'));
    expect(ids(selection.shapes)).toEqual(['a']);
  });

  it('enters a group on request, selecting members singly until nothing in it is selected', () => {
    toolbox.addShapes([{ ...line('a'), groupId: 'g' }, { ...line('b'), groupId: 'g' }, line('c')]);
    selection.enter(toolboxRef('b'));
    expect(selection.enteredGroup).toBe('g');
    expect(ids(selection.shapes)).toEqual(['b']);

    selection.select(toolboxRef('a'));
    expect(ids(selection.shapes)).toEqual(['a']);
    expect(selection.enteredGroup).toBe('g');

    selection.select(toolboxRef('c'));
    expect(selection.enteredGroup).toBeNull();
    selection.select(toolboxRef('a'));
    expect(ids(selection.shapes)).toEqual(['a', 'b']);
  });
});
