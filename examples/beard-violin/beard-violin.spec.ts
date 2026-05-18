import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeardViolinComponent } from './beard-violin';

describe('Sidebar', () => {
  let component: BeardViolinComponent;
  let fixture: ComponentFixture<BeardViolinComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BeardViolinComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BeardViolinComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
