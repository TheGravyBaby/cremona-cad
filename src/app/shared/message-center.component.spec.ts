import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageCenterComponent } from './message-center.component';
import { MessageService } from './message.service';
import { setGlobalEmitter } from './message-emitter';
import { safeRun } from '../helpers/validators';

/**
 * The service tests pin when a message is a toast and when it is a chip. This pins that the chip
 * actually reaches the screen — the failure that got past those tests was a chip the service knew
 * about and the template never drew.
 */
describe('MessageCenterComponent', () => {
  let fixture: ComponentFixture<MessageCenterComponent>;
  let ms: MessageService;

  const el = (selector: string) => fixture.nativeElement.querySelectorAll(selector);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MessageCenterComponent],
    }).compileComponents();

    ms = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(MessageCenterComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    setGlobalEmitter(null as any);
    vi.restoreAllMocks();
  });

  /**
   * The generic net, end to end: a throw inside safeRun has to reach the screen. This is the path
   * every unanticipated failure falls back on, so it is the one that must not be quietly broken by
   * work on the layers above it.
   */
  it('puts a chip on screen when safeRun catches a throw', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setGlobalEmitter(m => ms.emit(m));

    safeRun(() => { throw new Error('no real solution'); });
    fixture.detectChanges();

    const chips = el('.chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].closest('[data-severity]').getAttribute('data-severity')).toBe('error');
    expect(chips[0].textContent).toContain('An Error Occurred');
    // the thrown error still reaches the console for the stack
    expect(consoleError).toHaveBeenCalled();
  });

  it('draws a condition as a chip, and opens its message beneath the chip rather than as a toast', () => {
    ms.emit({ severity: 'error', title: 'Viol Neck Join', message: 'the neck runs long', autoDismiss: 10000 });
    fixture.detectChanges();
    expect(el('.toast')).toHaveLength(0);
    expect(el('.chip')).toHaveLength(1);
    expect(el('.chip .countdown-ring')).toHaveLength(1);

    el('.chip-toggle')[0].click();
    fixture.detectChanges();

    expect(el('.toast')).toHaveLength(0);
    expect(el('.chip')).toHaveLength(1);
    expect(el('.chip-sheet')[0].textContent).toContain('the neck runs long');
    // opened deliberately, so no clock — and no ring whose end would fold it back
    expect(el('.chip .countdown-ring')).toHaveLength(0);
  });

  it('keeps only one chip open at a time', () => {
    ms.emit({ severity: 'error', title: 'Viol Neck Join', message: 'the neck runs long', autoDismiss: 10000 });
    ms.emit({ severity: 'warn', title: 'Kink at the taper', message: 'the rib taper kinks', autoDismiss: 10000 });
    fixture.detectChanges();

    el('.chip-toggle')[0].click();
    fixture.detectChanges();
    el('.chip-toggle')[1].click();
    fixture.detectChanges();

    expect(el('.chip-sheet')).toHaveLength(1);
    expect(el('.chip-sheet')[0].textContent).toContain('the neck runs long');
  });

  it('opens titled info beneath its chip straight away, with its countdown on the chip', () => {
    ms.emit({ severity: 'info', title: 'Dimensions', message: 'the outer dimensions of the body', autoDismiss: 15000 });
    fixture.detectChanges();

    expect(el('.toast')).toHaveLength(0);
    expect(el('.chip')).toHaveLength(1);
    expect(el('.chip-sheet')[0].textContent).toContain('the outer dimensions of the body');
    expect(el('.chip .countdown-ring')).toHaveLength(1);
  });

  it('toasts a message with no title to put on a chip', () => {
    ms.emit({ severity: 'info', message: 'copied', autoDismiss: 4000 });
    fixture.detectChanges();

    expect(el('.toast')).toHaveLength(1);
    expect(el('.chip')).toHaveLength(0);
  });

  it('keeps one chip as the condition re-reports', () => {
    const report = () =>
      ms.emit({ severity: 'error', title: 'Viol Neck Join', message: 'the neck runs long', autoDismiss: 10000 });

    report();
    report();
    report();
    fixture.detectChanges();

    expect(el('.toast')).toHaveLength(0);
    expect(el('.chip')).toHaveLength(1);
  });

  it('clears a chip and its open message outright from its close button', () => {
    ms.emit({ severity: 'info', title: 'Dimensions', message: 'the outer dimensions of the body', autoDismiss: 15000 });
    fixture.detectChanges();
    expect(el('.chip-sheet')).toHaveLength(1);

    el('.chip-close')[0].click();
    fixture.detectChanges();

    expect(el('.chip')).toHaveLength(0);
    expect(el('.chip-sheet')).toHaveLength(0);
  });
});
