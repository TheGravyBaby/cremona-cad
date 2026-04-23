import { Component, OnDestroy } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { MessageService, Message } from './message.service';
import { CommonModule, DatePipe, JsonPipe } from '@angular/common';

@Component({
  selector: 'app-message-center',
  standalone: true,
  imports: [CommonModule, DatePipe, JsonPipe],
  templateUrl: './message-center.component.html',
  styleUrls: ['./message-center.component.css']
})
export class MessageCenterComponent implements OnDestroy {
  messages: Message[] = [];
  private sub: Subscription;

  constructor(private ms: MessageService) {
    this.sub = this.ms.messages$.subscribe(msgs => {
      this.messages = msgs;
      // schedule auto-dismiss for messages with autoDismiss
      msgs.forEach(m => {
        if (typeof m.autoDismiss === 'number' && m.autoDismiss > 0) {
          timer(m.autoDismiss).subscribe(() => this.ms.clear(m.id));
        }
      });
    });
  }

  dismiss(id: string) {
    this.ms.clear(id);
  }

  clearAll() {
    this.ms.clear();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
