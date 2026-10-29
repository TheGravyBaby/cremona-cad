import { Component, EventEmitter, Output, inject } from '@angular/core';
import { SelectionActions, writeSvgToSystemClipboard } from '../tools/selection-actions';
import { UndoCoordinator } from '../../helpers/undoCoordinator';
import { downloadSvgFile } from '../../helpers/fileExporter';
import { downloadDxfText } from '../../helpers/dxfExporter';
import { TooltipDirective } from '../../docs/tooltips';
import { IconDirective } from '../../icons/icon.directive';
import { ToolboxStore } from '../tools/toolbox-store';
import { ClipboardImage, imageFromClipboard } from '../tools/image-asset-store';

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
  imports: [TooltipDirective, IconDirective],
  templateUrl: './edit-menu.html',
  styleUrls: ['./edit-menu.css'],
})
export class EditMenuComponent {
  protected readonly actions = inject(SelectionActions);
  // merges the open recipe's param history with the toolbox's shape history, so Undo acts on
  // whichever acted most recently — see undoCoordinator.ts
  protected readonly undo = inject(UndoCoordinator);
  protected readonly toolbox = inject(ToolboxStore);
  /** Fired after any row acts, so the menu can be closed. */
  @Output() done = new EventEmitter<void>();
  /** A pasted image, for the canvas to place as a reference image. Unbound, an image paste falls
   * back to the internal copy. */
  @Output() imagePasted = new EventEmitter<ClipboardImage>();
  // unfolds in place: a flyout would be clipped by the menu's own scroll box
  protected layersOpen = false;

  run(verb: () => unknown): void {
    verb.call(this.actions);
    this.done.emit();
  }

  cut(): void { this.run(() => this.toSystemClipboard(this.actions.cut())); }

  copy(): void { this.run(() => this.toSystemClipboard(this.actions.copy())); }

  exportSvg(): void {
    this.run(() => {
      const svg = this.actions.exportSvg();
      if (svg) downloadSvgFile('cremonacad-selection-export.svg', svg);
    });
  }

  exportDxf(): void {
    this.run(() => {
      const dxf = this.actions.exportDxf();
      if (dxf) downloadDxfText('cremonacad-selection-export.dxf', dxf);
    });
  }

  /** Reads the system clipboard where the browser allows a page to (Chrome asks once; Firefox
   * shows its own paste prompt), so SVG copied from another program lands too, and an image comes
   * in as a reference image the way Ctrl+V brings it. When it won't, or holds nothing Cremona can
   * use, the internal copy is what gets pasted. */
  async paste(): Promise<void> {
    this.done.emit();
    const data = await readSystemClipboard();
    if (data && this.actions.paste(data.getData('text/plain'))) return;
    const image = data && this.imagePasted.observed ? imageFromClipboard(data) : null;
    if (image) this.imagePasted.emit(image);
    else this.actions.paste(null);
  }

  /** A button click is a user gesture, so the page may write the clipboard directly. Failure is
   * silent: the internal copy is already made, and the shapes still paste inside Cremona. */
  private toSystemClipboard(svg: string | null): void {
    if (!svg || writeSvgToSystemClipboard(svg)) return;
    navigator.clipboard?.writeText(svg).catch(() => { });
  }
}

// the async clipboard as a paste event's clipboardData would read it. read() is the only way to
// reach an image; readText() covers a browser that has only that.
async function readSystemClipboard(): Promise<{ getData(type: string): string; files: File[] } | null> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  try {
    const texts = new Map<string, string>();
    const files: File[] = [];
    for (const item of await clipboard!.read()) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        if (type.startsWith('image/')) files.push(new File([blob], 'pasted-image', { type }));
        else if (!texts.has(type)) texts.set(type, await blob.text());
      }
    }
    return { getData: type => texts.get(type) ?? '', files };
  } catch {
    const text = await clipboard?.readText().catch(() => null);
    return text == null ? null : { getData: type => type === 'text/plain' ? text : '', files: [] };
  }
}
