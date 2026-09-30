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

  it('mirrors drawn shapes in place across the selection centre, as one undo step', () => {
    toolbox.addShapes([line('a'), { ...line('b'), start: { x: 20, y: 0 }, end: { x: 30, y: 10 } }]);
    selection.set([toolboxRef('a'), toolboxRef('b')]);

    expect(actions.mirror('horizontal')).toBe(true);
    const [a, b] = toolbox.getShapes() as LineShape[];
    expect(a).toMatchObject({ id: 'a', start: { x: 30, y: 0 }, end: { x: 20, y: 0 } });
    expect(b).toMatchObject({ id: 'b', start: { x: 10, y: 0 }, end: { x: 0, y: 10 } });

    toolbox.undo();
    expect((toolbox.getShapes()[0] as LineShape).start).toEqual({ x: 0, y: 0 });
  });

  it('mirrors a recipe piece across the centreline as a selected copy, beside a drawn shape', () => {
    scene.setLayers([renderSegment({ x: 5, y: 0 }, { x: 15, y: 5 }, '#000')]);
    const [piece] = scene.shapes;
    toolbox.addShape(line('a'));
    selection.set([toolboxRef('a'), sceneRef(piece.id)]);

    expect(actions.mirror('centreline')).toBe(true);
    const [a, copy] = toolbox.getShapes() as LineShape[];
    expect(a.end).toEqual({ x: -10, y: 0 });
    expect(copy.type).toBe('line');
    expect([copy.start, copy.end]).toEqual(expect.arrayContaining([{ x: -5, y: 0 }, { x: -15, y: 5 }]));
    expect(selection.toolboxShapes.map(s => s.id)).toEqual(['a', copy.id]);
    expect(selection.sceneShapes).toEqual([]);
    expect(scene.shapes.length).toBe(1);

    toolbox.undo();
    expect(ids()).toEqual(['a']);
    expect((toolbox.getShapes()[0] as LineShape).end).toEqual({ x: 10, y: 0 });
  });

  it('aligns drawn shapes to a selected recipe piece, which stays put', () => {
    scene.setLayers([renderSegment({ x: 0, y: 40 }, { x: 10, y: 50 }, '#000')]);
    const [piece] = scene.shapes;
    toolbox.addShapes([line('a'), { ...line('b'), start: { x: 5, y: 0 }, end: { x: 5, y: 20 } }]);
    selection.set([toolboxRef('a'), toolboxRef('b'), sceneRef(piece.id)]);

    expect(actions.align('top')).toBe(true);
    const [a, b] = toolbox.getShapes() as LineShape[];
    expect(a.start.y).toBeCloseTo(50, 9);
    expect(Math.max(b.start.y, b.end.y)).toBeCloseTo(50, 9);
    expect(b.start.x).toBe(5);
    expect(scene.shapes.length).toBe(1);
  });

  it('needs two shapes, one of them drawn, to align', () => {
    toolbox.addShape(line('a'));
    selection.select(toolboxRef('a'));
    expect(actions.canAlign).toBe(false);
    expect(actions.align('left')).toBe(false);
  });

  it('turns the selection a quarter about its centre', () => {
    toolbox.addShape(line('a'));
    selection.select(toolboxRef('a'));
    actions.rotate90('ccw');
    const [a] = toolbox.getShapes() as LineShape[];
    expect(a.start).toEqual({ x: 5, y: -5 });
    expect(a.end).toEqual({ x: 5, y: 5 });
  });

  it('brings shapes to the front and sends them to the back, keeping their own order', () => {
    toolbox.addShapes([line('a'), line('b'), line('c')]);
    selection.set([toolboxRef('a'), toolboxRef('b')]);
    actions.reorder('front');
    expect(ids()).toEqual(['c', 'a', 'b']);
    selection.select(toolboxRef('b'));
    actions.reorder('back');
    expect(ids()).toEqual(['b', 'c', 'a']);
  });

  it('moves shapes to another layer, but not onto a locked one', () => {
    toolbox.addShape(line('a'));
    const other = toolbox.addLayer();
    toolbox.moveShapesToLayer(['a'], other);
    expect(toolbox.getShapes()[0].layerId).toBe(other);

    const locked = toolbox.addLayer();
    toolbox.toggleLayerLocked(locked);
    toolbox.moveShapesToLayer(['a'], locked);
    expect(toolbox.getShapes()[0].layerId).toBe(other);
  });

  it('groups the selection, and ungroups it', () => {
    toolbox.addShapes([line('a'), line('b')]);
    selection.select(toolboxRef('a'));
    expect(actions.canGroup).toBe(false);
    selection.set([toolboxRef('a'), toolboxRef('b')]);
    expect(actions.canGroup).toBe(true);

    actions.group();
    const [a, b] = toolbox.getShapes();
    expect(a.groupId).toBeTruthy();
    expect(b.groupId).toBe(a.groupId);
    expect(actions.canGroup).toBe(false);
    expect(actions.canUngroup).toBe(true);

    actions.ungroup();
    expect(toolbox.getShapes().every(s => !s.groupId)).toBe(true);
  });

  it('pastes a group as a new group, and dissolves a group cut down to one member', () => {
    toolbox.addShapes([{ ...line('a'), groupId: 'g' }, { ...line('b'), groupId: 'g' }]);
    selection.select(toolboxRef('a'));
    actions.copy();
    actions.paste();
    const pasted = toolbox.getShapes().slice(2);
    expect(pasted.length).toBe(2);
    expect(pasted[0].groupId).toBeTruthy();
    expect(pasted[0].groupId).not.toBe('g');
    expect(pasted[1].groupId).toBe(pasted[0].groupId);

    toolbox.removeShapes(['a']);
    expect(toolbox.getShapes().find(s => s.id === 'b')!.groupId).toBeUndefined();
  });

  it('exports the selection, or every drawn shape in view when nothing is selected', () => {
    expect(actions.exportSvg()).toBeNull();
    toolbox.addShapes([line('a'), line('b')]);
    expect(actions.exportSvg()!.match(/<line/g)!.length).toBe(2);
    selection.select(toolboxRef('a'));
    expect(actions.exportSvg()!.match(/<line/g)!.length).toBe(1);
  });

  it('distributes three or more shapes evenly between the outer two', () => {
    toolbox.addShapes([line('a'), { ...line('b'), start: { x: 2, y: 0 }, end: { x: 12, y: 0 } }, { ...line('c'), start: { x: 30, y: 0 }, end: { x: 40, y: 0 } }]);
    selection.set([toolboxRef('a'), toolboxRef('b')]);
    expect(actions.canDistribute).toBe(false);
    selection.set([toolboxRef('a'), toolboxRef('b'), toolboxRef('c')]);

    expect(actions.distribute('horizontal')).toBe(true);
    const [a, b, c] = toolbox.getShapes() as LineShape[];
    expect(a.start.x).toBe(0);
    expect(b.start.x).toBeCloseTo(15, 9);
    expect(c.start.x).toBe(30);
  });
});
