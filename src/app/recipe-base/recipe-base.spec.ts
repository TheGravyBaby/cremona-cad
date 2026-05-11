import { RecipeComponentBase } from './recipe-base';

class TestRecipeComponent extends RecipeComponentBase {
  protected canOpenPanel(): boolean {
    return true;
  }

  protected getActivationHandlers(): Record<string, () => void> {
    return {};
  }
}

describe('RecipeComponentBase', () => {
  it('should create via subclass', () => {
    const recipe = new TestRecipeComponent();
    expect(recipe).toBeTruthy();
  });
});
