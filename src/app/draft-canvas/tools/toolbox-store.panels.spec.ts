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

  it('switching onto a layer shows it on the open panel', () => {
    const scoped = toolbox.addLayer();
    toolbox.setLayerScope(scoped, { only: [] });
    toolbox.setActivePanel('base');
    toolbox.setActiveLayer(toolbox.layers[0].id);
    toolbox.setActiveLayer(scoped);
    expect(toolbox.layers.find(l => l.id === scoped)?.scope).toEqual({ only: ['base'] });
  });
});
