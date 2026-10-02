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

  it('brings a condition in as a chip, and keeps it one as it re-reports', () => {
    svc.emit(condition());
    expect(current(svc)[0].collapsed).toBe(true);

    // still being reported as the maker drags the number — must not pop open into a toast
    svc.emit(condition('3.1mm over'));
    const msgs = current(svc);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].collapsed).toBe(true);
    expect(msgs[0].message).toBe('3.1mm over');
  });

  it('expires a chip once the condition stops reporting', () => {
    svc.emit(condition());

    vi.advanceTimersByTime(5000);
    svc.emit(condition());
    vi.advanceTimersByTime(5000);
    // re-reported at the 5s mark, so it is still live at 10s
    expect(current(svc)).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(current(svc)).toHaveLength(0);
  });

  it('folds a reopened condition back into a chip when dismissed', () => {
    svc.emit(condition());
    const id = current(svc)[0].id;
    svc.expand(id);
    expect(current(svc)[0].collapsed).toBe(false);

    svc.dismiss(id);
    expect(current(svc)[0].collapsed).toBe(true);
  });

  it('gives a chip its full window from the moment it folds back, not the last report', () => {
    svc.emit(condition());
    const id = current(svc)[0].id;
    svc.expand(id);
    // read it for a while first — the condition is not re-reporting, nothing is being edited
    vi.advanceTimersByTime(20000);
    svc.dismiss(id);

    // the chip has to survive being born, or it vanishes before the maker sees where it went
    expect(current(svc)[0].collapsed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(current(svc)).toHaveLength(1);
  });

  it('brings a condition back as a chip after its last one expired', () => {
    svc.emit(condition());

    // long enough that the chip has expired — the maker was thinking, not editing
    vi.advanceTimersByTime(30000);
    expect(current(svc)).toHaveLength(0);

    svc.emit(condition('still 2.4mm over'));
    const back = current(svc)[0];
    expect(back.collapsed).toBe(true);
    expect(back.message).toBe('still 2.4mm over');
  });

  it('brings titled info in open, and folds it into a chip when dismissed', () => {
    svc.emit({ severity: 'info', title: 'Body Dimensions', message: 'height and lower bout width' });
    const id = current(svc)[0].id;
    expect(current(svc)[0].collapsed).toBeFalsy();

    svc.dismiss(id);
    expect(current(svc)[0].collapsed).toBe(true);
  });

  it('reopens info asked for again, rather than counting it like a re-report', () => {
    svc.emit({ severity: 'info', title: 'Body Dimensions', message: 'height and lower bout width' });
    svc.dismiss(current(svc)[0].id);

    svc.emit({ severity: 'info', title: 'Body Dimensions', message: 'height and lower bout width' });
    const msgs = current(svc);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].collapsed).toBeFalsy();
  });

  it('replaces a chip of the same title rather than stacking beside it, even when exclusive', () => {
    const ask = () => svc.emit({ severity: 'info', title: 'Body Dimensions', message: 'height and lower bout width', exclusive: true });
    ask();
    ask();
    ask();

    const msgs = current(svc);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].collapsed).toBeFalsy();
  });

  it('brings a condition sent without a countdown in open, since it has to be read', () => {
    svc.emit({ severity: 'warn', title: 'Older file format', message: 'loaded, but fields may be missing', autoDismiss: false });
    expect(current(svc)[0].collapsed).toBeFalsy();
  });

  it('keeps one chip open at a time, whether opened by hand or by arriving', () => {
    svc.emit(condition());
    svc.expand(current(svc)[0].id);

    svc.emit({ severity: 'info', title: 'Body Dimensions', message: 'height and lower bout width' });
    const open = current(svc).filter(m => !m.collapsed);
    expect(open).toHaveLength(1);
    expect(open[0].title).toBe('Body Dimensions');
  });

  it('clears an untitled message outright', () => {
    svc.emit({ severity: 'info', message: 'saved' });
    svc.emit({ severity: 'error', message: 'no title here' });

    for (const m of current(svc)) svc.dismiss(m.id);
    expect(current(svc)).toHaveLength(0);
  });

  it('reopens a chip without a countdown', () => {
    svc.emit(condition());
    const id = current(svc)[0].id;
    svc.expand(id);

    const m = current(svc)[0];
    expect(m.collapsed).toBe(false);
    // opened deliberately, so it waits to be read rather than ticking away
    expect(m.autoDismiss).toBe(false);
  });

  it('does not let an exclusive message kick the chips', () => {
    svc.emit(condition());

    svc.emit({ severity: 'error', message: 'something else broke', exclusive: true });

    const msgs = current(svc);
    expect(msgs).toHaveLength(2);
    expect(msgs.some(m => m.collapsed && m.title === 'Viol Neck Join')).toBe(true);
  });
});
