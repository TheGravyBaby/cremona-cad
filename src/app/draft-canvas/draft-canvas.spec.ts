import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftCanvasComponent } from './draft-canvas';
import { ToolboxStore } from './tools/toolbox-store';
import { SelectionStore, toolboxRef } from './tools/selection-store';
import { PathShape, pathFromSource } from './tools/toolbox-shape';

describe('DraftCanvasComponent', () => {
  let component: DraftCanvasComponent;
  let fixture: ComponentFixture<DraftCanvasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftCanvasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DraftCanvasComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the typed view from the zoom readout and applies it', () => {
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.zoom-readout') as HTMLElement).click();
    fixture.detectChanges();

    const inputs = fixture.nativeElement.querySelectorAll('.view-popup input') as NodeListOf<HTMLInputElement>;
    expect(inputs.length).toBe(3);

    inputs[2].value = '4';
    inputs[2].dispatchEvent(new Event('change'));
    expect(component.pxPerMm).toBe(4);
    expect(inputs[2].value).toBe('4');
  });

  // a trackpad double-tap lands its second press a few pixels off the first, often off a thin line
  it('adds a batten pin from two quick presses that drift apart', () => {
    fixture.detectChanges();
    const toolbox = TestBed.inject(ToolboxStore);
    toolbox.resetAll();
    const source = { kind: 'batten' as const, pins: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], closed: false };
    toolbox.addShape({ id: 'b', type: 'path', d: pathFromSource(source), source });
    TestBed.inject(SelectionStore).select(toolboxRef('b'));
    // jsdom has no pointer capture
    const el = Element.prototype as unknown as Record<string, unknown>;
    el['setPointerCapture'] ??= () => { };
    el['releasePointerCapture'] ??= () => { };
    el['hasPointerCapture'] ??= () => false;
    const where = vi.spyOn(component, 'worldFromPointer');
    const press = (x: number, world: { x: number; y: number }) => {
      where.mockReturnValue(world);
      component.onPointerDown({ pointerId: 1, button: 0, pointerType: 'mouse', clientX: x, clientY: 100 } as PointerEvent);
      component.onPointerUp({ pointerId: 1, button: 0, pointerType: 'mouse', clientX: x, clientY: 100 } as PointerEvent);
    };
    const onCurve = { x: 25, y: 12.2 };
    press(200, onCurve);
    press(206, { x: 25, y: 60 });
    expect(((toolbox.getShapes()[0] as PathShape).source as { pins: unknown[] }).pins).toHaveLength(4);
  });
});
