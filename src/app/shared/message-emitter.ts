let globalEmitter: ((m: any) => void) | null = null;

interface UserMessage {
    severity: 'info' | 'warn' | 'error';
    title?: string;
    message: string;
    autoDismiss: number | false
    exclusive?: boolean
}

export const setGlobalEmitter = (fn: (m: any) => void) => {
  globalEmitter = fn;
}

/**
 * A read-only observer of every message, for the debug dump's message log.
 * Separate from the emitter because that one *is* the UI — there can only be one
 * of it, and a tap must not be able to take its place or swallow a toast.
 */
let messageTap: ((m: UserMessage) => void) | null = null;
export const setMessageTap = (fn: ((m: UserMessage) => void) | null) => {
  messageTap = fn;
}

export const emitGlobal = (m: any) => {
  try { messageTap?.(m); } catch { /* a broken tap must never cost the user their message */ }
  if (globalEmitter) globalEmitter(m);
  else console.warn('No global message emitter registered', m);
}

// Convenience wrapper used by non-Angular helpers to emit a Message object
export const message = (m: UserMessage) => emitGlobal(m);
export const error = (msg: string, title?: string, exclusive?: boolean) => emitGlobal({ severity: 'error', message: msg, title, autoDismiss: 10000, exclusive });
export const warn = (msg: string, title?: string, exclusive?: boolean) => emitGlobal({ severity: 'warn', message: msg, title, autoDismiss: 10000, exclusive });
export const info = (msg: string, title?: string, autoDismiss: number | false = 15000, exclusive?: boolean) => emitGlobal({ severity: 'info', message: msg, title, autoDismiss, exclusive });