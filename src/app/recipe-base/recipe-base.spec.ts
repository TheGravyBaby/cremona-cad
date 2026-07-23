import { RecipeComponentBase } from './recipe-base';

class TestRecipeComponent extends RecipeComponentBase {
  protected canOpenPanel(): boolean {
    return true;
  }
}

describe('RecipeComponentBase', () => {
  it('should create via subclass', () => {
    const recipe = new TestRecipeComponent();
    expect(recipe).toBeTruthy();
  });
});
