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

  it('scopes an image from its row too, keeping the short list and the Default switch', () => {
    toolbox.resetAll();
    toolbox.loadImages([{ id: 'plan', type: 'image', x: 0, y: 0, width: 1, height: 1, imageRef: 'a', label: 'Plan' }]);
    toolbox.setAvailablePanels([{ id: 'base', label: 'Base' }, { id: 'cross', label: 'Cross' }, { id: 'long', label: 'Long' }]);
    toolbox.setActivePanel('base');
    all('.lc-btn')[1].click();
    fixture.detectChanges();

    const scopeBtn = all('.layer-tab .layer-tab-icon-btn')[1];
    scopeBtn.click();
    fixture.detectChanges();
    const boxes = all('.layer-panels input') as NodeListOf<HTMLInputElement>;
    expect(boxes.length).toBe(4);

    boxes[1].click();
    expect(component.images[0].excludePanels).toEqual(['base']);
    expect(component.images[0].panels).toBeUndefined();
    expect(component.imageScopeTitle(component.images[0])).toBe('Shown on every panel, except Base — not on this panel');

    component.setImageIsDefault(component.images[0], true);
    expect(component.images[0].isDefault).toBe(true);
    component.showImageOnAllPanels(component.images[0]);
    expect(component.isImageScoped(component.images[0])).toBe(false);
    toolbox.setAvailablePanels([]);
    toolbox.setActivePanel(null);
    toolbox.resetAll();
  });
});
