import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeInterface } from '../models/types';
import { MessageService } from '../shared/message.service';
import { RECIPE_SCHEMA_VERSION } from '../enrico-ceruti-violin/ceruti-types';
import { isLocalHost } from '../helpers/debugDump';

@Component({
  selector: 'app-recipe-toolbar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './recipe-toolbar.html',
  styleUrls: ['../sidebar.css', './recipe-toolbar.css'],
})
export class RecipeToolbarComponent {
  private messages = inject(MessageService);

  @Input() recipeName = '';
  @Input() templateOptions: Array<{ key: string; label: string }> = [];
  @Input() fileName = '';

  @Output() newFile = new EventEmitter<void>();
  @Output() saveFile = new EventEmitter<void>();
  @Output() loadFile = new EventEmitter<RecipeInterface>();
  @Output() templateSelect = new EventEmitter<string>();
  @Output() fileNameChange = new EventEmitter<string>();
  /** The recipe serializes itself — this component has no idea what it holds. */
  @Output() debugDump = new EventEmitter<void>();

  protected readonly debugDumpEnabled = isLocalHost();

  private readonly host = inject(ElementRef<HTMLElement>);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // Starting a new instrument is one action with a choice of starting point, so it is one
  // control. A recipe with no templates to offer (see hello-recipe) skips the menu and starts
  // blank on the click, which is the whole choice it has.
  protected menuOpen = false;

  protected onNewButtonClick(): void {
    if (!this.templateOptions.length) {
      this.startBlank();
      return;
    }
    this.menuOpen = !this.menuOpen;
  }

  protected startBlank(): void {
    this.menuOpen = false;
    const confirmed = confirm('Start a new instrument? Any work you have not downloaded will be lost.');
    if (confirmed) this.newFile.emit();
  }

  protected startFromTemplate(key: string): void {
    this.menuOpen = false;
    // The parent asks about discarding work — it is the one that can tell whether there is any.
    this.templateSelect.emit(key);
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

  onSaveClick(): void {
    this.saveFile.emit();
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
        const data = JSON.parse(text) as RecipeInterface;

        const fileRecipe = (data.recipeName ?? '').toLowerCase();
        const expected = (this.recipeName ?? '').toLowerCase();

        if (fileRecipe !== expected) {
          alert(`That file is for "${fileRecipe}", but this is the "${expected}" recipe.`);
          input.value = '';
          return;
        }

        if (data.version && data.version !== RECIPE_SCHEMA_VERSION) {
          this.messages.emit({
            severity: 'warn',
            title: 'Older file format',
            message: `This file uses schema version "${data.version}" (current: "${RECIPE_SCHEMA_VERSION}"). It has been loaded, but some fields may be missing or behave unexpectedly.`,
            autoDismiss: false,
          });
        }

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
