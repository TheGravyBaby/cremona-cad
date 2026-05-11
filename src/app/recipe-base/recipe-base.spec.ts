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

  it('returns a clean fraction when no named constant is close', () => {
    const recipe = new TestRecipeComponent();
    expect(recipe.nearestFraction(1.5)).toBe('3/2');
  });

  it('returns named constant directly when it matches (pi)', () => {
    const recipe = new TestRecipeComponent();
    const result = recipe.nearestFraction(Math.PI);
    expect(result).toBe('π');
  });

  it('matches integer-over-constant forms (n/π)', () => {
    const recipe = new TestRecipeComponent();
    const result = recipe.nearestFraction(2 / Math.PI);
    expect(result).toBe('2/π');
  });

  it('matches constant-over-integer forms (π/n)', () => {
    const recipe = new TestRecipeComponent();
    const result = recipe.nearestFraction(Math.PI / 2);
    expect(result).toBe('π/2');
  });

  it('supports custom named constants input', () => {
    const recipe = new TestRecipeComponent();
    const result = recipe.nearestFraction(1.73205, 32, 32, [
      { label: '√3', value: Math.sqrt(3), tolerance: 0.001 },
    ]);
    expect(result).toBe('√3');
  });

  it('allows opting out of default constants', () => {
    const recipe = new TestRecipeComponent();
    const result = recipe.nearestFraction(Math.PI, 21, 16, []);
    expect(result).not.toContain('π');
  });
});
