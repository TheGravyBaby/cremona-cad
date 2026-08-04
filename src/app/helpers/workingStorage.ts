import { error } from '../shared/message-emitter';

// the browser's copy of whatever is currently being worked on — the recipe, the panel you left
// open, the toolbox shapes. localStorage rather than sessionStorage: the app has no server and no
// notion of a saved file, so this is the only live copy of a design until the user downloads a
// snapshot, and losing it when a tab closes loses real work.
//
// note this is deliberately *not* where a design is kept safe. it is one browser, one profile,
// clearable by the user at any time. downloading the recipe is still the only durable copy.

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
    localStorage.setItem(key, value);
  } catch {
    if (quotaWarned) return;
    quotaWarned = true;
    error(
      'Your browser\'s storage is full, so this design is no longer being kept between visits. ' +
      'Download it to keep it. Large reference images are the usual cause.',
      'Storage full', true,
    );
  }
}

/**
 * Reads, falling back once to the sessionStorage copy this used to be kept in and adopting it —
 * so a tab that was already open when the app updated carries its work over instead of coming
 * back blank.
 */
export function readWorkingState(key: string): string | null {
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored;

  try {
    const legacy = sessionStorage.getItem(key);
    if (legacy !== null) writeWorkingState(key, legacy);
    return legacy;
  } catch {
    return null;
  }
}

export function clearWorkingState(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // nothing useful to do — a store that won't delete also won't have been written
  }
}
