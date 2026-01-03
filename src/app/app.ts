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
        (recipeChange)="selectedRecipe = $event"
        (loadFile)="loadFile($event)"></app-top-bar>
      <div class="main">
        <app-draft-canvas class="canvas" 
          [draftFunctions]="draftArgs">   
        </app-draft-canvas>
        @if (selectedRecipe == "Beard") 
        {
          <app-beard-violin class="sidebar"
            (draftChange)="draftArgs = $event"
            [loadFile]="loadedFileData">
          </app-beard-violin>
        }
        @if (selectedRecipe == "Denis") {
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
  draftArgs: Array<(arg: any) => void> = []
  selectedRecipe: string = 'Beard'
  loadedFileData: RecipeInterface | undefined = undefined
  loadFile(data: RecipeInterface) {
    if (data.recipeName == 'beard'){
      this.selectedRecipe = 'beard'
    }  
  }
}