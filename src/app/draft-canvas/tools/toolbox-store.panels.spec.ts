import { TestBed } from '@angular/core/testing';
import { ToolboxStore } from './toolbox-store';
import { ImageShape } from './toolbox-shape';
import { PanelScope } from './panel-scope';

describe('ToolboxStore panel scoping', () => {
  let toolbox: ToolboxStore;

  const image = (id: string, scope?: PanelScope): ImageShape => ({
    id, type: 'image', x: 0, y: 0, width: 10, height: 10,
    imageRef: `ref-${id}`, label: id, scope,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    toolbox.resetAll();
    toolbox.setActivePanel(null);
  });

  const visible = () => toolbox.getVisibleImages().map(s => s.id);

  it('shows an unscoped image on every panel', () => {
    toolbox.loadImages([image('plan')]);
    toolbox.setActivePanel('base');
    expect(visible()).toEqual(['plan']);
    toolbox.setActivePanel('crossArching');
    expect(visible()).toEqual(['plan']);
  });

  it('shows an image only on the panels it names', () => {
    toolbox.loadImages([image('plan'), image('section', { only: ['crossArching', 'longArching'] })]);

    toolbox.setActivePanel('base');
    expect(visible()).toEqual(['plan']);

    toolbox.setActivePanel('crossArching');
    expect(visible()).toEqual(['plan', 'section']);

    toolbox.setActivePanel('longArching');
    expect(visible()).toEqual(['plan', 'section']);
  });

  it('keeps an excepted image off that panel and nowhere else', () => {
    toolbox.loadImages([image('plan', { except: ['crossArching'] })]);

    toolbox.setActivePanel('crossArching');
    expect(visible()).toEqual([]);

    toolbox.setActivePanel('longArching');
    expect(visible()).toEqual(['plan']);
  });

  it('filters nothing until a panel has been pushed, so a missed push shows too much rather than too little', () => {
    toolbox.loadImages([image('section', { only: ['crossArching'] }), image('plan', { except: ['base'] })]);
    expect(visible()).toEqual(['section', 'plan']);
  });

  it('shows an image scoped to nowhere on no panel, pushed or not', () => {
    toolbox.loadImages([image('parked', { only: [] })]);
    expect(visible()).toEqual([]);
    toolbox.setActivePanel('base');
    expect(visible()).toEqual([]);
  });

  it('still honours the master switch on the panel an image belongs to', () => {
    toolbox.loadImages([image('section', { only: ['crossArching'] })]);
    toolbox.setActivePanel('crossArching');
    toolbox.setShowImages(false);
    expect(visible()).toEqual([]);
    toolbox.setShowImages(true);
    expect(visible()).toEqual(['section']);
  });

  it('makes an off-panel image unselectable', () => {
    toolbox.loadImages([{ ...image('section', { only: ['crossArching'] }), locked: false }]);
    toolbox.setActivePanel('base');
    expect(toolbox.getEditableShapes().map(s => s.id)).not.toContain('section');
  });

  it('scopes a locked image without unlocking it', () => {
    toolbox.loadImages([image('plan')]);
    toolbox.setActivePanel('base');
    toolbox.setImageScope('plan', { except: ['base'] });
    expect(visible()).toEqual([]);
    expect(toolbox.getImageShapes()[0].locked).toBeUndefined();
    expect(toolbox.canUndo).toBe(false);
  });

  // off the open panel a layer is as good as hidden — not drawn, not editable — and its scope
  // survives a save.
  it('shows a scoped layer only on the panels it names, and keeps the scope through a save', () => {
    const scoped = toolbox.addLayer();
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, layerId: scoped });
    toolbox.setLayerScope(scoped, { only: ['crossArching'] });

    toolbox.setActivePanel('base');
    expect(toolbox.getVisibleShapes()).toEqual([]);
    expect(toolbox.getEditableShapes()).toEqual([]);
    toolbox.setActivePanel('crossArching');
    expect(toolbox.getVisibleShapes().map(s => s.id)).toEqual(['a']);
    toolbox.setActivePanel(null);
    expect(toolbox.getVisibleShapes().map(s => s.id)).toEqual(['a']);

    const saved = JSON.parse(JSON.stringify(toolbox.exportState()));
    toolbox.resetAll();
    toolbox.loadState(saved);
    expect(toolbox.layers.find(l => l.id === scoped)?.scope).toEqual({ only: ['crossArching'] });
  });

  // a layer a recipe adds for a part's face: active at once, shown where it was told, and still
  // bound after a rename, a lock and a save
  it('adds a layer bound to a face, drawn on next, and keeps the binding through edits and a save', () => {
    toolbox.setActivePanel('devFingerboard');
    const bound = toolbox.addLayer({ name: 'Inlay', scope: { only: ['devFingerboard'] }, face: { id: 'fingerboard', origin: { x: 100, y: 50 } } });
    expect(toolbox.activeLayerId).toBe(bound);
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, layerId: bound });
    expect(toolbox.getVisibleShapes().map(s => s.id)).toEqual(['a']);
    toolbox.setActivePanel('base');
    expect(toolbox.getVisibleShapes()).toEqual([]);

    toolbox.renameLayer(bound, 'Vine');
    toolbox.toggleLayerLocked(bound);
    toolbox.setLayerScope(bound, undefined);
    const saved = JSON.parse(JSON.stringify(toolbox.exportState()));
    toolbox.resetAll();
    expect(toolbox.layers.some(l => l.face)).toBe(false);
    toolbox.loadState(saved);
    expect(toolbox.layers.find(l => l.id === bound)).toMatchObject({ name: 'Vine', face: { id: 'fingerboard', origin: { x: 100, y: 50 } } });
    expect(toolbox.layers.filter(l => l.face?.id === 'fingerboard').length).toBe(1);
  });

  // what is drawn on a face is a point on the part: when the recipe moves the face on the canvas,
  // shape less origin has to read the same before and after, now and at every step of the undo
  it('carries a face layer\'s shapes with the face, through undo and redo, leaving other layers and the undo stack alone', () => {
    const plain = toolbox.layers[0].id;
    const bound = toolbox.addLayer({ face: { id: 'fingerboard', origin: { x: 100, y: 50 } } });
    const other = toolbox.addLayer({ face: { id: 'top', origin: { x: 0, y: 0 } } });
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 101, y: 52 }, end: { x: 103, y: 52 }, layerId: bound });
    toolbox.addShape({ id: 'p', type: 'line', start: { x: 1, y: 1 }, end: { x: 2, y: 1 }, layerId: plain });
    toolbox.addShape({ id: 'o', type: 'line', start: { x: 5, y: 5 }, end: { x: 6, y: 5 }, layerId: other });
    toolbox.updateShape('a', { start: { x: 102, y: 52 } });

    const onFace = (id: string) => {
      const s = toolbox.getShapes().find(s => s.id === id) as any;
      const origin = toolbox.layers.find(l => l.id === s.layerId)!.face?.origin ?? { x: 0, y: 0 };
      return [s.start.x - origin.x, s.start.y - origin.y, s.end.x - origin.x, s.end.y - origin.y];
    };
    const snapshot = () => JSON.stringify(toolbox.getShapes());
    let changes = 0;
    const off = toolbox.onChange(() => changes++);

    toolbox.moveFace('fingerboard', { x: 100, y: 50 });
    expect(changes).toBe(0);
    const before = snapshot();
    toolbox.moveFace('fingerboard', { x: 130, y: 45 });
    off();
    expect(changes).toBe(1);
    expect(toolbox.layers.find(l => l.id === bound)!.face!.origin).toEqual({ x: 130, y: 45 });
    expect(onFace('a')).toEqual([2, 2, 3, 2]);
    expect(onFace('p')).toEqual([1, 1, 2, 1]);
    expect(onFace('o')).toEqual([5, 5, 6, 5]);
    expect(snapshot()).not.toBe(before);

    toolbox.undo();
    expect(onFace('a')).toEqual([1, 2, 3, 2]);
    toolbox.redo();
    expect(onFace('a')).toEqual([2, 2, 3, 2]);
    expect(toolbox.canRedo).toBe(false);

    toolbox.moveFace('fingerboard', { x: 100, y: 50 });
    expect(snapshot()).toBe(before);
  });

  it('switching onto a layer shows it on the open panel', () => {
    const scoped = toolbox.addLayer();
    toolbox.setLayerScope(scoped, { only: [] });
    toolbox.setActivePanel('base');
    toolbox.setActiveLayer(toolbox.layers[0].id);
    toolbox.setActiveLayer(scoped);
    expect(toolbox.layers.find(l => l.id === scoped)?.scope).toEqual({ only: ['base'] });
  });
});
