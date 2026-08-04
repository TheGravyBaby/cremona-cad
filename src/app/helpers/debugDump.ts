import { error, info } from '../shared/message-emitter';

// The debug channel — the `/` buttons on the canvas bar and the recipe toolbar.
//
// Nothing in the app computes with what these produce. They exist to get what
// is actually on screen out of a running session and into a conversation,
// because "the waist looks wrong" and a path string are very different bug
// reports.

/**
 * Whether the `/` buttons show at all.
 *
 * Read off the hostname rather than a build flag, so it follows where the app
 * is *being served from* rather than how it was compiled: a production build
 * checked locally still gets the buttons, and a dev build that reaches a real
 * host does not. Angular's `isDevMode()` answers the other question — if you
 * ever want the buttons tied to the build configuration instead, that is the
 * one to swap in here.
 */
export function isLocalHost(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h.endsWith('.local');
}

/** Decimal places kept when dumping numbers. Raw doubles are unreadable and their tail is never the bug. */
const DUMP_PRECISION = 4;

/**
 * Rounds every number on the way out and drops what JSON can't carry, so a
 * payload can hold a live object without the caller pre-cleaning it. Circular
 * references become '[circular]' rather than throwing — a debug dump that fails
 * because the thing you're debugging is malformed is worthless.
 */
function dumpReplacer(): (key: string, value: any) => any {
  const seen = new WeakSet<object>();
  return function (_key: string, value: any) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Number(value.toFixed(DUMP_PRECISION)) : String(value);
    }
    if (typeof value === 'function') return undefined;
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
    }
    return value;
  };
}

/**
 * Puts text on the clipboard and logs it. Both, always — the clipboard is for
 * pasting into a conversation, the console for reading it in place without
 * leaving the drawing.
 */
export function copyToClipboard(label: string, text: string): void {
  console.log(`[${label}]`, text);
  navigator.clipboard?.writeText(text).then(
    () => info(`${label} copied to clipboard (${text.length} chars). Also logged to the console.`, 'Debug', 4000),
    () => error(`Could not reach the clipboard. ${label} is in the console instead.`, 'Debug'),
  );
}

/** The same, for a structured payload — stringified through the rounding replacer above. */
export function copyDebugDump(label: string, payload: unknown): void {
  let text: string;
  try {
    text = JSON.stringify({ label, at: new Date().toISOString(), ...(payload as object) }, dumpReplacer(), 2);
  } catch (e) {
    text = JSON.stringify({ label, dumpFailed: String(e) }, null, 2);
  }
  copyToClipboard(label, text);
}
