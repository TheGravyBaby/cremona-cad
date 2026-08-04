import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MessageService, Message } from './message.service';

/**
 * The toast stack, but the part that matters is the collapse rule.
 *
 * A titled error is a condition, not an event: the recipe re-reports it on every recompute for as
 * long as it holds. Its failure modes are both silent and both awful — a toast that re-interrupts
 * on every keystroke of a drag, or a chip that outlives the condition and reports a problem the
 * maker already fixed. Neither throws, so pin them here.
 */

function current(svc: MessageService): Message[] {
  let seen: Message[] = [];
  svc.messages$.subscribe(m => { seen = m; }).unsubscribe();
  return seen;
}

const condition = (message = 'the neck runs long') =>
  ({ severity: 'error' as const, title: 'Viol Neck Join', message, autoDismiss: 10000 });

describe('MessageService', () => {
  let svc: MessageService;

  beforeEach(() => {
    vi.useFakeTimers();
    svc = new MessageService();
  });

  afterEach(() => {
    svc.ngOnDestroy();
    vi.useRealTimers();
  });

  it('refreshes a re-reported condition in place rather than replacing it', () => {
    svc.emit(condition('1.0mm over'));
    const first = current(svc)[0];

    vi.advanceTimersByTime(3000);
    svc.emit(condition('2.4mm over'));

    const msgs = current(svc);
    expect(msgs).toHaveLength(1);
    // same identity and same start time, so the dismiss countdown keeps running instead of
    // restarting on every recompute
    expect(msgs[0].id).toBe(first.id);
    expect(msgs[0].timestamp).toBe(first.timestamp);
    expect(msgs[0].message).toBe('2.4mm over');
    expect(msgs[0].count).toBe(2);
  });

  it('collapses a dismissed condition instead of clearing it, and keeps it collapsed', () => {
    svc.emit(condition());
    svc.dismiss(current(svc)[0].id);

    expect(current(svc)[0].collapsed).toBe(true);

    // still being reported as the maker drags the number — must not pop back open
    svc.emit(condition('3.1mm over'));
    const msgs = current(svc);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].collapsed).toBe(true);
    expect(msgs[0].message).toBe('3.1mm over');
  });

  it('expires a chip once the condition stops reporting', () => {
    svc.emit(condition());
    svc.dismiss(current(svc)[0].id);

    vi.advanceTimersByTime(5000);
    svc.emit(condition());
    vi.advanceTimersByTime(5000);
    // re-reported at the 5s mark, so it is still live at 10s
    expect(current(svc)).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(current(svc)).toHaveLength(0);
  });

  it('gives a chip its full window from the moment it collapses, not the last report', () => {
    svc.emit(condition());
    // read it for a while first — the condition is not re-reporting, nothing is being edited
    vi.advanceTimersByTime(20000);
    svc.dismiss(current(svc)[0].id);

    // the chip has to survive being born, or it vanishes before the maker sees where it went
    expect(current(svc)[0].collapsed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(current(svc)).toHaveLength(1);
  });

  it('brings a dismissed condition back as a chip, never as a toast again', () => {
    svc.emit(condition());
    svc.dismiss(current(svc)[0].id);

    // long enough that the chip has expired — the maker was thinking, not editing
    vi.advanceTimersByTime(30000);
    expect(current(svc)).toHaveLength(0);

    svc.emit(condition('still 2.4mm over'));
    const back = current(svc)[0];
    expect(back.collapsed).toBe(true);
    expect(back.message).toBe('still 2.4mm over');
  });

  it('lets a condition interrupt again after the maker reopens it', () => {
    svc.emit(condition());
    const id = current(svc)[0].id;
    svc.dismiss(id);
    svc.expand(id);
    svc.clear(id);

    svc.emit(condition());
    expect(current(svc)[0].collapsed).toBeFalsy();
  });

  it('clears an untitled or info message outright', () => {
    svc.emit({ severity: 'info', message: 'saved' });
    svc.emit({ severity: 'error', message: 'no title here' });

    for (const m of current(svc)) svc.dismiss(m.id);
    expect(current(svc)).toHaveLength(0);
  });

  it('reopens a chip without a countdown', () => {
    svc.emit(condition());
    const id = current(svc)[0].id;
    svc.dismiss(id);
    svc.expand(id);

    const m = current(svc)[0];
    expect(m.collapsed).toBe(false);
    // opened deliberately, so it waits to be read rather than ticking away
    expect(m.autoDismiss).toBe(false);
  });

  it('does not let an exclusive message kick the chips', () => {
    svc.emit(condition());
    svc.dismiss(current(svc)[0].id);

    svc.emit({ severity: 'error', message: 'something else broke', exclusive: true });

    const msgs = current(svc);
    expect(msgs).toHaveLength(2);
    expect(msgs.some(m => m.collapsed && m.title === 'Viol Neck Join')).toBe(true);
  });
});
