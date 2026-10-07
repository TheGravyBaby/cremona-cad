import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeInterface } from '../models/types';
import { MessageService } from '../shared/message.service';
import { RECIPE_SCHEMA_VERSION } from '../enrico-ceruti-violin/ceruti-types';
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
  private messages = inject(MessageService);

  @Input() recipeName = '';
  // a recipe with nothing to start from (see hello-recipe) leaves the templates row off
  @Input() hasTemplates = false;
  @Input() fileName = '';
  // a recipe without an export panel (see hello-recipe) leaves this off
  @Input() showExport = false;
  @Input() exportEnabled = false;
  @Input() exportActive = false;

  @Output() newFile = new EventEmitter<void>();
  @Output() saveFile = new EventEmitter<void>();
  @Output() loadFile = new EventEmitter<RecipeInterface>();
  @Output() openTemplates = new EventEmitter<void>();
  @Output() fileNameChange = new EventEmitter<string>();
  @Output() openExport = new EventEmitter<void>();
  /** The recipe serializes itself — this component has no idea what it holds. */
  @Output() debugDump = new EventEmitter<void>();

  protected readonly debugDumpEnabled = isLocalHost();

  private readonly host = inject(ElementRef<HTMLElement>);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  protected menuOpen = false;

  protected startBlank(): void {
    this.menuOpen = false;
    const confirmed = confirm('Start a new instrument? Any work you have not downloaded will be lost.');
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
