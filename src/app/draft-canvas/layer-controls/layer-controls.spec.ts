import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerControlsComponent } from './layer-controls';
import { ToolboxStore } from '../tools/toolbox-store';

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
    expect(all('.layer-tab').length).toBe(toolbox.layers.length);
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
});
