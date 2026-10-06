import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AxisControlsComponent } from './axis-controls';
import { AxisGridController } from '../axis-grid-controller';

describe('AxisControlsComponent', () => {
  let fixture: ComponentFixture<AxisControlsComponent>;
  let controller: AxisGridController;
  let redraws: number;

  const one = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

  beforeEach(async () => {
    redraws = 0;
    controller = new AxisGridController(`axis-controls-spec-${Math.random()}`, () => redraws++);
    await TestBed.configureTestingModule({ imports: [AxisControlsComponent] }).compileComponents();
    fixture = TestBed.createComponent(AxisControlsComponent);
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
});
