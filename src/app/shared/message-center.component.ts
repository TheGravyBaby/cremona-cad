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

  readonly ringRadius = 8;
  readonly ringCircumference = 2 * Math.PI * this.ringRadius;

  // Cached once per message so the [ngStyle] binding stays stable across
  // change-detection cycles (a changing style object restarts the CSS animation).
  private animationStyleCache = new Map<string, Record<string, string>>();

  constructor(private ms: MessageService) {
    this.sub = this.ms.messages$.subscribe(msgs => {
      this.messages = msgs;
      const activeIds = new Set(msgs.map(m => m.id));
      this.animationStyleCache.forEach((_, id) => {
        if (!activeIds.has(id)) this.animationStyleCache.delete(id);
      });
    });
  }

  hasCountdown(m: Message): boolean {
    return typeof m.autoDismiss === 'number' && m.autoDismiss > 0;
  }

  countdownAnimationStyle(m: Message): Record<string, string> {
    if (!this.hasCountdown(m)) return {};

    if (this.animationStyleCache.has(m.id)) {
      return this.animationStyleCache.get(m.id)!;
    }

    const duration = m.autoDismiss as number;
    const elapsed = Math.max(0, Math.min(Date.now() - m.timestamp, duration));
    const style = {
      'animation-duration': `${duration}ms`,
      'animation-delay': `-${elapsed}ms`,
    };
    this.animationStyleCache.set(m.id, style);
    return style;
  }

  trackByMessageId(_: number, m: Message): string {
    return m.id;
  }

  // The CSS animationend event is the single source of truth for auto-dismiss.
  onCountdownAnimationEnd(m: Message): void {
    this.ms.clear(m.id);
  }

  dismiss(id: string): void {
    this.ms.clear(id);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
