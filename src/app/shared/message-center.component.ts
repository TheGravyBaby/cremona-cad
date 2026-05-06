import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { MessageService, Message } from './message.service';
import { CommonModule} from '@angular/common';

@Component({
  selector: 'app-message-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-center.component.html',
  styleUrls: ['./message-center.component.css']
})
export class MessageCenterComponent implements OnDestroy {
  messages: Message[] = [];
  private sub: Subscription;
  private dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly ringRadius = 8;
  readonly ringCircumference = 2 * Math.PI * this.ringRadius;

  constructor(private ms: MessageService) {
    this.sub = this.ms.messages$.subscribe(msgs => {
      this.messages = msgs;
      this.syncDismissTimers(msgs);
    });
  }

  hasCountdown(m: Message): boolean {
    return typeof m.autoDismiss === 'number' && m.autoDismiss > 0;
  }

  countdownAnimationStyle(m: Message): Record<string, string> {
    if (!this.hasCountdown(m)) return {};

    const duration = m.autoDismiss as number;
    const elapsed = Math.max(0, Date.now() - m.timestamp);
    const clampedElapsed = Math.min(elapsed, duration);

    return {
      'animation-duration': `${duration}ms`,
      'animation-delay': `-${clampedElapsed}ms`,
    };
  }

  trackByMessageId(_: number, m: Message): string {
    return m.id;
  }

  onCountdownAnimationEnd(m: Message): void {
    if (!this.hasCountdown(m)) return;
    this.cancelDismissTimer(m.id);
    this.ms.clear(m.id);
  }

  private syncDismissTimers(msgs: Message[]): void {
    const activeIds = new Set(msgs.map(m => m.id));

    this.dismissTimers.forEach((timeoutId, id) => {
      if (!activeIds.has(id)) {
        this.cancelDismissTimer(id, timeoutId);
      }
    });

    msgs.forEach(m => {
      if (!this.hasCountdown(m) || this.dismissTimers.has(m.id)) return;

      const duration = m.autoDismiss as number;
      const elapsed = Date.now() - m.timestamp;
      const remaining = Math.max(0, duration - elapsed);

      if (remaining <= 0) {
        this.cancelDismissTimer(m.id);
        this.ms.clear(m.id);
        return;
      }

      const timeoutId = setTimeout(() => {
        this.dismissTimers.delete(m.id);
        this.ms.clear(m.id);
      }, remaining);

      this.dismissTimers.set(m.id, timeoutId);
    });
  }

  private cancelDismissTimer(id: string, timeoutId?: ReturnType<typeof setTimeout>): void {
    const resolvedTimeout = timeoutId ?? this.dismissTimers.get(id);
    if (resolvedTimeout) clearTimeout(resolvedTimeout);
    this.dismissTimers.delete(id);
  }

  private clearAllTimers(): void {
    this.dismissTimers.forEach(timeoutId => clearTimeout(timeoutId));
    this.dismissTimers.clear();
  }

  dismiss(id: string) {
    this.cancelDismissTimer(id);
    this.ms.clear(id);
  }

  clearAll() {
    this.ms.clear();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.clearAllTimers();
  }
}
