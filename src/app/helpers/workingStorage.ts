import { error } from '../shared/message-emitter';

// per-tab copy of the in-progress design (recipe, open panel, toolbox shapes) — sessionStorage,
// so each tab is its own workspace but closing it discards the work. saving to disk is the only durable copy.

export const RECIPE_KEY = 'recipeData';
export const PANEL_KEY = 'openPanel';

let quotaWarned = false;

/**
 * Writes, and reports a full store once per session rather than on every keystroke.
 *
 * Quota is the realistic failure here, not a blocked store: reference images are inlined as
 * `data:` URLs, and two photos can pass the ~5MB most browsers allow. The write then throws and
 * every later one keeps throwing, so silence would mean a design quietly stopping being kept
 * while the user carries on editing it.
 */
export function writeWorkingState(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    if (quotaWarned) return;
    quotaWarned = true;
    error(
      'Your browser\'s storage is full, so this design is no longer being kept while the tab ' +
      'is open. Save it to keep it. Large reference images are the usual cause.',
      'Storage full', true,
    );
  }
}

// falls back once to the pre-migration localStorage copy, then takes it (removes from
// localStorage) rather than copying it, so only the first tab to load inherits it.
export function readWorkingState(key: string): string | null {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored !== null) return stored;

    const carried = localStorage.getItem(key);
    if (carried === null) return null;
    try {
      sessionStorage.setItem(key, carried);
      localStorage.removeItem(key);
    } catch {
      // couldn't take it over — leave the localStorage copy for the next load to try again
    }
    return carried;
  } catch {
    return null;
  }
}

export function clearWorkingState(key: string): void {
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {
    // nothing useful to do — a store that won't delete also won't have been written
  }
}
