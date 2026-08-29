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

  // the carry-over from when this was kept in localStorage: the first load after the update has to
  // inherit whatever was open, or a design in progress comes back blank
  it('adopts an old localStorage copy on first read', () => {
    localStorage.setItem(RECIPE_KEY, 'legacy');
    expect(readWorkingState(RECIPE_KEY)).toBe('legacy');
    expect(sessionStorage.getItem(RECIPE_KEY)).toBe('legacy');
  });

  // the point of the whole move — a copy left behind would re-seed every new tab with the same
  // stale design, which is exactly what per-tab state exists to prevent
  it('takes the old copy rather than duplicating it, so a later tab opens fresh', () => {
    localStorage.setItem(RECIPE_KEY, 'legacy');
    readWorkingState(RECIPE_KEY);
    expect(localStorage.getItem(RECIPE_KEY)).toBeNull();

    sessionStorage.clear(); // a second tab: its own empty session, same localStorage
    expect(readWorkingState(RECIPE_KEY)).toBeNull();
  });

  it('prefers this tab\'s own state over an old localStorage copy', () => {
    localStorage.setItem(RECIPE_KEY, 'legacy');
    writeWorkingState(RECIPE_KEY, 'mine');
    expect(readWorkingState(RECIPE_KEY)).toBe('mine');
  });

  it('clears both stores, so New cannot resurrect a carried-over copy', () => {
    localStorage.setItem(RECIPE_KEY, 'legacy');
    writeWorkingState(RECIPE_KEY, 'mine');
    clearWorkingState(RECIPE_KEY);
    expect(readWorkingState(RECIPE_KEY)).toBeNull();
    expect(localStorage.getItem(RECIPE_KEY)).toBeNull();
  });
});
