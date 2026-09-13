const BASE_STEP = 1;
const SHIFT_STEP = 10;
const FINE_STEP = 0.1;

/**
 * The step to take for one arrow-key press on a number field: 1 plain, 10 with Shift, 0.1 with
 * Ctrl (Windows/Linux) or Cmd/Meta (Mac) — either one. Not Alt: it isn't a conventional modifier
 * for this on Windows/Linux the way Ctrl is, and it collides with OS/browser bindings there in a
 * way Ctrl+Arrow on a focused number field doesn't.
 */
export function stepAmountForKey(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): number {
  if (e.shiftKey) return SHIFT_STEP;
  if (e.ctrlKey || e.metaKey) return FINE_STEP;
  return BASE_STEP;
}
