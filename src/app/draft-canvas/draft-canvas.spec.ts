import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftCanvasComponent } from './draft-canvas';

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
});
