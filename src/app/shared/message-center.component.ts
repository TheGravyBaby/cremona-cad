import { Component, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MessageService, Message, CHIP_TTL } from './message.service';
import { CommonModule} from '@angular/common';

/**
 * A toast's clock runs from when the message appeared; a chip's restarts every time the condition
 * re-reports, so its key carries `lastSeen` and the ring starts over with it.
 *
 * Module-level, not a method: Angular's differ calls trackBy unbound, so a trackBy reaching for
 * `this` throws on every render and takes the whole list with it.
 */
function countdownKey(m: Message): string {
  return m.collapsed ? `${m.id}:${m.lastSeen}` : m.id;
}

@Component({
  selector: 'app-message-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-center.component.html',
  styleUrls: ['./message-center.component.css']
})
export class MessageCenterComponent implements OnDestroy {
  // toasts are the full messages; chips are conditions the user has dismissed but which are
  // still reporting themselves. See MessageService for why the two states exist.
  //
  // Signals, not plain fields: the app runs zoneless, so a message arriving over rxjs schedules no
  // change detection of its own. Plain fields left the stack repainting only when something else
  // in the app happened to tick — survivable while every message arrived on the same user event
  // that caused it, but not once the sweep and the countdown started changing this on their own.
  toasts = signal<Message[]>([]);
  chips = signal<Message[]>([]);
  private sub: Subscription;

  readonly ringRadius = 8;
  readonly ringCircumference = 2 * Math.PI * this.ringRadius;

  // Cached once per message so the [ngStyle] binding stays stable across
  // change-detection cycles (a changing style object restarts the CSS animation).
  private animationStyleCache = new Map<string, Record<string, string>>();

  constructor(private ms: MessageService) {
    this.sub = this.ms.messages$.subscribe(msgs => {
      // show only the most recent 3 as toasts; chips are small enough to all fit
      this.toasts.set(msgs.filter(m => !m.collapsed).slice(0, 3));
      this.chips.set(msgs.filter(m => m.collapsed));
      const activeKeys = new Set(msgs.map(m => countdownKey(m)));
      this.animationStyleCache.forEach((_, key) => {
        if (!activeKeys.has(key)) this.animationStyleCache.delete(key);
      });
    });
  }

  hasCountdown(m: Message): boolean {
    // a chip is always on the clock — its countdown is the expiry, not a dismiss timer
    if (m.collapsed) return true;
    return typeof m.autoDismiss === 'number' && m.autoDismiss > 0;
  }

  countdownStyle(m: Message): Record<string, string> {
    if (!this.hasCountdown(m)) return {};

    const key = countdownKey(m);
    if (this.animationStyleCache.has(key)) {
      return this.animationStyleCache.get(key)!;
    }

    const duration = m.collapsed ? CHIP_TTL : m.autoDismiss as number;
    const since = m.collapsed ? m.lastSeen : m.timestamp;
    // never start a ring already past its end — a negative delay of the full duration lands the
    // animation in its finished state, and animationend fires before the message is ever seen
    const elapsed = Math.max(0, Math.min(Date.now() - since, duration - 1));
    const style = {
      'animation-duration': `${duration}ms`,
      'animation-delay': `-${elapsed}ms`,
    };
    this.animationStyleCache.set(key, style);
    return style;
  }

  trackByMessageId(_: number, m: Message): string {
    return m.id;
  }

  // Chips track by their clock as well, so a re-report replaces the node and restarts the ring.
  trackByChip(_: number, m: Message): string {
    return countdownKey(m);
  }

  /** The CSS animationend event is the single source of truth for both clocks: a toast running out
   * collapses it, a chip running out clears it. MessageService's sweep is the backstop for a chip
   * whose animation never ran — a hidden tab, say. */
  onCountdownEnd(m: Message): void {
    if (m.collapsed) this.ms.clear(m.id);
    else this.ms.dismiss(m.id);
  }

  dismiss(id: string): void {
    this.ms.dismiss(id);
  }

  expand(id: string): void {
    this.ms.expand(id);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
