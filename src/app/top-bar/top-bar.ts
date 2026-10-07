import { Component, ElementRef, EventEmitter, HostListener, Output, Input, inject } from '@angular/core';
import { MessageCenterComponent } from '../shared/message-center.component';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [MessageCenterComponent],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';
  @Output() recipeChange = new EventEmitter<string>();

  @Output() aboutRequested = new EventEmitter<'about' | 'tutorial'>();

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
