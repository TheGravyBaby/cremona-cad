import { copyDebugDump, debugMessages, installDebugCapture, isLocalHost, setDebugContext } from './debugDump';
import { error, setGlobalEmitter, warn } from '../shared/message-emitter';

/**
 * The debug channel. Nothing computes with what it produces, so the only thing
 * that can go wrong is that it reports something other than what happened — and
 * a dump is trusted precisely because nobody can check it against the session it
 * came from. That makes quiet wrongness the whole risk, and the reason the
 * message log is tested at all rather than treated as console plumbing.
 */

/** Captures what a copy would have put on the clipboard. */
function dumped(run: () => void): any {
  let text = '';
  const write = vi.fn().mockResolvedValue(undefined);
  const clipboard = { writeText: write };
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  try {
    run();
    text = write.mock.calls[0]?.[0] ?? '';
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
  }
  return JSON.parse(text);
}

describe('the message log', () => {
  beforeAll(() => {
    // Idempotent by design — App calls it once, and a second call must not
    // double-patch the console into recording every line twice.
    installDebugCapture();
    installDebugCapture();
    // App registers one in its constructor. Without it `emitGlobal` falls back
    // to console.warn, which the capture would then record a second time — an
    // artefact of an app with no message centre, not of the log.
    setGlobalEmitter(() => undefined);
  });

  afterEach(() => setDebugContext(null));

  it('records a warning exactly once', () => {
    // Once, not twice: the install is idempotent, so a second call must not
    // leave two wrappers stacked. Pass-through to the real console is by
    // construction — the wrapper closes over the previous function and calls it —
    // and can't be spied on here, since a spy installed now would replace the
    // wrapper rather than sit under it.
    console.warn('kink at the taper');

    const found = debugMessages().filter(m => m.text.includes('kink at the taper'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('warn');
  });

  it('records the app\'s own toasts, which never reach the console at all', () => {
    error('The offset is too small', 'Purfling Error');
    const found = debugMessages().filter(m => m.text.includes('The offset is too small'));
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('toast');
    expect(found[0].text).toContain('Purfling Error');
  });

  it('keeps the severity, so a warning is not read back as a note', () => {
    warn('stations merged');
    const found = debugMessages().find(m => m.text.includes('stations merged'))!;
    expect(found.text).toContain('warn');
  });

  it('stamps how long ago, since recency is what makes a message relevant', () => {
    console.log('a stamped line');
    const found = debugMessages().find(m => m.text.includes('a stamped line'))!;
    expect(found.atMs).toBeGreaterThanOrEqual(0);
    expect(found.atMs).toBeLessThan(60_000);
  });

  it('flattens a logged object rather than storing [object Object]', () => {
    // What `unifyConnectedSvgPaths` logs is an object. Losing it to a default
    // toString would drop the only copy of the stranded path.
    console.log('remaining', { start: { x: 164.7, y: 612.1039461982683 } });
    const found = debugMessages().find(m => m.text.includes('remaining'))!;
    expect(found.text).toContain('164.7');
    expect(found.text).not.toContain('[object Object]');
  });

  it('truncates one enormous entry instead of letting it crowd the rest out', () => {
    console.log('X'.repeat(5000));
    const found = debugMessages().find(m => m.text.startsWith('XXX'))!;
    expect(found.text.length).toBeLessThan(1000);
    expect(found.text).toContain('5000 chars');
  });

  it('drops the oldest once full, so the buffer cannot grow without bound', () => {
    for (let i = 0; i < 200; i++) console.log(`filler ${i}`);
    const log = debugMessages();
    expect(log.length).toBeLessThanOrEqual(60);
    expect(log.some(m => m.text.includes('filler 199'))).toBe(true);
    expect(log.some(m => m.text.includes('filler 0'))).toBe(false);
  });

  it('hands out a copy, so a reader cannot edit the record', () => {
    console.log('immutable check');
    const first = debugMessages();
    first[0].text = 'tampered';
    expect(debugMessages()[0].text).not.toBe('tampered');
  });
});

describe('a dump', () => {
  afterEach(() => setDebugContext(null));

  it('carries the message log alongside the payload', () => {
    console.log('something went sideways');
    const out = dumped(() => copyDebugDump('canvas', { drawnCount: 3 }));

    expect(out.label).toBe('canvas');
    expect(out.drawnCount).toBe(3);
    expect(out.messages.some((m: any) => m.text.includes('something went sideways'))).toBe(true);
  });

  it('does not record itself, so one copy cannot bury the log in the next', () => {
    // The dump logs its own output to the console. Left uncaught, pressing the
    // button twice would fill the buffer with the first dump's text.
    dumped(() => copyDebugDump('canvas', { note: 'first-dump-marker' }));
    const out = dumped(() => copyDebugDump('canvas', {}));
    expect(out.messages.some((m: any) => m.text.includes('first-dump-marker'))).toBe(false);
  });

  it('reports the registered view context', () => {
    setDebugContext(() => ({ openPanel: 'outerTrace', viewFlags: { showArcs: false } }));
    const out = dumped(() => copyDebugDump('canvas', {}));
    expect(out.view).toEqual({ openPanel: 'outerTrace', viewFlags: { showArcs: false } });
  });

  it('reads the context at dump time, not at registration', () => {
    // Registered once in ngOnInit, while the panel it reports changes all
    // session. A value captured at registration would report the landing panel
    // forever.
    let panel = 'base';
    setDebugContext(() => ({ openPanel: panel }));
    panel = 'mould';
    expect(dumped(() => copyDebugDump('canvas', {})).view).toEqual({ openPanel: 'mould' });
  });

  it('says null rather than failing when no recipe has registered', () => {
    expect(dumped(() => copyDebugDump('canvas', {})).view).toBeNull();
  });

  it('still produces a dump when the payload cannot be serialized', () => {
    // The thing being debugged is malformed by definition. A dump that throws
    // on the way out is worthless exactly when it is needed.
    const circular: any = { name: 'loop' };
    circular.self = circular;
    expect(() => dumped(() => copyDebugDump('canvas', { circular }))).not.toThrow();
  });
});

describe('the local-host gate', () => {
  it('answers for this environment without throwing', () => {
    // Whatever `location` this runner presents, the answer is a boolean — the
    // buttons' visibility must never depend on an exception.
    expect(typeof isLocalHost()).toBe('boolean');
  });
});
