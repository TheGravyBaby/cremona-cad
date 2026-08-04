import { error, info, setMessageTap } from '../shared/message-emitter';

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

// ===== The message log =====
//
// Warnings fire when the drawing is built, which is not when anyone thinks to
// look — and by the time a drawing looks wrong, the console has usually scrolled
// or was never open. `unifyConnectedSvgPaths` reporting its stranded endpoints
// is the case this exists for: it names the failing arc outright, and that went
// to a console nobody was reading while the bug went unexplained for months.
//
// So it is recorded as it happens and rides along in whatever the `/` buttons
// copy next. No extra step at the moment of copying, because there is no moment
// of copying — the copy comes later, from someone who has already seen the
// symptom rather than the cause.

interface LoggedMessage {
  /** Milliseconds since capture started. Recency is the useful part: a warning from four seconds ago is about what you are looking at, one from twenty minutes ago probably isn't. */
  atMs: number;
  source: 'log' | 'warn' | 'error' | 'toast';
  text: string;
}

const MESSAGE_LOG_LIMIT = 60;
/** Long enough for a path's endpoints, short enough that one logged object can't crowd out the rest. */
const MESSAGE_TEXT_LIMIT = 600;

const messageLog: LoggedMessage[] = [];
let captureStartedAt = 0;
/** Set while the dump writes its own output, so a copy doesn't record itself into the next one. */
let suppressCapture = false;

function recordMessage(source: LoggedMessage['source'], text: string): void {
  if (suppressCapture || !captureStartedAt) return;
  messageLog.push({
    atMs: Date.now() - captureStartedAt,
    source,
    text: text.length > MESSAGE_TEXT_LIMIT ? `${text.slice(0, MESSAGE_TEXT_LIMIT)}… (${text.length} chars)` : text,
  });
  if (messageLog.length > MESSAGE_LOG_LIMIT) messageLog.shift();
}

/** Console arguments as one line. Objects go through the same rounding the rest of a dump gets. */
function formatArgs(args: unknown[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a, dumpReplacer());
    } catch {
      return String(a);
    }
  }).join(' ');
}

/**
 * Starts recording console output and user-facing messages. Call once at
 * startup; guarded by `isLocalHost()` at the call site, so a served build
 * neither patches the console nor keeps the buffer.
 */
export function installDebugCapture(): void {
  if (captureStartedAt) return;
  captureStartedAt = Date.now();

  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      recordMessage(level, formatArgs(args));
      original(...args);
    };
  }

  setMessageTap(m => {
    // The dump's own "copied to clipboard" toast lands after the clipboard
    // write resolves, so `suppressCapture` has already been cleared by then.
    if (m?.title === 'Debug') return;
    recordMessage('toast', `[${m?.severity ?? 'info'}] ${m?.title ? `${m.title}: ` : ''}${m?.message ?? ''}`);
  });
}

/** What has been recorded since startup, oldest first. */
export function debugMessages(): LoggedMessage[] {
  return messageLog.map(m => ({ ...m }));
}

// ===== View context =====
//
// Which panel is open and which view toggles are on decide what the canvas was
// asked to draw — so "nothing is there" and "it is there and hidden" look the
// same in a dump without them. The canvas can't read either: it and the recipe
// are siblings, not parent and child. Rather than thread an input through `App`
// for every recipe type, the recipe leaves a getter here and the dump calls it.
//
// A getter, not a value, so it reads at dump time rather than at registration.

let contextProvider: (() => unknown) | null = null;

/** Registered by the active recipe; cleared when it goes away. */
export function setDebugContext(fn: (() => unknown) | null): void {
  contextProvider = fn;
}

/**
 * Puts text on the clipboard and logs it. Both, always — the clipboard is for
 * pasting into a conversation, the console for reading it in place without
 * leaving the drawing.
 */
export function copyToClipboard(label: string, text: string): void {
  suppressCapture = true;
  try {
    console.log(`[${label}]`, text);
  } finally {
    suppressCapture = false;
  }
  navigator.clipboard?.writeText(text).then(
    () => info(`${label} copied to clipboard (${text.length} chars). Also logged to the console.`, 'Debug', 4000),
    () => error(`Could not reach the clipboard. ${label} is in the console instead.`, 'Debug'),
  );
}

/**
 * The same, for a structured payload — stringified through the rounding replacer
 * above, with the message log appended to whatever the caller assembled. Every
 * dump carries it: which button was pressed says nothing about which warning
 * explains the drawing.
 */
export function copyDebugDump(label: string, payload: unknown): void {
  let text: string;
  try {
    text = JSON.stringify(
      {
        label,
        at: new Date().toISOString(),
        view: contextProvider?.() ?? null,
        ...(payload as object),
        messages: debugMessages(),
      },
      dumpReplacer(),
      2,
    );
  } catch (e) {
    text = JSON.stringify({ label, dumpFailed: String(e) }, null, 2);
  }
  copyToClipboard(label, text);
}
