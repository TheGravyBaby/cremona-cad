import { TestBed } from '@angular/core/testing';
import { SettingsBarComponent } from './settings-bar';
import { ToolboxStore } from '../tools/toolbox-store';
import { SelectionStore, toolboxRef } from '../tools/selection-store';
import { SceneStore } from '../tools/scene-index';
import { LineShape, PathShape, PathSource, pathFromSource } from '../tools/toolbox-shape';

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

  it('sets the width of every selected stroked shape and the pen, passing over text', () => {
    toolbox.addShape({ id: 't', type: 'text', position: { x: 0, y: 0 }, text: 'label' });
    selection.set([toolboxRef('a'), toolboxRef('b'), toolboxRef('t')]);
    const fixture = TestBed.createComponent(SettingsBarComponent);
    fixture.detectChanges();
    const bar = fixture.componentInstance;
    expect(bar.showStrokeWidth).toBe(true);
    expect(bar.strokeWidth).toBe(1.5);

    bar.setStrokeWidth(4);
    expect(toolbox.getShapes().map(s => s.strokeWidth)).toEqual([4, 4, undefined]);
    expect(toolbox.currentStrokeWidth).toBe(4);
    toolbox.undo();
    expect(toolbox.getShapes().map(s => s.strokeWidth)).toEqual([undefined, undefined, undefined]);

    selection.set([toolboxRef('t')]);
    expect(bar.showStrokeWidth).toBe(false);
  });

  it('reshapes a selected cycloid in place from its factor and percent', () => {
    const source: PathSource = { kind: 'cycloid', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, depth: 30, factor: 1, pct: 1 };
    toolbox.addShape({ id: 'c', type: 'path', d: pathFromSource(source), source });
    selection.set([toolboxRef('c')]);
    const fixture = TestBed.createComponent(SettingsBarComponent);
    fixture.detectChanges();
    const bar = fixture.componentInstance;
    expect([bar.cycloidFactorPct, bar.cycloidPct]).toEqual([100, 100]);

    bar.setCycloidFactorPct(40);
    bar.setCycloidPct(80);
    const shape = toolbox.getShapes().find(s => s.id === 'c') as PathShape;
    const reshaped = { ...source, factor: 0.4, pct: 0.8 };
    expect(shape.source).toEqual(reshaped);
    expect(shape.d).toBe(pathFromSource(reshaped));
    expect(toolbox.currentCycloidFactor).toBe(0.4);
  });

  it('sets a catenary\'s depth without changing the side it hangs to', () => {
    const source: PathSource = { kind: 'catenary', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, depth: -30 };
    toolbox.addShape({ id: 'k', type: 'path', d: pathFromSource(source), source });
    selection.set([toolboxRef('k')]);
    const fixture = TestBed.createComponent(SettingsBarComponent);
    fixture.detectChanges();
    const bar = fixture.componentInstance;
    expect(bar.curveDepth).toBe(30);

    bar.setCurveDepth(12);
    const shape = toolbox.getShapes().find(s => s.id === 'k') as PathShape;
    expect(shape.source).toEqual({ ...source, depth: -12 });
    expect(shape.d).toBe(pathFromSource({ ...source, depth: -12 }));
  });
});
