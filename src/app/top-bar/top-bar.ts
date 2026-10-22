import { Component, ElementRef, EventEmitter, HostListener, Output, Input, inject } from '@angular/core';
import { MessageCenterComponent } from '../shared/message-center.component';
import { SettingsMenuComponent } from '../settings/settings-menu';
import { BoothTab } from '../docs/pages';
import { IconDirective } from '../icons/icon.directive';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [MessageCenterComponent, SettingsMenuComponent, IconDirective],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';
  @Output() recipeChange = new EventEmitter<string>();

  @Output() boothRequested = new EventEmitter<BoothTab>();

  // The edit verbs live up here because they act on the document as a whole. See edit-menu.ts.
  protected editOpen = false;
  protected settingsOpen = false;
  private host = inject(ElementRef<HTMLElement>);

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const outside = (sel: string) => !this.host.nativeElement.querySelector(sel)?.contains(event.target as Node);
    if (this.editOpen && outside('.edit-menu')) this.editOpen = false;
    if (this.settingsOpen && outside('.settings-menu')) this.settingsOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.editOpen = false;
    this.settingsOpen = false;
  }

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }
}
