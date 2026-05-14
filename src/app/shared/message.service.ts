import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type Severity = 'error' | 'warn' | 'info';

export interface Message {
  id: string;
  severity: Severity;
  title?: string;
  message: string;
  timestamp: number;
  autoDismiss?: number | false;
}

type MessageInput = Partial<Omit<Message, 'id' | 'timestamp'>> | string;

function newId(): string {
  return String(Date.now()) + Math.random().toString(36).slice(2, 8);
}

function makeMessage(input: MessageInput): Message {
  if (typeof input === 'string') {
    return { id: newId(), severity: 'info', message: input, timestamp: Date.now(), autoDismiss: 4000 };
  }

  return {
    id: newId(),
    severity: input.severity ?? 'info',
    title: input.title,
    message: input.message ?? '',
    timestamp: Date.now(),
    autoDismiss: input.autoDismiss ?? 4000,
  };
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private _messages: Message[] = [];
  private messagesSubject = new BehaviorSubject<Message[]>(this._messages);

  // observable stream of current messages (most recent first)
  messages$: Observable<Message[]> = this.messagesSubject.asObservable();

  // simple emit API used across the app
  emit(input: MessageInput) {
    const m = makeMessage(input);

    // dedupe by title when present
    if (m.title && m.title.trim().length > 0) {
      this._messages = this._messages.filter(existing => existing.title !== m.title);
    }

    this._messages = [m, ...this._messages].slice(0, 100);
    this.messagesSubject.next(this._messages);
  }

  error(input: MessageInput) { this.emit(typeof input === 'string' ? { message: input, severity: 'error' } : { ...input, severity: 'error' }); }
  warn(input: MessageInput)  { this.emit(typeof input === 'string' ? { message: input, severity: 'warn'  } : { ...input, severity: 'warn'  }); }
  info(input: MessageInput)  { this.emit(typeof input === 'string' ? { message: input, severity: 'info'  } : { ...input, severity: 'info'  }); }

  // clear one or all
  clear(id?: string) {
    if (!id) this._messages = [];
    else this._messages = this._messages.filter(m => m.id !== id);
    this.messagesSubject.next(this._messages);
  }
}
