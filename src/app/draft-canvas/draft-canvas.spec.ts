import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftCanvas } from './draft-canvas';

describe('DraftCanvas', () => {
  let component: DraftCanvas;
  let fixture: ComponentFixture<DraftCanvas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftCanvas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DraftCanvas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
