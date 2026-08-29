import { describe, it, expect } from 'vitest';
import { CERUTI_TEMPLATES } from './ceruti-templates';

// A template's `recipeName` is its identity: RecipeComponentBase.loadMatchingStoredRecipe compares
// it to decide whether stored working state belongs to the open recipe, and saveToDisk writes it
// into the file. A blank one fails that check on every refresh — the design silently reverts to
// the default template — and travels on to disk in anything saved from it. The pasted-JSON
// workflow has now dropped it twice, hence a test rather than a third hand-edit.
describe('CERUTI_TEMPLATES', () => {
  it('gives every template a recipeName, so a design restores after a refresh', () => {
    const blank = CERUTI_TEMPLATES.filter(t => !t.recipeName).map(t => t.key);
    expect(blank).toEqual([]);
  });

  it('agrees on one recipeName, so no template is a stranger to the others', () => {
    const names = new Set(CERUTI_TEMPLATES.map(t => t.recipeName));
    expect([...names]).toEqual(['enrico-ceruti-violin']);
  });

  it('keeps every template distinguishable by key', () => {
    const keys = CERUTI_TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(k => k.length > 0)).toBe(true);
  });
});
