import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerControlsComponent } from './layer-controls';
import { ToolboxStore } from '../tools/toolbox-store';
import { SelectionStore, toolboxRef } from '../tools/selection-store';

/** These moved out of the tool palette, so what's covered here is what the move had to preserve:
 * the two masters still write to the store draft-canvas draws from, and the two lists still can't
 * be open at once — they open from adjacent buttons in the bottom bar and would overlap. */
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a button and a master eye for each of layers and images', () => {
    expect(all('.lc-btn').length).toBe(2);
    expect(all('.lc-eye').length).toBe(2);
  });

  it('drives the store from the master eyes', () => {
    const wasShapes = toolbox.showShapes;
    const wasImages = toolbox.showImages;

    component.toggleShowShapes();
    component.toggleShowImages();

    expect(toolbox.showShapes).toBe(!wasShapes);
    expect(toolbox.showImages).toBe(!wasImages);

    component.toggleShowShapes();
    component.toggleShowImages();
  });

  it('opens one list at a time', () => {
    component.toggleLayers();
    expect(component.layersOpen).toBe(true);

    component.toggleImages();
    expect(component.imagesOpen).toBe(true);
    expect(component.layersOpen).toBe(false);

    component.toggleLayers();
    expect(component.imagesOpen).toBe(false);
  });

  it('renders the layer list only while it is open', () => {
    expect(all('.lc-popup').length).toBe(0);

    all('.lc-btn')[0].click();
    fixture.detectChanges();

    expect(all('.lc-popup').length).toBe(1);
    // files in and out live here, beside Clear, as the image list's Upload does
    expect([...all('.lc-action')].map(b => b.textContent!.trim())).toEqual(['Import', 'Export', 'Clear']);
    // one row per layer, plus the Recipe row at the top
    expect(all('.layer-tab').length).toBe(toolbox.layers.length + 1);
    expect(all('.layer-tab.recipe').length).toBe(1);
  });

  it('locks and unlocks recipe geometry from its row', () => {
    toolbox.setRecipeLocked(false);
    all('.lc-btn')[0].click();
    fixture.detectChanges();

    const lock = all('.layer-tab.recipe button')[0] as HTMLButtonElement;
    lock.click();
    expect(toolbox.recipeLocked).toBe(true);
    lock.click();
    expect(toolbox.recipeLocked).toBe(false);
  });

  // An image scoped to another panel isn't drawn even with its eye on. It stays in this list —
  // hiding the row would make it unreachable — but has to say why, or it reads as an image that
  // won't come back.
  it('marks an image scoped to another panel, and leaves the rest alone', () => {
    toolbox.loadImages([
      { id: 'plan', type: 'image', x: 0, y: 0, width: 1, height: 1, imageRef: 'a', label: 'Plan' },
      {
        id: 'section', type: 'image', x: 0, y: 0, width: 1, height: 1, imageRef: 'b',
        label: 'Section', panels: ['crossArching'],
      },
    ]);
    toolbox.setActivePanel('base');
    all('.lc-btn')[1].click();
    fixture.detectChanges();

    const rows = all('.layer-tab');
    expect(rows.length).toBe(2);
    expect(rows[0].classList.contains('off-panel')).toBe(false);
    expect(rows[1].classList.contains('off-panel')).toBe(true);
    expect(component.imageRowTitle(component.images[1])).toContain('Cross Arching');

    // Asserted through the predicate rather than the DOM: a store change doesn't mark this
    // component dirty on its own (draft-canvas redraws off toolbox.onChange; this list re-renders
    // on the user's next interaction), so re-checking the rendered class here would be testing
    // change detection rather than the scoping.
    toolbox.setActivePanel('crossArching');
    expect(component.isImageOffPanel(component.images[1])).toBe(false);
    expect(component.imageRowTitle(component.images[1])).not.toContain('Cross Arching');

    toolbox.setActivePanel(null);
    toolbox.resetAll();
  });

  it('offers to move the selection onto the other layers, and moves it', () => {
    toolbox.resetAll();
    toolbox.addShape({ id: 'a', type: 'line', start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
    const other = toolbox.addLayer();
    TestBed.inject(SelectionStore).select(toolboxRef('a'));
    all('.lc-btn')[0].click();
    fixture.detectChanges();

    const offered = all('.move-here');
    expect(offered.length).toBe(1);
    offered[0].click();
    expect(toolbox.getShapes()[0].layerId).toBe(other);
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

  it('lets a layer be scoped to panels from its row, once the recipe has offered some', () => {
    toolbox.resetAll();
    toolbox.setAvailablePanels([{ id: 'base', label: 'Base' }, { id: 'crossArching', label: 'Cross Arching' }]);
    toolbox.setActivePanel('base');
    all('.lc-btn')[0].click();
    fixture.detectChanges();

    const scopeBtn = all('.layer-tab:not(.recipe) .layer-tab-icon-btn')[1];
    expect(scopeBtn.getAttribute('title')).toBe('Shown on every panel');
    scopeBtn.click();
    fixture.detectChanges();

    const boxes = all('.layer-panels input') as NodeListOf<HTMLInputElement>;
    expect(boxes.length).toBe(2);
    expect([...boxes].every(b => b.checked)).toBe(true);
    boxes[0].click();
    expect(toolbox.layers[0].panels).toEqual(['crossArching']);
    expect(component.isLayerOffPanel(toolbox.layers[0])).toBe(true);
    expect(component.layerScopeTitle(toolbox.layers[0])).toBe('Shown on Cross Arching — not on this panel');

    component.showLayerOnAllPanels(toolbox.layers[0].id);
    expect(toolbox.layers[0].panels).toBeUndefined();
    toolbox.setAvailablePanels([]);
    toolbox.setActivePanel(null);
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

  it('closes an open list on a press outside it, and not on one inside it', () => {
    all('.lc-btn')[0].click();
    fixture.detectChanges();
    all('.lc-popup')[0].dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(component.layersOpen).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(component.layersOpen).toBe(false);
  });
});
