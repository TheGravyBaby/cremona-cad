import { Component } from '@angular/core';
import { TopBarComponent } from './top-bar/top-bar';
import { BeardViolinComponent } from './beard-violin/beard-violin';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { FormsModule } from '@angular/forms';
import { DenisViolin } from "./denis-violin/denis-violin";
import { RecipeInterface } from './models/recipe';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, BeardViolinComponent, DraftCanvasComponent, FormsModule, DenisViolin],
  template: `
    <div class="app">
     <app-top-bar class="top"
      [selectedRecipe]="selectedRecipe"
      (recipeChange)="selectedRecipe = $event"
      (loadFile)="loadFile($event)">
    </app-top-bar>

      <div class="main">
        <app-draft-canvas class="canvas" 
          [draftFunctions]="draftArgs">   
        </app-draft-canvas>
        @if (selectedRecipe == "Beard Violin") 
        {
          <app-beard-violin class="sidebar"
            (draftChange)="draftArgs = $event"
            [loadFile]="loadedFileData">
          </app-beard-violin>
        }
        @if (selectedRecipe == "Denis Violin") {
          <app-denis-violin class="sidebar"
            (draftChange)="draftArgs = $event"
            [loadFile]="loadedFileData"
            >
          </app-denis-violin>
        }
      </div>
    </div>
  `,
  styleUrl: './app.css',
})

export class App {
  draftArgs: Array<(arg: any) => void> = [];
  selectedRecipe: string = 'Beard Violin';
  loadedFileData: RecipeInterface | undefined = undefined;

  loadFile(data: RecipeInterface) {
    this.loadedFileData = data;

    // Optional: if you want the app to switch to whatever the file says
    // (but only if it's a known recipe)
    const name = (data.recipeName ?? '').toLowerCase();
    if (name === 'beard') this.selectedRecipe = 'Beard Violin';
    if (name === 'denis') this.selectedRecipe = 'Denis Violin';
  }
}
