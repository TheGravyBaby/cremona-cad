import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerControlsComponent } from './layer-controls';
import { ToolboxStore } from '../tools/toolbox-store';
import { SelectionStore, toolboxRef } from '../tools/selection-store';

describe('LayerControlsComponent', () => {
  let component: LayerControlsComponent;
  let fixture: ComponentFixture<LayerControlsComponent>;
  let toolbox: ToolboxStore;

  const all = (sel: string) => fixture.nativeElement.querySelectorAll(sel) as NodeListOf<HTMLElement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LayerControlsComponent] }).compileComponents();
    fixture = TestBed.createComponent(LayerControlsComponent);
    component = fixture.componentInstance;
    toolbox = TestBed.inject(ToolboxStore);
    fixture.detectChanges();
  });

  it('exports the active layer, under its name, whatever is selected', async () => {
    toolbox.resetAll();
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    const other = toolbox.addLayer();
    toolbox.renameLayer(other, 'Back: plate');
    toolbox.addShape({ id: 'b', type: 'line', layerId: other, start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    toolbox.addShape({ id: 'c', type: 'line', layerId: other, start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    TestBed.inject(SelectionStore).select(toolboxRef('b'));

    let name = '';
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b: any) => { blob = b; return 'blob:test'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    try {
      component.exportSvg();
    } finally {
      create.mockRestore(); revoke.mockRestore(); click.mockRestore();
    }

    expect(name).toBe('Back plate.svg');
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(text.match(/<line/g)!.length).toBe(2);
    expect(component.canExport).toBe(true);
    toolbox.setActiveLayer(toolbox.layers[0].id);
    toolbox.removeShapes(['a']);
    expect(component.canExport).toBe(false);
    toolbox.resetAll();
  });

  it('scopes an image from its row: the eye is this panel, the menu the presets', () => {
    toolbox.resetAll();
    toolbox.loadImages([{ id: 'plan', type: 'image', x: 0, y: 0, width: 1, height: 1, imageRef: 'a', label: 'Plan' }]);
    toolbox.setAvailablePanels([{ id: 'base', label: 'Base' }, { id: 'cross', label: 'Cross' }, { id: 'long', label: 'Long' }]);
    toolbox.setActivePanel('base');
    all('.lc-btn')[1].click();
    fixture.detectChanges();

    const row = () => all('.layer-tab')[0];
    expect(row().classList.contains('off-panel')).toBe(false);
    expect(all('.scope-chip')[0].textContent).toContain('everywhere');

    (row().querySelector('.layer-tab-icon-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.images[0].scope).toEqual({ except: ['base'] });
    expect(row().classList.contains('off-panel')).toBe(true);
    expect(all('.scope-chip')[0].textContent).toContain('all but 1');
    expect(component.scopeTitle(component.images[0].scope)).toBe('Shown everywhere except Base');

    all('.scope-chip')[0].click();
    fixture.detectChanges();
    const rows = all('.scope-menu .scope-row');
    expect(rows.length).toBe(5);
    expect(all('.panel-list').length).toBe(0);
    rows[1].click();
    fixture.detectChanges();
    expect(component.images[0].scope).toEqual({ only: ['base'] });
    expect(all('.scope-chip')[0].textContent).toContain('here only');

    (rows[3].querySelector('input') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(component.images[0].scope).toEqual({ only: [] });
    expect(all('.scope-chip')[0].textContent).toContain('nowhere');

    rows[4].click();
    fixture.detectChanges();
    const boxes = all('.panel-list input') as NodeListOf<HTMLInputElement>;
    expect(boxes.length).toBe(3);
    boxes[2].click();
    expect(component.images[0].scope).toEqual({ only: ['long'] });

    toolbox.setAvailablePanels([]);
    toolbox.setActivePanel(null);
    toolbox.resetAll();
  });

  it('picking an image to edit shows it on this panel rather than peeking', () => {
    toolbox.resetAll();
    toolbox.loadImages([{
      id: 'section', type: 'image', x: 0, y: 0, width: 1, height: 1, imageRef: 'a', label: 'Section',
      scope: { only: ['cross'] },
    }]);
    toolbox.setActivePanel('base');
    let requested = '';
    component.selectImageRequested.subscribe((id: string) => requested = id);
    component.editImage(component.images[0]);
    expect(component.images[0].scope).toEqual({ only: ['cross', 'base'] });
    expect(component.images[0].locked).toBe(false);
    expect(requested).toBe('section');
    toolbox.setActivePanel(null);
    toolbox.resetAll();
  });

  it('scopes a layer the same way, with the eye meaning this panel', () => {
    toolbox.resetAll();
    toolbox.setAvailablePanels([{ id: 'base', label: 'Base' }, { id: 'cross', label: 'Cross' }]);
    toolbox.setActivePanel('cross');
    const layer = toolbox.layers[0];
    component.toggleHere('layer', layer);
    expect(toolbox.layers[0].scope).toEqual({ except: ['cross'] });
    component.applyPreset('layer', layer.id, 'here');
    expect(toolbox.layers[0].scope).toEqual({ only: ['cross'] });
    component.applyPreset('layer', layer.id, 'everywhere');
    expect(toolbox.layers[0].scope).toBeUndefined();
    toolbox.setAvailablePanels([]);
    toolbox.setActivePanel(null);
    toolbox.resetAll();
  });
});
