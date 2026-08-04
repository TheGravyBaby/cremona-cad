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
  it('puts a toast on screen when safeRun catches a throw', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setGlobalEmitter(m => ms.emit(m));

    safeRun(() => { throw new Error('no real solution'); });
    fixture.detectChanges();

    const toasts = el('.toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].getAttribute('data-severity')).toBe('error');
    expect(toasts[0].textContent).toContain('An Error Occurred');
    // the thrown error still reaches the console for the stack
    expect(consoleError).toHaveBeenCalled();
  });

  it('draws a chip once a condition is dismissed', () => {
    ms.emit({ severity: 'error', title: 'Viol Neck Join', message: 'the neck runs long', autoDismiss: 10000 });
    fixture.detectChanges();
    expect(el('.toast')).toHaveLength(1);
    expect(el('.chip')).toHaveLength(0);

    ms.dismiss(fixture.componentInstance.toasts()[0].id);
    fixture.detectChanges();

    expect(el('.toast')).toHaveLength(0);
    expect(el('.chip')).toHaveLength(1);
    expect(el('.chip .countdown-ring')).toHaveLength(1);
  });

  it('keeps drawing the chip as the condition re-reports, with a rising count', () => {
    const report = () =>
      ms.emit({ severity: 'error', title: 'Viol Neck Join', message: 'the neck runs long', autoDismiss: 10000 });

    report();
    fixture.detectChanges();
    ms.dismiss(fixture.componentInstance.toasts()[0].id);
    fixture.detectChanges();

    report();
    report();
    fixture.detectChanges();

    expect(el('.toast')).toHaveLength(0);
    expect(el('.chip')).toHaveLength(1);
    expect(el('.chip-count-value')[0].textContent.trim()).toBe('3');
  });
});
