import { error } from '../shared/message-emitter';

// the browser's copy of whatever is currently being worked on — the recipe, the panel you left
// open, the toolbox shapes. sessionStorage rather than localStorage, so a tab is a workspace: two
// windows hold two designs instead of fighting over one key, and closing a tab closes that piece
// of work rather than leaving it to reappear under the next design you open.
//
// note this is deliberately *not* where a design is kept safe, and less so than ever now that it
// dies with the tab. saving the recipe to disk is the only durable copy.

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

/**
 * Reads, falling back once to the localStorage copy this used to be kept in — so a design that
 * was open when the app updated carries over instead of coming back blank.
 *
 * The carry-over *takes* that copy rather than duplicating it: left in place it would seed every
 * new tab with the same stale design, which is the thing per-tab state exists to avoid. So the
 * first tab to load after the update inherits the work and later ones open fresh.
 */
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
