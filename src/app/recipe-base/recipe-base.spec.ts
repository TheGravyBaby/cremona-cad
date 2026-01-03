import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecipeBase } from './recipe-base';

describe('RecipeBase', () => {
  let component: RecipeBase;
  let fixture: ComponentFixture<RecipeBase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecipeBase]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecipeBase);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
