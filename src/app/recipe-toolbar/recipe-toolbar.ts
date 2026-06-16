import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeInterface } from '../models/types';
import { MessageService } from '../shared/message.service';
import { RECIPE_SCHEMA_VERSION } from '../enrico-ceruti-violin/ceruti-types';

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
  @Input() activeTemplateKey = '';

  @Output() newFile = new EventEmitter<void>();
  @Output() saveFile = new EventEmitter<void>();
  @Output() loadFile = new EventEmitter<RecipeInterface>();
  @Output() templateSelect = new EventEmitter<string>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  onNewClick(): void {
    const confirmed = confirm('Start a new file? Any unsaved work will be lost.');
    if (confirmed) {
      this.newFile.emit();
    }
  }

  onSaveClick(): void {
    this.saveFile.emit();
  }

  onTemplateSelect(key: string): void {
    if (!key) return;
    this.templateSelect.emit(key);
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
          this.messages.warn({
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
