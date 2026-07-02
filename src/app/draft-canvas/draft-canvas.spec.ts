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
});
