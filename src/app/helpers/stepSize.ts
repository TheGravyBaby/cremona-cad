const NICE_MULTIPLIERS = [1, 2, 5, 10];

/** Rounds up to the nearest 1/2/5/10 x a power of ten — the standard axis-tick ladder. */
function roundToNiceNumber(raw: number): number {
  if (!(raw > 0)) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const nice = NICE_MULTIPLIERS.find(n => normalized <= n) ?? 10;
  return nice * magnitude;
}

/**
 * A step size scaled to the current value, biased toward whole numbers, but never finer than
 * `floor` — the field's own hand-tuned `step` literal. Small-value fields (rib, overhang) keep
 * their original granularity; large-value fields (height, radius) get a bigger, rounder step.
 */
export function computeStepSize(value: number, floor: number, percent = 2): number {
  if (!(floor > 0)) return 0;
  const raw = Math.abs(value) * (percent / 100);
  const nice = roundToNiceNumber(raw);
  const step = Math.max(nice, floor);
  const snapped = Math.round(step / floor) * floor;
  return Math.round(snapped * 1e6) / 1e6;
}

const SHIFT_MULTIPLIER = 5;

/**
 * The step to take for one arrow-key press, given the field's plain (percent-scaled) step.
 * Shift scales that step up — still a percentage, so it stays proportionate on any field.
 * Ctrl (Windows/Linux) or Cmd/Meta (Mac) — either one — switches to a small fixed unit instead
 * of scaling down `baseStep`: a percentage of a percentage reads as an arbitrary decimal, where
 * a fixed nudge (1mm by default, 0.25 on fields already tuned finer — see each field's
 * `data-fine-step`) is the amount a hand actually reaches for. Not Alt: it isn't a conventional
 * modifier for this on Windows/Linux the way Ctrl is, and it collides with OS/browser bindings
 * there in a way Ctrl+Arrow on a focused number field doesn't.
 */
export function stepAmountForKey(
  e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  baseStep: number,
  fineStep = 1,
): number {
  if (e.shiftKey) return baseStep * SHIFT_MULTIPLIER;
  if (e.ctrlKey || e.metaKey) return fineStep;
  return baseStep;
}
