import { Component, EventEmitter, Output, inject } from '@angular/core';
import { SelectionActions, writeSvgToSystemClipboard } from '../tools/selection-actions';
import { UndoCoordinator } from '../../helpers/undoCoordinator';

/**
 * The document-wide edit verbs — undo and redo, clipboard, file, duplicate, group, delete — as a
 * menu, and the only place they have buttons: a tablet has no Ctrl key, but a row of them on the
 * top bar was more chrome than a drawing wants. Shown by a right-click on the canvas in Select
 * mode (with a tool out, right-click cancels instead); whoever shows it places it and
 * listens for `done` to take it down. Holds the system-clipboard and file plumbing because only a
 * button's own gesture may touch either; the verbs themselves are SelectionActions'.
 */
@Component({
  selector: 'app-edit-menu',
  standalone: true,
  templateUrl: './edit-menu.html',
  styleUrls: ['./edit-menu.css'],
})
export class EditMenuComponent {
  protected readonly actions = inject(SelectionActions);
  // merges the open recipe's param history with the toolbox's shape history, so Undo acts on
  // whichever acted most recently — see undoCoordinator.ts
  protected readonly undo = inject(UndoCoordinator);
  /** Fired after any row acts, so the menu can be closed. */
  @Output() done = new EventEmitter<void>();

  run(verb: () => unknown): void {
    verb.call(this.actions);
    this.done.emit();
  }

  cut(): void { this.run(() => this.toSystemClipboard(this.actions.cut())); }

  copy(): void { this.run(() => this.toSystemClipboard(this.actions.copy())); }

  /** Reads the system clipboard where the browser allows a page to (Chrome asks once; Firefox
   * shows its own paste prompt), so SVG copied from another program lands too. When it won't, or
   * holds something that isn't SVG, the internal copy is what gets pasted. */
  async paste(): Promise<void> {
    this.done.emit();
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
}
