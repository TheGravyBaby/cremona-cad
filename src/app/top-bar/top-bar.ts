import { Component, ElementRef, EventEmitter, HostListener, Output, Input, inject } from '@angular/core';
import { AboutModalComponent } from '../about-modal/about-modal';
import { UndoCoordinator } from '../helpers/undoCoordinator';
import { SelectionActions, writeSvgToSystemClipboard } from '../draft-canvas/tools/selection-actions';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [AboutModalComponent],
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

  // Root singleton — merges the open recipe's param history with the draft-canvas toolbox's
  // shape history, so these buttons act on whichever acted most recently. See undoCoordinator.ts.
  protected readonly undoCoordinator = inject(UndoCoordinator);

  // The edit verbs live up here with undo because they act on the document as a whole. Buttons
  // as well as shortcuts: a tablet has no Ctrl key. See selection-actions.ts.
  protected readonly actions = inject(SelectionActions);
  protected editOpen = false;
  private host = inject(ElementRef<HTMLElement>);

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.editOpen && !this.host.nativeElement.querySelector('.edit-menu')?.contains(event.target as Node)) this.editOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.editOpen = false; }

  cut(): void { this.toSystemClipboard(this.actions.cut()); }

  copy(): void { this.toSystemClipboard(this.actions.copy()); }

  /** Reads the system clipboard where the browser allows a page to (Chrome asks once; Firefox
   * shows its own paste prompt), so SVG copied from another program lands too. When it won't, or
   * holds something that isn't SVG, the internal copy is what gets pasted. */
  async paste(): Promise<void> {
    let text: string | null = null;
    try {
      text = await navigator.clipboard?.readText() ?? null;
    } catch {
      text = null;
    }
    if (!this.actions.paste(text)) this.actions.paste(null);
  }

  /** A button click is a user gesture, so the page may write the clipboard directly. Failure is
   * silent: the internal copy is already made, and the shapes still paste inside Cremona. */
  private toSystemClipboard(svg: string | null): void {
    if (!svg || writeSvgToSystemClipboard(svg)) return;
    navigator.clipboard?.writeText(svg).catch(() => { });
  }

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }
}
