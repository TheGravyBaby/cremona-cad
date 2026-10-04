import { Component, ElementRef, EventEmitter, HostListener, Output, Input, inject } from '@angular/core';
import { AboutModalComponent } from '../about-modal/about-modal';
import { MessageCenterComponent } from '../shared/message-center.component';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [AboutModalComponent, MessageCenterComponent],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';
  @Output() recipeChange = new EventEmitter<string>();

  /** Owned by App, which persists it and puts the day-mode class on the document. Up here rather
   * than on the canvas's bottom bar because it dresses the whole app, not the drawing. */
  @Input() nightMode = true;
  @Output() nightModeChange = new EventEmitter<boolean>();

  @Input() barPinned = true;
  @Output() barPinnedChange = new EventEmitter<boolean>();

  // The edit verbs live up here because they act on the document as a whole. See edit-menu.ts.
  protected editOpen = false;
  private host = inject(ElementRef<HTMLElement>);

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.editOpen && !this.host.nativeElement.querySelector('.edit-menu')?.contains(event.target as Node)) this.editOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.editOpen = false; }

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }
}
