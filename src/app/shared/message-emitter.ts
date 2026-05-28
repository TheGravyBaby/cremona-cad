let globalEmitter: ((m: any) => void) | null = null;

interface UserMessage {
    severity: 'info' | 'warn' | 'error';
    title?: string;
    message: string;
    autoDismiss: number | false
}

export const setGlobalEmitter = (fn: (m: any) => void) => {
  globalEmitter = fn;
}

export const emitGlobal = (m: any) => {
  if (globalEmitter) globalEmitter(m);
  else console.warn('No global message emitter registered', m);
}

// Convenience wrapper used by non-Angular helpers to emit a Message object
export const message = (m: UserMessage) => emitGlobal(m);
export const error = (msg: string, title?: string) => emitGlobal({ severity: 'error', message: msg, title, autoDismiss: 10000 });
export const warn = (msg: string, title?: string) => emitGlobal({ severity: 'warn', message: msg, title, autoDismiss: 10000 });
export const info = (msg: string, title?: string, autoDismiss: number | false = 15000) => emitGlobal({ severity: 'info', message: msg, title, autoDismiss });