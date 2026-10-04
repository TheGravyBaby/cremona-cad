import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readWorkingState, writeWorkingState, clearWorkingState, RECIPE_KEY } from './workingStorage';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('workingStorage', () => {
  it('keeps working state per tab, so it is invisible to localStorage', () => {
    writeWorkingState(RECIPE_KEY, '{"recipeName":"ceruti"}');
    expect(sessionStorage.getItem(RECIPE_KEY)).toBe('{"recipeName":"ceruti"}');
    expect(localStorage.getItem(RECIPE_KEY)).toBeNull();
  });

  it('reads back what it wrote', () => {
    writeWorkingState(RECIPE_KEY, 'a');
    expect(readWorkingState(RECIPE_KEY)).toBe('a');
  });

  it('returns null for a tab that has never been written to', () => {
    expect(readWorkingState(RECIPE_KEY)).toBeNull();
  });

  it('clears what it wrote', () => {
    writeWorkingState(RECIPE_KEY, 'mine');
    clearWorkingState(RECIPE_KEY);
    expect(readWorkingState(RECIPE_KEY)).toBeNull();
  });
});
