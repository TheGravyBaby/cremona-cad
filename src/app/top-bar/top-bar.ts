import { Component, EventEmitter, Output, Input, ViewChild, ElementRef } from '@angular/core';
import { RecipeInterface } from '../models/types';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';
  @Input() nightMode = true;
  @Output() recipeChange = new EventEmitter<string>();
  @Output() newFile = new EventEmitter<void>();
  @Output() loadFile = new EventEmitter<RecipeInterface>();
  @Output() saveFile = new EventEmitter<void>();
  @Output() nightModeChange = new EventEmitter<boolean>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  onNewClick() {
    this.newFile.emit();
  }

  onSaveClick() {
    this.saveFile.emit();
  }

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }

  onNightModeToggle() {
    this.nightModeChange.emit(!this.nightMode);
  }

  triggerFilePick() {
    this.fileInput.nativeElement.click();
  }

  onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const data = JSON.parse(text) as RecipeInterface;

        const fileRecipe = (data.recipeName ?? '').toLowerCase();
        const selected = (this.selectedRecipe ?? '').toLowerCase();

        if (fileRecipe !== selected) {
          alert(`That file is for "${fileRecipe}", but you currently selected "${selected}".`);
          input.value = ''; // allow re-picking same file
          return;
        }

        this.loadFile.emit(data);
      } catch (e) {
        console.error('Failed to load/parse recipe file:', e);
        alert('Could not read that file. Is it valid JSON?');
      } finally {
        input.value = ''; // allow re-picking same file
      }
    };

    reader.readAsText(file);
  }
}
