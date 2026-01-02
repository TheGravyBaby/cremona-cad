import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DenisViolin } from './denis-violin';

describe('DenisViolin', () => {
  let component: DenisViolin;
  let fixture: ComponentFixture<DenisViolin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DenisViolin]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DenisViolin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
