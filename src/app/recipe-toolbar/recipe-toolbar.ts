import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isLocalHost } from '../helpers/debugDump';
import { TooltipDirective } from '../docs/tooltips';

@Component({
  selector: 'app-recipe-toolbar',
  standalone: true,
  imports: [TooltipDirective, FormsModule],
  templateUrl: './recipe-toolbar.html',
  styleUrls: ['../sidebar.css', './recipe-toolbar.css'],
})
export class RecipeToolbarComponent {
  // a recipe with nothing to start from (see hello-recipe) leaves the templates row off
  @Input() hasTemplates = false;
  @Input() fileName = '';
  // a recipe without an export panel (see hello-recipe) leaves this off
  @Input() showExport = false;
  @Input() exportEnabled = false;
  @Input() exportActive = false;

  @Output() newFile = new EventEmitter<void>();
  @Output() saveFile = new EventEmitter<void>();
  // the parsed JSON, unread: the recipe's normalize decides what it is
  @Output() loadFile = new EventEmitter<unknown>();
  @Output() openTemplates = new EventEmitter<void>();
  @Output() fileNameChange = new EventEmitter<string>();
  @Output() openExport = new EventEmitter<void>();
  /** The recipe serializes itself — this component has no idea what it holds. */
  @Output() debugDump = new EventEmitter<void>();

  protected readonly debugDumpEnabled = isLocalHost();
  protected readonly modKey = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  private readonly host = inject(ElementRef<HTMLElement>);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  protected menuOpen = false;

  protected startBlank(): void {
    this.menuOpen = false;
    const confirmed = confirm('Start a new instrument? Any work you have not saved will be lost.');
    if (confirmed) this.newFile.emit();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(e: Event): void {
    if (!this.menuOpen) return;
    if (!this.host.nativeElement.contains(e.target as Node)) this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.menuOpen = false;
  }

  // on the document, not the host: the canvas usually has focus when a save is wanted
  @HostListener('document:keydown', ['$event'])
  protected onFileHotkey(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key !== 's' && key !== 'o') return;
    e.preventDefault();
    if (e.repeat) return;
    this.menuOpen = false;
    if (key === 's') this.saveFile.emit();
    else this.triggerFilePick();
  }

  triggerFilePick(): void {
    this.fileInput.nativeElement.click();
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const data: unknown = JSON.parse(text);
        this.loadFile.emit(data);
      } catch (e) {
        console.error('Failed to load/parse recipe file:', e);
        alert('Could not read that file. Is it valid JSON?');
      } finally {
        input.value = '';
      }
    };

    reader.readAsText(file);
  }
}
