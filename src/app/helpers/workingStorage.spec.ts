import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeWorkingState, RECIPE_KEY } from './workingStorage';

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
});
