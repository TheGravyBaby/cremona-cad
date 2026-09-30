import { TestBed } from '@angular/core/testing';
import { SelectionActions } from './selection-actions';
import { SelectionStore, sceneRef, toolboxRef } from './selection-store';
import { SceneStore } from './scene-index';
import { ToolboxStore } from './toolbox-store';
import { LineShape } from './toolbox-shape';
import { renderSegment } from '../../helpers/renderFuncs';

describe('SelectionActions', () => {
  let toolbox: ToolboxStore;
  let selection: SelectionStore;
  let scene: SceneStore;
  let actions: SelectionActions;

  const line = (id: string): LineShape => ({
    id, type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, color: '#abcdef',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    selection = TestBed.inject(SelectionStore);
    scene = TestBed.inject(SceneStore);
    actions = TestBed.inject(SelectionActions);
    toolbox.resetAll();
    scene.setLayers([]);
    selection.clear();
  });

  const ids = () => toolbox.getShapes().map(s => s.id);

  it('copies as SVG and pastes a fresh, selected copy in place on the active layer', () => {
    toolbox.addShape(line('a'));
    selection.select(toolboxRef('a'));
    expect(actions.canCopy).toBe(true);

    const svg = actions.copy();
    expect(svg).toContain('<svg');
    expect(actions.canPaste).toBe(true);

    const layer = toolbox.addLayer();
    expect(actions.paste()).toBe(true);
    const pasted = toolbox.getShapes().filter(s => s.id !== 'a');
    expect(pasted.length).toBe(1);
    expect(pasted[0]).toMatchObject({ type: 'line', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, color: '#abcdef', layerId: layer });
    expect(selection.toolboxShapes.map(s => s.id)).toEqual([pasted[0].id]);
  });

  it('pastes SVG text handed to it, and refuses other text', () => {
    toolbox.addShape(line('a'));
    selection.select(toolboxRef('a'));
    const svg = actions.copy()!;
    toolbox.resetAll();

    expect(actions.paste('just a paragraph')).toBe(false);
    expect(ids()).toEqual([]);
    expect(actions.paste(svg)).toBe(true);
    expect(toolbox.getShapes().length).toBe(1);
  });

  it('cuts drawn shapes and deletes as one undo step', () => {
    toolbox.addShapes([line('a'), line('b')]);
    selection.set([toolboxRef('a'), toolboxRef('b')]);
    expect(actions.cut()).toContain('<svg');
    expect(ids()).toEqual([]);
    toolbox.undo();
    expect(ids()).toEqual(['a', 'b']);

    selection.set([toolboxRef('a'), toolboxRef('b')]);
    actions.delete();
    expect(ids()).toEqual([]);
    toolbox.undo();
    expect(ids()).toEqual(['a', 'b']);
  });

  it('duplicates a recipe piece into a drawn shape in the pen colour, leaving the recipe alone', () => {
    scene.setLayers([renderSegment({ x: 0, y: 0 }, { x: 5, y: 5 }, '#000')]);
    const [piece] = scene.shapes;
    selection.select(sceneRef(piece.id));
    toolbox.currentColor = '#112233';
    expect(actions.canCut).toBe(false);
    expect(actions.canDuplicate).toBe(true);

    expect(actions.duplicate()).toBe(true);
    const [copy] = toolbox.getShapes();
    expect(copy).toMatchObject({ type: 'line', color: '#112233', layerId: toolbox.activeLayerId });
    expect(copy.id).not.toBe(piece.id);
    expect(selection.toolboxShapes.map(s => s.id)).toEqual([copy.id]);
    expect(scene.shapes.length).toBe(1);
  });

  it('refuses to place onto a locked layer', () => {
    toolbox.addShape(line('a'));
    selection.select(toolboxRef('a'));
    const locked = toolbox.addLayer();
    toolbox.toggleLayerLocked(locked);
    expect(actions.duplicate()).toBe(false);
    expect(ids()).toEqual(['a']);
  });
});
