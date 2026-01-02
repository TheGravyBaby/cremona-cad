import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DraftState } from '../models/draftState';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sidebar.html',
    styleUrls: ['./sidebar.css'],
})

export class SidebarComponent {
  @Input() draft!: DraftState;
  @Output() draftChange = new EventEmitter<DraftState>();

  emit(): void {
    this.draftChange.emit({ ...this.draft });
  }
}
