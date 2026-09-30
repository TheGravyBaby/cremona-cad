import { TestBed } from '@angular/core/testing';
import { SelectionActions } from './selection-actions';
import { SelectionStore, toolboxRef } from './selection-store';
import { SceneStore } from './scene-index';
import { ToolboxStore } from './toolbox-store';
import { LineShape } from './toolbox-shape';
import { DraftToolHost } from './draft-tool';
import { createMirrorLineTool, createMoveTool, createRotateTool, createScaleTool } from './transform-tools';

describe('transform tools', () => {
  let toolbox: ToolboxStore;
  let selection: SelectionStore;
  let actions: SelectionActions;
  let host: DraftToolHost;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    selection = TestBed.inject(SelectionStore);
    actions = TestBed.inject(SelectionActions);
    toolbox.resetAll();
    TestBed.inject(SceneStore).setLayers([]);
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 10, y: 0 }, end: { x: 20, y: 0 } });
    selection.select(toolboxRef('a'));
    host = {
      requestDraw: () => { },
      getSelectedShapes: () => selection.shapes,
      isAngleLockHeld: () => false,
      hitTestShape: () => null,
      selectShape: () => { },
    } as unknown as DraftToolHost;
  });

  const a = () => toolbox.getShapes()[0] as LineShape;
  const key = (tool: { onKeyDown(e: KeyboardEvent, h: DraftToolHost): boolean }, keys: string) =>
    [...keys].forEach(k => tool.onKeyDown(new KeyboardEvent('keydown', { key: k === '\n' ? 'Enter' : k }), host));

  it('moves from a picked point to the pointer', () => {
    const tool = createMoveTool(actions);
    tool.onPointerDown({ x: 10, y: 0 }, host);
    tool.onPointerMove({ x: 15, y: 7 }, host);
    tool.onPointerDown({ x: 15, y: 7 }, host);
    expect(a().start).toEqual({ x: 15, y: 7 });
    expect(a().end).toEqual({ x: 25, y: 7 });
  });

  it("moves a typed distance along the pointer's direction", () => {
    const tool = createMoveTool(actions);
    tool.onPointerDown({ x: 10, y: 0 }, host);
    tool.onPointerMove({ x: 10, y: 3 }, host);
    key(tool, '4\n');
    expect(a().start).toEqual({ x: 10, y: 4 });
  });

  it('mirrors across a line through a clicked point and the pointer', () => {
    const tool = createMirrorLineTool(actions);
    tool.onPointerDown({ x: 0, y: 0 }, host);
    tool.onPointerMove({ x: 0, y: 5 }, host);
    tool.onPointerDown({ x: 0, y: 5 }, host);
    expect(a().start).toEqual({ x: -10, y: 0 });
  });

  it('rotates from a reference point to the pointer about the centre', () => {
    const tool = createRotateTool(actions);
    tool.onPointerDown({ x: 0, y: 0 }, host);
    tool.onPointerDown({ x: 10, y: 0 }, host);
    tool.onPointerDown({ x: 0, y: 3 }, host);
    expect(a().start.x).toBeCloseTo(0, 9);
    expect(a().start.y).toBeCloseTo(10, 9);
  });

  it('rotates by typed degrees once the centre is picked', () => {
    const tool = createRotateTool(actions);
    tool.onPointerDown({ x: 0, y: 0 }, host);
    key(tool, '180\n');
    expect(a().end.x).toBeCloseTo(-20, 9);
  });

  it('scales so the reference distance becomes a typed length', () => {
    const tool = createScaleTool(actions);
    tool.onPointerDown({ x: 10, y: 0 }, host);
    tool.onPointerDown({ x: 20, y: 0 }, host);
    key(tool, '35\n');
    expect(a().end.x).toBeCloseTo(45, 9);
    expect(a().start.x).toBeCloseTo(10, 9);
  });

  it('takes a typed number as the factor before the reference is picked', () => {
    const tool = createScaleTool(actions);
    tool.onPointerDown({ x: 10, y: 0 }, host);
    key(tool, '2\n');
    expect(a().end.x).toBeCloseTo(30, 9);
  });

  it('Escape drops the picked points before it gives the tool up', () => {
    const tool = createRotateTool(actions);
    tool.onPointerDown({ x: 0, y: 0 }, host);
    expect(tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }), host)).toBe(true);
    expect(tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }), host)).toBe(false);
  });
});
