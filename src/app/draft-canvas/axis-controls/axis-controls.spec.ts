import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AxisControlsComponent } from './axis-controls';
import { AxisGridController } from '../axis-grid-controller';

describe('AxisControlsComponent', () => {
  let component: AxisControlsComponent;
  let fixture: ComponentFixture<AxisControlsComponent>;
  let controller: AxisGridController;
  let redraws: number;

  const one = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

  beforeEach(async () => {
    redraws = 0;
    controller = new AxisGridController(`axis-controls-spec-${Math.random()}`, () => redraws++);
    await TestBed.configureTestingModule({ imports: [AxisControlsComponent] }).compileComponents();
    fixture = TestBed.createComponent(AxisControlsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('axisGrid', controller);
    fixture.detectChanges();
  });

  it('toggles the whole overlay from the master eye, leaving the rows as they were', () => {
    const rows = [controller.showAxes, controller.showGridX, controller.showGridY];
    const was = controller.visible;

    one('.lc-eye').click();

    expect(controller.visible).toBe(!was);
    expect([controller.showAxes, controller.showGridX, controller.showGridY]).toEqual(rows);
    expect(redraws).toBe(1);
  });

  it('opens a row per switch, with steps on the grid rows', () => {
    one('.lc-btn').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.axis-row').length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.axis-step').length).toBe(2);
  });

  it('writes a sanitized step back into its field', () => {
    one('.lc-btn').click();
    fixture.detectChanges();
    const input = one('.axis-step') as HTMLInputElement;

    input.value = '-12';
    input.dispatchEvent(new Event('change'));

    expect(controller.gridStepX).toBe(12);
    expect(input.value).toBe('12');
  });

  it('closes on a press outside', () => {
    component.toggleOpen();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(component.open).toBe(false);
  });
});
