import { error, info } from '../shared/message-emitter';

// The debug channel — the `/` button on the recipe toolbar.
//
// Nothing in the app computes with what it produces. It exists to get what
// is actually on screen out of a running session and into a conversation,
// because "the waist looks wrong" and a path string are very different bug
// reports.

/**
 * Whether the `/` button shows at all.
 *
 * Read off the hostname rather than a build flag, so it follows where the app
 * is *being served from* rather than how it was compiled: a production build
 * checked locally still gets the button, and a dev build that reaches a real
 * host does not. Angular's `isDevMode()` answers the other question — if you
 * ever want the button tied to the build configuration instead, that is the
 * one to swap in here.
 */
export function isLocalHost(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h.endsWith('.local');
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
