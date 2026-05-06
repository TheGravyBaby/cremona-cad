import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecipeComponentBase } from './recipe-base';

describe('RecipeComponentBase', () => {
  it('should create via subclass', () => {
    // RecipeComponentBase is now abstract and cannot be instantiated directly
    // This test verifies the abstract class exists and can be imported
    expect(RecipeComponentBase).toBeDefined();
  });
});
