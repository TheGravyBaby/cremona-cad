import { Component, EventEmitter, Output, Input, ViewChild, ElementRef } from '@angular/core';
import { RecipeInterface } from '../models/recipe';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';

  @Output() recipeChange = new EventEmitter<string>();
  @Output() loadFile = new EventEmitter<RecipeInterface>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
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
