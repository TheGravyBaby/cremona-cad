import { Circle, Pt } from "../models/types";
import { error } from "../shared/message-emitter";
import { unexpectedError } from '../docs/conditions';

export function isOutOfRange(value: number, min: number, max = Infinity): boolean {
    return value < min || value > max;
}

/** Titles carry the field, because titles are identity: messages dedupe by them and a dismissed
 * one collapses to a chip under them. A shared title made every clamp look like the same problem,
 * so two bad fields showed as one and the later text overwrote the earlier. */
function fieldTitle(key: string): string {
    const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return `Invalid ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function clampParam(
    params: any,
    key: keyof typeof params,
    min: number,
    max = Infinity,
    tooSmallMsg?: string,
    tooBigMsg?: string,
): boolean {
    const val = params[key] as number;
    if (val < min || val > max) {
        const clamped = Math.min(Math.max(val, min), max);
        (params[key] as number) = clamped;
        const title = fieldTitle(String(key));
        if (val < min && tooSmallMsg) error(tooSmallMsg, title);
        if (val > max && tooBigMsg) error(tooBigMsg, title);
        return true;
    }
    return false;
}

export function safeRun(fn: () => void): void {
    try {
        fn();
    } catch (e: any) {
        unexpectedError();
        console.error(e)
    }
}

// a calc split into independent sections reports what it couldn't solve rather than throwing,
// so the rest still draws. a section returns a failure for a case it can name, else null; a
// throw becomes a generic one. `unsolved` is what the renderer must skip, `circles`/`segments`/
// `points` the constraint the failed step was trying to meet, drawn so the gap is visible
export interface SolveFailure<K extends string = string> {
  message: string;
  unsolved: K[];
  circles: Circle[];
  segments: [Pt, Pt][];
  points?: Pt[];
}

export function solveSection<K extends string>(
  failures: SolveFailure<K>[],
  section: string,
  unsolved: K[],
  run: () => SolveFailure<K> | null,
): void {
  try {
    let failure = run();
    if (failure) failures.push(failure);
  } catch (e) {
    console.error(e);
    failures.push({ message: `${section} can't be solved from these numbers.`, unsolved, circles: [], segments: [] });
  }
}

export function reportFailures(failures: SolveFailure[], title: string): void {
  if (failures.length) error(failures.map(f => f.message).join(' '), title);
}
