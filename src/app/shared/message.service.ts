import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type Severity = 'error' | 'warn' | 'info';

export interface Message {
  id: string;
  severity: Severity;
  title?: string;
  message: string;
  timestamp: number;
  autoDismiss?: number | false;
  // when true, kicks out any other message of the same severity instead of stacking alongside it
  exclusive?: boolean;
  // dismissed by the user, but the condition may still hold — renders as a chip, not a toast
  collapsed?: boolean;
  // times the condition has re-reported since the message first appeared
  count: number;
  // when the condition last re-reported; a chip nothing refreshes expires
  lastSeen: number;
}

type MessageInput = Partial<Omit<Message, 'id' | 'timestamp' | 'count' | 'lastSeen'>> | string;

// how long a chip survives without the condition re-reporting, and how often we check.
// CHIP_TTL is also the duration the chip's countdown ring draws.
export const CHIP_TTL = 8000;
const SWEEP_INTERVAL = 1000;

function newId(): string {
  return String(Date.now()) + Math.random().toString(36).slice(2, 8);
}

function makeMessage(input: MessageInput): Message {
  const now = Date.now();

  if (typeof input === 'string') {
    return { id: newId(), severity: 'info', message: input, timestamp: now, autoDismiss: 4000, count: 1, lastSeen: now };
  }

  return {
    id: newId(),
    severity: input.severity ?? 'info',
    title: input.title,
    message: input.message ?? '',
    timestamp: now,
    autoDismiss: input.autoDismiss ?? 4000,
    exclusive: input.exclusive,
    count: 1,
    lastSeen: now,
  };
}

/**
 * A titled error or warn describes a *condition* rather than an event — the recipe re-reports it
 * on every recompute for as long as it holds, so it can't be cleared by being read. Those messages
 * collapse to a chip when dismissed instead of vanishing, and the chip expires on its own once the
 * condition stops re-reporting. Untitled and info messages are events, and behave as they always did.
 */
function collapsible(m: Message): boolean {
  return m.severity !== 'info' && !!m.title && m.title.trim().length > 0;
}

@Injectable({ providedIn: 'root' })
export class MessageService implements OnDestroy {
  private _messages: Message[] = [];
  private messagesSubject = new BehaviorSubject<Message[]>(this._messages);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  /** Titles the user has dismissed at least once this session. Silence is not the same as
   * resolution here — the recipe only re-reports a condition when something makes it recompute, so
   * a chip that expires while the maker sits and thinks tells us nothing about whether the problem
   * is still there. A dismissed title therefore never gets to interrupt again: it comes straight
   * back as a chip. Reopening one clears the mark, since that is the maker asking to see it. */
  private dismissedTitles = new Set<string>();

  // observable stream of current messages (most recent first)
  messages$: Observable<Message[]> = this.messagesSubject.asObservable();

  // simple emit API used across the app
  emit(input: MessageInput) {
    const m = makeMessage(input);

    // Refresh in place rather than replace, so a running countdown keeps running and a collapsed
    // chip stays collapsed. Replacing is what made a toast immortal while a number was dragged:
    // the new id restarted its dismiss animation on every recompute.
    const existing = collapsible(m) ? this._messages.find(e => e.title === m.title) : undefined;
    if (existing) {
      existing.severity = m.severity;
      existing.message = m.message;
      existing.count += 1;
      existing.lastSeen = m.timestamp;
      this.publish();
      return;
    }

    // already dismissed once, so it reappears as a chip rather than reopening the toast
    if (collapsible(m) && this.dismissedTitles.has(m.title!)) m.collapsed = true;

    if (m.exclusive) {
      // kicks every other message of the same severity, regardless of title — but not the chips,
      // whose whole job is to outlive whatever is on screen
      this._messages = this._messages.filter(e => e.severity !== m.severity || e.collapsed);
    } else if (m.title && m.title.trim().length > 0) {
      // dedupe by title when present
      this._messages = this._messages.filter(e => e.title !== m.title);
    }

    this._messages = [m, ...this._messages].slice(0, 100);
    this.publish();
  }

  /** What the close button and the expiring countdown both do: collapse if the condition can
   * outlive the message, otherwise clear. */
  dismiss(id: string) {
    const m = this._messages.find(e => e.id === id);
    if (!m) return;

    if (collapsible(m) && !m.collapsed) {
      m.collapsed = true;
      // the chip's clock starts now, not at the last report — otherwise a message dismissed after
      // reading it is already past its expiry the moment it becomes a chip, and vanishes on sight
      m.lastSeen = Date.now();
      this.dismissedTitles.add(m.title!);
      this.publish();
      return;
    }

    this.clear(id);
  }

  /** Reopens a chip to read it again. Deliberate, so it stays until dismissed. */
  expand(id: string) {
    const m = this._messages.find(e => e.id === id);
    if (!m || !m.collapsed) return;

    m.collapsed = false;
    m.autoDismiss = false;
    if (m.title) this.dismissedTitles.delete(m.title);
    this.publish();
  }

  // clear one or all
  clear(id?: string) {
    if (!id) {
      this._messages = [];
      this.dismissedTitles.clear();
    } else {
      this._messages = this._messages.filter(m => m.id !== id);
    }
    this.publish();
  }

  private publish() {
    // a new array each time; the messages themselves are mutated in place
    this._messages = [...this._messages];
    this.messagesSubject.next(this._messages);
    this.syncSweep();
  }

  /** The sweep only runs while there are chips to expire. A resolved condition emits nothing at
   * all, so there is no event to hang expiry on — going quiet is the only signal there is. */
  private syncSweep() {
    const hasChips = this._messages.some(m => m.collapsed);

    if (hasChips && !this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweepChips(), SWEEP_INTERVAL);
    } else if (!hasChips && this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private sweepChips() {
    const cutoff = Date.now() - CHIP_TTL;
    const kept = this._messages.filter(m => !m.collapsed || m.lastSeen > cutoff);

    if (kept.length !== this._messages.length) {
      this._messages = kept;
      this.messagesSubject.next(this._messages);
    }
    this.syncSweep();
  }

  ngOnDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }
}
